import { createHash } from 'node:crypto';
import { validateLayout } from './layout.js';

function requireValue(condition, message) { if (!condition) throw new Error(message); }
const hasText = value => typeof value === 'string' && value.trim().length > 0;

export function validateBrief(brief) {
  requireValue(brief.schema_version === 1, 'Unsupported brief schema_version.');
  requireValue(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(brief.id), 'Brief id must be a lowercase slug.');
  requireValue(hasText(brief.title) && brief.language === 'ta-IN', 'A title and ta-IN language are required.');
  requireValue(['short', 'long'].includes(brief.format), 'Format must be short or long.');
  requireValue(Number.isFinite(brief.target_seconds) && (brief.format === 'short' ? brief.target_seconds >= 15 && brief.target_seconds <= 180 : brief.target_seconds >= 300 && brief.target_seconds <= 900), 'Target must be 15–180 seconds for Shorts or 300–900 seconds for long videos.');
  for (const field of ['sources', 'claims', 'scenes']) {
    requireValue(Array.isArray(brief[field]) && brief[field].length > 0, `Missing ${field}.`);
    const ids = brief[field].map(item => item.id);
    requireValue(ids.every(hasText) && new Set(ids).size === ids.length, `Invalid or duplicate IDs in ${field}.`);
  }
  const sources = new Set(brief.sources.map(s => s.id));
  const claims = new Set(brief.claims.map(c => c.id));
  for (const source of brief.sources) {
    requireValue(hasText(source.title) && hasText(source.locator), `Source ${source.id} needs a title and locator.`);
    const url = new URL(source.url);
    requireValue(url.protocol === 'https:', 'Sources must use HTTPS.');
  }
  for (const claim of brief.claims) {
    requireValue(hasText(claim.text), `Claim ${claim.id} is empty.`);
    requireValue(Array.isArray(claim.source_ids) && claim.source_ids.length > 0 && claim.source_ids.every(id => sources.has(id)), `Claim ${claim.id} has missing or unknown sources.`);
  }
  for (const scene of brief.scenes) {
    requireValue(/^[a-z0-9-]+$/.test(scene.id), 'Scene IDs must be safe filenames.');
    requireValue(hasText(scene.text) && hasText(scene.visual), `Scene ${scene.id} needs narration and a visual plan.`);
    requireValue(Array.isArray(scene.claim_ids) && scene.claim_ids.length > 0 && scene.claim_ids.every(id => claims.has(id)), `Scene ${scene.id} has missing or unknown claims.`);
    if (scene.layout) validateLayout(scene.layout);
    else requireValue(brief.id === 'inscriptions-01' && brief.format === 'short' && brief.scenes.length === 5, 'New episodes need a layout for every scene.');
  }
  if (brief.narration?.voice_id !== undefined) requireValue(/^[a-zA-Z0-9_-]{1,128}$/.test(brief.narration.voice_id), 'Invalid narration voice ID.');
  requireValue(hasText(brief.pronunciation_sample), 'A pronunciation sample is required.');
  return brief;
}

export function fingerprint(brief) {
  return createHash('sha256').update(JSON.stringify(brief)).digest('hex');
}

export function escapeMarkup(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

export const VOICES = ['ta-IN-ValluvarNeural', 'ta-IN-PallaviNeural'];
export function ssml(text, voice = VOICES[0]) {
  requireValue(VOICES.includes(voice), 'Unsupported Tamil voice.');
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ta-IN"><voice name="${voice}">${escapeMarkup(text)}</voice></speak>`;
}

export function scriptMarkdown(brief) {
  return `# ${brief.title}\n\nDraft for editorial review. Target: ${brief.target_seconds}s; actual duration awaits narration.\n\n` +
    brief.scenes.map(s => `## ${s.id} — ${s.role}\n\n${s.text}\n\nClaims: ${s.claim_ids.join(', ')}\n\nVisual: ${s.visual}`).join('\n\n') +
    '\n\n## Sources\n\n' + brief.sources.map(s => `- ${s.id}: [${s.title}](${s.url}) — ${s.locator}`).join('\n') + '\n';
}

export function reviewHtml(brief) {
  const e = escapeMarkup;
  return `<!doctype html><html lang="ta"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(brief.title)}</title>
<style>body{background:#111827;color:#e5e7eb;font:18px/1.8 'Nirmala UI',sans-serif;max-width:850px;margin:40px auto;padding:24px}h1{line-height:1.6}article{border:1px solid #374151;border-radius:12px;padding:24px;margin:20px 0}small{color:#a7b6cc}a{color:#7dd3fc}p{white-space:pre-wrap}code{overflow-wrap:anywhere}</style>
<h1>${e(brief.title)}</h1><p lang="en">SCRIPT REVIEW · ${brief.target_seconds}s target · No audio or final video yet.</p>
<p lang="en">Edit this episode JSON, then run the prepare command again. Check sources, Tamil phrasing, pronunciation, and visual accuracy before approval. Timing is not measured yet.</p>
${brief.scenes.map(s => `<article><small>${e(s.id)} · ${e(s.role)} · ${e(s.claim_ids.join(', '))}</small><p>${e(s.text)}</p><small lang="en">Visual: ${e(s.visual)}</small></article>`).join('')}
<h2 lang="en">Claim ledger</h2>${brief.claims.map(c => `<article lang="en"><strong>${e(c.id)}</strong><p>${e(c.text)}</p><small>Sources: ${e(c.source_ids.join(', '))}<br>${e(c.review_note ?? '')}</small></article>`).join('')}
<h2 lang="en">Sources</h2><ul>${brief.sources.map(s => `<li lang="en"><a href="${e(s.url)}">${e(s.title)}</a><p>${e(s.locator)}</p></li>`).join('')}</ul>
<h2 lang="en">Pronunciation sample</h2><p>${e(brief.pronunciation_sample)}</p><p lang="en">Content fingerprint: <code>${fingerprint(brief)}</code></p></html>`;
}

export function assertApproved(brief, approval) {
  requireValue(approval?.brief_hash === fingerprint(brief) && approval?.reviewer?.trim(), 'Script approval is missing or stale. Review and approve this version.');
}
