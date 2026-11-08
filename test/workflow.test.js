import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateBrief, fingerprint, assertApproved, ssml, reviewHtml } from '../src/workflow.js';
import { synthesize, wavDuration, joinWav } from '../src/speech.js';

const pilot = JSON.parse(await readFile(new URL('../content/pilot.json', import.meta.url), 'utf8'));

test('pilot is valid; dangling claims and sources are rejected', () => {
  validateBrief(pilot);
  const a = structuredClone(pilot); a.scenes[0].claim_ids = ['MISSING'];
  assert.throws(() => validateBrief(a), /unknown claims/);
  const b = structuredClone(pilot); b.claims[0].source_ids = [];
  assert.throws(() => validateBrief(b), /sources/);
});

test('changed narration or research invalidates approval', () => {
  const approval = { reviewer: 'Editor', brief_hash: fingerprint(pilot) };
  assertApproved(pilot, approval);
  const edit = structuredClone(pilot); edit.scenes[0].text += ' திருத்தம்';
  assert.throws(() => assertApproved(edit, approval), /stale/);
  assert.throws(() => assertApproved(pilot, null), /missing/);
});

test('script text remains text in speech markup and review output', () => {
  assert.match(ssml('தமிழ் & <break/>'), /தமிழ் &amp; &lt;break\/&gt;/);
  const edit = structuredClone(pilot); edit.scenes[0].text = '<script>alert(1)</script>';
  assert.ok(!reviewHtml(edit).includes('<script>'));
});

function wav() {
  const a = Buffer.alloc(44 + 48000);
  a.write('RIFF'); a.writeUInt32LE(a.length - 8, 4); a.write('WAVE', 8); a.write('fmt ', 12);
  a.writeUInt32LE(16, 16); a.writeUInt16LE(1, 20); a.writeUInt16LE(1, 22);
  a.writeUInt32LE(24000, 24); a.writeUInt32LE(48000, 28); a.writeUInt16LE(2, 32); a.writeUInt16LE(16, 34);
  a.write('data', 36); a.writeUInt32LE(48000, 40); return a;
}

test('WAV timing uses audio data, rejects truncated chunks', () => {
  assert.equal(wavDuration(wav()), 1);
  assert.throws(() => wavDuration(wav().subarray(0, 100)), /Truncated/);
});

test('joining scene audio preserves duration and refuses incompatible formats', () => {
  assert.equal(wavDuration(joinWav([wav(), wav()])), 2);
  const different = wav(); different.writeUInt32LE(16000, 24);
  assert.throws(() => joinWav([wav(), different]), /different audio formats/);
  assert.throws(() => joinWav([]), /No WAV/);
});

test('speech request uses Tamil SSML; HTTP errors do not expose provider body', async () => {
  const audio = await synthesize('தமிழ்', { key: 'test', region: 'centralindia', transport: async (url, request) => {
    assert.equal(url, 'https://centralindia.tts.speech.microsoft.com/cognitiveservices/v1');
    assert.match(request.body, /xml:lang="ta-IN"/);
    return { ok: true, arrayBuffer: async () => wav() };
  }});
  assert.equal(wavDuration(audio), 1);
  await assert.rejects(synthesize('தமிழ்', { key: 'test', region: 'centralindia', transport: async () => ({ ok: false, status: 401 }) }), /HTTP 401/);
  await assert.rejects(synthesize('தமிழ்', { key: '', region: 'centralindia' }), /Set AZURE/);
});
