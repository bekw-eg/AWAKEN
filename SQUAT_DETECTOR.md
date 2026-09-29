# Этап 2 — Squat Detector + Rep Counter + Error Mode

## 1. Файлы и подключения

Новых npm-пакетов не требуется.

```text
src/exercise-engine/angles.ts                  # 3D-геометрия
src/exercise-engine/types.ts                   # входной кадр, результат, конфиг
src/exercise-engine/squatDetector.ts           # одна FSM для приседаний
src/hooks/useSquatExercise.ts                  # стабильный экземпляр + watchdog
src/components/ExerciseFeedback/ExerciseFeedback.tsx
src/components/ExerciseFeedback/ExerciseFeedback.css
```

Минимальные изменения существующего кода:

- `src/types/pose.ts` и `src/hooks/usePoseDetection.ts`: добавить `worldLandmarks` и
  `poseTimestampMs`; копировать оба массива из одного результата перед `result.close()`.
  При stop, mute, hidden или ошибке очищать их вместе.
- `src/components/Camera/CameraView.tsx`: вызвать hook и поставить панель под видео.
  Отрисовка skeleton и существующий camera lifecycle сохраняются.

```tsx
const { landmarks, worldLandmarks, poseTimestampMs, cameraStatus, engineStatus } =
  usePoseDetection(videoRef, enabled, restartKey);

const squat = useSquatExercise(
  landmarks,
  worldLandmarks,
  poseTimestampMs,
  cameraStatus === 'active' && engineStatus === 'active',
);

// В JSX после существующего блока камеры:
<ExerciseFeedback result={squat} onReset={squat.reset} />
```

Тесты находятся в `src/tests/squatDetector.test.ts`, `useSquatExercise.test.tsx`,
`ExerciseFeedback.test.tsx`; генератор синтетических кадров — `fixtures/squatFrames.ts`.
Существующие тесты `usePoseDetection` дополнены проверкой 3D landmarks и timestamps.

## 2. Общая логика

```text
Проверка видимости, границ кадра и поворота тела
                 ↓
Около 1 секунды стоя: baseline высоты таза и длины корпуса
                 ↓
STANDING → DESCENDING → BOTTOM → ASCENDING → STANDING
                 ↓
Полный цикл + глубина + нет подтверждённых ошибок + тайминги → REP +1
```

Во время попытки хранится факт достижения глубины и подтверждённые нарушения.
Выпрямление после неправильного приседа завершает попытку, но не начисляет реп.
Потеря достоверных суставов отменяет незавершённую попытку; завершённые репы сохраняются.

## 3. Полный код

Актуальный снимок исходников после исправления фронтального распознавания; при дальнейших правках источником истины служат файлы src/.

### src/exercise-engine/angles.ts

```ts
export type Point3 = { x: number; y: number; z: number };

export function distance(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function midpoint(a: Point3, b: Point3): Point3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

export function normalizedRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 1e-6) return null;
  return numerator / denominator;
}

/** Angle ABC in degrees. All axes must use the same units (world coordinates). */
export function angle(a: Point3, b: Point3, c: Point3): number | null {
  const ab = distance(a, b);
  const cb = distance(c, b);
  if (ab <= 1e-6 || cb <= 1e-6) return null;
  const dot = (a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y) + (a.z - b.z) * (c.z - b.z);
  const cosine = dot / (ab * cb);
  return Number.isFinite(cosine) ? Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI : null;
}

export function leanFromVertical(shoulder: Point3, hip: Point3): number | null {
  if (distance(shoulder, hip) <= 1e-6) return null;
  return Math.atan2(Math.hypot(shoulder.x - hip.x, shoulder.z - hip.z), hip.y - shoulder.y) * 180 / Math.PI;
}
```

### src/exercise-engine/types.ts

```ts
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
```

### src/exercise-engine/squatDetector.ts

```ts
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
  standingKneeAngleMin: 160,
  descendingKneeAngleMax: 145,
  bottomKneeAngleMax: 110,
  bottomExitKneeAngleMin: 125,
  minAttemptHipDrop: 0.08,
  minHipDepthDelta: 0.25,
  frontalStartHipDrop: 0.12,
  frontalDepthHipDrop: 0.4,
  frontalThighCompression: 0.18,
  frontalDirectionDelta: 0.08,
  frontalLockoutCompression: 0.02,
  maxStandingHipDelta: 0.1,
  maxTorsoLeanDeg: 35,
  minKneeDistanceRatio: 0.65,
  directionAngleDelta: 10,
  progressAngleDelta: 3,
  transitionHoldMs: 120,
  bottomHoldMs: 60,
  standingHoldMs: 120,
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
        const worldDeep = Math.max(m.leftKneeAngle, m.rightKneeAngle) <= this.config.bottomKneeAngleMax &&
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
```

### src/hooks/useSquatExercise.ts

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { SquatDetector } from '../exercise-engine/squatDetector';
import type { PosePoint, SquatConfig, SquatDetectionResult } from '../exercise-engine/types';

/** Configuration is captured on mount; changing UI state never recreates the detector. */
export function useSquatExercise(
  landmarks: readonly PosePoint[] | null,
  worldLandmarks: readonly PosePoint[] | null,
  timestampMs: number | null,
  enabled = true,
  config?: Partial<SquatConfig>,
): SquatDetectionResult & { reset: () => void } {
  const detectorRef = useRef<SquatDetector | null>(null);
  if (!detectorRef.current) detectorRef.current = new SquatDetector(config);
  const detector = detectorRef.current;
  const [result, setResult] = useState(() => detector.getResult());

  useEffect(() => {
    if (!enabled || timestampMs === null) {
      setResult(detector.pause());
      return;
    }
    setResult(detector.update({ landmarks, worldLandmarks, timestampMs }));
    // No second animation loop. A stalled camera must not leave an attempt armed.
    const staleTimer = setTimeout(() => setResult(detector.pause()), detector.config.maxFrameGapMs);
    return () => clearTimeout(staleTimer);
  }, [detector, landmarks, worldLandmarks, timestampMs, enabled]);

  const reset = useCallback(() => setResult(detector.reset()), [detector]);
  return { ...result, reset };
}
```

### src/components/ExerciseFeedback/ExerciseFeedback.tsx

```tsx
import type { SquatDetectionResult } from '../../exercise-engine/types';
import './ExerciseFeedback.css';

type Props = { result: SquatDetectionResult; onReset: () => void };
const format = (value: number | null, suffix = '', decimals = 0) =>
  value === null ? '—' : `${value.toFixed(decimals)}${suffix}`;

export function ExerciseFeedback({ result, onReset }: Props) {
  const { phase, repCount, formStatus, feedback, metrics, trackingStatus, calibrationProgress } = result;
  const status = formStatus === 'good' ? 'GOOD FORM' : formStatus === 'error' ? 'FORM ERROR' : 'WAITING';

  return (
    <section className={`exercise-feedback form-${formStatus}`} aria-labelledby="exercise-title">
      <header className="exercise-header">
        <div><p className="eyebrow">TRAINING / 01</p><h2 id="exercise-title">SQUAT TRAINING</h2></div>
        <button type="button" onClick={onReset}>СБРОСИТЬ СЧЁТЧИК</button>
      </header>
      <div className="exercise-summary">
        <div className="rep-counter"><span key={repCount} className={repCount > 0 ? 'rep-value rep-flash' : 'rep-value'}>{repCount}</span><span>VALID REPS</span></div>
        <div className="exercise-state">
          <p className="exercise-phase">PHASE <strong>{phase.toUpperCase()}</strong></p>
          <p className="form-badge">{status}</p>
          <p className="exercise-message" role="status" aria-live="polite" lang="ru">{feedback ?? (phase === 'standing' ? 'Готово. Сделай приседание и полностью выпрямись.' : 'Продолжай движение')}</p>
          {trackingStatus === 'calibrating' && <progress aria-label="Калибровка стоя" max={1} value={calibrationProgress} />}
        </div>
      </div>
      <details className="exercise-debug">
        <summary>DEBUG METRICS</summary>
        <dl>
          <div><dt>Left knee</dt><dd>{format(metrics.leftKneeAngle, '°')}</dd></div>
          <div><dt>Right knee</dt><dd>{format(metrics.rightKneeAngle, '°')}</dd></div>
          <div><dt>Avg knee</dt><dd>{format(metrics.avgKneeAngle, '°')}</dd></div>
          <div><dt>Torso lean</dt><dd>{format(metrics.torsoLeanDeg, '°')}</dd></div>
          <div><dt>Knee / ankle width</dt><dd>{format(metrics.kneeDistanceRatio, '', 2)}</dd></div>
          <div><dt>Hip drop / torso</dt><dd>{format(metrics.hipDepthDelta, '', 2)}</dd></div>
          <div><dt>Hip drop (camera)</dt><dd>{format(metrics.imageHipDepthDelta, '', 2)}</dd></div>
        </dl>
      </details>
      <p className="exercise-tip" lang="ru">Встань лицом к камере, покажи всё тело и замри на секунду. После потери трекинга снова выпрямись.</p>
    </section>
  );
}
```

### src/components/ExerciseFeedback/ExerciseFeedback.css

```css
.exercise-feedback { --form-color: #9bb2c3; margin-top: 28px; padding: 24px; border: 1px solid #354956; background: #101b24; border-top: 2px solid var(--form-color); }
.exercise-feedback.form-good { --form-color: #89e6b0; }
.exercise-feedback.form-error { --form-color: #ff929a; }
.exercise-header { display: flex; justify-content: space-between; align-items: center; gap: 18px; }
.exercise-header h2 { margin: 0; font-size: 20px; letter-spacing: 1.5px; }
.exercise-header button { font-size: 10px; }
.exercise-summary { display: grid; grid-template-columns: 140px 1fr; gap: 30px; align-items: center; margin: 26px 0; }
.rep-counter { display: flex; flex-direction: column; gap: 6px; text-align: center; padding-right: 24px; border-right: 1px solid #354956; }
.rep-value { font-size: 64px; line-height: 1; color: #ecf8ff; }
.rep-counter > span:last-child { font-size: 10px; color: #9bb2c3; letter-spacing: 1px; }
.exercise-phase { margin: 0; color: #9bb2c3; font-size: 11px; }
.exercise-phase strong { color: #ecf8ff; margin-left: 12px; }
.form-badge { font-size: 11px; letter-spacing: 1px; color: var(--form-color); margin: 14px 0 8px; }
.exercise-message { color: var(--form-color); margin: 0; min-height: 2.8em; font: 16px/1.5 system-ui, sans-serif; }
.exercise-state progress { width: min(100%, 280px); height: 6px; accent-color: #7be9da; }
.exercise-debug { border-top: 1px solid #354956; padding-top: 16px; font-size: 10px; color: #9bb2c3; }
.exercise-debug summary { cursor: pointer; width: fit-content; padding: 5px 0; }
.exercise-debug summary:focus-visible { outline: 2px solid #81edfa; outline-offset: 4px; }
.exercise-debug dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 18px; }
.exercise-debug dd { color: #dce7ee; font-size: 15px; margin: 6px 0 0; font-variant-numeric: tabular-nums; }
.exercise-tip { font: 12px/1.7 system-ui, sans-serif; color: #9bb2c3; margin: 16px 0 0; }
.rep-flash { animation: rep-confirm 400ms ease-out; }
@keyframes rep-confirm { 0% { color: #89e6b0; transform: scale(1.12); } 100% { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .rep-flash { animation: none; } }
@media (max-width: 640px) {
  .exercise-feedback { padding: 18px; }
  .exercise-header { align-items: flex-start; flex-direction: column; }
  .exercise-header h2 { font-size: 18px; }
  .exercise-summary { grid-template-columns: 80px 1fr; gap: 16px; }
  .rep-counter { padding-right: 14px; }
  .rep-value { font-size: 48px; }
  .rep-counter > span:last-child { font-size: 8px; }
  .exercise-message { font-size: 14px; }
  .exercise-debug dl { grid-template-columns: repeat(2, 1fr); }
}
```

### src/types/pose.ts

```ts
import type { Landmark, NormalizedLandmark } from '@mediapipe/tasks-vision';

export type { Landmark, NormalizedLandmark };
export type CameraStatus = 'idle' | 'requesting' | 'starting' | 'active' | 'error';
export type EngineStatus = 'idle' | 'loading' | 'active' | 'error';

export type PoseState = {
  landmarks: NormalizedLandmark[] | null;
  worldLandmarks: Landmark[] | null;
  poseTimestampMs: number | null;
  cameraStatus: CameraStatus;
  engineStatus: EngineStatus;
  error: string | null;
  videoSize: { width: number; height: number };
};

export type UsePoseDetectionResult = PoseState & {
  isLoading: boolean;
  isPersonDetected: boolean;
};
```

### src/hooks/usePoseDetection.ts

```ts
import { useEffect, useRef, useState, type RefObject } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PoseState, UsePoseDetectionResult } from '../types/pose';

const INITIAL: PoseState = {
  landmarks: null,
  worldLandmarks: null,
  poseTimestampMs: null,
  cameraStatus: 'idle',
  engineStatus: 'idle',
  error: null,
  videoSize: { width: 1280, height: 720 },
};
const FRAME_INTERVAL = 1000 / 20;

function cameraMessage(error: unknown): string {
  // DOMException can come from a different realm and need not pass instanceof Error.
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'CAMERA ACCESS REQUIRED. Allow camera access in your browser settings, then retry.';
  }
  if (name === 'NotFoundError') return 'NO CAMERA FOUND. Connect a webcam, then retry.';
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'CAMERA UNAVAILABLE. Close other apps using your webcam, then retry.';
  }
  return 'CAMERA COULD NOT START. Check your camera connection and browser permissions, then retry.';
}

// Waiting for loaded data is abortable, unlike getUserMedia and model creation.
function waitForVideo(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
    };
    const ready = () => {
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      cleanup();
      resolve();
    };
    const failed = () => { cleanup(); reject(new Error('Video could not load.')); };
    const aborted = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    timeout = setTimeout(failed, 15_000);
    video.addEventListener('loadeddata', ready);
    video.addEventListener('error', failed);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
    else ready();
  });
}

export function usePoseDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled = true,
  restartKey = 0,
): UsePoseDetectionResult {
  const [state, setState] = useState<PoseState>(INITIAL);
  // A retry waits for a previous pending setup to dispose its late resources.
  const setupTail = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!enabled) {
      setState(INITIAL);
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let detector: PoseLandmarker | null = null;
    let frameId: number | null = null;
    let lastVideoTime = -1;
    let lastDetectionAt = -Infinity;
    let stage: 'camera' | 'engine' = 'camera';
    let removeTrackListeners = () => {};
    const abortController = new AbortController();

    const dispose = () => {
      cancelled = true;
      abortController.abort();
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      removeTrackListeners();
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        if (video.srcObject === stream) {
          video.pause();
          video.srcObject = null;
        }
        stream = null;
      }
      const current = detector;
      detector = null;
      current?.close();
    };

    const fail = (message: string, failedStage: 'camera' | 'engine') => {
      if (cancelled) return;
      dispose();
      setState((previous) => ({
        ...previous,
        landmarks: null,
        worldLandmarks: null,
        poseTimestampMs: null,
        cameraStatus: failedStage === 'camera' ? 'error' : 'idle',
        engineStatus: failedStage === 'engine' ? 'error' : 'idle',
        error: message,
      }));
    };

    const onPageHide = () => { dispose(); setState(INITIAL); };
    const onVisibilityChange = () => {
      if (document.hidden && !cancelled) {
        setState((previous) => ({ ...previous, landmarks: null, worldLandmarks: null, poseTimestampMs: null }));
      }
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    setState({ ...INITIAL, cameraStatus: 'requesting' });

    const detect = (timestamp: number) => {
      if (cancelled || !detector) return;
      if (!document.hidden && !stream?.getVideoTracks().some((track) => track.muted) &&
          !video.paused && video.readyState >= 2 &&
          video.videoWidth > 0 && video.videoHeight > 0 &&
          video.currentTime !== lastVideoTime && timestamp - lastDetectionAt >= FRAME_INTERVAL) {
        lastVideoTime = video.currentTime;
        lastDetectionAt = timestamp;
        try {
          // Synchronous call: schedule the next RAF only after it finishes.
          const result = detector.detectForVideo(video, timestamp);
          try {
            const landmarks = result.landmarks[0]?.map((point) => ({ ...point })) ?? null;
            const worldLandmarks = result.worldLandmarks?.[0]?.map((point) => ({ ...point })) ?? null;
            setState((previous) => ({
              ...previous,
              landmarks: landmarks?.length ? landmarks : null,
              worldLandmarks: landmarks?.length && worldLandmarks?.length ? worldLandmarks : null,
              poseTimestampMs: timestamp,
              videoSize: { width: video.videoWidth, height: video.videoHeight },
            }));
          } finally {
            result.close();
          }
        } catch {
          fail('POSE DETECTION STOPPED. Your browser could not process the camera frame. Retry to restart the engine.', 'engine');
          return;
        }
      }
      if (!cancelled) frameId = requestAnimationFrame(detect);
    };

    const initialize = async () => {
      if (cancelled) return;
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          fail('CAMERA NOT SUPPORTED. Open this page on HTTPS or localhost in a browser with webcam support.', 'camera');
          return;
        }
        const acquired = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          acquired.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = acquired;
        const tracks = acquired.getVideoTracks();
        const ended = () => fail('CAMERA DISCONNECTED. Reconnect your webcam, then retry.', 'camera');
        const muted = () => {
          if (!cancelled) setState((previous) => ({ ...previous, landmarks: null, worldLandmarks: null, poseTimestampMs: null, cameraStatus: 'starting' }));
        };
        const unmuted = () => {
          if (!cancelled) setState((previous) => ({ ...previous, cameraStatus: 'active' }));
        };
        for (const track of tracks) {
          track.addEventListener('ended', ended);
          track.addEventListener('mute', muted);
          track.addEventListener('unmute', unmuted);
        }
        removeTrackListeners = () => {
          for (const track of tracks) {
            track.removeEventListener('ended', ended);
            track.removeEventListener('mute', muted);
            track.removeEventListener('unmute', unmuted);
          }
        };
        if (!tracks.length || tracks.some((track) => track.readyState === 'ended')) {
          ended();
          return;
        }
        video.srcObject = stream;
        setState((previous) => ({ ...previous, cameraStatus: 'starting' }));
        await Promise.all([video.play(), waitForVideo(video, abortController.signal)]);
        if (cancelled) return;
        stage = 'engine';
        setState((previous) => ({
          ...previous,
          cameraStatus: 'active',
          engineStatus: 'loading',
          videoSize: { width: video.videoWidth, height: video.videoHeight },
        }));
        const base = `${import.meta.env.BASE_URL}mediapipe`;
        const vision = await FilesetResolver.forVisionTasks(`${base}/wasm`);
        if (cancelled) return;
        const created = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: `${base}/pose_landmarker_lite.task`, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          outputSegmentationMasks: false,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        if (cancelled) { created.close(); return; }
        detector = created;
        setState((previous) => ({ ...previous, engineStatus: 'active' }));
        frameId = requestAnimationFrame(detect);
      } catch (error) {
        fail(stage === 'camera' ? cameraMessage(error)
          : 'POSE ENGINE COULD NOT LOAD. Reload the page and retry. If the problem persists, use an up-to-date browser and check that tracking assets are available.', stage);
      }
    };

    // StrictMode's immediate setup → cleanup → setup cancels the first timer.
    const startTimer = setTimeout(() => {
      setupTail.current = setupTail.current.then(initialize, initialize);
    }, 0);

    return () => {
      clearTimeout(startTimer);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      dispose();
    };
  }, [videoRef, enabled, restartKey]);

  return {
    ...state,
    isLoading: state.cameraStatus === 'requesting' || state.cameraStatus === 'starting' || state.engineStatus === 'loading',
    isPersonDetected: !!state.landmarks?.length,
  };
}
```

### src/components/Camera/CameraView.tsx

```tsx
import { useRef, useState } from 'react';
import { usePoseDetection } from '../../hooks/usePoseDetection';
import { useSquatExercise } from '../../hooks/useSquatExercise';
import { ExerciseFeedback } from '../ExerciseFeedback/ExerciseFeedback';
import { PoseOverlay } from '../PoseOverlay/PoseOverlay';
import './CameraView.css';

export function CameraView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [enabled, setEnabled] = useState(true);
  const [restartKey, setRestartKey] = useState(0);
  const { landmarks, worldLandmarks, poseTimestampMs, videoSize, cameraStatus, engineStatus, isLoading, error, isPersonDetected } =
    usePoseDetection(videoRef, enabled, restartKey);

  const active = cameraStatus === 'active' && engineStatus === 'active';
  const squat = useSquatExercise(landmarks, worldLandmarks, poseTimestampMs, active);
  const stopped = cameraStatus === 'idle' && engineStatus === 'idle' && !error;
  const heading = error ? (error.startsWith('CAMERA ACCESS REQUIRED') ? 'CAMERA ACCESS REQUIRED' : 'SYSTEM INTERRUPTED')
    : engineStatus === 'loading' ? 'INITIALIZING POSE ENGINE…'
    : cameraStatus === 'requesting' ? 'REQUESTING CAMERA ACCESS…'
    : cameraStatus === 'starting' ? 'WAITING FOR CAMERA…'
    : isPersonDetected ? 'POSE DETECTED'
    : active ? 'SEARCHING FOR USER…' : 'CAMERA OFFLINE';

  const restart = () => { setEnabled(true); setRestartKey((key) => key + 1); };

  return (
    <main className="system-shell">
      <header className="topbar">
        <a className="wordmark" href="#main">AWAKEN<span className="brand-mark">◇</span></a>
        <span className="chapter">SYSTEM / 02 <span>BODY INTERFACE</span></span>
      </header>
      <section className="camera-system" id="main" aria-labelledby="page-title">
        <div className="section-heading">
          <div><p className="eyebrow">REAL-WORLD INPUT · ONLINE POTENTIAL</p><h1 id="page-title">CAMERA <span>SYSTEM</span></h1></div>
          <span className="stage-tag">PHASE 02 / SQUAT TRAINING</span>
        </div>
        <p className="intro">Your body is the controller. Step into the frame.</p>

        <div className="camera-panel">
          <div className="panel-bar"><span><i className={cameraStatus === 'active' ? 'dot active' : 'dot'} /> LIVE CAMERA</span><span>MIRRORED VIEW</span></div>
          <div className="camera-stage" style={{ aspectRatio: `${videoSize.width} / ${videoSize.height}` }}>
            <div className="mirrored-feed">
              <video ref={videoRef} autoPlay playsInline muted aria-label="Live mirrored webcam" />
              <PoseOverlay landmarks={landmarks} width={videoSize.width} height={videoSize.height} />
            </div>
            <div className="frame-corners" aria-hidden="true" />
            {(isLoading || error || stopped) && (
              <div className="stage-message">
                <span className={isLoading ? 'system-symbol spinning' : 'system-symbol'} aria-hidden="true">◇</span>
                <p>{error ? 'CONNECTION INTERRUPTED' : isLoading ? 'ESTABLISHING CONNECTION' : 'READY WHEN YOU ARE'}</p>
                <span>{error ? 'See the system message below.' : cameraStatus === 'requesting' ? 'Allow camera access in your browser.'
                  : engineStatus === 'loading' ? 'Loading body tracking. Please hold still.'
                  : cameraStatus === 'starting' ? 'Waiting for the video signal.' : 'Start the camera to begin.'}</span>
              </div>
            )}
            <div className="camera-caption"><span>01 — VISION LINK</span><span>{cameraStatus === 'active' ? `${videoSize.width} × ${videoSize.height}` : 'AWAITING SIGNAL'}</span></div>
          </div>
          <div className={`detection-banner${error ? ' error' : ''}`} role="status" aria-live="polite">
            <span className={active && isPersonDetected ? 'dot active' : 'dot'} />
            <span>{heading}</span>
            {active && <small>POSE DETECTION: ACTIVE</small>}
          </div>
        </div>

        {error && <p className="error-detail" role="alert">{error}</p>}
        <div className="system-footer">
          <dl className="system-status"><div><dt>CAMERA</dt><dd>{cameraStatus}</dd></div><div><dt>POSE ENGINE</dt><dd>{engineStatus}</dd></div></dl>
          <button type="button" onClick={error || stopped ? restart : () => setEnabled(false)}>
            {error ? 'RETRY CONNECTION' : stopped ? 'START CAMERA' : 'STOP CAMERA'} <span aria-hidden="true">↗</span>
          </button>
        </div>
        <ExerciseFeedback result={squat} onReset={squat.reset} />
        <aside className="setup-note"><span aria-hidden="true">⌖</span><p><strong>Keep your full body in view.</strong> Face the camera, stand upright for one second, and use good lighting.</p></aside>
        <footer className="privacy"><span>LOCAL PROCESSING</span> Camera frames stay on this device. No video is uploaded or recorded.</footer>
      </section>
    </main>
  );
}
```

### src/tests/fixtures/squatFrames.ts

```ts
import { SquatDetector } from '../../exercise-engine/squatDetector';
import type { PosePoint, SquatDetectionResult, SquatFrame } from '../../exercise-engine/types';

export type PoseOptions = {
  knee?: number;
  rightKnee?: number;
  torsoLean?: number;
  kneeRatio?: number;
  yaw?: number;
  scale?: number;
};

/** Synthetic articulated legs: feet remain grounded while the hip-to-ankle height changes. */
export function squatFrame(timestampMs: number, options: PoseOptions = {}): SquatFrame {
  const { knee = 175, rightKnee = knee, torsoLean = 0, kneeRatio = 1, yaw = 0, scale = 1 } = options;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const world: PosePoint[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1, presence: 1 }));
  const write = (index: number, x: number, y: number, z: number) => { world[index] = { x, y, z, visibility: 1, presence: 1 }; };
  const torsoY = -0.5 * Math.cos(radians(torsoLean));
  const torsoZ = -0.5 * Math.sin(radians(torsoLean));
  write(11, -0.21, torsoY, torsoZ);
  write(12, 0.21, torsoY, torsoZ);
  for (const [side, hip, joint, ankle, degrees] of [[-1, 23, 25, 27, knee], [1, 24, 26, 28, rightKnee]]) {
    const bend = radians((180 - degrees) / 2);
    const lowerY = 0.42 * Math.cos(bend);
    write(hip, side * 0.18, 0, 0);
    write(joint, side * 0.18 * kneeRatio, lowerY, -0.42 * Math.sin(bend));
    write(ankle, side * 0.18, 2 * lowerY, 0);
  }
  const hipScreenY = 0.93 - Math.max(world[27].y, world[28].y) * 0.5;
  const landmarks = world.map((point) => ({ ...point, x: 0.5 + point.x * 0.6, y: hipScreenY + point.y * 0.5 }));
  const worldLandmarks = world.map((point) => ({
    ...point,
    x: (point.x * Math.cos(radians(yaw)) + point.z * Math.sin(radians(yaw))) * scale,
    y: point.y * scale,
    z: (-point.x * Math.sin(radians(yaw)) + point.z * Math.cos(radians(yaw))) * scale,
  }));
  return { landmarks, worldLandmarks, timestampMs };
}

export class SquatSequence {
  time = 0;
  readonly history: SquatDetectionResult[] = [];
  readonly frames: SquatFrame[] = [];
  constructor(readonly detector = new SquatDetector(), readonly intervalMs = 50) {}

  get result() { return this.detector.getResult(); }

  frame(options: PoseOptions = {}, alter?: (frame: SquatFrame) => void) {
    this.time += this.intervalMs;
    const frame = squatFrame(this.time, options);
    alter?.(frame);
    this.frames.push(frame);
    const result = this.detector.update(frame);
    this.history.push(result);
    return result;
  }

  hold(options: PoseOptions, durationMs: number) {
    for (let i = 0; i < Math.ceil(durationMs / this.intervalMs); i++) this.frame(options);
    return this.result;
  }

  ramp(from: number, to: number, durationMs: number, options: PoseOptions = {}) {
    const count = Math.ceil(durationMs / this.intervalMs);
    for (let i = 1; i <= count; i++) this.frame({ ...options, knee: from + (to - from) * i / count });
    return this.result;
  }

  calibrate(options: PoseOptions = {}) { return this.hold({ ...options, knee: 175 }, 1600); }

  rep(options: PoseOptions = {}, bottom = 85) {
    this.ramp(175, bottom, 1000, options);
    this.hold({ ...options, knee: bottom }, 400);
    this.ramp(bottom, 175, 1000, options);
    return this.hold({ ...options, knee: 175 }, 500);
  }
}
```

### src/tests/squatDetector.test.ts

```ts
import { describe, expect, it } from 'vitest';
import { angle, distance, midpoint, normalizedRatio } from '../exercise-engine/angles';
import { DEFAULT_SQUAT_CONFIG, SquatDetector } from '../exercise-engine/squatDetector';
import type { PosePoint, SquatConfig, SquatFrame } from '../exercise-engine/types';
import { squatFrame, SquatSequence } from './fixtures/squatFrames';

describe('geometry', () => {
  it('uses all three axes and handles degenerate geometry safely', () => {
    expect(angle({ x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toBeCloseTo(90);
    expect(angle({ x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBeCloseTo(180);
    expect(angle({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull();
    expect(normalizedRatio(1, 0)).toBeNull();
    expect(normalizedRatio(NaN, 1)).toBeNull();
    expect(distance({ x: 0, y: 0, z: 0 }, { x: 0, y: 3, z: 4 })).toBe(5);
    expect(midpoint({ x: 0, y: 0, z: 0 }, { x: 2, y: 4, z: 6 })).toEqual({ x: 1, y: 2, z: 3 });
  });
});

describe('squat state machine', () => {
  it('counts frontal image motion even when world knee angles remain standing', () => {
    const recording = new SquatSequence();
    recording.calibrate();
    recording.rep();
    recording.rep();
    const detector = new SquatDetector();
    const standingWorld = squatFrame(0).worldLandmarks;
    const results = recording.frames.map((frame) => detector.update({ ...frame, worldLandmarks: standingWorld }));
    expect(results.some((result) => result.phase === 'descending')).toBe(true);
    expect(results.some((result) => result.phase === 'bottom')).toBe(true);
    expect(detector.getResult().repCount).toBe(2);
  });

  it('requires full image lockout when unreliable world angles look straight throughout', () => {
    const recording = new SquatSequence();
    recording.calibrate();
    recording.ramp(175, 85, 1000);
    recording.hold({ knee: 85 }, 400);
    recording.ramp(85, 145, 1000);
    recording.hold({ knee: 145 }, 1500);
    const detector = new SquatDetector();
    const standingWorld = squatFrame(0).worldLandmarks;
    recording.frames.forEach((frame) => detector.update({ ...frame, worldLandmarks: standingWorld }));
    expect(detector.getResult().repCount).toBe(0);
    expect(detector.getResult().errorCode).toBe('incomplete_lockout');
    const before = recording.frames.length;
    recording.ramp(145, 175, 500);
    recording.hold({}, 400);
    recording.frames.slice(before).forEach((frame) => detector.update({ ...frame, worldLandmarks: standingWorld }));
    expect(detector.getResult().repCount).toBe(1);
  });

  it('does not turn a shallow image squat into a valid rep', () => {
    const recording = new SquatSequence();
    recording.calibrate();
    recording.rep({}, 132);
    const detector = new SquatDetector();
    const standingWorld = squatFrame(0).worldLandmarks;
    recording.frames.forEach((frame) => detector.update({ ...frame, worldLandmarks: standingWorld }));
    expect(detector.getResult().repCount).toBe(0);
    expect(detector.getResult().errorCode).toBe('too_shallow');
  });

  it('ignores image translation and uniform scaling without leg folding', () => {
    const s = new SquatSequence();
    s.calibrate();
    for (let i = 0; i < 60; i++) {
      s.frame({}, (frame) => {
        const scale = 0.85 + 0.1 * Math.sin(i / 10);
        frame.landmarks = frame.landmarks!.map((p) => ({ ...p,
          x: 0.5 + (p.x - 0.5) * scale, y: 0.5 + (p.y - 0.5) * scale + 0.01 * Math.sin(i / 6),
        }));
      });
    }
    expect(s.result.repCount).toBe(0);
    expect(s.result.phase).toBe('standing');
    expect(s.result.metrics.imageHipDepthDelta).toBeCloseTo(0);
  });

  it.each([1200, 1800, 2500])('counts continuous %i ms squats without artificial pauses', (period) => {
    const s = new SquatSequence();
    s.calibrate();
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let elapsed = 50; elapsed <= period; elapsed += 50) {
        const knee = 175 - 70 * (1 - Math.cos(2 * Math.PI * elapsed / period)) / 2;
        s.frame({ knee });
      }
    }
    s.hold({}, 250);
    expect(s.result.repCount).toBe(3);
  });

  it('calibrates and completes reps when the camera estimates upright knees at 155 degrees', () => {
    const s = new SquatSequence();
    s.hold({ knee: 155 }, 1600);
    expect(s.result.trackingStatus).toBe('ready');
    s.ramp(155, 90, 1000);
    s.hold({ knee: 90 }, 300);
    s.ramp(90, 155, 1000);
    s.hold({ knee: 155 }, 350);
    expect(s.result.repCount).toBe(1);
  });

  it('requires upright calibration and a full four-phase cycle', () => {
    const s = new SquatSequence();
    s.hold({ knee: 85 }, 1500);
    expect(s.result.trackingStatus).toBe('calibrating');
    expect(s.result.repCount).toBe(0);
    s.calibrate();
    expect(s.result.trackingStatus).toBe('ready');
    s.rep();
    expect(s.result.repCount).toBe(1);
    expect(new Set(s.history.map((result) => result.phase))).toEqual(new Set(['standing', 'descending', 'bottom', 'ascending']));
    expect(s.history.filter((result) => result.repJustCounted)).toHaveLength(1);
  });

  it.each([33, 50, 100])('counts three distinct repetitions at %i ms per frame', (interval) => {
    const s = new SquatSequence(new SquatDetector(), interval);
    s.calibrate();
    for (let i = 1; i <= 3; i++) {
      s.rep();
      expect(s.result.repCount).toBe(i);
    }
    expect(s.history.filter((result) => result.repJustCounted)).toHaveLength(3);
  });

  it('does not count when holding bottom or standing still', () => {
    const s = new SquatSequence();
    s.calibrate();
    s.ramp(175, 85, 1000);
    s.hold({ knee: 85 }, 5000);
    expect(s.result.phase).toBe('bottom');
    expect(s.result.repCount).toBe(0);
    s.ramp(85, 175, 1000);
    s.hold({ knee: 175 }, 5000);
    expect(s.result.repCount).toBe(1);
  });

  it('rejects shallow attempts and recovers for the next valid rep', () => {
    const s = new SquatSequence();
    s.calibrate();
    s.rep({}, 132);
    expect(s.result.repCount).toBe(0);
    expect(s.result.errorCode).toBe('too_shallow');
    expect(s.result.feedback).toBe('Присядь ниже');
    s.hold({}, 1000);
    s.rep();
    expect(s.result.repCount).toBe(1);
    expect(s.result.errorCode).toBeNull();
  });

  it('ignores slight bending and a single bad frame', () => {
    const s = new SquatSequence();
    s.calibrate();
    s.rep({}, 155);
    s.frame({ knee: 85 });
    s.hold({}, 1000);
    expect(s.history.some((result) => result.phase === 'descending')).toBe(false);
    expect(s.result.repCount).toBe(0);
    expect(s.result.errorCode).toBeNull();
  });

  it.each([
    [{ kneeRatio: 0.35 }, 'knees_in', 'Разведи колени'],
    [{ torsoLean: 55 }, 'torso_lean', 'Держи корпус ровнее'],
    [{ kneeRatio: 0.35, torsoLean: 55 }, 'knees_in', 'Разведи колени'],
  ] as const)('latches form errors through a corrected ascent: %s', (options, code, message) => {
    const s = new SquatSequence();
    s.calibrate();
    s.ramp(175, 85, 1000);
    s.hold({ knee: 85, ...options }, 700);
    expect(s.result.errorCode).toBe(code);
    s.ramp(85, 175, 1000);
    s.hold({}, 500);
    expect(s.result.repCount).toBe(0);
    expect(s.result.errorCode).toBe(code);
    expect(s.result.feedback).toBe(message);
  });

  it('gives too_shallow priority over knee and torso errors', () => {
    const s = new SquatSequence();
    s.calibrate();
    s.ramp(175, 132, 1000);
    s.hold({ knee: 132, kneeRatio: 0.35, torsoLean: 55 }, 1000);
    s.ramp(132, 175, 1000);
    s.hold({}, 500);
    expect(s.result.repCount).toBe(0);
    expect(s.result.errorCode).toBe('too_shallow');
  });

  it('filters a one-frame form spike without invalidating an otherwise valid rep', () => {
    const s = new SquatSequence();
    s.calibrate();
    s.ramp(175, 85, 1000);
    s.hold({ knee: 85 }, 300);
    s.frame({ knee: 85, kneeRatio: 0.35, torsoLean: 60 });
    s.hold({ knee: 85 }, 300);
    s.ramp(85, 175, 1000);
    s.hold({}, 500);
    expect(s.result.repCount).toBe(1);
  });

  it('waits for full lockout and allows completing an interrupted ascent', () => {
    const s = new SquatSequence();
    s.calibrate();
    s.ramp(175, 85, 1000);
    s.hold({ knee: 85 }, 400);
    s.ramp(85, 145, 800);
    s.hold({ knee: 145 }, 1500);
    expect(s.result.phase).toBe('ascending');
    expect(s.result.repCount).toBe(0);
    expect(s.result.errorCode).toBe('incomplete_lockout');
    s.ramp(145, 175, 600);
    s.hold({}, 500);
    expect(s.result.repCount).toBe(1);
  });

  it('rejects bottom pulses that never fully lock out between descents', () => {
    const s = new SquatSequence();
    s.calibrate();
    s.ramp(175, 85, 1000);
    s.hold({ knee: 85 }, 400);
    s.ramp(85, 145, 800);
    s.hold({ knee: 145 }, 300);
    s.ramp(145, 85, 800);
    s.hold({ knee: 85 }, 400);
    s.ramp(85, 175, 1000);
    s.hold({}, 500);
    expect(s.result.repCount).toBe(0);
    expect(s.result.errorCode).toBe('incomplete_lockout');
  });

  it('requires both knees to reach depth', () => {
    const s = new SquatSequence();
    s.calibrate();
    s.ramp(175, 80, 1000, { rightKnee: 135 });
    s.hold({ knee: 80, rightKnee: 135 }, 500);
    s.ramp(80, 175, 1000, { rightKnee: 135 });
    s.hold({}, 500);
    expect(s.result.repCount).toBe(0);
    expect(s.result.errorCode).toBe('too_shallow');
  });

  it('requires hip travel in addition to knee angles', () => {
    // Angle movement remains the same, but the required hip travel exceeds this fixture's depth.
    const s = new SquatSequence(new SquatDetector({ minHipDepthDelta: 0.8, frontalDepthHipDrop: 0.8 }));
    s.calibrate();
    s.rep();
    expect(s.result.repCount).toBe(0);
    expect(s.result.errorCode).toBe('too_shallow');
  });

  it('does not jump between bottom and ascending at a noisy exit threshold', () => {
    const s = new SquatSequence(new SquatDetector({ smoothingTimeMs: 0 }));
    s.calibrate();
    s.ramp(175, 85, 1000);
    s.hold({ knee: 85 }, 400);
    const bottomImage = squatFrame(0, { knee: 85 }).landmarks;
    for (let i = 0; i < 20; i++) s.frame({ knee: i % 2 ? 124 : 126 }, (frame) => { frame.landmarks = bottomImage; });
    expect(s.result.phase).toBe('bottom');
    expect(s.result.repCount).toBe(0);
  });

  it.each([
    ['cooldown', { repCooldownMs: 10000 }],
    ['minimum duration', { minRepDurationMs: 10000 }],
  ] as const)('honors configured %s', (name, config) => {
    const s = new SquatSequence(new SquatDetector(config));
    s.calibrate();
    s.rep();
    s.rep();
    expect(s.result.repCount).toBe(name === 'cooldown' ? 1 : 0);
  });

  it.each([0.7, 1.4])('normalizes body scale %s', (scale) => {
    const s = new SquatSequence();
    s.calibrate({ scale });
    s.rep({ scale });
    expect(s.result.repCount).toBe(1);
  });

  it('does not emit rep events for replayed or out-of-order timestamps', () => {
    const s = new SquatSequence();
    s.calibrate();
    s.rep();
    expect(s.result.repCount).toBe(1);
    expect(s.detector.update(squatFrame(s.time)).repJustCounted).toBe(false);
    expect(s.detector.update(squatFrame(s.time - 100)).repJustCounted).toBe(false);
    expect(s.detector.getResult().repCount).toBe(1);
    const replay = new SquatDetector();
    for (const frame of s.frames) {
      const result = replay.update(frame);
      if (result.repJustCounted) {
        expect(replay.update(frame).repJustCounted).toBe(false);
        expect(replay.getResult().repCount).toBe(1);
      }
    }
  });

  it('cancels an attempt held beyond its maximum duration', () => {
    const s = new SquatSequence();
    s.calibrate();
    s.ramp(175, 85, 1000);
    s.hold({ knee: 85 }, DEFAULT_SQUAT_CONFIG.maxAttemptDurationMs + 1000);
    expect(s.result.formStatus).toBe('idle');
    s.ramp(85, 175, 1000);
    s.calibrate();
    expect(s.result.repCount).toBe(0);
  });
});

describe('tracking safety', () => {
  const change = (frame: SquatFrame, id: number, fields: Partial<PosePoint>, world = false) => {
    const key = world ? 'worldLandmarks' : 'landmarks';
    frame[key] = frame[key]!.map((point, index) => index === id ? { ...point, ...fields } : point);
  };
  const invalidFrames: [string, (frame: SquatFrame) => void][] = [
    ['no person', (f) => { f.landmarks = null; }],
    ['no world landmarks', (f) => { f.worldLandmarks = null; }],
    ['cropped ankle', (f) => change(f, 27, { y: 1.1 })],
    ['low image visibility', (f) => change(f, 25, { visibility: 0.1 })],
    ['missing visibility', (f) => change(f, 25, { visibility: undefined })],
    ['low world visibility', (f) => change(f, 25, { visibility: 0.1 }, true)],
    ['low presence', (f) => change(f, 23, { presence: 0.1 })],
    ['NaN coordinate', (f) => change(f, 24, { z: NaN }, true)],
    ['degenerate knee', (f) => change(f, 25, f.worldLandmarks![23], true)],
  ];

  it.each(invalidFrames)('cancels attempts on %s, keeps prior reps, and requires reacquisition standing', (_, alter) => {
    const s = new SquatSequence();
    s.calibrate();
    s.rep();
    s.ramp(175, 85, 1000);
    s.hold({ knee: 85 }, 400);
    s.frame({ knee: 85 }, alter);
    expect(s.result.formStatus).toBe('idle');
    expect(s.result.errorCode).toBeNull();
    expect(s.result.metrics.avgKneeAngle).toBeNull();
    s.ramp(85, 175, 1000);
    s.calibrate();
    expect(s.result.repCount).toBe(1);
    s.rep();
    expect(s.result.repCount).toBe(2);
  });

  it('shows neutral feedback when the person turns sideways', () => {
    const s = new SquatSequence();
    s.calibrate();
    s.ramp(175, 85, 1000);
    s.frame({ knee: 85, yaw: 70 });
    expect(s.result.trackingStatus).toBe('sideways');
    expect(s.result.formStatus).toBe('idle');
    expect(s.result.feedback).toBe('Повернись лицом к камере');
    expect(s.result.repCount).toBe(0);
  });

  it('invalidates an attempt across a long frame gap', () => {
    const s = new SquatSequence();
    s.calibrate();
    s.ramp(175, 85, 1000);
    s.hold({ knee: 85 }, 400);
    s.time += 1000;
    s.ramp(85, 175, 1000);
    s.calibrate();
    expect(s.result.repCount).toBe(0);
  });

  it('resets count and calibration explicitly', () => {
    const s = new SquatSequence();
    s.calibrate();
    s.rep();
    expect(s.detector.reset()).toMatchObject({ repCount: 0, phase: 'standing', formStatus: 'idle', calibrationProgress: 0 });
    s.rep();
    expect(s.result.repCount).toBe(0);
  });

  it('requires recalibration after a large body scale change', () => {
    const s = new SquatSequence();
    s.calibrate();
    s.frame({ knee: 85, scale: 1.6 });
    expect(s.result.trackingStatus).toBe('unreliable');
    expect(s.result.repCount).toBe(0);
  });

  it('all public thresholds are exposed in a single immutable config', () => {
    const custom: Partial<SquatConfig> = { bottomKneeAngleMax: 105 };
    const d = new SquatDetector(custom);
    expect(d.config.bottomKneeAngleMax).toBe(105);
    expect(Object.isFrozen(d.config)).toBe(true);
  });
});
```

### src/tests/useSquatExercise.test.tsx

```tsx
import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSquatExercise } from '../hooks/useSquatExercise';
import type { SquatFrame } from '../exercise-engine/types';
import { SquatSequence } from './fixtures/squatFrames';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
function mount() {
  return renderHook(({ frame, enabled }: { frame: SquatFrame | null; enabled: boolean }) =>
    useSquatExercise(frame?.landmarks ?? null, frame?.worldLandmarks ?? null, frame?.timestampMs ?? null, enabled, {}),
  { initialProps: { frame: null as SquatFrame | null, enabled: true }, wrapper });
}

function feed(hook: ReturnType<typeof mount>, frames: SquatFrame[]) {
  for (const frame of frames) {
    act(() => vi.advanceTimersByTime(50));
    hook.rerender({ frame, enabled: true });
  }
}

describe('useSquatExercise', () => {
  it('keeps one detector through StrictMode, fresh config objects and duplicate frames', () => {
    const hook = mount();
    const sequence = new SquatSequence();
    sequence.calibrate();
    sequence.rep();
    sequence.rep();
    feed(hook, sequence.frames);
    expect(hook.result.current.repCount).toBe(2);
    const last = sequence.frames.at(-1)!;
    hook.rerender({ frame: { ...last, landmarks: [...last.landmarks!] }, enabled: true });
    expect(hook.result.current.repCount).toBe(2);
    expect(hook.result.current.repJustCounted).toBe(false);
    act(() => hook.result.current.reset());
    expect(hook.result.current.repCount).toBe(0);
    expect(hook.result.current.formStatus).toBe('idle');
  });

  it('invalidates a frozen frame and cannot finish that old attempt', () => {
    const hook = mount();
    const sequence = new SquatSequence();
    sequence.calibrate();
    sequence.ramp(175, 85, 1000);
    sequence.hold({ knee: 85 }, 400);
    feed(hook, sequence.frames);
    expect(hook.result.current.phase).toBe('bottom');
    act(() => vi.advanceTimersByTime(450));
    expect(hook.result.current.formStatus).toBe('idle');
    const from = sequence.frames.length;
    sequence.ramp(85, 175, 1000);
    sequence.calibrate();
    feed(hook, sequence.frames.slice(from));
    expect(hook.result.current.repCount).toBe(0);
  });

  it('keeps completed reps on camera stop and removes the watchdog on unmount', () => {
    const hook = mount();
    const sequence = new SquatSequence();
    sequence.calibrate();
    sequence.rep();
    feed(hook, sequence.frames);
    hook.rerender({ frame: null, enabled: false });
    expect(hook.result.current.repCount).toBe(1);
    expect(hook.result.current.formStatus).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
    const from = sequence.frames.length;
    sequence.calibrate();
    sequence.rep();
    feed(hook, sequence.frames.slice(from));
    expect(hook.result.current.repCount).toBe(2);
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
```

### src/tests/ExerciseFeedback.test.tsx

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExerciseFeedback } from '../components/ExerciseFeedback/ExerciseFeedback';
import { SquatDetector, SQUAT_FEEDBACK } from '../exercise-engine/squatDetector';
import { SquatSequence } from './fixtures/squatFrames';

afterEach(cleanup);

describe('ExerciseFeedback', () => {
  it('shows a neutral state and no technique errors without a person', () => {
    render(<ExerciseFeedback result={new SquatDetector().getResult()} onReset={() => {}} />);
    expect(screen.getByRole('status').textContent).toContain('SEARCHING FOR USER');
    expect(screen.queryByText('FORM ERROR')).toBeNull();
    expect(screen.getAllByText('—')).toHaveLength(7);
  });

  it('shows exactly one prioritized error and exposes the reset action', () => {
    const sequence = new SquatSequence();
    sequence.calibrate();
    sequence.ramp(175, 85, 1000);
    sequence.hold({ knee: 85, kneeRatio: 0.35, torsoLean: 55 }, 700);
    const onReset = vi.fn();
    render(<ExerciseFeedback result={sequence.result} onReset={onReset} />);
    expect(screen.getByRole('status').textContent).toBe(SQUAT_FEEDBACK.knees_in);
    expect(screen.queryByText(SQUAT_FEEDBACK.torso_lean)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'СБРОСИТЬ СЧЁТЧИК' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('shows a counted rep and good form after a complete valid cycle', () => {
    const sequence = new SquatSequence();
    sequence.calibrate();
    sequence.rep();
    render(<ExerciseFeedback result={sequence.result} onReset={() => {}} />);
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('GOOD FORM')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('REP +1');
  });
});
```

### src/tests/usePoseDetection.test.tsx

```tsx
import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePoseDetection } from '../hooks/usePoseDetection';

const mocks = vi.hoisted(() => ({ resolveVision: vi.fn(), create: vi.fn() }));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: mocks.resolveVision },
  PoseLandmarker: { createFromOptions: mocks.create },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function makeStream() {
  const track = Object.assign(new EventTarget(), {
    stop: vi.fn(), readyState: 'live', muted: false,
  });
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  return { track, stream: stream as unknown as MediaStream };
}

function makeDetector() {
  return {
    close: vi.fn(),
    detectForVideo: vi.fn().mockReturnValue({ landmarks: [], close: vi.fn() }),
  };
}

let camera: ReturnType<typeof makeStream>;
let detector: ReturnType<typeof makeDetector>;
let getUserMedia: ReturnType<typeof vi.fn>;
let video: HTMLVideoElement;
let videoRef: { current: HTMLVideoElement | null };
let frames: Map<number, FrameRequestCallback>;
let frameCounter: number;

async function start() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

function tick(timestamp: number, videoTime: number) {
  video.currentTime = videoTime;
  act(() => {
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach((callback) => callback(timestamp));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('isSecureContext', true);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  camera = makeStream();
  detector = makeDetector();
  getUserMedia = vi.fn().mockResolvedValue(camera.stream);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  mocks.resolveVision.mockResolvedValue({});
  mocks.create.mockResolvedValue(detector);
  video = document.createElement('video');
  Object.defineProperties(video, {
    readyState: { configurable: true, value: 4 },
    videoWidth: { configurable: true, value: 1280 },
    videoHeight: { configurable: true, value: 720 },
    paused: { configurable: true, value: false },
  });
  vi.spyOn(video, 'play').mockResolvedValue();
  vi.spyOn(video, 'pause').mockImplementation(() => {});
  videoRef = { current: video };
  frames = new Map();
  frameCounter = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frames.set(++frameCounter, callback);
    return frameCounter;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('pose lifecycle', () => {
  it('initializes once in StrictMode and closes all owned resources on unmount', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result, unmount } = renderHook(() => usePoseDetection(videoRef), { wrapper });
    await start();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith({}, expect.objectContaining({ runningMode: 'VIDEO', numPoses: 1 }));
    expect(result.current.cameraStatus).toBe('active');
    expect(result.current.engineStatus).toBe('active');
    expect(frames.size).toBe(1);
    unmount();
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
    expect(detector.close).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    expect(video.srcObject).toBeNull();
  });

  it('stops a camera grant that resolves after unmount', async () => {
    const pending = deferred<MediaStream>();
    getUserMedia.mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => usePoseDetection(videoRef));
    await start();
    unmount();
    await act(async () => { pending.resolve(camera.stream); });
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it('closes a landmarker that finishes loading after unmount', async () => {
    const pending = deferred<typeof detector>();
    mocks.create.mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => usePoseDetection(videoRef));
    await start();
    unmount();
    await act(async () => { pending.resolve(detector); });
    expect(detector.close).toHaveBeenCalledTimes(1);
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it('serializes retry behind pending initialization and closes the stale model first', async () => {
    const pending = deferred<typeof detector>();
    const next = makeDetector();
    mocks.create.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(next);
    const { rerender } = renderHook(({ retry }) => usePoseDetection(videoRef, true, retry), { initialProps: { retry: 0 } });
    await start();
    rerender({ retry: 1 });
    await start();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(detector); });
    expect(detector.close).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(detector.close.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[1]);
    expect(frames.size).toBe(1);
  });

  it('processes only new frames, throttles inference, and clears a missing person', async () => {
    const release = vi.fn();
    const point = { x: 0.5, y: 0.3, z: 0, visibility: 1 };
    const worldPoint = { x: 0.1, y: 0.2, z: -0.3, visibility: 1 };
    detector.detectForVideo.mockReturnValueOnce({ landmarks: [[point]], worldLandmarks: [[worldPoint]], close: release });
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    tick(100, 1);
    expect(result.current.isPersonDetected).toBe(true);
    expect(result.current.landmarks?.[0]).not.toBe(point);
    expect(result.current.worldLandmarks?.[0]).toEqual(worldPoint);
    expect(result.current.worldLandmarks?.[0]).not.toBe(worldPoint);
    expect(result.current.poseTimestampMs).toBe(100);
    expect(release).toHaveBeenCalledTimes(1);
    tick(160, 1); // Same video frame, despite elapsed time.
    tick(170, 2);
    tick(180, 3); // New frame, but too soon for 20 Hz limit.
    expect(detector.detectForVideo).toHaveBeenCalledTimes(2);
    expect(result.current.isPersonDetected).toBe(false);
    expect(result.current.landmarks).toBeNull();
    expect(result.current.worldLandmarks).toBeNull();
    expect(frames.size).toBe(1);
  });

  it.each([
    ['NotAllowedError', 'CAMERA ACCESS REQUIRED'],
    ['NotFoundError', 'NO CAMERA FOUND'],
    ['NotReadableError', 'CAMERA UNAVAILABLE'],
  ])('handles %s without starting the engine', async (name, message) => {
    getUserMedia.mockRejectedValue(new DOMException('Camera failed', name));
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    expect(result.current.error).toContain(message);
    expect(result.current.isLoading).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it('explains missing mediaDevices without crashing', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    expect(result.current.error).toContain('HTTPS or localhost');
    expect(result.current.isLoading).toBe(false);
  });

  it('waits for a real video frame before loading the model', async () => {
    Object.defineProperty(video, 'readyState', { configurable: true, value: 0 });
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(result.current.cameraStatus).toBe('starting');
    await act(async () => {
      Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
      video.dispatchEvent(new Event('loadeddata'));
    });
    expect(result.current.engineStatus).toBe('active');
  });

  it('stops the camera when model loading fails', async () => {
    mocks.create.mockRejectedValue(new Error('Missing model'));
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    expect(result.current.error).toContain('POSE ENGINE COULD NOT LOAD');
    expect(result.current.cameraStatus).toBe('idle');
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it('times out a stalled video and stops its stream', async () => {
    Object.defineProperty(video, 'readyState', { configurable: true, value: 0 });
    vi.mocked(video.play).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(result.current.cameraStatus).toBe('error');
    expect(result.current.isLoading).toBe(false);
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('aborts waiting for video data on unmount', async () => {
    Object.defineProperty(video, 'readyState', { configurable: true, value: 0 });
    const { unmount } = renderHook(() => usePoseDetection(videoRef));
    await start();
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears stale landmarks and pauses inference while hidden or muted', async () => {
    detector.detectForVideo.mockReturnValue({
      landmarks: [[{ x: 0.5, y: 0.5, z: 0, visibility: 1 }]], close: vi.fn(),
    });
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    tick(100, 1);
    expect(result.current.isPersonDetected).toBe(true);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    tick(200, 2);
    expect(result.current.landmarks).toBeNull();
    expect(detector.detectForVideo).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    tick(300, 3);
    expect(result.current.isPersonDetected).toBe(true);
    camera.track.muted = true;
    act(() => { camera.track.dispatchEvent(new Event('mute')); });
    tick(400, 4);
    expect(result.current.landmarks).toBeNull();
    expect(result.current.cameraStatus).toBe('starting');
    expect(detector.detectForVideo).toHaveBeenCalledTimes(2);
    camera.track.muted = false;
    act(() => { camera.track.dispatchEvent(new Event('unmute')); });
    tick(500, 5);
    expect(result.current.cameraStatus).toBe('active');
    expect(result.current.isPersonDetected).toBe(true);
  });

  it('stops detection and the camera on an inference error', async () => {
    detector.detectForVideo.mockImplementation(() => { throw new Error('Inference failed'); });
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    tick(100, 1);
    expect(result.current.error).toContain('POSE DETECTION STOPPED');
    expect(detector.close).toHaveBeenCalledTimes(1);
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it('cleans up on camera disconnection', async () => {
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    act(() => { camera.track.dispatchEvent(new Event('ended')); });
    expect(result.current.error).toContain('CAMERA DISCONNECTED');
    expect(detector.close).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it('releases resources on pagehide and does not close twice on unmount', async () => {
    const { result, unmount } = renderHook(() => usePoseDetection(videoRef));
    await start();
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(result.current.cameraStatus).toBe('idle');
    expect(frames.size).toBe(0);
    unmount();
    expect(detector.close).toHaveBeenCalledTimes(1);
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
  });

  it('stops and restarts with one loop when enabled changes', async () => {
    const { result, rerender } = renderHook(({ enabled }) => usePoseDetection(videoRef, enabled), { initialProps: { enabled: true } });
    await start();
    rerender({ enabled: false });
    expect(result.current.cameraStatus).toBe('idle');
    expect(frames.size).toBe(0);
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
    expect(detector.close).toHaveBeenCalledTimes(1);
    const freshCamera = makeStream();
    const freshDetector = makeDetector();
    getUserMedia.mockResolvedValue(freshCamera.stream);
    mocks.create.mockResolvedValue(freshDetector);
    rerender({ enabled: true });
    await start();
    expect(frames.size).toBe(1);
    expect(result.current.engineStatus).toBe('active');
  });
});
```

## 4. Как это работает

### Исправление: движение есть, а фаза остаётся standing

Фронтальная оценка 3D-глубины может почти не менять knee angle и hip height даже
при видимом приседании. Теперь спуск также распознаётся по изображению: таз должен
опуститься минимум на 0.12 исходной длины корпуса, а проекции обеих бёдер — сократиться.
Для bottom нужны опускание на 0.4 и сокращение обеих проекций минимум на 18%.
Высоты предварительно делятся на ширину плеч, поэтому общий сдвиг или масштабирование
картинки сами по себе не дают повтор. Фильтры visibility и ошибок техники сохранены.

При таком способе распознавания подъём также определяется по изображению, а зачёт
требует восстановления длины проекций обоих бёдер до baseline с допуском 2%.
Debug-показатель `Hip drop (camera)` показывает этот путь независимо от 3D-оценки.
Непрерывные повторения проверяются без искусственных пауз. 70 тестов и сборка проходят;
точность на конкретной webcam требует проверки пользователем.

### Координаты и нормализация

`NormalizedLandmark.x/y` привязаны к ширине/высоте изображения. По ним проверяется,
что плечи, таз, колени и лодыжки находятся в кадре и имеют достаточную visibility.
`presence` проверяется, если поле есть; установленный JS API MediaPipe объявляет
`visibility`, но не гарантирует отдельное поле `presence` в результате.

Для 3D-углов берутся `worldLandmarks`: `x/y/z` находятся в одинаковых единицах.
Это важно для фронтальной камеры: колено сгибается в глубину, а наклон корпуса вперёд
может почти не менять его вертикальную 2D-проекцию. Использование world landmarks
не требует второй модели и не меняет camera inference loop.

```text
knee angle = angle(hip, knee, ankle)           # отдельно для обеих ног
torso lean = atan2(horizontal torso length, vertical torso length)
knee ratio = |leftKnee.x - rightKnee.x| / |leftAnkle.x - rightAnkle.x|
hip height = ankleMid.y - hipMid.y
hipDepthDelta = (standingHipHeight - currentHipHeight) / standingTorsoLength
```

Глубина привязана к лодыжкам: мировые координаты центрированы около таза, поэтому
изменение абсолютного `hip.y` само по себе не подходит. Масштаб нормализуется на длину
корпуса из калибровки. Пиксельные расстояния и размеры canvas в FSM не участвуют.
Ширина коленей берётся по горизонтальной оси, чтобы разница глубины двух коленей
не маскировала их сближение в кадре.

### Калибровка

Нужно видеть восемь критичных суставов, оба колена должны иметь оценку не ниже 150°, корпус
почти вертикален, стойка достаточно широкая. После 1000 мс и минимум 12 кадров
вычисляются медианы hip height и torso length. При заметном дрейфе высоты таза
сбор начинается заново. При 10 кадрах/с сбор займёт немного больше секунды.

После потери трекинга, stop/start или большого скачка размера тела калибровка повторяется.
Счётчик при этом сохраняется; кнопка сброса очищает также счётчик.

### Фазы и защита от повторного зачёта

- **Standing → descending:** средний угол ≤145°, таз опустился минимум на 0.08 длины
  корпуса; либо подтверждён спуск по изображению, описанный выше. Условия удержаны 120 мс.
- **Descending → bottom:** оба колена ≤110° и hipDepthDelta ≥0.25; либо подтверждена
  глубина по изображению. В обоих случаях требуется подтверждение на протяжении 60 мс.
- **Descending → ascending без bottom:** угол вырос от минимума на 10° и удержался;
  попытка считается мелкой, если до завершения так и не достигнута глубина.
- **Bottom → ascending:** угол вырос от минимума на 10° и достиг 125° либо таз поднялся
  в изображении на 0.08 длины корпуса. Условия подтверждаются в течение 120 мс.
- **Ascending → standing:** проекции обоих бёдер вернулись к baseline с допуском 2%,
  таз вернулся с допуском 0.1. При использовании 3D-пути дополнительно требуется угол
  не ниже меньшего из 160° и исходного угла минус 5°. Верхняя позиция удерживается
  120 мс. Только здесь возможен `repJustCounted = true`.
- Между засчитанными/завершёнными попытками действует cooldown 900 мс на выдачу репа.
  Новую попытку можно начинать во время этого интервала, но завершение слишком рано не засчитается.
- Минимальная длительность активной попытки — 650 мс. Через 15 секунд незавершённая
  попытка отменяется с переходом к калибровке.
- После зачёта детектор сразу готов к новому циклу: верхняя позиция уже подтверждена.
- Повторный или устаревший timestamp не продвигает FSM и не создаёт rep event.

EMA сглаживает метрики с постоянной времени 80 мс, поэтому поведение меньше зависит
от FPS. Разные пороги входа/выхода и временные подтверждения уменьшают дрожание фаз.
Hook не запускает ещё один RAF: он реагирует на входные кадры и использует один
отменяемый timeout для обнаружения отсутствия новых кадров больше 400 мс.

### Error Mode

Показывается одна приоритетная ошибка:

1. `too_shallow` — «Присядь ниже».
2. `knees_in` — «Разведи колени».
3. `torso_lean` — «Держи корпус ровнее».
4. `incomplete_lockout` — «Полностью выпрямись в верхней точке».

Недостаточная глубина не объявляется ошибкой в самом начале нормального спуска.
Подсказка появляется при развороте вверх без достижения bottom либо при остановке
прогресса вниз на секунду. Если человек остановился, затем углубил присед и завершил
правильный цикл, предварительная подсказка глубины не запрещает зачёт.

Ошибки коленей/корпуса фиксируются после 180 мс непрерывного нарушения и остаются
до конца попытки. Одиночный скачок landmarks не должен портить корректный реп.
При остановке на подъёме возникает подсказка полного выпрямления; дальнейшее
выпрямление может завершить реп. Если вместо этого человек снова опускается,
`incomplete_lockout` запоминается, и такой цикл не засчитывается.

Отсутствие человека, слабый трекинг и сильный поворот дают нейтральный статус,
инструкцию по положению перед камерой и `errorCode = null`.

## 5. Запуск и проверка

```bash
npm ci
npm run dev
```

На Windows при блокировке `npm.ps1` используй `npm.cmd`.
Открой адрес из терминала, разреши камеру, покажи всё тело и дождись калибровки.
Ниже видео находится панель **SQUAT TRAINING**; метрики раскрываются через **DEBUG METRICS**.

| Сценарий | Ожидаемый результат |
|---|---|
| Три полных приседа с паузой стоя | Счётчик 3; один rep event на завершение. |
| Постоять неподвижно | Счётчик не меняется. |
| Остаться внизу несколько секунд | Фаза bottom, до подъёма реп не начисляется. |
| Немного согнуть колени | Нет полноценной попытки и случайного репа. |
| Начать присед, развернуться слишком высоко | «Присядь ниже», без репа. |
| Свести колени на заметное время во время приседа | «Разведи колени», без репа даже после коррекции наверху. |
| Сильно наклонить корпус во время приседа | «Держи корпус ровнее», без репа. |
| Одновременно несколько ошибок | Одна подсказка согласно приоритету. |
| Остановиться на полуподъёме | Реп не начисляется; затем подсказка выпрямления. |
| Снова опуститься до полного выпрямления | Незачётная попытка; требуется закончить её стоя. |
| Убрать лодыжку из кадра / повернуться боком | Нейтральный статус, попытка отменена. |
| Вернуться в кадр уже в приседе | Нет зачёта старого приседа; сначала встать и откалиброваться. |
| Остановить и включить камеру | Счётчик сохраняется, калибровка повторяется. |
| Нажать сброс | Счётчик 0, новая калибровка. |

Автоматические проверки:

```bash
npm test
npm run build
```

Тесты проверяют собственную логику на синтетических последовательностях суставов:
10/20/30 FPS, валидные и ошибочные циклы, один кадр шума, неполный подъём,
изменения масштаба, отсутствие confidence, выход из кадра, паузы и повторные timestamps.
Отдельно проверены React StrictMode, watchdog, cleanup и отображение единственной ошибки.

Проверка на настоящей webcam и нескольких людях остаётся необходимой для подбора
порогов. В этой сессии она не выполнена: ранее браузерный инструмент сообщил об отказе
в разрешении открыть локальную страницу. Синтетические тесты не измеряют точность MediaPipe.

## 6. Что настраивать первым

Все значения находятся в `DEFAULT_SQUAT_CONFIG` внутри `src/exercise-engine/squatDetector.ts`.
Можно передать частичный конфиг в конструктор; в hook он фиксируется на mount.

| Параметр | Значение | Что меняет |
|---|---:|---|
| `bottomKneeAngleMax` | 110° | Увеличение облегчает достижение глубины по углу. |
| `minHipDepthDelta` | 0.25 | Минимальное опускание таза в долях длины корпуса. |
| `standingKneeAngleMin` | 160° | Максимальный порог возврата для 3D-пути; адаптируется к baseline. |
| `calibrationKneeAngleMin` | 150° | Минимальная оценка прямых ног для калибровки. |
| `frontalStartHipDrop` | 0.12 | Начало спуска по изображению. |
| `frontalDepthHipDrop` | 0.4 | Минимальное опускание таза для фронтального пути. |
| `frontalThighCompression` | 0.18 | Сокращение проекции каждого бедра для фронтальной глубины. |
| `minKneeDistanceRatio` | 0.65 | Чувствительность к сближению коленей. |
| `maxTorsoLeanDeg` | 35° | Допустимый наклон корпуса относительно вертикали камеры. |
| `formErrorHoldMs` | 180 мс | Как долго нарушение должно наблюдаться перед фиксацией. |
| `minVisibility` | 0.6 | Минимальная уверенность для критичных суставов. |
| `smoothingTimeMs` | 80 мс | Компромисс между шумом и задержкой реакции. |
| `standingHoldMs` | 120 мс | Подтверждение верхней позиции без повторной задержки. |
| `repCooldownMs` | 900 мс | Минимальный интервал до следующего зачёта. |
| `maxFrameGapMs` | 400 мс | При большей паузе текущая попытка сбрасывается. |

Сначала сравни debug-метрики с наблюдаемым движением на конкретной камере, затем меняй
один порог за раз. Сохраняй порядок `bottomKneeAngleMax < bottomExitKneeAngleMin <
descendingKneeAngleMax < standingKneeAngleMin`. Не отключай фильтрацию уверенности ради счётчика.

## 7. Ограничения

- Монокулярные 3D world landmarks — оценка модели. Ракурс, одежда, свет и перекрытие суставов
  могут давать неверные углы даже при высокой visibility.
- Режим рассчитан на фронтальный ракурс и примерно ровно установленную камеру.
  При большом повороте система намеренно прекращает анализ. Наклон камеры влияет
  на оценку вертикали корпуса.
- Нормальный наклон корпуса зависит от пропорций человека и вида приседа. Порог 35°
  — стартовая настройка для демо, не универсальный критерий безопасной техники.
- Ширина коленей относительно лодыжек — простая эвристика. Очень широкая или узкая
  стойка может потребовать настройки; детектор не ставит диагнозов.
- Консервативная отмена попытки при потере даже одного нужного сустава может пропустить
  хороший присед, зато не позволяет засчитать неподтверждённую часть движения.
- Очень быстрые приседы и короткая пауза наверху могут не пройти временные фильтры.
  При редких кадрах, между которыми не видна нижняя точка, реп не засчитывается.
- Есть только один человек и один squat detector. Счётчик существует в памяти текущей
  страницы; видео и историю движений приложение не сохраняет.

## 8. Git workflow

`main` защищена правилом пользователя. Перед новой задачей при чистой рабочей копии:

```bash
git checkout main
git pull --ff-only
git checkout -b feature/<название-задачи>
```

После реализации:

```bash
git status
git add .
git commit -m "feat: implement squat detection state machine"
git push -u origin feature/<название-задачи>
```

Перед каждым изменением кода проверяй `git branch --show-current`.
Изменения допустимы только в feature-ветке. После её push задача агента заканчивается:
Pull Request создаёт пользователь, merge в `main` также выполняет только пользователь.

Разбиение на три небольших коммита:

1. `feat: implement squat detection state machine` — геометрия, типы, FSM и unit-тесты.
2. `feat: connect squat detector to training UI` — world landmarks, hook, feedback и React-тесты.
3. `docs: document squat calibration and validation` — инструкция, полный код, настройка и ограничения.

Перед push выполняются `git fetch origin` и проверка удалённой истории.
Коммиты используют настроенного автора `bekw-eg`; force push не нужен.
