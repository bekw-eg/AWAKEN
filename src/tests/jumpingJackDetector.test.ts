import { describe, it, expect, beforeEach } from 'vitest';
import { JumpingJackDetector } from '../exercise-engine/jumpingJackDetector';
import type { JumpingJackDetectionResult, JumpingJackFrame } from '../exercise-engine/types';
import {
  closedFrame,
  openFrame,
  narrowLegsFrame,
  lowArmsFrame,
  incompleteReturnFrame,
  invisibleFrame,
  createJJFrame,
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

  const updateWithHold = (frame: Omit<JumpingJackFrame, 'timestampMs'>, startTime: number, holdTime: number) => {
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

  it.each([{ x: -0.1 }, { x: 1.1 }, { y: -0.1 }, { y: 1.1 }])(
    'rejects a confidently estimated wrist outside the image: %j', (position) => {
      const landmarks = openFrame.landmarks.map(point => ({ ...point }));
      landmarks[15] = { ...landmarks[15], ...position };
      const result = detector.update({ ...openFrame, landmarks, timestampMs: 50 });
      expect(result.trackingStatus).toBe('unreliable');
      expect(result.repCount).toBe(0);
    },
  );

  it('requires an observed open pose before counting after off-screen hands', () => {
    updateWithHold(closedFrame, 0, 200);
    const landmarks = openFrame.landmarks.map(point => ({ ...point }));
    landmarks[15].y = -0.1;
    landmarks[16].y = -0.1;
    updateWithHold({ ...openFrame, landmarks }, 250, 350);
    expect(updateWithHold(closedFrame, 650, 350).repCount).toBe(0);
    updateWithHold(openFrame, 1050, 350);
    expect(updateWithHold(closedFrame, 1450, 350).repCount).toBe(1);
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

// Test the shipped defaults, including the previously rejected -0.1 wrists / 2.0 stance.
function pose(ankleRatio = 2, left = -0.1, right = left, confidence = 1) {
  const point = (x: number, y: number) => ({ x, y, z: 0, visibility: confidence, presence: 1 });
  return createJJFrame(point(.3, .3), point(.7, .3), point(.1, .3 + left), point(.9, .3 + right),
    point(.5 - ankleRatio * .2, .9), point(.5 + ankleRatio * .2, .9));
}

class Sequence {
  time = 0;
  history: JumpingJackDetectionResult[] = [];
  constructor(readonly detector = new JumpingJackDetector()) {}
  get result() { return this.detector.getResult(); }
  frame(frame: Omit<JumpingJackFrame, 'timestampMs'>) {
    this.time += 50;
    const result = this.detector.update({ ...frame, timestampMs: this.time });
    this.history.push(result);
    return result;
  }
  hold(frame: Omit<JumpingJackFrame, 'timestampMs'>, ms = 300) {
    for (let elapsed = 0; elapsed < ms; elapsed += 50) this.frame(frame);
    return this.result;
  }
  rep(open = pose()) { this.hold(open); return this.hold(closedFrame); }
}

describe('Jumping jack tolerance and stable holds with default configuration', () => {
  it.each([[-.1, -.1], [-.06, .01], [.01, -.06]])('accepts a normal stance and wrist offsets %s / %s without false feedback', (left, right) => {
    const sequence = new Sequence();
    sequence.hold(closedFrame);
    sequence.rep(pose(2, left, right, .6));
    expect(sequence.result.repCount).toBe(1);
    expect(sequence.history.some(result => result.errorCode !== null)).toBe(false);
    expect(sequence.history.filter(result => result.repJustCounted)).toHaveLength(1);
    expect([...new Set(sequence.history.map(result => result.phase))]).toEqual(['closed', 'opening', 'open', 'closing']);
  });

  it('requires a stable closed start instead of counting an initial open-to-closed movement', () => {
    const sequence = new Sequence();
    sequence.hold(pose());
    sequence.hold(closedFrame);
    expect(sequence.result.repCount).toBe(0);
    sequence.rep();
    expect(sequence.result.repCount).toBe(1);
  });

  it('does not infer an arms error when both limbs are between positions or a partial attempt returns', () => {
    const sequence = new Sequence();
    sequence.hold(closedFrame);
    sequence.hold(pose(1.7, -.02), 1800);
    sequence.hold(closedFrame);
    expect(sequence.result.repCount).toBe(0);
    expect(sequence.history.some(result => result.errorCode !== null)).toBe(false);
  });

  it.each([
    ['arms_too_low', pose(2, .05)],
    ['legs_too_narrow', pose(1.2, -.1)],
    ['arms_too_low', pose(2, -.1, .1)],
  ] as const)('reports %s only after the same stationary fault persists for 700 ms', (error, frame) => {
    const sequence = new Sequence();
    sequence.hold(closedFrame);
    sequence.hold(frame, 800); // Includes the opening transition, then less than 700 ms of fault evidence.
    expect(sequence.result.errorCode).toBeNull();
    sequence.hold(frame, 200);
    expect(sequence.result.errorCode).toBe(error);
    sequence.hold(closedFrame);
    expect(sequence.result.repCount).toBe(0);
    expect(sequence.result.errorCode).toBeNull();
    sequence.rep();
    expect(sequence.result.repCount).toBe(1);
  });

  it('does not accumulate error time while the arms are still moving through a slow correct rep', () => {
    const sequence = new Sequence();
    sequence.hold(closedFrame);
    for (let step = 0; step <= 60; step++) sequence.frame(pose(2, .4 - step * .009));
    sequence.hold(pose());
    for (let step = 0; step <= 60; step++) sequence.frame(pose(2 - step * .025, -.1 + step * .01));
    sequence.hold(closedFrame);
    expect(sequence.result.repCount).toBe(1);
    expect(sequence.history.some(result => result.errorCode !== null)).toBe(false);
  });

  it('does not reuse an old fault timer when the problematic limb changes', () => {
    const sequence = new Sequence();
    sequence.hold(closedFrame);
    sequence.hold(lowArmsFrame, 800);
    sequence.hold(narrowLegsFrame, 650);
    expect(sequence.result.errorCode).toBeNull();
    sequence.hold(narrowLegsFrame, 100);
    expect(sequence.result.errorCode).toBe('legs_too_narrow');
  });

  it('keeps the accepted phase through one jitter frame and requires actual open/closed holds', () => {
    const sequence = new Sequence();
    sequence.hold(closedFrame, 1500);
    sequence.frame(pose());
    expect(sequence.result.phase).toBe('closed');
    sequence.hold(closedFrame);
    sequence.hold(pose(1.7, -.02), 1500);
    sequence.frame(pose()); // An old opening phase does not turn one good frame into a held open pose.
    expect(sequence.result.phase).toBe('opening');
    sequence.hold(pose(1.7, -.02), 150);
    sequence.hold(pose());
    expect(sequence.result.phase).toBe('open');
    sequence.frame(closedFrame);
    expect(sequence.result.phase).toBe('open');
    sequence.hold(pose());
    sequence.hold(incompleteReturnFrame, 300);
    sequence.frame(closedFrame);
    expect(sequence.result.repCount).toBe(0);
    sequence.hold(incompleteReturnFrame, 150);
    sequence.hold(closedFrame);
    expect(sequence.result.repCount).toBe(1);
  });

  it.each(['invisible', 'missing'] as const)('keeps an accepted open phase during brief %s tracking but never advances holds blindly', kind => {
    const sequence = new Sequence();
    sequence.hold(closedFrame);
    sequence.hold(pose());
    sequence.hold(kind === 'invisible' ? invisibleFrame : { landmarks: null, worldLandmarks: null }, 200);
    expect(sequence.result.phase).toBe('open');
    sequence.frame(closedFrame);
    expect(sequence.result.repCount).toBe(0);
    sequence.hold(closedFrame);
    expect(sequence.result.repCount).toBe(1);
  });

  it('abandons the attempt after a continuous stream of unreliable frames exceeds the tracking timeout', () => {
    const sequence = new Sequence();
    sequence.hold(closedFrame);
    sequence.hold(pose());
    sequence.hold(invisibleFrame, 1200);
    sequence.hold(closedFrame);
    expect(sequence.result.repCount).toBe(0);
    sequence.rep();
    expect(sequence.result.repCount).toBe(1);
  });

  it('does not accumulate a pose hold across a short dropout', () => {
    const sequence = new Sequence();
    sequence.hold(closedFrame);
    sequence.hold(pose(1.7, -.02));
    sequence.frame(pose());
    sequence.hold(invisibleFrame, 200);
    sequence.frame(pose());
    expect(sequence.result.phase).toBe('opening');
    sequence.hold(closedFrame);
    expect(sequence.result.repCount).toBe(0);
  });

  it('rejects incomplete landmarks, bad presence, non-finite geometry and zero shoulder width without throwing', () => {
    for (const frame of [
      { landmarks: [], worldLandmarks: [] },
      (() => { const frame = pose(); frame.landmarks[15].presence = .1; return frame; })(),
      (() => { const frame = pose(); frame.worldLandmarks[27].x = NaN; return frame; })(),
      (() => { const frame = pose(); frame.worldLandmarks[12] = frame.worldLandmarks[11]; return frame; })(),
    ]) {
      const sequence = new Sequence();
      sequence.hold(closedFrame);
      sequence.hold(frame);
      expect(sequence.result.trackingStatus).toBe('unreliable');
      expect(sequence.result.repCount).toBe(0);
      expect(sequence.result.errorCode).toBeNull();
    }
  });

  it('counts repeated complete cycles once each, ignores duplicate/out-of-order frames, and resets cooldown explicitly', () => {
    const sequence = new Sequence();
    sequence.hold(closedFrame);
    for (let rep = 1; rep <= 5; rep++) {
      sequence.rep();
      expect(sequence.result.repCount).toBe(rep);
      const duplicate = sequence.detector.update({ ...pose(), timestampMs: sequence.time });
      expect(duplicate.repJustCounted).toBe(false);
      sequence.detector.update({ ...pose(), timestampMs: sequence.time - 100 });
      sequence.hold(closedFrame);
      expect(sequence.result.repCount).toBe(rep);
    }
    expect(sequence.history.filter(result => result.repJustCounted)).toHaveLength(5);
    sequence.detector.reset();
    sequence.time = 0;
    sequence.hold(closedFrame);
    sequence.rep();
    expect(sequence.result.repCount).toBe(1);
  });

  it('clears a pending cycle and success pulse on explicit pause', () => {
    const sequence = new Sequence();
    sequence.hold(closedFrame);
    sequence.hold(pose());
    expect(sequence.detector.pause().repJustCounted).toBe(false);
    sequence.hold(closedFrame);
    expect(sequence.result.repCount).toBe(0);
  });
});
