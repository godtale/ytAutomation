import { chromium } from 'playwright-core';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createDashboard } from '../src/dashboard-server.js';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const root = await mkdtemp(join(tmpdir(), 'yt-ai-ui-')); await mkdir(join(root, 'config'));
await writeFile(join(root, 'config/channel.json'), JSON.stringify({ narration: { provider: 'elevenlabs', model: 'eleven_v3' } }));
const fixture = JSON.parse(await readFile('episodes/rajendra-chola-01.json', 'utf8'));
const prior = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'offline-browser-test';
const app = await createDashboard({ root, port: 0, aiGenerator: async ({ brief, onProgress }) => {
  onProgress('Offline UI check: research and draft fixture loaded.');
  return { brief: { ...fixture, id: brief.id, editorial_status: 'ai_draft_for_review' }, review_notes: ['Offline UI fixture, not a live AI research result.'], research: { citations: fixture.sources } };
}});
const env = Object.fromEntries(Object.entries(process.env).filter(([n]) => /^(systemroot|windir|temp|tmp|path|localappdata|userprofile|programfiles|programfiles\(x86\))$/i.test(n)));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, env });
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 1100 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(app.url); await page.waitForSelector('#empty:not([hidden])');
  await page.locator('#new').click(); await page.locator('[name=title]').fill('Rajendra Chola'); await page.locator('[name=start]').selectOption('ai');
  await page.locator('#createForm button.primary').click(); await page.waitForSelector('#workspace:not([hidden])');
  assert.equal(await page.locator('[name=id]').inputValue(), '');
  assert.equal(await page.locator('#generateAi').isDisabled(), true);
  await page.locator('#aiCredits').check(); await page.locator('#generateAi').click();
  await page.waitForSelector('#reviewAi', { timeout: 20000 });
  assert.equal(await page.locator('.scene').count(), 0); // Proposal has not replaced the empty manual draft.
  await mkdir('output/dashboard', { recursive: true }); await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'output/dashboard/ai-proposal.png' });
  await page.locator('#reviewAi').click(); await page.waitForSelector('#aiReview[open]');
  assert.ok((await page.locator('#aiReviewBody').textContent()).includes('ASI'));
  await page.locator('#applyAi').click(); await page.waitForFunction(() => document.querySelectorAll('#editor .scene').length === 5);
  assert.equal(await page.locator('[data-path="title"]').inputValue(), fixture.title);
  await page.locator('[data-tab=research]').click(); assert.equal(await page.locator('.research-card').count(), 5);
  await page.locator('[data-tab=script]').click(); await page.locator('[data-path="title"]').fill('Manual editing still works');
  await page.locator('#save').click(); await page.waitForFunction(() => document.querySelector('#notice').textContent === 'Draft saved locally.');
  await page.locator('#toggleAiPaid').click();
  await page.waitForFunction(() => document.querySelector('#aiPaidState').textContent === 'Paid AI requests paused');
  await page.locator('#aiCredits').check();
  assert.equal(await page.locator('#generateAi').isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log('AI browser checks passed: topic-only creation, opt-in billing, proposal preview, source review, explicit apply, and manual editing. All responses mocked; no API calls.');
} finally {
  await browser.close(); await app.close(); if (prior === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prior;
  if (resolve(root).startsWith(resolve(tmpdir()) + '\\yt-ai-ui-') || resolve(root).startsWith(resolve(tmpdir()) + '/yt-ai-ui-')) await rm(root, { recursive: true });
}
