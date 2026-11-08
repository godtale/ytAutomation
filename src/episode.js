import { join } from 'node:path';
import { fingerprint } from './workflow.js';

export { TEMPLATES, validateLayout } from './layout.js';
export function dimensions(format) {
  if (format === 'short') return { width: 1080, height: 1920 };
  if (format === 'long') return { width: 1920, height: 1080 };
  throw new Error('Format must be short or long.');
}
export function audioDirectory(root, brief, channel, voiceOverride) {
  const provider = channel.narration?.provider ?? 'elevenlabs';
  const model = provider === 'elevenlabs' ? channel.narration?.model ?? 'eleven_v3' : 'azure-neural';
  const voice = voiceOverride ?? brief.narration?.voice_id ?? channel.narration?.pilot_voices?.[brief.id]?.voice_id ?? process.env.ELEVENLABS_VOICE_ID;
  if (!['elevenlabs', 'azure'].includes(provider) || !/^[a-zA-Z0-9_-]{1,128}$/.test(model) || !/^[a-zA-Z0-9_-]{1,128}$/.test(voice ?? '')) throw new Error('Set narration.voice_id in the episode or ELEVENLABS_VOICE_ID in the environment.');
  return join(root, 'output', brief.id, fingerprint(brief), provider, model, voice);
}
