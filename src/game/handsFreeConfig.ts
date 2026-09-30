import type { ExerciseType } from './types';
import { DEFAULT_SQUAT_CONFIG } from '../exercise-engine/squatDetector';

export const HANDS_FREE_CONFIG = {
  selectionLockMs: 1000,
  squatSelectionCooldownMs: 1200,
  jumpingJackSelectionCooldownMs: 1200,
  pushupPoseHoldMs: 700,
  neutralHoldMs: 400,
  neutralJitterMs: 250,
  prepareCountdownMs: 3000,
  introCountdownMs: 3000,
  resolveMs: 1500,
  enemyTurnMs: 1500,
  betweenTurnsMs: 1200,
  maxFrameGapMs: 400,
  uiTickMs: 50,
  goLabelMs: 800,
  minVisibility: 0.55,
  minPresence: 0.5,
  standingKneeAngle: DEFAULT_SQUAT_CONFIG.calibrationKneeAngleMin,
  standingLeanDeg: DEFAULT_SQUAT_CONFIG.calibrationMaxLeanDeg,
  closedAnkleRatio: 1.5,
  armsDownMargin: 0.08,
  pushupMaxDrift: 0.045,
} as const;

export type AttackType = 'basic' | 'fast' | 'strong';
export const HANDS_FREE_ATTACKS = {
  basic: { exercise: 'squat', name: 'BASIC', movement: 'SQUAT', selection: '1 full squat', reps: 1, neutral: 'Stand fully upright' },
  fast: { exercise: 'jumping-jack', name: 'FAST', movement: 'JUMPING JACKS', selection: '1 full jumping jack', reps: 5, neutral: 'Feet together · arms down' },
  strong: { exercise: 'push-up', name: 'STRONG', movement: 'PUSH-UP', selection: 'Hold a straight push-up stance', reps: 1, neutral: 'Hold your top plank · arms straight' },
} as const satisfies Record<AttackType, { exercise: ExerciseType; name: string; movement: string; selection: string; reps: number; neutral: string }>;
