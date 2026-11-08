import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import ffmpeg from 'ffmpeg-static';
import { chromium } from 'playwright-core';
import { validateBrief, fingerprint } from './workflow.js';
import { wavDuration } from './speech.js';
import { episodeFrameHtml } from './episode-visuals.js';
import { dimensions } from './episode.js';

async function run(args) {
  return new Promise((done, reject) => {
    const child = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-8000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? done(stderr) : reject(new Error(`FFmpeg failed (${code}): ${stderr}`)));
  });
}

async function main() {
  const [input, audioDir] = process.argv.slice(2);
  if (!input || !audioDir) throw new Error('Usage: node src/render-cli.js <brief.json> <audio-directory>');
  const brief = validateBrief(JSON.parse(await readFile(resolve(input), 'utf8')));
  const { width, height } = dimensions(brief.format);
  const dir = resolve(audioDir);
  const audioPath = join(dir, 'narration.wav');
  const audio = await readFile(audioPath);
  const total = wavDuration(audio);
  const audioHash = createHash('sha256').update(audio).digest('hex');
  const timing = JSON.parse(await readFile(join(dir, 'timing.json'), 'utf8'));
  const captions = JSON.parse(await readFile(join(dir, 'captions.json'), 'utf8'));
  if (timing.brief_hash !== fingerprint(brief) || captions.brief_hash !== timing.brief_hash || captions.audio_hash !== audioHash) throw new Error('Audio, captions, and script must match.');
  if (Math.abs(timing.total_seconds - total) > 0.02) throw new Error('Audio timing mismatch.');
  const out = join(dir, 'render');
  await mkdir(out, { recursive: true });
  const bounds = [0];
  for (const scene of timing.scenes) bounds.push(bounds.at(-1) + scene.duration_seconds);
  const times = [...new Set([0, total, ...bounds, ...captions.cues.flatMap(c => [c.start, c.end])].map(t => Number(t.toFixed(6))))].sort((a, b) => a - b);
  const intervals = times.slice(0, -1).map((start, i) => ({ start, end: times[i + 1] })).filter(t => t.end - t.start > 0.00001);
  const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
  let executablePath;
  for (const path of candidates) { try { await access(path); executablePath = path; break; } catch {} }
  if (!executablePath) throw new Error('Install Chrome or Edge, or set CHROME_PATH.');
  const browserEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(systemroot|windir|temp|tmp|path|localappdata|userprofile|programfiles|programfiles\(x86\))$/i.test(name)));
  const browser = await chromium.launch({ executablePath, headless: true, env: browserEnv });
  const checks = [];
  const frames = [];
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.route('**/*', route => route.abort());
    for (let i = 0; i < intervals.length; i++) {
      const interval = intervals[i];
      const time = (interval.start + interval.end) / 2;
      const scene = Math.min(brief.scenes.length - 1, bounds.findIndex((end, index) => index > 0 && time < end) - 1);
      const cue = captions.cues.find(c => time >= c.start && time < c.end);
      await page.setContent(episodeFrameHtml(brief, scene, cue?.text ?? '', time / total));
      await page.evaluate(() => document.fonts.ready);
      const check = await page.evaluate((wide) => {
        const p = document.querySelector('.caption p');
        const box = document.querySelector('.caption');
        const header = document.querySelector('h1');
        while ((p.scrollHeight > box.clientHeight - 40 || p.scrollWidth > p.clientWidth + 1) && parseFloat(getComputedStyle(p).fontSize) > 36) p.style.fontSize = `${parseFloat(getComputedStyle(p).fontSize) - 2}px`;
        for (const item of document.querySelectorAll('.fit p')) {
          while ((item.scrollHeight > item.parentElement.clientHeight - 85 || item.scrollWidth > item.clientWidth + 1) && parseFloat(getComputedStyle(item).fontSize) > 24) item.style.fontSize = `${parseFloat(getComputedStyle(item).fontSize) - 2}px`;
        }
        while (header.getBoundingClientRect().bottom > (wide ? 520 : 560) && parseFloat(getComputedStyle(header).fontSize) > 40) header.style.fontSize = `${parseFloat(getComputedStyle(header).fontSize) - 2}px`;
        return { captionFits: p.scrollHeight <= box.clientHeight - 40 && p.scrollWidth <= p.clientWidth + 1,
          headingFits: header.getBoundingClientRect().bottom < (wide ? 540 : 640), fontReady: document.fonts.check('51px "Nirmala UI"', 'தமிழ்'),
          itemsFit: [...document.querySelectorAll('.fit')].every(item => item.scrollHeight <= item.clientHeight + 1 && item.scrollWidth <= item.clientWidth + 1) };
      }, brief.format === 'long');
      if (!check.captionFits || !check.headingFits || !check.fontReady || !check.itemsFit) throw new Error(`Tamil layout overflow or unavailable font in frame ${i}: ${JSON.stringify(check)}`);
      checks.push(check);
      const name = `frame-${String(i).padStart(3, '0')}.png`;
      await page.screenshot({ path: join(out, name), animations: 'disabled' });
      frames.push({ name, start: interval.start, duration: interval.end - interval.start, scene, caption: cue?.text ?? '' });
    }
  } finally { await browser.close(); }
  await writeFile(join(out, 'frames.json'), JSON.stringify(frames, null, 2));
  const concat = frames.map(f => `file '${f.name}'\noption framerate 30\nduration ${f.duration.toFixed(6)}`).join('\n') + `\nfile '${frames.at(-1).name}'\noption framerate 30\n`;
  await writeFile(join(out, 'frames.ffconcat'), 'ffconcat version 1.0\n' + concat);
  const video = join(out, brief.id === 'inscriptions-01' ? 'pilot-inscriptions-rajan.mp4' : `${brief.id}.mp4`);
  console.log(`Rendered ${frames.length} Tamil graphic frames. Encoding ${total.toFixed(2)} seconds...`);
  await run(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(out, 'frames.ffconcat'), '-i', audioPath,
    '-map', '0:v:0', '-map', '1:a:0', '-t', String(total), '-r', '30', '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart',
    '-metadata', `title=${brief.title}`, video]);
  console.log('Checking full video decode...');
  await run(['-hide_banner', '-loglevel', 'error', '-i', video, '-f', 'null', '-']);
  const info = await run(['-hide_banner', '-i', video, '-t', '0', '-f', 'null', '-']);
  if (!info.includes(`${width}x${height}`) || !info.includes('h264') || !info.includes('aac')) throw new Error('Unexpected output video format.');
  await run(['-hide_banner', '-loglevel', 'error', '-y', '-ss', '2', '-i', video, '-frames:v', '1', join(out, 'poster.png')]);
  const sources = `# ${brief.title}\n\n${brief.sources.map(s => `- ${s.title}: ${s.url}\n  Passage: ${s.locator}`).join('\n')}\n\nNarration: ${timing.provider} / voice ${timing.voice}.\nVisuals: Original code-generated explanatory diagrams; no external photos, ancient text facsimiles, or historical reconstructions.\nCaption timing: ${captions.method}. Approximate timings require listening review before publication.\n\nThis is a local preview. It has not been published.\n`;
  await writeFile(join(out, 'sources-and-notes.md'), sources, 'utf8');
  await writeFile(join(out, 'render-manifest.json'), JSON.stringify({ brief_hash: timing.brief_hash, audio_hash: audioHash,
    width, height, fps: 30, narration_seconds: total, video, captions_method: captions.method,
    frames: frames.length, all_layout_checks_passed: checks.every(c => c.captionFits && c.headingFits && c.fontReady),
    full_decode_passed: true, render_approved: false, notes: 'Original explanatory graphics. Approximate captions anchored to scene audio durations. Final editorial/listening review pending.' }, null, 2));
  console.log(`Video ready: ${video}`);
}
main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
