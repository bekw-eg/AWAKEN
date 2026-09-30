// Browser QA: run against npm run dev. Supply AWAKEN_PLAYWRIGHT if Playwright is external.
// Only the camera transport is replaced; the app, exercise detectors, reducer, and motion run unchanged.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.AWAKEN_PLAYWRIGHT || 'playwright');
const base = process.env.AWAKEN_URL || 'http://127.0.0.1:5173';
const output = process.env.AWAKEN_QA_OUTPUT || join(tmpdir(), 'awaken-motion-qa');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
const capture = async name => { await page.screenshot({ path: join(output, name + '.png'), fullPage: true, animations: 'allow' }); console.log('Captured ' + name); };
const motionEvents = () => page.evaluate(() => window.__motionEvents);
await page.addInitScript(() => {
  window.__motionEvents = [];
  window.addEventListener('awaken:motion', event => window.__motionEvents.push(event.detail));
});

await page.route('**/src/hooks/usePoseDetection.ts', async route => {
  const original = await (await route.fetch()).text();
  const reactUrl = original.match(/from "([^"]*react\.js[^"]*)"/)[1];
  await route.fulfill({ contentType: 'text/javascript', body: `
import React from '${reactUrl}';
const { useEffect, useState } = React;
const idle = { landmarks: null, worldLandmarks: null, poseTimestampMs: null, cameraStatus: 'idle', engineStatus: 'idle', videoSize: { width: 1280, height: 720 }, error: null, isLoading: false, isPersonDetected: false };
export function usePoseDetection(videoRef, enabled = true, restartKey = 0) {
  const [state, setState] = useState(idle);
  useEffect(() => {
    if (!enabled) { setState(idle); return; }
    setState({ ...idle, cameraStatus: 'requesting', isLoading: true });
    const timers = [
      setTimeout(() => setState({ ...idle, cameraStatus: 'starting', isLoading: true }), 350),
      setTimeout(() => setState({ ...idle, cameraStatus: 'active', engineStatus: 'loading', isLoading: true }), 650),
      setTimeout(() => setState({ ...idle, cameraStatus: 'active', engineStatus: 'active' }), 1100),
    ];
    const input = event => setState({ ...idle, cameraStatus: 'active', engineStatus: 'active', ...event.detail });
    window.addEventListener('qa:pose', input);
    return () => { timers.forEach(clearTimeout); window.removeEventListener('qa:pose', input); };
  }, [enabled, restartKey]);
  return state;
}` });
});

// Slow the real application module fetch to make the genuine loading state inspectable.
await page.route('**/src/pages/Dashboard/Dashboard.tsx', async route => {
  await new Promise(resolve => setTimeout(resolve, 600));
  await route.continue();
});

async function play(exercise, reps = 1, delay = 18) {
  await page.evaluate(async ({ exercise, reps, delay }) => {
    const frames = [];
    if (exercise === 'squat') {
      const { SquatSequence } = await import('/src/tests/fixtures/squatFrames.ts');
      const sequence = new SquatSequence(); sequence.calibrate();
      for (let i = 0; i < reps; i++) sequence.rep();
      frames.push(...sequence.frames);
    } else if (exercise === 'push-up') {
      const { PushUpSequence } = await import('/src/tests/fixtures/pushUpFrames.ts');
      const sequence = new PushUpSequence(); sequence.hold();
      for (let i = 0; i < reps; i++) sequence.rep();
      frames.push(...sequence.frames);
    } else {
      const { closedFrame, openFrame } = await import('/src/tests/fixtures/jumpingJackFrames.ts');
      for (const frame of [closedFrame, ...Array.from({ length: reps }, () => [openFrame, closedFrame]).flat()]) {
        for (let n = 0; n < 12; n++) frames.push(frame);
      }
    }
    for (const frame of frames) {
      window.__poseTime = (window.__poseTime || 0) + 50;
      window.dispatchEvent(new CustomEvent('qa:pose', { detail: { landmarks: frame.landmarks, worldLandmarks: frame.worldLandmarks, poseTimestampMs: window.__poseTime, isPersonDetected: true } }));
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }, { exercise, reps, delay });
}

try {
  await page.goto(base, { waitUntil: 'commit' });
  await page.locator('.loading-logo').waitFor();
  await capture('01-initial-loading');
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await page.getByText('LOADING POSE MODEL', { exact: true }).first().waitFor();
  await capture('02-camera-loading');
  await page.getByText('SEARCHING FOR USER', { exact: true }).first().waitFor();
  await play('squat');
  assert.equal(await page.locator('.rep-value .animated-number').getAttribute('aria-label'), '1');
  await capture('03-squat-rep');
  await page.getByRole('button', { name: 'JUMPING JACK', exact: true }).click();
  await play('jumping-jack', 5);
  assert.equal(await page.locator('.rep-value .animated-number').getAttribute('aria-label'), '5');
  await capture('04-jumping-jack-series');
  await page.getByRole('button', { name: 'PUSH-UP', exact: true }).click();
  await play('push-up');
  assert.equal(await page.locator('.rep-value .animated-number').getAttribute('aria-label'), '1');
  const events = await motionEvents();
  assert.equal(events.filter(e => e.type === 'rep-success').length, 7);
  await page.waitForTimeout(1000);
  assert.equal((await motionEvents()).filter(e => e.type === 'rep-success').length, 7);

  await page.getByRole('button', { name: 'Journey', exact: true }).click();
  await page.getByRole('button', { name: 'Enter battle', exact: true }).click();
  await page.locator('.battle-intro').waitFor();
  await capture('05-battle-intro');
  await page.locator('.battle-intro').waitFor({ state: 'detached' });
  await page.getByText('BOSS TURN', { exact: true }).waitFor();
  await capture('06-enemy-warning');
  await page.getByText('ENEMY STRIKE', { exact: true }).waitFor();
  await capture('07-incoming-damage');
  await page.getByRole('button', { name: 'Push-up: Strong attack' }).click();
  await play('push-up', 1);
  await capture('08-player-attack');
  await play('push-up', 1);
  await page.getByRole('heading', { name: 'Victory.', exact: true }).waitFor();
  await page.waitForTimeout(1400);
  await capture('09-victory-xp');
  await page.getByRole('button', { name: 'Continue journey' }).click();
  await capture('10-journey-unlock');
  for (let encounter = 2; encounter <= 10; encounter++) {
    await page.getByRole('button', { name: 'Enter battle', exact: true }).click();
    await page.locator('.battle-intro').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Push-up: Strong attack' }).click();
    if (encounter === 10) await capture('11-boss-arena');
    for (let rep = 0; rep < 30 && !await page.locator('.terminal-battle, .battle-result').count(); rep++) await play('push-up');
    await page.getByRole('heading', { name: encounter === 10 ? 'Boss defeated.' : 'Victory.', exact: true }).waitFor();
    if (encounter === 10) { await page.waitForTimeout(450); await capture('12-boss-rewards'); }
    await page.waitForTimeout(1700);
    await page.getByRole('button', { name: 'Continue journey' }).click();
  }
  assert.equal((await motionEvents()).filter(e => e.type === 'victory').length, 10);
  assert.ok((await motionEvents()).some(e => e.type === 'level-up'));

  // Fast-forward only wall-clock time to inspect the unchanged enemy cadence and defeat.
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.getByRole('button', { name: 'Enter battle', exact: true }).click();
  await page.clock.runFor(2000);
  for (let hit = 0; hit < 200 && !await page.locator('.terminal-battle').count(); hit++) {
    await page.clock.fastForward(5000);
    if (hit % 25 === 0) console.log('Defeat check: ' + await page.getByRole('progressbar', { name: 'Player HP', exact: true }).getAttribute('aria-valuenow') + ' HP');
  }
  assert.equal(await page.getByRole('progressbar', { name: 'Player HP', exact: true }).getAttribute('aria-valuenow'), '0');
  await capture('13-final-incoming-hit');
  await page.clock.runFor(1600);
  await capture('14-defeat');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.clock.runFor(2000);
  assert.equal(await page.locator('.battle-intro').count(), 0);
  await page.getByRole('button', { name: 'Journey', exact: true }).last().click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.runFor(1200);
  await capture('15-mobile-journey');
  for (const name of ['Home', 'Profile', 'Training', 'Settings']) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.clock.runFor(1700);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + ' overflows');
  }
  await page.getByRole('switch', { name: /Reduce motion/ }).click();
  await page.getByRole('button', { name: 'Journey', exact: true }).click();
  await page.getByRole('button', { name: 'Enter battle', exact: true }).click();
  await page.clock.runFor(2000);
  assert.equal(await page.locator('.battle-intro').count(), 0);
  await capture('16-mobile-reduced-motion');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  await writeFile(join(output, 'events.json'), JSON.stringify(await motionEvents(), null, 2));
  console.log('PASS: all exercises, 10 victories, boss, defeat, retry, progression, mobile and reduced motion. ' + output);
} finally {
  await browser.close();
}
