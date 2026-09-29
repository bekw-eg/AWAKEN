import { useCallback, useEffect, useRef, useState } from 'react';
import { JumpingJackDetector } from '../exercise-engine/jumpingJackDetector';
import type { PosePoint, JumpingJackConfig, JumpingJackDetectionResult } from '../exercise-engine/types';

export function useJumpingJackExercise(
  landmarks: readonly PosePoint[] | null,
  worldLandmarks: readonly PosePoint[] | null,
  timestampMs: number | null,
  enabled = true,
  config?: Partial<JumpingJackConfig>,
): JumpingJackDetectionResult & { reset: () => void } {
  const detectorRef = useRef<JumpingJackDetector | null>(null);
  
  if (!detectorRef.current) {
    detectorRef.current = new JumpingJackDetector(config);
  }
  
  const detector = detectorRef.current;
  const [result, setResult] = useState(() => detector.getResult());

  useEffect(() => {
    if (!enabled || timestampMs === null) {
      setResult(detector.pause());
      return;
    }
    
    setResult(detector.update({ landmarks, worldLandmarks, timestampMs }));
    
    const staleTimer = setTimeout(() => setResult(detector.pause()), detector.config.maxFrameGapMs);
    
    return () => clearTimeout(staleTimer);
  }, [detector, landmarks, worldLandmarks, timestampMs, enabled]);

  const reset = useCallback(() => setResult(detector.reset()), [detector]);
  
  return { ...result, reset };
}
