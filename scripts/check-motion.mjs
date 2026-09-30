// Production browser smoke test. Run npm run build and npm run preview first.
// AWAKEN_PLAYWRIGHT may point to an external Playwright package directory.
// Exercise sequences and complete combat flows are covered by npm test.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { chromium } = createRequire(import.meta.url)(process.env.AWAKEN_PLAYWRIGHT || 'playwright');
const base = process.env.AWAKEN_URL || 'http://127.0.0.1:4173/';
const output = process.env.AWAKEN_QA_OUTPUT || join(tmpdir(), 'awaken-production-qa');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const errors = [], diagnostics = [], failedResources = [];
function observe(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) diagnostics.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) failedResources.push(`${response.status()} ${response.url()}`);
  });
}
const sizes = [[1920, 1080], [1366, 768], [1440, 900], [1280, 720]];
async function checkLayout(page, name) {
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: horizontal overflow`);
    for (const selector of ['.combatants', '.camera-panel', '.system-footer']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= height, `${name}: ${selector} outside ${width}x${height}`);
    }
    await page.screenshot({ path: join(output, `${name}-${width}x${height}.png`), fullPage: true });
  }
}
try {
  const context = await browser.newContext({ permissions: ['camera'] });
  const page = await context.newPage(); observe(page);
  await page.goto(base);
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await page.getByRole('button', { name: 'Stop camera' }).waitFor({ timeout: 45000 });
  for (const name of ['JUMPING JACK', 'PUSH-UP', 'SQUAT']) {
    await page.getByRole('button', { name, exact: true }).click();
  }
  await page.evaluate(() => { window.qaTracks = [...document.querySelector('video').srcObject.getTracks()]; });
  await page.getByRole('button', { name: 'Stop camera' }).click();
  assert.ok(await page.evaluate(() => window.qaTracks.every(track => track.readyState === 'ended')));
  await page.getByRole('button', { name: 'Start camera' }).click();
  await page.getByRole('button', { name: 'Stop camera' }).waitFor();
  await page.evaluate(() => { window.qaTracks = [...document.querySelector('video').srcObject.getTracks()]; });
  await page.getByRole('button', { name: 'Journey', exact: true }).click();
  assert.ok(await page.evaluate(() => window.qaTracks.every(track => track.readyState === 'ended')));
  await page.getByRole('button', { name: 'Enter battle' }).dblclick();
  await page.getByRole('button', { name: 'Stop camera' }).waitFor();
  await page.locator('.camera-loading').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.battle-screen').getAttribute('data-attack-phase'), 'camera_setup');
  await checkLayout(page, 'battle');
  await page.reload();
  await page.getByRole('button', { name: 'Enter battle' }).waitFor();
  assert.equal(await page.locator('.battle-screen').count(), 0);
  // Use the documented durable-save boundary to inspect the final encounter.
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('awaken.progress'));
    saved.progress.currentEnemyIndex = 10;
    localStorage.setItem('awaken.progress', JSON.stringify(saved));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Enter battle' }).click();
  await page.getByRole('button', { name: 'Stop camera' }).waitFor();
  await page.locator('.camera-loading').waitFor({ state: 'detached' });
  assert.ok(await page.locator('.boss-sprite').evaluate(image => image.complete && image.naturalWidth > 0));
  await checkLayout(page, 'boss');
  await page.getByRole('button', { name: 'Journey', exact: true }).last().click();
  for (const name of ['Training', 'Profile', 'Settings', 'AWAKEN home']) {
    await page.getByRole('button', { name, exact: true }).click();
  }
  await context.close();

  for (const [errorName, message] of [['NotAllowedError', 'CAMERA ACCESS REQUIRED'], ['NotFoundError', 'NO CAMERA FOUND']]) {
    const denied = await browser.newContext();
    await denied.addInitScript(name => {
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('QA camera failure', name); };
    }, errorName);
    const page = await denied.newPage(); observe(page);
    await page.goto(base);
    await page.getByRole('button', { name: 'Enter battle' }).dblclick();
    await page.getByRole('alert').waitFor();
    assert.ok((await page.getByRole('alert').innerText()).includes(message));
    await page.getByRole('button', { name: 'Retry connection' }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('progressbar', { name: 'Player HP', exact: true }).getAttribute('aria-valuenow'), '100');
    await checkLayout(page, errorName);
    await denied.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failedResources, []);
  await writeFile(join(output, 'console.json'), JSON.stringify({ errors, failedResources, diagnostics }, null, 2));
  console.log(`PASS: production navigation, MediaPipe startup, camera lifecycle, camera errors, boss assets and four desktop sizes. ${output}`);
  console.log(`MediaPipe/Chromium diagnostics retained in console.json: ${diagnostics.length}`);
} finally {
  await browser.close();
}
