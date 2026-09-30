import type { ExerciseEvent, ExerciseType, GameState, PlayerState, Enemy, ExerciseProgress } from './types';
import { BOSS_RECOVERY } from './handsFreeConfig';

export const REP_XP = 15;
export const LEVEL_XP_BASE = 100;
export const EXERCISE_LEVEL_XP_BASE = 50;
export const QUEST_XP = 150;
export const QUEST_GOLD = 100;

export const EXERCISES = [
  { exercise: 'squat', label: 'Squats', stat: 'power', shortStat: 'POW', type: 'Basic Attack' },
  { exercise: 'jumping-jack', label: 'Jumping Jacks', stat: 'agility', shortStat: 'AGI', type: 'Fast Attack' },
  { exercise: 'push-up', label: 'Push Ups', stat: 'strength', shortStat: 'STR', type: 'Strong Attack' },
] as const satisfies readonly { exercise: ExerciseType; label: string; stat: keyof PlayerState; shortStat: string; type: string }[];

export function generateEnemy(index: number): Enemy {
  const isBoss = index === 10;
  const multiplier = 1 + (index * 0.2);
  return {
    id: `enemy-${index}`,
    name: isBoss ? `BOSS ${Math.floor(index/10)}` : `Enemy ${index}`,
    hp: Math.floor((isBoss ? 200 : 50) * multiplier),
    maxHp: Math.floor((isBoss ? 200 : 50) * multiplier),
    attack: Math.floor((isBoss ? 15 : 5) * multiplier),
    defense: Math.floor((isBoss ? 10 : 2) * multiplier),
    isBoss
  };
}

export function createGameState(): GameState {
  return {
    screen: 'main',
    roundPhase: 'active',
    recoveryUses: 0,
    player: { 
      level: 1, xp: 0, xpToNextLevel: LEVEL_XP_BASE, 
      strength: 10, endurance: 10, agility: 10, power: 10, vitality: 10, defense: 5, stamina: 10,
      hp: 100, maxHp: 100, gold: 0 
    },
    exercises: {
      'squat': { level: 1, xp: 0, xpToNextLevel: EXERCISE_LEVEL_XP_BASE },
      'jumping-jack': { level: 1, xp: 0, xpToNextLevel: EXERCISE_LEVEL_XP_BASE },
      'push-up': { level: 1, xp: 0, xpToNextLevel: EXERCISE_LEVEL_XP_BASE }
    },
    currentEnemyIndex: 1,
    currentEnemy: null,
    dailyQuest: {
      objectives: EXERCISES.map(({ exercise }) => ({ exercise, current: 0, target: 10, completed: false })),
      rewardClaimed: false,
    },
  };
}

export function addPlayerXp(player: PlayerState, amount: number): PlayerState {
  let { level, xp, xpToNextLevel, hp, maxHp, strength, agility, power, vitality, defense, stamina } = player;
  xp += amount;
  while (xp >= xpToNextLevel) {
    xp -= xpToNextLevel;
    level++;
    xpToNextLevel = Math.floor(xpToNextLevel * 1.2);
    // Auto distribute stats for now
    strength += 1; agility += 1; power += 1; vitality += 1; defense += 1; stamina += 1;
    maxHp += 10;
    hp = maxHp; // Heal on level up
  }
  return { ...player, level, xp, xpToNextLevel, hp, maxHp, strength, agility, power, vitality, defense, stamina };
}

export function addExerciseXp(progress: ExerciseProgress, amount: number): ExerciseProgress {
  let { level, xp, xpToNextLevel } = progress;
  xp += amount;
  while (xp >= xpToNextLevel) {
    xp -= xpToNextLevel;
    level++;
    xpToNextLevel = Math.floor(xpToNextLevel * 1.5);
  }
  return { level, xp, xpToNextLevel };
}

export function applyExerciseEvent(state: GameState, event: ExerciseEvent): GameState {
  if (state.screen === 'battle' && (state.roundPhase !== 'active' || !state.currentEnemy || state.currentEnemy.hp <= 0)) return state;
  if (event.status !== 'correct') return state;
  const definition = EXERCISES.find(({ exercise }) => exercise === event.exercise);
  if (!definition) return state;

  let newState = { ...state };

  // Add exercise XP
  newState.exercises = {
    ...newState.exercises,
    [event.exercise]: addExerciseXp(newState.exercises[event.exercise], REP_XP)
  };

  // If in battle, deal damage
  if (newState.screen === 'battle' && newState.currentEnemy) {
    const exerciseLevel = newState.exercises[event.exercise].level;
    const statValue = newState.player[definition.stat] as number;
    // Damage Formula
    const baseDamage = event.exercise === 'push-up' ? 20 : event.exercise === 'squat' ? 10 : 5;
    const damage = Math.floor(baseDamage * (1 + statValue * 0.1) * (1 + exerciseLevel * 0.1));
    
    // Apply damage to enemy
    const enemyHp = Math.max(0, newState.currentEnemy.hp - damage);
    newState.currentEnemy = { ...newState.currentEnemy, hp: enemyHp };

    // If enemy dies
    if (enemyHp <= 0) {
      newState.player = addPlayerXp(newState.player, newState.currentEnemy.isBoss ? 200 : 50);
      if (newState.currentEnemy.isBoss) {
        newState.currentEnemyIndex = 1; // reset to 1 for next stage, or we could just go to 11
      } else {
        newState.roundPhase = 'enemy_defeated';
        return newState;
      }
      newState.currentEnemy = null;
      newState.screen = 'main';
      return newState;
    }
  } else if (newState.screen === 'workout') {
    newState.player = addPlayerXp(newState.player, REP_XP);
    
    // Handle daily quest
    const objectives = newState.dailyQuest.objectives.map((objective) => {
      if (objective.exercise !== event.exercise || objective.completed) return objective;
      const current = Math.min(objective.current + 1, objective.target);
      const completed = current === objective.target;
      if (completed) {
        newState.player = { ...newState.player, [definition.stat]: (newState.player[definition.stat] as number) + 1 };
      }
      return { ...objective, current, completed };
    });
    
    const earnsReward = !newState.dailyQuest.rewardClaimed && objectives.every(({ completed }) => completed);
    if (earnsReward) {
      newState.player = { ...addPlayerXp(newState.player, QUEST_XP), gold: newState.player.gold + QUEST_GOLD };
    }
    
    newState.dailyQuest = { objectives, rewardClaimed: newState.dailyQuest.rewardClaimed || earnsReward };
  }

  return newState;
}

export type GameAction = 
  | { type: 'exercise'; event: ExerciseEvent } 
  | { type: 'reset' }
  | { type: 'set_screen'; screen: GameState['screen'] }
  | { type: 'start_battle' }
  | { type: 'round_death_complete'; enemyId: string }
  | { type: 'next_round'; enemyId: string }
  | { type: 'recover'; useNumber: number }
  | { type: 'enemy_attack' };

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'reset':
      return createGameState();
    case 'exercise':
      return applyExerciseEvent(state, action.event);
    case 'set_screen':
      return { ...state, screen: action.screen,
        currentEnemyIndex: state.currentEnemyIndex + (state.roundPhase !== 'active' ? 1 : 0), roundPhase: 'active' };
    case 'start_battle':
      return { ...state, screen: 'battle', roundPhase: 'active', recoveryUses: 0, currentEnemy: generateEnemy(state.currentEnemyIndex) };
    case 'round_death_complete':
      if (state.screen !== 'battle' || state.roundPhase !== 'enemy_defeated' || state.currentEnemy?.id !== action.enemyId) return state;
      return { ...state, roundPhase: 'round_transition' };
    case 'next_round': {
      if (state.screen !== 'battle' || state.roundPhase !== 'round_transition' || state.currentEnemy?.id !== action.enemyId) return state;
      const currentEnemyIndex = state.currentEnemyIndex + 1;
      return { ...state, currentEnemyIndex, currentEnemy: generateEnemy(currentEnemyIndex), roundPhase: 'active', recoveryUses: 0 };
    }
    case 'recover':
      if (state.screen !== 'battle' || !state.currentEnemy?.isBoss || state.currentEnemy.hp <= 0 || state.player.hp <= 0 ||
        action.useNumber !== state.recoveryUses + 1 || action.useNumber > BOSS_RECOVERY.maxUsesPerFight) return state;
      return { ...state, recoveryUses: action.useNumber, player: { ...state.player,
        hp: Math.min(state.player.maxHp, state.player.hp + Math.round(state.player.maxHp * BOSS_RECOVERY.healPercent)) } };
    case 'enemy_attack': {
      if (state.screen !== 'battle' || !state.currentEnemy || state.currentEnemy.hp <= 0 || state.roundPhase !== 'active') return state;
      const damage = Math.max(1, state.currentEnemy.attack - Math.floor(state.player.defense / 2));
      const playerHp = Math.max(0, state.player.hp - damage);
      let nextState = { ...state, player: { ...state.player, hp: playerHp } };
      if (playerHp <= 0) {
        // Player died
        nextState.screen = 'main';
        nextState.currentEnemy = null;
        nextState.player.hp = nextState.player.maxHp; // restore HP for now
      }
      return nextState;
    }
    default:
      return state;
  }
}
