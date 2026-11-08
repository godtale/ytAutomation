// Explicit one-off requested by the user: reuse research, permit at most one
// draft request. Does not change the dashboard's persistent AI pause setting.
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { generateEpisode } from '../src/openai-generation.js';
import { generationKey } from '../src/ai-cost-control.js';
import { fingerprint } from '../src/workflow.js';
import { openAIKey } from '../src/environment.js';

const root = resolve('.');
const brief = JSON.parse(await readFile('episodes/kadaram-kondan-01.json', 'utf8'));
const research = JSON.parse(await readFile('output/dashboard-jobs/66668072-e46e-4cdd-8952-704e12b05a0d/research-response.json', 'utf8'));
const aiOptions = { topic: 'kadaram kondan', angle: '', model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini' };
const job = { id: randomUUID(), episodeId: brief.id, revision: fingerprint(brief), action: 'generate', aiOptions,
  requestKey: generationKey(brief, aiOptions), status: 'running', log: 'Reusing saved research. One draft-only request authorized; no automatic retries.\n', startedAt: new Date().toISOString() };
const locks = join(root, 'output/ai-oneoffs'); await mkdir(locks, { recursive: true });
const lock = join(locks, 'kadaram-draft.json');
await writeFile(lock, JSON.stringify({ jobId: job.id, state: 'started', maxRequests: 1 }), { flag: 'wx' });
const dir = join(root, 'output/dashboard-jobs', job.id); await mkdir(dir, { recursive: true });
await writeFile(join(dir, 'brief.json'), JSON.stringify(brief, null, 2));
const persist = () => writeFile(join(dir, 'job.json'), JSON.stringify(job, null, 2));
await persist();
let requests = 0;
try {
  const result = await generateEpisode({ brief, ...aiOptions, key: openAIKey(), resume: { research },
    transport: async (...args) => { if (++requests > 1) throw new Error('One-request limit reached.'); return fetch(...args); },
    onProgress: text => { job.log += text; process.stdout.write(text); },
    onUsage: async event => {
      if (event.stage !== 'draft') throw new Error('Only drafting is authorized. Research must come from cache.');
      await appendFile(join(dir, 'openai-usage.jsonl'), JSON.stringify(event) + '\n');
    },
    onCheckpoint: async (stage, response) => writeFile(join(dir, `${stage}-response.json`), JSON.stringify(response, null, 2))
  });
  job.result = result; job.status = 'completed';
  await writeFile(join(dir, 'generated-draft.json'), JSON.stringify(result, null, 2));
  console.log(`SUCCESS: ${result.brief.scenes.length} scenes, ${result.brief.sources.length} sources. New API requests: ${requests}. Saved for dashboard review; not applied or narrated.`);
} catch (error) { job.status = 'failed'; job.error = error.message; console.error(`Stopped without retry: ${error.message}`); process.exitCode = 1; }
finally {
  job.finishedAt = new Date().toISOString(); await persist();
  await writeFile(lock, JSON.stringify({ jobId: job.id, state: job.status, requests }));
}
