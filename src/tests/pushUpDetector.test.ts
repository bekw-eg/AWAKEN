import { describe, expect, it } from 'vitest';
import { PushUpDetector } from '../exercise-engine/pushUpDetector';
import { PushUpSequence, pushUpFrame } from './fixtures/pushUpFrames';

describe('PushUpDetector', () => {
  it.each(['left', 'right'] as const)('counts a complete cycle on the %s side exactly once', side => {
    const s = new PushUpSequence(new PushUpDetector(), { side });
    s.hold(); s.rep();
    expect(s.result.repCount).toBe(1);
    expect(s.result.activeSide).toBe(side);
    expect(s.history.filter(r => r.repJustCounted)).toHaveLength(1);
    expect([...new Set(s.history.map(r => r.phase))]).toEqual(['top', 'descending', 'bottom', 'ascending']);
    s.rep();
    expect(s.result.repCount).toBe(2);
  });
  it('does not count stationary top or an initial bottom', () => {
    const s = new PushUpSequence();
    s.hold(85, 2000); s.ramp(85, 175); s.hold(175, 2000);
    expect(s.result.repCount).toBe(0);
    expect(s.result.trackingStatus).toBe('ready');
  });
  it('holds bottom without repeating events', () => {
    const s = new PushUpSequence();
    s.hold(); s.ramp(175, 85); s.hold(85, 2500);
    expect(s.result.phase).toBe('bottom');
    expect(s.result.repCount).toBe(0);
    s.ramp(85, 175); s.hold();
    expect(s.result.repCount).toBe(1);
  });
  it('rejects shallow movement with specific feedback', () => {
    const s = new PushUpSequence(); s.hold(); s.rep(125);
    expect(s.result.repCount).toBe(0);
    expect(s.result.errorCode).toBe('too_shallow');
    expect(s.result.feedback).toBe('Опустись ниже');
  });
  it.each(['stall', 'bounce'])('rejects incomplete lockout on %s and requires a fresh top', kind => {
    const s = new PushUpSequence(); s.hold(); s.ramp(175, 85); s.hold(85);
    s.ramp(85, 145);
    if (kind === 'stall') s.hold(145, 1200);
    else { s.ramp(145, 100, 300); s.hold(100, 200); }
    expect(s.result.errorCode).toBe('incomplete_lockout');
    expect(s.result.feedback).toBe('Полностью выпрями руки');
    s.ramp(100, 175); s.hold();
    expect(s.result.repCount).toBe(0);
    s.rep(); expect(s.result.repCount).toBe(1);
  });
  it('latches bad body alignment even after recovery and prioritizes it over shallow depth', () => {
    const s = new PushUpSequence(); s.hold(); s.ramp(175, 125);
    s.hold(125, 400, { hipOffset: 0.3 });
    expect(s.result.feedback).toBe('Держи корпус ровнее');
    s.ramp(125, 175); s.hold();
    expect(s.result.repCount).toBe(0);
    expect(s.result.errorCode).toBe('body_alignment');
    s.rep(); expect(s.result.repCount).toBe(1);
  });
  it('rejects bent knees and tolerates one-frame form noise', () => {
    const s = new PushUpSequence(); s.hold(); s.ramp(175, 85);
    s.frame({ elbow: 85, hipOffset: 0.3 }); s.hold(85); s.ramp(85, 175); s.hold();
    expect(s.result.repCount).toBe(1);
    s.rep(85, { kneeOffset: 0.3 }); expect(s.result.repCount).toBe(1);
  });
  it.each(['visibility', 'presence', 'missing', 'gap', 'pause', 'bounds', 'nan'] as const)('cancels attempts on %s loss and preserves completed reps', reason => {
    const s = new PushUpSequence(); s.hold(); s.rep(); s.ramp(175, 85); s.hold(85);
    if (reason === 'gap') { s.time += 500; s.frame({ elbow: 85 }); }
    else if (reason === 'pause') s.detector.pause();
    else s.frame({ elbow: 85 }, f => {
      if (reason === 'missing') f.landmarks = null;
      else {
        const p = f.landmarks![13];
        if (reason === 'bounds') p.x = -0.1;
        else if (reason === 'nan') p.y = NaN;
        else p[reason] = 0.1;
      }
    });
    s.ramp(85, 175); s.hold();
    expect(s.result.repCount).toBe(1);
    s.rep(); expect(s.result.repCount).toBe(2);
  });
  it('suppresses duplicate and out-of-order timestamps immediately after the rep event', () => {
    const s = new PushUpSequence(); s.hold(); s.rep();
    const index = s.history.findIndex(r => r.repJustCounted);
    const detector = new PushUpDetector();
    s.frames.slice(0, index + 1).forEach(f => detector.update(f));
    expect(detector.getResult().repJustCounted).toBe(true);
    expect(detector.update(s.frames[index]).repJustCounted).toBe(false);
    expect(detector.update(s.frames[index - 1]).repCount).toBe(1);
  });
  it('enforces cooldown and recovers after it elapses', () => {
    const s = new PushUpSequence(new PushUpDetector({ repCooldownMs: 5000 }));
    s.hold(); s.rep(); s.rep(); expect(s.result.repCount).toBe(1);
    s.hold(175, 5100); s.rep(); expect(s.result.repCount).toBe(2);
  });
  it('rejects implausibly short cycles and expires stale attempts', () => {
    const s = new PushUpSequence(new PushUpDetector({ minRepDurationMs: 5000 }));
    s.hold(); s.rep(); expect(s.result.repCount).toBe(0);
    const expired = new PushUpSequence(new PushUpDetector({ maxAttemptDurationMs: 1200 }));
    expired.hold(); expired.ramp(175, 85); expired.hold(85, 1500); expired.ramp(85, 175); expired.hold();
    expect(expired.result.repCount).toBe(0);
    expect(expired.history.some(r => r.errorCode === 'incomplete_lockout')).toBe(true);
  });
  it('reset clears counter, active side, phase and event', () => {
    const s = new PushUpSequence(); s.hold(); s.rep();
    expect(s.detector.reset()).toMatchObject({ repCount: 0, repJustCounted: false, phase: 'top', activeSide: null, formStatus: 'idle' });
    s.hold(); s.rep(); expect(s.result.repCount).toBe(1);
  });
  it('locks the selected side despite confidence changes during an attempt', () => {
    const s = new PushUpSequence(); s.hold(); s.ramp(175, 85);
    s.hold(85, 400, { leftConfidence: 0.7, rightConfidence: 1 });
    expect(s.result.activeSide).toBe('left');
    s.ramp(85, 175); s.hold(); expect(s.result.repCount).toBe(1);
  });
  it('allows an occluded far side, but never substitutes sides mid-attempt', () => {
    const s = new PushUpSequence(new PushUpDetector(), { rightConfidence: 0.1 });
    s.hold(); s.rep(); expect(s.result.repCount).toBe(1);
    s.ramp(175, 85); s.frame({ elbow: 85, leftConfidence: 0.1, rightConfidence: 1 });
    expect(s.result.trackingStatus).toBe('unreliable');
    s.ramp(85, 175); s.hold(); expect(s.result.repCount).toBe(1);
  });
  it('rejects clearly frontal views and vertical standing arm curls', () => {
    const s = new PushUpSequence(new PushUpDetector(), { yaw: 90 });
    s.hold(); s.rep(); expect(s.result.trackingStatus).toBe('wrong_angle');
    expect(s.result.repCount).toBe(0);
    const frame = pushUpFrame(100);
    frame.worldLandmarks = frame.worldLandmarks!.map(p => ({ ...p, x: -p.y, y: p.x }));
    expect(new PushUpDetector().update(frame).trackingStatus).toBe('wrong_angle');
  });
  it('requires held transitions instead of reacting to a single noisy elbow frame', () => {
    const s = new PushUpSequence(); s.hold(); s.frame({ elbow: 100 }); s.hold();
    expect(s.result.phase).toBe('top'); expect(s.result.repCount).toBe(0);
    s.rep(); expect(s.result.repCount).toBe(1);
  });
});
