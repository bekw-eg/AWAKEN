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
