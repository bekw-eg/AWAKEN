import type { ExerciseType } from '../game/types';
import type { SquatErrorCode, JumpingJackErrorCode } from './types';
import type { PushUpErrorCode } from './pushUpTypes';

export type FormStatus = 'neutral' | 'correct' | 'warning' | 'error';
export type BodyRegion = 'left_arm' | 'right_arm' | 'arms' | 'torso' | 'hips' | 'left_leg' | 'right_leg' | 'legs' | 'full_body';
export type FormFeedback = { status: FormStatus; message?: string; regions?: readonly BodyRegion[] };
export const NEUTRAL_FORM: FormFeedback = { status: 'neutral' };
export const CORRECT_FORM: FormFeedback = { status: 'correct' };
export const FORM_DISPLAY_CONFIG = { errorHoldMs: 250, clearDelayMs: 200 } as const;
// Canvas reads these theme variables; CSS also uses them for the readable hint.
export const POSE_COLORS = { neutral: '--pose-neutral', correct: '--pose-correct', warning: '--pose-warning', error: '--pose-error' } as const;

export const ERROR_REGION_MAP = {
  squat: { too_shallow: ['legs'], knees_in: ['legs'], torso_lean: ['torso', 'hips'], incomplete_lockout: ['legs'] },
  'jumping-jack': { arms_too_low: ['arms'], legs_too_narrow: ['legs'], incomplete_return: ['arms', 'legs'] },
  'push-up': { too_shallow: ['arms'], incomplete_lockout: ['arms'], body_alignment: ['torso', 'hips'] },
} as const satisfies {
  squat: Record<SquatErrorCode, readonly BodyRegion[]>;
  'jumping-jack': Record<JumpingJackErrorCode, readonly BodyRegion[]>;
  'push-up': Record<PushUpErrorCode, readonly BodyRegion[]>;
};

/** Adapt existing detector output; never invent errors the detector cannot measure. */
export function toFormFeedback(exercise: ExerciseType, result: {
  formStatus: 'idle' | 'good' | 'error'; errorCode: string | null; feedback: string | null; trackingStatus: string; phase?: string;
}): FormFeedback {
  if (result.formStatus === 'error' && result.errorCode) {
    const map: Record<string, readonly BodyRegion[]> = ERROR_REGION_MAP[exercise];
    return { status: 'error', message: result.feedback ?? undefined, regions: map[result.errorCode] ?? [] };
  }
  // JackDetector reports 'good' at completion; its confirmed open phase already
  // proves both arm height and leg width without needing to wait for the rep.
  return result.trackingStatus === 'ready' && (result.formStatus === 'good' ||
    exercise === 'jumping-jack' && result.phase === 'open') ? CORRECT_FORM : NEUTRAL_FORM;
}

const JOINTS: Record<BodyRegion, readonly number[]> = {
  left_arm: [11, 13, 15, 17, 19, 21], right_arm: [12, 14, 16, 18, 20, 22],
  arms: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
  torso: [11, 12, 23, 24], hips: [23, 24],
  left_leg: [23, 25, 27, 29, 31], right_leg: [24, 26, 28, 30, 32],
  legs: [23, 24, 25, 26, 27, 28, 29, 30, 31, 32], full_body: Array.from({ length: 33 }, (_, i) => i),
};
function affected(start: number, end: number | undefined, regions: readonly BodyRegion[] = []) {
  return regions.some(region => JOINTS[region].includes(start) && (end === undefined ||
    // Shoulders shared by arms must not color the shoulder crossbar red.
    JOINTS[region].includes(end) && !(region === 'arms' && [start, end].every(id => id === 11 || id === 12)) &&
    !(region === 'legs' && [start, end].every(id => id === 23 || id === 24))));
}
export function poseColorStatus(feedback: FormFeedback, start: number, end?: number): FormStatus {
  if (feedback.status === 'error' || feedback.status === 'warning') {
    return affected(start, end, feedback.regions) ? feedback.status : 'neutral';
  }
  return feedback.status;
}
