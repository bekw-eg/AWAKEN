import { useRef, useState, type ReactNode } from 'react';
import type { ExerciseEvent } from '../../game/types';
import { useSquatGameEvents } from '../../hooks/useSquatGameEvents';
import { usePoseDetection } from '../../hooks/usePoseDetection';
import { useSquatExercise } from '../../hooks/useSquatExercise';
import { ExerciseFeedback } from '../ExerciseFeedback/ExerciseFeedback';
import { PoseOverlay } from '../PoseOverlay/PoseOverlay';
import './CameraView.css';

export function CameraView({ onExerciseEvent, children }: {
  onExerciseEvent: (event: ExerciseEvent) => void;
  children?: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [enabled, setEnabled] = useState(true);
  const [restartKey, setRestartKey] = useState(0);
  const { landmarks, worldLandmarks, poseTimestampMs, videoSize, cameraStatus, engineStatus, isLoading, error, isPersonDetected } =
    usePoseDetection(videoRef, enabled, restartKey);

  const active = cameraStatus === 'active' && engineStatus === 'active';
  const squat = useSquatExercise(landmarks, worldLandmarks, poseTimestampMs, active);
  useSquatGameEvents(squat.repCount, squat.repJustCounted, onExerciseEvent);
  const stopped = cameraStatus === 'idle' && engineStatus === 'idle' && !error;
  const heading = error ? (error.startsWith('CAMERA ACCESS REQUIRED') ? 'CAMERA ACCESS REQUIRED' : 'SYSTEM INTERRUPTED')
    : engineStatus === 'loading' ? 'INITIALIZING POSE ENGINE…'
    : cameraStatus === 'requesting' ? 'REQUESTING CAMERA ACCESS…'
    : cameraStatus === 'starting' ? 'WAITING FOR CAMERA…'
    : isPersonDetected ? 'POSE DETECTED'
    : active ? 'SEARCHING FOR USER…' : 'CAMERA OFFLINE';

  const restart = () => { setEnabled(true); setRestartKey((key) => key + 1); };

  return (
    <main className="system-shell">
      <header className="topbar">
        <a className="wordmark" href="#main">AWAKEN<span className="brand-mark">◇</span></a>
        <span className="chapter">SYSTEM / 03 <span>HUNTER PROGRESSION</span></span>
      </header>
      <section className="camera-system" id="main" aria-labelledby="page-title">
        <div className="section-heading">
          <div><p className="eyebrow">REAL-WORLD INPUT · ONLINE POTENTIAL</p><h1 id="page-title">CAMERA <span>SYSTEM</span></h1></div>
          <span className="stage-tag">PHASE 02 / SQUAT TRAINING</span>
        </div>
        <p className="intro">Your body is the controller. Step into the frame.</p>
        {children}

        <div className="camera-panel">
          <div className="panel-bar"><span><i className={cameraStatus === 'active' ? 'dot active' : 'dot'} /> LIVE CAMERA</span><span>MIRRORED VIEW</span></div>
          <div className="camera-stage" style={{ aspectRatio: `${videoSize.width} / ${videoSize.height}` }}>
            <div className="mirrored-feed">
              <video ref={videoRef} autoPlay playsInline muted aria-label="Live mirrored webcam" />
              <PoseOverlay landmarks={landmarks} width={videoSize.width} height={videoSize.height} />
            </div>
            <div className="frame-corners" aria-hidden="true" />
            {(isLoading || error || stopped) && (
              <div className="stage-message">
                <span className={isLoading ? 'system-symbol spinning' : 'system-symbol'} aria-hidden="true">◇</span>
                <p>{error ? 'CONNECTION INTERRUPTED' : isLoading ? 'ESTABLISHING CONNECTION' : 'READY WHEN YOU ARE'}</p>
                <span>{error ? 'See the system message below.' : cameraStatus === 'requesting' ? 'Allow camera access in your browser.'
                  : engineStatus === 'loading' ? 'Loading body tracking. Please hold still.'
                  : cameraStatus === 'starting' ? 'Waiting for the video signal.' : 'Start the camera to begin.'}</span>
              </div>
            )}
            <div className="camera-caption"><span>01 — VISION LINK</span><span>{cameraStatus === 'active' ? `${videoSize.width} × ${videoSize.height}` : 'AWAITING SIGNAL'}</span></div>
          </div>
          <div className={`detection-banner${error ? ' error' : ''}`} role="status" aria-live="polite">
            <span className={active && isPersonDetected ? 'dot active' : 'dot'} />
            <span>{heading}</span>
            {active && <small>POSE DETECTION: ACTIVE</small>}
          </div>
        </div>

        {error && <p className="error-detail" role="alert">{error}</p>}
        <div className="system-footer">
          <dl className="system-status"><div><dt>CAMERA</dt><dd>{cameraStatus}</dd></div><div><dt>POSE ENGINE</dt><dd>{engineStatus}</dd></div></dl>
          <button type="button" onClick={error || stopped ? restart : () => setEnabled(false)}>
            {error ? 'RETRY CONNECTION' : stopped ? 'START CAMERA' : 'STOP CAMERA'} <span aria-hidden="true">↗</span>
          </button>
        </div>
        <ExerciseFeedback result={squat} onReset={squat.reset} />
        <aside className="setup-note"><span aria-hidden="true">⌖</span><p><strong>Keep your full body in view.</strong> Face the camera, stand upright for one second, and use good lighting.</p></aside>
        <footer className="privacy"><span>LOCAL PROCESSING</span> Camera frames stay on this device. No video is uploaded or recorded.</footer>
      </section>
    </main>
  );
}
