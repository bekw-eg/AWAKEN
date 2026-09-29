import { useEffect, useRef } from 'react';
import type { ExerciseEvent } from '../game/types';

/** Keep the detector's rep identity across renders and StrictMode effect replays. */
export function useSquatGameEvents(
  repCount: number,
  repJustCounted: boolean,
  onExerciseEvent: (event: ExerciseEvent) => void,
) {
  const lastEmittedRep = useRef(0);
  useEffect(() => {
    // The detector can be reset independently of game progress.
    if (repCount < lastEmittedRep.current) lastEmittedRep.current = repCount;
    if (!repJustCounted || repCount <= lastEmittedRep.current) return;
    lastEmittedRep.current = repCount;
    onExerciseEvent({ exercise: 'squat', status: 'correct', timestamp: Date.now() });
  }, [repCount, repJustCounted, onExerciseEvent]);
}
