import { angle, distance } from './angles';
import type { PosePoint } from './types';
import type { PushUpConfig, PushUpDetectionResult, PushUpErrorCode, PushUpFrame, PushUpPhase, PushUpSide, PushUpTrackingStatus } from './pushUpTypes';

/** Demo values: tune with side-view webcam recordings, not medical standards. */
export const DEFAULT_PUSH_UP_CONFIG: Readonly<PushUpConfig> = {
  minVisibility: 0.6, minLegVisibility: 0.45, minPresence: 0.6, frameMargin: 0.01,
  sideSwitchScoreMargin: 0.1, maxSidePairToTorsoRatio: 0.55,
  maxBodyVerticalRatio: 0.6, minKneeAngle: 155,
  topElbowAngleMin: 160, bottomElbowAngleMax: 100,
  minBodyAngle: 155, maxHipOffsetRatio: 0.15,
  directionAngleDelta: 8, progressAngleDelta: 3,
  transitionHoldMs: 120, bottomHoldMs: 80, topHoldMs: 120,
  formErrorHoldMs: 180, lockoutFeedbackDelayMs: 900, feedbackHoldMs: 1600,
  smoothingTimeMs: 60, minRepDurationMs: 700, maxAttemptDurationMs: 15000,
  repCooldownMs: 700, maxFrameGapMs: 400,
};
export const PUSH_UP_FEEDBACK: Record<PushUpErrorCode, string> = {
  too_shallow: 'Опустись ниже', incomplete_lockout: 'Полностью выпрями руки',
  body_alignment: 'Держи корпус ровнее',
};
const SIDES = { left: [11, 13, 15, 23, 25, 27], right: [12, 14, 16, 24, 26, 28] } as const;
type Measurement = { elbowAngle: number; bodyAngle: number; hipOffsetRatio: number; kneeAngle: number };
type Attempt = {
  startedAt: number; reachedBottom: boolean; minAngle: number; maxAngle: number;
  progressAngle: number; lastProgressAt: number; errors: Set<PushUpErrorCode>;
};

export class PushUpDetector {
  readonly config: Readonly<PushUpConfig>;
  private phase: PushUpPhase = 'top';
  private repCount = 0;
  private side: PushUpSide | null = null;
  private armed = false;
  private attempt: Attempt | null = null;
  private lastTimestamp: number | null = null;
  private lastFinishedAt = -Infinity;
  private smoothAngle: number | null = null;
  private imageAspectRatio: number | null = null;
  private holds = new Map<string, number>();
  private outcome: { at: number; error: PushUpErrorCode | null } | null = null;
  private result: PushUpDetectionResult;

  constructor(config: Partial<PushUpConfig> = {}) {
    this.config = Object.freeze({ ...DEFAULT_PUSH_UP_CONFIG, ...config });
    this.result = this.neutral('searching');
  }
  getResult(): PushUpDetectionResult { return this.result; }
  pause(): PushUpDetectionResult {
    this.clearTracking();
    return this.result = this.neutral('searching');
  }
  reset(): PushUpDetectionResult {
    this.repCount = 0;
    this.lastTimestamp = null;
    this.lastFinishedAt = -Infinity;
    return this.pause();
  }

  update(frame: PushUpFrame): PushUpDetectionResult {
    const now = frame.timestampMs;
    if (!Number.isFinite(now) || (this.lastTimestamp !== null && now <= this.lastTimestamp)) {
      return this.result = { ...this.result, repJustCounted: false };
    }
    const dt = this.lastTimestamp === null ? 0 : now - this.lastTimestamp;
    this.lastTimestamp = now;
    if (dt > this.config.maxFrameGapMs) this.clearTracking();
    const aspect = frame.imageAspectRatio ?? 1;
    if (this.imageAspectRatio !== null && Math.abs(aspect - this.imageAspectRatio) > 1e-6) this.clearTracking();
    this.imageAspectRatio = aspect;
    const m = this.measure(frame);
    if (typeof m === 'string') {
      this.clearTracking();
      return this.result = this.neutral(m);
    }
    const c = this.config;
    const alpha = c.smoothingTimeMs <= 0 ? 1 : 1 - Math.exp(-dt / c.smoothingTimeMs);
    this.smoothAngle = this.smoothAngle === null ? m.elbowAngle : this.smoothAngle + alpha * (m.elbowAngle - this.smoothAngle);
    const elbow = this.smoothAngle;
    const aligned = m.bodyAngle >= c.minBodyAngle && m.hipOffsetRatio <= c.maxHipOffsetRatio && m.kneeAngle >= c.minKneeAngle;
    const atTop = elbow >= c.topElbowAngleMin && m.elbowAngle >= c.topElbowAngleMin && aligned;
    const badForm = this.held('form', !aligned, now, c.formErrorHoldMs);
    let repJustCounted = false;

    if (!this.attempt) {
      if (!this.armed && this.held('arm', atTop, now, c.topHoldMs)) this.armed = true;
      if (this.armed && this.held('start', elbow < c.topElbowAngleMin - c.directionAngleDelta, now, c.transitionHoldMs)) {
        this.attempt = { startedAt: this.holds.get('start')!, reachedBottom: false, minAngle: elbow,
          maxAngle: elbow, progressAngle: elbow, lastProgressAt: now, errors: new Set() };
        this.phase = 'descending';
        this.outcome = null;
        this.armed = false;
        this.clearTransitions();
      }
    }
    const a = this.attempt;
    if (a) {
      if (badForm) a.errors.add('body_alignment');
      a.minAngle = Math.min(a.minAngle, elbow);
      if (this.phase === 'ascending' && elbow > a.progressAngle + c.progressAngleDelta) {
        a.progressAngle = elbow;
        a.lastProgressAt = now;
      }
      if (now - a.startedAt > c.maxAttemptDurationMs) {
        this.finish(now, this.error(a) ?? (a.reachedBottom ? 'incomplete_lockout' : 'too_shallow'));
      } else if (this.phase === 'descending') {
        // Confirm depth on observed frames: smoothing must not erase a brief valid bottom.
        if (this.held('depth', m.elbowAngle <= c.bottomElbowAngleMax, now, c.bottomHoldMs)) {
          a.reachedBottom = true;
          this.changePhase('bottom', elbow, now);
        } else if (this.held('reverse', elbow >= a.minAngle + c.directionAngleDelta, now, c.transitionHoldMs)) {
          a.errors.add('too_shallow');
          this.changePhase('ascending', elbow, now);
        }
      } else if (this.phase === 'bottom') {
        if (this.held('rise', elbow >= a.minAngle + c.directionAngleDelta, now, c.transitionHoldMs)) {
          this.changePhase('ascending', elbow, now);
        }
      } else if (this.phase === 'ascending') {
        a.maxAngle = Math.max(a.maxAngle, elbow);
        if (this.held('top', atTop, now, c.topHoldMs)) {
          const error = this.error(a);
          if (a.reachedBottom && !error && now - a.startedAt >= c.minRepDurationMs && now - this.lastFinishedAt >= c.repCooldownMs) {
            this.repCount++;
            repJustCounted = true;
          }
          this.finish(now, error, true);
        } else if (this.held('bounce', elbow < a.maxAngle - c.directionAngleDelta, now, c.transitionHoldMs) ||
            (!atTop && now - a.lastProgressAt >= c.lockoutFeedbackDelayMs)) {
          // A failed lockout ends the attempt; a later bottom cannot reuse its depth.
          this.finish(now, this.error(a) ?? 'incomplete_lockout');
        }
      }
    }
    const errorCode = badForm ? 'body_alignment' : this.attempt ? this.error(this.attempt) :
      this.outcome && now - this.outcome.at < c.feedbackHoldMs ? this.outcome.error : null;
    const ready = this.armed || this.attempt !== null || repJustCounted;
    return this.result = {
      phase: this.phase, repCount: this.repCount, repJustCounted,
      formStatus: errorCode ? 'error' : ready && aligned ? 'good' : 'idle', errorCode,
      feedback: errorCode ? PUSH_UP_FEEDBACK[errorCode] : repJustCounted ? 'Повтор засчитан · REP +1' :
        !ready ? 'Прими верхнюю позицию и выпрями руки' : null,
      trackingStatus: ready ? 'ready' : 'unreliable', activeSide: this.side,
      metrics: { elbowAngle: elbow, bodyAngle: m.bodyAngle, hipOffsetRatio: m.hipOffsetRatio, kneeAngle: m.kneeAngle },
    };
  }

  private reliable(p: PosePoint | undefined, minVisibility = this.config.minVisibility): p is PosePoint {
    return !!p && [p.x, p.y, p.visibility, p.presence ?? 1].every(Number.isFinite) &&
      (p.visibility ?? 0) >= minVisibility && (p.presence ?? 1) >= this.config.minPresence;
  }
  private measure(frame: PushUpFrame): Measurement | Exclude<PushUpTrackingStatus, 'ready'> {
    const image = frame.landmarks;
    if (!image?.length) return 'searching';
    const aspect = frame.imageAspectRatio ?? 1;
    if (!Number.isFinite(aspect) || aspect <= 0) return 'unreliable';
    // Side-view motion is measured in the camera plane. Model-estimated depth can
    // bend an otherwise straight visible leg and distort elbow extension.
    const project = (id: number): PosePoint => ({ ...image[id], x: image[id].x * aspect, z: 0 });
    const score = (side: PushUpSide) => {
      const ids = SIDES[side], margin = this.config.frameMargin;
      if (ids.some(id => !this.reliable(image[id], id >= 25 ? this.config.minLegVisibility : this.config.minVisibility) ||
          image[id].x < margin || image[id].x > 1 - margin || image[id].y < margin || image[id].y > 1 - margin)) return -1;
      return ids.reduce((sum, id) => sum + Math.min(image[id].visibility!, image[id].presence ?? 1), 0) / ids.length;
    };
    const scores = { left: score('left'), right: score('right') };
    if (this.side && (this.armed || this.attempt)) {
      if (scores[this.side] < 0) return 'unreliable';
    } else {
      const best = scores.left >= scores.right ? 'left' : 'right';
      if (scores[best] < 0) return 'unreliable';
      if (!this.side || scores[this.side] < 0 || scores[best] > scores[this.side] + this.config.sideSwitchScoreMargin) {
        this.side = best;
        this.smoothAngle = null;
        this.holds.clear();
      }
    }
    const [s, e, w, h, k, a] = SIDES[this.side!].map(project);
    const torso = distance(s, h), length = distance(s, a);
    if (torso <= 1e-6 || length <= 1e-6) return 'unreliable';
    // Compare pair separation in the same aspect-corrected camera plane.
    // If the far side is occluded, its uncertain coordinates must not veto the visible side.
    for (const [left, right] of [[11, 12], [23, 24]]) {
      if (this.reliable(image[left]) && this.reliable(image[right]) &&
          distance(project(left), project(right)) / torso > this.config.maxSidePairToTorsoRatio) return 'wrong_angle';
    }
    if (Math.abs(a.y - s.y) / length > this.config.maxBodyVerticalRatio) return 'wrong_angle';
    const elbowAngle = angle(s, e, w), bodyAngle = angle(s, h, a), kneeAngle = angle(h, k, a);
    if (elbowAngle === null || bodyAngle === null || kneeAngle === null) return 'unreliable';
    const axis = { x: a.x - s.x, y: a.y - s.y, z: a.z - s.z };
    const t = ((h.x - s.x) * axis.x + (h.y - s.y) * axis.y + (h.z - s.z) * axis.z) / (length * length);
    const projection = { x: s.x + t * axis.x, y: s.y + t * axis.y, z: s.z + t * axis.z };
    return { elbowAngle, bodyAngle, kneeAngle, hipOffsetRatio: distance(h, projection) / length };
  }
  private held(key: string, condition: boolean, now: number, duration: number) {
    if (!condition) { this.holds.delete(key); return false; }
    if (!this.holds.has(key)) this.holds.set(key, now);
    return now - this.holds.get(key)! >= duration;
  }
  private error(a: Attempt): PushUpErrorCode | null {
    return (['body_alignment', 'too_shallow', 'incomplete_lockout'] as const).find(e => a.errors.has(e)) ?? null;
  }
  private clearTransitions() {
    for (const key of ['arm', 'start', 'depth', 'reverse', 'rise', 'top', 'bounce']) this.holds.delete(key);
  }
  private changePhase(phase: PushUpPhase, elbow: number, now: number) {
    this.phase = phase;
    this.clearTransitions();
    if (this.attempt) {
      this.attempt.maxAngle = elbow;
      this.attempt.progressAngle = elbow;
      this.attempt.lastProgressAt = now;
    }
  }
  private finish(now: number, error: PushUpErrorCode | null, topConfirmed = false) {
    this.outcome = { at: now, error };
    this.lastFinishedAt = now;
    this.attempt = null;
    this.armed = topConfirmed;
    this.phase = 'top';
    this.clearTransitions();
  }
  private clearTracking() {
    this.phase = 'top'; this.side = null; this.armed = false; this.attempt = null;
    this.smoothAngle = null; this.imageAspectRatio = null; this.outcome = null; this.holds.clear();
  }
  private neutral(trackingStatus: PushUpTrackingStatus): PushUpDetectionResult {
    const feedback = { searching: 'SEARCHING FOR USER...', unreliable: 'Покажи всё тело в кадре', wrong_angle: 'Повернись боком к камере', ready: null };
    return { phase: 'top', repCount: this.repCount, repJustCounted: false, formStatus: 'idle',
      errorCode: null, feedback: feedback[trackingStatus], trackingStatus, activeSide: null,
      metrics: { elbowAngle: null, bodyAngle: null, hipOffsetRatio: null, kneeAngle: null } };
  }
}
