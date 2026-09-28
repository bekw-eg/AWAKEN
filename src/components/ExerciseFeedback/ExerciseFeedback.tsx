import type { SquatDetectionResult } from '../../exercise-engine/types';
import './ExerciseFeedback.css';

type Props = { result: SquatDetectionResult; onReset: () => void };
const format = (value: number | null, suffix = '', decimals = 0) =>
  value === null ? '—' : `${value.toFixed(decimals)}${suffix}`;

export function ExerciseFeedback({ result, onReset }: Props) {
  const { phase, repCount, formStatus, feedback, metrics, trackingStatus, calibrationProgress } = result;
  const status = formStatus === 'good' ? 'GOOD FORM' : formStatus === 'error' ? 'FORM ERROR' : 'WAITING';

  return (
    <section className={`exercise-feedback form-${formStatus}`} aria-labelledby="exercise-title">
      <header className="exercise-header">
        <div><p className="eyebrow">TRAINING / 01</p><h2 id="exercise-title">SQUAT TRAINING</h2></div>
        <button type="button" onClick={onReset}>СБРОСИТЬ СЧЁТЧИК</button>
      </header>
      <div className="exercise-summary">
        <div className="rep-counter"><span key={repCount} className={repCount > 0 ? 'rep-value rep-flash' : 'rep-value'}>{repCount}</span><span>VALID REPS</span></div>
        <div className="exercise-state">
          <p className="exercise-phase">PHASE <strong>{phase.toUpperCase()}</strong></p>
          <p className="form-badge">{status}</p>
          <p className="exercise-message" role="status" aria-live="polite" lang="ru">{feedback ?? (phase === 'standing' ? 'Готово. Сделай приседание и полностью выпрямись.' : 'Продолжай движение')}</p>
          {trackingStatus === 'calibrating' && <progress aria-label="Калибровка стоя" max={1} value={calibrationProgress} />}
        </div>
      </div>
      <details className="exercise-debug">
        <summary>DEBUG METRICS</summary>
        <dl>
          <div><dt>Left knee</dt><dd>{format(metrics.leftKneeAngle, '°')}</dd></div>
          <div><dt>Right knee</dt><dd>{format(metrics.rightKneeAngle, '°')}</dd></div>
          <div><dt>Avg knee</dt><dd>{format(metrics.avgKneeAngle, '°')}</dd></div>
          <div><dt>Torso lean</dt><dd>{format(metrics.torsoLeanDeg, '°')}</dd></div>
          <div><dt>Knee / ankle width</dt><dd>{format(metrics.kneeDistanceRatio, '', 2)}</dd></div>
          <div><dt>Hip drop / torso</dt><dd>{format(metrics.hipDepthDelta, '', 2)}</dd></div>
        </dl>
      </details>
      <p className="exercise-tip" lang="ru">Встань лицом к камере, покажи всё тело и замри на секунду. После потери трекинга снова выпрямись.</p>
    </section>
  );
}
