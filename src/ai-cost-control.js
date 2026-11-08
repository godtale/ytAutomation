import { createHash } from 'node:crypto';
export function generationKey(brief, options) {
  const normalized = { episode: brief.id, format: brief.format, seconds: brief.target_seconds,
    topic: options.topic.trim().replace(/\s+/g, ' ').toLowerCase(), angle: (options.angle ?? '').trim(), model: options.model };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
