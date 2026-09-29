import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CameraView } from '../components/Camera/CameraView';
import { usePoseDetection } from '../hooks/usePoseDetection';
import type { UsePoseDetectionResult } from '../types/pose';
import { PushUpSequence } from './fixtures/pushUpFrames';
import { SquatSequence } from './fixtures/squatFrames';
import { closedFrame, openFrame } from './fixtures/jumpingJackFrames';

vi.mock('../hooks/usePoseDetection');
vi.mock('../components/PoseOverlay/PoseOverlay', () => ({ PoseOverlay: () => null }));
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('runs push-up on existing frames without emitting game events and preserves count across modes', () => {
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
  expect(screen.getByText('1')).toBeTruthy();
  expect(onExerciseEvent).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'SQUAT' }));
  expect(screen.getByRole('heading', { name: 'SQUAT TRAINING' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'PUSH-UP' }));
  expect(screen.getByText('1')).toBeTruthy();
  expect(onExerciseEvent).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Exercise mode' }), { target: { value: 'jumping-jack' } });
  expect(screen.getByRole('heading', { name: 'JUMPING JACK' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'JUMPING JACK' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'PUSH-UP' }));
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('push-up');
  expect(screen.getByText('1')).toBeTruthy();
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
  expect(screen.getByText('1')).toBeTruthy();
  expect(onExerciseEvent).toHaveBeenCalledExactlyOnceWith({ exercise: 'squat', status: 'correct', timestamp: expect.any(Number) });
  fireEvent.click(screen.getByRole('button', { name: 'JUMPING JACK' }));
  fireEvent.click(screen.getByRole('button', { name: 'SQUAT' }));
  expect(screen.getByText('1')).toBeTruthy();
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
  expect(screen.getByText('REPS 1')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'PUSH-UP' }));
  expect(screen.getByText('0')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'JUMPING JACK' }));
  expect(screen.getByText('REPS 1')).toBeTruthy();
  expect(onExerciseEvent).not.toHaveBeenCalled();
});
