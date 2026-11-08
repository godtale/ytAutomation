import test from 'node:test';
import assert from 'node:assert/strict';
import { pcmToWav, synthesizeElevenLabs, listElevenLabsVoices } from '../src/elevenlabs.js';
import { wavDuration } from '../src/speech.js';

test('voice discovery returns compact metadata without voice training samples', async () => {
  const catalog = await listElevenLabsVoices({ key: 'test-key', transport: async (url, request) => {
    assert.equal(request.headers['xi-api-key'], 'test-key');
    assert.match(url, /\/v2\/voices/);
    return { ok: true, json: async () => ({ has_more: false, voices: [{ voice_id: 'test', name: 'Tamil', labels: { language: 'ta' },
      verified_languages: [{ language: 'ta' }, { language: 'ta' }], samples: [{ file_name: 'private-training.wav' }] }] }) };
  }});
  assert.deepEqual(catalog.voices[0].verified_languages, ['ta']);
  assert.equal(catalog.voices[0].samples, undefined);
  await assert.rejects(listElevenLabsVoices({ key: 'test', transport: async () => ({ ok: false, status: 403 }) }), /HTTP 403/);
});

test('ElevenLabs sends Tamil JSON and wraps 24kHz PCM into measurable WAV', async () => {
  const audio = await synthesizeElevenLabs('தமிழ் வரலாறு', {
    key: 'test-key', voice: 'testVoice', transport: async (url, request) => {
      assert.equal(url, 'https://api.elevenlabs.io/v1/text-to-speech/testVoice?output_format=pcm_24000');
      assert.equal(request.headers['xi-api-key'], 'test-key');
      assert.deepEqual(JSON.parse(request.body), { text: 'தமிழ் வரலாறு', model_id: 'eleven_v3', language_code: 'ta' });
      return { ok: true, arrayBuffer: async () => Buffer.alloc(48000) };
    }
  });
  assert.equal(wavDuration(audio), 1);
});

test('missing key, unsafe voice ID, and unsupported model fail before sending', async () => {
  let requests = 0;
  const transport = async () => { requests++; };
  await assert.rejects(synthesizeElevenLabs('தமிழ்', { voice: 'voice', transport }), /API_KEY/);
  await assert.rejects(synthesizeElevenLabs('தமிழ்', { key: 'test', voice: '../voice', transport }), /voice ID/);
  await assert.rejects(synthesizeElevenLabs('தமிழ்', { key: 'test', voice: 'voice', model: 'unknown', transport }), /models/);
  assert.equal(requests, 0);
});

test('HTTP failures are not retried and never expose response secrets', async () => {
  let requests = 0;
  await assert.rejects(synthesizeElevenLabs('தமிழ்', { key: 'test', voice: 'voice', transport: async () => {
    requests++; return { ok: false, status: 429, text: async () => 'sensitive provider body' };
  }}), error => error.message.includes('HTTP 429') && !error.message.includes('sensitive'));
  assert.equal(requests, 1);
});

test('malformed PCM and successful JSON error bodies cannot become cached audio', async () => {
  assert.throws(() => pcmToWav(Buffer.alloc(0)), /Invalid/);
  assert.throws(() => pcmToWav(Buffer.alloc(3)), /Invalid/);
  await assert.rejects(synthesizeElevenLabs('தமிழ்', { key: 'test', voice: 'voice', transport: async () => ({
    ok: true, headers: new Headers({ 'content-type': 'application/json' }), arrayBuffer: async () => Buffer.alloc(4)
  }) }), /non-audio/);
});
