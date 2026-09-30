import { describe, expect, it } from 'vitest';
import { HandsFreeBattleController, type BattleCommand } from '../game/handsFreeBattleController';
import { BOSS_RECOVERY, HANDS_FREE_CONFIG as C } from '../game/handsFreeConfig';
import { isPushupReadyPose, isStandingPose, standingPoseFeedback } from '../game/handsFreePoses';
import type { PushUpFrame } from '../exercise-engine/pushUpTypes';
import { SquatSequence, squatFrame } from './fixtures/squatFrames';
import { PushUpSequence, pushUpFrame } from './fixtures/pushUpFrames';
import { closedFrame, openFrame, lowArmsFrame, narrowLegsFrame, invisibleFrame } from './fixtures/jumpingJackFrames';
import { battleOverlay } from '../game/battleOverlay';

type Pose = Omit<PushUpFrame, 'timestampMs'>;
export class BattleSequence {
  controller: HandsFreeBattleController;
  constructor(isBoss = false) { this.controller = new HandsFreeBattleController(isBoss); }
  now = 0;
  commands: BattleCommand[] = [];
  health = { playerHp: 100, enemyHp: 1000 };
  get state() { return this.controller.snapshot(this.now); }
  frame(pose: Pose) {
    this.now += 50;
    this.commands.push(...this.controller.advance(this.now, this.health, { ...pose, timestampMs: this.now }));
  }
  hold(pose: Pose, ms: number) { for (let t = 0; t < ms; t += 50) this.frame(pose); }
  start(pose: Pose = closedFrame) { this.hold(pose, C.introCountdownMs + C.fightAnnouncementMs + 100); expect(this.state.phase).toBe('selecting_attack'); }
  prepare(pose: Pose) {
    for (let n = 0; n < 150 && this.state.phase !== 'performing_attack'; n++) this.frame(pose);
    expect(this.state.phase).toBe('performing_attack');
    expect(this.state.reps).toBe(0);
    expect(this.commands).toEqual([]);
  }
  jack() { this.hold(closedFrame, 300); this.hold(openFrame, 400); this.hold(closedFrame, 400); }
  squat(bottom = 85) { const s = new SquatSequence(); s.rep({}, bottom); s.frames.forEach(f => this.frame(f)); }
  pushup(bottom = 85) { const s = new PushUpSequence(); s.rep(bottom); s.frames.forEach(f => this.frame(f)); }
  get attacks() { return this.commands.filter(c => c.type === 'attack'); }
}

describe('boss recovery turns', () => {
  it('requires a live boss player turn and cancels selection movement', () => {
    const normal = new BattleSequence(); normal.start();
    expect(normal.controller.startRecovery(normal.now)).toBe(false);
    const s = new BattleSequence(true);
    expect(s.controller.startRecovery(s.now)).toBe(false);
    s.start(); s.hold(pushUpFrame(0), 300);
    expect(s.controller.startRecovery(s.now)).toBe(true);
    expect(s.state.selectedAttack).toBeNull();
    expect(s.state.pushupHoldMs).toBe(0);
    expect(s.controller.startRecovery(s.now)).toBe(false);
    s.squat(); s.jack(); s.pushup();
    expect(s.attacks).toHaveLength(0);
    expect(s.state.phase).toBe('recovering');
  });

  it('pauses for bad form, missing, duplicate and stale frames; heals once after five observed seconds', () => {
    const s = new BattleSequence(true); s.start(); s.controller.startRecovery(s.now);
    s.hold(squatFrame(0), 2050);
    const held = s.state.recoveryHoldMs;
    expect(held).toBe(2000);
    s.hold(squatFrame(0, { knee: 100 }), 2000);
    s.hold({ landmarks: null, worldLandmarks: null }, 2000);
    expect(s.state.recoveryHoldMs).toBe(held);
    s.frame(squatFrame(0));
    const duplicate = { ...squatFrame(0), timestampMs: s.now };
    s.now += 2000; s.commands.push(...s.controller.advance(s.now, s.health, duplicate));
    expect(s.state.recoveryHoldMs).toBe(held);
    s.now += 2000; s.commands.push(...s.controller.advance(s.now, s.health));
    expect(s.state.recoveryHoldMs).toBe(held);
    expect(s.commands).toEqual([]);
    s.hold(squatFrame(0), 3000);
    expect(s.commands).toEqual([]);
    s.frame(squatFrame(0));
    expect(s.commands).toEqual([{ type: 'recover', useNumber: 1 }]);
    expect(s.state.phase).toBe('resolving_recovery');
    expect(s.state.recoveryCooldown).toBe(3);
    s.hold(squatFrame(0), C.resolveMs);
    expect(s.commands).toEqual([{ type: 'recover', useNumber: 1 }, { type: 'enemy_attack' }]);
    s.hold(squatFrame(0), C.enemyTurnMs + C.betweenTurnsMs);
    expect(s.state.phase).toBe('selecting_attack');
    expect(s.state.recoveryCooldown).toBe(3);
  });

  it('waits three completed attacking turns before the last use and then stays depleted', () => {
    const s = new BattleSequence(true); s.start(); s.controller.startRecovery(s.now);
    s.hold(squatFrame(0), BOSS_RECOVERY.holdDurationMs + 50);
    s.hold(squatFrame(0), C.resolveMs + C.enemyTurnMs + C.betweenTurnsMs);
    expect(s.state.recoveryUsesLeft).toBe(1);
    for (const remaining of [3, 2, 1]) {
      expect(s.state.recoveryCooldown).toBe(remaining);
      expect(s.controller.startRecovery(s.now)).toBe(false);
      s.commands = [];
      s.hold(pushUpFrame(0), 800); s.prepare(pushUpFrame(0)); s.pushup();
      s.hold(squatFrame(0), C.resolveMs + C.enemyTurnMs + C.betweenTurnsMs);
      expect(s.state.phase).toBe('selecting_attack');
    }
    expect(s.state.recoveryAvailable).toBe(true);
    expect(s.controller.startRecovery(s.now)).toBe(true);
    s.commands = [];
    s.hold(squatFrame(0), BOSS_RECOVERY.holdDurationMs + 50);
    expect(s.commands).toEqual([{ type: 'recover', useNumber: 2 }]);
    s.hold(squatFrame(0), C.resolveMs + C.enemyTurnMs + C.betweenTurnsMs);
    expect(s.state.recoveryUsesLeft).toBe(0);
    expect(s.state.recoveryAvailable).toBe(false);
    expect(s.controller.startRecovery(s.now)).toBe(false);
  });

  it.each(['playerHp', 'enemyHp'] as const)('stops a pending recovery when %s reaches zero', key => {
    const s = new BattleSequence(true); s.start(); s.controller.startRecovery(s.now);
    s.hold(squatFrame(0), 4000); s.health[key] = 0;
    s.hold(squatFrame(0), 6000);
    expect(s.commands).toEqual([]);
    expect(s.state.phase).toBe(key === 'playerHp' ? 'defeat' : 'victory');
  });
});

describe('hands-free orchestration using the real exercise detectors', () => {
  it('announces 3, 2, 1, FIGHT before enabling gesture selection', () => {
    const s = new BattleSequence(); s.frame(closedFrame);
    expect(battleOverlay(s.state)?.text).toBe('3');
    s.hold(closedFrame, C.countdownStepMs); expect(battleOverlay(s.state)?.text).toBe('2');
    s.hold(closedFrame, C.countdownStepMs); expect(battleOverlay(s.state)?.text).toBe('1');
    s.hold(closedFrame, C.countdownStepMs); expect(battleOverlay(s.state)?.text).toBe('FIGHT!');
    s.hold(openFrame, C.fightAnnouncementMs - 50); expect(s.state.selectedAttack).toBeNull();
    s.frame(closedFrame); expect(s.state.phase).toBe('selecting_attack'); expect(battleOverlay(s.state)).toBeNull();
  });

  it.each(['basic', 'fast', 'strong'] as const)('blocks reps until the %s exercise title disappears', attack => {
    const s = new BattleSequence(); s.start(squatFrame(0)); s.hold(squatFrame(0), 1600);
    if (attack === 'basic') s.squat(); else if (attack === 'fast') s.jack(); else s.hold(pushUpFrame(0), 800);
    expect(battleOverlay(s.state)?.type).toBe('attack_selected');
    const neutral = attack === 'basic' ? squatFrame(0) : attack === 'fast' ? closedFrame : pushUpFrame(0);
    for (let n = 0; n < 150 && s.state.phase !== 'exercise_announcement'; n++) s.frame(neutral);
    expect(battleOverlay(s.state)?.text).toBe(attack === 'basic' ? 'SQUAT!' : attack === 'fast' ? 'JUMPING JACKS!' : 'PUSH-UPS!');
    s.hold(neutral, C.exerciseAnnouncementMs - 50);
    expect(s.state.phase).toBe('exercise_announcement'); expect(s.state.reps).toBe(0); expect(s.commands).toEqual([]);
    s.frame(neutral); expect(s.state.phase).toBe('performing_attack'); expect(battleOverlay(s.state)).toBeNull();
    if (attack === 'basic') s.squat(); else if (attack === 'fast') s.jack(); else s.pushup();
    expect(s.state.reps).toBe(1);
  });

  it('keeps an early movement during the title from leaking into the attack', () => {
    const s = new BattleSequence(); s.start(); s.jack();
    for (let n = 0; n < 150 && s.state.phase !== 'exercise_announcement'; n++) s.frame(closedFrame);
    s.hold(openFrame, 350); expect(s.state.phase).toBe('waiting_for_neutral');
    expect(s.state.reps).toBe(0); expect(s.commands).toEqual([]);
    s.prepare(closedFrame); s.hold(closedFrame, 500); expect(s.state.reps).toBe(0);
  });

  it('exposes correct plank form and local arm/torso errors in battle', () => {
    const s = new BattleSequence(); s.start(); s.hold(pushUpFrame(0), 500);
    expect(s.state.formFeedback.status).toBe('correct');
    s.hold(pushUpFrame(0), 300); s.prepare(pushUpFrame(0));
    s.hold(pushUpFrame(0), 200); expect(s.state.formFeedback.status).toBe('correct');
    s.hold(pushUpFrame(0, { hipOffset: -.35 }), 500);
    expect(s.state.formFeedback).toMatchObject({ status: 'error', regions: ['torso', 'hips'] });
    s.frame({ landmarks: null, worldLandmarks: null }); expect(s.state.formFeedback.status).toBe('neutral');
  });
  it('accepts the squat detector calibration stance instead of getting stuck below 165 degrees', () => {
    const s = new BattleSequence(); s.start(squatFrame(0)); s.hold(squatFrame(0), 1600); s.squat();
    s.prepare(squatFrame(0, { knee: 155 }));
    expect(s.state.tracking).toBe(true);
    expect(s.state.feedback).not.toBe('Show your full body in the camera');
    expect(s.attacks).toHaveLength(0);
  });

  it('clears stale camera-loss feedback and gives the actual reason neutral is not ready', () => {
    const s = new BattleSequence(); s.start(squatFrame(0)); s.hold(squatFrame(0), 1600); s.squat();
    s.hold({ landmarks: null, worldLandmarks: null }, 1200);
    expect(s.state.phase).toBe('waiting_for_neutral');
    expect(s.state.tracking).toBe(false);
    s.frame(squatFrame(0, { knee: 130 }));
    expect(s.state.tracking).toBe(true);
    expect(s.state.feedback).toContain('Straighten your knees');
    s.hold(squatFrame(0), 300);
    expect(s.state.feedback).toBe('Position detected · hold still');
    expect(s.state.neutralProgress).toBeGreaterThan(0);
    s.prepare(squatFrame(0));
  });

  it('survives isolated noisy landmarks during neutral hold and countdown without counting a rep', () => {
    const s = new BattleSequence(); s.start(); s.jack(); s.hold(closedFrame, 1000);
    for (let n = 0; n < 110 && s.state.phase !== 'performing_attack'; n++) {
      s.frame(n % 5 === 0 ? openFrame : closedFrame);
    }
    expect(s.state.phase).toBe('performing_attack'); expect(s.commands).toEqual([]); expect(s.state.reps).toBe(0);
    s.hold(closedFrame, 300); s.hold(openFrame, 400); s.hold(closedFrame, 400);
    expect(s.state.reps).toBe(1);
  });

  it('requires a fresh valid neutral frame at GO, even after a brief rejected frame', () => {
    const s = new BattleSequence(); s.start(); s.jack();
    while (s.state.phase !== 'exercise_prepare') s.frame(closedFrame);
    s.hold(closedFrame, C.prepareCountdownMs - 50);
    s.frame(openFrame);
    expect(s.state.phase).toBe('exercise_prepare'); expect(s.commands).toEqual([]);
    s.now += 50; s.controller.advance(s.now, s.health);
    expect(s.state.phase).toBe('exercise_prepare');
    s.frame(closedFrame); expect(s.state.phase).toBe('exercise_announcement'); expect(s.state.reps).toBe(0);
    s.hold(closedFrame, C.exerciseAnnouncementMs); expect(s.state.phase).toBe('performing_attack');
  });

  it('cannot accumulate readiness from isolated valid frames separated by sustained bad poses', () => {
    const s = new BattleSequence(); s.start(); s.jack(); s.hold(openFrame, 1600);
    for (let n = 0; n < 15; n++) { s.frame(closedFrame); s.hold(openFrame, 350); }
    expect(s.state.phase).toBe('waiting_for_neutral'); expect(s.state.neutralProgress).toBe(0);
    expect(s.commands).toEqual([]);
  });
  it('separates a complete squat selection from one fresh squat and exactly one enemy turn', () => {
    const s = new BattleSequence(); s.start(squatFrame(0)); s.hold(squatFrame(0), 1600);
    s.squat(140); expect(s.state.selectedAttack).toBeNull();
    s.squat(); expect(s.state.selectedAttack).toBe('basic');
    expect(s.attacks).toHaveLength(0); expect(s.state.reps).toBe(0);
    expect(s.state.squatPhase).toBe('standing'); expect(s.state.selectionLocked).toBe(true);
    s.prepare(squatFrame(0)); s.squat();
    expect(s.attacks).toHaveLength(1); expect(s.state.reps).toBe(1);
    s.hold(squatFrame(0), C.resolveMs + C.enemyTurnMs + C.betweenTurnsMs + 200);
    expect(s.commands.filter(c => c.type === 'enemy_attack')).toHaveLength(1);
    expect(s.state.phase).toBe('selecting_attack'); expect(s.state.selectedAttack).toBeNull();
  });

  it('requires closed → open → closed for selection and five NEW jacks for a single hit', () => {
    const s = new BattleSequence(); s.start(); s.hold(closedFrame, 300); s.hold(openFrame, 600);
    expect(s.state.candidate).toBe('fast'); expect(s.state.selectedAttack).toBeNull();
    expect(s.state.formFeedback.status).toBe('correct');
    s.hold(closedFrame, 400); expect(s.state.selectedAttack).toBe('fast');
    s.prepare(closedFrame);
    for (let rep = 1; rep <= 5; rep++) { s.jack(); expect(s.state.reps).toBe(rep); expect(s.attacks).toHaveLength(rep === 5 ? 1 : 0); }
    expect(s.attacks[0]).toMatchObject({ event: { exercise: 'jumping-jack' } });
  });

  it('requires a continuous stable plank, then a new full push-up after GO', () => {
    const s = new BattleSequence(); s.start();
    s.hold(pushUpFrame(0), 600); expect(s.state.candidate).toBe('strong'); expect(s.state.selectedAttack).toBeNull();
    s.frame(squatFrame(0)); expect(s.state.pushupHoldMs).toBe(0);
    s.hold(pushUpFrame(0), 700); expect(s.state.selectedAttack).toBeNull();
    s.frame(pushUpFrame(0)); expect(s.state.selectedAttack).toBe('strong');
    s.prepare(pushUpFrame(0)); s.pushup(130); expect(s.attacks).toHaveLength(0);
    s.pushup(); expect(s.attacks).toHaveLength(1); expect(s.state.reps).toBe(1);
  });

  it('keeps visual plank readiness through elbow jitter without counting invalid hold time', () => {
    const s = new BattleSequence(); s.start(); s.hold(pushUpFrame(0, { elbow: 161 }), 200);
    for (let i = 0; i < 20; i++) {
      s.frame(pushUpFrame(0, { elbow: i % 2 ? 161 : 159 }));
      expect(s.state.formFeedback.status).toBe('correct');
      expect(s.state.visualCandidate).toBe('strong');
      expect(s.state.pushupReadyVisual).toBe(true);
    }
    expect(s.state.selectedAttack).toBeNull(); expect(s.commands).toEqual([]);
    s.hold(pushUpFrame(0, { leftConfidence: 0.1, rightConfidence: 0.1 }), 350);
    expect(s.state.pushupReadyRaw).toBeNull(); expect(s.state.pushupReadyVisual).toBe(false);
    s.frame(pushUpFrame(0, { elbow: 159 }));
    expect(s.state.pushupReadyVisual).toBe(false);
    s.hold(pushUpFrame(0), 750); expect(s.state.selectedAttack).toBe('strong');
  });

  it('does not expose exercise errors or idle green while selecting an attack', () => {
    const s = new BattleSequence(); s.start(squatFrame(0)); s.hold(squatFrame(0), 1600);
    expect(s.state.formFeedback.status).toBe('neutral');
    s.hold(lowArmsFrame, 1400);
    expect(s.state.formError).toBe(false); expect(s.state.formFeedback.status).not.toBe('error');
    expect(s.state.selectedAttack).toBeNull(); expect(s.attacks).toHaveLength(0);
  });

  it.each([lowArmsFrame, narrowLegsFrame])('retains jack form errors without awarding a rep', bad => {
    const s = new BattleSequence(); s.start(); s.jack(); s.prepare(closedFrame);
    s.hold(bad, 1200); expect(s.state.formError).toBe(true); expect(s.state.feedback).toBeTruthy();
    s.hold(closedFrame, 500); expect(s.state.reps).toBe(0); expect(s.attacks).toHaveLength(0);
  });

  it('locks the first selection even while other gestures occur during confirmation and countdown', () => {
    const s = new BattleSequence(); s.start(); s.jack();
    s.hold(pushUpFrame(0), 1000); expect(s.state.selectedAttack).toBe('fast');
    s.hold(closedFrame, 600); expect(s.state.phase).toBe('exercise_prepare');
    s.hold(openFrame, 500); expect(s.state.phase).toBe('waiting_for_neutral');
    expect(s.state.reps).toBe(0); expect(s.commands).toEqual([]);
    s.prepare(closedFrame); expect(s.state.selectedAttack).toBe('fast');
  });

  it('does not bridge tracking gaps or stale/duplicate frames across a pose hold or repetition', () => {
    const s = new BattleSequence(); s.start(); s.hold(pushUpFrame(0), 500);
    s.now += 1000; s.controller.advance(s.now, s.health);
    expect(s.state.pushupHoldMs).toBe(0); expect(s.state.tracking).toBe(false);
    s.hold(pushUpFrame(0), 500); expect(s.state.selectedAttack).toBeNull();
    const stale = pushUpFrame(s.now);
    for (let i = 0; i < 20; i++) { s.now += 50; s.controller.advance(s.now, s.health, stale); }
    expect(s.state.selectedAttack).toBeNull(); expect(s.state.pushupHoldMs).toBe(0);
    s.hold(closedFrame, 500); s.jack(); s.prepare(closedFrame);
    s.hold(openFrame, 500); s.frame({ landmarks: null, worldLandmarks: null }); s.hold(closedFrame, 500);
    expect(s.state.reps).toBe(0);
    s.hold(invisibleFrame, 500); expect(s.state.reps).toBe(0);
  });

  it('returns to neutral after a camera outage during preparation', () => {
    const s = new BattleSequence(); s.start(); s.jack(); s.hold(closedFrame, 1800);
    expect(s.state.phase).toBe('exercise_prepare');
    s.now += 5000; s.controller.advance(s.now, s.health);
    expect(s.state.phase).toBe('waiting_for_neutral'); expect(s.commands).toEqual([]);
    s.prepare(closedFrame);
  });

  it.each(['victory', 'defeat'] as const)('stops all commands on %s', terminal => {
    const s = new BattleSequence(); s.start(); s.hold(pushUpFrame(0), 800); s.prepare(pushUpFrame(0)); s.pushup();
    if (terminal === 'victory') s.health.enemyHp = 0;
    else { s.hold(pushUpFrame(0), C.resolveMs); s.health.playerHp = 0; }
    s.frame(pushUpFrame(0)); expect(s.state.phase).toBe(terminal);
    const count = s.commands.length;
    s.hold(pushUpFrame(0), 15000); expect(s.commands).toHaveLength(count);
    if (terminal === 'victory') expect(s.commands.some(c => c.type === 'enemy_attack')).toBe(false);
  });

  it('does not attack an idle player while selecting or setting up the camera', () => {
    const s = new BattleSequence(); s.hold({ landmarks: null, worldLandmarks: null }, 10000);
    expect(s.state.phase).toBe('camera_setup'); s.start(); s.hold(closedFrame, 15000); expect(s.commands).toEqual([]);
  });
});

it('explains missing standing landmarks while rejecting bent knees and leaning', () => {
  expect(isStandingPose(squatFrame(0, { knee: 155 }))).toBe(true);
  expect(isStandingPose(squatFrame(0, { knee: 135 }))).toBe(false);
  expect(isStandingPose(squatFrame(0, { torsoLean: 40 }))).toBe(false);
  const frame = squatFrame(0);
  const landmarks = frame.landmarks!.map(point => ({ ...point }));
  landmarks[27].visibility = 0.1;
  expect(standingPoseFeedback({ ...frame, landmarks })).toContain('ankles');
});

it('rejects upright, bent, poorly tracked, and moving plank selection poses', () => {
  expect(isPushupReadyPose(squatFrame(0))).toBe(false);
  for (const options of [{ elbow: 90 }, { hipOffset: -0.35 }, { hipOffset: 0.35 }, { leftConfidence: 0.1, rightConfidence: 0.1 }]) {
    expect(isPushupReadyPose(pushUpFrame(0, options))).toBe(false);
  }
  const s = new BattleSequence(); s.start();
  for (let i = 0; i < 30; i++) {
    const f = pushUpFrame(0);
    s.frame({ ...f, landmarks: f.landmarks!.map(p => ({ ...p, x: p.x + (i % 2 ? 0.06 : 0) })) });
  }
  expect(s.state.selectedAttack).toBeNull();
});
