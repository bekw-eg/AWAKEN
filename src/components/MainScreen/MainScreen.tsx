import type { GameState } from '../../game/types';
import './MainScreen.css';

type Props = {
  state: GameState;
  onStartWorkout: () => void;
  onStartBattle: () => void;
};

export function MainScreen({ state, onStartWorkout, onStartBattle }: Props) {
  const { player, currentEnemyIndex } = state;

  return (
    <div className="main-screen">
      <header className="main-header">
        <h1>LEVEL {player.level}</h1>
        <div className="xp-bar">
          <label>XP {player.xp} / {player.xpToNextLevel}</label>
          <progress value={player.xp} max={player.xpToNextLevel} />
        </div>
      </header>

      <section className="vital-stats">
        <div className="stat-pill hp">
          <span className="icon">❤️</span> {player.hp} / {player.maxHp}
        </div>
        <div className="stat-pill stamina">
          <span className="icon">🔋</span> {player.stamina} / {player.stamina}
        </div>
      </section>

      <section className="character-stats">
        <h3>Stats</h3>
        <div className="stats-grid">
          <div>STR {player.strength}</div>
          <div>AGI {player.agility}</div>
          <div>POW {player.power}</div>
          <div>VIT {player.vitality}</div>
          <div>DEF {player.defense}</div>
          <div>STA {player.stamina}</div>
        </div>
      </section>

      <section className="adventure-map">
        <h3>Adventure:</h3>
        <ul className="road-map">
          {Array.from({ length: 10 }).map((_, i) => {
            const index = i + 1;
            const status = index < currentEnemyIndex ? 'completed' : index === currentEnemyIndex ? 'current' : 'locked';
            const icon = status === 'completed' ? '✓' : status === 'current' ? '●' : '🔒';
            return (
              <li key={index} className={`map-node ${status}`}>
                {icon} Enemy {index}
              </li>
            );
          })}
          <li className={`map-node boss ${currentEnemyIndex === 10 ? 'current' : 'locked'}`}>
            {currentEnemyIndex === 10 ? '🐉' : '🔒'} Boss
          </li>
        </ul>
        <p className="progress-text">Progress: {Math.min(9, currentEnemyIndex - 1)} / 10</p>
      </section>

      <section className="action-buttons">
        <button type="button" className="action-btn battle-btn" onClick={onStartBattle}>
          START BATTLE
        </button>
        <button type="button" className="action-btn workout-btn" onClick={onStartWorkout}>
          START WORKOUT
        </button>
      </section>
    </div>
  );
}
