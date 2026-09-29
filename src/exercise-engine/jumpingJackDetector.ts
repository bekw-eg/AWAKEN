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
  minVisibility: 0.65,
  minPresence: 0.5,
  maxFrameGapMs: 1000,

  closedAnkleRatioMax: 1.5,
  openAnkleRatioMin: 2.2,

  openWristHeightRatioMax: -0.15,

  transitionHoldMs: 150,
  openHoldMs: 150,
  closedHoldMs: 150,

  formErrorHoldMs: 300,
  repCooldownMs: 800,
};

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

  private lastTimestampMs = 0;
  private stateChangeTimestampMs = 0;
  private lastRepTimestampMs = 0;

  constructor(config?: Partial<JumpingJackConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public update(frame: JumpingJackFrame): JumpingJackDetectionResult {
    this.repJustCounted = false;

    if (!frame.landmarks || !frame.worldLandmarks) {
      return this.pause();
    }

    const { timestampMs, landmarks, worldLandmarks } = frame;

    if (this.lastTimestampMs === timestampMs) {
      return this.getResult();
    }

    if (timestampMs - this.lastTimestampMs > this.config.maxFrameGapMs) {
      this.resetAttempt(timestampMs);
    }
    
    this.lastTimestampMs = timestampMs;

    const isValid = this.extractMetrics(landmarks, worldLandmarks);
    if (!isValid) {
      this.trackingStatus = 'unreliable';
      this.formStatus = 'idle';
      this.feedback = 'Покажи тело полностью';
      return this.getResult();
    }

    this.trackingStatus = 'ready';
    this.processFSM(timestampMs);

    return this.getResult();
  }

  public pause(): JumpingJackDetectionResult {
    this.trackingStatus = 'searching';
    this.formStatus = 'idle';
    this.feedback = 'SEARCHING FOR USER...';
    return this.getResult();
  }

  public reset(): JumpingJackDetectionResult {
    this.repCount = 0;
    this.repJustCounted = false;
    this.resetAttempt(0);
    return this.getResult();
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

  private resetAttempt(timestampMs: number) {
    this.phase = 'closed';
    this.stateChangeTimestampMs = timestampMs;
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
      if ((lm.visibility ?? 1) < minVis || (wlm.visibility ?? 1) < minVis) return false;
    }

    // Normalized Ankle Width Ratio using world landmarks
    const lShoulderW = worldLandmarks[11];
    const rShoulderW = worldLandmarks[12];
    const lAnkleW = worldLandmarks[27];
    const rAnkleW = worldLandmarks[28];

    const shoulderWidth = distance(lShoulderW, rShoulderW);
    const ankleWidth = distance(lAnkleW, rAnkleW);
    
    this.metrics.ankleWidthRatio = normalizedRatio(ankleWidth, shoulderWidth);

    // Wrist height relative to shoulder (2D landmarks, Y goes down)
    const lShoulder = landmarks[11];
    const rShoulder = landmarks[12];
    const lWrist = landmarks[15];
    const rWrist = landmarks[16];

    this.metrics.leftWristHeightRatio = lWrist.y - lShoulder.y;
    this.metrics.rightWristHeightRatio = rWrist.y - rShoulder.y;

    return true;
  }

  private processFSM(timestampMs: number) {
    const { ankleWidthRatio, leftWristHeightRatio, rightWristHeightRatio } = this.metrics;
    if (ankleWidthRatio === null || leftWristHeightRatio === null || rightWristHeightRatio === null) return;

    const armsAreHigh = leftWristHeightRatio < this.config.openWristHeightRatioMax && rightWristHeightRatio < this.config.openWristHeightRatioMax;
    const legsAreWide = ankleWidthRatio > this.config.openAnkleRatioMin;
    const isClosedPosition = ankleWidthRatio < this.config.closedAnkleRatioMax && leftWristHeightRatio > 0 && rightWristHeightRatio > 0;

    const timeInState = timestampMs - this.stateChangeTimestampMs;

    switch (this.phase) {
      case 'closed': {
        if (!isClosedPosition && timeInState > this.config.transitionHoldMs) {
          this.setPhase('opening', timestampMs);
        }
        break;
      }
      
      case 'opening': {
        if (armsAreHigh && legsAreWide) {
          if (timeInState > this.config.openHoldMs) {
            this.setPhase('open', timestampMs);
          }
        } else if (isClosedPosition && timeInState > this.config.formErrorHoldMs) {
          // Returned back without fully opening
          if (!armsAreHigh) this.setError('arms_too_low');
          else if (!legsAreWide) this.setError('legs_too_narrow');
          this.setPhase('closed', timestampMs);
        } else if (timeInState > this.config.formErrorHoldMs * 2) {
          // Stuck in incorrect opening position
          if (!armsAreHigh) this.setError('arms_too_low');
          else if (!legsAreWide) this.setError('legs_too_narrow');
        }
        break;
      }

      case 'open': {
        if (!armsAreHigh || !legsAreWide) {
          if (timeInState > this.config.transitionHoldMs) {
            this.setPhase('closing', timestampMs);
          }
        }
        break;
      }

      case 'closing': {
        if (isClosedPosition) {
          if (timeInState > this.config.closedHoldMs) {
            if (this.lastRepTimestampMs === 0 || timestampMs - this.lastRepTimestampMs > this.config.repCooldownMs) {
              this.repCount++;
              this.repJustCounted = true;
              this.lastRepTimestampMs = timestampMs;
              this.setPhase('closed', timestampMs);
              this.setGoodForm();
            } else {
              this.setPhase('closed', timestampMs);
            }
          }
        } else if (armsAreHigh && legsAreWide && timeInState > this.config.formErrorHoldMs) {
           this.setPhase('open', timestampMs);
        } else if (timeInState > this.config.formErrorHoldMs * 2 && !isClosedPosition) {
           this.setError('incomplete_return');
        }
        break;
      }
    }
  }

  private setPhase(newPhase: JumpingJackPhase, timestampMs: number) {
    this.phase = newPhase;
    this.stateChangeTimestampMs = timestampMs;
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
    this.formStatus = 'idle';
    this.errorCode = null;
    this.feedback = null;
  }
}
