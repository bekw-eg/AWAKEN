import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePushUpExercise } from '../hooks/usePushUpExercise';
import type { PushUpFrame } from '../exercise-engine/pushUpTypes';
import { PushUpSequence } from './fixtures/pushUpFrames';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
function mount() {
  return renderHook(({ frame, enabled }: { frame: PushUpFrame | null; enabled: boolean }) =>
    usePushUpExercise(frame?.landmarks ?? null, frame?.worldLandmarks ?? null, frame?.timestampMs ?? null, enabled, {}),
  { initialProps: { frame: null as PushUpFrame | null, enabled: true },
    wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> });
}
function feed(hook: ReturnType<typeof mount>, frames: PushUpFrame[]) {
  for (const frame of frames) {
    act(() => vi.advanceTimersByTime(50));
    hook.rerender({ frame, enabled: true });
  }
}
describe('usePushUpExercise', () => {
  it('retains its detector through rerenders and emits one event per rep', () => {
    const hook = mount(), s = new PushUpSequence(); s.hold(); s.rep(); s.rep();
    let events = 0;
    for (const frame of s.frames) {
      feed(hook, [frame]);
      if (hook.result.current.repJustCounted) events++;
    }
    expect(events).toBe(2); expect(hook.result.current.repCount).toBe(2);
    hook.rerender({ frame: { ...s.frames.at(-1)!, landmarks: [...s.frames.at(-1)!.landmarks!] }, enabled: true });
    expect(hook.result.current.repJustCounted).toBe(false);
    act(() => hook.result.current.reset()); expect(hook.result.current.repCount).toBe(0);
  });
  it('cancels on a stalled camera and requires a new top', () => {
    const hook = mount(), s = new PushUpSequence(); s.hold(); s.ramp(175, 85); s.hold(85);
    feed(hook, s.frames); expect(hook.result.current.phase).toBe('bottom');
    act(() => vi.advanceTimersByTime(450)); expect(hook.result.current.trackingStatus).toBe('searching');
    const from = s.frames.length; s.ramp(85, 175); s.hold(); feed(hook, s.frames.slice(from));
    expect(hook.result.current.repCount).toBe(0);
    hook.unmount(); expect(vi.getTimerCount()).toBe(0);
  });
  it('preserves reps across mode switches and ignores disabled frames', () => {
    const hook = mount(), s = new PushUpSequence(); s.hold(); s.rep(); feed(hook, s.frames);
    hook.rerender({ frame: s.frames.at(-1)!, enabled: false });
    expect(hook.result.current.repCount).toBe(1); expect(hook.result.current.formStatus).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
    const from = s.frames.length; s.hold(); s.rep(); feed(hook, s.frames.slice(from));
    expect(hook.result.current.repCount).toBe(2);
  });
  it('does not extend the camera watchdog for duplicate timestamps', () => {
    const hook = mount(), s = new PushUpSequence(); s.hold(); feed(hook, s.frames);
    const last = s.frames.at(-1)!;
    act(() => vi.advanceTimersByTime(250));
    hook.rerender({ frame: { ...last, landmarks: [...last.landmarks!] }, enabled: true });
    act(() => vi.advanceTimersByTime(151));
    expect(hook.result.current.trackingStatus).toBe('searching');
  });
});
