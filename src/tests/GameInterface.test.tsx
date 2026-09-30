import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ExerciseEvent, ExerciseType } from '../game/types';
import type { CameraTelemetry } from '../components/Camera/CameraView';
import type { PushUpFrame } from '../exercise-engine/pushUpTypes';
import { Dashboard } from '../pages/Dashboard/Dashboard';
import { SquatSequence, squatFrame } from './fixtures/squatFrames';
import { PushUpSequence, pushUpFrame } from './fixtures/pushUpFrames';
import { closedFrame, openFrame } from './fixtures/jumpingJackFrames';
import { BOSS_TIMING } from '../components/Boss/BossCharacter';
import * as progression from '../game/progression';
import { mockDialogs } from './fixtures/dialog';

// Feed real pose sequences at the camera boundary. Controller, detectors, game
// reducer, dashboard terminal presentation, and StrictMode lifecycle stay real.
let poseSink: ((frame: PushUpFrame) => void) | undefined;
vi.mock('../components/Camera/CameraView', () => ({
  CameraView: ({ onExerciseEvent, forcedExerciseType = 'squat', children, autoStart, mirrored, onPoseFrame, trackingPanel }: {
    onExerciseEvent: (event: ExerciseEvent) => void; forcedExerciseType?: ExerciseType;
    children?: ReactNode | ((telemetry: CameraTelemetry) => ReactNode); autoStart: boolean; mirrored: boolean;
    onPoseFrame?: (frame: PushUpFrame) => void; trackingPanel?: ReactNode;
  }) => {
    poseSink = onPoseFrame;
    return <div aria-label="Test camera" data-autostart={autoStart} data-mirrored={mirrored}>
      {!onPoseFrame && <button onClick={() => onExerciseEvent({ exercise: forcedExerciseType, status: 'correct', timestamp: Date.now() })}>Complete correct rep</button>}
      {trackingPanel}
      {typeof children === 'function' ? children({ active: true, isPersonDetected: true, repCount: 0, phase: 'standing', trackingStatus: 'ready', formStatus: 'good' }) : children}
    </div>;
  },
}));

beforeEach(() => { window.localStorage.clear(); vi.useFakeTimers(); mockDialogs(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
afterEach(() => { cleanup(); poseSink = undefined; vi.useRealTimers(); });
const start = () => { render(<StrictMode><Dashboard /></StrictMode>); fireEvent.click(screen.getByRole('button', { name: 'Enter battle' })); };
const rep = () => fireEvent.click(screen.getByRole('button', { name: 'Complete correct rep' }));
const hp = (name: string) => Number(screen.getByRole('progressbar', { name: `${name} HP` }).getAttribute('aria-valuenow'));
const phase = () => document.querySelector('[data-phase]')?.getAttribute('data-phase');
const frame = (pose: Omit<PushUpFrame, 'timestampMs'>) => {
  act(() => vi.advanceTimersByTime(50));
  act(() => poseSink?.({ ...pose, timestampMs: performance.now() }));
};
const hold = (pose: Omit<PushUpFrame, 'timestampMs'>, ms: number) => { for (let t = 0; t < ms; t += 50) frame(pose); };
const jack = () => { hold(closedFrame, 300); hold(openFrame, 400); hold(closedFrame, 400); };
const squat = () => { const s = new SquatSequence(); s.rep(); s.frames.forEach(frame); };
const pushup = () => { const s = new PushUpSequence(); s.rep(); s.frames.forEach(frame); };
const prepare = (pose: Omit<PushUpFrame, 'timestampMs'>) => {
  for (let n = 0; n < 150 && phase() !== 'performing_attack'; n++) frame(pose);
  expect(phase()).toBe('performing_attack');
};

it.each(['basic', 'fast', 'strong'])('selects %s with the body and sends a single set completion to the existing damage calculation', attack => {
  start(); hold(squatFrame(0), 4800);
  expect(screen.getByRole('heading', { name: 'SELECT YOUR ATTACK' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /attack/i })).toBeNull();
  if (attack === 'basic') squat();
  else if (attack === 'fast') jack();
  else hold(pushUpFrame(0), 800);
  expect(screen.getByRole('heading', { name: `${attack.toUpperCase()} ATTACK SELECTED` })).toBeTruthy();
  expect(hp('Enemy 1')).toBe(60); expect(hp('Player')).toBe(100);
  prepare(attack === 'basic' ? squatFrame(0) : attack === 'fast' ? closedFrame : pushUpFrame(0));
  expect(screen.getByLabelText('Attack repetitions').textContent).toBe(`0 / ${attack === 'fast' ? 5 : 1}`);
  if (attack === 'basic') squat();
  else if (attack === 'strong') pushup();
  else {
    for (let n = 0; n < 4; n++) jack();
    expect(hp('Enemy 1')).toBe(60); jack();
  }
  expect(hp('Enemy 1')).toBe(attack === 'basic' ? 38 : attack === 'fast' ? 49 : 16);
  expect(hp('Player')).toBe(100);
  act(() => vi.advanceTimersByTime(1500));
  expect(hp('Player')).toBe(96); expect(screen.getByRole('heading', { name: 'ENEMY TURN' })).toBeTruthy();
  act(() => vi.advanceTimersByTime(3000));
  expect(phase()).toBe('selecting_attack');
  act(() => vi.advanceTimersByTime(10000));
  expect(hp('Player')).toBe(96);
});

it('shows round complete, waits five seconds, and starts exactly one next opponent without a final strike', () => {
  start(); hold(closedFrame, 3200);
  hold(pushUpFrame(0), 800); prepare(pushUpFrame(0)); pushup();
  act(() => vi.advanceTimersByTime(4500));
  expect(hp('Player')).toBe(96);
  hold(pushUpFrame(0), 800); prepare(pushUpFrame(0)); pushup();
  expect(hp('Enemy 1')).toBe(0);
  expect(screen.queryByRole('button', { name: 'CONTINUE →' })).toBeNull();
  act(() => vi.advanceTimersByTime(600));
  expect(screen.getByRole('heading', { name: 'ROUND COMPLETE' })).toBeTruthy();
  expect(screen.getByText('+50 XP')).toBeTruthy();
  act(() => vi.advanceTimersByTime(4999));
  expect(hp('Enemy 1')).toBe(0);
  act(() => vi.advanceTimersByTime(1));
  expect(hp('Enemy 2')).toBe(70);
  expect(hp('Player')).toBe(96);
  act(() => vi.advanceTimersByTime(10000));
  expect(hp('Enemy 2')).toBe(70);
});

it('does not attack during setup and cleans up all battle timers on navigation', () => {
  start(); act(() => vi.advanceTimersByTime(20000));
  expect(hp('Player')).toBe(100); expect(hp('Enemy 1')).toBe(60);
  fireEvent.click(screen.getAllByRole('button', { name: 'Journey' }).at(-1)!);
  act(() => vi.advanceTimersByTime(1000)); expect(vi.getTimerCount()).toBe(0);
});

it('completes all encounters with hands-free attacks and waits for boss death before awarding the result', () => {
  const initial = progression.createGameState();
  // A trained player can finish each encounter in one strong attack.
  vi.spyOn(progression, 'createGameState').mockImplementation(() => ({ ...initial, player: { ...initial.player, strength: 300 } }));
  render(<StrictMode><Dashboard /></StrictMode>);
  fireEvent.click(screen.getByRole('button', { name: 'Enter battle' }));
  for (let encounter = 1; encounter <= 10; encounter++) {
    hold(closedFrame, 3200);
    hold(pushUpFrame(0), 800); prepare(pushUpFrame(0)); pushup();
    const boss = encounter === 10;
    expect(hp(boss ? 'BOSS 1' : `Enemy ${encounter}`)).toBe(0);
    if (boss) {
      expect(document.querySelector('.boss-scene')?.getAttribute('data-state')).toBe('death');
      act(() => poseSink?.({ ...pushUpFrame(0), timestampMs: performance.now() + 1 }));
      act(() => vi.advanceTimersByTime(760));
      expect(screen.queryByRole('heading', { name: 'Boss defeated.' })).toBeNull();
      act(() => vi.advanceTimersByTime(BOSS_TIMING.death));
    } else {
      act(() => vi.advanceTimersByTime(600));
      expect(screen.getByRole('heading', { name: 'ROUND COMPLETE' })).toBeTruthy();
      expect(screen.getByText('+50 XP')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'CONTINUE →' }));
      expect(hp(encounter === 9 ? 'BOSS 1' : `Enemy ${encounter + 1}`)).toBeGreaterThan(0);
      continue;
    }
    expect(screen.getByRole('heading', { name: 'Boss defeated.' })).toBeTruthy();
    act(() => vi.advanceTimersByTime(2000));
    expect(document.querySelector('.result-reward strong')?.textContent).toBe(boss ? '+200' : '+50');
    act(() => vi.advanceTimersByTime(500)); // Finish the newly leveled progress track and focus task.
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Continue journey' }));
    expect(screen.getByRole('list', { name: 'Campaign encounters' }).querySelector('[aria-current="step"]')?.textContent)
      .toContain(boss ? 'Enemy 1' : encounter === 9 ? 'BOSS 1' : `Enemy ${encounter + 1}`);
  }
}, 20000);

it('announces recovery without a click and allows two boss heals on consecutive turns', () => {
  const initial = progression.createGameState();
  vi.spyOn(progression, 'createGameState').mockImplementation(() => ({ ...initial, currentEnemyIndex: 10, recoveryCharges: 3,
    player: { ...initial.player, hp: 24 } }));
  start(); hold(squatFrame(0), 3300);
  expect(screen.queryByRole('button', { name: 'Recover' })).toBeNull();
  expect(screen.getByRole('heading', { name: 'RECOVERY MODE' })).toBeTruthy();
  for (const seconds of [5, 4, 3, 2, 1]) {
    expect(screen.getByTestId('battle-overlay').textContent).toContain('RECOVERY IN ' + seconds);
    expect(hp('Player')).toBe(24);
    hold(squatFrame(0), 1000);
  }
  expect(hp('Player')).toBe(74);
  expect(screen.getByTestId('battle-overlay').textContent).toContain('+50 HP');
  expect(screen.getByTestId('battle-overlay').textContent).toContain('50% MAX HP');
  act(() => vi.advanceTimersByTime(1500));
  expect(hp('Player')).toBe(31); expect(hp('BOSS 1')).toBe(600);
  act(() => vi.advanceTimersByTime(2700));
  expect(screen.getByText('2 / 3 CHARGES · 1 / 2 USES LEFT THIS FIGHT')).toBeTruthy();
  hold(squatFrame(0), 5050);
  expect(hp('Player')).toBe(81);
  act(() => vi.advanceTimersByTime(4200));
  expect(hp('Player')).toBe(38);
  expect(screen.getByText('FIGHT LIMIT REACHED')).toBeTruthy();
  expect(screen.getByText('1 / 3 CHARGES · 0 / 2 USES LEFT THIS FIGHT')).toBeTruthy();
  hold(squatFrame(0), 6000);
  expect(hp('Player')).toBe(38);
});

it('cancels the countdown on movement, heals only missing HP in round one and exhausts its charge', () => {
  const initial = progression.createGameState();
  vi.spyOn(progression, 'createGameState').mockImplementation(() => ({ ...initial, recoveryCharges: 1,
    player: { ...initial.player, hp: 95 } }));
  start(); hold(squatFrame(0), 3300);
  hold(squatFrame(0), 2000);
  expect(screen.getByTestId('battle-overlay').textContent).toContain('RECOVERY IN 3');
  frame(openFrame);
  expect(screen.queryByTestId('battle-overlay')).toBeNull();
  expect(hp('Player')).toBe(95);
  expect(screen.getByText('1 / 3 CHARGES · 2 / 2 USES LEFT THIS FIGHT')).toBeTruthy();
  frame(squatFrame(0));
  expect(screen.getByTestId('battle-overlay').textContent).toContain('RECOVERY IN 5');
  hold(squatFrame(0), 4950);
  expect(hp('Player')).toBe(95);
  frame(squatFrame(0));
  expect(hp('Player')).toBe(100);
  expect(screen.getByTestId('battle-overlay').textContent).toContain('+5 HP');
  act(() => vi.advanceTimersByTime(4200));
  expect(hp('Player')).toBe(96); expect(hp('Enemy 1')).toBe(60);
  expect(screen.getByText('NO CHARGES · EARN IN TRAINING')).toBeTruthy();
  hold(squatFrame(0), 6000);
  expect(hp('Player')).toBe(96);
});

it('earns and displays three Training charges, carries them into combat and saves them at full HP', () => {
  render(<Dashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Training' }));
  expect(screen.getByText('0 / 3 CHARGES')).toBeTruthy();
  for (let n = 0; n < 9; n++) rep();
  expect(screen.getByText('0 / 3 CHARGES')).toBeTruthy();
  rep(); expect(screen.getByText('1 / 3 CHARGES')).toBeTruthy();
  for (let n = 0; n < 20; n++) rep();
  expect(screen.getByText('3 / 3 CHARGES')).toBeTruthy();
  for (let n = 0; n < 10; n++) rep();
  expect(screen.getByText('3 / 3 CHARGES')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Journey' }));
  fireEvent.click(screen.getByRole('button', { name: 'Enter battle' }));
  hold(squatFrame(0), 9000);
  expect(screen.getByText('HP FULL · CHARGES SAVED')).toBeTruthy();
  expect(screen.getByText('3 / 3 CHARGES · 2 / 2 USES LEFT THIS FIGHT')).toBeTruthy();
  expect(phase()).toBe('selecting_attack');
});

it('restores the visible profile and quest statistics after the page is remounted', () => {
  const page = render(<Dashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Training' }));
  rep(); rep();
  page.unmount();
  render(<Dashboard />);
  expect(screen.getByRole('heading', { name: 'Welcome back, Player.' })).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: 'Level progress' }).getAttribute('aria-valuenow')).toBe('30');
  expect(screen.getByRole('progressbar', { name: 'Squats objective' }).getAttribute('aria-valuenow')).toBe('2');
});

it('shows a saving error instead of silently losing progress when storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
  render(<Dashboard />);
  expect(screen.getByText(/Progress could not be saved in this browser/)).toBeTruthy();
});

it('navigates every page while retaining game progress and applying camera preferences', () => {
  render(<Dashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Training' }));
  rep();
  fireEvent.click(screen.getByRole('button', { name: 'Profile' }));
  expect(screen.getByRole('heading', { name: 'Exercise mastery' })).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: 'Level progress' }).getAttribute('aria-valuenow')).toBe('15');
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByRole('switch', { name: /Mirror camera view/ }));
  fireEvent.click(screen.getByRole('switch', { name: /Start camera automatically/ }));
  fireEvent.click(screen.getByRole('switch', { name: /Reduce motion/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Training' }));
  const camera = screen.getByLabelText('Test camera');
  expect(camera.getAttribute('data-autostart')).toBe('false');
  expect(camera.getAttribute('data-mirrored')).toBe('false');
  expect(camera.closest('.reduce-motion')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Home' }));
  expect(screen.getByRole('heading', { name: 'Welcome back, Player.' })).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: 'Level progress' }).getAttribute('aria-valuenow')).toBe('15');
});
