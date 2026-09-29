import type { ExerciseEvent, ExerciseType, GameState, PlayerState } from './types';

export const REP_XP = 10;
export const LEVEL_XP = 100;
export const QUEST_XP = 150;
export const QUEST_GOLD = 100;
export const EXERCISES = [
  { exercise: 'squat', label: 'Squats', stat: 'strength', shortStat: 'STR' },
  { exercise: 'jumping-jack', label: 'Jumping Jacks', stat: 'endurance', shortStat: 'END' },
  { exercise: 'knee-raise', label: 'Knee Raises', stat: 'agility', shortStat: 'AGI' },
] as const satisfies readonly { exercise: ExerciseType; label: string; stat: keyof PlayerState; shortStat: string }[];

export function createGameState(): GameState {
  return {
    player: { level: 1, xp: 0, xpToNextLevel: LEVEL_XP, strength: 1, endurance: 1, agility: 1, gold: 0 },
    dailyQuest: {
      objectives: EXERCISES.map(({ exercise }) => ({ exercise, current: 0, target: 10, completed: false })),
      rewardClaimed: false,
    },
  };
}

export function addXp(player: PlayerState, amount: number): PlayerState {
  const total = player.xp + amount;
  return { ...player, level: player.level + Math.floor(total / LEVEL_XP), xp: total % LEVEL_XP };
}

/** Pure game transition; no camera, clock, storage or React dependencies. */
export function applyExerciseEvent(state: GameState, event: ExerciseEvent): GameState {
  if (event.status !== 'correct') return state;
  const definition = EXERCISES.find(({ exercise }) => exercise === event.exercise);
  if (!definition) return state;

  let player = addXp(state.player, REP_XP);
  const objectives = state.dailyQuest.objectives.map((objective) => {
    if (objective.exercise !== event.exercise || objective.completed) return objective;
    const current = Math.min(objective.current + 1, objective.target);
    const completed = current === objective.target;
    if (completed) player = { ...player, [definition.stat]: player[definition.stat] + 1 };
    return { ...objective, current, completed };
  });
  const earnsReward = !state.dailyQuest.rewardClaimed && objectives.every(({ completed }) => completed);
  if (earnsReward) player = { ...addXp(player, QUEST_XP), gold: player.gold + QUEST_GOLD };
  return { player, dailyQuest: { objectives, rewardClaimed: state.dailyQuest.rewardClaimed || earnsReward } };
}

export type GameAction = { type: 'exercise'; event: ExerciseEvent } | { type: 'reset' };

export function gameReducer(state: GameState, action: GameAction): GameState {
  return action.type === 'reset' ? createGameState() : applyExerciseEvent(state, action.event);
}
