import { useEffect, useRef, useState } from 'react';
import { AppShell, type Page } from '../../components/AppShell/AppShell';
import { CameraView } from '../../components/Camera/CameraView';
import { MainScreen } from '../../components/MainScreen/MainScreen';
import { BattleScreen } from '../../components/BattleScreen/BattleScreen';
import { BattleResult, type BattleOutcome } from '../../components/BattleScreen/BattleResult';
import { PageHeader } from '../../components/UI/PageHeader';
import { Icon } from '../../components/UI/Icon';
import { DailyQuest } from '../../components/DailyQuest/DailyQuest';
import { useGameState } from '../../hooks/useGameState';
import { ProfileScreen } from './ProfileScreen';
import { SettingsScreen, DEFAULT_PREFERENCES } from './SettingsScreen';
import '../../styles/tokens.css';
import './Dashboard.css';

export function Dashboard() {
  const { handleExerciseEvent, resetGame: _resetGame, setScreen, startBattle, enemyAttack, ...state } = useGameState();
  const [page, setPage] = useState<Page>('home');
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [outcome, setOutcome] = useState<BattleOutcome | null>(null);
  const previous = useRef(state);

  // Present the reducer's terminal transition without changing its rewards, healing, or progression.
  useEffect(() => {
    const before = previous.current;
    if (before.screen === 'battle' && state.screen === 'main' && !state.currentEnemy && before.currentEnemy) {
      setOutcome({ victory: before.currentEnemyIndex !== state.currentEnemyIndex, enemy: before.currentEnemy, previousLevel: before.player.level });
      setPage('journey');
    }
    previous.current = state;
  }, [state]);

  useEffect(() => {
    document.title = `AWAKEN — ${outcome ? outcome.victory ? 'Victory' : 'Defeated' : state.screen === 'battle' ? 'Battle arena' : page.charAt(0).toUpperCase() + page.slice(1)}`;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [page, state.screen, outcome]);

  const navigate = (destination: Page) => {
    setOutcome(null);
    setPage(destination);
    setScreen(destination === 'training' ? 'workout' : 'main');
  };
  const enterBattle = () => { setOutcome(null); setPage('journey'); startBattle(); };
  const cameraPreferences = { autoStart: preferences.autoStart, mirrored: preferences.mirrored };

  return <AppShell page={page} battle={state.screen === 'battle'} player={state.player} onNavigate={navigate} reducedMotion={preferences.reducedMotion}>
    {outcome ? <BattleResult outcome={outcome} player={state.player} onContinue={() => navigate('journey')} onRetry={enterBattle} />
      : state.screen === 'battle' ? <BattleScreen state={state} onExerciseEvent={handleExerciseEvent} onEnemyAttack={enemyAttack} onFlee={() => navigate('journey')} {...cameraPreferences} />
      : page === 'training' ? <>
        <PageHeader eyebrow="TRAINING / REAL-WORLD INPUT" title="Your body is the controller." description="Choose a movement. Find your form. Build your next level."><span className="badge badge-accent"><Icon name="TrendingUp" />+15 XP / REP</span></PageHeader>
        <CameraView onExerciseEvent={handleExerciseEvent} {...cameraPreferences} />
        <div className="training-progress"><DailyQuest quest={state.dailyQuest} /><div className="training-progress-copy"><p className="eyebrow">PUT IN THE REPS</p><h2>Stronger with every session.</h2><p>Correct reps build exercise mastery. Finish training objectives to earn attributes, bonus XP, and gold.</p><button className="button button-quiet" onClick={() => navigate('profile')}>View your progress<Icon name="ArrowRight" /></button></div></div>
      </>
      : page === 'profile' ? <ProfileScreen state={state} onTrain={() => navigate('training')} />
      : page === 'settings' ? <SettingsScreen preferences={preferences} onChange={setPreferences} />
      : <MainScreen state={state} onStartWorkout={() => navigate('training')} onStartBattle={enterBattle} journeyOnly={page === 'journey'} />}
  </AppShell>;
}
