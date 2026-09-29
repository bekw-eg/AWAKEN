import { useEffect, useRef } from 'react';
import type { Enemy, PlayerState, GameState } from '../../game/types';
import { addPlayerXp } from '../../game/progression';
import { useAnimatedValue } from '../../motion/Motion';
import { AnimatedNumber } from '../UI/AnimatedNumber';
import { LevelUpEvent } from '../UI/LevelUpEvent';
import { Icon } from '../UI/Icon';
import { ProgressBar } from '../UI/ProgressBar';

export type BattleOutcome = { victory: boolean; enemy: Enemy; previousLevel: number; before: GameState };
export function BattleResult({ outcome, player, onContinue, onRetry }: {
  outcome: BattleOutcome; player: PlayerState; onContinue: () => void; onRetry: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const reward = outcome.victory ? outcome.enemy.isBoss ? 200 : 50 : 0;
  const earned = useAnimatedValue(reward, 850, 0, 320);
  const progress = outcome.victory ? addPlayerXp(outcome.before.player, Math.round(earned)) : player;
  useEffect(() => { title.current?.focus(); }, []);
  return <section className={`battle-result${outcome.victory ? ' victory' : ' defeat'}`} aria-labelledby="result-title">
    <div className="result-emblem"><Icon name={outcome.victory ? 'Award' : 'Shield'} /></div>
    <p className="eyebrow">{outcome.victory ? 'ENCOUNTER COMPLETE' : 'THE JOURNEY CONTINUES'}</p>
    <h1 id="result-title" ref={title} tabIndex={-1}>{outcome.victory ? outcome.enemy.isBoss ? 'Boss defeated.' : 'Victory.' : 'Defeated.'}</h1>
    <p className="result-description">{outcome.victory ? `${outcome.enemy.name} is down. You earned every step.` : `${outcome.enemy.name} won this round. Recover and try again.`}</p>
    {outcome.victory ? <div className="result-reward"><Icon name="TrendingUp" /><strong>+<AnimatedNumber value={reward} from={0} duration={850} delay={320} /></strong><span>XP EARNED</span></div>
      : <div className="result-recovery"><Icon name="Heart" />Health restored to {player.hp} HP</div>}
    <div className="result-level"><div className="stat-progress-label"><span>{progress.level > outcome.previousLevel ? 'LEVEL UP' : 'LEVEL PROGRESS'} / {String(progress.level).padStart(2, '0')}</span><span>{progress.xp} / {progress.xpToNextLevel} XP</span></div><ProgressBar key={progress.level} value={progress.xp} max={progress.xpToNextLevel} from={progress.level > outcome.previousLevel ? 0 : undefined} label="Level progress after battle" /></div>
    {player.level > outcome.previousLevel && <LevelUpEvent from={outcome.previousLevel} to={player.level} delay={650} />}
    <div className="result-actions">{!outcome.victory && <button className="button button-primary" onClick={onRetry}><Icon name="RotateCcw" />Try again</button>}<button className={`button ${outcome.victory ? 'button-primary' : 'button-quiet'}`} onClick={onContinue}>{outcome.victory ? 'Continue journey' : 'Return to journey'}<Icon name="ArrowRight" /></button></div>
  </section>;
}
