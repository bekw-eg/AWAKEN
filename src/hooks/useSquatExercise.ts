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
