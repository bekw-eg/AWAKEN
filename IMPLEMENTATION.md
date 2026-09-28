# AWAKEN — Camera System

> Архив полного кода этапа 1. Актуальная реализация этапа 2 находится в исходниках
> проекта и [SQUAT_DETECTOR.md](SQUAT_DETECTOR.md). Git-инструкции этого архива исторические;
> текущий workflow описан в README.md и AGENTS.md.

Этап 1: webcam → MediaPipe Pose Landmarker → landmarks → canvas skeleton.

Реализованы камера, распознавание одной позы, скелет, состояния загрузки, ошибки,
остановка и повторный запуск. Упражнения, Error Mode и игровая логика относятся к следующим этапам.

## 1. Пакеты и установка

Нужен Node.js 22.12+ (проверено на 22.22.2) и браузер с webcam API.

Для этого готового проекта:

```bash
npm ci
npm run dev
```

Открой адрес из терминала: обычно http://127.0.0.1:5173/.
Если PowerShell блокирует `npm.ps1`, используй `npm.cmd` вместо `npm`.

Зависимости приложения: `react`, `react-dom`, `@mediapipe/tasks-vision`.
Инструменты сборки: `vite`, `typescript`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`.
Тесты: `vitest`, `jsdom`, `@testing-library/react`.
Точные версии зафиксированы в `package.json` и `package-lock.json`.

Эквивалентные команды для установки в новый проект:

```bash
npm install --save-exact react react-dom @mediapipe/tasks-vision
npm install -D --save-exact vite typescript @vitejs/plugin-react @types/react @types/react-dom vitest jsdom @testing-library/react
```

При установке `postinstall` копирует WASM из установленной версии пакета и скачивает
официальную модель Pose Landmarker Lite. Для первой установки нужен интернет.
При `dev` и `build` подготовка проверяется ещё раз; имеющаяся модель повторно не скачивается.

## 2. Структура

```text
index.html
package.json
package-lock.json
tsconfig.json
vite.config.ts
scripts/
  prepare-assets.mjs
public/mediapipe/              # создаётся автоматически, исключено из Git
  pose_landmarker_lite.task
  wasm/
src/
  main.tsx
  App.tsx
  types/pose.ts
  hooks/usePoseDetection.ts
  components/
    Camera/CameraView.tsx
    Camera/CameraView.css
    PoseOverlay/PoseOverlay.tsx
  tests/usePoseDetection.test.tsx
README.md
IMPLEMENTATION.md              # полный код файлов с путями
```



## Полный код файлов

Ниже — полный код конфигурации, приложения, подготовки assets и тестов. package-lock.json создан npm и находится рядом с package.json; бинарные assets создаются автоматически.

### .gitignore

```text
node_modules/
dist/
.npm-cache/
public/mediapipe/
*.log
coverage/
```

### package.json

```json
{
  "name": "awaken-pose",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=22.12.0" },
  "scripts": {
    "predev": "npm run prepare:assets",
    "dev": "vite --host 127.0.0.1",
    "prebuild": "npm run prepare:assets",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "vitest run",
    "prepare:assets": "node scripts/prepare-assets.mjs",
    "postinstall": "npm run prepare:assets"
  },
  "dependencies": {
    "@mediapipe/tasks-vision": "1.0.1",
    "react": "19.3.0",
    "react-dom": "19.3.0"
  },
  "devDependencies": {
    "@testing-library/react": "16.3.3",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.1.1",
    "jsdom": "30.1.1",
    "typescript": "7.0.2",
    "vite": "8.3.1",
    "vitest": "5.0.2"
  }
}
```

### index.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#090e14" />
    <meta name="description" content="AWAKEN camera system — local webcam pose tracking." />
    <title>AWAKEN · Camera System</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

### vite.config.ts

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    clearMocks: true,
    restoreMocks: true,
  },
});
```

### scripts/prepare-assets.mjs

```js
import { cp, mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Serve matching WASM and the model locally; webcam frames never leave the browser.
const root = fileURLToPath(new URL('../', import.meta.url));
const assets = join(root, 'public', 'mediapipe');
await mkdir(assets, { recursive: true });
await cp(join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'),
  join(assets, 'wasm'), { recursive: true });

const model = join(assets, 'pose_landmarker_lite.task');
const exists = await stat(model).then((file) => file.size > 1_000_000).catch(() => false);
if (!exists) {
  const url = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
  console.log('Downloading the official Pose Landmarker Lite model…');
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1_000_000) throw new Error('Model download is incomplete. Run npm run prepare:assets again.');
  await writeFile(`${model}.tmp`, bytes);
  await rename(`${model}.tmp`, model);
}
console.log('MediaPipe WASM and model ready in public/mediapipe.');
```

### src/main.tsx

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
```

### src/App.tsx

```tsx
import { CameraView } from './components/Camera/CameraView';

export default function App() {
  return <CameraView />;
}
```

### src/types/pose.ts

```ts
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export type { NormalizedLandmark };
export type CameraStatus = 'idle' | 'requesting' | 'starting' | 'active' | 'error';
export type EngineStatus = 'idle' | 'loading' | 'active' | 'error';

export type PoseState = {
  landmarks: NormalizedLandmark[] | null;
  cameraStatus: CameraStatus;
  engineStatus: EngineStatus;
  error: string | null;
  videoSize: { width: number; height: number };
};

export type UsePoseDetectionResult = PoseState & {
  isLoading: boolean;
  isPersonDetected: boolean;
};
```

### src/hooks/usePoseDetection.ts

```ts
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
```

### src/components/PoseOverlay/PoseOverlay.tsx

```tsx
import { useEffect, useRef } from 'react';
import { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '../../types/pose';

type Props = {
  landmarks: NormalizedLandmark[] | null;
  width: number;
  height: number;
  jointColor?: (index: number) => string;
  connectionColor?: (start: number, end: number) => string;
};

export function PoseOverlay({ landmarks, width, height, jointColor, connectionColor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!landmarks) return;

    const visible = (point: NormalizedLandmark | undefined): point is NormalizedLandmark =>
      !!point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
      (point.visibility ?? 1) >= 0.5;

    const scale = Math.max(width / 960, 0.6);
    ctx.lineWidth = 2.5 * scale;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#65e9ff';
    ctx.shadowBlur = 6 * scale;
    for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
      const a = landmarks[start];
      const b = landmarks[end];
      if (!visible(a) || !visible(b)) continue;
      ctx.strokeStyle = connectionColor?.(start, end) ?? '#65e9ff';
      ctx.beginPath();
      ctx.moveTo(a.x * width, a.y * height);
      ctx.lineTo(b.x * width, b.y * height);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    landmarks.forEach((point, index) => {
      if (!visible(point)) return;
      ctx.fillStyle = jointColor?.(index) ?? '#f1fdff';
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, 3.5 * scale, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [landmarks, width, height, jointColor, connectionColor]);

  return <canvas ref={canvasRef} className="pose-overlay" width={width} height={height} aria-hidden="true" />;
}
```

### src/components/Camera/CameraView.tsx

```tsx
import { useRef, useState } from 'react';
import { usePoseDetection } from '../../hooks/usePoseDetection';
import { PoseOverlay } from '../PoseOverlay/PoseOverlay';
import './CameraView.css';

export function CameraView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [enabled, setEnabled] = useState(true);
  const [restartKey, setRestartKey] = useState(0);
  const { landmarks, videoSize, cameraStatus, engineStatus, isLoading, error, isPersonDetected } =
    usePoseDetection(videoRef, enabled, restartKey);

  const active = cameraStatus === 'active' && engineStatus === 'active';
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
        <span className="chapter">SYSTEM / 01 <span>BODY INTERFACE</span></span>
      </header>
      <section className="camera-system" id="main" aria-labelledby="page-title">
        <div className="section-heading">
          <div><p className="eyebrow">REAL-WORLD INPUT · ONLINE POTENTIAL</p><h1 id="page-title">CAMERA <span>SYSTEM</span></h1></div>
          <span className="stage-tag">PHASE 01 / POSE TRACKING</span>
        </div>
        <p className="intro">Your body is the controller. Step into the frame.</p>

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
        <aside className="setup-note"><span aria-hidden="true">⌖</span><p><strong>Keep your full body in view.</strong> Step back until your feet are visible and use good lighting.</p></aside>
        <footer className="privacy"><span>LOCAL PROCESSING</span> Camera frames stay on this device. No video is uploaded or recorded.</footer>
      </section>
    </main>
  );
}
```

### src/components/Camera/CameraView.css

```css
:root { font-family: 'Cascadia Mono', Consolas, monospace; color: #dce7ee; background: #090e14; font-synthesis: none; color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; background: radial-gradient(ellipse at 60% 15%, #10212b 0, transparent 60%); }
button, a { -webkit-tap-highlight-color: transparent; }
button:focus-visible, a:focus-visible { outline: 2px solid #81edfa; outline-offset: 5px; }
.system-shell { max-width: 1250px; margin: auto; padding: 0 44px 32px; }
.topbar { height: 86px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #22313c; }
.wordmark { font: 700 30px 'Arial Narrow', sans-serif; letter-spacing: 5px; color: #eff8fb; text-decoration: none; }
.brand-mark { color: #74dfee; margin-left: 15px; font-size: 26px; }
.chapter { font-size: 10px; letter-spacing: 1.5px; color: #a9b8c4; }
.chapter span { color: #65818f; margin-left: 24px; }
.camera-system { max-width: 960px; margin: 50px auto 0; }
.section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.eyebrow { color: #77cbd8; font-size: 10px; letter-spacing: 2px; margin: 0 0 10px; }
h1 { font: 600 clamp(35px, 5vw, 52px)/1 'Arial Narrow', sans-serif; letter-spacing: 2px; margin: 0; color: #f1f7fa; }
h1 span { color: #94a7b4; }
.stage-tag { color: #9caeba; font-size: 9px; letter-spacing: 1px; padding: 8px 10px; border: 1px solid #30414e; }
.intro { font-size: 12px; color: #99aeba; margin: 16px 0 27px; line-height: 1.7; }
.camera-panel { border: 1px solid #354956; box-shadow: 0 20px 70px #0005; }
.panel-bar { display: flex; justify-content: space-between; padding: 13px 18px; font-size: 9px; letter-spacing: 1.5px; color: #8da6b6; background: #111b24; }
.panel-bar > span:first-child { display: flex; align-items: center; gap: 9px; color: #cedae2; }
.dot { display: inline-block; width: 6px; height: 6px; flex: 0 0 6px; border-radius: 50%; background: #82909b; }
.dot.active { background: #7be9da; box-shadow: 0 0 10px #7be9da55; }
.camera-stage { position: relative; overflow: hidden; background: linear-gradient(#19293544 1px, transparent 1px), linear-gradient(90deg, #19293544 1px, transparent 1px), #080d12; background-size: 48px 48px; }
.mirrored-feed { position: absolute; inset: 0; transform: scaleX(-1); }
.mirrored-feed video, .pose-overlay { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
.mirrored-feed video { object-fit: fill; }
.pose-overlay { pointer-events: none; }
.frame-corners { pointer-events: none; position: absolute; inset: 19px; border: 1px solid #8dcdd344; clip-path: polygon(0 0, 20px 0, 20px 1px, calc(100% - 20px) 1px, calc(100% - 20px) 0, 100% 0, 100% 20px, calc(100% - 1px) 20px, calc(100% - 1px) calc(100% - 20px), 100% calc(100% - 20px), 100% 100%, calc(100% - 20px) 100%, calc(100% - 20px) calc(100% - 1px), 20px calc(100% - 1px), 20px 100%, 0 100%, 0 calc(100% - 20px), 1px calc(100% - 20px), 1px 20px, 0 20px); }
.stage-message { position: absolute; inset: 0; background: #071019a6; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 22px; }
.system-symbol { font-size: 45px; color: #77d9e5; line-height: 1; }
.spinning { animation: breathe 2.2s ease-in-out infinite; }
.stage-message p { font-size: 12px; letter-spacing: 2px; margin: 18px 0 10px; }
.stage-message > span:last-child { color: #a4b7c4; font-size: 11px; line-height: 1.7; }
.camera-caption { position: absolute; left: 30px; right: 30px; bottom: 28px; display: flex; justify-content: space-between; gap: 12px; color: #d3e2eb; text-shadow: 0 1px 3px #000; font-size: 9px; letter-spacing: 1px; pointer-events: none; }
.detection-banner { display: flex; align-items: center; gap: 12px; min-height: 55px; padding: 14px 19px; background: #11232a; border-top: 1px solid #2e4f58; color: #9be5ea; font-size: 11px; letter-spacing: 1px; }
.detection-banner small { margin-left: auto; font-size: 9px; color: #9fb7bd; }
.detection-banner.error { color: #f4c6a9; background: #281f1b; border-color: #614533; }
.error-detail { padding: 14px 17px; border-left: 2px solid #dcab83; color: #f2c9b3; background: #251c18; font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }
.system-footer { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 23px; }
.system-status { display: flex; gap: 38px; margin: 0; }
.system-status dt { font-size: 9px; color: #849ba9; letter-spacing: 1px; margin-bottom: 7px; }
.system-status dd { margin: 0; font-size: 11px; text-transform: uppercase; color: #d4e6ee; }
button { border: 1px solid #47606d; padding: 13px 17px; background: #15252e; color: #d7f1f4; font: 500 10px Consolas, monospace; letter-spacing: 1px; cursor: pointer; }
button:hover { background: #203b46; border-color: #75c3d2; }
button span { margin-left: 18px; color: #84dce7; }
.setup-note { display: flex; align-items: center; gap: 16px; border-top: 1px solid #253540; margin-top: 26px; padding-top: 19px; }
.setup-note > span { color: #779da9; font-size: 26px; }
.setup-note p { margin: 0; font-size: 11px; line-height: 1.9; color: #8ea3b1; }
.setup-note strong { color: #c5d8e2; font-weight: 400; }
.privacy { font-size: 9px; color: #8a9fab; line-height: 1.8; margin: 23px 0 0; }
.privacy span { color: #8dbabf; margin-right: 14px; letter-spacing: 1px; }
@keyframes breathe { 50% { opacity: 0.35; transform: scale(0.87); } }
@media (prefers-reduced-motion: reduce) { .spinning { animation: none; } }
@media (max-width: 640px) {
  .system-shell { padding: 0 18px 25px; }
  .topbar { height: 70px; }
  .chapter span, .stage-tag { display: none; }
  .chapter { font-size: 9px; }
  .camera-system { margin-top: 32px; }
  .eyebrow { font-size: 8px; letter-spacing: 1px; }
  .stage-message p { font-size: 10px; letter-spacing: 0.5px; margin: 9px 0; }
  .stage-message > span:last-child { font-size: 10px; }
  .system-symbol { font-size: 30px; }
  .camera-caption { bottom: 12px; left: 14px; right: 14px; font-size: 7px; }
  .detection-banner { font-size: 9px; gap: 8px; padding: 12px; flex-wrap: wrap; }
  .detection-banner small { width: 100%; margin-left: 14px; font-size: 8px; }
  .system-status { gap: 20px; }
  button { font-size: 8px; padding: 12px; }
  button span { margin-left: 7px; }
}
```

### src/tests/usePoseDetection.test.tsx

```tsx
import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePoseDetection } from '../hooks/usePoseDetection';

const mocks = vi.hoisted(() => ({ resolveVision: vi.fn(), create: vi.fn() }));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: mocks.resolveVision },
  PoseLandmarker: { createFromOptions: mocks.create },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function makeStream() {
  const track = Object.assign(new EventTarget(), {
    stop: vi.fn(), readyState: 'live', muted: false,
  });
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  return { track, stream: stream as unknown as MediaStream };
}

function makeDetector() {
  return {
    close: vi.fn(),
    detectForVideo: vi.fn().mockReturnValue({ landmarks: [], close: vi.fn() }),
  };
}

let camera: ReturnType<typeof makeStream>;
let detector: ReturnType<typeof makeDetector>;
let getUserMedia: ReturnType<typeof vi.fn>;
let video: HTMLVideoElement;
let videoRef: { current: HTMLVideoElement | null };
let frames: Map<number, FrameRequestCallback>;
let frameCounter: number;

async function start() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

function tick(timestamp: number, videoTime: number) {
  video.currentTime = videoTime;
  act(() => {
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach((callback) => callback(timestamp));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('isSecureContext', true);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  camera = makeStream();
  detector = makeDetector();
  getUserMedia = vi.fn().mockResolvedValue(camera.stream);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  mocks.resolveVision.mockResolvedValue({});
  mocks.create.mockResolvedValue(detector);
  video = document.createElement('video');
  Object.defineProperties(video, {
    readyState: { configurable: true, value: 4 },
    videoWidth: { configurable: true, value: 1280 },
    videoHeight: { configurable: true, value: 720 },
    paused: { configurable: true, value: false },
  });
  vi.spyOn(video, 'play').mockResolvedValue();
  vi.spyOn(video, 'pause').mockImplementation(() => {});
  videoRef = { current: video };
  frames = new Map();
  frameCounter = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frames.set(++frameCounter, callback);
    return frameCounter;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('pose lifecycle', () => {
  it('initializes once in StrictMode and closes all owned resources on unmount', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result, unmount } = renderHook(() => usePoseDetection(videoRef), { wrapper });
    await start();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith({}, expect.objectContaining({ runningMode: 'VIDEO', numPoses: 1 }));
    expect(result.current.cameraStatus).toBe('active');
    expect(result.current.engineStatus).toBe('active');
    expect(frames.size).toBe(1);
    unmount();
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
    expect(detector.close).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    expect(video.srcObject).toBeNull();
  });

  it('stops a camera grant that resolves after unmount', async () => {
    const pending = deferred<MediaStream>();
    getUserMedia.mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => usePoseDetection(videoRef));
    await start();
    unmount();
    await act(async () => { pending.resolve(camera.stream); });
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it('closes a landmarker that finishes loading after unmount', async () => {
    const pending = deferred<typeof detector>();
    mocks.create.mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => usePoseDetection(videoRef));
    await start();
    unmount();
    await act(async () => { pending.resolve(detector); });
    expect(detector.close).toHaveBeenCalledTimes(1);
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it('serializes retry behind pending initialization and closes the stale model first', async () => {
    const pending = deferred<typeof detector>();
    const next = makeDetector();
    mocks.create.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(next);
    const { rerender } = renderHook(({ retry }) => usePoseDetection(videoRef, true, retry), { initialProps: { retry: 0 } });
    await start();
    rerender({ retry: 1 });
    await start();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(detector); });
    expect(detector.close).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(detector.close.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[1]);
    expect(frames.size).toBe(1);
  });

  it('processes only new frames, throttles inference, and clears a missing person', async () => {
    const release = vi.fn();
    const point = { x: 0.5, y: 0.3, z: 0, visibility: 1 };
    detector.detectForVideo.mockReturnValueOnce({ landmarks: [[point]], close: release });
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    tick(100, 1);
    expect(result.current.isPersonDetected).toBe(true);
    expect(result.current.landmarks?.[0]).not.toBe(point);
    expect(release).toHaveBeenCalledTimes(1);
    tick(160, 1); // Same video frame, despite elapsed time.
    tick(170, 2);
    tick(180, 3); // New frame, but too soon for 20 Hz limit.
    expect(detector.detectForVideo).toHaveBeenCalledTimes(2);
    expect(result.current.isPersonDetected).toBe(false);
    expect(result.current.landmarks).toBeNull();
    expect(frames.size).toBe(1);
  });

  it.each([
    ['NotAllowedError', 'CAMERA ACCESS REQUIRED'],
    ['NotFoundError', 'NO CAMERA FOUND'],
    ['NotReadableError', 'CAMERA UNAVAILABLE'],
  ])('handles %s without starting the engine', async (name, message) => {
    getUserMedia.mockRejectedValue(new DOMException('Camera failed', name));
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    expect(result.current.error).toContain(message);
    expect(result.current.isLoading).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it('explains missing mediaDevices without crashing', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    expect(result.current.error).toContain('HTTPS or localhost');
    expect(result.current.isLoading).toBe(false);
  });

  it('waits for a real video frame before loading the model', async () => {
    Object.defineProperty(video, 'readyState', { configurable: true, value: 0 });
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(result.current.cameraStatus).toBe('starting');
    await act(async () => {
      Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
      video.dispatchEvent(new Event('loadeddata'));
    });
    expect(result.current.engineStatus).toBe('active');
  });

  it('stops the camera when model loading fails', async () => {
    mocks.create.mockRejectedValue(new Error('Missing model'));
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    expect(result.current.error).toContain('POSE ENGINE COULD NOT LOAD');
    expect(result.current.cameraStatus).toBe('idle');
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it('times out a stalled video and stops its stream', async () => {
    Object.defineProperty(video, 'readyState', { configurable: true, value: 0 });
    vi.mocked(video.play).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(result.current.cameraStatus).toBe('error');
    expect(result.current.isLoading).toBe(false);
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('aborts waiting for video data on unmount', async () => {
    Object.defineProperty(video, 'readyState', { configurable: true, value: 0 });
    const { unmount } = renderHook(() => usePoseDetection(videoRef));
    await start();
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears stale landmarks and pauses inference while hidden or muted', async () => {
    detector.detectForVideo.mockReturnValue({
      landmarks: [[{ x: 0.5, y: 0.5, z: 0, visibility: 1 }]], close: vi.fn(),
    });
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    tick(100, 1);
    expect(result.current.isPersonDetected).toBe(true);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    tick(200, 2);
    expect(result.current.landmarks).toBeNull();
    expect(detector.detectForVideo).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    tick(300, 3);
    expect(result.current.isPersonDetected).toBe(true);
    camera.track.muted = true;
    act(() => { camera.track.dispatchEvent(new Event('mute')); });
    tick(400, 4);
    expect(result.current.landmarks).toBeNull();
    expect(result.current.cameraStatus).toBe('starting');
    expect(detector.detectForVideo).toHaveBeenCalledTimes(2);
    camera.track.muted = false;
    act(() => { camera.track.dispatchEvent(new Event('unmute')); });
    tick(500, 5);
    expect(result.current.cameraStatus).toBe('active');
    expect(result.current.isPersonDetected).toBe(true);
  });

  it('stops detection and the camera on an inference error', async () => {
    detector.detectForVideo.mockImplementation(() => { throw new Error('Inference failed'); });
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    tick(100, 1);
    expect(result.current.error).toContain('POSE DETECTION STOPPED');
    expect(detector.close).toHaveBeenCalledTimes(1);
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it('cleans up on camera disconnection', async () => {
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    act(() => { camera.track.dispatchEvent(new Event('ended')); });
    expect(result.current.error).toContain('CAMERA DISCONNECTED');
    expect(detector.close).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it('releases resources on pagehide and does not close twice on unmount', async () => {
    const { result, unmount } = renderHook(() => usePoseDetection(videoRef));
    await start();
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(result.current.cameraStatus).toBe('idle');
    expect(frames.size).toBe(0);
    unmount();
    expect(detector.close).toHaveBeenCalledTimes(1);
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
  });

  it('stops and restarts with one loop when enabled changes', async () => {
    const { result, rerender } = renderHook(({ enabled }) => usePoseDetection(videoRef, enabled), { initialProps: { enabled: true } });
    await start();
    rerender({ enabled: false });
    expect(result.current.cameraStatus).toBe('idle');
    expect(frames.size).toBe(0);
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
    expect(detector.close).toHaveBeenCalledTimes(1);
    const freshCamera = makeStream();
    const freshDetector = makeDetector();
    getUserMedia.mockResolvedValue(freshCamera.stream);
    mocks.create.mockResolvedValue(freshDetector);
    rerender({ enabled: true });
    await start();
    expect(frames.size).toBe(1);
    expect(result.current.engineStatus).toBe('active');
  });
});
```

## 3. Как работает

`usePoseDetection(videoRef, enabled, restartKey)` владеет камерой, моделью и detection loop.
Возвращает `landmarks`, `isLoading`, `error`, `isPersonDetected`, состояния камеры/движка
и фактический размер видео. Координаты landmarks остаются исходными, без зеркального преобразования.

- Камера: ideal 1280×720, `facingMode: user`, без аудио.
- Модель: `VIDEO`, `numPoses: 1`, CPU delegate, Lite; segmentation masks отключены.
- Вычисления ограничены 20 запусками в секунду, один запуск на новый `video.currentTime`.
  Это верхняя граница, не обещание 20 FPS на любом компьютере.
- Единственный `requestAnimationFrame` назначается после синхронного `detectForVideo`.
- Во время скрытой вкладки вычисления пропускаются, старые landmarks очищаются.
- На каждый результат вызывается `close()`. Landmarks копируются до освобождения результата.
- В StrictMode первый отложенный запуск отменяется cleanup. Retry ждёт предыдущую
  незавершённую инициализацию; устаревшие результаты закрываются до нового запуска.
- Cleanup отменяет таймер и RAF, удаляет listeners, прерывает ожидание видео,
  останавливает tracks, очищает `srcObject` и закрывает модель. `pagehide` также освобождает ресурсы.
- `getUserMedia` и создание модели не имеют API отмены. Если они завершаются после cleanup,
  полученный stream немедленно останавливается, модель немедленно закрывается.
- Если видео не готово за 15 секунд, камера останавливается с сообщением об ошибке.

`PoseOverlay` рисует стандартные `POSE_CONNECTIONS` и точки с visibility ≥ 0.5.
Видео и canvas находятся в общем зеркальном контейнере; bitmap canvas имеет реальные
`videoWidth`/`videoHeight`, а контейнер сохраняет их aspect ratio. Это исключает разные
зеркальные преобразования и обрезку изображения в двух слоях.

Цвета отдельных элементов можно изменить через `jointColor(index)` и
`connectionColor(start, end)`. Здесь это только расширяемый интерфейс отрисовки.

Все модели, WASM, JavaScript и стили обслуживаются с адреса приложения.
Видео, кадры и landmarks не отправляются в сеть и не сохраняются.

## 4. Как проверить MediaPipe

1. Открой страницу и разреши доступ к камере.
2. Дождись `Camera: active` и `Pose Engine: active`.
3. Встань перед камерой при хорошем освещении, целиком в кадре.
4. Должны появиться `POSE DETECTED`, cyan-соединения и белые точки.
5. Подвигай руками и ногами: линии должны следовать за телом без смещения относительно видео.
6. Выйди из кадра: canvas должен очиститься, статус смениться на `SEARCHING FOR USER…`.
7. Нажми `STOP CAMERA`: изображение и скелет исчезают, индикатор камеры браузера выключается.
8. Нажми `START CAMERA`: должен появиться один поток и один движущийся скелет.
9. Повтори stop/start несколько раз; закрой страницу и проверь индикатор камеры.
10. Проверь отказ в доступе, отключённую webcam и изменение размера окна.

В DevTools → Network модель `.task` и выбранные `.wasm`/`.js` файлы должны возвращаться
с кодом 200. В Console не должно быть необработанных ошибок. Повторяющихся запросов
модели в каждом кадре быть не должно.

Проверка production:

```bash
npm test
npm run build
npm run preview
```

`dist/` содержит приложение, модель и WASM. Для публикации необходим HTTPS.
HTTP localhost/127.0.0.1 подходит для локальной разработки; обычный HTTP по LAN IP
может не предоставлять доступ к webcam.

### Выполненные проверки

- TypeScript и production build проходят.
- 18 unit-тестов проходят: StrictMode, поздние camera/model promises, retry,
  throttle и новые кадры, пропадание человека, ошибки камеры/модели/inference,
  ожидание видео, mute/hidden, pagehide, stop/start и cleanup.
- Проверено наличие модели и WASM в production output.
- Тесты используют подмены browser/MediaPipe API. Они проверяют lifecycle, а не точность модели.
- Проверка в браузере с настоящей камерой остаётся ручной: инструмент браузера
  сообщил об отказе в разрешении открыть локальную страницу.

## 5. Возможные ошибки

| Сообщение | Что проверить |
|---|---|
| `CAMERA ACCESS REQUIRED` | Разрешение на камеру в настройках сайта и ОС; затем Retry. |
| `NO CAMERA FOUND` | Подключение webcam и её наличие в системе. |
| `CAMERA UNAVAILABLE` | Камера занята другим приложением или недоступна ОС. |
| `CAMERA NOT SUPPORTED` | HTTPS/localhost и поддержка `mediaDevices.getUserMedia`. |
| `CAMERA DISCONNECTED` | Подключить камеру и нажать Retry. |
| `CAMERA COULD NOT START` | Нет кадров, проблема воспроизведения или разрешений. |
| `POSE ENGINE COULD NOT LOAD` | Выполнить `npm run prepare:assets`, проверить Network, обновить браузер. |
| `POSE DETECTION STOPPED` | Перезапустить движок кнопкой Retry; проверить Console и браузер. |
| `SEARCHING FOR USER…` | Улучшить свет, показать всё тело, убрать препятствия перед камерой. |

Если установка модели не удалась из-за сети, после восстановления доступа выполни:

```bash
npm run prepare:assets
```

Для более слабого компьютера можно снизить `FRAME_INTERVAL`-частоту, увеличив интервал
в hook. `detectForVideo` синхронный и работает на основном потоке; Web Worker остаётся
вариантом дальнейшей оптимизации после измерений на целевых устройствах.

## 6. Git-инструкции

В текущей папке исходно не было `.git`. Коммиты и push автоматически не выполнялись.

Если работаешь в существующем клоне с настроенным `origin` и веткой `main`, перед работой:

```bash
git checkout main
git pull
git checkout -b feature/pose-detection
```

После реализации:

```bash
git add .
git commit -m "feat: integrate webcam pose detection"
git push -u origin feature/pose-detection
```

Для этой новой папки сначала можно выполнить `git init -b main`, затем
`git checkout -b feature/pose-detection`. Перед push добавь свой remote:
`git remote add origin <URL_РЕПОЗИТОРИЯ>`. Это подходит для нового пустого remote;
если remote уже содержит историю, сначала клонируй его и перенеси файлы проекта.

Альтернатива — три отдельных коммита:

1. `chore: scaffold React TypeScript Vite app` — конфигурация, зависимости, entry points.
2. `feat: add webcam pose tracking and skeleton overlay` — hook, assets, типы, камера и overlay.
3. `test: cover pose lifecycle and document setup` — тесты и документация.

## Официальные источники

- [MediaPipe Pose Landmarker для Web](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
- [Vite — Getting Started](https://vite.dev/guide/)

Следующий этап сможет использовать `landmarks` как вход Exercise Engine.
