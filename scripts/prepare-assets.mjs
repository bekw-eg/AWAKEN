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
