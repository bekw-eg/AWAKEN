import { RECOVERY, recoveryHealPercent } from '../../game/handsFreeConfig';
import { EXERCISES } from '../../game/progression';
import type { GameState } from '../../game/types';
import { ProgressBar } from '../UI/ProgressBar';
import './DailyQuest.css';

export function RecoveryTraining({ state }: { state: GameState }) {
  const full = state.recoveryCharges >= RECOVERY.maxCharges;
  return <section className="game-card recovery-training" aria-label="Recovery training">
    <div className="section-title"><h2>Earn Recovery</h2><strong role="status">{state.recoveryCharges} / {RECOVERY.maxCharges} CHARGES</strong></div>
    <p>Complete any one set below to earn one charge. Save up to 3 charges for battle.</p>
    <div className="recovery-training-sets">
      {EXERCISES.map(({ exercise, label }) => <div key={exercise}>
        <div className="quest-label"><span>{label}</span><span>{state.recoveryTraining[exercise]} / {RECOVERY.trainingReps[exercise]}</span></div>
        <ProgressBar value={state.recoveryTraining[exercise]} max={RECOVERY.trainingReps[exercise]} label={`${label} recovery charge`} tone="accent" />
      </div>)}
    </div>
    <p className="game-hint">{full ? 'INVENTORY FULL · Charge progress pauses until you use a charge.' : 'Correct Training reps count. Each exercise has its own repeatable set.'}</p>
    <p className="game-hint">Round {state.currentEnemyIndex}: +{recoveryHealPercent(state.currentEnemyIndex)}% Max HP. Stand still for 5 seconds on your turn. Two uses per fight.</p>
  </section>;
}
