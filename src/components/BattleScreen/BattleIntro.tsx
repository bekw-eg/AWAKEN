import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Enemy } from '../../game/types';
import { useReducedMotion } from '../../motion/Motion';

export function BattleIntro({ enemy, repeated }: { enemy: Enemy; repeated: boolean }) {
  const [visible, setVisible] = useState(true);
  const reduced = useReducedMotion();
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), reduced ? 0 : repeated ? 650 : 1600);
    return () => clearTimeout(timer);
  }, [reduced, repeated]);
  if (!visible || reduced) return null;
  return createPortal(<div className={'battle-intro' + (repeated ? ' repeat-intro' : '')} aria-hidden="true">
    <p className="eyebrow">{enemy.isBoss ? 'WARNING / BOSS ENCOUNTER' : 'ENCOUNTER START'}</p>
    <h2>{enemy.isBoss ? 'BOSS FIGHT' : 'BATTLE ARENA'}</h2>
    <div className="intro-fighters"><span>PLAYER</span><small>VS</small><strong>{enemy.name}</strong></div>
    <strong className="intro-fight">FIGHT</strong>
  </div>, document.body);
}
