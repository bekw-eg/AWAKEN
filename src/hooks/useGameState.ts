import { useCallback, useEffect, useReducer, useState } from 'react';
import { gameReducer } from '../game/progression';
import { loadProgress, saveProgress } from '../game/progressStorage';
import type { ExerciseEvent, GameState } from '../game/types';
import type { BattleAttack } from '../game/exerciseDamage';

export function useGameState() {
  const [state, dispatch] = useReducer(gameReducer, undefined, loadProgress);
  const [storageError, setStorageError] = useState(false);
  const { player, exercises, currentEnemyIndex, dailyQuest, recoveryCharges, recoveryTraining, roundPhase } = state;
  // A defeated enemy has already paid its reward. Reloading during the menu
  // resumes at the next encounter rather than granting the same reward again.
  const savedEnemyIndex = currentEnemyIndex + (roundPhase !== 'active' ? 1 : 0);
  useEffect(() => {
    setStorageError(!saveProgress({ player, exercises, currentEnemyIndex: savedEnemyIndex, dailyQuest, recoveryCharges, recoveryTraining }));
  }, [player, exercises, savedEnemyIndex, dailyQuest, recoveryCharges, recoveryTraining]);
  
  const handleExerciseEvent = useCallback((event: ExerciseEvent) => dispatch({ type: 'exercise', event }), []);
  const handleBattleAttack = useCallback((attack: BattleAttack) => dispatch({ type: 'battle_attack', attack }), []);
  const resetGame = useCallback(() => dispatch({ type: 'reset' }), []);
  const setScreen = useCallback((screen: GameState['screen']) => dispatch({ type: 'set_screen', screen }), []);
  const startBattle = useCallback(() => dispatch({ type: 'start_battle' }), []);
  const enemyAttack = useCallback(() => dispatch({ type: 'enemy_attack' }), []);
  const recover = useCallback((useNumber: number) => dispatch({ type: 'recover', useNumber }), []);
  const completeRoundDeath = useCallback((enemyId: string) => dispatch({ type: 'round_death_complete', enemyId }), []);
  const startNextRound = useCallback((enemyId: string) => dispatch({ type: 'next_round', enemyId }), []);

  return { ...state, storageError, handleExerciseEvent, handleBattleAttack, resetGame, setScreen, startBattle, enemyAttack, recover, completeRoundDeath, startNextRound };
}
