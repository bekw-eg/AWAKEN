import type { PosePoint } from './types';

export type PushUpSide = 'left' | 'right';
export type PushUpPhase = 'top' | 'descending' | 'bottom' | 'ascending';
export type PushUpErrorCode = 'too_shallow' | 'incomplete_lockout' | 'body_alignment';
export type PushUpTrackingStatus = 'searching' | 'unreliable' | 'wrong_angle' | 'ready';
export type PushUpFrame = {
  landmarks: readonly PosePoint[] | null;
  worldLandmarks: readonly PosePoint[] | null;
  timestampMs: number;
  /** Source video width / height; defaults to square pixels in a square image. */
  imageAspectRatio?: number;
};
export type PushUpDetectionResult = {
  phase: PushUpPhase;
  repCount: number;
  repJustCounted: boolean;
  formStatus: 'idle' | 'good' | 'error';
  errorCode: PushUpErrorCode | null;
  feedback: string | null;
  trackingStatus: PushUpTrackingStatus;
  activeSide: PushUpSide | null;
  metrics: { elbowAngle: number | null; bodyAngle: number | null; hipOffsetRatio: number | null; kneeAngle: number | null };
};
export type PushUpConfig = {
  minVisibility: number;
  minLegVisibility: number;
  minPresence: number;
  frameMargin: number;
  sideSwitchScoreMargin: number;
  maxSidePairToTorsoRatio: number;
  maxBodyVerticalRatio: number;
  minKneeAngle: number;
  topElbowAngleMin: number;
  bottomElbowAngleMax: number;
  minBodyAngle: number;
  maxHipOffsetRatio: number;
  directionAngleDelta: number;
  progressAngleDelta: number;
  transitionHoldMs: number;
  bottomHoldMs: number;
  topHoldMs: number;
  formErrorHoldMs: number;
  lockoutFeedbackDelayMs: number;
  feedbackHoldMs: number;
  smoothingTimeMs: number;
  minRepDurationMs: number;
  maxAttemptDurationMs: number;
  repCooldownMs: number;
  maxFrameGapMs: number;
};
