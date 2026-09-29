import type { PlayerState } from '../../game/types';
import { Icon, type IconName } from '../UI/Icon';
import { ProgressBar } from '../UI/ProgressBar';
import './PlayerStats.css';

const stats: { key: keyof PlayerState; label: string; icon: IconName }[] = [
  { key: 'strength', label: 'Strength', icon: 'Target' },
  { key: 'agility', label: 'Agility', icon: 'Zap' },
  { key: 'power', label: 'Power', icon: 'Activity' },
  { key: 'vitality', label: 'Vitality', icon: 'Heart' },
  { key: 'defense', label: 'Defense', icon: 'Shield' },
  { key: 'stamina', label: 'Stamina', icon: 'Battery' },
];
export function PlayerStats({ player }: { player: PlayerState }) {
  return <section className="game-card hunter-status" aria-labelledby="hunter-title">
    <div className="section-title"><h2 id="hunter-title">Player status</h2><Icon name="User" /></div>
    <div className="hunter-level"><div><span className="label">LEVEL</span><strong>{String(player.level).padStart(2, '0')}</strong></div><span className="badge">PLAYER</span></div>
    <div className="stat-progress-label"><span>Experience</span><span><strong>{player.xp}</strong> / {player.xpToNextLevel} XP</span></div>
    <ProgressBar value={player.xp} max={player.xpToNextLevel} label="Level progress" />
    <div className="hunter-health"><Icon name="Heart" /><span>Health</span><strong>{player.hp}<small> / {player.maxHp}</small></strong></div>
    <dl className="hunter-stats">{stats.map(({ key, label, icon }) => <div key={key}><dt><Icon name={icon} />{label}</dt><dd>{player[key]}</dd></div>)}</dl>
    <div className="hunter-gold"><Icon name="Award" /><span>Gold earned</span><strong>{player.gold.toLocaleString()}</strong></div>
  </section>;
}
