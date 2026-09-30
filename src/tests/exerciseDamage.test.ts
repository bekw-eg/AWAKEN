import { describe, expect, it } from 'vitest';
import { calculateAttackDamage, type BattleAttack } from '../game/exerciseDamage';
import { applyBattleAttack, applyExerciseEvent, createGameState, gameReducer } from '../game/progression';

const cases = [
  ['squat', 0, 0], ['squat', 1, 5], ['squat', 10, 50],
  ['jumping-jack', 0, 0], ['jumping-jack', 1, 2], ['jumping-jack', 10, 20],
  ['push-up', 0, 0], ['push-up', 1, 10], ['push-up', 10, 100],
] as const;

describe('rep-based combat damage', () => {
  it.each(cases)('%s: %i correct reps deal %i damage in preview and resolution', (exercise, correctReps, damage) => {
    const state = gameReducer({ ...createGameState(), currentEnemyIndex: 10 }, { type: 'start_battle' });
    const attack: BattleAttack = { id: 'set-1', enemyId: 'enemy-10', exercise, correctReps };
    expect(calculateAttackDamage(attack)).toBe(damage);
    const next = applyBattleAttack(state, attack);
    expect(next.currentEnemy?.hp).toBe(600 - damage);
    expect(next.player).toEqual(state.player);
    // A duplicate set cannot apply its reps, damage or exercise XP again.
    expect(applyBattleAttack(next, attack)).toBe(next);
    if (!correctReps) expect(next.exercises).toEqual(state.exercises);
    const trained = { ...state, player: { ...state.player, strength: 300, agility: 300, power: 300 },
      exercises: { ...state.exercises, [exercise]: { level: 50, xp: 0, xpToNextLevel: 1000 } } };
    expect(applyBattleAttack(trained, attack).currentEnemy?.hp).toBe(600 - damage);
  });

  it('keeps the heavier exercise more powerful for the same number of reps', () => {
    for (const correctReps of [1, 7, 10, 100]) {
      const damage = (exercise: BattleAttack['exercise']) => calculateAttackDamage({ exercise, correctReps });
      expect(damage('push-up')).toBeGreaterThan(damage('squat'));
      expect(damage('squat')).toBeGreaterThan(damage('jumping-jack'));
    }
  });

  it.each([-1, 1.5, NaN, Infinity])('rejects invalid rep counts (%s)', correctReps => {
    const state = gameReducer(createGameState(), { type: 'start_battle' });
    const attack: BattleAttack = { id: 'invalid', enemyId: 'enemy-1', exercise: 'squat', correctReps };
    expect(calculateAttackDamage(attack)).toBe(0);
    expect(applyBattleAttack(state, attack)).toBe(state);
  });

  it('ignores loose rep events and completed sets from a different opponent', () => {
    const state = gameReducer(createGameState(), { type: 'start_battle' });
    for (const status of ['correct', 'incorrect'] as const) {
      expect(applyExerciseEvent(state, { exercise: 'squat', status, timestamp: 1 })).toBe(state);
    }
    expect(applyBattleAttack(state, { id: 'stale', enemyId: 'enemy-2', exercise: 'squat', correctReps: 10 })).toBe(state);
  });

  it('clamps overkill to zero, grants victory once and blocks retaliation', () => {
    const state = gameReducer(createGameState(), { type: 'start_battle' });
    const attack: BattleAttack = { id: 'lethal', enemyId: 'enemy-1', exercise: 'push-up', correctReps: 10 };
    const next = applyBattleAttack(state, attack);
    expect(next.currentEnemy?.hp).toBe(0);
    expect(next.roundPhase).toBe('enemy_defeated');
    expect(next.player.xp).toBe(50);
    expect(applyBattleAttack(next, attack)).toBe(next);
    expect(gameReducer(next, { type: 'enemy_attack' })).toBe(next);
  });
});
