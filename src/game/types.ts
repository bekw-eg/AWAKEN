export type ExerciseType = 'squat' | 'jumping-jack' | 'knee-raise';

/** One completed attempt. Producers must emit each attempt exactly once. */
export type ExerciseEvent = {
  exercise: ExerciseType;
  status: 'correct' | 'incorrect';
  errorCode?: string;
  timestamp: number;
};

export type PlayerState = {
  level: number;
  xp: number;
  xpToNextLevel: number;
  strength: number;
  endurance: number;
  agility: number;
  gold: number;
};

export type QuestObjective = {
  exercise: ExerciseType;
  current: number;
  target: number;
  completed: boolean;
};

export type GameState = {
  player: PlayerState;
  dailyQuest: { objectives: QuestObjective[]; rewardClaimed: boolean };
};
