import { SquatDetector } from '../exercise-engine/squatDetector';
import { JumpingJackDetector } from '../exercise-engine/jumpingJackDetector';
import { PushUpDetector } from '../exercise-engine/pushUpDetector';
import type { PushUpFrame } from '../exercise-engine/pushUpTypes';
import { calculateAttackDamage, type BattleAttack } from './exerciseDamage';
import { RECOVERY, recoveryHealPercent, HANDS_FREE_ATTACKS, HANDS_FREE_CONFIG as C, type AttackType } from './handsFreeConfig';
import { isClosedPose, isPushupReadyPose, isStandingPose, standingPoseFeedback, pushupReadyState, readyPoseTrackingReliable } from './handsFreePoses';
import { FORM_DISPLAY_CONFIG, type FormFeedback } from '../exercise-engine/formFeedback';
import { resolvePoseFeedback } from './resolvePoseFeedback';

export type BattlePhase = 'camera_setup' | 'battle_intro' | 'battle_fight' | 'selecting_attack' | 'attack_confirmed' |
  'waiting_for_neutral' | 'exercise_prepare' | 'exercise_announcement' | 'performing_attack' | 'resolving_attack' |
  'recovering' | 'resolving_recovery' | 'enemy_turn' | 'turn_prepare' | 'victory' | 'defeat';
export type BattleCommand = { type: 'attack'; attack: BattleAttack } | { type: 'enemy_attack' } | { type: 'recover'; useNumber: number };
export type BattleSnapshot = {
  recoveryAvailable: boolean; recoveryUsesLeft: number; recoveryCharges: number; recoveryPercent: number;
  recoveryHoldMs: number; recoveryHealedHp: number; recoveryFullHp: boolean; recoveryNeedsMovement: boolean;
  phase: BattlePhase; selectedAttack: AttackType | null; candidate: AttackType | null;
  selectionLocked: boolean; reps: number; countdown: number; pushupHoldMs: number;
  accumulatedDamage: number; attackSecondsLeft: number;
  squatPhase: string; jumpingJackPhase: string; feedback: string | null; formError: boolean;
  tracking: boolean; go: boolean; neutralProgress: number;
  formFeedback: FormFeedback;
  feedbackReliable: boolean; pushupReadyRaw: boolean | null; pushupReadyVisual: boolean;
  visualCandidate: AttackType | null; candidateDurationMs: number; activeDetector: string;
};

/** Owns the meaning of movement; detectors and the game reducer retain their existing jobs.
 * Commands are returned once, on phase transitions, never from renders or repeated timers.
 */
export class HandsFreeBattleController {
  constructor(private readonly round = 1, private readonly enemyId = `enemy-${round}`) {}
  private recoveryUses = 0;
  private recoveryCharges = 0;
  private recoveryFullHp = true;
  private recoveryArmed = true;
  private recoveryRearmAnchor: PushUpFrame['landmarks'] = null;
  private recoveryHoldMs = 0;
  private recoveryLastAt: number | null = null;
  private recoveryAnchor: PushUpFrame['landmarks'] = null;
  private recoveryHealedHp = 0;

  private canRecover() {
    return this.recoveryArmed && !this.recoveryFullHp && this.recoveryCharges > 0 && this.recoveryUses < RECOVERY.maxUsesPerFight;
  }
  private cancelRecovery() {
    // Keep calibrated selection detectors: moving out of the hold may be the
    // start of a squat or jack, which should still select an attack normally.
    if (this.phase === 'recovering') this.phase = 'selecting_attack';
    this.recoveryHoldMs = 0; this.recoveryLastAt = null; this.recoveryAnchor = null;
    this.visualReady = false;
  }
  private recoveryPose(frame: PushUpFrame) {
    return isStandingPose(frame) && isClosedPose(frame);
  }
  private squat = new SquatDetector();
  private jack = new JumpingJackDetector();
  private pushup = new PushUpDetector();
  private phase: BattlePhase = 'camera_setup';
  private enteredAt = 0;
  private selected: AttackType | null = null;
  private candidate: AttackType | null = null;
  private reps = 0;
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
  private neutralInvalidAt: number | null = null;
  private neutralReady = false;
  private neutralObservedMs = 0;
  private neutralLastAt: number | null = null;
  private feedbackReliable = false;
  private visualReady = false;
  private pushupReadyRaw: boolean | null = null;
  private pushupReadyVisual = false;
  private pushupUncertainAt: number | null = null;
  private visualCandidate: AttackType | null = null;
  private candidateSince = 0;

  snapshot(now: number): BattleSnapshot {
    const duration = this.phase === 'battle_intro' ? C.introCountdownMs : this.phase === 'exercise_prepare' ? C.prepareCountdownMs : 0;
    const formFeedback = resolvePoseFeedback({ phase: this.phase, selectedAttack: this.selected,
      candidate: this.visualCandidate, ready: this.visualReady, squatResult: this.squat.getResult(),
      jumpingJackResult: this.jack.getResult(), pushupResult: this.pushup.getResult() });
    return { phase: this.phase, selectedAttack: this.selected, candidate: this.candidate,
      recoveryAvailable: ['selecting_attack', 'recovering'].includes(this.phase) && this.canRecover(),
      recoveryUsesLeft: RECOVERY.maxUsesPerFight - this.recoveryUses, recoveryCharges: this.recoveryCharges,
      recoveryPercent: recoveryHealPercent(this.round), recoveryFullHp: this.recoveryFullHp,
      recoveryNeedsMovement: !this.recoveryArmed,
      recoveryHoldMs: this.recoveryHoldMs, recoveryHealedHp: this.recoveryHealedHp,
      selectionLocked: this.phase !== 'selecting_attack', reps: this.reps,
      accumulatedDamage: this.selected ? calculateAttackDamage({ exercise: HANDS_FREE_ATTACKS[this.selected].exercise, correctReps: this.reps }) : 0,
      attackSecondsLeft: this.phase === 'performing_attack' ? Math.max(0, Math.ceil((C.attackDurationMs - (now - this.enteredAt)) / 1000)) : 0,
      countdown: this.phase === 'recovering' ? Math.max(1, Math.ceil((RECOVERY.holdDurationMs - this.recoveryHoldMs) / 1000)) :
        duration ? Math.max(0, Math.ceil((duration - (now - this.enteredAt)) / C.countdownStepMs)) : 0,
      pushupHoldMs: this.pushupHoldMs, squatPhase: this.squat.getResult().phase,
      jumpingJackPhase: this.jack.getResult().phase, feedback: this.feedback, formError: this.formError,
      tracking: this.tracking, go: this.phase === 'performing_attack' && now - this.enteredAt < C.goLabelMs,
      neutralProgress: Math.min(1, this.neutralObservedMs / C.neutralHoldMs), formFeedback,
      feedbackReliable: this.tracking && this.feedbackReliable, pushupReadyRaw: this.pushupReadyRaw,
      pushupReadyVisual: this.pushupReadyVisual,
      visualCandidate: this.phase === 'selecting_attack' ? this.visualCandidate : null,
      candidateDurationMs: this.phase === 'selecting_attack' && this.visualCandidate ? now - this.candidateSince : 0,
      activeDetector: this.phase === 'recovering' ? 'standing-recovery' : this.phase === 'selecting_attack' ? 'selection' : this.selected && this.phase === 'performing_attack' ?
        HANDS_FREE_ATTACKS[this.selected].exercise : this.selected && ['waiting_for_neutral', 'exercise_prepare', 'exercise_announcement'].includes(this.phase) ?
          `${HANDS_FREE_ATTACKS[this.selected].exercise}-ready` : 'none' };
  }

  advance(now: number, health: { playerHp: number; enemyHp: number; playerMaxHp?: number; recoveryCharges?: number; recoveryUses?: number }, frame?: PushUpFrame): BattleCommand[] {
    this.recoveryCharges = health.recoveryCharges ?? 0;
    this.recoveryUses = health.recoveryUses ?? 0;
    this.recoveryFullHp = health.playerHp >= (health.playerMaxHp ?? 100);
    if (this.phase === 'victory' || this.phase === 'defeat') return [];
    if (health.enemyHp <= 0) { this.enter('victory', now); return []; }
    if (health.playerHp <= 0) { this.enter('defeat', now); return []; }
    const fresh = !!frame && Number.isFinite(frame.timestampMs) && frame.timestampMs > this.lastPoseTimestamp;
    if (fresh) {
      this.lastPoseTimestamp = frame.timestampMs;
      if (now - this.lastFrameAt > C.maxFrameGapMs) this.loseTracking(now);
      this.lastFrameAt = now;
      this.tracking = !!frame.landmarks?.length;
      this.pushupReadyRaw = pushupReadyState(frame);
      const visual = pushupReadyState(frame, this.pushupReadyVisual);
      if (visual !== null) { this.pushupReadyVisual = visual; this.pushupUncertainAt = null; }
      else {
        this.pushupUncertainAt ??= now;
        if (now - this.pushupUncertainAt >= FORM_DISPLAY_CONFIG.trackingGraceMs) this.pushupReadyVisual = false;
      }
      if (!this.tracking) this.loseTracking(now);
      else if (this.feedback === 'Show your full body in the camera') this.feedback = null;
    } else if (now - this.lastFrameAt > C.maxFrameGapMs) this.loseTracking(now);

    const elapsed = now - this.enteredAt;
    switch (this.phase) {
      case 'camera_setup':
        if (fresh && frame.landmarks && (isStandingPose(frame) || isClosedPose(frame) || isPushupReadyPose(frame))) this.enter('battle_intro', now);
        break;
      case 'battle_intro':
        if (!this.tracking) this.enter('camera_setup', now);
        else if (elapsed >= C.introCountdownMs) this.enter('battle_fight', now);
        break;
      case 'battle_fight':
        if (!this.tracking) this.enter('camera_setup', now);
        else if (elapsed >= C.fightAnnouncementMs) this.enter('selecting_attack', now);
        break;
      case 'selecting_attack':
        if (fresh && this.tracking) {
          // Only deliberate, reliably tracked movement on the player's turn
          // enables another hold. Enemy damage and camera loss cannot rearm it.
          if (!this.recoveryArmed && readyPoseTrackingReliable(frame, 'basic') && readyPoseTrackingReliable(frame, 'fast')) {
            this.recoveryRearmAnchor ??= frame.landmarks;
            const moved = [11, 12, 15, 16, 23, 24, 27, 28].some(id =>
              Math.hypot(frame.landmarks![id].x - this.recoveryRearmAnchor![id].x, frame.landmarks![id].y - this.recoveryRearmAnchor![id].y) > RECOVERY.maxPoseDrift);
            if (!this.recoveryPose(frame) || moved) this.recoveryArmed = true;
          }
          this.selectFromFrame(frame, now);
          if (this.phase === 'selecting_attack' && !this.candidate && this.canRecover() && this.recoveryPose(frame)) {
            this.recoveryHoldMs = 0; this.recoveryLastAt = now; this.recoveryAnchor = frame.landmarks;
            this.enter('recovering', now);
          }
        }
        break;
      case 'attack_confirmed':
        if (elapsed >= C.selectionLockMs) this.enter('waiting_for_neutral', now);
        break;
      case 'waiting_for_neutral':
        if (fresh && this.tracking) {
          this.observeNeutral(frame, now);
          if (this.neutralReady && this.neutralObservedMs >= C.neutralHoldMs) this.enter('exercise_prepare', now);
        }
        break;
      case 'exercise_prepare':
      case 'exercise_announcement':
        if (fresh && this.tracking) this.observeNeutral(frame, now);
        // Brief landmark jitter pauses readiness without restarting three seconds.
        // Sustained movement resets preparation; GO always needs a fresh neutral frame.
        if (!this.tracking || this.neutralInvalidAt !== null && now - this.neutralInvalidAt >= C.neutralJitterMs) this.enter('waiting_for_neutral', now);
        else {
          if (fresh && this.neutralReady) this.preparationFrames.push(frame);
          if (this.phase === 'exercise_prepare' && elapsed >= C.prepareCountdownMs && fresh && this.neutralReady) {
            this.enter('exercise_announcement', now);
          } else if (this.phase === 'exercise_announcement' && elapsed >= C.exerciseAnnouncementMs && fresh && this.neutralReady) {
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
        // The deadline is checked before processing a frame: a late/incomplete
        // movement cannot leak into the finished set, even after a camera stall.
        if (elapsed >= C.attackDurationMs && this.selected) {
          const attack: BattleAttack = { id: crypto.randomUUID(), enemyId: this.enemyId,
            exercise: HANDS_FREE_ATTACKS[this.selected].exercise, correctReps: this.reps };
          this.enter('resolving_attack', now);
          this.resetDetectors();
          return [{ type: 'attack', attack }];
        }
        if (fresh && this.tracking && this.selected) {
          const result = this.selected === 'basic' ? this.squat.update(frame) : this.selected === 'fast' ? this.jack.update(frame) : this.pushup.update(frame);
          this.feedback = result.feedback;
          this.formError = result.formStatus === 'error';
          this.feedbackReliable = result.trackingStatus === 'ready';
          if (result.repJustCounted && !this.formError) {
            // Read the detector's cumulative identity, never increment from a
            // render or repeated event. pause() retains this count across gaps.
            this.reps = Math.max(this.reps, result.repCount);
          }
        }
        break;
      case 'recovering':
        if (!this.canRecover()) { this.cancelRecovery(); break; }
        if (fresh) {
          this.selectFromFrame(frame, now);
          // A completed attack gesture takes priority over idle recovery.
          if (this.phase !== 'recovering') { this.cancelRecovery(); break; }
          const moved = this.recoveryAnchor && frame.landmarks && [11, 12, 15, 16, 23, 24, 27, 28].some(id =>
            Math.hypot(frame.landmarks![id].x - this.recoveryAnchor![id].x, frame.landmarks![id].y - this.recoveryAnchor![id].y) > RECOVERY.maxPoseDrift);
          if (!this.tracking || !this.recoveryPose(frame) || moved) { this.cancelRecovery(); break; }
          this.visualReady = true;
          this.feedbackReliable = true;
          this.feedback = 'Hold still to recover · move to cancel';
          // Only consecutive fresh camera frames advance the five-second hold.
          if (this.recoveryLastAt !== null) this.recoveryHoldMs += Math.max(0, now - this.recoveryLastAt);
          this.recoveryLastAt = now;
          this.recoveryHoldMs = Math.min(RECOVERY.holdDurationMs, this.recoveryHoldMs);
          if (this.recoveryHoldMs >= RECOVERY.holdDurationMs) {
            this.recoveryUses++;
            this.recoveryCharges--;
            this.recoveryArmed = false;
            this.recoveryRearmAnchor = null;
            const maxHp = health.playerMaxHp ?? 100;
            this.recoveryHealedHp = Math.min(maxHp - health.playerHp, Math.round(maxHp * recoveryHealPercent(this.round) / 100));
            this.resetDetectors();
            this.enter('resolving_recovery', now);
            return [{ type: 'recover', useNumber: this.recoveryUses }];
          }
        }
        break;
      case 'resolving_recovery':
        if (elapsed >= C.resolveMs) this.enter('selecting_attack', now);
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
  private observeNeutral(frame: PushUpFrame, now: number) {
    const ready = this.neutral(frame);
    if (ready) {
      if (this.neutralReady && this.neutralLastAt !== null) this.neutralObservedMs += now - this.neutralLastAt;
      this.neutralInvalidAt = null;
      this.feedback = 'Position detected · hold still';
    } else {
      this.neutralInvalidAt ??= now;
      if (now - this.neutralInvalidAt >= C.neutralJitterMs) this.neutralObservedMs = 0;
      this.feedback = this.selected === 'basic' ? standingPoseFeedback(frame) :
        this.selected === 'fast' ? 'Bring feet together and lower both hands' : 'Hold a straight top plank with wrists and ankles visible';
    }
    this.neutralReady = ready;
    this.feedbackReliable = readyPoseTrackingReliable(frame, this.selected!);
    this.visualReady = this.selected === 'strong' ? this.pushupReadyVisual : ready;
    this.neutralLastAt = now;
  }
  private selectFromFrame(frame: PushUpFrame, now: number) {
    const squat = this.squat.update(frame);
    if (squat.repJustCounted && squat.formStatus !== 'error' && now - this.lastSelected.basic >= C.squatSelectionCooldownMs) { this.select('basic', now); return; }
    const jack = this.jack.update(frame);
    if (jack.repJustCounted && jack.formStatus !== 'error' && now - this.lastSelected.fast >= C.jumpingJackSelectionCooldownMs) { this.select('fast', now); return; }
    // Selection recognizes gestures; full form feedback belongs to performing_attack.
    if (isPushupReadyPose(frame)) {
      const moved = this.pushupAnchor && [11, 12, 23, 24, 27, 28].some(id =>
        (frame.landmarks![id].visibility ?? 0) >= C.minVisibility &&
        Math.hypot(frame.landmarks![id].x - this.pushupAnchor![id].x, frame.landmarks![id].y - this.pushupAnchor![id].y) > C.pushupMaxDrift);
      if (this.pushupHoldAt === null || moved) { this.pushupHoldAt = now; this.pushupAnchor = frame.landmarks; }
      this.pushupHoldMs = now - this.pushupHoldAt;
      this.candidate = 'strong';
      this.feedback = null;
      this.formError = false;
      this.updateVisualCandidate('strong', now);
      this.feedbackReliable = true;
      if (this.pushupHoldMs >= C.pushupPoseHoldMs) this.select('strong', now);
      return;
    }
    this.clearPushupHold();
    this.candidate = squat.trackingStatus === 'ready' && squat.phase !== 'standing' ? 'basic' :
      jack.trackingStatus === 'ready' && jack.phase !== 'closed' ? 'fast' : null;
    this.updateVisualCandidate(this.pushupReadyVisual ? 'strong' : this.candidate, now);
    this.feedbackReliable = this.visualCandidate === 'strong' ? this.pushupReadyRaw !== null :
      squat.trackingStatus === 'ready' || squat.trackingStatus === 'calibrating' || jack.trackingStatus === 'ready';
    this.feedback = this.candidate ? 'Gesture detected · complete the movement' :
      squat.trackingStatus === 'calibrating' ? 'Stand upright for squat calibration' : null;
    this.formError = false;
  }
  private updateVisualCandidate(candidate: AttackType | null, now: number) {
    if (candidate !== this.visualCandidate) this.candidateSince = now;
    this.visualCandidate = candidate;
  }
  private select(attack: AttackType, now: number) {
    this.selected = attack;
    this.lastSelected[attack] = now;
    this.reps = 0;
    this.resetDetectors();
    this.enter('attack_confirmed', now);
  }
  private enter(phase: BattlePhase, now: number) {
    this.phase = phase; this.enteredAt = now;
    this.feedback = null; this.formError = false;
    this.visualReady = false;
    if (phase === 'exercise_prepare' || phase === 'waiting_for_neutral') this.preparationFrames = [];
    if (phase === 'waiting_for_neutral') {
      this.neutralObservedMs = 0; this.neutralInvalidAt = null; this.neutralLastAt = null; this.neutralReady = false;
    }
    if (phase === 'selecting_attack') {
      this.selected = null; this.candidate = null; this.reps = 0; this.resetDetectors();
      this.updateVisualCandidate(null, now); this.pushupReadyVisual = false;
    }
  }
  private clearPushupHold() { this.pushupHoldAt = null; this.pushupAnchor = null; this.pushupHoldMs = 0; }
  private resetDetectors() { this.squat.reset(); this.jack.reset(); this.pushup.reset(); this.clearPushupHold(); }
  private loseTracking(now: number) {
    this.cancelRecovery();
    if (this.phase === 'exercise_prepare' || this.phase === 'exercise_announcement') this.enter('waiting_for_neutral', now);
    if (this.phase === 'battle_intro' || this.phase === 'battle_fight') this.enter('camera_setup', now);
    this.tracking = false; this.candidate = null; this.clearPushupHold();
    this.neutralObservedMs = 0; this.neutralInvalidAt = null; this.neutralLastAt = null; this.neutralReady = false;
    this.squat.pause(); this.jack.pause(); this.pushup.pause();
    this.feedback = 'Show your full body in the camera'; this.formError = false;
    this.feedbackReliable = false; this.pushupReadyRaw = null;
    this.pushupReadyVisual = false; this.pushupUncertainAt = null; this.updateVisualCandidate(null, now);
  }
}
