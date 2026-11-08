import http from 'node:http';
import { readFile, writeFile, readdir, mkdir, stat, appendFile, copyFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { validateBrief, fingerprint, assertApproved } from './workflow.js';
import { audioDirectory, TEMPLATES } from './episode.js';
import { elevenLabsKey, openAIKey } from './environment.js';
import { generateEpisode } from './openai-generation.js';
import { generationKey } from './ai-cost-control.js';
import { listElevenLabsVoices } from './elevenlabs.js';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const exists = async path => { try { await stat(path); return true; } catch { return false; } };
const slug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
function draftShape(brief, id) {
  if (!brief || brief.id !== id || !slug(id) || brief.schema_version !== 1 || typeof brief.title !== 'string' || brief.title.length > 300 || !['short', 'long'].includes(brief.format) || brief.language !== 'ta-IN') throw fail('Invalid episode identity, language, or format.');
  for (const field of ['sources', 'claims', 'scenes', 'glossary']) if (brief[field] !== undefined && !Array.isArray(brief[field])) throw fail(`${field} must be a list.`);
  // Drafts may be incomplete, but credentials have no place in episode data.
  const containsSecretField = value => value && typeof value === 'object' && Object.entries(value).some(([key, item]) => /api[_-]?key|subscription[_-]?key|secret|password/i.test(key) || containsSecretField(item));
  if (containsSecretField(brief) || [elevenLabsKey(), openAIKey()].some(key => key && JSON.stringify(brief).includes(key))) throw fail('Credentials must remain in the environment.');
}

export async function createDashboard({ root = project, port = 4317, execute, aiGenerator = generateEpisode } = {}) {
  const token = randomBytes(32).toString('hex');
  const jobs = new Map(); let active = false; const queue = [];
  const saveLocks = new Set();
  const controllers = new Map();
  await mkdir(join(root, 'episodes'), { recursive: true });
  const channel = () => json(join(root, 'config/channel.json'));
  const controlsPath = join(root, 'config/ai-controls.json');
  const controls = async () => await exists(controlsPath) ? json(controlsPath) : { paid_generation_enabled: true };
  const redact = value => [elevenLabsKey(), openAIKey()].filter(Boolean).reduce((text, key) => text.split(key).join('[redacted]'), String(value));
  async function files() {
    const result = [];
    for (const name of await readdir(join(root, 'episodes'))) if (/^[a-z0-9-]+\.json$/.test(name)) result.push(join(root, 'episodes', name));
    if (await exists(join(root, 'content/pilot.json'))) result.push(join(root, 'content/pilot.json'));
    return result;
  }
  async function locate(id) {
    if (!slug(id)) throw fail('Invalid episode ID.');
    for (const path of await files()) { const brief = await json(path); if (brief.id === id) return { path, brief }; }
    throw fail('Episode not found.', 404);
  }
  async function state(brief) {
    let validationError = null; try { validateBrief(brief); } catch (error) { validationError = error.message; }
    const hash = fingerprint(brief);
    const base = join(root, 'output', brief.id, hash);
    let dir = null; try { dir = audioDirectory(root, brief, await channel()); } catch {}
    const approval = await exists(join(base, 'approval.json')) ? await json(join(base, 'approval.json')) : null;
    const video = brief.id === 'inscriptions-01' ? 'pilot-inscriptions-rajan.mp4' : `${brief.id}.mp4`;
    return { revision: hash, valid: !validationError, validationError, approved: approval?.brief_hash === hash,
      audio: Boolean(dir && await exists(join(dir, 'narration.wav'))), sample: Boolean(dir && await exists(join(dir, 'sample.wav'))),
      video: Boolean(dir && await exists(join(dir, 'render', video))), poster: Boolean(dir && await exists(join(dir, 'render/poster.png'))),
      timing: dir && await exists(join(dir, 'timing.json')) ? await json(join(dir, 'timing.json')) : null,
      job: [...jobs.values()].reverse().find(j => j.episodeId === brief.id) ?? null };
  }
  const busy = id => [...jobs.values()].some(j => j.episodeId === id && ['queued', 'running'].includes(j.status));
  async function persist(job) {
    const dir = join(root, 'output/dashboard-jobs', job.id); await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'job.json'), JSON.stringify(job, null, 2));
  }
  async function drain() {
    if (active || !queue.length) return;
    active = true; const { job, brief } = queue.shift();
    try {
      job.status = 'running'; await persist(job);
      const jobDir = join(root, 'output/dashboard-jobs', job.id);
      const input = join(jobDir, 'brief.json'); await writeFile(input, JSON.stringify(brief, null, 2));
      if (job.action === 'generate') {
        if (!(await controls()).paid_generation_enabled) throw new Error('Paid AI generation is paused. No request was sent.');
        const controller = new AbortController(); controllers.set(job.id, controller);
        const cacheDir = join(root, 'output/ai-cache', job.requestKey); await mkdir(cacheDir, { recursive: true });
        await writeFile(join(cacheDir, `${job.id}.imported`), 'Usage is written directly to this cache.');
        const resume = {};
        for (const stage of ['research', 'draft']) if (await exists(join(cacheDir, `${stage}-response.json`))) resume[stage] = await json(join(cacheDir, `${stage}-response.json`));
        const ledger = await exists(join(cacheDir, 'usage.jsonl')) ? (await readFile(join(cacheDir, 'usage.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
        const blockedStages = job.explicitRetry ? [] : ['research', 'draft'].filter(stage => !resume[stage] && ledger.some(event => event.stage === stage && event.status === 'request_started'));
        const result = await aiGenerator({ brief, ...job.aiOptions, key: openAIKey(), resume, blockedStages, signal: controller.signal,
          onProgress: text => { job.log = redact((job.log + text).slice(-16000)); },
          onCheckpoint: async (stage, response) => {
            if (!['research', 'draft'].includes(stage)) throw new Error('Unknown generation checkpoint.');
            await writeFile(join(jobDir, `${stage}-response.json`), redact(JSON.stringify(response, null, 2)));
            await writeFile(join(cacheDir, `${stage}-response.json`), redact(JSON.stringify(response, null, 2)));
          },
          onUsage: async event => {
            await appendFile(join(jobDir, 'openai-usage.jsonl'), redact(JSON.stringify(event)) + '\n');
            await appendFile(join(cacheDir, 'usage.jsonl'), redact(JSON.stringify(event)) + '\n');
          }
        });
        draftShape(result.brief, brief.id); validateBrief(result.brief);
        job.result = result;
        await writeFile(join(jobDir, 'generated-draft.json'), redact(JSON.stringify(result, null, 2)));
        job.status = 'completed';
        return;
      }
      const args = [job.action === 'sample' ? 'narrate' : job.action, input];
      if (job.action === 'approve') args.push('--reviewer', 'Local dashboard review');
      if (['sample', 'narrate'].includes(job.action)) args.push('--allow-paid', ...(job.action === 'sample' ? ['--sample'] : []));
      if (job.action === 'render') args.push('--captions', 'approximate');
      const log = chunk => { job.log = redact((job.log + chunk).slice(-16000)); };
      if (execute) await execute({ args, log, root });
      else await new Promise((done, reject) => {
        const child = spawn(process.execPath, [join(project, 'src/episode-cli.js'), ...args], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.on('data', log); child.stderr.on('data', log); child.on('error', reject);
        child.on('close', code => code === 0 ? done() : reject(new Error(`Job exited with code ${code}. See the run log.`)));
      });
      job.status = 'completed';
    } catch (error) { job.status = controllers.get(job.id)?.signal.aborted ? 'cancelled' : 'failed'; job.error = redact(error.message); }
    finally { controllers.delete(job.id); job.finishedAt = new Date().toISOString(); await persist(job); active = false; drain(); }
  }
  // Restore job identity after restarts; never restart provider calls automatically.
  const jobsDir = join(root, 'output/dashboard-jobs');
  if (await exists(jobsDir)) {
    const restored = [];
    for (const name of await readdir(jobsDir)) {
      if (!/^[a-f0-9-]{36}$/.test(name)) continue;
      try {
        const dir = join(jobsDir, name); const job = await json(join(dir, 'job.json'));
        if (job.id !== name || !slug(job.episodeId)) continue;
        if (['running', 'queued'].includes(job.status)) { job.status = 'interrupted'; job.error = 'Server stopped. No automatic API retry was made.'; }
        if (job.action === 'generate' && job.aiOptions) {
          const snapshot = await json(join(dir, 'brief.json'));
          job.requestKey = generationKey(snapshot, job.aiOptions);
          const cacheDir = join(root, 'output/ai-cache', job.requestKey); await mkdir(cacheDir, { recursive: true });
          for (const stage of ['research', 'draft']) if (await exists(join(dir, `${stage}-response.json`)) && !await exists(join(cacheDir, `${stage}-response.json`))) await copyFile(join(dir, `${stage}-response.json`), join(cacheDir, `${stage}-response.json`));
          if (await exists(join(dir, 'openai-usage.jsonl'))) {
            const marker = join(cacheDir, `${job.id}.imported`);
            if (!await exists(marker)) { await appendFile(join(cacheDir, 'usage.jsonl'), await readFile(join(dir, 'openai-usage.jsonl'), 'utf8')); await writeFile(marker, 'imported'); }
          }
        }
        restored.push(job);
      } catch { /* An incomplete job record cannot authorize a provider request. */ }
    }
    restored.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    for (const job of restored) jobs.set(job.id, job);
  }
  async function body(req) {
    let text = ''; for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 1024 * 1024) throw fail('Episode exceeds 1 MB.', 413); }
    try { return JSON.parse(text || '{}'); } catch { throw fail('Invalid JSON.'); }
  }
  const server = http.createServer(async (req, res) => {
    const send = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const local = `http://127.0.0.1:${server.address().port}`;
      if (req.headers.host !== `127.0.0.1:${server.address().port}`) throw fail('Use the printed local address.', 403);
      if (req.headers.origin && req.headers.origin !== local) throw fail('Cross-origin requests are disabled.', 403);
      res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
      const url = new URL(req.url, local);
      if (req.method === 'POST' && req.headers['x-local-token'] !== token) throw fail('Refresh the dashboard before saving.', 403);
      if (req.method === 'GET' && ['/', '/app.js', '/style.css'].includes(url.pathname)) {
        const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        res.setHeader('Content-Type', name.endsWith('html') ? 'text/html; charset=utf-8' : name.endsWith('js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8');
        res.end(await readFile(join(project, 'dashboard', name))); return;
      }
      if (url.pathname === '/api/bootstrap' && req.method === 'GET') { send({ token, templates: TEMPLATES, keyConfigured: Boolean(elevenLabsKey()), openaiKeyConfigured: Boolean(openAIKey()), aiPaidEnabled: (await controls()).paid_generation_enabled, openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini', weekly: (await channel()).weekly_output }); return; }
      if (url.pathname === '/api/ai-controls' && req.method === 'POST') {
        const data = await body(req); if (typeof data.enabled !== 'boolean') throw fail('Choose enabled or paused.');
        await writeFile(controlsPath, JSON.stringify({ paid_generation_enabled: data.enabled }, null, 2));
        if (!data.enabled) {
          for (const controller of controllers.values()) controller.abort(new Error('AI generation paused by user.'));
          for (let i = queue.length - 1; i >= 0; i--) if (queue[i].job.action === 'generate') { const [{ job }] = queue.splice(i, 1); job.status = 'cancelled'; job.error = 'Cancelled before starting by AI pause.'; await persist(job); }
        }
        send({ enabled: data.enabled }); return;
      }
      if (url.pathname === '/api/voices' && req.method === 'POST') { const data = await listElevenLabsVoices({ key: elevenLabsKey() }); send({ ...data, voices: data.voices.filter(v => v.labels?.language === 'ta' || v.verified_languages.includes('ta')) }); return; }
      if (url.pathname === '/api/episodes' && req.method === 'GET') {
        const result = []; for (const path of await files()) { const brief = await json(path); result.push({ id: brief.id, title: brief.title, format: brief.format, ...await state(brief) }); }
        send(result); return;
      }
      if (url.pathname === '/api/episodes' && req.method === 'POST') {
        const brief = await body(req); draftShape(brief, brief.id);
        for (const path of await files()) if ((await json(path)).id === brief.id) throw fail('Episode ID already exists.', 409);
        await writeFile(join(root, 'episodes', `${brief.id}.json`), JSON.stringify(brief, null, 2) + '\n', { flag: 'wx' }); send({ brief, ...await state(brief) }, 201); return;
      }
      const match = url.pathname.match(/^\/api\/episodes\/([a-z0-9-]+)(?:\/(action|media|apply-ai)(?:\/([a-z-]+))?)?$/);
      if (!match) throw fail('Not found.', 404);
      const { path, brief } = await locate(match[1]);
      if (!match[2] && req.method === 'GET') { send({ brief, ...await state(brief) }); return; }
      if (!match[2] && req.method === 'POST') {
        const data = await body(req);
        if (busy(brief.id)) throw fail('Wait for the current episode job to finish before editing.', 409);
        if (saveLocks.has(brief.id)) throw fail('Another save is in progress. Reload before saving.', 409);
        saveLocks.add(brief.id);
        try {
          if (data.revision !== fingerprint(await json(path))) throw fail('This episode changed elsewhere. Reload before saving.', 409);
          draftShape(data.brief, brief.id);
          await writeFile(path, JSON.stringify(data.brief, null, 2) + '\n'); send({ brief: data.brief, ...await state(data.brief) });
        } finally { saveLocks.delete(brief.id); }
        return;
      }
      if (match[2] === 'apply-ai' && req.method === 'POST') {
        const data = await body(req); const job = jobs.get(data.jobId);
        if (busy(brief.id) || saveLocks.has(brief.id)) throw fail('Wait for current production or saving to finish.', 409);
        if (!job || job.episodeId !== brief.id || job.action !== 'generate' || job.status !== 'completed' || !job.result) throw fail('No completed AI draft is available.');
        saveLocks.add(brief.id);
        try {
          const latest = await json(path);
          if (data.revision !== fingerprint(latest) || job.revision !== fingerprint(latest)) throw fail('The episode changed after generation began. Save the generated draft under a new episode instead.', 409);
          draftShape(job.result.brief, brief.id); validateBrief(job.result.brief);
          await writeFile(path, JSON.stringify(job.result.brief, null, 2) + '\n');
          job.applied = true; await persist(job);
          send({ brief: job.result.brief, ...await state(job.result.brief) });
        } finally { saveLocks.delete(brief.id); }
        return;
      }
      if (match[2] === 'action' && req.method === 'POST') {
        const data = await body(req);
        if (!['prepare', 'approve', 'sample', 'narrate', 'render', 'generate'].includes(data.action)) throw fail('Unknown action.');
        if (data.revision !== fingerprint(brief)) throw fail('Save or reload the current content first.', 409);
        if (busy(brief.id)) throw fail('An episode job is already queued or running.', 409);
        if (data.action !== 'generate') validateBrief(brief);
        else {
          if (!(await controls()).paid_generation_enabled) throw fail('Paid AI generation is paused. Enable it explicitly before starting a new request.', 409);
          if (!openAIKey()) throw fail('OPENAI_API_KEY is not available in the server environment.');
          if (data.allowPaid !== true) throw fail('Enable OpenAI API usage for this generation.');
          if (typeof data.topic !== 'string' || data.topic.trim().length < 3 || data.topic.length > 300 || typeof (data.angle ?? '') !== 'string' || (data.angle ?? '').length > 1500) throw fail('Supply a topic of 3–300 characters and direction up to 1,500 characters.');
          if (!Number.isFinite(brief.target_seconds) || (brief.format === 'short' ? brief.target_seconds < 15 || brief.target_seconds > 180 : brief.target_seconds < 300 || brief.target_seconds > 900)) throw fail('Choose a valid target duration before generating.');
        }
        if (['sample', 'narrate'].includes(data.action) && data.allowPaid !== true) throw fail('Enable use of subscription credits for narration.');
        const base = join(root, 'output', brief.id, fingerprint(brief));
        if (['approve', 'sample', 'narrate'].includes(data.action) && !await exists(join(base, 'brief.json'))) throw fail('Prepare this script version first.');
        if (data.action === 'narrate') assertApproved(brief, await exists(join(base, 'approval.json')) ? await json(join(base, 'approval.json')) : null);
        if (['sample', 'narrate', 'render'].includes(data.action)) audioDirectory(root, brief, await channel());
        const job = { id: randomUUID(), episodeId: brief.id, revision: fingerprint(brief), action: data.action, status: 'queued', log: '', startedAt: new Date().toISOString() };
        if (data.action === 'generate') job.aiOptions = { topic: data.topic.trim(), angle: data.angle ?? '', model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini' };
        if (data.action === 'generate') {
          job.requestKey = generationKey(brief, job.aiOptions);
          const prior = [...jobs.values()].reverse().find(j => j.requestKey === job.requestKey);
          if (prior) {
            if (data.explicitRetry === true && ['failed', 'interrupted', 'cancelled'].includes(prior.status) && data.allowPaid === true) {
              job.explicitRetry = true; job.retryOf = prior.id;
            } else { send({ ...prior, deduplicated: true }); return; }
          }
        }
        if (busy(brief.id)) throw fail('An episode job was already submitted. No additional request was queued.', 409);
        jobs.set(job.id, job); queue.push({ job, brief }); await persist(job); send(job, 202); drain(); return;
      }
      if (match[2] === 'media' && req.method === 'GET') {
        const dir = audioDirectory(root, brief, await channel());
        const paths = { video: join(dir, 'render', brief.id === 'inscriptions-01' ? 'pilot-inscriptions-rajan.mp4' : `${brief.id}.mp4`),
          poster: join(dir, 'render/poster.png'), audio: join(dir, 'narration.wav'), sample: join(dir, 'sample.wav'), captions: join(dir, 'captions.ta.srt'), sources: join(dir, 'render/sources-and-notes.md') };
        const file = paths[match[3]]; if (!file || !await exists(file)) throw fail('Media is not ready for this content version.', 404);
        const size = (await stat(file)).size;
        const type = { video: 'video/mp4', poster: 'image/png', audio: 'audio/wav', sample: 'audio/wav', captions: 'text/plain; charset=utf-8', sources: 'text/plain; charset=utf-8' }[match[3]];
        res.setHeader('Content-Type', type); res.setHeader('Accept-Ranges', 'bytes'); res.setHeader('Cache-Control', 'no-cache');
        let start = 0, end = size - 1;
        if (req.headers.range) {
          const range = req.headers.range.match(/^bytes=(\d+)-(\d*)$/);
          if (!range) throw fail('Unsupported range.', 416);
          start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
          if (start > end || start >= size) throw fail('Range outside file.', 416);
          res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        }
        res.setHeader('Content-Length', end - start + 1); createReadStream(file, { start, end }).pipe(res); return;
      }
      throw fail('Method not allowed.', 405);
    } catch (error) { if (!res.headersSent) send({ error: redact(error.message) }, error.status ?? 400); else res.end(); }
  });
  await new Promise(done => server.listen(port, '127.0.0.1', done));
  return { server, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(done => server.close(done)) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createDashboard(); console.log(`Tamil History Studio: ${app.url}`);
}
