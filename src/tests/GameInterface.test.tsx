import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ExerciseEvent, ExerciseType } from '../game/types';
import type { CameraTelemetry } from '../components/Camera/CameraView';
import type { PushUpFrame } from '../exercise-engine/pushUpTypes';
import { Dashboard } from '../pages/Dashboard/Dashboard';
import { BOSS_TIMING } from '../components/Boss/BossCharacter';

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

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
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

it('shows victory and the existing reward automatically, without a final enemy strike or a click', () => {
  start(); hold(closedFrame, 3200);
  hold(pushUpFrame(0), 800); prepare(pushUpFrame(0)); pushup();
  act(() => vi.advanceTimersByTime(4500));
  expect(hp('Player')).toBe(96);
  hold(pushUpFrame(0), 800); prepare(pushUpFrame(0)); pushup();
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByRole('heading', { name: 'Victory.' })).toBeTruthy();
  act(() => vi.advanceTimersByTime(1800));
  expect(document.querySelector('.result-reward strong')?.textContent).toBe('+50');
  act(() => vi.advanceTimersByTime(10000));
  expect(vi.getTimerCount()).toBe(0);
});

it('does not attack during setup and cleans up all battle timers on navigation', () => {
  start(); act(() => vi.advanceTimersByTime(20000));
  expect(hp('Player')).toBe(100); expect(hp('Enemy 1')).toBe(60);
  fireEvent.click(screen.getAllByRole('button', { name: 'Journey' }).at(-1)!);
  act(() => vi.advanceTimersByTime(1000)); expect(vi.getTimerCount()).toBe(0);
});

it('completes all nine enemies and the boss, shows rewards, and returns to the existing next cycle', () => {
  render(<StrictMode><Dashboard /></StrictMode>);
  for (let encounter = 1; encounter <= 10; encounter++) {
    fireEvent.click(screen.getByRole('button', { name: 'Enter battle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Push-up: Strong attack' }));
    for (let count = 0; count < 30 && !document.querySelector('.terminal-battle'); count++) rep();
    expect(hp(encounter === 10 ? 'BOSS 1' : 'Enemy ' + encounter)).toBe(0);
    expect(screen.queryByRole('heading', { name: encounter === 10 ? 'Boss defeated.' : 'Victory.' })).toBeNull();
    if (encounter === 10) {
      expect(document.querySelector('.boss-scene')?.getAttribute('data-state')).toBe('death');
      const mastery = screen.getByRole('progressbar', { name: 'BOSS 1 HP' }).getAttribute('aria-valuenow');
      rep(); // The mounted terminal camera must not deliver another attack.
      expect(screen.getByRole('progressbar', { name: 'BOSS 1 HP' }).getAttribute('aria-valuenow')).toBe(mastery);
      act(() => vi.advanceTimersByTime(BOSS_TIMING.death - 1));
      expect(screen.queryByRole('heading', { name: 'Boss defeated.' })).toBeNull();
      act(() => vi.advanceTimersByTime(1));
    } else {
      act(() => vi.advanceTimersByTime(760));
    }
    expect(screen.getByRole('heading', { name: encounter === 10 ? 'Boss defeated.' : 'Victory.' })).toBeTruthy();
    act(() => vi.advanceTimersByTime(1800));
    expect(document.querySelector('.result-reward strong')?.textContent).toBe(encounter === 10 ? '+200' : '+50');
    act(() => vi.advanceTimersByTime(40)); // Paint the new level's progress track.
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Continue journey' }));
    const map = screen.getByRole('list', { name: 'Campaign encounters' });
    expect(within(map).getAllByRole('listitem')).toHaveLength(10);
    expect(map.querySelector('[aria-current="step"]')?.textContent).toContain(encounter === 10 ? 'Enemy 1' : encounter === 9 ? 'BOSS 1' : `Enemy ${encounter + 1}`);
  }
}, 15000); // Ten full UI encounters under StrictMode also run reliably on slower hosts.

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
