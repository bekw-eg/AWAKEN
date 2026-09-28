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
