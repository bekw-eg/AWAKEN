import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useGameState } from '../hooks/useGameState';
import { useSquatGameEvents } from '../hooks/useSquatGameEvents';
import { useSquatExercise } from '../hooks/useSquatExercise';
import { SquatSequence } from './fixtures/squatFrames';
import type { SquatFrame } from '../exercise-engine/types';

afterEach(cleanup);
const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

it('emits once through StrictMode replay, changing callbacks and a sustained true flag', () => {
  const callback = vi.fn();
  const hook = renderHook(({ count, counted }) => useSquatGameEvents(count, counted, (event) => callback(event)), {
    wrapper, initialProps: { count: 1, counted: true },
  });
  hook.rerender({ count: 1, counted: true });
  hook.rerender({ count: 1, counted: false });
  hook.rerender({ count: 1, counted: true });
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith({ exercise: 'squat', status: 'correct', timestamp: expect.any(Number) });
  hook.rerender({ count: 2, counted: true });
  expect(callback).toHaveBeenCalledTimes(2);
  hook.rerender({ count: 0, counted: false });
  hook.rerender({ count: 1, counted: true });
  expect(callback).toHaveBeenCalledTimes(3);
});

it('does not replay the last camera rep when game state is reset', () => {
  const hook = renderHook(({ count, counted }) => {
    const game = useGameState();
    useSquatGameEvents(count, counted, game.handleExerciseEvent);
    return game;
  }, { wrapper, initialProps: { count: 0, counted: false } });
  
  act(() => hook.result.current.setScreen('workout'));
  hook.rerender({ count: 1, counted: true });

  expect(hook.result.current.player.xp).toBe(15);
  act(() => hook.result.current.resetGame());
  expect(hook.result.current.player.xp).toBe(0);
  hook.rerender({ count: 1, counted: true });
  expect(hook.result.current.player.xp).toBe(0);
});

it('connects real squat detector outputs to XP and quest progress', () => {
  const hook = renderHook(({ frame }: { frame: SquatFrame | null }) => {
    const squat = useSquatExercise(frame?.landmarks ?? null, frame?.worldLandmarks ?? null, frame?.timestampMs ?? null);
    const game = useGameState();
    useSquatGameEvents(squat.repCount, squat.repJustCounted, game.handleExerciseEvent);
    return game;
  }, { wrapper, initialProps: { frame: null as SquatFrame | null } });
  
  act(() => hook.result.current.setScreen('workout'));
  
  const sequence = new SquatSequence();
  sequence.calibrate();
  sequence.rep();
  sequence.rep();
  for (const frame of sequence.frames) hook.rerender({ frame });
  expect(hook.result.current.player.xp).toBe(30);
  expect(hook.result.current.dailyQuest.objectives[0].current).toBe(2);
});
