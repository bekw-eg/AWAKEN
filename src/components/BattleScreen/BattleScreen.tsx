import { useState, useEffect } from 'react';
import type { GameState, ExerciseType, ExerciseEvent } from '../../game/types';
import { CameraView } from '../Camera/CameraView';
import './BattleScreen.css';

type Props = {
  state: GameState;
  onExerciseEvent: (event: ExerciseEvent) => void;
  onEnemyAttack: () => void;
  onFlee: () => void;
};

export function BattleScreen({ state, onExerciseEvent, onEnemyAttack, onFlee }: Props) {
  const { player, currentEnemy } = state;
  const [selectedAttack, setSelectedAttack] = useState<ExerciseType>('squat');

  // Enemy attack loop
  useEffect(() => {
    if (!currentEnemy) return;
    const timer = setInterval(() => {
      onEnemyAttack();
    }, 5000); // Enemy attacks every 5 seconds
    return () => clearInterval(timer);
  }, [currentEnemy, onEnemyAttack]);

  if (!currentEnemy) return null;

  return (
    <CameraView 
      onExerciseEvent={onExerciseEvent} 
      forcedExerciseType={selectedAttack}
      onExerciseChange={setSelectedAttack}
      hideSelector={true} // custom prop we will add
    >
      <div className="battle-ui">
        <div className="battle-header">
          <button className="flee-btn" onClick={onFlee}>Flee</button>
          <h2>BATTLE</h2>
        </div>
        
        <div className="combatants">
          <div className="combatant player">
            <h3>Player</h3>
            <div className="hp-bar">
              <progress value={player.hp} max={player.maxHp} />
              <span>{player.hp} / {player.maxHp}</span>
            </div>
          </div>
          
          <div className="combatant enemy">
            <h3>{currentEnemy.name}</h3>
            <div className="hp-bar enemy-hp">
              <progress value={currentEnemy.hp} max={currentEnemy.maxHp} />
              <span>{currentEnemy.hp} / {currentEnemy.maxHp}</span>
            </div>
          </div>
        </div>

        <div className="attack-selection">
          <h3>Select Attack:</h3>
          <div className="attack-buttons">
            <button 
              className={selectedAttack === 'push-up' ? 'active' : ''} 
              onClick={() => setSelectedAttack('push-up')}
            >
              <strong>Strong Attack</strong>
              <small>Push-up</small>
            </button>
            <button 
              className={selectedAttack === 'squat' ? 'active' : ''} 
              onClick={() => setSelectedAttack('squat')}
            >
              <strong>Basic Attack</strong>
              <small>Squat</small>
            </button>
            <button 
              className={selectedAttack === 'jumping-jack' ? 'active' : ''} 
              onClick={() => setSelectedAttack('jumping-jack')}
            >
              <strong>Fast Attack</strong>
              <small>Jumping Jack</small>
            </button>
          </div>
        </div>
      </div>
    </CameraView>
  );
}
