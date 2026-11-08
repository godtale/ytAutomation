const $ = s => document.querySelector(s);
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let bootstrap, selected, current, dirty = false, tab = 'script', voices = [], previewKey = '', aiResultKey = '', generationSubmitting = false;
async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Local-Token': bootstrap.token }, body: JSON.stringify(data) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error ?? 'Request failed.'); return result;
}
function notice(text = '', error = false) { $('#notice').textContent = text; $('#notice').classList.toggle('error', error); }
function field(label, path, value, type = 'input', extras = '') {
  const data = `data-path="${path}" ${extras}`;
  const control = type === 'textarea' ? `<textarea ${data}>${e(value)}</textarea>` : `<input ${data} value="${e(value)}" ${type === 'number' ? 'type="number"' : ''}>`;
  return `<label>${e(label)}${control}</label>`;
}
function markDirty() { dirty = true; $('#saved').textContent = 'Unsaved changes'; updateActions(); }
function getBrief() {
  if (tab === 'json') { const parsed = JSON.parse($('#json').value); if (parsed.id !== selected) throw new Error('Episode ID cannot change. Create a new episode instead.'); current.brief = parsed; }
  return current.brief;
}
async function list() {
  const episodes = await api('/api/episodes');
  $('#episodes').innerHTML = episodes.map(ep => `<button class="episode ${ep.id === selected ? 'active' : ''}" data-episode="${e(ep.id)}"><strong>${e(ep.title)}</strong><small>${ep.format === 'long' ? 'LONG FILM' : 'SHORT'} · ${ep.video ? 'VIDEO READY' : ep.audio ? 'NARRATED' : ep.approved ? 'APPROVED' : 'DRAFT'}</small></button>`).join('');
  return episodes;
}
async function choose(id) {
  if (dirty) throw new Error('Save your changes before switching episodes.');
  current = await api(`/api/episodes/${id}`); selected = id; tab = 'script'; previewKey = '';
  notice();
  $('#aiTopic').value = current.brief.title; $('#aiAngle').value = ''; $('#aiCredits').checked = false; aiResultKey = '';
  $('#empty').hidden = true; $('#workspace').hidden = false;
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('selected', b.dataset.tab === tab));
  renderEditor(); renderState(); await list();
}
function renderEditor() {
  const b = current.brief;
  $('#episodeTitle').textContent = b.title; $('#formatBadge').textContent = `${b.format === 'long' ? 'LANDSCAPE FILM' : 'VERTICAL SHORT'} / ${b.id}`;
  $('#saved').textContent = dirty ? 'Unsaved changes' : 'Saved locally';
  if (tab === 'json') { $('#editor').innerHTML = `<div class="editor-content"><p class="fine">Advanced episode editing. Credentials belong in your environment.</p><label>Episode JSON<textarea id="json" class="json-editor">${e(JSON.stringify(b, null, 2))}</textarea></label></div>`; return; }
  if (tab === 'research') {
    const sources = (b.sources ?? []).map((s, i) => `<div class="research-card"><div class="scene-head">SOURCE ${i + 1}<button class="small-btn" data-remove="sources" data-index="${i}">Remove</button></div><div class="fields">${field('Source ID', `sources.${i}.id`, s.id)}${field('Title / institution', `sources.${i}.title`, s.title)}</div>${field('Source URL', `sources.${i}.url`, s.url)}${field('Passage / page / section', `sources.${i}.locator`, s.locator)}${field('Research notes', `sources.${i}.notes`, s.notes, 'textarea')}</div>`).join('');
    const claims = (b.claims ?? []).map((c, i) => `<div class="research-card"><div class="scene-head">CLAIM ${i + 1}<button class="small-btn" data-remove="claims" data-index="${i}">Remove</button></div>${field('Claim ID', `claims.${i}.id`, c.id)}${field('Verified claim', `claims.${i}.text`, c.text, 'textarea')}${field('Supporting source IDs · comma separated', `claims.${i}.source_ids`, (c.source_ids ?? []).join(', '), 'input', 'data-kind="csv"')}${field('Review notes', `claims.${i}.review_note`, c.review_note, 'textarea')}</div>`).join('');
    $('#editor').innerHTML = `<div class="editor-content"><p class="fine">Link each narration scene to claims, and each claim to identifiable source passages.</p><div class="section-heading"><h3>Sources</h3><button class="small-btn" data-add="sources">＋ Add source</button></div>${sources}<div class="section-heading"><h3>Claim ledger</h3><button class="small-btn" data-add="claims">＋ Add claim</button></div>${claims}</div>`; return;
  }
  const voice = b.narration?.voice_id ?? '';
  const voiceSelect = voices.length ? `<label>Narration voice<select data-path="narration.voice_id"><option value="">Select a voice</option>${voices.some(v => v.voice_id === voice) ? '' : voice ? `<option value="${e(voice)}">${e(voice)}</option>` : ''}${voices.map(v => `<option value="${e(v.voice_id)}" ${v.voice_id === voice ? 'selected' : ''}>${e(v.name)}</option>`).join('')}</select></label>` : field('ElevenLabs voice ID', 'narration.voice_id', voice);
  const scenes = (b.scenes ?? []).map((s, i) => `<article class="scene"><div class="scene-head">SCENE ${String(i + 1).padStart(2, '0')} · ${e(s.id)}<div class="tools"><button data-move="-1" data-index="${i}" aria-label="Move scene up">↑</button><button data-move="1" data-index="${i}" aria-label="Move scene down">↓</button><button data-remove="scenes" data-index="${i}">Remove</button></div></div><div class="fields">${field('Scene ID', `scenes.${i}.id`, s.id)}${field('Role', `scenes.${i}.role`, s.role)}</div>${field('Tamil narration', `scenes.${i}.text`, s.text, 'textarea')}${field('Supporting claim IDs · comma separated', `scenes.${i}.claim_ids`, (s.claim_ids ?? []).join(', '), 'input', 'data-kind="csv"')}${s.layout ? `<div class="fields"><label>Visual template<select data-path="scenes.${i}.layout.template">${bootstrap.templates.map(t => `<option ${s.layout.template === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>${field('On-screen title', `scenes.${i}.layout.title`, s.layout.title)}</div>${field('Subtitle', `scenes.${i}.layout.subtitle`, s.layout.subtitle)}${field('Visual labels · one per line, up to four', `scenes.${i}.layout.items`, s.layout.items.join('\n'), 'textarea', 'data-kind="lines"')}` : '<p class="fine">This scene uses the original pilot artwork. Use Episode JSON to add a reusable layout.</p>'}${field('Visual direction / accuracy notes', `scenes.${i}.visual`, s.visual, 'textarea')}</article>`).join('');
  $('#editor').innerHTML = `<div class="editor-content"><div class="fields"><label class="full">Tamil title<input data-path="title" value="${e(b.title)}"></label><label>Format<select data-path="format"><option value="short" ${b.format === 'short' ? 'selected' : ''}>Short · vertical</option><option value="long" ${b.format === 'long' ? 'selected' : ''}>Long film · landscape</option></select></label>${field('Target duration · seconds', 'target_seconds', b.target_seconds, 'number')}${field('Series name', 'series', b.series ?? 'தமிழ் வரலாறு')}${field('On-screen source credit', 'source_credit', b.source_credit ?? '')}</div>${voiceSelect}<button id="loadVoices" class="small-btn">Load Tamil voices from ElevenLabs</button><p class="fine">Reading the voice list does not generate speech.</p>${field('Pronunciation sample', 'pronunciation_sample', b.pronunciation_sample, 'textarea')}<div class="section-heading"><h3>Story scenes</h3><button class="small-btn" data-add="scenes">＋ Add scene</button></div>${scenes}</div>`;
}
function updateActions() {
  const running = ['running', 'queued'].includes(current?.job?.status);
  $('#save').disabled = running;
  $('#generateAi').disabled = generationSubmitting || !bootstrap.aiPaidEnabled || running || dirty || !bootstrap.openaiKeyConfigured || !$('#aiCredits').checked || $('#aiTopic').value.trim().length < 3;
  $('#retryAi').disabled = $('#generateAi').disabled;
  $('#retrySlot').hidden = !(current?.job?.action === 'generate' && ['failed', 'interrupted', 'cancelled'].includes(current.job.status));
  $('#aiPaidState').textContent = bootstrap.aiPaidEnabled ? 'Paid AI requests enabled' : 'Paid AI requests paused';
  $('#toggleAiPaid').textContent = bootstrap.aiPaidEnabled ? 'Pause AI requests' : 'Enable paid AI requests';
  document.querySelectorAll('[data-action]').forEach(b => {
    b.disabled = running || dirty || !current?.valid || (['sample', 'narrate'].includes(b.dataset.action) && !$('#credits').checked) || (b.dataset.action === 'narrate' && !current.approved) || (b.dataset.action === 'render' && !current.audio);
  });
}
function renderState() {
  if (!current) return;
  const running = ['running', 'queued'].includes(current.job?.status);
  const resultJob = current.job?.action === 'generate' && current.job.status === 'completed' && current.job.result ? current.job : null;
  const resultKey = resultJob ? `${resultJob.id}:${resultJob.applied ?? false}` : '';
  if (resultKey !== aiResultKey || (!resultKey && $('#aiResult').textContent)) {
    aiResultKey = resultKey;
    $('#aiResult').innerHTML = resultJob ? `<div class="ai-ready"><strong>${resultJob.applied ? 'AI draft applied — ready for your edits' : 'Draft ready for review'}</strong><p>${resultJob.result.brief.scenes.length} scenes · ${resultJob.result.brief.claims.length} claims · ${resultJob.result.brief.sources.length} cited sources</p><button id="reviewAi">Review script & sources</button></div>` : '';
  }
  $('#stages').innerHTML = [[current.valid, 'Research & script complete'], [current.approved, 'Script approved'], [current.audio, 'Narration generated'], [current.video, 'Video rendered']].map(([done, text]) => `<li class="${done ? 'done' : ''}"><i>${done ? '✓' : '·'}</i>${text}</li>`).join('');
  $('#validation').textContent = dirty ? 'Save the current draft to validate and run production.' : current.validationError ?? (current.timing ? `Narration: ${current.timing.total_seconds.toFixed(1)} seconds · target ${current.brief.target_seconds}s` : 'Ready to prepare the script.');
  $('#jobStatus').textContent = current.job ? `${current.job.action} · ${current.job.status}` : 'No active run';
  $('#log').textContent = current.job ? (current.job.log || 'Waiting for production output…') + (current.job.error ? '\n' + current.job.error : '') : 'Your production updates will appear here.';
  $('#saved').textContent = dirty ? 'Unsaved changes' : running ? 'Production in progress · saved version' : 'Saved locally';
  const key = `${selected}:${current.revision}:${current.audio}:${current.sample}:${current.video}:${current.poster}`;
  if (key !== previewKey) {
    previewKey = key; const base = `/api/episodes/${selected}/media/`; const version = `?v=${current.revision}`;
    $('#previewTag').textContent = current.video ? `${current.brief.format === 'long' ? '16:9' : '9:16'} · MP4` : 'LOCAL PREVIEW';
    $('#preview').innerHTML = current.video ? `<video controls preload="metadata" ${current.poster ? `poster="${base}poster${version}"` : ''} src="${base}video${version}"></video>` : `<div class="preview-empty"><div><b>வரலாற்றின் சுவடுகள்</b><br>Your story takes shape here.<br><small>Prepare, narrate, then render.</small></div></div>`;
    $('#audio').innerHTML = `${current.sample ? `<div class="audio-label">Voice sample</div><audio controls preload="none" src="${base}sample${version}"></audio>` : ''}${current.audio ? `<div class="audio-label">Full narration</div><audio controls preload="none" src="${base}audio${version}"></audio>` : ''}`;
    $('#downloads').innerHTML = current.video ? `<a href="${base}video${version}" download="${e(selected)}.mp4">Download video</a><a href="${base}captions${version}" download>Captions</a><a href="${base}sources${version}" target="_blank" rel="noopener">Sources</a>` : '';
  }
  updateActions();
}
async function save() {
  const brief = getBrief(); current = await api(`/api/episodes/${selected}`, { revision: current.revision, brief }); dirty = false;
  renderEditor(); renderState(); await list(); notice('Draft saved locally.');
}
$('#editor').addEventListener('input', event => {
  if (event.target.id === 'json') { markDirty(); return; }
  const path = event.target.dataset.path; if (!path) return;
  let value = event.target.value;
  if (event.target.type === 'number') value = Number(value);
  if (event.target.dataset.kind === 'csv') value = value.split(',').map(x => x.trim()).filter(Boolean);
  if (event.target.dataset.kind === 'lines') value = value.split('\n').map(x => x.trim()).filter(Boolean);
  const parts = path.split('.'); let obj = current.brief;
  for (const part of parts.slice(0, -1)) obj = obj[part] ??= {};
  obj[parts.at(-1)] = value;
  if (path === 'format') current.brief.target_seconds = value === 'long' ? 600 : 45;
  markDirty();
});
$('#editor').addEventListener('click', async event => {
  const b = event.target.closest('button'); if (!b) return;
  try {
    if (b.id === 'loadVoices') { b.disabled = true; const data = await api('/api/voices', {}); voices = data.voices; renderEditor(); notice(`Loaded ${voices.length} Tamil voices.`); return; }
    if (b.dataset.add) {
      const key = b.dataset.add; const items = current.brief[key] ??= []; let n = items.length + 1;
      if (key === 'sources') { while (items.some(x => x.id === `S${n}`)) n++; items.push({ id: `S${n}`, title: '', url: '', locator: '', notes: '' }); }
      if (key === 'claims') { while (items.some(x => x.id === `C${n}`)) n++; items.push({ id: `C${n}`, text: '', source_ids: [], review_note: '' }); }
      if (key === 'scenes') { while (items.some(x => x.id === `s${String(n).padStart(2, '0')}`)) n++; items.push({ id: `s${String(n).padStart(2, '0')}`, role: 'evidence', text: '', claim_ids: [], visual: 'Original explanatory diagram', layout: { template: 'evidence', title: '', items: [''] } }); }
      markDirty(); renderEditor();
    }
    if (b.dataset.remove) { current.brief[b.dataset.remove].splice(Number(b.dataset.index), 1); markDirty(); renderEditor(); }
    if (b.dataset.move) { const i = Number(b.dataset.index), j = i + Number(b.dataset.move); if (j >= 0 && j < current.brief.scenes.length) { [current.brief.scenes[i], current.brief.scenes[j]] = [current.brief.scenes[j], current.brief.scenes[i]]; markDirty(); renderEditor(); } }
  } catch (error) { notice(error.message, true); b.disabled = false; }
});
document.addEventListener('click', async event => {
  const b = event.target.closest('button'); if (!b) return;
  try {
    if (b.dataset.episode) await choose(b.dataset.episode);
    if (b.dataset.tab) { getBrief(); tab = b.dataset.tab; document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('selected', x === b)); renderEditor(); }
    if (b.dataset.action) { current.job = await api(`/api/episodes/${selected}/action`, { action: b.dataset.action, revision: current.revision, allowPaid: $('#credits').checked }); $('#credits').checked = false; renderState(); notice(`${b.dataset.action} added to the production queue.`); }
  } catch (error) { notice(error.message, true); }
});
$('#credits').addEventListener('change', updateActions);
$('#aiCredits').addEventListener('change', updateActions);
$('#aiTopic').addEventListener('input', updateActions);
async function requestGeneration(explicitRetry = false) {
  if (generationSubmitting) return;
  const allowPaid = $('#aiCredits').checked;
  generationSubmitting = true; $('#aiCredits').checked = false; updateActions();
  try {
    current.job = await api(`/api/episodes/${selected}/action`, { action: 'generate', revision: current.revision, allowPaid, explicitRetry, topic: $('#aiTopic').value, angle: $('#aiAngle').value });
    $('#aiCredits').checked = false; renderState(); notice(current.job.deduplicated ? 'Existing run reused. No new API request was sent.' : 'AI research started. Your saved episode stays unchanged while the proposal is generated.');
  } catch (error) { notice(error.message, true); }
  finally { generationSubmitting = false; updateActions(); }
}
$('#generateAi').addEventListener('click', () => requestGeneration(false));
$('#retryAi').addEventListener('click', () => requestGeneration(true));
$('#toggleAiPaid').addEventListener('click', async () => {
  try {
    const data = await api('/api/ai-controls', { enabled: !bootstrap.aiPaidEnabled });
    bootstrap.aiPaidEnabled = data.enabled; $('#aiCredits').checked = false; updateActions();
    notice(data.enabled ? 'Paid requests enabled. Starting a run still requires explicit opt-in.' : 'AI requests paused. Queued AI work is cancelled; an already-sent request may still be billed.');
  } catch (error) { notice(error.message, true); }
});
$('#aiResult').addEventListener('click', event => {
  if (event.target.id !== 'reviewAi') return;
  const result = current.job.result, b = result.brief;
  $('#aiReviewBody').innerHTML = `<p class="fine">AI-generated draft. Source citation does not establish that every claim is correct; review the passages before production.</p><h2>${e(b.title)}</h2><h3>Review notes</h3><ul>${(result.review_notes ?? []).map(note => `<li>${e(note)}</li>`).join('')}</ul><h3>Sources</h3><ul>${b.sources.map(s => `<li><a href="${e(s.url)}" target="_blank" rel="noopener noreferrer">${e(s.id)} · ${e(s.title)}</a><p>${e(s.locator)}</p></li>`).join('')}</ul><h3>Tamil script & scenes</h3>${b.scenes.map(s => `<article class="scene"><strong>${e(s.layout.title)} · ${e(s.layout.template)}</strong><p>${e(s.text)}</p><p class="fine">Claims: ${e(s.claim_ids.join(', '))} · Visual labels: ${e(s.layout.items.join(' · '))}</p></article>`).join('')}<h3>Claim ledger</h3>${b.claims.map(c => `<p><b>${e(c.id)}</b> ${e(c.text)} <small>Sources: ${e(c.source_ids.join(', '))}</small></p>`).join('')}`;
  $('#applyAi').disabled = dirty || current.job.applied || current.job.revision !== current.revision;
  $('#aiReview').showModal();
});
$('#closeAiReview').addEventListener('click', () => $('#aiReview').close());
$('#applyAi').addEventListener('click', async () => {
  try {
    current = await api(`/api/episodes/${selected}/apply-ai`, { revision: current.revision, jobId: current.job.id }); dirty = false; tab = 'script'; previewKey = '';
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('selected', b.dataset.tab === tab));
    $('#aiReview').close(); renderEditor(); renderState(); await list(); notice('Generated draft applied. All fields remain editable. Review sources and prepare this new version before narration.');
  } catch (error) { notice(error.message, true); }
});
$('#save').addEventListener('click', () => save().catch(error => notice(error.message, true)));
$('#new').addEventListener('click', () => { if (dirty) return notice('Save your current changes first.', true); $('#createDialog').showModal(); });
$('#cancelCreate').addEventListener('click', () => $('#createDialog').close());
$('#createForm').addEventListener('submit', async event => {
  event.preventDefault(); const data = new FormData(event.target); const id = data.get('id') || `episode-${Date.now().toString(36)}`;
  const brief = { schema_version: 1, id, title: data.get('title'), series: 'தமிழ் வரலாறு', language: 'ta-IN', format: data.get('format'), target_seconds: data.get('format') === 'long' ? 600 : 45,
    editorial_status: 'draft', sources: [], claims: [], glossary: [], pronunciation_sample: '', scenes: [], narration: {} };
  try { await api('/api/episodes', brief); $('#createDialog').close(); const useAI = data.get('start') === 'ai'; event.target.reset(); await choose(id); $('#aiPanel').open = useAI; notice(useAI ? 'Topic ready. Enable OpenAI usage and select Research & generate draft.' : 'New draft created. Add your sources, claims, and scenes to begin.'); } catch (error) { notice(error.message, true); }
});
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
async function start() {
  document.querySelector('.ai-content').append($('#retrySlot'));
  bootstrap = await api('/api/bootstrap'); $('#connection').textContent = bootstrap.keyConfigured ? '● ElevenLabs key available' : '● ElevenLabs key not available'; $('#connection').classList.toggle('warn', !bootstrap.keyConfigured);
  $('#aiConnection').textContent = `${bootstrap.openaiKeyConfigured ? 'Key available' : 'Set OPENAI_API_KEY'} · ${bootstrap.openaiModel}`;
  const episodes = await list(); const first = episodes.find(x => x.id === 'rajendra-chola-01') ?? episodes.find(x => x.video) ?? episodes[0];
  if (first) await choose(first.id); else $('#empty').hidden = false;
  setInterval(async () => {
    if (!selected) return;
    try { const fresh = await api(`/api/episodes/${selected}`); if (fresh.revision !== current.revision) { notice('This episode changed in another editor. Reload to see the latest version.', true); return; }
      const finished = current.job?.status !== fresh.job?.status;
      current = { ...fresh, brief: current.brief }; renderState(); if (finished) await list();
    } catch (error) { notice(error.message, true); }
  }, 2000);
}
start().catch(error => notice(error.message, true));
