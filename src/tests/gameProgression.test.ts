import { describe, expect, it } from 'vitest';
import { addPlayerXp, applyExerciseEvent, createGameState, gameReducer } from '../game/progression';
import type { ExerciseType, GameState } from '../game/types';

function reps(state: GameState, exercise: ExerciseType, count: number) {
  for (let i = 0; i < count; i++) {
    state = applyExerciseEvent(state, { exercise, status: 'correct', timestamp: i });
  }
  return state;
}

describe('game progression', () => {
  it('awards 15 XP for each supported correct exercise in workout mode', () => {
    for (const exercise of ['squat', 'jumping-jack', 'push-up'] as const) {
      let initial = createGameState();
      initial.screen = 'workout';
      const next = reps(initial, exercise, 1);
      expect(next.player.xp).toBe(15);
      expect(next.exercises[exercise].xp).toBe(15);
    }
  });

  it('ignores incorrect events', () => {
    const state = createGameState();
    state.screen = 'workout';
    expect(applyExerciseEvent(state, { exercise: 'squat', status: 'incorrect', errorCode: 'too_shallow', timestamp: 1 })).toBe(state);
  });

  it('levels up player properly and scales xpToNextLevel', () => {
    const state = addPlayerXp(createGameState().player, 150);
    expect(state.level).toBe(2);
    expect(state.xp).toBe(50);
    expect(state.xpToNextLevel).toBe(120);
    expect(state.strength).toBe(11);
    expect(state.maxHp).toBe(110);
    expect(state.hp).toBe(110);
  });

  it('damages enemy in battle mode', () => {
    let state = createGameState();
    state.screen = 'battle';
    state.currentEnemy = { id: 'test', name: 'Test Enemy', hp: 50, maxHp: 50, attack: 5, defense: 2, isBoss: false };
    
    state = applyExerciseEvent(state, { exercise: 'squat', status: 'correct', timestamp: 1 });
    
    // Squat base damage is 10. Power is 10. 
    // Damage = Math.floor(10 * (1 + 10 * 0.1) * (1 + 1 * 0.1)) = Math.floor(10 * 2 * 1.1) = 22
    expect(state.currentEnemy?.hp).toBe(28); // 50 - 22
  });

  it('defeats enemy, grants xp, and transitions to main screen', () => {
    let state = createGameState();
    state.screen = 'battle';
    state.currentEnemy = { id: 'test', name: 'Test Enemy', hp: 20, maxHp: 20, attack: 5, defense: 2, isBoss: false };
    
    state = applyExerciseEvent(state, { exercise: 'squat', status: 'correct', timestamp: 1 });
    
    expect(state.screen).toBe('main');
    expect(state.currentEnemy).toBeNull();
    expect(state.currentEnemyIndex).toBe(2);
    expect(state.player.xp).toBe(50); // 50 XP for normal enemy defeat
  });

  it('resets all progress on reset action', () => {
    const state = reps(createGameState(), 'squat', 5);
    expect(gameReducer(state, { type: 'reset' })).toEqual(createGameState());
  });
});
