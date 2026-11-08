import { ssml } from './workflow.js';

// Inject transport for offline tests. Never log provider bodies or credentials.
export async function synthesize(text, { key, region, voice, transport = fetch }) {
  if (!key || !/^[a-z0-9]+$/.test(region ?? '')) throw new Error('Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION locally.');
  const response = await transport(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
      'User-Agent': 'TamilHistoryStudio/0.1'
    },
    body: ssml(text, voice),
    signal: AbortSignal.timeout(60000),
    redirect: 'error'
  });
  if (!response.ok) throw new Error(`Speech service returned HTTP ${response.status}. No automatic retry was made.`);
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Speech service did not return WAV audio.');
  return audio;
}

export function wavDuration(audio) {
  if (audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid WAV header.');
  let byteRate, dataSize;
  for (let offset = 12; offset + 8 <= audio.length;) {
    const id = audio.toString('ascii', offset, offset + 4);
    const size = audio.readUInt32LE(offset + 4);
    if (offset + 8 + size > audio.length) throw new Error('Truncated WAV chunk.');
    if (id === 'fmt ' && size >= 16) byteRate = audio.readUInt32LE(offset + 16);
    if (id === 'data') dataSize = size;
    offset += 8 + size + (size % 2);
  }
  if (!byteRate || dataSize === undefined) throw new Error('WAV is missing format or audio data.');
  return dataSize / byteRate;
}

export function joinWav(clips) {
  if (!clips.length) throw new Error('No WAV clips to join.');
  let format;
  const chunks = [];
  for (const clip of clips) {
    wavDuration(clip);
    let clipFormat, clipData;
    for (let offset = 12; offset + 8 <= clip.length;) {
      const id = clip.toString('ascii', offset, offset + 4);
      const size = clip.readUInt32LE(offset + 4);
      if (id === 'fmt ') clipFormat = clip.subarray(offset + 8, offset + 8 + size);
      if (id === 'data') clipData = clip.subarray(offset + 8, offset + 8 + size);
      offset += 8 + size + (size % 2);
    }
    if (!clipFormat || clipFormat.readUInt16LE(0) !== 1 || !clipData) throw new Error('Only PCM WAV clips can be joined.');
    const coreFormat = clipFormat.subarray(0, 16);
    if (format && !format.equals(coreFormat)) throw new Error('Cannot join clips with different audio formats.');
    format = coreFormat;
    chunks.push(clipData);
  }
  const data = Buffer.concat(chunks);
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(data.length + 36, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); format.copy(header, 20);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
