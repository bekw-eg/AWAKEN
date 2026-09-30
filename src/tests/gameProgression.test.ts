import { describe, expect, it } from 'vitest';
import { addPlayerXp, applyExerciseEvent, createGameState, gameReducer, generateEnemy } from '../game/progression';
import type { ExerciseType, GameState } from '../game/types';

function reps(state: GameState, exercise: ExerciseType, count: number) {
  for (let i = 0; i < count; i++) {
    state = applyExerciseEvent(state, { exercise, status: 'correct', timestamp: i });
  }
  return state;
}

describe('game progression', () => {
  it('reduces boss attack by roughly thirty percent while retaining regular enemy damage', () => {
    expect(generateEnemy(10).attack).toBe(31);
    const boss = gameReducer({ ...createGameState(), currentEnemyIndex: 10 }, { type: 'start_battle' });
    expect(gameReducer(boss, { type: 'enemy_attack' }).player.hp).toBe(71);
    const normal = gameReducer(createGameState(), { type: 'start_battle' });
    expect(generateEnemy(1).attack).toBe(6);
    expect(gameReducer(normal, { type: 'enemy_attack' }).player.hp).toBe(96);
  });
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

  it.each([[1, 24, 100, 34], [2, 24, 100, 39], [5, 24, 100, 54], [10, 24, 100, 74], [1, 95, 100, 100], [5, 40, 200, 100]])(
    'round %i heals %i / %i to %i without XP or stronger enemy attacks', (round, hp, maxHp, healed) => {
    let state = gameReducer({ ...createGameState(), currentEnemyIndex: round, recoveryCharges: 3 }, { type: 'start_battle' });
    state.player = { ...state.player, hp, maxHp };
    const next = gameReducer(state, { type: 'recover', useNumber: 1 });
    expect(next.player.hp).toBe(healed);
    expect(next.recoveryCharges).toBe(2);
    expect(next.player.xp).toBe(state.player.xp);
    expect(next.exercises).toEqual(state.exercises);
    expect(next.currentEnemy).toEqual(state.currentEnemy);
    expect(gameReducer(next, { type: 'recover', useNumber: 1 })).toBe(next);
    expect(gameReducer(next, { type: 'recover', useNumber: 3 })).toBe(next);
    const damage = Math.max(1, state.currentEnemy!.attack - Math.floor(state.player.defense / 2));
    expect(gameReducer(next, { type: 'enemy_attack' }).player.hp).toBe(healed - damage);
  });

  it('rejects full health, empty inventory and non-live fights without consuming charges', () => {
    const initial = { ...createGameState(), recoveryCharges: 3 };
    expect(gameReducer(initial, { type: 'recover', useNumber: 1 })).toBe(initial);
    const battle = gameReducer(initial, { type: 'start_battle' });
    expect(gameReducer(battle, { type: 'recover', useNumber: 1 })).toBe(battle);
    const empty = { ...battle, recoveryCharges: 0, player: { ...battle.player, hp: 24 } };
    expect(gameReducer(empty, { type: 'recover', useNumber: 1 })).toBe(empty);
    const dead = { ...battle, currentEnemy: { ...battle.currentEnemy!, hp: 0 }, player: { ...battle.player, hp: 24 } };
    expect(gameReducer(dead, { type: 'recover', useNumber: 1 })).toBe(dead);
  });

  it('resets the two-use limit each round while retaining the remaining inventory', () => {
    let state = gameReducer({ ...createGameState(), recoveryCharges: 3 }, { type: 'start_battle' });
    state.player = { ...state.player, hp: 1 };
    state = gameReducer(state, { type: 'recover', useNumber: 1 });
    state = gameReducer(state, { type: 'recover', useNumber: 2 });
    expect(state.recoveryUses).toBe(2); expect(state.recoveryCharges).toBe(1);
    expect(gameReducer(state, { type: 'recover', useNumber: 3 })).toBe(state);
    state = reps(state, 'push-up', 2);
    state = gameReducer(state, { type: 'round_death_complete', enemyId: 'enemy-1' });
    state = gameReducer(state, { type: 'next_round', enemyId: 'enemy-1' });
    expect(state.currentEnemyIndex).toBe(2);
    expect(state.recoveryUses).toBe(0); expect(state.recoveryCharges).toBe(1);
    state = gameReducer(state, { type: 'recover', useNumber: 1 });
    expect(state.recoveryCharges).toBe(0); expect(state.recoveryUses).toBe(1);
  });

  it.each([['push-up', 5], ['squat', 10], ['jumping-jack', 15]] as const)('earns one charge every %s set of %i correct Training reps', (exercise, target) => {
    let state = { ...createGameState(), screen: 'workout' as const };
    let progress = reps(state, exercise, target - 1);
    expect(progress.recoveryCharges).toBe(0);
    expect(progress.recoveryTraining[exercise]).toBe(target - 1);
    progress = applyExerciseEvent(progress, { exercise, status: 'incorrect', timestamp: 1 });
    expect(progress.recoveryCharges).toBe(0);
    progress = reps(progress, exercise, 1);
    expect(progress.recoveryCharges).toBe(1);
    expect(progress.recoveryTraining[exercise]).toBe(0);
    progress = reps(progress, exercise, target);
    expect(progress.recoveryCharges).toBe(2);
  });

  it('keeps independent partial sets and caps inventory at three without banking extra sets', () => {
    let state: GameState = { ...createGameState(), screen: 'workout' };
    state = reps(state, 'push-up', 4); state = reps(state, 'squat', 9); state = reps(state, 'jumping-jack', 14);
    expect(state.recoveryCharges).toBe(0);
    for (const exercise of ['push-up', 'squat', 'jumping-jack'] as const) state = reps(state, exercise, 1);
    expect(state.recoveryCharges).toBe(3);
    const counters = state.recoveryTraining;
    state = reps(state, 'push-up', 25);
    expect(state.recoveryCharges).toBe(3); expect(state.recoveryTraining).toEqual(counters);
    state = gameReducer(state, { type: 'start_battle' });
    state.player = { ...state.player, hp: 1 };
    state = gameReducer(state, { type: 'recover', useNumber: 1 });
    expect(state.recoveryCharges).toBe(2);
    state = gameReducer(state, { type: 'set_screen', screen: 'workout' });
    state = reps(state, 'push-up', 1);
    expect(state.recoveryCharges).toBe(2); expect(state.recoveryTraining['push-up']).toBe(1);
  });

  it('does not earn charges from combat reps', () => {
    let state = gameReducer(createGameState(), { type: 'start_battle' });
    state.currentEnemy = { ...state.currentEnemy!, hp: 100000, maxHp: 100000 };
    state = reps(state, 'push-up', 10);
    expect(state.recoveryCharges).toBe(0);
    expect(state.recoveryTraining['push-up']).toBe(0);
  });

  it('resets all progress on reset action', () => {
    const state = reps(createGameState(), 'squat', 5);
    expect(gameReducer(state, { type: 'reset' })).toEqual(createGameState());
  });
});
