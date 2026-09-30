import { AnimatedNumber } from '../UI/AnimatedNumber';
import type { GameState } from '../../game/types';
import { generateEnemy } from '../../game/progression';
import { DailyQuest } from '../DailyQuest/DailyQuest';
import { PlayerStats } from '../PlayerStats/PlayerStats';
import { Icon } from '../UI/Icon';
import { PageHeader } from '../UI/PageHeader';
import { ProgressBar } from '../UI/ProgressBar';
import { JourneyMap } from './JourneyMap';
import './MainScreen.css';

type Props = {
  state: GameState;
  onStartWorkout: () => void;
  onStartBattle: () => void;
  journeyOnly?: boolean;
  journeyChange?: number | null;
  onJourneyAnimated?: () => void;
};

export function MainScreen({ state, onStartWorkout, onStartBattle, journeyOnly = false, journeyChange, onJourneyAnimated }: Props) {
  const nextEnemy = generateEnemy(state.currentEnemyIndex);
  const completed = state.currentEnemyIndex - 1;
  return <div className="main-screen">
    <PageHeader eyebrow="THE PATH TO STRONGER" title={journeyOnly ? 'Your journey' : 'Welcome back, Player.'}
      description="Every rep moves you forward. Your next challenge is waiting.">
      <button className="button button-quiet" onClick={onStartWorkout}><Icon name="Activity" />Free training<Icon name="ArrowUpRight" /></button>
    </PageHeader>
    <div className="journey-layout">
      <div className="journey-main">
        <section className="next-encounter" aria-labelledby="next-title">
          <div className="encounter-illustration" aria-hidden="true"><div className="target-ring"><Icon name={nextEnemy.isBoss ? 'Shield' : 'Crosshair'} /></div><span>ENCOUNTER {String(state.currentEnemyIndex).padStart(2, '0')}</span></div>
          <div className="encounter-copy"><span className="badge badge-accent"><Icon name="Flag" />NEXT CHALLENGE</span><h2 id="next-title">{nextEnemy.isBoss ? 'The final encounter.' : 'Step into the arena.'}</h2><p>{nextEnemy.name}<span />{nextEnemy.maxHp} HP<span />+{nextEnemy.isBoss ? 200 : 50} XP</p>
            <button className="button button-primary" onClick={onStartBattle}>Enter battle<Icon name="ArrowRight" /></button>
          </div>
        </section>
        <section className="journey-panel" aria-labelledby="journey-title">
          <div className="section-title"><div><p className="eyebrow">CAMPAIGN / TRAINING GROUNDS</p><h2 id="journey-title">The ascent</h2></div><span className="journey-completion"><strong><AnimatedNumber value={completed} pad={2} /></strong> / 10 cleared</span></div>
          <ProgressBar value={completed} max={10} label="Journey completed encounters" />
          <div className="map-legend"><span><i className="legend-current" />Current</span><span><Icon name="Check" />Cleared</span><span><Icon name="Lock" />Locked</span></div>
          <JourneyMap currentEnemyIndex={state.currentEnemyIndex} onStartBattle={onStartBattle} completedEvent={journeyChange} onAnimated={onJourneyAnimated} />
        </section>
      </div>
      <aside className="journey-aside" aria-label="Player progression">
        <PlayerStats player={state.player} />
        <DailyQuest quest={state.dailyQuest} />
        <section className="training-callout"><Icon name="Activity" /><p className="eyebrow">BUILD YOUR FOUNDATION</p><h3>Train before the fight.</h3><p>Correct reps earn XP and strengthen your next attack.</p><button className="text-button" onClick={onStartWorkout}>Go to training<Icon name="ArrowRight" /></button></section>
      </aside>
    </div>
  </div>;
}
