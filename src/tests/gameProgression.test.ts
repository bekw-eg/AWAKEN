import { describe, expect, it } from 'vitest';
import { addXp, applyExerciseEvent, createGameState, gameReducer } from '../game/progression';
import type { ExerciseType, GameState } from '../game/types';

function reps(state: GameState, exercise: ExerciseType, count: number) {
  for (let i = 0; i < count; i++) {
    state = applyExerciseEvent(state, { exercise, status: 'correct', timestamp: i });
  }
  return state;
}

describe('game progression', () => {
  it('awards 10 XP and quest progress for each supported correct exercise without mutating input', () => {
    for (const exercise of ['squat', 'jumping-jack', 'knee-raise'] as const) {
      const initial = createGameState();
      const next = reps(initial, exercise, 1);
      expect(next.player.xp).toBe(10);
      expect(next.dailyQuest.objectives.find((item) => item.exercise === exercise)?.current).toBe(1);
      expect(initial).toEqual(createGameState());
    }
  });

  it('ignores incorrect events, including their error codes', () => {
    const state = createGameState();
    expect(applyExerciseEvent(state, { exercise: 'squat', status: 'incorrect', errorCode: 'too_shallow', timestamp: 1 })).toBe(state);
  });

  it('awards strength once at 10 squats and caps progress while later reps still earn XP', () => {
    const ten = reps(createGameState(), 'squat', 10);
    expect(ten.player).toMatchObject({ strength: 2, level: 2, xp: 0 });
    expect(ten.dailyQuest.objectives[0]).toMatchObject({ current: 10, completed: true });
    const eleven = reps(ten, 'squat', 1);
    expect(eleven.player).toMatchObject({ strength: 2, xp: 10 });
    expect(eleven.dailyQuest.objectives[0].current).toBe(10);
    expect(eleven.dailyQuest.rewardClaimed).toBe(false);
  });

  it('carries overflow across multiple levels', () => {
    expect(addXp({ ...createGameState().player, xp: 90 }, 250)).toMatchObject({ level: 4, xp: 40, xpToNextLevel: 100 });
  });

  it('awards each stat and the full quest reward only once', () => {
    let state = reps(createGameState(), 'squat', 10);
    state = reps(state, 'jumping-jack', 10);
    state = reps(state, 'knee-raise', 9);
    expect(state.player.gold).toBe(0);
    expect(state.dailyQuest.rewardClaimed).toBe(false);
    state = reps(state, 'knee-raise', 1);
    expect(state.player).toEqual({ level: 5, xp: 50, xpToNextLevel: 100, strength: 2, endurance: 2, agility: 2, gold: 100 });
    expect(state.dailyQuest.rewardClaimed).toBe(true);
    for (const exercise of ['squat', 'jumping-jack', 'knee-raise'] as const) state = reps(state, exercise, 1);
    expect(state.player).toMatchObject({ level: 5, xp: 80, gold: 100, strength: 2, endurance: 2, agility: 2 });
    expect(state.dailyQuest.objectives.every((objective) => objective.current === 10)).toBe(true);
  });

  it('resets all progress and reward flags', () => {
    expect(gameReducer(reps(createGameState(), 'squat', 11), { type: 'reset' })).toEqual(createGameState());
  });
});
