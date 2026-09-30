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
  const recover = useCallback((useNumber: number) => dispatch({ type: 'recover', useNumber }), []);
  const completeRoundDeath = useCallback((enemyId: string) => dispatch({ type: 'round_death_complete', enemyId }), []);
  const startNextRound = useCallback((enemyId: string) => dispatch({ type: 'next_round', enemyId }), []);

  return { ...state, handleExerciseEvent, resetGame, setScreen, startBattle, enemyAttack, recover, completeRoundDeath, startNextRound };
}
