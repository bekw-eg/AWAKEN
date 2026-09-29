import { CameraView } from '../../components/Camera/CameraView';
import { MainScreen } from '../../components/MainScreen/MainScreen';
import { BattleScreen } from '../../components/BattleScreen/BattleScreen';
import { useGameState } from '../../hooks/useGameState';
import './Dashboard.css';

export function Dashboard() {
  const { player, currentEnemy, screen, handleExerciseEvent, resetGame, setScreen, startBattle, enemyAttack, ...state } = useGameState();

  const handleFlee = () => setScreen('main');

  if (screen === 'main') {
    return (
      <main className="system-shell">
        <MainScreen 
          state={{ player, currentEnemy, screen, ...state }}
          onStartWorkout={() => setScreen('workout')}
          onStartBattle={startBattle}
        />
      </main>
    );
  }

  if (screen === 'battle') {
    return (
      <BattleScreen 
        state={{ player, currentEnemy, screen, ...state }}
        onExerciseEvent={handleExerciseEvent}
        onEnemyAttack={enemyAttack}
        onFlee={handleFlee}
      />
    );
  }

  // workout screen (original Dashboard behavior)
  return (
    <CameraView onExerciseEvent={handleExerciseEvent}>
      <div className="game-dashboard">
        <div style={{display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.5)', borderRadius: '8px', marginBottom: '1rem'}}>
          <button type="button" onClick={() => setScreen('main')} style={{padding: '8px 16px', background: '#3b82f6', color: 'white', borderRadius: '4px', cursor: 'pointer', border: 'none'}}>← Back to Main</button>
          <span>WORKOUT MODE</span>
        </div>
      </div>
      <p className="game-hint session-note">Session progress · Complete exercises for XP and stats.</p>
    </CameraView>
  );
}
