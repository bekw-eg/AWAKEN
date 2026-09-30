import { SquatDetector } from '../exercise-engine/squatDetector';
import { JumpingJackDetector } from '../exercise-engine/jumpingJackDetector';
import { PushUpDetector } from '../exercise-engine/pushUpDetector';
import type { PushUpFrame } from '../exercise-engine/pushUpTypes';
import type { ExerciseEvent } from './types';
import { HANDS_FREE_ATTACKS, HANDS_FREE_CONFIG as C, type AttackType } from './handsFreeConfig';
import { isClosedPose, isPushupReadyPose, isStandingPose } from './handsFreePoses';

export type BattlePhase = 'camera_setup' | 'battle_intro' | 'selecting_attack' | 'attack_confirmed' |
  'waiting_for_neutral' | 'exercise_prepare' | 'performing_attack' | 'resolving_attack' |
  'enemy_turn' | 'turn_prepare' | 'victory' | 'defeat';
export type BattleCommand = { type: 'attack'; event: ExerciseEvent } | { type: 'enemy_attack' };
export type BattleSnapshot = {
  phase: BattlePhase; selectedAttack: AttackType | null; candidate: AttackType | null;
  selectionLocked: boolean; reps: number; countdown: number; pushupHoldMs: number;
  squatPhase: string; jumpingJackPhase: string; feedback: string | null; formError: boolean;
  tracking: boolean; go: boolean;
};

/** Owns the meaning of movement; detectors and the game reducer retain their existing jobs.
 * Commands are returned once, on phase transitions, never from renders or repeated timers.
 */
export class HandsFreeBattleController {
  private squat = new SquatDetector();
  private jack = new JumpingJackDetector();
  private pushup = new PushUpDetector();
  private phase: BattlePhase = 'camera_setup';
  private enteredAt = 0;
  private selected: AttackType | null = null;
  private candidate: AttackType | null = null;
  private reps = 0;
  private holdAt: number | null = null;
  private pushupHoldAt: number | null = null;
  private pushupAnchor: PushUpFrame['landmarks'] = null;
  private pushupHoldMs = 0;
  private lastFrameAt = -Infinity;
  private lastPoseTimestamp = -Infinity;
  private lastSelected = { basic: -Infinity, fast: -Infinity, strong: -Infinity };
  private feedback: string | null = null;
  private formError = false;
  private tracking = false;
  private preparationFrames: PushUpFrame[] = [];

  snapshot(now: number): BattleSnapshot {
    const duration = this.phase === 'battle_intro' ? C.introCountdownMs : this.phase === 'exercise_prepare' ? C.prepareCountdownMs : 0;
    return { phase: this.phase, selectedAttack: this.selected, candidate: this.candidate,
      selectionLocked: this.phase !== 'selecting_attack', reps: this.reps,
      countdown: duration ? Math.max(0, Math.ceil((duration - (now - this.enteredAt)) / 1000)) : 0,
      pushupHoldMs: this.pushupHoldMs, squatPhase: this.squat.getResult().phase,
      jumpingJackPhase: this.jack.getResult().phase, feedback: this.feedback, formError: this.formError,
      tracking: this.tracking, go: this.phase === 'performing_attack' && now - this.enteredAt < C.goLabelMs };
  }

  advance(now: number, health: { playerHp: number; enemyHp: number }, frame?: PushUpFrame): BattleCommand[] {
    if (this.phase === 'victory' || this.phase === 'defeat') return [];
    if (health.enemyHp <= 0) { this.enter('victory', now); return []; }
    if (health.playerHp <= 0) { this.enter('defeat', now); return []; }
    const fresh = !!frame && Number.isFinite(frame.timestampMs) && frame.timestampMs > this.lastPoseTimestamp;
    if (fresh) {
      this.lastPoseTimestamp = frame.timestampMs;
      if (now - this.lastFrameAt > C.maxFrameGapMs) this.loseTracking(now);
      this.lastFrameAt = now;
      this.tracking = !!frame.landmarks?.length;
      if (!this.tracking) this.loseTracking(now);
    } else if (now - this.lastFrameAt > C.maxFrameGapMs) this.loseTracking(now);

    const elapsed = now - this.enteredAt;
    switch (this.phase) {
      case 'camera_setup':
        if (fresh && frame.landmarks && (isStandingPose(frame) || isClosedPose(frame) || isPushupReadyPose(frame))) this.enter('battle_intro', now);
        break;
      case 'battle_intro':
        if (!this.tracking) this.enter('camera_setup', now);
        else if (elapsed >= C.introCountdownMs) this.enter('selecting_attack', now);
        break;
      case 'selecting_attack':
        if (fresh && this.tracking) this.selectFromFrame(frame, now);
        break;
      case 'attack_confirmed':
        if (elapsed >= C.selectionLockMs) this.enter('waiting_for_neutral', now);
        break;
      case 'waiting_for_neutral':
        if (fresh && this.tracking && this.neutral(frame)) {
          this.holdAt ??= now;
          if (now - this.holdAt >= C.neutralHoldMs) this.enter('exercise_prepare', now);
        } else if (fresh || !this.tracking) this.holdAt = null;
        break;
      case 'exercise_prepare':
        // Any movement during countdown must finish before a fresh countdown can start.
        if (!this.tracking || fresh && !this.neutral(frame)) this.enter('waiting_for_neutral', now);
        else {
          if (fresh) this.preparationFrames.push(frame);
          if (elapsed >= C.prepareCountdownMs) {
            this.resetDetectors();
            // Detectors stay disabled throughout the countdown. At GO, use only
            // the observed neutral frames to calibrate/arm the fresh detector.
            // No movement or selection attempt can cross this boundary.
            for (const neutralFrame of this.preparationFrames) {
              if (this.selected === 'basic') this.squat.update(neutralFrame);
              else if (this.selected === 'fast') this.jack.update(neutralFrame);
              else this.pushup.update(neutralFrame);
            }
            this.preparationFrames = [];
            this.enter('performing_attack', now);
          }
        }
        break;
      case 'performing_attack':
        if (fresh && this.tracking && this.selected) {
          const attack = HANDS_FREE_ATTACKS[this.selected];
          const result = this.selected === 'basic' ? this.squat.update(frame) : this.selected === 'fast' ? this.jack.update(frame) : this.pushup.update(frame);
          this.feedback = result.feedback;
          this.formError = result.formStatus === 'error';
          if (result.repJustCounted && !this.formError) {
            this.reps++;
            if (this.reps >= attack.reps) {
              this.enter('resolving_attack', now);
              this.resetDetectors();
              return [{ type: 'attack', event: { exercise: attack.exercise, status: 'correct', timestamp: now } }];
            }
          }
        }
        break;
      case 'resolving_attack':
        if (elapsed >= C.resolveMs) { this.enter('enemy_turn', now); return [{ type: 'enemy_attack' }]; }
        break;
      case 'enemy_turn':
        if (elapsed >= C.enemyTurnMs) this.enter('turn_prepare', now);
        break;
      case 'turn_prepare':
        if (elapsed >= C.betweenTurnsMs) this.enter('selecting_attack', now);
        break;
    }
    return [];
  }

  private neutral(frame: PushUpFrame) {
    return this.selected === 'basic' ? isStandingPose(frame) : this.selected === 'fast' ? isClosedPose(frame) : isPushupReadyPose(frame);
  }
  private selectFromFrame(frame: PushUpFrame, now: number) {
    const squat = this.squat.update(frame);
    if (squat.repJustCounted && squat.formStatus !== 'error' && now - this.lastSelected.basic >= C.squatSelectionCooldownMs) { this.select('basic', now); return; }
    const jack = this.jack.update(frame);
    if (jack.repJustCounted && jack.formStatus !== 'error' && now - this.lastSelected.fast >= C.jumpingJackSelectionCooldownMs) { this.select('fast', now); return; }
    if (isPushupReadyPose(frame)) {
      const moved = this.pushupAnchor && [11, 12, 23, 24, 27, 28].some(id =>
        (frame.landmarks![id].visibility ?? 0) >= C.minVisibility &&
        Math.hypot(frame.landmarks![id].x - this.pushupAnchor![id].x, frame.landmarks![id].y - this.pushupAnchor![id].y) > C.pushupMaxDrift);
      if (this.pushupHoldAt === null || moved) { this.pushupHoldAt = now; this.pushupAnchor = frame.landmarks; }
      this.pushupHoldMs = now - this.pushupHoldAt;
      this.candidate = 'strong';
      this.feedback = null;
      this.formError = false;
      if (this.pushupHoldMs >= C.pushupPoseHoldMs) this.select('strong', now);
      return;
    }
    this.clearPushupHold();
    this.candidate = squat.trackingStatus === 'ready' && squat.phase !== 'standing' ? 'basic' :
      jack.trackingStatus === 'ready' && jack.phase !== 'closed' ? 'fast' : null;
    const result = this.candidate === 'basic' ? squat : this.candidate === 'fast' ? jack :
      squat.formStatus === 'error' ? squat : jack.formStatus === 'error' ? jack : null;
    this.feedback = result?.feedback ?? (squat.trackingStatus === 'calibrating' ? 'Stand upright for squat calibration' : null);
    this.formError = result?.formStatus === 'error';
  }
  private select(attack: AttackType, now: number) {
    this.selected = attack;
    this.lastSelected[attack] = now;
    this.reps = 0;
    this.resetDetectors();
    this.enter('attack_confirmed', now);
  }
  private enter(phase: BattlePhase, now: number) {
    this.phase = phase; this.enteredAt = now; this.holdAt = null;
    this.feedback = null; this.formError = false;
    if (phase === 'exercise_prepare' || phase === 'waiting_for_neutral') this.preparationFrames = [];
    if (phase === 'selecting_attack') {
      this.selected = null; this.candidate = null; this.reps = 0; this.resetDetectors();
    }
  }
  private clearPushupHold() { this.pushupHoldAt = null; this.pushupAnchor = null; this.pushupHoldMs = 0; }
  private resetDetectors() { this.squat.reset(); this.jack.reset(); this.pushup.reset(); this.clearPushupHold(); }
  private loseTracking(now: number) {
    if (this.phase === 'exercise_prepare') this.enter('waiting_for_neutral', now);
    if (this.phase === 'battle_intro') this.enter('camera_setup', now);
    this.tracking = false; this.holdAt = null; this.candidate = null; this.clearPushupHold();
    this.squat.pause(); this.jack.pause(); this.pushup.pause();
    this.feedback = 'Show your full body in the camera'; this.formError = false;
  }
}
