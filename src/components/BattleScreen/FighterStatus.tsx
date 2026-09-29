import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExerciseType } from '../../game/types';
import { emitMotionEvent, useReducedMotion, useValueChange } from '../../motion/Motion';
import { Icon } from '../UI/Icon';
import { ProgressBar } from '../UI/ProgressBar';
import { AnimatedNumber } from '../UI/AnimatedNumber';

function FloatingDamage({ id, amount, strong, onDone }: { id: number; amount: number; strong: boolean; onDone: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDone(id), 900);
    return () => clearTimeout(timer);
  }, [id, onDone]);
  return <span className={'damage-number' + (strong ? ' damage-strong' : '')} aria-hidden="true">−<AnimatedNumber value={amount} from={0} duration={160} /> HP</span>;
}

export function FighterStatus({ name, hp, maxHp, level, enemy = false, boss = false, attack = 'squat' }: {
  name: string; hp: number; maxHp: number; level?: number; enemy?: boolean; boss?: boolean; attack?: ExerciseType;
}) {
  const [hits, setHits] = useState<{ id: number; amount: number }[]>([]);
  const panel = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  useValueChange(hp, (before, after) => {
    if (after >= before) return;
    const event = emitMotionEvent({ type: 'damage', amount: before - after, target: enemy ? 'enemy' : 'player' });
    setHits(current => [...current, { id: event.id, amount: before - after }]);
    if (!reduced) {
      const shift = enemy && attack === 'push-up' ? 4 : 3;
      panel.current?.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-' + shift + 'px)', offset: .25 }, { transform: 'translateX(2px)', offset: .6 }, { transform: 'translateX(0)' }], { duration: enemy && attack === 'jumping-jack' ? 160 : 200, delay: enemy ? 80 : 0, easing: 'ease-out' });
    }
  });
  const removeHit = useCallback((id: number) => setHits(current => current.filter(hit => hit.id !== id)), []);
  return <section ref={panel} className={'fighter-status' + (enemy ? ' fighter-enemy' : '') + (boss ? ' fighter-boss' : '') + (hp / maxHp < .25 ? ' fighter-low' : '')} aria-label={name + ' health'}>
    <div className="fighter-meta"><span><Icon name={enemy ? 'Shield' : 'User'} />{enemy ? boss ? 'BOSS / FINAL ENCOUNTER' : 'OPPONENT' : 'PLAYER'}</span><span>{level ? <>LEVEL <AnimatedNumber value={level} pad={2} /></> : boss ? 'ELITE' : 'ENCOUNTER'}</span></div>
    <div className="fighter-name"><h2>{name}</h2><div><strong><AnimatedNumber value={hp} duration={300} /></strong><span> / {maxHp} HP</span></div></div>
    {hits.map(hit => <FloatingDamage key={hit.id} {...hit} strong={enemy && attack === 'push-up'} onDone={removeHit} />)}
    <ProgressBar value={hp} max={maxHp} label={name + ' HP'} tone={enemy ? 'danger' : 'accent'} trail />
  </section>;
}
