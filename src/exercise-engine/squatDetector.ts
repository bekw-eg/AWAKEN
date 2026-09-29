import { angle, distance, leanFromVertical, midpoint, normalizedRatio } from './angles';
import type { PosePoint, SquatConfig, SquatDetectionResult, SquatErrorCode, SquatFrame, SquatMetrics, SquatPhase, TrackingStatus } from './types';

/** Demo thresholds, not biomechanical or medical standards. Tune against real recordings. */
export const DEFAULT_SQUAT_CONFIG: Readonly<SquatConfig> = {
  minVisibility: 0.6,
  minPresence: 0.6,
  frameMargin: 0.01,
  minFrontFacingRatio: 0.65,
  minStanceToTorsoRatio: 0.2,
  calibrationMs: 1000,
  calibrationMinFrames: 12,
  calibrationMaxLeanDeg: 25,
  calibrationKneeAngleMin: 150,
  standingAngleToleranceDeg: 5,
  calibrationMaxHipDrift: 0.08,
  maxBodyScaleChange: 0.25,
  standingKneeAngleMin: 155,
  descendingKneeAngleMax: 150,
  bottomKneeAngleMax: 120,
  bottomExitKneeAngleMin: 130,
  minAttemptHipDrop: 0.06,
  minHipDepthDelta: 0.18,
  frontalStartHipDrop: 0.08,
  frontalDepthHipDrop: 0.25,
  frontalThighCompression: 0.10,
  frontalDirectionDelta: 0.08,
  frontalLockoutCompression: 0.02,
  maxStandingHipDelta: 0.1,
  maxTorsoLeanDeg: 35,
  minKneeDistanceRatio: 0.65,
  directionAngleDelta: 10,
  progressAngleDelta: 3,
  transitionHoldMs: 80,
  bottomHoldMs: 40,
  standingHoldMs: 100,
  formErrorHoldMs: 180,
  shallowFeedbackDelayMs: 1000,
  lockoutFeedbackDelayMs: 800,
  minRepDurationMs: 650,
  maxAttemptDurationMs: 15000,
  repCooldownMs: 900,
  feedbackHoldMs: 1600,
  smoothingTimeMs: 80,
  maxFrameGapMs: 400,
};

export const SQUAT_FEEDBACK: Record<SquatErrorCode, string> = {
  too_shallow: 'Присядь ниже',
  knees_in: 'Разведи колени',
  torso_lean: 'Держи корпус ровнее',
  incomplete_lockout: 'Полностью выпрямись в верхней точке',
};
const REQUIRED = [11, 12, 23, 24, 25, 26, 27, 28] as const;
const EMPTY_METRICS: SquatMetrics = {
  leftKneeAngle: null, rightKneeAngle: null, avgKneeAngle: null,
  torsoLeanDeg: null, kneeDistanceRatio: null, hipDepthDelta: null, imageHipDepthDelta: null,
};
type Measurement = {
  leftKneeAngle: number; rightKneeAngle: number; avgKneeAngle: number;
  torsoLeanDeg: number; kneeDistanceRatio: number; hipHeight: number; torsoLength: number;
  imageHipHeight: number; imageTorsoLength: number; leftThighHeight: number; rightThighHeight: number;
};
type Attempt = {
  startedAt: number;
  reachedBottom: boolean;
  imageDepthUsed: boolean;
  minAngle: number;
  maxAscentAngle: number;
  progressAngle: number;
  lastProgressAt: number;
  maxImageDepth: number;
  minAscentImageDepth: number;
  progressImageDepth: number;
  errors: Set<SquatErrorCode>;
};

export class SquatDetector {
  readonly config: Readonly<SquatConfig>;
  private phase: SquatPhase = 'standing';
  private repCount = 0;
  private lastTimestamp: number | null = null;
  private lastFinishedAt = -Infinity;
  private baseline: Measurement | null = null;
  private calibration: { since: number; samples: Measurement[] } | null = null;
  private smooth: Measurement | null = null;
  private attempt: Attempt | null = null;
  private armed = false;
  private holds = new Map<string, number>();
  private outcome: { at: number; error: SquatErrorCode | null } | null = null;
  private result: SquatDetectionResult;

  constructor(config: Partial<SquatConfig> = {}) {
    this.config = Object.freeze({ ...DEFAULT_SQUAT_CONFIG, ...config });
    this.result = this.neutral('searching');
  }

  getResult(): SquatDetectionResult { return this.result; }

  /** Tracking loss cancels the in-flight attempt, but preserves completed reps. */
  pause(): SquatDetectionResult {
    this.clearTracking();
    this.result = this.neutral('searching');
    return this.result;
  }

  reset(): SquatDetectionResult {
    this.repCount = 0;
    this.lastTimestamp = null;
    this.lastFinishedAt = -Infinity;
    return this.pause();
  }

  update(frame: SquatFrame): SquatDetectionResult {
    const now = frame.timestampMs;
    // Re-rendering/replaying a frame must not advance a timer or emit a second rep event.
    if (!Number.isFinite(now) || (this.lastTimestamp !== null && now <= this.lastTimestamp)) {
      this.result = { ...this.result, repJustCounted: false };
      return this.result;
    }
    const dt = this.lastTimestamp === null ? 0 : now - this.lastTimestamp;
    this.lastTimestamp = now;
    if (dt > this.config.maxFrameGapMs) this.clearTracking();

    const measured = this.measure(frame);
    if (typeof measured === 'string') {
      this.clearTracking();
      this.result = this.neutral(measured);
      return this.result;
    }
    if (this.baseline && Math.abs(measured.torsoLength / this.baseline.torsoLength - 1) > this.config.maxBodyScaleChange) {
      this.clearTracking();
      this.result = this.neutral('unreliable');
      return this.result;
    }

    const alpha = this.config.smoothingTimeMs <= 0 ? 1 : 1 - Math.exp(-dt / this.config.smoothingTimeMs);
    if (this.smooth) {
      for (const key of Object.keys(measured) as (keyof Measurement)[]) {
        this.smooth[key] += alpha * (measured[key] - this.smooth[key]);
      }
    } else this.smooth = { ...measured };
    const m = this.smooth;
    const leftTopAngle = this.baseline ? Math.min(this.config.standingKneeAngleMin,
      this.baseline.leftKneeAngle - this.config.standingAngleToleranceDeg) : this.config.calibrationKneeAngleMin;
    const rightTopAngle = this.baseline ? Math.min(this.config.standingKneeAngleMin,
      this.baseline.rightKneeAngle - this.config.standingAngleToleranceDeg) : this.config.calibrationKneeAngleMin;
    const straight = m.leftKneeAngle >= leftTopAngle && m.rightKneeAngle >= rightTopAngle;

    if (!this.baseline) {
      const upright = straight && m.torsoLeanDeg <= this.config.calibrationMaxLeanDeg &&
        m.kneeDistanceRatio >= this.config.minKneeDistanceRatio;
      if (!upright) this.calibration = null;
      else {
        const first = this.calibration?.samples[0];
        if (!first || Math.abs(m.hipHeight - first.hipHeight) / first.torsoLength > this.config.calibrationMaxHipDrift) {
          this.calibration = { since: now, samples: [] };
        }
        this.calibration!.samples.push({ ...m });
        const { since, samples } = this.calibration!;
        if (now - since >= this.config.calibrationMs && samples.length >= this.config.calibrationMinFrames) {
          const median = (key: keyof Measurement) => {
            const values = samples.map((sample) => sample[key]).sort((a, b) => a - b);
            return values[Math.floor(values.length / 2)];
          };
          this.baseline = { ...m };
          for (const key of Object.keys(m) as (keyof Measurement)[]) this.baseline[key] = median(key);
          this.calibration = null;
          this.armed = true;
        }
      }
      if (!this.baseline) {
        const progress = this.calibration ? Math.min(1, (now - this.calibration.since) / this.config.calibrationMs,
          this.calibration.samples.length / this.config.calibrationMinFrames) : 0;
        this.result = {
          ...this.neutral('calibrating'),
          metrics: { ...m, hipDepthDelta: null, imageHipDepthDelta: null },
          calibrationProgress: progress,
          feedback: !straight ? 'Полностью выпрямись для калибровки' :
            m.torsoLeanDeg > this.config.calibrationMaxLeanDeg ? 'Выпрями корпус для калибровки' :
            m.kneeDistanceRatio < this.config.minKneeDistanceRatio ? 'Разведи колени для калибровки' :
            'Стой прямо — запоминаю исходное положение',
        };
        return this.result;
      }
    }

    const hipDepthDelta = (this.baseline.hipHeight - m.hipHeight) / this.baseline.torsoLength;
    // Image heights are divided by shoulder width before calibration: translation and
    // uniform changes in camera distance cannot masquerade as lowering the hips.
    const imageHipDepthDelta = (this.baseline.imageHipHeight - m.imageHipHeight) / this.baseline.imageTorsoLength;
    const leftCompression = (this.baseline.leftThighHeight - m.leftThighHeight) / this.baseline.leftThighHeight;
    const rightCompression = (this.baseline.rightThighHeight - m.rightThighHeight) / this.baseline.rightThighHeight;
    const imageExtended = Math.max(leftCompression, rightCompression) <= this.config.frontalLockoutCompression;
    const metrics: SquatMetrics = {
      leftKneeAngle: m.leftKneeAngle, rightKneeAngle: m.rightKneeAngle, avgKneeAngle: m.avgKneeAngle,
      torsoLeanDeg: m.torsoLeanDeg, kneeDistanceRatio: m.kneeDistanceRatio, hipDepthDelta, imageHipDepthDelta,
    };
    const atTop = imageExtended && (straight || this.attempt?.imageDepthUsed === true) &&
      Math.abs(imageHipDepthDelta) <= this.config.maxStandingHipDelta;
    let repJustCounted = false;

    if (!this.attempt) {
      if (!this.armed && this.held('rearm', atTop, now, this.config.standingHoldMs)) this.armed = true;
      const worldDescending = m.avgKneeAngle <= this.config.descendingKneeAngleMax && hipDepthDelta >= this.config.minAttemptHipDrop;
      const imageDescending = imageHipDepthDelta >= this.config.frontalStartHipDrop &&
        Math.min(leftCompression, rightCompression) > this.config.frontalLockoutCompression;
      const descending = worldDescending || imageDescending;
      if (this.armed && this.held('start', descending, now, this.config.transitionHoldMs)) {
        this.attempt = {
          startedAt: now, reachedBottom: false, imageDepthUsed: false, minAngle: m.avgKneeAngle,
          maxAscentAngle: m.avgKneeAngle, progressAngle: m.avgKneeAngle, lastProgressAt: now, errors: new Set(),
          maxImageDepth: imageHipDepthDelta, minAscentImageDepth: imageHipDepthDelta, progressImageDepth: imageHipDepthDelta,
        };
        this.phase = 'descending';
        this.armed = false;
        this.outcome = null;
        this.holds.clear();
      }
    }

    const attempt = this.attempt;
    if (attempt) {
      if (now - attempt.startedAt > this.config.maxAttemptDurationMs) {
        this.clearTracking();
        this.result = this.neutral('calibrating');
        return this.result;
      }
      if (this.held('knees', m.kneeDistanceRatio < this.config.minKneeDistanceRatio, now, this.config.formErrorHoldMs)) {
        attempt.errors.add('knees_in');
      }
      if (this.held('torso', m.torsoLeanDeg > this.config.maxTorsoLeanDeg, now, this.config.formErrorHoldMs)) {
        attempt.errors.add('torso_lean');
      }
      attempt.minAngle = Math.min(attempt.minAngle, m.avgKneeAngle);
      attempt.maxImageDepth = Math.max(attempt.maxImageDepth, imageHipDepthDelta);
      const goingUp = this.phase === 'ascending';
      if ((goingUp && m.avgKneeAngle > attempt.progressAngle + this.config.progressAngleDelta) ||
          (!goingUp && m.avgKneeAngle < attempt.progressAngle - this.config.progressAngleDelta) ||
          (goingUp && imageHipDepthDelta < attempt.progressImageDepth - this.config.frontalDirectionDelta) ||
          (!goingUp && imageHipDepthDelta > attempt.progressImageDepth + this.config.frontalDirectionDelta)) {
        attempt.progressAngle = m.avgKneeAngle;
        attempt.lastProgressAt = now;
        attempt.progressImageDepth = imageHipDepthDelta;
      }

      if (this.phase === 'descending') {
        const worldDeep = m.avgKneeAngle <= this.config.bottomKneeAngleMax &&
          hipDepthDelta >= this.config.minHipDepthDelta;
        const imageDeep = imageHipDepthDelta >= this.config.frontalDepthHipDrop &&
          Math.min(leftCompression, rightCompression) >= this.config.frontalThighCompression;
        const deep = worldDeep || imageDeep;
        if (this.held('depth', deep, now, this.config.bottomHoldMs)) {
          attempt.reachedBottom = true;
          attempt.imageDepthUsed = !worldDeep;
          this.changePhase('bottom', now, m.avgKneeAngle, imageHipDepthDelta);
        } else if (this.held('reverse', m.avgKneeAngle >= attempt.minAngle + this.config.directionAngleDelta ||
            imageHipDepthDelta <= attempt.maxImageDepth - this.config.frontalDirectionDelta, now, this.config.transitionHoldMs)) {
          this.changePhase('ascending', now, m.avgKneeAngle, imageHipDepthDelta);
        }
      } else if (this.phase === 'bottom') {
        const rising = (m.avgKneeAngle >= this.config.bottomExitKneeAngleMin &&
          m.avgKneeAngle >= attempt.minAngle + this.config.directionAngleDelta) ||
          imageHipDepthDelta <= attempt.maxImageDepth - this.config.frontalDirectionDelta;
        if (this.held('rise', rising, now, this.config.transitionHoldMs)) {
          this.changePhase('ascending', now, m.avgKneeAngle, imageHipDepthDelta);
        }
      } else if (this.phase === 'ascending') {
        attempt.maxAscentAngle = Math.max(attempt.maxAscentAngle, m.avgKneeAngle);
        attempt.minAscentImageDepth = Math.min(attempt.minAscentImageDepth, imageHipDepthDelta);
        if (this.held('top', atTop, now, this.config.standingHoldMs)) {
          const error = !attempt.reachedBottom ? 'too_shallow' : this.firstError(attempt.errors);
          if (!error && now - attempt.startedAt >= this.config.minRepDurationMs &&
              now - this.lastFinishedAt >= this.config.repCooldownMs) {
            this.repCount += 1;
            repJustCounted = true;
          }
          this.outcome = repJustCounted ? { at: now, error: null } : error ? { at: now, error } : null;
          this.lastFinishedAt = now;
          this.attempt = null;
          this.phase = 'standing';
          // The top has already been confirmed. Requiring a second hold loses continuous reps.
          this.armed = true;
          this.holds.clear();
        } else if (this.held('bounce', m.avgKneeAngle <= attempt.maxAscentAngle - this.config.directionAngleDelta ||
            imageHipDepthDelta >= attempt.minAscentImageDepth + this.config.frontalDirectionDelta, now, this.config.transitionHoldMs)) {
          // A second descent before full extension cannot reuse a previous bottom.
          attempt.errors.add('incomplete_lockout');
          attempt.minAngle = m.avgKneeAngle;
          attempt.maxImageDepth = imageHipDepthDelta;
          this.changePhase('descending', now, m.avgKneeAngle, imageHipDepthDelta);
        }
      }
    }

    const current = this.attempt;
    let errorCode: SquatErrorCode | null = null;
    if (current) {
      const shallow = !current.reachedBottom && (this.phase === 'ascending' ||
        now - current.lastProgressAt >= this.config.shallowFeedbackDelayMs);
      errorCode = shallow ? 'too_shallow' : this.firstError(current.errors);
      if (!errorCode && this.phase === 'ascending' && !atTop &&
          now - current.lastProgressAt >= this.config.lockoutFeedbackDelayMs) errorCode = 'incomplete_lockout';
    } else if (this.outcome && now - this.outcome.at < this.config.feedbackHoldMs) errorCode = this.outcome.error;

    const justFinished = !current && this.outcome && now - this.outcome.at < this.config.feedbackHoldMs;
    this.result = {
      phase: this.phase, repCount: this.repCount, repJustCounted,
      formStatus: errorCode ? 'error' : 'good', errorCode,
      feedback: errorCode ? SQUAT_FEEDBACK[errorCode] : justFinished && !this.outcome!.error ? 'Повтор засчитан · REP +1' :
        this.phase === 'descending' ? 'Опускай таз ниже — проверяю глубину' :
        this.phase === 'bottom' ? 'Глубина достигнута — поднимайся' :
        this.phase === 'ascending' ? 'Вернись в исходную стойку, чтобы засчитать повтор' : null,
      metrics, trackingStatus: 'ready', calibrationProgress: 1,
    };
    return this.result;
  }

  private measure(frame: SquatFrame): Measurement | 'searching' | 'unreliable' | 'sideways' {
    if (!frame.landmarks?.length) return 'searching';
    const image = frame.landmarks;
    const world = frame.worldLandmarks;
    const reliable = (point: PosePoint | undefined) => point &&
      [point.x, point.y, point.z].every(Number.isFinite) &&
      Number.isFinite(point.visibility) && (point.visibility ?? 0) >= this.config.minVisibility &&
      Number.isFinite(point.presence ?? 1) && (point.presence ?? 1) >= this.config.minPresence;
    const margin = this.config.frameMargin;
    if (!world || REQUIRED.some((id) => !reliable(image[id]) || !reliable(world[id]) ||
        image[id].x < margin || image[id].x > 1 - margin || image[id].y < margin || image[id].y > 1 - margin)) return 'unreliable';

    const shoulders = midpoint(world[11], world[12]);
    const hips = midpoint(world[23], world[24]);
    const ankles = midpoint(world[27], world[28]);
    const torsoLength = distance(shoulders, hips);
    const shoulderFacing = normalizedRatio(Math.abs(world[11].x - world[12].x), distance(world[11], world[12]));
    const hipFacing = normalizedRatio(Math.abs(world[23].x - world[24].x), distance(world[23], world[24]));
    if (shoulderFacing === null || hipFacing === null) return 'unreliable';
    if (Math.min(shoulderFacing, hipFacing) < this.config.minFrontFacingRatio) return 'sideways';
    const stance = Math.abs(world[27].x - world[28].x);
    const stanceRatio = normalizedRatio(stance, torsoLength);
    if (stanceRatio === null || stanceRatio < this.config.minStanceToTorsoRatio) return 'unreliable';
    const leftKneeAngle = angle(world[23], world[25], world[27]);
    const rightKneeAngle = angle(world[24], world[26], world[28]);
    const torsoLeanDeg = leanFromVertical(shoulders, hips);
    const kneeDistanceRatio = normalizedRatio(Math.abs(world[25].x - world[26].x), stance);
    const imageShoulders = midpoint(image[11], image[12]);
    const imageHips = midpoint(image[23], image[24]);
    const imageAnkles = midpoint(image[27], image[28]);
    const imageWidth = Math.abs(image[11].x - image[12].x);
    const imageHipHeight = normalizedRatio(imageAnkles.y - imageHips.y, imageWidth);
    const imageTorsoLength = normalizedRatio(imageHips.y - imageShoulders.y, imageWidth);
    const leftThighHeight = normalizedRatio(image[25].y - image[23].y, imageWidth);
    const rightThighHeight = normalizedRatio(image[26].y - image[24].y, imageWidth);
    if (leftKneeAngle === null || rightKneeAngle === null || torsoLeanDeg === null || kneeDistanceRatio === null ||
        imageHipHeight === null || imageTorsoLength === null || imageTorsoLength <= 0 ||
        leftThighHeight === null || rightThighHeight === null || ankles.y <= hips.y) return 'unreliable';
    return {
      leftKneeAngle, rightKneeAngle, avgKneeAngle: (leftKneeAngle + rightKneeAngle) / 2,
      torsoLeanDeg, kneeDistanceRatio, hipHeight: ankles.y - hips.y, torsoLength,
      imageHipHeight, imageTorsoLength, leftThighHeight, rightThighHeight,
    };
  }

  private held(key: string, condition: boolean, now: number, duration: number): boolean {
    if (!condition) { this.holds.delete(key); return false; }
    if (!this.holds.has(key)) this.holds.set(key, now);
    return now - this.holds.get(key)! >= duration;
  }

  private changePhase(phase: SquatPhase, now: number, kneeAngle: number, imageDepth: number) {
    this.phase = phase;
    // Keep form debounce timers across phase boundaries.
    for (const key of ['depth', 'reverse', 'rise', 'top', 'bounce']) this.holds.delete(key);
    if (this.attempt) {
      this.attempt.progressAngle = kneeAngle;
      this.attempt.lastProgressAt = now;
      this.attempt.maxAscentAngle = kneeAngle;
      this.attempt.minAscentImageDepth = imageDepth;
      this.attempt.progressImageDepth = imageDepth;
    }
  }

  private firstError(errors: Set<SquatErrorCode>): SquatErrorCode | null {
    return (['too_shallow', 'knees_in', 'torso_lean', 'incomplete_lockout'] as const).find((error) => errors.has(error)) ?? null;
  }

  private clearTracking() {
    this.phase = 'standing';
    this.baseline = null;
    this.calibration = null;
    this.smooth = null;
    this.attempt = null;
    this.armed = false;
    this.outcome = null;
    this.holds.clear();
  }

  private neutral(trackingStatus: TrackingStatus): SquatDetectionResult {
    const feedback: Record<TrackingStatus, string | null> = {
      searching: 'SEARCHING FOR USER…', unreliable: 'Покажи плечи, таз, колени и лодыжки. Проверь освещение.',
      sideways: 'Повернись лицом к камере', calibrating: 'Встань прямо и замри на секунду', ready: null,
    };
    return {
      phase: 'standing', repCount: this.repCount, repJustCounted: false,
      formStatus: 'idle', feedback: feedback[trackingStatus], errorCode: null,
      metrics: { ...EMPTY_METRICS }, trackingStatus, calibrationProgress: 0,
    };
  }
}
