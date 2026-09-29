import { CameraView } from '../../components/Camera/CameraView';
import { DailyQuest } from '../../components/DailyQuest/DailyQuest';
import { DevControls } from '../../components/DevControls/DevControls';
import { PlayerStats } from '../../components/PlayerStats/PlayerStats';
import { useGameState } from '../../hooks/useGameState';
import './Dashboard.css';

export function Dashboard() {
  const { player, dailyQuest, handleExerciseEvent, resetGame } = useGameState();
  return (
    <CameraView onExerciseEvent={handleExerciseEvent}>
      <div className="game-dashboard">
        <PlayerStats player={player} />
        <DailyQuest quest={dailyQuest} />
      </div>
      <p className="game-hint session-note">Session progress · Refreshing starts a new training session.</p>
      {import.meta.env.DEV && <DevControls onExerciseEvent={handleExerciseEvent} onReset={resetGame} />}
    </CameraView>
  );
}
