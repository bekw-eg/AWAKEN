import { Icon } from '../UI/Icon';
import { ProgressBar } from '../UI/ProgressBar';

export function FighterStatus({ name, hp, maxHp, level, enemy = false, boss = false, damage }: {
  name: string; hp: number; maxHp: number; level?: number; enemy?: boolean; boss?: boolean; damage: number;
}) {
  return <section className={`fighter-status${enemy ? ' fighter-enemy' : ''}${boss ? ' fighter-boss' : ''}`} aria-label={`${name} health`}>
    <div className="fighter-meta"><span><Icon name={enemy ? 'Shield' : 'User'} />{enemy ? boss ? 'BOSS / FINAL ENCOUNTER' : 'OPPONENT' : 'PLAYER'}</span><span>{level ? `LEVEL ${String(level).padStart(2, '0')}` : boss ? 'ELITE' : 'ENCOUNTER'}</span></div>
    <div className="fighter-name"><h2>{name}</h2><div>{damage > 0 && <span key={hp} className="damage-number">−{damage}</span>}<strong>{hp}</strong><span> / {maxHp} HP</span></div></div>
    <ProgressBar value={hp} max={maxHp} label={`${name} HP`} tone={enemy ? 'danger' : 'accent'} />
  </section>;
}
