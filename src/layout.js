export const TEMPLATES = ['title', 'event', 'evidence', 'timeline', 'comparison', 'conclusion'];
export function validateLayout(layout) {
  if (!layout || !TEMPLATES.includes(layout.template)) throw new Error(`Choose a visual template: ${TEMPLATES.join(', ')}`);
  if (typeof layout.title !== 'string' || !layout.title.trim()) throw new Error('Each layout needs a Tamil title.');
  if (!Array.isArray(layout.items) || layout.items.length < 1 || layout.items.length > 4 || layout.items.some(x => typeof x !== 'string' || !x.trim() || [...x].length > 100)) throw new Error('Layout items must contain 1–4 nonempty labels of at most 100 characters.');
  if (layout.subtitle !== undefined && typeof layout.subtitle !== 'string') throw new Error('Layout subtitle must be text.');
}
