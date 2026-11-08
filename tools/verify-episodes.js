// Offline render checks: reuse the existing pilot audio; never call a speech API.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { validateBrief, fingerprint } from '../src/workflow.js';
import { audioDirectory } from '../src/episode.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pilot = JSON.parse(await readFile(join(root, 'content/pilot.json'), 'utf8'));
const channel = JSON.parse(await readFile(join(root, 'config/channel.json'), 'utf8'));
const source = audioDirectory(root, pilot, channel);
const originalTiming = JSON.parse(await readFile(join(source, 'timing.json'), 'utf8'));
const layouts = [
  { template: 'title', title: 'கல்வெட்டுகள் சொல்லும் வரலாறு', items: ['கல்லில் பதிந்த பதிவுகள்'] },
  { template: 'evidence', title: 'பதிவுகளின் வடிவங்கள்', items: ['கல்வெட்டு', 'செப்பேடு'] },
  { template: 'event', title: 'பதிவுகள் தரும் தகவல்கள்', items: ['கொடை', 'ஆட்சி', 'நிர்வாகம்'] },
  { template: 'comparison', title: 'ஒப்பிட்டு அறிதல்', items: ['ஒரு பதிவு', 'தொடர்புடைய பதிவுகள்'] },
  { template: 'conclusion', title: 'சான்றுகள் வழியே வரலாறு', items: ['ஆய்வு', 'புரிதல்'] }
];
async function run(script, args) {
  await new Promise((done, reject) => {
    const child = spawn(process.execPath, [join(root, 'src', script), ...args], { cwd: root, stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('close', code => code === 0 ? done() : reject(new Error(`${script} failed`)));
  });
}
await mkdir(join(root, 'examples'), { recursive: true });
const example = { ...structuredClone(pilot), id: 'inscriptions-example', series: 'தமிழ் வரலாறு', source_credit: 'தமிழ்நாடு தொல்லியல் துறை · ASI',
  narration: { voice_id: 'aTz8YI6ufQ8Yn0LP3EVa' } };
example.scenes.forEach((s, i) => { s.layout = layouts[i]; });
validateBrief(example);
await writeFile(join(root, 'examples/inscriptions.json'), JSON.stringify(example, null, 2) + '\n');
for (const format of ['short', 'long']) {
  const brief = structuredClone(example);
  brief.id = `template-check-${format}`;
  brief.format = format;
  brief.target_seconds = format === 'short' ? 45 : 600;
  if (format === 'long') brief.scenes[3].layout.template = 'timeline';
  validateBrief(brief);
  const dir = audioDirectory(root, brief, channel);
  await mkdir(dir, { recursive: true });
  for (const file of ['narration.wav', ...pilot.scenes.map(s => `${s.id}.wav`)]) await copyFile(join(source, file), join(dir, file));
  const timing = { ...originalTiming, brief_hash: fingerprint(brief), scenes: originalTiming.scenes.map(s => ({ ...s, audio: join(dir, `${s.id}.wav`) })) };
  await writeFile(join(dir, 'timing.json'), JSON.stringify(timing, null, 2));
  const briefPath = join(dir, 'render-check.json');
  await writeFile(briefPath, JSON.stringify(brief, null, 2));
  await run('align-cli.js', [briefPath, dir, '--approximate']);
  await run('render-cli.js', [briefPath, dir]);
  console.log(`Verified ${format} template render. This is a ${timing.total_seconds}s layout check, not a newly narrated ten-minute episode.`);
}
