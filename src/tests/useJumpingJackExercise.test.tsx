import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useJumpingJackExercise } from '../hooks/useJumpingJackExercise';
import { closedFrame } from './fixtures/jumpingJackFrames';

describe('useJumpingJackExercise', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('initializes with paused state when disabled', () => {
    const { result } = renderHook(() =>
      useJumpingJackExercise(null, null, null, false)
    );

    expect(result.current.trackingStatus).toBe('searching');
    expect(result.current.phase).toBe('closed');
  });

  it('updates detector when frames are provided', () => {
    const { result } = renderHook(
      (props) => useJumpingJackExercise(props.landmarks, props.worldLandmarks, props.timestamp, true),
      {
        initialProps: {
          landmarks: closedFrame.landmarks,
          worldLandmarks: closedFrame.worldLandmarks,
          timestamp: 100,
        },
      }
    );

    expect(result.current.trackingStatus).toBe('ready');
    
    // Test that the maxFrameGap timer resets the detector if no new frames
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.trackingStatus).toBe('searching');
  });

  it('provides a working reset function', () => {
    const { result } = renderHook(() =>
      useJumpingJackExercise(closedFrame.landmarks, closedFrame.worldLandmarks, 100, true)
    );

    act(() => {
      result.current.reset();
    });

    expect(result.current.repCount).toBe(0);
    expect(result.current.phase).toBe('closed');
  });
});
