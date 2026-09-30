import { generateEnemy } from '../../game/progression';
import { Icon } from '../UI/Icon';
import { useEffect } from 'react';

export function JourneyMap({ currentEnemyIndex, onStartBattle, completedEvent, onAnimated }: { currentEnemyIndex: number; onStartBattle: () => void; completedEvent?: number | null; onAnimated?: () => void }) {
  useEffect(() => {
    if (!completedEvent) return;
    const timer = setTimeout(() => onAnimated?.(), 1100);
    return () => clearTimeout(timer);
  }, [completedEvent, onAnimated]);
  // Enemy 10 is the boss in the existing progression model. Do not add a phantom encounter.
  return <ol className="journey-map" aria-label="Campaign encounters">
    {Array.from({ length: 10 }, (_, offset) => {
      const index = offset + 1;
      const enemy = generateEnemy(index);
      const status = index < currentEnemyIndex || index === completedEvent ? 'completed' : index === currentEnemyIndex ? 'current' : 'locked';
      return <li key={index} className={`journey-node ${status}${enemy.isBoss ? ' boss-node' : ''}${index === completedEvent ? ' just-completed' : ''}${completedEvent && index === currentEnemyIndex ? ' just-unlocked' : ''}`} aria-current={status === 'current' ? 'step' : undefined}>
        <div className="path-marker" aria-hidden="true"><Icon name={status === 'completed' ? 'Check' : enemy.isBoss ? 'Shield' : status === 'current' ? 'Crosshair' : 'Lock'} /></div>
        <div className="node-content">
          <div className="node-heading"><span className="node-number">{String(index).padStart(2, '0')}</span><div><p className="node-kicker">{enemy.isBoss ? 'FINAL ENCOUNTER' : status === 'current' ? 'YOU ARE HERE' : 'ENCOUNTER'}</p><h3>{enemy.name}</h3></div></div>
          <div className="node-meta"><span>{enemy.isBoss ? `${enemy.maxHp} HP · +200 XP` : status === 'completed' ? 'Cleared' : status === 'current' ? `${enemy.maxHp} HP · +50 XP` : 'Locked'}</span>
            {status === 'current' ? <button className="node-enter" onClick={onStartBattle} aria-label={`Battle ${enemy.name}`}><Icon name="ArrowRight" /></button> : enemy.isBoss && status === 'locked' ? <Icon name="Lock" /> : null}
          </div>
        </div>
      </li>;
    })}
  </ol>;
}
