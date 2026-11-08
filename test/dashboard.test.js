import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createDashboard } from '../src/dashboard-server.js';
import { fingerprint } from '../src/workflow.js';
import { audioDirectory } from '../src/episode.js';

test('dashboard enforces local requests, versioned saves, job gates, and media range limits', async t => {
  const root = await mkdtemp(join(tmpdir(), 'yt-studio-test-'));
  await mkdir(join(root, 'config')); await mkdir(join(root, 'episodes'));
  const channel = { narration: { provider: 'elevenlabs', model: 'eleven_v3' } };
  await writeFile(join(root, 'config/channel.json'), JSON.stringify(channel));
  const brief = JSON.parse(await readFile(new URL('../episodes/rajendra-chola-01.json', import.meta.url), 'utf8'));
  await writeFile(join(root, 'episodes', `${brief.id}.json`), JSON.stringify(brief));
  let calls = 0;
  const app = await createDashboard({ root, port: 0, execute: async ({ log }) => { calls++; log('offline job complete'); } });
  t.after(async () => {
    await app.close();
    if (resolve(root).startsWith(resolve(tmpdir()) + '\\yt-studio-test-') || resolve(root).startsWith(resolve(tmpdir()) + '/yt-studio-test-')) await rm(root, { recursive: true });
  });
  const bootstrap = await (await fetch(app.url + '/api/bootstrap')).json();
  assert.ok(bootstrap.token); assert.equal(typeof bootstrap.keyConfigured, 'boolean'); assert.equal(bootstrap.apiKey, undefined);
  const post = (path, body, extra = {}) => fetch(app.url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Local-Token': bootstrap.token, ...extra }, body: JSON.stringify(body) });
  const base = `/api/episodes/${brief.id}`;
  const current = await (await fetch(app.url + base)).json();
  assert.equal(current.valid, true);
  assert.equal((await fetch(app.url + base, { method: 'POST', body: '{}' })).status, 403);
  assert.equal((await post(base, {}, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await post(base, { brief, revision: 'stale' })).status, 409);
  const secret = structuredClone(brief); secret.narration.api_key = 'must-not-save';
  assert.equal((await post(base, { brief: secret, revision: current.revision })).status, 400);
  const changed = structuredClone(brief); changed.title += ' · edited';
  const saved = await (await post(base, { brief: changed, revision: current.revision })).json();
  assert.equal(saved.revision, fingerprint(changed));
  assert.equal((await post(base + '/action', { action: 'narrate', revision: saved.revision })).status, 400);
  assert.equal(calls, 0);
  assert.equal((await post(base + '/action', { action: 'prepare', revision: saved.revision })).status, 202);
  for (let i = 0; i < 50; i++) {
    const status = await (await fetch(app.url + base)).json();
    if (status.job?.status === 'completed') break;
    await new Promise(done => setTimeout(done, 10));
  }
  assert.equal(calls, 1);
  const dir = audioDirectory(root, changed, channel); await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'narration.wav'), Buffer.alloc(100));
  const range = await fetch(app.url + base + '/media/audio', { headers: { Range: 'bytes=10-19' } });
  assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 10);
  assert.equal((await fetch(app.url + base + '/media/audio', { headers: { Range: 'bytes=999-' } })).status, 416);
  assert.equal((await fetch(app.url + '/.env')).status, 404);
  assert.equal((await fetch(app.url + base + '/media/secret')).status, 404);
});
