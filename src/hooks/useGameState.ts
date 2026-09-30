import { useCallback, useEffect, useReducer, useState } from 'react';
import { gameReducer } from '../game/progression';
import { loadProgress, saveProgress } from '../game/progressStorage';
import type { ExerciseEvent, GameState } from '../game/types';

export function useGameState() {
  const [state, dispatch] = useReducer(gameReducer, undefined, loadProgress);
  const [storageError, setStorageError] = useState(false);
  const { player, exercises, currentEnemyIndex, dailyQuest } = state;
  useEffect(() => {
    setStorageError(!saveProgress({ player, exercises, currentEnemyIndex, dailyQuest }));
  }, [player, exercises, currentEnemyIndex, dailyQuest]);
  
  const handleExerciseEvent = useCallback((event: ExerciseEvent) => dispatch({ type: 'exercise', event }), []);
  const resetGame = useCallback(() => dispatch({ type: 'reset' }), []);
  const setScreen = useCallback((screen: GameState['screen']) => dispatch({ type: 'set_screen', screen }), []);
  const startBattle = useCallback(() => dispatch({ type: 'start_battle' }), []);
  const enemyAttack = useCallback(() => dispatch({ type: 'enemy_attack' }), []);

  return { ...state, storageError, handleExerciseEvent, resetGame, setScreen, startBattle, enemyAttack };
}
