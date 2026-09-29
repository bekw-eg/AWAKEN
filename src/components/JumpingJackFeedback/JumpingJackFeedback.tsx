import type { JumpingJackDetectionResult } from '../../exercise-engine/types';
import { Icon } from '../UI/Icon';
import '../ExerciseFeedback/ExerciseFeedback.css';

export type JumpingJackFeedbackProps = { result: JumpingJackDetectionResult; onReset: () => void };
export function JumpingJackFeedback({ result, onReset }: JumpingJackFeedbackProps) {
  return <section className={`exercise-feedback form-${result.formStatus}`} aria-labelledby="jumping-jack-title">
    <header className="exercise-header"><div><p className="eyebrow">FAST ATTACK · TRAINING</p><h2 id="jumping-jack-title">JUMPING JACK</h2></div><button type="button" onClick={onReset} aria-label="Reset jumping jack counter"><Icon name="RotateCcw" />RESET</button></header>
    <div className="exercise-summary">
      <div className="rep-counter"><span className={`rep-value${result.repJustCounted ? ' rep-flash' : ''}`}>{result.repCount}</span><span>VALID REPS</span></div>
      <div className="exercise-state"><p className="exercise-phase">PHASE <strong>{result.phase.toUpperCase()}</strong></p>
        <p className="form-badge">{result.formStatus === 'good' ? 'GOOD FORM' : result.formStatus === 'error' ? 'FORM ERROR' : 'WAITING'}</p>
        <p className="exercise-message" role="status">{result.feedback || (result.trackingStatus === 'ready' ? 'Open fully, then return to your starting position.' : 'SEARCHING FOR USER')}</p>
      </div>
    </div>
    <details className="exercise-debug"><summary>DEBUG METRICS</summary><dl>
      <div><dt>Tracking</dt><dd>{result.trackingStatus}</dd></div>
      <div><dt>Ankle width</dt><dd>{result.metrics.ankleWidthRatio?.toFixed(2) ?? '—'}</dd></div>
      <div><dt>Left wrist</dt><dd>{result.metrics.leftWristHeightRatio?.toFixed(2) ?? '—'}</dd></div>
      <div><dt>Right wrist</dt><dd>{result.metrics.rightWristHeightRatio?.toFixed(2) ?? '—'}</dd></div>
    </dl></details>
    <p className="exercise-tip">Start with feet together and arms down. Keep hands and feet inside the frame.</p>
  </section>;
}
