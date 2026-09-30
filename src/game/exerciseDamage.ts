import type { ExerciseType } from './types';

export const EXERCISE_DAMAGE = {
  'jumping-jack': 2,
  squat: 5,
  'push-up': 10,
} as const satisfies Record<ExerciseType, number>;

export type AttackInput = { exercise: ExerciseType; correctReps: number };
export type BattleAttack = AttackInput & { id: string; enemyId: string };

/** Shared preview/resolution boundary for future combat modifiers.
 * Today only detector-confirmed whole reps contribute; stats do not modify damage.
 */
export function calculateAttackDamage({ exercise, correctReps }: AttackInput): number {
  if (!Number.isSafeInteger(correctReps) || correctReps < 0) return 0;
  return correctReps * EXERCISE_DAMAGE[exercise];
}
