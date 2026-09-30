export type ExerciseType = 'squat' | 'jumping-jack' | 'push-up';

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
  
  // Stats
  strength: number;
  endurance: number;
  agility: number;
  power: number;
  vitality: number;
  defense: number;
  stamina: number;
  
  hp: number;
  maxHp: number;
  
  gold: number;
};

export type ExerciseProgress = {
  level: number;
  xp: number;
  xpToNextLevel: number;
};

export type Enemy = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  isBoss: boolean;
};

export type GameState = {
  roundPhase: 'active' | 'enemy_defeated' | 'round_transition';
  recoveryUses: number;
  recoveryCharges: number;
  recoveryTraining: Record<ExerciseType, number>;
  screen: 'main' | 'workout' | 'battle';
  player: PlayerState;
  exercises: Record<ExerciseType, ExerciseProgress>;
  currentEnemyIndex: number; // 0 to 10. 10 is Boss.
  currentEnemy: Enemy | null;
  dailyQuest: { objectives: any[]; rewardClaimed: boolean };
};
