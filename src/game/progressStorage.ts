import { createGameState, EXERCISES } from './progression';
import type { ExerciseProgress, GameState, PlayerState, QuestObjective } from './types';

export const PROGRESS_STORAGE_KEY = 'awaken.progress';
const SAVE_VERSION = 1;
type Progress = Pick<GameState, 'player' | 'exercises' | 'currentEnemyIndex' | 'dailyQuest'>;
const playerFields = ['level', 'xp', 'xpToNextLevel', 'strength', 'endurance', 'agility', 'power',
  'vitality', 'defense', 'stamina', 'hp', 'maxHp', 'gold'] as const satisfies readonly (keyof PlayerState)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function isExerciseProgress(value: unknown): value is ExerciseProgress {
  return isRecord(value) && isCount(value.level) && value.level >= 1 && isCount(value.xp) &&
    isCount(value.xpToNextLevel) && value.xpToNextLevel > value.xp;
}
function isPlayer(value: unknown): value is PlayerState {
  if (!isRecord(value) || !playerFields.every(key => isCount(value[key]))) return false;
  return isCount(value.hp) && isCount(value.maxHp) && value.maxHp > 0 && value.hp <= value.maxHp && isExerciseProgress(value);
}
function isObjective(value: unknown): value is QuestObjective {
  return isRecord(value) && EXERCISES.some(({ exercise }) => exercise === value.exercise) &&
    isCount(value.current) && isCount(value.target) && value.target > 0 && value.current <= value.target &&
    value.completed === (value.current === value.target);
}
function isProgress(value: unknown): value is Progress {
  if (!isRecord(value) || !isPlayer(value.player) || !isRecord(value.exercises) || !isRecord(value.dailyQuest)) return false;
  const { exercises, dailyQuest } = value;
  return EXERCISES.every(({ exercise }) => isExerciseProgress(exercises[exercise])) &&
    isCount(value.currentEnemyIndex) && value.currentEnemyIndex >= 1 && value.currentEnemyIndex <= 10 &&
    Array.isArray(dailyQuest.objectives) && dailyQuest.objectives.length === EXERCISES.length &&
    dailyQuest.objectives.every(isObjective) &&
    new Set(dailyQuest.objectives.map(objective => objective.exercise)).size === EXERCISES.length &&
    typeof dailyQuest.rewardClaimed === 'boolean' &&
    dailyQuest.rewardClaimed === dailyQuest.objectives.every(objective => objective.completed);
}

/** Only durable progress is stored. Camera frames, navigation and combat timers never are. */
export function saveProgress(progress: Progress): boolean {
  try {
    const { player, exercises, currentEnemyIndex, dailyQuest } = progress;
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({
      version: SAVE_VERSION, progress: { player, exercises, currentEnemyIndex, dailyQuest },
    }));
    return true;
  } catch {
    // Storage can be blocked or full. Gameplay must still work in memory.
    return false;
  }
}

export function loadProgress(): GameState {
  const initial = createGameState();
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return initial;
    const saved: unknown = JSON.parse(raw);
    if (!isRecord(saved) || saved.version !== SAVE_VERSION || !isProgress(saved.progress)) return initial;
    const { player, exercises, currentEnemyIndex, dailyQuest } = saved.progress;
    return { ...initial, player, exercises, currentEnemyIndex, dailyQuest };
  } catch {
    return initial;
  }
}
