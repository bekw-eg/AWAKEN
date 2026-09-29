import { PushUpDetector } from '../../exercise-engine/pushUpDetector';
import type { PushUpDetectionResult, PushUpFrame, PushUpSide } from '../../exercise-engine/pushUpTypes';
import type { PosePoint } from '../../exercise-engine/types';

export type PushUpPose = {
  elbow?: number; side?: PushUpSide; hipOffset?: number; yaw?: number;
  leftConfidence?: number; rightConfidence?: number; kneeOffset?: number;
};
/** Articulated equal-length arms; wrists/ankles stay grounded as shoulders move. */
export function pushUpFrame(timestampMs: number, options: PushUpPose = {}): PushUpFrame {
  const { elbow = 175, side = 'left', hipOffset = 0, yaw = 0, kneeOffset = 0 } = options;
  const bend = elbow * Math.PI / 360;
  const shoulderY = 0.45 - 0.6 * Math.sin(bend);
  const world: PosePoint[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1, presence: 1 }));
  for (const [name, ids, z] of [['left', [11, 13, 15, 23, 25, 27], -0.2], ['right', [12, 14, 16, 24, 26, 28], 0.2]] as const) {
    const confidence = (name === 'left' ? options.leftConfidence : options.rightConfidence) ?? (side === name ? 1 : 0.8);
    const hipY = shoulderY + (0.45 - shoulderY) * 0.45 + hipOffset;
    const coords = [[-0.65, shoulderY], [-0.65 + 0.3 * Math.cos(bend), (shoulderY + 0.45) / 2],
      [-0.65, 0.45], [-0.065, hipY], [0.2925, (hipY + 0.45) / 2 + kneeOffset], [0.65, 0.45]];
    ids.forEach((id, i) => { world[id] = { x: coords[i][0], y: coords[i][1], z, visibility: confidence, presence: confidence }; });
  }
  const r = yaw * Math.PI / 180;
  const worldLandmarks = world.map(p => ({ ...p, x: p.x * Math.cos(r) + p.z * Math.sin(r), z: -p.x * Math.sin(r) + p.z * Math.cos(r) }));
  const landmarks = worldLandmarks.map(p => ({ ...p, x: 0.5 + p.x * 0.55, y: 0.35 + p.y * 0.8 }));
  return { landmarks, worldLandmarks, timestampMs };
}
export class PushUpSequence {
  time = 0;
  frames: PushUpFrame[] = [];
  history: PushUpDetectionResult[] = [];
  constructor(readonly detector = new PushUpDetector(), readonly options: PushUpPose = {}) {}
  get result() { return this.detector.getResult(); }
  frame(options: PushUpPose = {}, alter?: (frame: PushUpFrame) => void) {
    this.time += 50;
    const frame = pushUpFrame(this.time, { ...this.options, ...options });
    alter?.(frame);
    this.frames.push(frame);
    const result = this.detector.update(frame);
    this.history.push(result);
    return result;
  }
  hold(elbow = 175, ms = 400, options: PushUpPose = {}) {
    for (let t = 0; t < ms; t += 50) this.frame({ ...options, elbow });
    return this.result;
  }
  ramp(from: number, to: number, ms = 800, options: PushUpPose = {}) {
    for (let t = 50; t <= ms; t += 50) this.frame({ ...options, elbow: from + (to - from) * t / ms });
    return this.result;
  }
  rep(bottom = 85, options: PushUpPose = {}) {
    this.ramp(175, bottom, 800, options);
    this.hold(bottom, 250, options);
    this.ramp(bottom, 175, 800, options);
    return this.hold(175, 400, options);
  }
}
