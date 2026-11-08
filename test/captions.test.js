import test from 'node:test';
import assert from 'node:assert/strict';
import { approximateWords, captionCues, toSrt, alignNarration } from '../src/captions.js';
import { frameHtml } from '../src/visuals.js';

test('approximate captions preserve Tamil text and stay inside measured scene boundaries', () => {
  const scenes = [{ text: 'கல்வெட்டுகள் வரலாற்றை அறிய உதவும் பதிவுகள்.' }, { text: 'பல பதிவுகளை ஒப்பிட்டு ஆய்வு செய்யலாம்.' }];
  const words = approximateWords(scenes, [3, 4]);
  const cues = captionCues(words, scenes, [3, 4]);
  assert.equal(cues.map(c => c.text).join(' '), scenes.map(s => s.text).join(' '));
  assert.ok(cues.filter(c => c.scene === 0).every(c => c.end <= 3));
  assert.ok(cues.filter(c => c.scene === 1).every(c => c.start >= 3 && c.end <= 7));
  assert.match(toSrt(cues), /00:00:00,120 -->/);
});

test('bad timestamps and mismatched alignment text fail validation', () => {
  assert.throws(() => captionCues([{ text: 'a', start: 2, end: 1 }], [{ text: 'a' }], [3]), /Invalid/);
  assert.throws(() => captionCues([{ text: 'b', start: 0, end: 1 }], [{ text: 'a' }], [3]), /differs/);
});

test('API alignment uses multipart audio, protects response details on rejection', async () => {
  await assert.rejects(alignNarration(Buffer.alloc(4), 'தமிழ்', { key: 'test', transport: async (url, request) => {
    assert.match(url, /forced-alignment$/);
    assert.equal(request.body.get('text'), 'தமிழ்');
    assert.equal(request.headers['xi-api-key'], 'test');
    return { ok: false, status: 401, json: async () => ({ detail: { status: 'missing_permissions', message: 'private data' } }) };
  }}), error => error.message.includes('missing_permissions') && !error.message.includes('private data'));
});

test('render template escapes caption text and labels diagrams', () => {
  assert.ok(frameHtml(0, '<script>bad</script>', 0.5).includes('&lt;script&gt;'));
  assert.ok(frameHtml(4, 'தமிழ்', 1).includes('விளக்கப்படம்'));
});
