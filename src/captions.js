export async function alignNarration(audio, text, { key, transport = fetch }) {
  if (!key) throw new Error('Elevenlabs_Api_Key is not available in the process environment.');
  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/wav' }), 'narration.wav');
  form.append('text', text);
  const response = await transport('https://api.elevenlabs.io/v1/forced-alignment', {
    method: 'POST', headers: { 'xi-api-key': key }, body: form,
    signal: AbortSignal.timeout(60000), redirect: 'error'
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    // Expose only a machine-readable status, never the raw response or credentials.
    const code = typeof error.detail?.status === 'string' && /^[a-z_]{1,64}$/.test(error.detail.status) ? ` (${error.detail.status})` : '';
    throw new Error(`ElevenLabs alignment returned HTTP ${response.status}${code}. No retry was made.`);
  }
  return response.json();
}

export function captionCues(words, scenes, durations) {
  if (!Array.isArray(words) || !words.length) throw new Error('Alignment has no words.');
  const total = durations.reduce((sum, d) => sum + d, 0);
  let previousEnd = 0;
  for (const word of words) {
    if (typeof word.text !== 'string' || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < previousEnd - 0.05 || word.end <= word.start || word.end > total + 0.1) throw new Error('Invalid or unordered word alignment.');
    previousEnd = word.end;
  }
  const normalize = text => text.normalize('NFC').replace(/\s/g, '');
  if (normalize(words.map(w => w.text).join(' ')) !== normalize(scenes.map(s => s.text).join(' '))) throw new Error('Aligned transcript differs from the script.');
  const cues = [];
  let sceneStart = 0;
  for (let i = 0; i < scenes.length; i++) {
    const sceneEnd = sceneStart + durations[i];
    const selected = words.filter(w => (w.start + w.end) / 2 >= sceneStart && (w.start + w.end) / 2 < sceneEnd);
    let group = [];
    const flush = () => {
      if (!group.length) return;
      cues.push({ scene: i, start: Math.max(sceneStart, group[0].start), end: Math.min(sceneEnd, group.at(-1).end), text: group.map(w => w.text).join(' ') });
      group = [];
    };
    for (const word of selected) {
      if (group.length && (group.length >= 6 || [...group.map(w => w.text).join(' ') + ' ' + word.text].length > 70 || word.end - group[0].start > 3.8)) flush();
      group.push(word);
      if (/[.!?]$/.test(word.text)) flush();
    }
    flush(); sceneStart = sceneEnd;
  }
  if (normalize(cues.map(c => c.text).join(' ')) !== normalize(scenes.map(s => s.text).join(' '))) throw new Error('Some words fall outside scene boundaries.');
  return cues;
}

function stamp(seconds) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}
export const toSrt = cues => cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n');

export function approximateWords(scenes, durations) {
  let offset = 0;
  return scenes.flatMap((scene, index) => {
    const words = scene.text.trim().split(/\s+/);
    const weights = words.map(word => Math.max(1, [...word].length) + (/[.!?]$/.test(word) ? 5 : 0));
    const sum = weights.reduce((a, b) => a + b, 0);
    const duration = durations[index];
    let position = offset + 0.12;
    const result = words.map((text, i) => {
      const end = position + (duration - 0.24) * weights[i] / sum;
      const word = { text, start: position, end }; position = end; return word;
    });
    offset += duration; return result;
  });
}
