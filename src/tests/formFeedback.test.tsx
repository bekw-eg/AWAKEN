import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CORRECT_FORM, NEUTRAL_FORM, poseColorStatus, toFormFeedback, type FormFeedback } from '../exercise-engine/formFeedback';
import { useStableFormFeedback } from '../hooks/useStableFormFeedback';
import { PoseOverlay } from '../components/PoseOverlay/PoseOverlay';
import { pushUpFrame } from './fixtures/pushUpFrames';
import type { NormalizedLandmark } from '../types/pose';

afterEach(() => { cleanup(); vi.useRealTimers(); });
const error: FormFeedback = { status: 'error', message: 'Выпрями руки', regions: ['arms'] };

it('maps actual detector errors by exercise, including the shared too_shallow code', () => {
  const result = { formStatus: 'error' as const, errorCode: 'too_shallow', feedback: 'Опустись ниже', trackingStatus: 'ready' };
  expect(toFormFeedback('push-up', result).regions).toEqual(['arms']);
  expect(toFormFeedback('squat', result).regions).toEqual(['legs']);
  expect(toFormFeedback('push-up', { ...result, errorCode: 'body_alignment' }).regions).toEqual(['torso', 'hips']);
  expect(toFormFeedback('jumping-jack', { ...result, errorCode: 'arms_too_low' }).regions).toEqual(['arms']);
  expect(toFormFeedback('jumping-jack', { ...result, errorCode: 'legs_too_narrow' }).regions).toEqual(['legs']);
  expect(toFormFeedback('squat', { ...result, errorCode: 'knees_in' }).regions).toEqual(['legs']);
});

it('colors valid form green and neutral blue; local arm errors never paint the torso or legs', () => {
  expect(poseColorStatus(CORRECT_FORM, 23, 25)).toBe('correct');
  expect(poseColorStatus(NEUTRAL_FORM, 11, 13)).toBe('neutral');
  for (const [a, b] of [[11, 13], [13, 15], [12, 14], [14, 16]]) expect(poseColorStatus(error, a, b)).toBe('error');
  for (const [a, b] of [[11, 23], [12, 24], [23, 25], [25, 27], [11, 12]]) expect(poseColorStatus(error, a, b)).toBe('neutral');
  expect(poseColorStatus(error, 15)).toBe('error');
  expect(poseColorStatus(error, 27)).toBe('neutral');
  const torso: FormFeedback = { status: 'error', regions: ['torso', 'hips'] };
  expect(poseColorStatus(torso, 11, 23)).toBe('error');
  expect(poseColorStatus(torso, 24)).toBe('error');
  expect(poseColorStatus(torso, 13, 15)).toBe('neutral');
  expect(poseColorStatus({ status: 'warning', regions: ['left_leg'] }, 23, 25)).toBe('warning');
  expect(poseColorStatus({ status: 'warning', regions: ['left_leg'] }, 24, 26)).toBe('neutral');
});

it('debounces error appearance and clearing without postponing on every pose render', () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(({ feedback, source, enabled }) => useStableFormFeedback(feedback, enabled, source),
    { initialProps: { feedback: CORRECT_FORM, source: 'squat', enabled: true } });
  expect(result.current.status).toBe('correct');
  for (let i = 0; i < 5; i++) {
    rerender({ feedback: { ...error, regions: ['arms'] }, source: 'squat', enabled: true });
    act(() => vi.advanceTimersByTime(50));
    expect(result.current.status).toBe(i === 4 ? 'error' : 'correct');
  }
  rerender({ feedback: CORRECT_FORM, source: 'squat', enabled: true });
  act(() => vi.advanceTimersByTime(199)); expect(result.current.status).toBe('error');
  act(() => vi.advanceTimersByTime(1)); expect(result.current.status).toBe('correct');
  rerender({ feedback: error, source: 'squat', enabled: true });
  act(() => vi.advanceTimersByTime(100));
  rerender({ feedback: CORRECT_FORM, source: 'squat', enabled: true });
  act(() => vi.advanceTimersByTime(500)); expect(result.current.status).toBe('correct');
  rerender({ feedback: error, source: 'squat', enabled: true }); act(() => vi.advanceTimersByTime(250));
  rerender({ feedback: NEUTRAL_FORM, source: 'push-up', enabled: true }); expect(result.current.status).toBe('neutral');
  rerender({ feedback: error, source: 'push-up', enabled: true }); act(() => vi.advanceTimersByTime(250));
  rerender({ feedback: error, source: 'push-up', enabled: false }); expect(result.current.status).toBe('neutral');
});

it('uses theme colors on the actual canvas bones and joints and clears lost poses', () => {
  const strokes: string[] = [], fills: string[] = [];
  const ctx = { clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn(),
    strokeStyle: '', fillStyle: '', shadowColor: '', shadowBlur: 0, lineWidth: 0, lineCap: '',
    stroke() { strokes.push(this.strokeStyle); }, fill() { fills.push(this.fillStyle); } };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ getPropertyValue: (name: string) => ({
    '--pose-neutral': '#58a6ff', '--pose-correct': '#22c55e', '--pose-warning': '#f59e0b', '--pose-error': '#ef4444',
  })[name] } as CSSStyleDeclaration);
  const landmarks = pushUpFrame(0).landmarks as NormalizedLandmark[];
  const view = render(<PoseOverlay landmarks={landmarks} width={640} height={480} feedback={CORRECT_FORM} />);
  expect(new Set(strokes)).toEqual(new Set(['#22c55e'])); expect(new Set(fills)).toEqual(new Set(['#22c55e']));
  strokes.length = 0; fills.length = 0;
  view.rerender(<PoseOverlay landmarks={landmarks} width={640} height={480} feedback={error} />);
  expect(new Set(strokes)).toEqual(new Set(['#ef4444', '#58a6ff']));
  expect(fills[13]).toBe('#ef4444'); expect(fills[27]).toBe('#58a6ff');
  strokes.length = 0;
  view.rerender(<PoseOverlay landmarks={null} width={640} height={480} feedback={NEUTRAL_FORM} />);
  expect(strokes).toHaveLength(0); expect(ctx.clearRect).toHaveBeenCalledTimes(3);
});
