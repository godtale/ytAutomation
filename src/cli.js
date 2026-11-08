import { readFile, writeFile, mkdir, access, appendFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateBrief, fingerprint, scriptMarkdown, reviewHtml, ssml, assertApproved, VOICES } from './workflow.js';
import { synthesize, wavDuration, joinWav } from './speech.js';
import { synthesizeElevenLabs, listElevenLabsVoices } from './elevenlabs.js';
import { elevenLabsKey } from './environment.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const saveJson = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
const exists = async path => { try { await access(path); return true; } catch { return false; } };

async function main() {
  const [command, input, ...args] = process.argv.slice(2);
  const speechKey = elevenLabsKey();
  const channel = await json(join(root, 'config', 'channel.json'));
  if (command === 'voices') {
    const catalog = await listElevenLabsVoices({ key: speechKey });
    if (input) catalog.voices = catalog.voices.filter(v => v.labels?.language === input || v.verified_languages.includes(input));
    console.log(JSON.stringify(catalog, null, 2));
    return;
  }
  if (command === 'doctor') {
    let ffmpegReady = spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status === 0;
    if (!ffmpegReady) {
      try { ffmpegReady = spawnSync((await import('ffmpeg-static')).default, ['-version'], { windowsHide: true }).status === 0; } catch {}
    }
    console.log(JSON.stringify({ node: process.version, ffmpeg: ffmpegReady,
      narrationProvider: channel.narration?.provider ?? 'elevenlabs',
      elevenLabsKeyConfigured: Boolean(speechKey),
      elevenLabsVoiceConfigured: Boolean(process.env.ELEVENLABS_VOICE_ID),
      azureKeyConfigured: Boolean(process.env.AZURE_SPEECH_KEY), azureRegionConfigured: Boolean(process.env.AZURE_SPEECH_REGION) }, null, 2));
    return;
  }
  if (!['prepare', 'approve', 'narrate'].includes(command) || !input) {
    throw new Error('Usage: node src/cli.js prepare <brief.json> | approve <brief.json> --reviewer <name> | narrate <brief.json> --allow-paid [--sample] [--voice <voice>] | voices [language] | doctor');
  }
  const brief = validateBrief(await json(resolve(input)));
  const hash = fingerprint(brief);
  // Each script version has its own outputs; edits cannot silently overwrite approved media.
  const out = join(root, 'output', brief.id, hash);
  const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  await mkdir(out, { recursive: true });
  if (command === 'prepare') {
    await writeFile(join(out, 'script.md'), scriptMarkdown(brief), 'utf8');
    await writeFile(join(out, 'review.html'), reviewHtml(brief), 'utf8');
    await writeFile(join(out, 'narration.txt'), brief.scenes.map(s => s.text).join('\n\n'), 'utf8');
    await writeFile(join(out, 'sample.ssml'), ssml(brief.pronunciation_sample), 'utf8');
    for (const scene of brief.scenes) await writeFile(join(out, `${scene.id}.ssml`), ssml(scene.text), 'utf8');
    await saveJson(join(out, 'brief.json'), brief);
    await saveJson(join(out, 'scene-plan.json'), {
      brief_hash: hash, target_seconds: brief.target_seconds, actual_seconds: null,
      timing_status: 'awaiting_narration',
      scenes: brief.scenes.map(s => ({ id: s.id, text: s.text, claim_ids: s.claim_ids, visual: s.visual, audio: `${s.id}.wav`, duration_seconds: null, asset_status: 'not_created' }))
    });
    console.log(`Prepared draft: ${join(out, 'review.html')}\nEdit ${resolve(input)} and run prepare again to revise.`);
    return;
  }
  if (!await exists(join(out, 'brief.json'))) throw new Error('Run prepare for this version first.');
  if (command === 'approve') {
    const reviewer = option('--reviewer');
    if (!reviewer?.trim() || reviewer.startsWith('--')) throw new Error('Specify --reviewer <name> after reviewing the script and sources.');
    await saveJson(join(out, 'approval.json'), { brief_hash: hash, reviewer, approved_at: new Date().toISOString() });
    console.log('Script approval recorded for this content version. Render approval is a separate future step.');
    return;
  }
  const sample = args.includes('--sample');
  const provider = option('--provider') ?? channel.narration?.provider ?? 'elevenlabs';
  if (!['elevenlabs', 'azure'].includes(provider)) throw new Error('Choose --provider elevenlabs or azure.');
  const model = provider === 'elevenlabs' ? (option('--model') ?? channel.narration?.model ?? 'eleven_v3') : 'azure-neural';
  const voice = option('--voice') ?? (provider === 'elevenlabs'
    ? (brief.narration?.voice_id ?? channel.narration?.pilot_voices?.[brief.id]?.voice_id ?? process.env.ELEVENLABS_VOICE_ID)
    : VOICES[0]);
  if (provider === 'elevenlabs') {
    if (!speechKey) throw new Error('Elevenlabs_Api_Key is not available in the process environment.');
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(voice ?? '')) throw new Error('Set the ELEVENLABS_VOICE_ID environment variable or pass --voice <voice_id>.');
    if (!['eleven_v3', 'eleven_flash_v2_5'].includes(model)) throw new Error('Choose eleven_v3 or eleven_flash_v2_5.');
  } else if (!VOICES.includes(voice)) throw new Error(`Choose a voice: ${VOICES.join(', ')}`);
  if (!args.includes('--allow-paid')) throw new Error(`Narration sends text to ${provider} and may use subscription credits. Use --allow-paid to enable this invocation.`);
  if (!sample) {
    const approvalPath = join(out, 'approval.json');
    assertApproved(brief, await exists(approvalPath) ? await json(approvalPath) : null);
  }
  const voiceDir = join(out, provider, model, voice);
  await mkdir(voiceDir, { recursive: true });
  const segments = sample ? [{ id: 'sample', text: brief.pronunciation_sample }] : brief.scenes;
  const timings = [];
  // Exclusive lock prevents parallel runs from duplicating paid requests for this voice/version.
  const lockPath = join(voiceDir, '.narration.lock');
  const { open, unlink } = await import('node:fs/promises');
  const lock = await open(lockPath, 'wx');
  try {
    for (const segment of segments) {
      const audioPath = join(voiceDir, `${segment.id}.wav`);
      if (!await exists(audioPath)) {
        const event = { segment: segment.id, provider, model, voice, characters: [...segment.text].length, timestamp: new Date().toISOString(), billed_cost_inr: null };
        await appendFile(join(voiceDir, 'usage.jsonl'), JSON.stringify({ ...event, status: 'request_started' }) + '\n');
        try {
          const audio = provider === 'elevenlabs'
            ? await synthesizeElevenLabs(segment.text, { key: speechKey, voice, model })
            : await synthesize(segment.text, { key: process.env.AZURE_SPEECH_KEY, region: process.env.AZURE_SPEECH_REGION, voice });
          wavDuration(audio); // Validate before caching.
          await writeFile(audioPath, audio, { flag: 'wx' });
          await appendFile(join(voiceDir, 'usage.jsonl'), JSON.stringify({ ...event, status: 'completed' }) + '\n');
        } catch (error) {
          await appendFile(join(voiceDir, 'usage.jsonl'), JSON.stringify({ ...event, status: 'failed_or_unknown_billing' }) + '\n');
          throw error;
        }
      }
      timings.push({ id: segment.id, audio: audioPath, duration_seconds: wavDuration(await readFile(audioPath)) });
    }
    const seconds = timings.reduce((sum, s) => sum + s.duration_seconds, 0);
    if (!sample) {
      const clips = await Promise.all(timings.map(s => readFile(s.audio)));
      await writeFile(join(voiceDir, 'narration.wav'), joinWav(clips));
    }
    await saveJson(join(voiceDir, sample ? 'sample-timing.json' : 'timing.json'), {
      brief_hash: hash, provider, model, voice, total_seconds: seconds,
      within_short_range: sample ? null : seconds >= 30 && seconds <= 60,
      scenes: timings, note: 'Measured WAV durations. Caption alignment and video rendering are not implemented.'
    });
    console.log(`Audio ready: ${voiceDir}\nMeasured duration: ${seconds.toFixed(2)} seconds. Review pronunciation before proceeding.`);
  } finally { await lock.close(); await unlink(lockPath); }
}

main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
