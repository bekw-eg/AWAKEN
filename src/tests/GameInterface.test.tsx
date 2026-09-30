import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ExerciseEvent, ExerciseType } from '../game/types';
import type { CameraTelemetry } from '../components/Camera/CameraView';
import { Dashboard } from '../pages/Dashboard/Dashboard';
import { BOSS_TIMING } from '../components/Boss/BossCharacter';

// Camera/detector integration is covered with real pose sequences in PushUpMode.test.tsx.
// This boundary supplies correct reps to the real game reducer, navigation, and battle UI.
vi.mock('../components/Camera/CameraView', () => ({
  CameraView: ({ onExerciseEvent, forcedExerciseType = 'squat', children, autoStart, mirrored }: {
    onExerciseEvent: (event: ExerciseEvent) => void; forcedExerciseType?: ExerciseType;
    children?: ReactNode | ((telemetry: CameraTelemetry) => ReactNode); autoStart: boolean; mirrored: boolean;
  }) => <div aria-label="Test camera" data-autostart={autoStart} data-mirrored={mirrored}>
    <button onClick={() => onExerciseEvent({ exercise: forcedExerciseType, status: 'correct', timestamp: Date.now() })}>Complete correct rep</button>
    <button onClick={() => onExerciseEvent({ exercise: forcedExerciseType, status: 'incorrect', timestamp: Date.now() })}>Incorrect rep</button>
    {typeof children === 'function' ? children({ active: true, isPersonDetected: true, repCount: 0, phase: 'standing', trackingStatus: 'ready', formStatus: 'good' }) : children}
  </div>,
}));

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const start = () => { render(<StrictMode><Dashboard /></StrictMode>); fireEvent.click(screen.getByRole('button', { name: 'Enter battle' })); };
const rep = () => fireEvent.click(screen.getByRole('button', { name: 'Complete correct rep' }));
const hp = (name: string) => Number(screen.getByRole('progressbar', { name: `${name} HP` }).getAttribute('aria-valuenow'));

it.each([
  ['Push-up: Strong attack', 16], ['Jumping jack: Fast attack', 49], ['Squat: Basic attack', 38],
])('selects %s and reflects the unchanged damage calculation', (attack, expectedHp) => {
  start();
  const button = screen.getByRole('button', { name: attack });
  fireEvent.click(button);
  expect(button.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Incorrect rep' }));
  expect(hp('Enemy 1')).toBe(60);
  rep();
  expect(hp('Enemy 1')).toBe(expectedHp);
  expect(screen.getByText('ATTACK SUCCESSFUL')).toBeTruthy();
  expect(button.getAttribute('data-state')).toBe('completed');
  act(() => vi.advanceTimersByTime(1500));
  expect(screen.queryByText('ATTACK SUCCESSFUL')).toBeNull();
});

it('clears the prior hit confirmation when a different attack is selected', () => {
  start();
  rep();
  fireEvent.click(screen.getByRole('button', { name: 'Push-up: Strong attack' }));
  expect(screen.getByRole('button', { name: 'Push-up: Strong attack' }).getAttribute('data-state')).toBe('selected');
  expect(screen.queryByText('ATTACK SUCCESSFUL')).toBeNull();
  expect(hp('Enemy 1')).toBe(38);
});

it('retains the enemy cadence, shows incoming damage, and stops timers after leaving', () => {
  start();
  act(() => vi.advanceTimersByTime(4999));
  expect(hp('Player')).toBe(100);
  act(() => vi.advanceTimersByTime(1));
  expect(hp('Player')).toBe(96);
  expect(screen.getByText('ENEMY STRIKE')).toBeTruthy();
  // A player hit resets the existing enemy interval; preserve that behavior.
  rep();
  act(() => vi.advanceTimersByTime(4999));
  expect(hp('Player')).toBe(96);
  act(() => vi.advanceTimersByTime(1));
  expect(hp('Player')).toBe(92);
  fireEvent.click(screen.getAllByRole('button', { name: 'Journey' }).at(-1)!);
  act(() => vi.advanceTimersByTime(500)); // Finish the topbar's last HP tween.
  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.queryByRole('heading', { name: 'Defeated.' })).toBeNull();
  expect(screen.getByRole('progressbar', { name: 'Journey completed encounters' }).getAttribute('aria-valuenow')).toBe('0');
});

it('presents defeat and retry without granting progress or changing restored health', () => {
  start();
  act(() => vi.advanceTimersByTime(125000));
  expect(hp('Player')).toBe(0);
  expect(screen.queryByRole('heading', { name: 'Defeated.' })).toBeNull();
  act(() => vi.advanceTimersByTime(760));
  expect(screen.getByRole('heading', { name: 'Defeated.' })).toBeTruthy();
  expect(screen.getByText('Health restored to 100 HP')).toBeTruthy();
  // jsdom schedules a selection-change task when the result heading receives focus.
  act(() => vi.advanceTimersByTime(500)); // Restored HP is also animated in the topbar.
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(hp('Player')).toBe(100);
  expect(hp('Enemy 1')).toBe(60);
  fireEvent.click(screen.getAllByRole('button', { name: 'Journey' }).at(-1)!);
  expect(screen.queryByRole('heading', { name: 'Defeated.' })).toBeNull();
  expect(screen.getByRole('progressbar', { name: 'Journey completed encounters' }).getAttribute('aria-valuenow')).toBe('0');
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
