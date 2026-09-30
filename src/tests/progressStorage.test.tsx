import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGameState } from '../hooks/useGameState';
import { createGameState, EXERCISES, gameReducer } from '../game/progression';
import { loadProgress, PROGRESS_STORAGE_KEY, saveProgress } from '../game/progressStorage';
import type { ExerciseType, GameState } from '../game/types';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);
const rep = (exercise: ExerciseType) => ({ exercise, status: 'correct' as const, timestamp: Date.now() });
function trainedState() {
  let state: GameState = { ...createGameState(), screen: 'workout' };
  for (const { exercise } of EXERCISES) {
    for (let n = 0; n < 10; n++) state = gameReducer(state, { type: 'exercise', event: rep(exercise) });
  }
  state = gameReducer(state, { type: 'start_battle' });
  state = gameReducer(state, { type: 'enemy_attack' });
  while (state.screen === 'battle') state = gameReducer(state, { type: 'exercise', event: rep('push-up') });
  return state;
}

it('restores levels, XP, stats, HP, gold, exercise mastery, quests and campaign progress after remount', () => {
  const saved = trainedState();
  expect(saved.player.gold).toBe(100);
  expect(saved.currentEnemyIndex).toBe(2);
  expect(saveProgress(saved)).toBe(true);
  const first = renderHook(useGameState, { wrapper: StrictMode });
  expect(first.result.current.player).toEqual(saved.player);
  act(() => first.result.current.setScreen('workout'));
  act(() => first.result.current.handleExerciseEvent(rep('squat')));
  const { player, exercises, dailyQuest, currentEnemyIndex } = first.result.current;
  first.unmount();
  const second = renderHook(useGameState, { wrapper: StrictMode });
  expect(second.result.current).toMatchObject({ player, exercises, dailyQuest, currentEnemyIndex, screen: 'main', currentEnemy: null, storageError: false });
  // Completed quest rewards and stat bonuses must not be granted again on reload.
  act(() => second.result.current.setScreen('workout'));
  act(() => second.result.current.handleExerciseEvent(rep('push-up')));
  expect(second.result.current.player.gold).toBe(100);
  expect(second.result.current.dailyQuest.rewardClaimed).toBe(true);
});

it('returns to the main screen after a mid-battle reload without restoring attacks or awarding victory', () => {
  const first = renderHook(useGameState);
  act(() => first.result.current.startBattle());
  act(() => first.result.current.enemyAttack());
  act(() => first.result.current.handleExerciseEvent(rep('squat')));
  expect(first.result.current.player.hp).toBe(96);
  const saved = JSON.parse(window.localStorage.getItem(PROGRESS_STORAGE_KEY)!);
  expect(Object.keys(saved.progress).sort()).toEqual(['currentEnemyIndex', 'dailyQuest', 'exercises', 'player']);
  first.unmount();
  const second = renderHook(useGameState);
  expect(second.result.current.screen).toBe('main');
  expect(second.result.current.currentEnemy).toBeNull();
  expect(second.result.current.currentEnemyIndex).toBe(1);
  expect(second.result.current.player.hp).toBe(96);
  expect(second.result.current.player.xp).toBe(0);
  expect(second.result.current.exercises.squat.xp).toBe(15);
  act(() => second.result.current.startBattle());
  expect(second.result.current.currentEnemy?.hp).toBe(60);
});

it('persists a reset so old statistics do not reappear', () => {
  saveProgress(trainedState());
  const first = renderHook(useGameState);
  act(() => first.result.current.resetGame());
  first.unmount();
  expect(loadProgress()).toEqual(createGameState());
});

it('does not write progress on navigation or unchanged renders', () => {
  const write = vi.spyOn(Storage.prototype, 'setItem');
  const hook = renderHook(useGameState);
  const writes = write.mock.calls.length;
  act(() => hook.result.current.setScreen('workout'));
  act(() => hook.result.current.setScreen('main'));
  hook.rerender();
  expect(write).toHaveBeenCalledTimes(writes);
  act(() => hook.result.current.handleExerciseEvent({ ...rep('squat'), status: 'incorrect' }));
  expect(write).toHaveBeenCalledTimes(writes);
});

it.each(['{broken', 'null', '[]', '{}', '{"version":99,"progress":{}}'])('recovers from an invalid save: %s', raw => {
  window.localStorage.setItem(PROGRESS_STORAGE_KEY, raw);
  expect(loadProgress()).toEqual(createGameState());
});

it.each([
  (state: GameState) => { state.player.xp = -1; },
  (state: GameState) => { state.player.level = Infinity; },
  (state: GameState) => { state.player.hp = state.player.maxHp + 1; },
  (state: GameState) => { state.currentEnemyIndex = 11; },
  (state: GameState) => { state.exercises.squat.xpToNextLevel = 0; },
  (state: GameState) => { state.dailyQuest.objectives.pop(); },
  (state: GameState) => { state.dailyQuest.objectives[1] = state.dailyQuest.objectives[0]; },
  (state: GameState) => { state.dailyQuest.objectives[0].completed = true; },
  (state: GameState) => { state.dailyQuest.rewardClaimed = true; },
])('rejects malformed or inconsistent progress (%#)', mutate => {
  const state = createGameState();
  mutate(state);
  saveProgress(state);
  expect(loadProgress()).toEqual(createGameState());
});

it('keeps gameplay working and reports a failed save when browser storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
  const hook = renderHook(useGameState, { wrapper: StrictMode });
  expect(hook.result.current.storageError).toBe(true);
  act(() => hook.result.current.setScreen('workout'));
  act(() => hook.result.current.handleExerciseEvent(rep('squat')));
  expect(hook.result.current.player.xp).toBe(15);
  write.mockRestore();
  act(() => hook.result.current.handleExerciseEvent(rep('squat')));
  expect(hook.result.current.storageError).toBe(false);
});
