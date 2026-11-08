import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateEpisode, responseText, normalizeSceneIds } from '../src/openai-generation.js';
import { openAIKey } from '../src/environment.js';

const brief = JSON.parse(await readFile(new URL('../episodes/rajendra-chola-01.json', import.meta.url), 'utf8'));
function response(text, annotations = [], search = false) {
  return { id: 'test-response', status: 'completed', model: 'gpt-4.1-mini', usage: { input_tokens: 100, output_tokens: 100 },
    output: [...(search ? [{ type: 'web_search_call' }] : []), { type: 'message', content: [{ type: 'output_text', text, annotations }] }] };
}
const citations = brief.sources.map(s => ({ type: 'url_citation', url: s.url, title: s.title }));
test('model scene IDs become deterministic unique safe filenames without changing narration', () => {
  const scenes = ['Scene 1', 'காட்சி-2', '../escape', 'DUPLICATE', 'DUPLICATE'].map(id => ({ id, text: 'தமிழ் உரை', claim_ids: ['C1'] }));
  const normalized = normalizeSceneIds(scenes);
  assert.deepEqual(normalized.map(s => s.id), ['s01', 's02', 's03', 's04', 's05']);
  assert.ok(normalized.every(s => s.text === 'தமிழ் உரை' && s.claim_ids[0] === 'C1'));
  assert.equal(scenes[0].id, 'Scene 1');
});
test('completed responses are checkpointed before validation, and can be reprocessed without API calls', async () => {
  const data = { ...structuredClone(brief), review_notes: [] }; data.scenes.forEach(s => { s.id = 'தமிழ் காட்சி'; });
  const checkpoints = [];
  const result = await generateEpisode({ brief, topic: 'Rajendra Chola', key: 'test',
    resume: { research: response('Research notes', citations, true), draft: response(JSON.stringify(data)) },
    onCheckpoint: async stage => checkpoints.push(stage), transport: async () => { throw new Error('Must not make a request.'); } });
  assert.deepEqual(checkpoints, ['research', 'draft']);
  assert.deepEqual(result.brief.scenes.map(s => s.id), ['s01', 's02', 's03', 's04', 's05']);
});
test('uncertain prior billing blocks provider requests and cancellation stops before network', async () => {
  let calls = 0;
  const transport = async () => { calls++; throw new Error('Must not run'); };
  await assert.rejects(generateEpisode({ brief, topic: 'Rajendra Chola', key: 'test', transport, blockedStages: ['research'] }), /already have been billed/);
  const controller = new AbortController(); controller.abort(new Error('Paused'));
  await assert.rejects(generateEpisode({ brief, topic: 'Rajendra Chola', key: 'test', transport, signal: controller.signal }), /Paused/);
  assert.equal(calls, 0);
});
test('OpenAI drafting requires web research and produces a validated editable unapproved draft', async () => {
  let calls = 0; const events = [];
  const data = { ...brief, review_notes: ['Check pronunciation and cited passages.'] };
  const result = await generateEpisode({ brief, topic: 'Rajendra Chola', key: 'test-key', onUsage: async e => events.push(e), transport: async (url, request) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(request.body); assert.equal(body.store, false); assert.equal(request.headers.Authorization, 'Bearer test-key');
    if (calls === 1) { assert.equal(body.tool_choice, 'required'); assert.ok(body.input.startsWith('Research this Tamil-history documentary topic:')); assert.ok(!body.input.startsWith('{')); return { ok: true, json: async () => response('Sourced research notes', citations, true) }; }
    assert.equal(body.text.format.type, 'json_schema'); assert.equal(body.text.format.strict, true);
    return { ok: true, json: async () => response(JSON.stringify(data)) };
  }});
  assert.equal(calls, 2); assert.equal(result.brief.id, brief.id); assert.equal(result.brief.editorial_status, 'ai_draft_for_review');
  assert.equal(result.brief.narration.voice_id, brief.narration.voice_id); assert.equal(result.research.citations.length, 2);
  assert.equal(events.filter(e => e.status === 'completed').length, 2);
  assert.equal(brief.editorial_status, 'sample_for_review');
});
test('fabricated draft sources are rejected even if JSON is valid', async () => {
  let calls = 0; const data = structuredClone(brief); data.sources[0].url = 'https://invented.example/fake';
  await assert.rejects(generateEpisode({ brief, topic: 'Rajendra Chola', key: 'test', transport: async () => ({ ok: true, json: async () => ++calls === 1 ? response('Research', citations, true) : response(JSON.stringify(data)) }) }), /not cited/);
});
test('missing citations stop before the drafting call; HTTP errors are not retried', async () => {
  let calls = 0;
  await assert.rejects(generateEpisode({ brief, topic: 'Rajendra Chola', key: 'test', transport: async () => { calls++; return { ok: true, json: async () => response('No citations', [], true) }; } }), /fewer than two/);
  assert.equal(calls, 1);
  await assert.rejects(generateEpisode({ brief, topic: 'Rajendra Chola', key: 'test', transport: async () => ({ ok: false, status: 401 }) }), /HTTP 401/);
  assert.throws(() => responseText({ status: 'incomplete' }), /partial draft/);
  assert.throws(() => responseText({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }), /declined/);
  assert.equal(openAIKey({ OpenAI_Api_Key: 'test' }), 'test');
});
test('network-denied errors explain process permissions without retrying', async () => {
  let calls = 0;
  await assert.rejects(generateEpisode({ brief, topic: 'Sentinel island', key: 'test', transport: async () => {
    calls++; const error = new Error('fetch failed'); error.cause = { code: 'EACCES' }; throw error;
  }}), /could not connect \(EACCES\).*needs network access/);
  assert.equal(calls, 1);
});
