// ElevenLabs returns raw signed 16-bit little-endian mono PCM for pcm_24000.
// Wrap it in WAV so timing and downstream media assembly need no extra packages.
export async function listElevenLabsVoices({ key, transport = fetch }) {
  if (!key) throw new Error('Elevenlabs_Api_Key is not available in the process environment.');
  const response = await transport('https://api.elevenlabs.io/v2/voices?page_size=100', {
    headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(30000), redirect: 'error'
  });
  if (!response.ok) throw new Error(`ElevenLabs voice listing returned HTTP ${response.status}. Check Voices read access on the API key.`);
  const data = await response.json();
  return { has_more: Boolean(data.has_more), voices: (data.voices ?? []).map(v => ({
    voice_id: v.voice_id, name: v.name, category: v.category, labels: v.labels,
    description: v.description?.slice(0, 600),
    verified_languages: [...new Set((v.verified_languages ?? []).map(l => l.language))]
  })) };
}

export function pcmToWav(pcm) {
  if (!pcm.length || pcm.length % 2 !== 0 || pcm.length > 0xffffffff - 36) throw new Error('Invalid 16-bit PCM audio.');
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function synthesizeElevenLabs(text, { key, voice, model = 'eleven_v3', transport = fetch }) {
  if (!key) throw new Error('Set Elevenlabs_Api_Key in the process environment (ELEVENLABS_API_KEY is also supported).');
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(voice ?? '')) throw new Error('Set ELEVENLABS_VOICE_ID to a voice ID from your ElevenLabs library.');
  if (!['eleven_v3', 'eleven_flash_v2_5'].includes(model)) throw new Error('Supported Tamil models: eleven_v3, eleven_flash_v2_5.');
  if (!text?.trim()) throw new Error('Narration text is empty.');
  const response = await transport(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=pcm_24000`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/pcm' },
    body: JSON.stringify({ text, model_id: model, language_code: 'ta' }),
    signal: AbortSignal.timeout(60000),
    redirect: 'error'
  });
  if (!response.ok) throw new Error(`ElevenLabs returned HTTP ${response.status}. Check key permissions, voice access, and credits. No automatic retry was made.`);
  const type = response.headers?.get('content-type') ?? '';
  if (/json|text|html/i.test(type)) throw new Error('ElevenLabs returned a non-audio response.');
  return pcmToWav(Buffer.from(await response.arrayBuffer()));
}
