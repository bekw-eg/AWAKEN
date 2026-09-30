import { distance, normalizedRatio } from './angles';
import type {
  JumpingJackConfig,
  JumpingJackDetectionResult,
  JumpingJackFrame,
  JumpingJackMetrics,
  JumpingJackPhase,
  JumpingJackErrorCode,
  PosePoint,
} from './types';

const DEFAULT_CONFIG: JumpingJackConfig = {
  minVisibility: 0.55,
  minPresence: 0.5,
  maxFrameGapMs: 1000,

  closedAnkleRatioMax: 1.5,
  openAnkleRatioMin: 1.9,

  openWristHeightRatioMax: -0.05,

  transitionHoldMs: 100,
  openHoldMs: 100,
  closedHoldMs: 100,

  formErrorHoldMs: 700,
  repCooldownMs: 450,
};

// Image-space Y differences, not body-size ratios. One wrist may lag near shoulder height.
const OTHER_WRIST_HEIGHT_MAX = 0.02;
const WRIST_MOVEMENT_DELTA = 0.02;
const ANKLE_MOVEMENT_DELTA = 0.1;

const JUMPING_JACK_FEEDBACK: Record<JumpingJackErrorCode, string> = {
  arms_too_low: 'Подними руки выше',
  legs_too_narrow: 'Разведи ноги шире',
  incomplete_return: 'Полностью вернись в исходное положение',
};

export class JumpingJackDetector {
  public config: JumpingJackConfig;

  private phase: JumpingJackPhase = 'closed';
  private repCount = 0;
  private repJustCounted = false;
  private formStatus: 'idle' | 'good' | 'error' = 'idle';
  private errorCode: JumpingJackErrorCode | null = null;
  private feedback: string | null = null;
  private trackingStatus: JumpingJackDetectionResult['trackingStatus'] = 'searching';
  
  private metrics: JumpingJackMetrics = {
    ankleWidthRatio: null,
    leftWristHeightRatio: null,
    rightWristHeightRatio: null,
  };

  private lastTimestampMs: number | null = null;
  private lastReliableTimestampMs: number | null = null;
  private lastRepTimestampMs = -Infinity;
  private hasClosedStart = false;
  private openSince: number | null = null;
  private closedSince: number | null = null;
  private transitionSince: number | null = null;
  private pendingError: { code: JumpingJackErrorCode; since: number; anchor: JumpingJackMetrics } | null = null;

  constructor(config?: Partial<JumpingJackConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public update(frame: JumpingJackFrame): JumpingJackDetectionResult {
    this.repJustCounted = false;

    const { timestampMs, landmarks, worldLandmarks } = frame;
    if (!Number.isFinite(timestampMs) || (this.lastTimestampMs !== null && timestampMs <= this.lastTimestampMs)) {
      return this.getResult();
    }
    // Measure the gap from usable tracking, so a stream of invisible frames cannot keep an attempt alive.
    if (this.lastReliableTimestampMs !== null && timestampMs - this.lastReliableTimestampMs > this.config.maxFrameGapMs) {
      this.resetAttempt();
    }
    
    this.lastTimestampMs = timestampMs;

    const isValid = landmarks && worldLandmarks && this.extractMetrics(landmarks, worldLandmarks);
    if (!isValid) {
      // Keep the accepted phase across a brief occlusion, but never count unseen time as a hold.
      this.clearHolds();
      this.clearError();
      this.clearMetrics();
      this.trackingStatus = landmarks && worldLandmarks ? 'unreliable' : 'searching';
      this.feedback = landmarks && worldLandmarks ? 'Покажи тело полностью' : 'SEARCHING FOR USER...';
      return this.getResult();
    }

    if (this.trackingStatus !== 'ready') this.clearError();
    this.lastReliableTimestampMs = timestampMs;
    this.trackingStatus = 'ready';
    this.processFSM(timestampMs);

    return this.getResult();
  }

  public pause(): JumpingJackDetectionResult {
    // Explicit pause means the mode was disabled or its frame timeout expired.
    this.repJustCounted = false;
    this.resetAttempt();
    this.clearMetrics();
    this.trackingStatus = 'searching';
    this.formStatus = 'idle';
    this.feedback = 'SEARCHING FOR USER...';
    return this.getResult();
  }

  public reset(): JumpingJackDetectionResult {
    this.repCount = 0;
    this.repJustCounted = false;
    this.lastTimestampMs = null;
    this.lastReliableTimestampMs = null;
    this.lastRepTimestampMs = -Infinity;
    return this.pause();
  }

  public getResult(): JumpingJackDetectionResult {
    return {
      phase: this.phase,
      repCount: this.repCount,
      repJustCounted: this.repJustCounted,
      formStatus: this.formStatus,
      errorCode: this.errorCode,
      feedback: this.feedback,
      metrics: { ...this.metrics },
      trackingStatus: this.trackingStatus,
    };
  }

  private clearHolds() {
    this.openSince = null;
    this.closedSince = null;
    this.transitionSince = null;
  }

  private clearMetrics() {
    this.metrics = { ankleWidthRatio: null, leftWristHeightRatio: null, rightWristHeightRatio: null };
  }

  private resetAttempt() {
    this.phase = 'closed';
    this.hasClosedStart = false;
    this.clearHolds();
    this.clearError();
  }

  private extractMetrics(landmarks: readonly PosePoint[], worldLandmarks: readonly PosePoint[]): boolean {
    const minVis = this.config.minVisibility;

    // Indices:
    // Shoulders: 11 (L), 12 (R)
    // Wrists: 15 (L), 16 (R)
    // Ankles: 27 (L), 28 (R)
    const reqLandmarks = [11, 12, 15, 16, 27, 28];
    for (const idx of reqLandmarks) {
      const lm = landmarks[idx];
      const wlm = worldLandmarks[idx];
      if ([lm, wlm].some(point => !point || ![point.x, point.y, point.z].every(Number.isFinite)
        || !Number.isFinite(point.visibility ?? 1) || (point.visibility ?? 1) < minVis
        || !Number.isFinite(point.presence ?? 1) || (point.presence ?? 1) < this.config.minPresence)) return false;
      // Confidence alone does not prove a joint is inside the camera image.
      if (lm.x < 0 || lm.x > 1 || lm.y < 0 || lm.y > 1) return false;
    }

    // Normalized Ankle Width Ratio using world landmarks
    const lShoulderW = worldLandmarks[11];
    const rShoulderW = worldLandmarks[12];
    const lAnkleW = worldLandmarks[27];
    const rAnkleW = worldLandmarks[28];

    const shoulderWidth = distance(lShoulderW, rShoulderW);
    const ankleWidth = distance(lAnkleW, rAnkleW);
    
    this.metrics.ankleWidthRatio = normalizedRatio(ankleWidth, shoulderWidth);

    // Legacy API names: these are differences in normalized image Y, not actual ratios.
    const lShoulder = landmarks[11];
    const rShoulder = landmarks[12];
    const lWrist = landmarks[15];
    const rWrist = landmarks[16];

    this.metrics.leftWristHeightRatio = lWrist.y - lShoulder.y;
    this.metrics.rightWristHeightRatio = rWrist.y - rShoulder.y;

    return this.metrics.ankleWidthRatio !== null;
  }

  private processFSM(timestampMs: number) {
    const { ankleWidthRatio, leftWristHeightRatio, rightWristHeightRatio } = this.metrics;
    if (ankleWidthRatio === null || leftWristHeightRatio === null || rightWristHeightRatio === null) return;

    const armsAreHigh =
      (leftWristHeightRatio < this.config.openWristHeightRatioMax && rightWristHeightRatio < OTHER_WRIST_HEIGHT_MAX) ||
      (rightWristHeightRatio < this.config.openWristHeightRatioMax && leftWristHeightRatio < OTHER_WRIST_HEIGHT_MAX);
    const legsAreWide = ankleWidthRatio > this.config.openAnkleRatioMin;
    const isClosedPosition = ankleWidthRatio < this.config.closedAnkleRatioMax && leftWristHeightRatio > 0 && rightWristHeightRatio > 0;
    const isOpenPosition = armsAreHigh && legsAreWide;
    this.openSince = isOpenPosition ? this.openSince ?? timestampMs : null;
    this.closedSince = isClosedPosition ? this.closedSince ?? timestampMs : null;
    const held = (since: number | null, duration: number) => since !== null && timestampMs - since >= duration;

    // Starting the camera in an open pose is not the start of a rep.
    if (!this.hasClosedStart) {
      if (held(this.closedSince, this.config.closedHoldMs)) {
        this.hasClosedStart = true;
        this.clearError();
      }
      return;
    }

    switch (this.phase) {
      case 'closed': {
        this.transitionSince = !isClosedPosition ? this.transitionSince ?? timestampMs : null;
        if (held(this.transitionSince, this.config.transitionHoldMs)) this.setPhase('opening');
        break;
      }
      
      case 'opening': {
        if (held(this.openSince, this.config.openHoldMs)) this.setPhase('open');
        else if (held(this.closedSince, this.config.closedHoldMs)) {
          // An incomplete attempt earns no rep. Resting arms do not prove an arms error.
          this.setPhase('closed');
        } else this.updateFormError(isClosedPosition ? null
          : legsAreWide && !armsAreHigh ? 'arms_too_low'
          : armsAreHigh && !legsAreWide ? 'legs_too_narrow' : null, timestampMs);
        break;
      }

      case 'open': {
        this.transitionSince = !isOpenPosition ? this.transitionSince ?? timestampMs : null;
        if (held(this.transitionSince, this.config.transitionHoldMs)) this.setPhase('closing');
        break;
      }

      case 'closing': {
        if (held(this.closedSince, this.config.closedHoldMs)) {
          this.setPhase('closed');
          if (timestampMs - this.lastRepTimestampMs >= this.config.repCooldownMs) {
            this.repCount++;
            this.repJustCounted = true;
            this.lastRepTimestampMs = timestampMs;
            this.setGoodForm();
          }
        } else if (held(this.openSince, this.config.openHoldMs)) this.setPhase('open');
        else this.updateFormError(isClosedPosition || isOpenPosition ? null : 'incomplete_return', timestampMs);
        break;
      }
    }
  }

  private setPhase(newPhase: JumpingJackPhase) {
    this.phase = newPhase;
    this.transitionSince = null;
    this.clearError();
  }

  private updateFormError(code: JumpingJackErrorCode | null, timestampMs: number) {
    if (!code) { this.clearError(); return; }
    const pending = this.pendingError;
    // Compare against an anchor, not the preceding frame: slow, continuous movement also resets the hold.
    const moved = pending && (
      Math.abs(this.metrics.leftWristHeightRatio! - pending.anchor.leftWristHeightRatio!) > WRIST_MOVEMENT_DELTA ||
      Math.abs(this.metrics.rightWristHeightRatio! - pending.anchor.rightWristHeightRatio!) > WRIST_MOVEMENT_DELTA ||
      Math.abs(this.metrics.ankleWidthRatio! - pending.anchor.ankleWidthRatio!) > ANKLE_MOVEMENT_DELTA
    );
    if (!pending || pending.code !== code || moved) {
      this.clearError();
      this.pendingError = { code, since: timestampMs, anchor: { ...this.metrics } };
    } else if (timestampMs - pending.since >= this.config.formErrorHoldMs) this.setError(code);
  }

  private setError(code: JumpingJackErrorCode) {
    this.formStatus = 'error';
    this.errorCode = code;
    this.feedback = JUMPING_JACK_FEEDBACK[code];
  }

  private setGoodForm() {
    this.formStatus = 'good';
    this.errorCode = null;
    this.feedback = 'GOOD FORM';
  }

  private clearError() {
    this.pendingError = null;
    this.formStatus = 'idle';
    this.errorCode = null;
    this.feedback = null;
  }
}
