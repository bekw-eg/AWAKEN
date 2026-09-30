import { useStableText } from '../../motion/Motion';
import type { PushUpDetectionResult } from '../../exercise-engine/pushUpTypes';
import { Icon } from '../UI/Icon';
import { RepCounter } from '../UI/RepCounter';
import { PhaseText, FeedbackText } from '../UI/MotionText';
import '../ExerciseFeedback/ExerciseFeedback.css';
import './PushUpFeedback.css';

const format = (n: number | null, digits = 0) => n === null ? '—' : n.toFixed(digits);
export function PushUpFeedback({ result, onReset }: { result: PushUpDetectionResult; onReset: () => void }) {
  const stableForm = useStableText(result.formStatus);
  return (
    <section className={`exercise-feedback push-up-feedback form-${stableForm}`} aria-labelledby="push-up-title">
      <header className="exercise-header">
        <div><p className="eyebrow">STRONG ATTACK · TRAINING</p><h2 id="push-up-title">PUSH-UP MODE</h2></div>
        <button type="button" onClick={onReset} aria-label="СБРОСИТЬ СЧЁТЧИК"><Icon name="RotateCcw" />RESET</button>
      </header>
      <div className="push-up-setup" lang="ru">
        <strong>SIDE VIEW REQUIRED</strong>
        <p>Повернись боком к камере. Камера должна видеть плечо, локоть, кисть, таз, колено и лодыжку.</p>
        <p>Прими верхнюю позицию с прямыми руками и корпусом. Дождись READY перед первым повтором.</p>
      </div>
      <div className="exercise-summary">
        <RepCounter value={result.repCount} />
        <div className="exercise-state">
          <p className="exercise-phase">PHASE <PhaseText phase={result.phase} /></p>
          <p>SIDE: {result.activeSide?.toUpperCase() ?? '—'} · {result.trackingStatus.toUpperCase()}</p>
          <p className="form-badge">{stableForm === 'error' ? 'FORM ERROR' : stableForm === 'good' ? 'GOOD FORM' : 'WAITING'}</p>
          <p className="exercise-message" role="status" aria-live="polite" lang="ru"><FeedbackText text={result.feedback ?? 'Сделай полный повтор и вернись в верхнюю позицию'} /></p>
        </div>
      </div>
      <details className="exercise-debug">
        <summary>DEBUG METRICS</summary>
        <dl>
          <div><dt>Elbow angle</dt><dd>{format(result.metrics.elbowAngle)}°</dd></div>
          <div><dt>Body angle</dt><dd>{format(result.metrics.bodyAngle)}°</dd></div>
          <div><dt>Knee angle</dt><dd>{format(result.metrics.kneeAngle)}°</dd></div>
          <div><dt>Hip offset</dt><dd>{format(result.metrics.hipOffsetRatio, 2)}</dd></div>
        </dl>
      </details>
    </section>
  );
}
