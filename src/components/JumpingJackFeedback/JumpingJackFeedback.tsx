import React from 'react';
import type { JumpingJackDetectionResult } from '../../exercise-engine/types';
import './JumpingJackFeedback.css';

export type JumpingJackFeedbackProps = {
  result: JumpingJackDetectionResult;
  onReset: () => void;
};

export const JumpingJackFeedback: React.FC<JumpingJackFeedbackProps> = ({ result, onReset }) => {
  const { phase, repCount, formStatus, feedback, trackingStatus, metrics } = result;

  return (
    <div className="jumping-jack-feedback">
      <div className="feedback-header">
        <div>
          <h2>JUMPING JACK</h2>
          <button type="button" onClick={onReset} style={{ fontSize: '0.7rem', padding: '2px 6px', marginTop: '4px', cursor: 'pointer' }}>RESET</button>
        </div>
        <div className="reps">REPS {repCount}</div>
      </div>

      {trackingStatus !== 'ready' ? (
        <div className="status-warning">{feedback || 'SEARCHING FOR USER...'}</div>
      ) : (
        <>
          <div className="phase-indicator">
            <span className="label">PHASE</span>
            <span className="value">{phase.toUpperCase()}</span>
          </div>

          {formStatus === 'error' && (
            <div className="form-feedback error">
              <strong>FORM ERROR</strong>
              <p>{feedback}</p>
            </div>
          )}

          {formStatus === 'good' && (
            <div className="form-feedback good">
              <strong>GOOD FORM</strong>
            </div>
          )}
        </>
      )}

      <details className="metrics-details">
        <summary>Debug Metrics</summary>
        <pre>
          {JSON.stringify(
            {
              ankleWidthRatio: metrics.ankleWidthRatio?.toFixed(2),
              leftWristHeightRatio: metrics.leftWristHeightRatio?.toFixed(2),
              rightWristHeightRatio: metrics.rightWristHeightRatio?.toFixed(2),
            },
            null,
            2
          )}
        </pre>
      </details>
    </div>
  );
};
