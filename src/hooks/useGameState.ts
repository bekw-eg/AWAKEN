import { useCallback, useReducer } from 'react';
import { createGameState, gameReducer } from '../game/progression';
import type { ExerciseEvent, GameState } from '../game/types';

export function useGameState() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createGameState);
  
  const handleExerciseEvent = useCallback((event: ExerciseEvent) => dispatch({ type: 'exercise', event }), []);
  const resetGame = useCallback(() => dispatch({ type: 'reset' }), []);
  const setScreen = useCallback((screen: GameState['screen']) => dispatch({ type: 'set_screen', screen }), []);
  const startBattle = useCallback(() => dispatch({ type: 'start_battle' }), []);
  const enemyAttack = useCallback(() => dispatch({ type: 'enemy_attack' }), []);

  return { ...state, handleExerciseEvent, resetGame, setScreen, startBattle, enemyAttack };
}
