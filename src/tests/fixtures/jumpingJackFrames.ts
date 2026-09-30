import type { PosePoint } from '../../exercise-engine/types';

// Simplified helper to create a full pose frame with specific landmark positions
export function createJJFrame(
  leftShoulder: PosePoint,
  rightShoulder: PosePoint,
  leftWrist: PosePoint,
  rightWrist: PosePoint,
  leftAnkle: PosePoint,
  rightAnkle: PosePoint
): { landmarks: PosePoint[]; worldLandmarks: PosePoint[] } {
  const landmarks = Array(33).fill({ x: 0, y: 0, z: 0, visibility: 1 });
  const worldLandmarks = Array(33).fill({ x: 0, y: 0, z: 0, visibility: 1 });

  // Update relevant 2D landmarks (Y goes down)
  landmarks[11] = leftShoulder;
  landmarks[12] = rightShoulder;
  landmarks[15] = leftWrist;
  landmarks[16] = rightWrist;
  landmarks[27] = leftAnkle;
  landmarks[28] = rightAnkle;

  // Update relevant 3D world landmarks
  worldLandmarks[11] = leftShoulder;
  worldLandmarks[12] = rightShoulder;
  worldLandmarks[15] = leftWrist;
  worldLandmarks[16] = rightWrist;
  worldLandmarks[27] = leftAnkle;
  worldLandmarks[28] = rightAnkle;

  return { landmarks, worldLandmarks };
}

// Shoulder width = 0.4 (from x:0.3 to x:0.7)
// Closed ankles: distance = 0.2 (from x:0.4 to x:0.6) -> ratio = 0.2 / 0.4 = 0.5 (< 1.5)
// Arms down: wrist Y > shoulder Y
export const closedFrame = createJJFrame(
  { x: 0.3, y: 0.3, z: 0, visibility: 1 }, // left shoulder
  { x: 0.7, y: 0.3, z: 0, visibility: 1 }, // right shoulder
  { x: 0.2, y: 0.8, z: 0, visibility: 1 }, // left wrist (down)
  { x: 0.8, y: 0.8, z: 0, visibility: 1 }, // right wrist (down)
  { x: 0.4, y: 0.9, z: 0, visibility: 1 }, // left ankle
  { x: 0.6, y: 0.9, z: 0, visibility: 1 }  // right ankle
);

// Open ankles: distance = 1.0 -> ratio = 2.5 (> 1.9).
// Arms up: wrist Y minus shoulder Y = -0.2 (< -0.05).
export const openFrame = createJJFrame(
  { x: 0.3, y: 0.3, z: 0, visibility: 1 }, // left shoulder
  { x: 0.7, y: 0.3, z: 0, visibility: 1 }, // right shoulder
  { x: 0.1, y: 0.1, z: 0, visibility: 1 }, // left wrist (up)
  { x: 0.9, y: 0.1, z: 0, visibility: 1 }, // right wrist (up)
  { x: 0.0, y: 0.9, z: 0, visibility: 1 }, // left ankle
  { x: 1.0, y: 0.9, z: 0, visibility: 1 }  // right ankle
);

// Narrow legs: distance = 0.68 -> ratio = 1.7 (< 1.9).
export const narrowLegsFrame = createJJFrame(
  { x: 0.3, y: 0.3, z: 0, visibility: 1 }, // left shoulder
  { x: 0.7, y: 0.3, z: 0, visibility: 1 }, // right shoulder
  { x: 0.1, y: 0.1, z: 0, visibility: 1 }, // left wrist (up)
  { x: 0.9, y: 0.1, z: 0, visibility: 1 }, // right wrist (up)
  { x: 0.16, y: 0.9, z: 0, visibility: 1 }, // left ankle
  { x: 0.84, y: 0.9, z: 0, visibility: 1 }  // right ankle
);

// Low arms: wrists below shoulders, Y difference = +0.05.
export const lowArmsFrame = createJJFrame(
  { x: 0.3, y: 0.3, z: 0, visibility: 1 }, // left shoulder
  { x: 0.7, y: 0.3, z: 0, visibility: 1 }, // right shoulder
  { x: 0.1, y: 0.35, z: 0, visibility: 1 }, // left wrist
  { x: 0.9, y: 0.35, z: 0, visibility: 1 }, // right wrist
  { x: 0.0, y: 0.9, z: 0, visibility: 1 }, // left ankle
  { x: 1.0, y: 0.9, z: 0, visibility: 1 }  // right ankle
);

// Incomplete return: ankles open, but arms down
export const incompleteReturnFrame = createJJFrame(
  { x: 0.3, y: 0.3, z: 0, visibility: 1 }, // left shoulder
  { x: 0.7, y: 0.3, z: 0, visibility: 1 }, // right shoulder
  { x: 0.2, y: 0.8, z: 0, visibility: 1 }, // left wrist (down)
  { x: 0.8, y: 0.8, z: 0, visibility: 1 }, // right wrist (down)
  { x: 0.0, y: 0.9, z: 0, visibility: 1 }, // left ankle (still open)
  { x: 1.0, y: 0.9, z: 0, visibility: 1 }  // right ankle (still open)
);

// Low visibility
export const invisibleFrame = createJJFrame(
  { x: 0.3, y: 0.3, z: 0, visibility: 0.1 }, // left shoulder hidden
  { x: 0.7, y: 0.3, z: 0, visibility: 1 }, 
  { x: 0.2, y: 0.8, z: 0, visibility: 1 }, 
  { x: 0.8, y: 0.8, z: 0, visibility: 1 }, 
  { x: 0.4, y: 0.9, z: 0, visibility: 1 }, 
  { x: 0.6, y: 0.9, z: 0, visibility: 1 }  
);
