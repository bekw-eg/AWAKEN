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
    const worldPoint = { x: 0.1, y: 0.2, z: -0.3, visibility: 1 };
    detector.detectForVideo.mockReturnValueOnce({ landmarks: [[point]], worldLandmarks: [[worldPoint]], close: release });
    const { result } = renderHook(() => usePoseDetection(videoRef));
    await start();
    tick(100, 1);
    expect(result.current.isPersonDetected).toBe(true);
    expect(result.current.landmarks?.[0]).not.toBe(point);
    expect(result.current.worldLandmarks?.[0]).toEqual(worldPoint);
    expect(result.current.worldLandmarks?.[0]).not.toBe(worldPoint);
    expect(result.current.poseTimestampMs).toBe(100);
    expect(release).toHaveBeenCalledTimes(1);
    tick(160, 1); // Same video frame, despite elapsed time.
    tick(170, 2);
    tick(180, 3); // New frame, but too soon for 20 Hz limit.
    expect(detector.detectForVideo).toHaveBeenCalledTimes(2);
    expect(result.current.isPersonDetected).toBe(false);
    expect(result.current.landmarks).toBeNull();
    expect(result.current.worldLandmarks).toBeNull();
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

  it('still reports inference failure and releases the camera if WASM teardown throws', async () => {
    detector.detectForVideo.mockImplementation(() => { throw new Error('WASM failure'); });
    detector.close.mockImplementation(() => { throw new Error('WASM already failed'); });
    const { result, unmount } = renderHook(() => usePoseDetection(videoRef));
    await start();
    expect(() => tick(100, 1)).not.toThrow();
    expect(result.current.error).toContain('POSE DETECTION STOPPED');
    expect(camera.track.stop).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    expect(() => unmount()).not.toThrow();
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
