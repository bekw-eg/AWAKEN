import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export type { NormalizedLandmark };
export type CameraStatus = 'idle' | 'requesting' | 'starting' | 'active' | 'error';
export type EngineStatus = 'idle' | 'loading' | 'active' | 'error';

export type PoseState = {
  landmarks: NormalizedLandmark[] | null;
  cameraStatus: CameraStatus;
  engineStatus: EngineStatus;
  error: string | null;
  videoSize: { width: number; height: number };
};

export type UsePoseDetectionResult = PoseState & {
  isLoading: boolean;
  isPersonDetected: boolean;
};
