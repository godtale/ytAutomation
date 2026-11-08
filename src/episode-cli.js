import { readFile, writeFile, mkdir, access, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { validateBrief, fingerprint } from './workflow.js';
import { TEMPLATES, audioDirectory } from './episode.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = async path => JSON.parse(await readFile(path, 'utf8'));
const exists = async path => { try { await access(path); return true; } catch { return false; } };
async function run(script, args) {
  await new Promise((done, reject) => {
    const p = spawn(process.execPath, [join(root, 'src', script), ...args], { cwd: root, stdio: 'inherit', windowsHide: true });
    p.on('error', reject); p.on('close', code => code === 0 ? done() : reject(new Error(`${script} exited with code ${code}`)));
  });
}
async function main() {
  const [command, input, ...args] = process.argv.slice(2);
  const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  if (command === 'templates') { console.log(TEMPLATES.join('\n')); return; }
  if (command === 'new') {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input ?? '')) throw new Error('Supply a lowercase episode slug.');
    const format = option('--format') ?? 'short';
    if (!['short', 'long'].includes(format)) throw new Error('Format must be short or long.');
    const brief = { schema_version: 1, id: input, title: option('--title') ?? 'தலைப்பை இங்கே எழுதவும்', language: 'ta-IN', format,
      target_seconds: format === 'short' ? 45 : 600, editorial_status: 'draft', sources: [], claims: [], glossary: [],
      pronunciation_sample: '', scenes: ['title', 'evidence', 'timeline', 'conclusion'].map((template, i) => ({
        id: `s${String(i + 1).padStart(2, '0')}`, role: template, text: '', claim_ids: [], visual: 'Original explanatory diagram',
        layout: { template, title: 'காட்சித் தலைப்பு', subtitle: '', items: ['விளக்கக் குறிப்பு'] }
      })) };
    const dir = join(root, 'episodes'); await mkdir(dir, { recursive: true });
    const path = join(dir, `${input}.json`);
    await writeFile(path, JSON.stringify(brief, null, 2) + '\n', { flag: 'wx' });
    console.log(`Created ${path}\nFill sources, claims, Tamil narration, pronunciation sample, and scene layouts before check/prepare. No historical content is invented by this command.`);
    return;
  }
  if (!input || !['check', 'prepare', 'approve', 'narrate', 'render', 'status'].includes(command)) throw new Error('Usage: npm run episode -- new <slug> [--format short|long] | templates | check|prepare|approve|narrate|render|status <episode.json> [options]');
  const path = resolve(input);
  const brief = validateBrief(await load(path));
  if (command === 'check') { console.log(`Valid ${brief.format} episode: ${brief.id}, ${brief.scenes.length} scenes.`); return; }
  if (['prepare', 'approve', 'narrate'].includes(command)) { await run('cli.js', [command, path, ...args]); return; }
  const channel = await load(join(root, 'config', 'channel.json'));
  const dir = audioDirectory(root, brief, channel, option('--voice'));
  if (command === 'status') {
    const approvalPath = join(root, 'output', brief.id, fingerprint(brief), 'approval.json');
    const approval = await exists(approvalPath) ? await load(approvalPath) : null;
    console.log(JSON.stringify({ id: brief.id, format: brief.format, script_approved: approval?.brief_hash === fingerprint(brief),
      narration_ready: await exists(join(dir, 'narration.wav')), captions_ready: await exists(join(dir, 'captions.json')), audio_directory: dir }, null, 2)); return;
  }
  if (args.some(arg => !['--voice', option('--voice'), '--captions', option('--captions')].includes(arg))) throw new Error('Render supports --voice <id> and --captions approximate|aligned only.');
  const method = option('--captions') ?? 'approximate';
  if (method === 'approximate') await run('align-cli.js', [path, dir, '--approximate']);
  else if (method !== 'aligned' || (await load(join(dir, 'captions.json'))).method !== 'elevenlabs_forced_alignment') throw new Error('Create forced-aligned captions first, or use --captions approximate.');
  await run('render-cli.js', [path, dir]);
  const deliver = join(root, 'output', 'episodes', brief.id, fingerprint(brief));
  await mkdir(deliver, { recursive: true });
  const video = brief.id === 'inscriptions-01' ? 'pilot-inscriptions-rajan.mp4' : `${brief.id}.mp4`;
  for (const file of [video, 'poster.png', 'sources-and-notes.md', 'render-manifest.json']) await copyFile(join(dir, 'render', file), join(deliver, file));
  await copyFile(join(dir, 'captions.ta.srt'), join(deliver, 'captions.ta.srt'));
  console.log(`Episode package: ${deliver}`);
}
main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
