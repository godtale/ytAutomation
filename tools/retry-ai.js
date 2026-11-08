const id = process.argv[2];
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id ?? '')) throw new Error('Provide an episode ID.');
const base = 'http://127.0.0.1:4317';
const boot = await (await fetch(base + '/api/bootstrap')).json();
const path = `/api/episodes/${id}`;
const state = await (await fetch(base + path)).json();
if (!state.brief) throw new Error('Episode not found.');
const response = await fetch(base + path + '/action', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Local-Token': boot.token },
  body: JSON.stringify({ action: 'generate', revision: state.revision, topic: state.brief.title, angle: '', allowPaid: true })
});
const queued = await response.json(); if (!response.ok) throw new Error(queued.error);
console.log(`Generation job ${queued.id} started for ${id}.`);
let log = '';
for (let i = 0; i < 180; i++) {
  const fresh = await (await fetch(base + path)).json();
  if (fresh.job?.id !== queued.id) throw new Error('Another job replaced this run.');
  if (fresh.job.log !== log) { process.stdout.write(fresh.job.log.slice(log.length)); log = fresh.job.log; }
  if (fresh.job.status === 'failed') throw new Error(fresh.job.error);
  if (fresh.job.status === 'completed') {
    console.log(`Ready for review: ${fresh.job.result.brief.scenes.length} scenes; IDs ${fresh.job.result.brief.scenes.map(s => s.id).join(', ')}. Existing episode has not been replaced.`); process.exit(0);
  }
  await new Promise(done => setTimeout(done, 2000));
}
throw new Error('Timed out waiting. Check the dashboard run log.');
