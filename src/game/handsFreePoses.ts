import { angle, distance, leanFromVertical, midpoint } from '../exercise-engine/angles';
import { DEFAULT_PUSH_UP_CONFIG as PUSH } from '../exercise-engine/pushUpDetector';
import type { PushUpFrame } from '../exercise-engine/pushUpTypes';
import type { PosePoint } from '../exercise-engine/types';
import { HANDS_FREE_CONFIG as C } from './handsFreeConfig';

function reliable(p: PosePoint | undefined, image = false, visibility: number = C.minVisibility, presence: number = C.minPresence): p is PosePoint {
  return !!p && [p.x, p.y, p.z, p.visibility ?? 0, p.presence ?? 1].every(Number.isFinite) &&
    (p.visibility ?? 0) >= visibility && (p.presence ?? 1) >= presence &&
    (!image || p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
}

export function isStandingPose(frame: PushUpFrame): boolean {
  return standingPoseFeedback(frame) === null;
}

/** Match the squat detector's calibration geometry, including the torso midline. */
export function standingPoseFeedback(frame: PushUpFrame): string | null {
  const image = frame.landmarks, world = frame.worldLandmarks;
  if (!image || !world) return 'Waiting for body tracking';
  const groups = [{ ids: [11, 12], name: 'shoulders' }, { ids: [23, 24], name: 'hips' },
    { ids: [25, 26], name: 'knees' }, { ids: [27, 28], name: 'ankles' }];
  for (const { ids, name } of groups) {
    if (ids.some(id => !reliable(image[id], true) || !reliable(world[id]))) return `Keep both ${name} visible · step back if needed`;
  }
  if ([[23, 25, 27], [24, 26, 28]].some(([h, k, a]) => (angle(world[h], world[k], world[a]) ?? 0) < C.standingKneeAngle)) {
    return 'Straighten your knees and stand comfortably upright';
  }
  if ((leanFromVertical(midpoint(world[11], world[12]), midpoint(world[23], world[24])) ?? Infinity) > C.standingLeanDeg) {
    return 'Bring your shoulders above your hips';
  }
  return null;
}

export function isClosedPose(frame: PushUpFrame): boolean {
  const image = frame.landmarks, world = frame.worldLandmarks;
  const ids = [11, 12, 15, 16, 27, 28];
  if (!image || !world || ids.some(id => !reliable(image[id], true) || !reliable(world[id]))) return false;
  const width = distance(world[11], world[12]);
  return width > 0 && distance(world[27], world[28]) / width <= C.closedAnkleRatio &&
    image[15].y - image[11].y >= C.armsDownMargin && image[16].y - image[12].y >= C.armsDownMargin;
}

/** A pose check only: it never updates or arms an exercise detector. */
export function isPushupReadyPose(frame: PushUpFrame): boolean {
  const image = frame.landmarks, aspect = frame.imageAspectRatio ?? 1;
  if (!image || !Number.isFinite(aspect) || aspect <= 0) return false;
  const project = (id: number) => ({ ...image[id], x: image[id].x * aspect, z: 0 });
  return [[11, 13, 15, 23, 25, 27], [12, 14, 16, 24, 26, 28]].some(ids => {
    if (ids.some(id => !reliable(image[id], true, id >= 25 ? PUSH.minLegVisibility : PUSH.minVisibility, PUSH.minPresence))) return false;
    const [s, e, w, h, k, a] = ids.map(project);
    const length = distance(s, a), torso = distance(s, h);
    if (!length || !torso || Math.abs(a.y - s.y) / length > PUSH.maxBodyVerticalRatio) return false;
    // Hands must support the shoulders, rather than point above the body.
    if (w.y <= s.y || w.y <= h.y) return false;
    for (const [left, right] of [[11, 12], [23, 24]]) {
      if (reliable(image[left]) && reliable(image[right]) && distance(project(left), project(right)) / torso > PUSH.maxSidePairToTorsoRatio) return false;
    }
    const hipOffset = Math.abs((a.x - s.x) * (s.y - h.y) - (s.x - h.x) * (a.y - s.y)) / (length * length);
    return (angle(s, e, w) ?? 0) >= PUSH.topElbowAngleMin &&
      (angle(s, h, a) ?? 0) >= PUSH.minBodyAngle && (angle(h, k, a) ?? 0) >= PUSH.minKneeAngle && hipOffset <= PUSH.maxHipOffsetRatio;
  });
}
