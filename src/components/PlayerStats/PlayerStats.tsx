import type { PlayerState } from '../../game/types';
import './PlayerStats.css';

export function PlayerStats({ player }: { player: PlayerState }) {
  return (
    <section className="game-card hunter-status" aria-labelledby="hunter-title">
      <h2 id="hunter-title">HUNTER STATUS</h2>
      <p className="hunter-level">LEVEL <strong>{player.level}</strong></p>
      <label htmlFor="player-xp">XP {player.xp} / {player.xpToNextLevel}</label>
      <progress id="player-xp" value={player.xp} max={player.xpToNextLevel} />
      <dl className="hunter-stats">
        <div><dt>STR</dt><dd>{player.strength}</dd></div>
        <div><dt>END</dt><dd>{player.endurance}</dd></div>
        <div><dt>AGI</dt><dd>{player.agility}</dd></div>
      </dl>
      <p className="hunter-gold">GOLD <strong>{player.gold}</strong></p>
      <p className="game-hint">+10 XP per correct rep · 100 XP per level</p>
    </section>
  );
}
