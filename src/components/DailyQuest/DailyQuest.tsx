import { AnimatedNumber } from '../UI/AnimatedNumber';
import { EXERCISES, QUEST_GOLD, QUEST_XP } from '../../game/progression';
import type { GameState } from '../../game/types';
import { Icon } from '../UI/Icon';
import { ProgressBar } from '../UI/ProgressBar';
import './DailyQuest.css';

export function DailyQuest({ quest }: { quest: GameState['dailyQuest'] }) {
  return <section className="game-card daily-quest" aria-labelledby="quest-title">
    <div className="section-title"><h2 id="quest-title">Training objectives</h2><Icon name="Flag" /></div>
    {quest.objectives.map((objective) => {
      const definition = EXERCISES.find(({ exercise }) => exercise === objective.exercise)!;
      return <div className="quest-objective" key={objective.exercise}>
        <div className="quest-label"><span>{objective.completed && <Icon name="Check" />}{definition.label}</span><span><AnimatedNumber value={objective.current} /><small> / {objective.target}</small></span></div>
        <ProgressBar value={objective.current} max={objective.target} label={`${definition.label} objective`} tone={objective.completed ? 'accent' : 'muted'} />
        <p className="game-hint">+1 {definition.shortStat}{objective.completed ? ' earned' : ' on completion'}</p>
      </div>;
    })}
    <div className={`quest-reward${quest.rewardClaimed ? ' complete' : ''}`} role="status"><Icon name={quest.rewardClaimed ? 'CheckCircle' : 'Award'} /><div><strong>{quest.rewardClaimed ? 'ALL OBJECTIVES COMPLETE' : 'COMPLETION REWARD'}</strong><span>+{QUEST_XP} XP <span className="text-muted">/</span> +{QUEST_GOLD} gold</span></div></div>
  </section>;
}
