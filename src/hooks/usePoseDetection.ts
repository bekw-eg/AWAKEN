import { useEffect, useRef, useState, type RefObject } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PoseState, UsePoseDetectionResult } from '../types/pose';

const INITIAL: PoseState = {
  landmarks: null,
  cameraStatus: 'idle',
  engineStatus: 'idle',
  error: null,
  videoSize: { width: 1280, height: 720 },
};
const FRAME_INTERVAL = 1000 / 20;

function cameraMessage(error: unknown): string {
  // DOMException can come from a different realm and need not pass instanceof Error.
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'CAMERA ACCESS REQUIRED. Allow camera access in your browser settings, then retry.';
  }
  if (name === 'NotFoundError') return 'NO CAMERA FOUND. Connect a webcam, then retry.';
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'CAMERA UNAVAILABLE. Close other apps using your webcam, then retry.';
  }
  return 'CAMERA COULD NOT START. Check your camera connection and browser permissions, then retry.';
}

// Waiting for loaded data is abortable, unlike getUserMedia and model creation.
function waitForVideo(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
    };
    const ready = () => {
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      cleanup();
      resolve();
    };
    const failed = () => { cleanup(); reject(new Error('Video could not load.')); };
    const aborted = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    timeout = setTimeout(failed, 15_000);
    video.addEventListener('loadeddata', ready);
    video.addEventListener('error', failed);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
    else ready();
  });
}

export function usePoseDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled = true,
  restartKey = 0,
): UsePoseDetectionResult {
  const [state, setState] = useState<PoseState>(INITIAL);
  // A retry waits for a previous pending setup to dispose its late resources.
  const setupTail = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!enabled) {
      setState(INITIAL);
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let detector: PoseLandmarker | null = null;
    let frameId: number | null = null;
    let lastVideoTime = -1;
    let lastDetectionAt = -Infinity;
    let stage: 'camera' | 'engine' = 'camera';
    let removeTrackListeners = () => {};
    const abortController = new AbortController();

    const dispose = () => {
      cancelled = true;
      abortController.abort();
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      removeTrackListeners();
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        if (video.srcObject === stream) {
          video.pause();
          video.srcObject = null;
        }
        stream = null;
      }
      const current = detector;
      detector = null;
      current?.close();
    };

    const fail = (message: string, failedStage: 'camera' | 'engine') => {
      if (cancelled) return;
      dispose();
      setState((previous) => ({
        ...previous,
        landmarks: null,
        cameraStatus: failedStage === 'camera' ? 'error' : 'idle',
        engineStatus: failedStage === 'engine' ? 'error' : 'idle',
        error: message,
      }));
    };

    const onPageHide = () => { dispose(); setState(INITIAL); };
    const onVisibilityChange = () => {
      if (document.hidden && !cancelled) {
        setState((previous) => ({ ...previous, landmarks: null }));
      }
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    setState({ ...INITIAL, cameraStatus: 'requesting' });

    const detect = (timestamp: number) => {
      if (cancelled || !detector) return;
      if (!document.hidden && !stream?.getVideoTracks().some((track) => track.muted) &&
          !video.paused && video.readyState >= 2 &&
          video.videoWidth > 0 && video.videoHeight > 0 &&
          video.currentTime !== lastVideoTime && timestamp - lastDetectionAt >= FRAME_INTERVAL) {
        lastVideoTime = video.currentTime;
        lastDetectionAt = timestamp;
        try {
          // Synchronous call: schedule the next RAF only after it finishes.
          const result = detector.detectForVideo(video, timestamp);
          try {
            const landmarks = result.landmarks[0]?.map((point) => ({ ...point })) ?? null;
            setState((previous) => ({
              ...previous,
              landmarks: landmarks?.length ? landmarks : null,
              videoSize: { width: video.videoWidth, height: video.videoHeight },
            }));
          } finally {
            result.close();
          }
        } catch {
          fail('POSE DETECTION STOPPED. Your browser could not process the camera frame. Retry to restart the engine.', 'engine');
          return;
        }
      }
      if (!cancelled) frameId = requestAnimationFrame(detect);
    };

    const initialize = async () => {
      if (cancelled) return;
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          fail('CAMERA NOT SUPPORTED. Open this page on HTTPS or localhost in a browser with webcam support.', 'camera');
          return;
        }
        const acquired = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          acquired.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = acquired;
        const tracks = acquired.getVideoTracks();
        const ended = () => fail('CAMERA DISCONNECTED. Reconnect your webcam, then retry.', 'camera');
        const muted = () => {
          if (!cancelled) setState((previous) => ({ ...previous, landmarks: null, cameraStatus: 'starting' }));
        };
        const unmuted = () => {
          if (!cancelled) setState((previous) => ({ ...previous, cameraStatus: 'active' }));
        };
        for (const track of tracks) {
          track.addEventListener('ended', ended);
          track.addEventListener('mute', muted);
          track.addEventListener('unmute', unmuted);
        }
        removeTrackListeners = () => {
          for (const track of tracks) {
            track.removeEventListener('ended', ended);
            track.removeEventListener('mute', muted);
            track.removeEventListener('unmute', unmuted);
          }
        };
        if (!tracks.length || tracks.some((track) => track.readyState === 'ended')) {
          ended();
          return;
        }
        video.srcObject = stream;
        setState((previous) => ({ ...previous, cameraStatus: 'starting' }));
        await Promise.all([video.play(), waitForVideo(video, abortController.signal)]);
        if (cancelled) return;
        stage = 'engine';
        setState((previous) => ({
          ...previous,
          cameraStatus: 'active',
          engineStatus: 'loading',
          videoSize: { width: video.videoWidth, height: video.videoHeight },
        }));
        const base = `${import.meta.env.BASE_URL}mediapipe`;
        const vision = await FilesetResolver.forVisionTasks(`${base}/wasm`);
        if (cancelled) return;
        const created = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: `${base}/pose_landmarker_lite.task`, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          outputSegmentationMasks: false,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        if (cancelled) { created.close(); return; }
        detector = created;
        setState((previous) => ({ ...previous, engineStatus: 'active' }));
        frameId = requestAnimationFrame(detect);
      } catch (error) {
        fail(stage === 'camera' ? cameraMessage(error)
          : 'POSE ENGINE COULD NOT LOAD. Reload the page and retry. If the problem persists, use an up-to-date browser and check that tracking assets are available.', stage);
      }
    };

    // StrictMode's immediate setup → cleanup → setup cancels the first timer.
    const startTimer = setTimeout(() => {
      setupTail.current = setupTail.current.then(initialize, initialize);
    }, 0);

    return () => {
      clearTimeout(startTimer);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      dispose();
    };
  }, [videoRef, enabled, restartKey]);

  return {
    ...state,
    isLoading: state.cameraStatus === 'requesting' || state.cameraStatus === 'starting' || state.engineStatus === 'loading',
    isPersonDetected: !!state.landmarks?.length,
  };
}
