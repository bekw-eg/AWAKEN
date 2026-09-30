import { memo, type CSSProperties } from 'react';
import guardian from '../../assets/boss/corrupted-guardian.png';
import { useReducedMotion } from '../../motion/Motion';
import './BossCharacter.css';

export type BossAnimationState = 'idle' | 'hurt' | 'attack' | 'heavyAttack' | 'death';
// Impact fractions also drive the CSS keyframes: attack 60%, heavyAttack 70%.
export const BOSS_TIMING = { hurt: 360, attack: 650, heavyAttack: 1400, death: 1900 } as const;
export const BOSS_IMPACT = { attack: Math.round(BOSS_TIMING.attack * .6), heavyAttack: Math.round(BOSS_TIMING.heavyAttack * .7) } as const;

const particles = Array.from({ length: 18 }, (_, index) => ({
  '--particle-x': `${12 + (index * 37 % 78)}%`,
  '--particle-y': `${18 + (index * 23 % 68)}%`,
  '--particle-drift': `${(index % 2 ? 1 : -1) * (16 + index * 3)}px`,
  '--particle-delay': `${-index * .27}s`,
  '--particle-duration': `${1.6 + index % 4 * .3}s`,
} as CSSProperties));

type Props = { state: BossAnimationState; hp: number; maxHp: number; eventId?: number; paused?: boolean };

/** Presentation only: HP and attack events belong to the existing battle flow. */
export const BossCharacter = memo(function BossCharacter({ state, hp, maxHp, eventId = 0, paused = false }: Props) {
  const reduced = useReducedMotion();
  const animation = hp <= 0 ? 'death' : state;
  const rage = hp > 0 && maxHp > 0 && hp / maxHp <= .3;
  const duration = animation === 'idle' ? 2800 : BOSS_TIMING[animation];
  return <section className={`boss-arena${reduced ? ' boss-reduced-motion' : ''}`} aria-label="Corrupted guardian arena">
    <div className="boss-arena-caption"><span>CORRUPTED GUARDIAN</span><span>{animation === 'death' ? 'CORE COLLAPSE' : rage ? 'ENRAGED' : 'DARK ENERGY ENTITY'}</span></div>
    <div key={`${animation}-${eventId}`} className="boss-scene" data-state={animation} data-rage={rage} data-paused={paused}
      style={{ '--boss-duration': `${duration}ms`, '--boss-impact': `${BOSS_IMPACT.heavyAttack}ms` } as CSSProperties} aria-hidden="true">
      <div className="boss-platform" />
      <div className="boss-character">
        <div className="boss-energy">
          <div className="boss-aura" />
          <img className="boss-sprite" src={guardian} alt="" width="1292" height="1218" draggable={false} />
          <div className="boss-core" />
          <div className="boss-hit-flash" />
        </div>
      </div>
      <div className="boss-particles">{particles.map((style, index) => <i key={index} style={style} />)}</div>
      <div className="boss-slash" />
      <div className="boss-blast" />
    </div>
  </section>;
});
