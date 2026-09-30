import { useCallback, useEffect, useRef, useState } from 'react';
import { PushUpDetector } from '../exercise-engine/pushUpDetector';
import type { PushUpConfig, PushUpDetectionResult } from '../exercise-engine/pushUpTypes';
import type { PosePoint } from '../exercise-engine/types';

/** One detector, driven by the existing pose loop. Config is captured on mount. */
export function usePushUpExercise(
  landmarks: readonly PosePoint[] | null,
  worldLandmarks: readonly PosePoint[] | null,
  timestampMs: number | null,
  enabled = true,
  config?: Partial<PushUpConfig>,
  imageAspectRatio = 1,
): PushUpDetectionResult & { reset: () => void } {
  const ref = useRef<PushUpDetector | null>(null);
  if (!ref.current) ref.current = new PushUpDetector(config);
  const detector = ref.current;
  const lastFrame = useRef<{ timestamp: number; receivedAt: number } | null>(null);
  const [result, setResult] = useState(() => detector.getResult());
  useEffect(() => {
    if (!enabled || timestampMs === null) {
      lastFrame.current = null;
      setResult(detector.pause());
      return;
    }
    if (!lastFrame.current || timestampMs > lastFrame.current.timestamp) {
      lastFrame.current = { timestamp: timestampMs, receivedAt: performance.now() };
    }
    setResult(detector.update({ landmarks, worldLandmarks, timestampMs, imageAspectRatio }));
    // Duplicate pose objects must not keep a frozen camera alive indefinitely.
    const remaining = Math.max(0, detector.config.maxFrameGapMs - (performance.now() - lastFrame.current.receivedAt));
    const timer = setTimeout(() => setResult(detector.pause()), remaining);
    return () => clearTimeout(timer);
  }, [detector, landmarks, worldLandmarks, timestampMs, enabled, imageAspectRatio]);
  const reset = useCallback(() => setResult(detector.reset()), [detector]);
  return { ...result, reset };
}
