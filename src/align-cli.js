import { readFile, writeFile, appendFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { elevenLabsKey } from './environment.js';
import { alignNarration, captionCues, toSrt, approximateWords } from './captions.js';
import { validateBrief, fingerprint } from './workflow.js';

async function main() {
  const [input, audioDir, allow] = process.argv.slice(2);
  if (!input || !audioDir) throw new Error('Usage: node src/align-cli.js <brief.json> <audio-directory> [--allow-paid]');
  const dir = resolve(audioDir);
  const brief = validateBrief(JSON.parse(await readFile(resolve(input), 'utf8')));
  const timing = JSON.parse(await readFile(join(dir, 'timing.json'), 'utf8'));
  if (timing.brief_hash !== fingerprint(brief)) throw new Error('Audio does not match this brief.');
  const audio = await readFile(join(dir, 'narration.wav'));
  const audioHash = createHash('sha256').update(audio).digest('hex');
  const cache = join(dir, 'alignment.json');
  let alignment;
  try { await access(cache); alignment = JSON.parse(await readFile(cache, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (alignment && (alignment.audio_hash !== audioHash || alignment.brief_hash !== timing.brief_hash)) throw new Error('Cached alignment does not match this audio/script version.');
  const approximate = allow === '--approximate';
  if (approximate) {
    alignment = { words: approximateWords(brief.scenes, timing.scenes.map(s => s.duration_seconds)) };
  } else if (!alignment) {
    if (allow !== '--allow-paid') throw new Error('Alignment uploads narration and transcript to ElevenLabs. Pass --allow-paid for this invocation.');
    const event = { operation: 'forced_alignment', timestamp: new Date().toISOString(), billed_cost_inr: null };
    await appendFile(join(dir, 'usage.jsonl'), JSON.stringify({ ...event, status: 'request_started' }) + '\n');
    try {
      alignment = { ...await alignNarration(audio, brief.scenes.map(s => s.text).join(' '), { key: elevenLabsKey() }), audio_hash: audioHash, brief_hash: timing.brief_hash };
      await writeFile(cache, JSON.stringify(alignment, null, 2), { flag: 'wx' });
      await appendFile(join(dir, 'usage.jsonl'), JSON.stringify({ ...event, status: 'completed' }) + '\n');
    } catch (error) {
      await appendFile(join(dir, 'usage.jsonl'), JSON.stringify({ ...event, status: 'failed_or_unknown_billing' }) + '\n');
      throw error;
    }
  }
  const cues = captionCues(alignment.words, brief.scenes, timing.scenes.map(s => s.duration_seconds));
  await writeFile(join(dir, 'captions.json'), JSON.stringify({ brief_hash: timing.brief_hash, audio_hash: audioHash, method: approximate ? 'approximate_scene_anchored' : 'elevenlabs_forced_alignment', cues }, null, 2));
  await writeFile(join(dir, 'captions.ta.srt'), toSrt(cues), 'utf8');
  console.log(`Aligned ${alignment.words.length} words into ${cues.length} Tamil caption cues.`);
}
main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
