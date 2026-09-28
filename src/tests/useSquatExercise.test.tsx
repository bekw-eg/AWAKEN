import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSquatExercise } from '../hooks/useSquatExercise';
import type { SquatFrame } from '../exercise-engine/types';
import { SquatSequence } from './fixtures/squatFrames';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
function mount() {
  return renderHook(({ frame, enabled }: { frame: SquatFrame | null; enabled: boolean }) =>
    useSquatExercise(frame?.landmarks ?? null, frame?.worldLandmarks ?? null, frame?.timestampMs ?? null, enabled, {}),
  { initialProps: { frame: null as SquatFrame | null, enabled: true }, wrapper });
}

function feed(hook: ReturnType<typeof mount>, frames: SquatFrame[]) {
  for (const frame of frames) {
    act(() => vi.advanceTimersByTime(50));
    hook.rerender({ frame, enabled: true });
  }
}

describe('useSquatExercise', () => {
  it('keeps one detector through StrictMode, fresh config objects and duplicate frames', () => {
    const hook = mount();
    const sequence = new SquatSequence();
    sequence.calibrate();
    sequence.rep();
    sequence.rep();
    feed(hook, sequence.frames);
    expect(hook.result.current.repCount).toBe(2);
    const last = sequence.frames.at(-1)!;
    hook.rerender({ frame: { ...last, landmarks: [...last.landmarks!] }, enabled: true });
    expect(hook.result.current.repCount).toBe(2);
    expect(hook.result.current.repJustCounted).toBe(false);
    act(() => hook.result.current.reset());
    expect(hook.result.current.repCount).toBe(0);
    expect(hook.result.current.formStatus).toBe('idle');
  });

  it('invalidates a frozen frame and cannot finish that old attempt', () => {
    const hook = mount();
    const sequence = new SquatSequence();
    sequence.calibrate();
    sequence.ramp(175, 85, 1000);
    sequence.hold({ knee: 85 }, 400);
    feed(hook, sequence.frames);
    expect(hook.result.current.phase).toBe('bottom');
    act(() => vi.advanceTimersByTime(450));
    expect(hook.result.current.formStatus).toBe('idle');
    const from = sequence.frames.length;
    sequence.ramp(85, 175, 1000);
    sequence.calibrate();
    feed(hook, sequence.frames.slice(from));
    expect(hook.result.current.repCount).toBe(0);
  });

  it('keeps completed reps on camera stop and removes the watchdog on unmount', () => {
    const hook = mount();
    const sequence = new SquatSequence();
    sequence.calibrate();
    sequence.rep();
    feed(hook, sequence.frames);
    hook.rerender({ frame: null, enabled: false });
    expect(hook.result.current.repCount).toBe(1);
    expect(hook.result.current.formStatus).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
    const from = sequence.frames.length;
    sequence.calibrate();
    sequence.rep();
    feed(hook, sequence.frames.slice(from));
    expect(hook.result.current.repCount).toBe(2);
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
