import { EXERCISES, QUEST_GOLD, QUEST_XP } from '../../game/progression';
import type { GameState } from '../../game/types';
import './DailyQuest.css';

export function DailyQuest({ quest }: { quest: GameState['dailyQuest'] }) {
  return (
    <section className="game-card daily-quest" aria-labelledby="quest-title">
      <h2 id="quest-title">DAILY TRAINING</h2>
      {quest.objectives.map((objective) => {
        const definition = EXERCISES.find(({ exercise }) => exercise === objective.exercise)!;
        const id = `quest-${objective.exercise}`;
        return (
          <div className="quest-objective" key={objective.exercise}>
            <label htmlFor={id}>{definition.label}<span>{objective.current} / {objective.target}</span></label>
            <progress id={id} value={objective.current} max={objective.target} />
            <p className="game-hint">+1 {definition.shortStat}{objective.completed ? ' · EARNED' : ''}</p>
          </div>
        );
      })}
      <div className={quest.rewardClaimed ? 'quest-reward complete' : 'quest-reward'} role="status">
        <strong>{quest.rewardClaimed ? 'DAILY QUEST COMPLETE' : 'COMPLETE ALL OBJECTIVES'}</strong>
        <span>+{QUEST_XP} XP · +{QUEST_GOLD} GOLD{quest.rewardClaimed ? ' · EARNED' : ''}</span>
      </div>
    </section>
  );
}
