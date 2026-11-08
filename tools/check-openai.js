import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { generateEpisode } from '../src/openai-generation.js';
import { openAIKey } from '../src/environment.js';

if (!process.argv.includes('--live')) throw new Error('Pass --live to run one billed OpenAI research-and-draft check.');
const controls = JSON.parse(await readFile('config/ai-controls.json', 'utf8'));
if (!controls.paid_generation_enabled) throw new Error('Paid AI generation is paused. Live checks are disabled.');
const dir = resolve('output/openai-check'); await mkdir(dir, { recursive: true });
const brief = JSON.parse(await readFile('episodes/rajendra-chola-01.json', 'utf8'));
brief.id = 'rajendra-ai-check';
const result = await generateEpisode({ brief, topic: 'Rajendra Chola I and the new capital Gangaikondacholapuram',
  model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini', key: openAIKey(),
  onProgress: message => process.stdout.write(message), onUsage: async usage => appendFile(join(dir, 'usage.jsonl'), JSON.stringify(usage) + '\n') });
await writeFile(join(dir, 'result.json'), JSON.stringify(result, null, 2));
console.log(`Live OpenAI check passed: ${result.brief.scenes.length} scenes, ${result.brief.sources.length} cited sources. Saved as an unapplied review proposal only.`);
