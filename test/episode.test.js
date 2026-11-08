import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TEMPLATES, validateLayout, dimensions, audioDirectory } from '../src/episode.js';
import { validateBrief } from '../src/workflow.js';
import { episodeFrameHtml } from '../src/episode-visuals.js';

const pilot = JSON.parse(await readFile(new URL('../content/pilot.json', import.meta.url), 'utf8'));
function episode(format = 'short') {
  const brief = structuredClone(pilot); brief.id = 'another-topic'; brief.format = format; brief.target_seconds = format === 'long' ? 600 : 45;
  brief.scenes.forEach(s => { s.layout = { template: 'evidence', title: 'தமிழ் தலைப்பு', items: ['சான்று'] }; });
  return brief;
}
test('new topics support varying scene counts and both formats', () => {
  const brief = episode('long'); brief.scenes = brief.scenes.slice(0, 2); validateBrief(brief);
  assert.deepEqual(dimensions('long'), { width: 1920, height: 1080 });
  assert.deepEqual(dimensions('short'), { width: 1080, height: 1920 });
  delete brief.scenes[0].layout; assert.throws(() => validateBrief(brief), /layout/);
});
test('all six templates render provided content rather than pilot labels', () => {
  for (const template of TEMPLATES) {
    const brief = episode(); brief.scenes[0].layout.template = template;
    const html = episodeFrameHtml(brief, 0, '<bad>', 0.4);
    assert.ok(html.includes('தமிழ் தலைப்பு')); assert.ok(html.includes('&lt;bad&gt;'));
    assert.ok(!html.includes('கல்லில் பதிந்த'));
  }
  assert.throws(() => validateLayout({ template: 'unknown', title: 'a', items: ['b'] }), /template/);
  assert.throws(() => validateLayout({ template: 'title', title: 'a', items: [] }), /items/);
});
test('voice resolution isolates episode voices and refuses filesystem traversal', () => {
  const brief = episode(); const channel = { narration: { provider: 'elevenlabs', model: 'eleven_v3' } };
  brief.narration = { voice_id: 'voiceA' };
  assert.ok(audioDirectory('C:/workspace', brief, channel).endsWith('voiceA'));
  assert.ok(audioDirectory('C:/workspace', brief, channel, 'voiceB').endsWith('voiceB'));
  assert.throws(() => audioDirectory('C:/workspace', brief, channel, '../bad'), /voice/);
});
