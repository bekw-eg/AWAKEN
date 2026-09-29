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
