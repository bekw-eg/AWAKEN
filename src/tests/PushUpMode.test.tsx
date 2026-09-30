import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CameraView } from '../components/Camera/CameraView';
import { usePoseDetection } from '../hooks/usePoseDetection';
import type { UsePoseDetectionResult } from '../types/pose';
import { PushUpSequence } from './fixtures/pushUpFrames';
import { SquatSequence } from './fixtures/squatFrames';
import { closedFrame, openFrame } from './fixtures/jumpingJackFrames';
import { BattleOverlay } from '../components/BattleScreen/BattleOverlay';
import type { BattleOverlayState } from '../game/battleOverlay';

vi.mock('../hooks/usePoseDetection');
vi.mock('../components/PoseOverlay/PoseOverlay', () => ({ PoseOverlay: () => null }));
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('keeps the video and pose feed mounted across announcements and renders unmirrored form hints', () => {
  const pose: UsePoseDetectionResult = {
    landmarks: closedFrame.landmarks as UsePoseDetectionResult['landmarks'],
    worldLandmarks: closedFrame.worldLandmarks as UsePoseDetectionResult['worldLandmarks'],
    poseTimestampMs: 10, cameraStatus: 'active', engineStatus: 'active', videoSize: { width: 1280, height: 720 },
    error: null, isLoading: false, isPersonDetected: true,
  };
  vi.mocked(usePoseDetection).mockReturnValue(pose);
  const onPoseFrame = vi.fn(), onExerciseEvent = vi.fn();
  const element = (announcement: BattleOverlayState | null) => <CameraView onExerciseEvent={onExerciseEvent}
    onPoseFrame={onPoseFrame} mirrored formFeedback={{ status: 'error', regions: ['arms'], message: 'Выпрями руки' }}>
    <BattleOverlay announcement={announcement} />
  </CameraView>;
  const view = render(element({ type: 'countdown', text: '3' }));
  const video = screen.getByLabelText('Live webcam');
  const cameraRef = vi.mocked(usePoseDetection).mock.lastCall![0];
  for (const text of ['2', '1', 'PUSH-UPS!']) {
    view.rerender(element({ type: text === 'PUSH-UPS!' ? 'exercise' : 'countdown', text }));
    expect(screen.getByLabelText('Live webcam')).toBe(video);
    expect(vi.mocked(usePoseDetection).mock.lastCall).toEqual([cameraRef, true, 0]);
  }
  expect(onPoseFrame).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(250));
  const hint = screen.getByText('Выпрями руки');
  expect(hint.closest('.mirrored-feed')).toBeNull();
  view.rerender(element(null));
  expect(screen.queryByTestId('battle-overlay')).toBeNull();
  expect(screen.getByLabelText('Live webcam')).toBe(video);
  expect(onExerciseEvent).not.toHaveBeenCalled();
});
it('emits one push-up game event on real frames and preserves count across modes without replay', () => {
  const pose: UsePoseDetectionResult = {
    landmarks: null, worldLandmarks: null, poseTimestampMs: null, cameraStatus: 'active', engineStatus: 'active',
    videoSize: { width: 1280, height: 720 }, error: null, isLoading: false, isPersonDetected: true,
  };
  vi.mocked(usePoseDetection).mockReturnValue(pose);
  const onExerciseEvent = vi.fn();
  const view = render(<CameraView onExerciseEvent={onExerciseEvent} />);
  fireEvent.click(screen.getByRole('button', { name: 'PUSH-UP' }));
  const s = new PushUpSequence(); s.hold(); s.rep();
  for (const frame of s.frames) {
    vi.mocked(usePoseDetection).mockReturnValue({ ...pose,
      landmarks: frame.landmarks as UsePoseDetectionResult['landmarks'],
      worldLandmarks: frame.worldLandmarks as UsePoseDetectionResult['worldLandmarks'], poseTimestampMs: frame.timestampMs });
    act(() => vi.advanceTimersByTime(50));
    view.rerender(<CameraView onExerciseEvent={onExerciseEvent} />);
  }
  expect(document.querySelector('.rep-value .animated-number')?.getAttribute('aria-label')).toBe('1');
  expect(onExerciseEvent).toHaveBeenCalledExactlyOnceWith({ exercise: 'push-up', status: 'correct', timestamp: expect.any(Number) });
  fireEvent.click(screen.getByRole('button', { name: 'SQUAT' }));
  expect(screen.getByRole('heading', { name: 'SQUAT TRAINING' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'PUSH-UP' }));
  expect(document.querySelector('.rep-value .animated-number')?.getAttribute('aria-label')).toBe('1');
  expect(onExerciseEvent).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'JUMPING JACK' }));
  expect(screen.getByRole('heading', { name: 'JUMPING JACK' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'JUMPING JACK' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'PUSH-UP' }));
  expect(screen.getByRole('button', { name: 'PUSH-UP' }).getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelector('.rep-value .animated-number')?.getAttribute('aria-label')).toBe('1');
});

it('keeps squat game events connected after combining exercise modes', () => {
  const pose: UsePoseDetectionResult = {
    landmarks: null, worldLandmarks: null, poseTimestampMs: null, cameraStatus: 'active', engineStatus: 'active',
    videoSize: { width: 1280, height: 720 }, error: null, isLoading: false, isPersonDetected: true,
  };
  vi.mocked(usePoseDetection).mockReturnValue(pose);
  const onExerciseEvent = vi.fn();
  const view = render(<CameraView onExerciseEvent={onExerciseEvent} />);
  const sequence = new SquatSequence(); sequence.calibrate(); sequence.rep();
  for (const frame of sequence.frames) {
    vi.mocked(usePoseDetection).mockReturnValue({ ...pose,
      landmarks: frame.landmarks as UsePoseDetectionResult['landmarks'],
      worldLandmarks: frame.worldLandmarks as UsePoseDetectionResult['worldLandmarks'], poseTimestampMs: frame.timestampMs });
    act(() => vi.advanceTimersByTime(50));
    view.rerender(<CameraView onExerciseEvent={onExerciseEvent} />);
  }
  expect(document.querySelector('.rep-value .animated-number')?.getAttribute('aria-label')).toBe('1');
  expect(onExerciseEvent).toHaveBeenCalledExactlyOnceWith({ exercise: 'squat', status: 'correct', timestamp: expect.any(Number) });
  fireEvent.click(screen.getByRole('button', { name: 'JUMPING JACK' }));
  fireEvent.click(screen.getByRole('button', { name: 'SQUAT' }));
  expect(document.querySelector('.rep-value .animated-number')?.getAttribute('aria-label')).toBe('1');
  expect(onExerciseEvent).toHaveBeenCalledTimes(1);
});

it('counts jumping jacks and keeps their counter when switching to other modes', () => {
  const pose: UsePoseDetectionResult = {
    landmarks: null, worldLandmarks: null, poseTimestampMs: null, cameraStatus: 'active', engineStatus: 'active',
    videoSize: { width: 1280, height: 720 }, error: null, isLoading: false, isPersonDetected: true,
  };
  vi.mocked(usePoseDetection).mockReturnValue(pose);
  const onExerciseEvent = vi.fn();
  const view = render(<CameraView onExerciseEvent={onExerciseEvent} />);
  fireEvent.click(screen.getByRole('button', { name: 'JUMPING JACK' }));
  let timestamp = 0;
  for (const frame of [closedFrame, openFrame, closedFrame]) {
    for (let i = 0; i < 12; i++) {
      timestamp += 50;
      vi.mocked(usePoseDetection).mockReturnValue({ ...pose,
        landmarks: frame.landmarks as UsePoseDetectionResult['landmarks'],
        worldLandmarks: frame.worldLandmarks as UsePoseDetectionResult['worldLandmarks'], poseTimestampMs: timestamp });
      act(() => vi.advanceTimersByTime(50));
      view.rerender(<CameraView onExerciseEvent={onExerciseEvent} />);
    }
  }
  expect(document.querySelector('.rep-value .animated-number')?.getAttribute('aria-label')).toBe('1');
  fireEvent.click(screen.getByRole('button', { name: 'PUSH-UP' }));
  expect(screen.getByText('0')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'JUMPING JACK' }));
  expect(document.querySelector('.rep-value .animated-number')?.getAttribute('aria-label')).toBe('1');
  expect(onExerciseEvent).toHaveBeenCalledExactlyOnceWith({ exercise: 'jumping-jack', status: 'correct', timestamp: expect.any(Number) });
});

it('routes raw camera frames exclusively to battle orchestration, including video aspect and tracking loss', () => {
  const pose: UsePoseDetectionResult = {
    landmarks: null, worldLandmarks: null, poseTimestampMs: null, cameraStatus: 'active', engineStatus: 'active',
    videoSize: { width: 1280, height: 720 }, error: null, isLoading: false, isPersonDetected: true,
  };
  const onExerciseEvent = vi.fn(), onPoseFrame = vi.fn();
  vi.mocked(usePoseDetection).mockReturnValue(pose);
  const element = () => <CameraView onExerciseEvent={onExerciseEvent} onPoseFrame={onPoseFrame}
    hideSelector trackingPanel={<p>Hands-free instructions</p>} />;
  const view = render(element());
  const sequence = new SquatSequence(); sequence.calibrate(); sequence.rep();
  for (const frame of sequence.frames) {
    vi.mocked(usePoseDetection).mockReturnValue({ ...pose,
      landmarks: frame.landmarks as UsePoseDetectionResult['landmarks'],
      worldLandmarks: frame.worldLandmarks as UsePoseDetectionResult['worldLandmarks'], poseTimestampMs: frame.timestampMs });
    view.rerender(element());
  }
  expect(onPoseFrame).toHaveBeenLastCalledWith({ ...sequence.frames.at(-1), imageAspectRatio: 1280 / 720 });
  expect(onExerciseEvent).not.toHaveBeenCalled();
  expect(screen.getByText('Hands-free instructions')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'SQUAT' })).toBeNull();
  vi.mocked(usePoseDetection).mockReturnValue({ ...pose, cameraStatus: 'idle' });
  view.rerender(element());
  expect(onPoseFrame.mock.lastCall?.[0].landmarks).toBeNull();
});
