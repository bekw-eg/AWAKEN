import type { Point3 } from './angles';

export type PosePoint = Point3 & { visibility?: number; presence?: number };
export type SquatPhase = 'standing' | 'descending' | 'bottom' | 'ascending';
export type SquatErrorCode = 'too_shallow' | 'knees_in' | 'torso_lean' | 'incomplete_lockout';
export type TrackingStatus = 'searching' | 'unreliable' | 'sideways' | 'calibrating' | 'ready';

export type SquatFrame = {
  landmarks: readonly PosePoint[] | null;
  worldLandmarks: readonly PosePoint[] | null;
  timestampMs: number;
};

export type SquatMetrics = {
  leftKneeAngle: number | null;
  rightKneeAngle: number | null;
  avgKneeAngle: number | null;
  torsoLeanDeg: number | null;
  kneeDistanceRatio: number | null;
  hipDepthDelta: number | null;
  imageHipDepthDelta: number | null;
};

export type SquatDetectionResult = {
  phase: SquatPhase;
  repCount: number;
  repJustCounted: boolean;
  formStatus: 'idle' | 'good' | 'error';
  feedback: string | null;
  errorCode: SquatErrorCode | null;
  metrics: SquatMetrics;
  trackingStatus: TrackingStatus;
  calibrationProgress: number;
};

export type SquatConfig = {
  minVisibility: number;
  minPresence: number;
  frameMargin: number;
  minFrontFacingRatio: number;
  minStanceToTorsoRatio: number;
  calibrationMs: number;
  calibrationMinFrames: number;
  calibrationMaxLeanDeg: number;
  calibrationKneeAngleMin: number;
  standingAngleToleranceDeg: number;
  calibrationMaxHipDrift: number;
  maxBodyScaleChange: number;
  standingKneeAngleMin: number;
  descendingKneeAngleMax: number;
  bottomKneeAngleMax: number;
  bottomExitKneeAngleMin: number;
  minAttemptHipDrop: number;
  minHipDepthDelta: number;
  frontalStartHipDrop: number;
  frontalDepthHipDrop: number;
  frontalThighCompression: number;
  frontalDirectionDelta: number;
  frontalLockoutCompression: number;
  maxStandingHipDelta: number;
  maxTorsoLeanDeg: number;
  minKneeDistanceRatio: number;
  directionAngleDelta: number;
  progressAngleDelta: number;
  transitionHoldMs: number;
  bottomHoldMs: number;
  standingHoldMs: number;
  formErrorHoldMs: number;
  shallowFeedbackDelayMs: number;
  lockoutFeedbackDelayMs: number;
  minRepDurationMs: number;
  maxAttemptDurationMs: number;
  repCooldownMs: number;
  feedbackHoldMs: number;
  smoothingTimeMs: number;
  maxFrameGapMs: number;
};

export type JumpingJackPhase = 'closed' | 'opening' | 'open' | 'closing';
export type JumpingJackErrorCode = 'arms_too_low' | 'legs_too_narrow' | 'incomplete_return';

export type JumpingJackFrame = {
  landmarks: readonly PosePoint[] | null;
  worldLandmarks: readonly PosePoint[] | null;
  timestampMs: number;
};

export type JumpingJackMetrics = {
  ankleWidthRatio: number | null;
  leftWristHeightRatio: number | null;
  rightWristHeightRatio: number | null;
};

export type JumpingJackDetectionResult = {
  phase: JumpingJackPhase;
  repCount: number;
  repJustCounted: boolean;
  formStatus: 'idle' | 'good' | 'error';
  feedback: string | null;
  errorCode: JumpingJackErrorCode | null;
  metrics: JumpingJackMetrics;
  trackingStatus: TrackingStatus;
};

export type JumpingJackConfig = {
  minVisibility: number;
  minPresence: number;
  maxFrameGapMs: number;

  closedAnkleRatioMax: number;
  openAnkleRatioMin: number;

  openWristHeightRatioMax: number; // Smaller Y is higher. 0 = top of screen.
  
  transitionHoldMs: number;
  openHoldMs: number;
  closedHoldMs: number;

  formErrorHoldMs: number;
  repCooldownMs: number;
};
