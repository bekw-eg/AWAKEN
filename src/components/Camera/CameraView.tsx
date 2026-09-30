import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ExerciseEvent, ExerciseType } from '../../game/types';
import type { PushUpFrame } from '../../exercise-engine/pushUpTypes';
import { toFormFeedback, type FormFeedback } from '../../exercise-engine/formFeedback';
import { useStableFormFeedback } from '../../hooks/useStableFormFeedback';
import { useSquatGameEvents } from '../../hooks/useSquatGameEvents';
import { usePoseDetection } from '../../hooks/usePoseDetection';
import { useSquatExercise } from '../../hooks/useSquatExercise';
import { useJumpingJackExercise } from '../../hooks/useJumpingJackExercise';
import { usePushUpExercise } from '../../hooks/usePushUpExercise';
import { PushUpFeedback } from '../PushUpFeedback/PushUpFeedback';
import { ExerciseFeedback } from '../ExerciseFeedback/ExerciseFeedback';
import { JumpingJackFeedback } from '../JumpingJackFeedback/JumpingJackFeedback';
import { PoseOverlay } from '../PoseOverlay/PoseOverlay';
import { Icon } from '../UI/Icon';
import { LoadingScreen } from '../UI/LoadingScreen';
import { emitMotionEvent, useStableText } from '../../motion/Motion';
import './CameraView.css';

export type CameraTelemetry = {
  active: boolean;
  isPersonDetected: boolean;
  repCount: number;
  phase: string;
  trackingStatus: string;
  formStatus: string;
};
type Props = {
  onExerciseEvent: (event: ExerciseEvent) => void;
  children?: ReactNode | ((telemetry: CameraTelemetry) => ReactNode);
  forcedExerciseType?: ExerciseType;
  onExerciseChange?: (type: ExerciseType) => void;
  hideSelector?: boolean;
  autoStart?: boolean;
  mirrored?: boolean;
  suspended?: boolean;
  onPoseFrame?: (frame: PushUpFrame) => void;
  trackingPanel?: ReactNode;
  formFeedback?: FormFeedback;
  formFeedbackSource?: string;
};

export function CameraView({ onExerciseEvent, children, forcedExerciseType, onExerciseChange, hideSelector, autoStart = true, mirrored = true, suspended = false, onPoseFrame, trackingPanel, formFeedback, formFeedbackSource }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [enabled, setEnabled] = useState(autoStart);
  const [restartKey, setRestartKey] = useState(0);
  const [internalExerciseType, setInternalExerciseType] = useState<ExerciseType>('squat');
  const exerciseType = forcedExerciseType || internalExerciseType;
  const setExerciseType = onExerciseChange || setInternalExerciseType;
  const { landmarks, worldLandmarks, poseTimestampMs, videoSize, cameraStatus, engineStatus, isLoading, error, isPersonDetected } =
    usePoseDetection(videoRef, enabled && !suspended, restartKey);

  const active = cameraStatus === 'active' && engineStatus === 'active';
  // In battle the orchestration layer exclusively owns detectors and rep events.
  const training = active && !onPoseFrame;
  useEffect(() => {
    if (!onPoseFrame || suspended) return;
    onPoseFrame({ landmarks: active ? landmarks : null, worldLandmarks: active ? worldLandmarks : null,
      timestampMs: poseTimestampMs ?? performance.now(), imageAspectRatio: videoSize.width / videoSize.height });
  }, [onPoseFrame, suspended, active, landmarks, worldLandmarks, poseTimestampMs, videoSize.width, videoSize.height]);
  const trainingLandmarks = training ? landmarks : null;
  const trainingWorld = training ? worldLandmarks : null;
  const trainingTimestamp = training ? poseTimestampMs : null;
  const squat = useSquatExercise(trainingLandmarks, trainingWorld, trainingTimestamp, training && exerciseType === 'squat');
  const jumpingJack = useJumpingJackExercise(trainingLandmarks, trainingWorld, trainingTimestamp, training && exerciseType === 'jumping-jack');
  const pushUp = usePushUpExercise(trainingLandmarks, trainingWorld, trainingTimestamp, training && exerciseType === 'push-up',
    undefined, videoSize.width / videoSize.height);
  const confirmRep = useCallback((event: ExerciseEvent) => {
    if (suspended || onPoseFrame) return;
    emitMotionEvent({ type: 'rep-success', exercise: event.exercise, amount: 1 });
    onExerciseEvent(event);
  }, [onExerciseEvent, suspended, onPoseFrame]);
  useSquatGameEvents(squat.repCount, squat.repJustCounted, confirmRep);
  useSquatGameEvents(jumpingJack.repCount, jumpingJack.repJustCounted, confirmRep, 'jumping-jack');
  useSquatGameEvents(pushUp.repCount, pushUp.repJustCounted, confirmRep, 'push-up');
  const result = exerciseType === 'squat' ? squat : exerciseType === 'jumping-jack' ? jumpingJack : pushUp;
  const displayedForm = useStableFormFeedback(formFeedback ?? toFormFeedback(exerciseType, result),
    active && isPersonDetected && !suspended, formFeedbackSource ?? exerciseType);
  const stopped = cameraStatus === 'idle' && engineStatus === 'idle' && !error;
  const heading = error ? (error.startsWith('CAMERA ACCESS REQUIRED') ? 'CAMERA ACCESS REQUIRED' : 'CAMERA INTERRUPTED')
    : engineStatus === 'loading' ? 'LOADING POSE MODEL'
    : cameraStatus === 'requesting' ? 'REQUESTING CAMERA ACCESS'
    : cameraStatus === 'starting' ? 'INITIALIZING CAMERA'
    : isPersonDetected ? 'POSE DETECTED'
    : active ? 'SEARCHING FOR USER' : 'CAMERA OFFLINE';
  const stableHeading = useStableText(heading, 180);
  const [showLoading, setShowLoading] = useState(isLoading);
  useEffect(() => {
    if (isLoading) { setShowLoading(true); return; }
    if (!active) { setShowLoading(false); return; }
    const timer = setTimeout(() => setShowLoading(false), 480);
    return () => clearTimeout(timer);
  }, [isLoading, active]);
  // Percentages represent three completed setup stages, not download bytes or elapsed time.
  const initializationProgress = active ? 100 : engineStatus === 'loading' ? 67 : cameraStatus === 'starting' ? 33 : 0;
  const restart = () => { setEnabled(true); setRestartKey((key) => key + 1); };
  const telemetry: CameraTelemetry = { active, isPersonDetected, repCount: result.repCount, phase: result.phase, trackingStatus: result.trackingStatus, formStatus: result.formStatus };

  return <section className="camera-system" aria-label="Exercise camera">
    {!hideSelector && <div className="exercise-mode-selector" role="group" aria-label="Exercise mode">
      <button type="button" aria-pressed={exerciseType === 'squat'} onClick={() => setExerciseType('squat')}><Icon name="Activity" />SQUAT</button>
      <button type="button" aria-pressed={exerciseType === 'jumping-jack'} onClick={() => setExerciseType('jumping-jack')}><Icon name="Zap" />JUMPING JACK</button>
      <button type="button" aria-pressed={exerciseType === 'push-up'} onClick={() => setExerciseType('push-up')}><Icon name="Target" />PUSH-UP</button>
    </div>}
    <div className="camera-layout">
      <div className="camera-column">
        <div className="camera-panel">
          <div className="panel-bar"><span><Icon name="Camera" />VISION LINK<span className={cameraStatus === 'active' ? 'live-label active' : 'live-label'}>{cameraStatus === 'active' ? 'LIVE' : 'OFFLINE'}</span></span><span>{mirrored ? 'MIRRORED' : 'DIRECT'} VIEW</span></div>
          <div className="camera-stage" style={{ aspectRatio: `${videoSize.width} / ${videoSize.height}` }}>
            <div className={`camera-feed${mirrored ? ' mirrored-feed' : ''}`}>
              <video ref={videoRef} autoPlay playsInline muted aria-label="Live webcam" />
              <PoseOverlay landmarks={landmarks} width={videoSize.width} height={videoSize.height} feedback={displayedForm} />
            </div>
            {/* Outside the mirrored feed: stable placement keeps the hint readable and still. */}
            {(displayedForm.status === 'error' || displayedForm.status === 'warning') && displayedForm.message &&
              <div className={`pose-form-hint ${displayedForm.status}`} role="status">
                <span>{displayedForm.status === 'error' ? 'FORM ERROR' : 'CHECK FORM'}</span>{displayedForm.message}
              </div>}
            <div className="frame-corners" aria-hidden="true" />
            {showLoading && <div className={`camera-loading${active ? ' camera-ready' : ''}`}><LoadingScreen compact ready={active} progress={initializationProgress} status={active ? 'READY' : heading} /></div>}
            {(error || stopped) && <div className="stage-message">
              <Icon name={error ? 'CameraOff' : 'Camera'} />
              <h3>{error ? 'Let’s reconnect.' : 'Ready when you are.'}</h3>
              <p>{error ? 'Check the camera connection below.' : 'Start your camera. Step into the frame.'}</p>
            </div>}
          </div>
          <div className={`detection-banner${error ? ' error' : ''}`} role="status">
            <Icon name={active && isPersonDetected ? 'Check' : error ? 'Info' : 'Activity'} /><span key={stableHeading} className={`motion-text${stableHeading === 'POSE DETECTED' ? ' pose-confirmation' : ''}`}>{stableHeading}</span>
            <small>{cameraStatus === 'active' ? `${videoSize.width} × ${videoSize.height}` : 'VISION LINK'}</small>
          </div>
        </div>
        {error && <p className="error-detail" role="alert">{error}</p>}
        <div className="system-footer">
          <span><Icon name="Shield" />Camera stays on your device</span>
          <button className="text-button" type="button" disabled={isLoading || suspended} aria-busy={isLoading} onClick={error || stopped ? restart : () => setEnabled(false)}>
            <Icon name={error ? 'RotateCcw' : stopped ? 'Camera' : 'CameraOff'} />{isLoading ? 'Initializing camera…' : error ? 'Retry connection' : stopped ? 'Start camera' : 'Stop camera'}
          </button>
        </div>
      </div>
      <aside className="tracking-panel" aria-label="Live exercise feedback">
        <div className="tracking-heading"><span className="eyebrow">MOVEMENT TRACKING</span><Icon name="Activity" /></div>
        {trackingPanel ?? (exerciseType === 'squat' ? <ExerciseFeedback result={squat} onReset={squat.reset} />
          : exerciseType === 'jumping-jack' ? <JumpingJackFeedback result={jumpingJack} onReset={jumpingJack.reset} />
          : <PushUpFeedback result={pushUp} onReset={pushUp.reset} />)}
      </aside>
    </div>
    {typeof children === 'function' ? children(telemetry) : children}
    {!onPoseFrame && <aside className="setup-note"><Icon name="Maximize" /><p><strong>{exerciseType === 'push-up' ? 'Position your camera to the side.' : 'Keep your full body in view.'}</strong> {exerciseType === 'push-up' ? 'Show wrists and ankles. Hold a straight plank to calibrate.' : 'Face the camera, stand upright for one second, and use good lighting.'}</p></aside>}
  </section>;
}
