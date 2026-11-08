import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { fingerprint } from './workflow.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function run(script, args) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [join(root, 'src', script), ...args], { cwd: root, windowsHide: true, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', code => code === 0 ? done() : reject(new Error(`${script} exited with code ${code}`)));
  });
}
async function main() {
  const briefPath = join(root, 'content', 'pilot.json');
  const brief = JSON.parse(await readFile(briefPath, 'utf8'));
  const channel = JSON.parse(await readFile(join(root, 'config', 'channel.json'), 'utf8'));
  const { provider, model, pilot_voices: voices } = channel.narration;
  const voice = voices[brief.id]?.voice_id;
  if (provider !== 'elevenlabs' || !/^[a-zA-Z0-9_-]{1,128}$/.test(voice ?? '') || !/^[a-zA-Z0-9_-]+$/.test(model)) throw new Error('Configure the pilot ElevenLabs voice before rendering.');
  const dir = join(root, 'output', brief.id, fingerprint(brief), provider, model, voice);
  // Uses cached narration only. No paid network calls in this convenience command.
  await run('align-cli.js', [briefPath, dir, '--approximate']);
  await run('render-cli.js', [briefPath, dir]);
  const deliver = join(root, 'output', 'pilot-inscriptions-rajan');
  await mkdir(deliver, { recursive: true });
  for (const file of ['pilot-inscriptions-rajan.mp4', 'poster.png', 'sources-and-notes.md', 'render-manifest.json']) await copyFile(join(dir, 'render', file), join(deliver, file));
  await copyFile(join(dir, 'captions.ta.srt'), join(deliver, 'captions.ta.srt'));
  console.log(`Pilot package: ${deliver}`);
}
main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
