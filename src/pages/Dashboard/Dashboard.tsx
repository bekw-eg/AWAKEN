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
import { MotionProvider, MOTION, emitMotionEvent } from '../../motion/Motion';
import { LevelUpEvent } from '../../components/UI/LevelUpEvent';
import { BOSS_TIMING } from '../../components/Boss/BossCharacter';
import '../../styles/tokens.css';
import './Dashboard.css';
import '../../styles/motion.css';

export function Dashboard() {
  const { handleExerciseEvent, resetGame: _resetGame, setScreen, startBattle, enemyAttack, recover, completeRoundDeath, startNextRound, ...state } = useGameState();
  const [page, setPage] = useState<Page>('home');
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [outcome, setOutcome] = useState<BattleOutcome | null>(null);
  const [resultReady, setResultReady] = useState(false);
  const [journeyChange, setJourneyChange] = useState<number | null>(null);
  const [trainingLevelUp, setTrainingLevelUp] = useState<{ from: number; to: number } | null>(null);
  const seenEncounters = useRef(new Set<string>());
  const [repeated, setRepeated] = useState(false);
  const previous = useRef(state);

  // Present the reducer's terminal transition without changing its rewards, healing, or progression.
  useEffect(() => {
    const before = previous.current;
    if (before.screen === 'battle' && state.screen === 'main' && !state.currentEnemy && before.currentEnemy) {
      const victory = before.currentEnemyIndex !== state.currentEnemyIndex;
      setOutcome({ victory, enemy: before.currentEnemy, previousLevel: before.player.level, before });
      setResultReady(false);
      if (victory) setJourneyChange(before.currentEnemyIndex);
      emitMotionEvent({ type: victory ? 'victory' : 'defeat' });
      setPage('journey');
    }
    if (state.player.level > before.player.level) {
      emitMotionEvent({ type: 'level-up', amount: state.player.level });
      if (before.screen !== 'battle') setTrainingLevelUp({ from: before.player.level, to: state.player.level });
    }
    previous.current = state;
  }, [state]);

  useEffect(() => {
    if (!outcome) return;
    const systemReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const bossVictory = outcome.victory && outcome.enemy.isBoss;
    const duration = preferences.reducedMotion || systemReduced ? (bossVictory ? 200 : 0) : bossVictory ? BOSS_TIMING.death : MOTION.impact;
    const timer = setTimeout(() => setResultReady(true), duration);
    return () => clearTimeout(timer);
  }, [outcome, preferences.reducedMotion]);

  useEffect(() => {
    document.title = `AWAKEN — ${outcome ? outcome.victory ? 'Victory' : 'Defeated' : state.screen === 'battle' ? 'Battle arena' : page.charAt(0).toUpperCase() + page.slice(1)}`;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [page, state.screen, outcome]);

  const navigate = (destination: Page) => {
    setOutcome(null);
    setTrainingLevelUp(null);
    setPage(destination);
    setScreen(destination === 'training' ? 'workout' : 'main');
  };
  const enterBattle = () => {
    const id = `enemy-${state.currentEnemyIndex}`;
    setRepeated(seenEncounters.current.has(id));
    seenEncounters.current.add(id);
    setOutcome(null); setResultReady(false); setJourneyChange(null); setPage('journey'); startBattle();
  };
  const cameraPreferences = { autoStart: preferences.autoStart, mirrored: preferences.mirrored };
  // Retain the mounted arena on the very render that the reducer finishes combat.
  const before = previous.current;
  const incomingOutcome: BattleOutcome | null = before.screen === 'battle' && state.screen === 'main' && !state.currentEnemy && before.currentEnemy
    ? { victory: before.currentEnemyIndex !== state.currentEnemyIndex, enemy: before.currentEnemy, previousLevel: before.player.level, before } : null;
  const presentedOutcome = outcome ?? incomingOutcome;
  const terminalState = presentedOutcome ? { ...presentedOutcome.before, currentEnemy: { ...presentedOutcome.enemy, hp: presentedOutcome.victory ? 0 : presentedOutcome.enemy.hp }, player: { ...presentedOutcome.before.player, hp: presentedOutcome.victory ? presentedOutcome.before.player.hp : 0 } } : null;
  const inArena = state.screen === 'battle' || !!presentedOutcome && !resultReady;
  const viewKey = inArena ? 'battle' : outcome ? 'result' : page;

  return <MotionProvider reduced={preferences.reducedMotion}><AppShell page={page} battle={inArena} player={inArena && terminalState ? terminalState.player : state.player} onNavigate={navigate} reducedMotion={preferences.reducedMotion}>
    <div className="page-motion" key={viewKey}>
    {inArena ? <BattleScreen state={terminalState ?? state} terminal={!!presentedOutcome} repeated={repeated} onExerciseEvent={handleExerciseEvent} onEnemyAttack={enemyAttack} onRecover={recover} onRoundDeathComplete={completeRoundDeath} onNextRound={startNextRound} onFlee={() => navigate('journey')} {...cameraPreferences} />
      : outcome ? <BattleResult outcome={outcome} player={state.player} onContinue={() => navigate('journey')} onRetry={enterBattle} />
      : page === 'training' ? <>
        <PageHeader eyebrow="TRAINING / REAL-WORLD INPUT" title="Your body is the controller." description="Choose a movement. Find your form. Build your next level."><span className="badge badge-accent"><Icon name="TrendingUp" />+15 XP / REP</span></PageHeader>
        <CameraView onExerciseEvent={handleExerciseEvent} {...cameraPreferences} />
        <div className="training-progress"><DailyQuest quest={state.dailyQuest} /><div className="training-progress-copy"><p className="eyebrow">PUT IN THE REPS</p><h2>Stronger with every session.</h2><p>Correct reps build exercise mastery. Finish training objectives to earn attributes, bonus XP, and gold.</p><button className="button button-quiet" onClick={() => navigate('profile')}>View your progress<Icon name="ArrowRight" /></button></div></div>
      </>
      : page === 'profile' ? <ProfileScreen state={state} onTrain={() => navigate('training')} />
      : page === 'settings' ? <SettingsScreen preferences={preferences} onChange={setPreferences} />
      : <MainScreen state={state} onStartWorkout={() => navigate('training')} onStartBattle={enterBattle} journeyOnly={page === 'journey'} journeyChange={journeyChange} onJourneyAnimated={() => setJourneyChange(null)} />}
    </div>
    {trainingLevelUp && <LevelUpEvent key={trainingLevelUp.to} from={trainingLevelUp.from} to={trainingLevelUp.to} />}
  </AppShell></MotionProvider>;
}
