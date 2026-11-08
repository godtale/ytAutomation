import { chromium } from 'playwright-core';
import { mkdir, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve('.');
const browserEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(systemroot|windir|temp|tmp|path|localappdata|userprofile|programfiles|programfiles\(x86\))$/i.test(name)));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, env: browserEnv });
const id = `studio-check-${Date.now()}`;
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 1100 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4317');
  await page.waitForSelector('#workspace:not([hidden])');
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1);
  assert.ok(Math.abs(await page.locator('video').evaluate(v => v.duration) - 52.56) < 0.2);
  assert.equal(await page.locator('[data-action="sample"]').isDisabled(), true);
  await page.locator('#credits').check();
  assert.equal(await page.locator('[data-action="sample"]').isDisabled(), false);
  await page.locator('#credits').uncheck();
  await page.evaluate(() => scrollTo(0, 0));
  await mkdir(join(root, 'output/dashboard'), { recursive: true });
  await page.screenshot({ path: join(root, 'output/dashboard/studio-desktop.png'), fullPage: false });
  const existing = await page.evaluate(async () => (await fetch('/api/episodes/rajendra-chola-01')).json());
  await page.locator('#new').click();
  await page.locator('[name=id]').fill(id); await page.locator('[name=title]').fill('சோதனை வரைவு');
  await page.locator('#createForm button.primary').click();
  await page.waitForFunction(id => document.querySelector('#formatBadge').textContent.includes(id), id);
  await page.locator('[data-tab=json]').click();
  await page.locator('#json').fill(JSON.stringify({ ...existing.brief, id, title: 'சோதனை வரைவு' }, null, 2));
  await page.locator('#save').click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent === 'Draft saved locally.');
  await page.locator('[data-tab=script]').click();
  await page.locator('[data-path="scenes.0.layout.title"]').fill('புதிய காட்சித் தலைப்பு');
  assert.equal(await page.locator('[data-action=prepare]').isDisabled(), true);
  await page.locator('#save').click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent === 'Draft saved locally.');
  await page.locator('[data-action=prepare]').click();
  await page.waitForFunction(() => document.querySelector('#jobStatus').textContent === 'prepare · completed', null, { timeout: 20000 });
  await page.locator('[data-action=approve]').click();
  await page.waitForFunction(() => document.querySelector('#jobStatus').textContent === 'approve · completed', null, { timeout: 20000 });
  await page.locator('[data-tab=research]').click();
  assert.equal(await page.locator('[data-path="sources.0.url"]').inputValue(), existing.brief.sources[0].url);
  await page.locator('[data-episode=rajendra-chola-01]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(root, 'output/dashboard/studio-mobile.png'), fullPage: false });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: existing video playback, explicit credits gate, create/edit/save, dirty-state gating, source fields, prepare/approve jobs, and mobile layout. No paid API calls.');
} finally {
  await browser.close();
  // Remove only the test draft just created. Production episode files are untouched.
  await unlink(join(root, 'episodes', `${id}.json`)).catch(() => {});
}
