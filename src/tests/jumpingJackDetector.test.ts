import { describe, it, expect, beforeEach } from 'vitest';
import { JumpingJackDetector } from '../exercise-engine/jumpingJackDetector';
import {
  closedFrame,
  openFrame,
  narrowLegsFrame,
  lowArmsFrame,
  incompleteReturnFrame,
  invisibleFrame,
} from './fixtures/jumpingJackFrames';

describe('JumpingJackDetector', () => {
  let detector: JumpingJackDetector;

  beforeEach(() => {
    detector = new JumpingJackDetector({
      transitionHoldMs: 100,
      openHoldMs: 100,
      closedHoldMs: 100,
      formErrorHoldMs: 200,
      repCooldownMs: 500,
    });
  });

  const updateWithHold = (frame: any, startTime: number, holdTime: number) => {
    let lastResult;
    for (let t = startTime; t <= startTime + holdTime; t += 50) {
      lastResult = detector.update({
        ...frame,
        timestampMs: t,
      });
    }
    return lastResult!;
  };

  it('CLOSED -> OPEN -> CLOSED = 1 rep', () => {
    updateWithHold(closedFrame, 0, 200);
    updateWithHold(openFrame, 300, 50);
    updateWithHold(openFrame, 400, 150);
    updateWithHold(closedFrame, 600, 50);
    let result = updateWithHold(closedFrame, 700, 200);

    expect(result.phase).toBe('closed');
    expect(result.repCount).toBe(1);
    expect(result.formStatus).toBe('good');
  });

  it('OPEN hold не создаёт несколько reps', () => {
    updateWithHold(closedFrame, 0, 200);
    updateWithHold(openFrame, 300, 50);
    let result = updateWithHold(openFrame, 400, 1000); // long hold
    
    expect(result.phase).toBe('open');
    expect(result.repCount).toBe(0);
  });

  it('руки недостаточно высоко -> rep не засчитан', () => {
    updateWithHold(closedFrame, 0, 200);
    
    // Low arms frame for a long time
    let result = updateWithHold(lowArmsFrame, 300, 500);
    expect(result.phase).toBe('opening');
    expect(result.formStatus).toBe('error');
    expect(result.errorCode).toBe('arms_too_low');
    expect(result.repCount).toBe(0);
  });

  it('ноги недостаточно широко -> rep не засчитан', () => {
    updateWithHold(closedFrame, 0, 200);
    
    // Narrow legs frame
    let result = updateWithHold(narrowLegsFrame, 300, 500);
    expect(result.phase).toBe('opening');
    expect(result.formStatus).toBe('error');
    expect(result.errorCode).toBe('legs_too_narrow');
    expect(result.repCount).toBe(0);
  });

  it('incomplete return -> rep не засчитан', () => {
    updateWithHold(closedFrame, 0, 200);
    updateWithHold(openFrame, 300, 200); // successfully open
    
    // Incomplete return
    let result = updateWithHold(incompleteReturnFrame, 600, 500);
    
    expect(result.phase).toBe('closing');
    expect(result.formStatus).toBe('error');
    expect(result.errorCode).toBe('incomplete_return');
    expect(result.repCount).toBe(0);
  });

  it('tracking loss отменяет attempt', () => {
    updateWithHold(closedFrame, 0, 200);
    let result = updateWithHold(openFrame, 300, 200);
    expect(result.phase).toBe('open');

    // Invisible frame
    result = detector.update({ ...invisibleFrame, timestampMs: 600 });
    expect(result.trackingStatus).toBe('unreliable');
    
    // Return to visible but wait maxFrameGap
    result = detector.update({ ...closedFrame, timestampMs: 2000 });
    expect(result.phase).toBe('closed'); // reset attempt
    expect(result.repCount).toBe(0);
  });

  it('duplicate timestamp не создаёт rep', () => {
    let result1 = detector.update({ ...closedFrame, timestampMs: 100 });
    let result2 = detector.update({ ...closedFrame, timestampMs: 100 });
    
    expect(result1).toEqual(result2); // Exact same reference/values
  });

  it('cooldown защищает от duplicate rep', () => {
    detector = new JumpingJackDetector({ 
        transitionHoldMs: 100, openHoldMs: 100, closedHoldMs: 100, repCooldownMs: 5000 
    }); // strict cooldown
    updateWithHold(closedFrame, 0, 200);
    updateWithHold(openFrame, 300, 200);
    updateWithHold(closedFrame, 600, 200); // First rep

    updateWithHold(openFrame, 900, 200);
    let result = updateWithHold(closedFrame, 1200, 200); // Second rep blocked
    expect(result.repCount).toBe(1);
  });
});
