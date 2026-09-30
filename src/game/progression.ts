import type { ExerciseEvent, ExerciseType, GameState, PlayerState, Enemy, ExerciseProgress } from './types';
import { RECOVERY, recoveryHealPercent } from './handsFreeConfig';
import { calculateAttackDamage, type BattleAttack } from './exerciseDamage';

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
  const maxHp = isBoss ? 300 : Math.floor(50 * multiplier);
  return {
    id: `enemy-${index}`,
    name: isBoss ? `BOSS ${Math.floor(index/10)}` : `Enemy ${index}`,
    hp: maxHp,
    maxHp,
    attack: Math.floor((isBoss ? 15 * 0.7 : 5) * multiplier),
    defense: Math.floor((isBoss ? 10 : 2) * multiplier),
    isBoss
  };
}

export function createGameState(): GameState {
  return {
    screen: 'main',
    lastBattleAttackId: null,
    roundPhase: 'active',
    recoveryUses: 0,
    recoveryCharges: 0,
    recoveryTraining: { 'push-up': 0, squat: 0, 'jumping-jack': 0 },
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
  // Combat accepts complete sets only; individual training events cannot hit.
  if (state.screen === 'battle') return state;
  if (event.status !== 'correct') return state;
  const definition = EXERCISES.find(({ exercise }) => exercise === event.exercise);
  if (!definition) return state;

  let newState = { ...state };

  // Add exercise XP
  newState.exercises = {
    ...newState.exercises,
    [event.exercise]: addExerciseXp(newState.exercises[event.exercise], REP_XP)
  };

  if (newState.screen === 'workout') {
    newState.player = addPlayerXp(newState.player, REP_XP);
    // Each exercise earns charges independently. A full inventory cannot bank
    // extra completed sets; partial sets are retained until there is room.
    if (newState.recoveryCharges < RECOVERY.maxCharges) {
      const progress = newState.recoveryTraining[event.exercise] + 1;
      const earned = progress >= RECOVERY.trainingReps[event.exercise];
      newState.recoveryTraining = { ...newState.recoveryTraining, [event.exercise]: earned ? 0 : progress };
      if (earned) newState.recoveryCharges++;
    }
    
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

export function applyBattleAttack(state: GameState, attack: BattleAttack): GameState {
  const enemy = state.currentEnemy;
  if (state.screen !== 'battle' || state.roundPhase !== 'active' || !enemy || enemy.hp <= 0 || state.player.hp <= 0 ||
    enemy.id !== attack.enemyId || state.lastBattleAttackId === attack.id || !attack.id ||
    !Number.isSafeInteger(attack.correctReps) || attack.correctReps < 0) return state;
  const damage = calculateAttackDamage(attack);
  const hp = Math.max(0, enemy.hp - damage);
  const next = { ...state, lastBattleAttackId: attack.id, currentEnemy: { ...enemy, hp },
    exercises: { ...state.exercises, [attack.exercise]: addExerciseXp(state.exercises[attack.exercise], REP_XP * attack.correctReps) } };
  if (hp > 0) return next;
  const player = addPlayerXp(next.player, enemy.isBoss ? 200 : 50);
  return enemy.isBoss
    ? { ...next, player, currentEnemyIndex: 1, currentEnemy: null, screen: 'main' }
    : { ...next, player, roundPhase: 'enemy_defeated' };
}

export type GameAction = 
  | { type: 'exercise'; event: ExerciseEvent } 
  | { type: 'battle_attack'; attack: BattleAttack }
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
    case 'battle_attack':
      return applyBattleAttack(state, action.attack);
    case 'set_screen':
      return { ...state, screen: action.screen,
        currentEnemyIndex: state.currentEnemyIndex + (state.roundPhase !== 'active' ? 1 : 0), roundPhase: 'active' };
    case 'start_battle':
      return { ...state, screen: 'battle', roundPhase: 'active', recoveryUses: 0, lastBattleAttackId: null, currentEnemy: generateEnemy(state.currentEnemyIndex) };
    case 'round_death_complete':
      if (state.screen !== 'battle' || state.roundPhase !== 'enemy_defeated' || state.currentEnemy?.id !== action.enemyId) return state;
      return { ...state, roundPhase: 'round_transition' };
    case 'next_round': {
      if (state.screen !== 'battle' || state.roundPhase !== 'round_transition' || state.currentEnemy?.id !== action.enemyId) return state;
      const currentEnemyIndex = state.currentEnemyIndex + 1;
      return { ...state, currentEnemyIndex, currentEnemy: generateEnemy(currentEnemyIndex), roundPhase: 'active', recoveryUses: 0 };
    }
    case 'recover':
      if (state.screen !== 'battle' || state.roundPhase !== 'active' || !state.currentEnemy || state.currentEnemy.hp <= 0 ||
        state.player.hp <= 0 || state.player.hp >= state.player.maxHp || state.recoveryCharges <= 0 ||
        action.useNumber !== state.recoveryUses + 1 || action.useNumber > RECOVERY.maxUsesPerFight) return state;
      return { ...state, recoveryUses: action.useNumber, recoveryCharges: state.recoveryCharges - 1, player: { ...state.player,
        hp: Math.min(state.player.maxHp, state.player.hp + Math.round(state.player.maxHp * recoveryHealPercent(state.currentEnemyIndex) / 100)) } };
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
