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

  it('awards normal victory once and retains the defeated enemy until the guarded transition', () => {
    let state = createGameState();
    state.screen = 'battle';
    state.currentEnemy = { id: 'test', name: 'Test Enemy', hp: 20, maxHp: 20, attack: 5, defense: 2, isBoss: false };
    
    state = applyExerciseEvent(state, { exercise: 'squat', status: 'correct', timestamp: 1 });
    
    expect(state.screen).toBe('battle');
    expect(state.currentEnemy?.hp).toBe(0);
    expect(state.roundPhase).toBe('enemy_defeated');
    expect(state.currentEnemyIndex).toBe(1);
    expect(state.player.xp).toBe(50); // 50 XP for normal enemy defeat
    expect(reps(state, 'squat', 3)).toBe(state);
    expect(gameReducer(state, { type: 'enemy_attack' })).toBe(state);
    expect(gameReducer(state, { type: 'next_round', enemyId: 'test' })).toBe(state);
    state = gameReducer(state, { type: 'round_death_complete', enemyId: 'test' });
    expect(gameReducer(state, { type: 'next_round', enemyId: 'stale' })).toBe(state);
    state = gameReducer(state, { type: 'next_round', enemyId: 'test' });
    expect(state.currentEnemyIndex).toBe(2);
    expect(state.currentEnemy?.id).toBe('enemy-2');
    expect(gameReducer(state, { type: 'next_round', enemyId: 'test' })).toBe(state);
  });

  it.each([[24, 100, 54], [88, 100, 100], [40, 200, 100]])('heals %i / %i to %i without awarding XP or changing boss damage', (hp, maxHp, healed) => {
    let state = gameReducer({ ...createGameState(), currentEnemyIndex: 10 }, { type: 'start_battle' });
    state.player = { ...state.player, hp, maxHp };
    const next = gameReducer(state, { type: 'recover', useNumber: 1 });
    expect(next.player.hp).toBe(healed);
    expect(next.player.xp).toBe(state.player.xp);
    expect(next.exercises).toEqual(state.exercises);
    expect(next.currentEnemy).toEqual(state.currentEnemy);
    expect(gameReducer(next, { type: 'recover', useNumber: 1 })).toBe(next);
    expect(gameReducer(next, { type: 'recover', useNumber: 3 })).toBe(next);
    expect(gameReducer(next, { type: 'enemy_attack' }).player.hp).toBe(Math.max(0, healed - 43));
  });

  it('rejects recovery outside a live boss fight and resets its use budget on a new fight', () => {
    const initial = createGameState();
    expect(gameReducer(initial, { type: 'recover', useNumber: 1 })).toBe(initial);
    const normal = gameReducer(initial, { type: 'start_battle' });
    expect(gameReducer(normal, { type: 'recover', useNumber: 1 })).toBe(normal);
    let boss = gameReducer({ ...initial, currentEnemyIndex: 10 }, { type: 'start_battle' });
    boss = gameReducer(boss, { type: 'recover', useNumber: 1 });
    boss = gameReducer(boss, { type: 'recover', useNumber: 2 });
    expect(gameReducer(boss, { type: 'recover', useNumber: 3 })).toBe(boss);
    expect(gameReducer(boss, { type: 'start_battle' }).recoveryUses).toBe(0);
  });

  it('resets all progress on reset action', () => {
    const state = reps(createGameState(), 'squat', 5);
    expect(gameReducer(state, { type: 'reset' })).toEqual(createGameState());
  });
});
