import { useCallback, useReducer } from 'react';
import { createGameState, gameReducer } from '../game/progression';
import type { ExerciseEvent } from '../game/types';

export function useGameState() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createGameState);
  const handleExerciseEvent = useCallback((event: ExerciseEvent) => dispatch({ type: 'exercise', event }), []);
  const resetGame = useCallback(() => dispatch({ type: 'reset' }), []);
  return { ...state, handleExerciseEvent, resetGame };
}
