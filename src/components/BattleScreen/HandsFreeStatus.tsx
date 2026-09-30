import type { BattleSnapshot } from '../../game/handsFreeBattleController';
import { HANDS_FREE_ATTACKS, HANDS_FREE_CONFIG, type AttackType } from '../../game/handsFreeConfig';

export function HandsFreeStatus({ battle, debug = false }: { battle: BattleSnapshot; debug?: boolean }) {
  const attack = battle.selectedAttack ? HANDS_FREE_ATTACKS[battle.selectedAttack] : null;
  const { phase } = battle;
  const title = phase === 'camera_setup' ? 'WAITING FOR PLAYER' : phase === 'battle_intro' ? 'PLAYER DETECTED' : phase === 'battle_fight' ? 'FIGHT!' :
    phase === 'selecting_attack' ? 'SELECT YOUR ATTACK' : phase === 'attack_confirmed' ? `${attack?.name} ATTACK SELECTED` :
    phase === 'waiting_for_neutral' || phase === 'exercise_prepare' || phase === 'exercise_announcement' || phase === 'turn_prepare' ? 'GET READY' :
    phase === 'performing_attack' ? battle.go ? 'GO!' : `${attack?.name} ATTACK` :
    phase === 'resolving_attack' ? `${attack?.name} ATTACK · HIT!` : phase === 'enemy_turn' ? 'ENEMY TURN' : phase.toUpperCase();
  const guidance = phase === 'camera_setup' ? 'Allow your camera and show your full body.' : phase === 'battle_intro' ? 'BATTLE START' :
    phase === 'selecting_attack' ? 'MOVE YOUR BODY TO SELECT' : phase === 'attack_confirmed' ? 'Selection complete. The next reps power your attack.' :
    phase === 'waiting_for_neutral' || phase === 'exercise_prepare' || phase === 'exercise_announcement' ? attack?.neutral :
    phase === 'performing_attack' ? attack?.movement : phase === 'turn_prepare' ? 'Your next move is coming.' :
    phase === 'enemy_turn' ? 'Enemy attacks automatically.' : null;
  return <section className="hands-free-status" aria-label="Hands-free battle" data-phase={phase}>
    <p className="eyebrow">THE BODY IS THE CONTROLLER</p>
    <div role="status" aria-live="polite" aria-atomic="true"><h2>{title}</h2><p>{guidance}</p></div>
    {battle.countdown > 0 && <strong className="hands-free-countdown" aria-label={`Countdown ${battle.countdown}`}>{battle.countdown}</strong>}
    {phase === 'waiting_for_neutral' && <div className="neutral-readiness">
      <span>START POSITION · {Math.round(battle.neutralProgress * 100)}%</span>
      <progress aria-label="Starting position readiness" value={battle.neutralProgress} max={1} />
    </div>}
    {attack && ['performing_attack', 'resolving_attack'].includes(phase) &&
      <strong className="hands-free-countdown" aria-live="polite" aria-label="Attack repetitions">{battle.reps} / {attack.reps}</strong>}
    {phase === 'selecting_attack' && <div className="gesture-choices" aria-label="Attack gestures">
      {(Object.keys(HANDS_FREE_ATTACKS) as AttackType[]).map(key => <div key={key} className={`gesture-choice${battle.candidate === key ? ' detecting' : ''}`}>
        <strong>{HANDS_FREE_ATTACKS[key].name}</strong><span>{HANDS_FREE_ATTACKS[key].selection}</span>
        <small>{battle.candidate === key ? `DETECTING ${HANDS_FREE_ATTACKS[key].name}…` : `Then ${HANDS_FREE_ATTACKS[key].reps} new ${HANDS_FREE_ATTACKS[key].movement.toLowerCase()}`}</small>
        {key === 'strong' && <progress aria-label="Strong stance hold" value={battle.pushupHoldMs} max={HANDS_FREE_CONFIG.pushupPoseHoldMs} />}
      </div>)}
    </div>}
    {['selecting_attack', 'waiting_for_neutral', 'exercise_prepare', 'exercise_announcement', 'performing_attack'].includes(phase) &&
      <p className={`hands-free-hint${battle.formError ? ' form-error' : ''}`} role="status">
        {!battle.tracking ? 'TRACKING LOST · Show your full body in the camera' : battle.formError ? `FORM ERROR · ${battle.feedback}` : battle.feedback}
      </p>}
    <p className="hands-free-camera-tip">Squats and jacks: face the camera. Push-ups: turn sideways with wrists and ankles in view.</p>
    {debug && <pre className="hands-free-debug" aria-label="Battle debug">{[
      `Phase: ${phase}`, `Candidate: ${battle.candidate ?? 'none'}`, `Squat: ${battle.squatPhase}`,
      `JumpingJack: ${battle.jumpingJackPhase}`, `PushupHold: ${Math.round(battle.pushupHoldMs)} / ${HANDS_FREE_CONFIG.pushupPoseHoldMs} ms`,
      `SelectionLocked: ${battle.selectionLocked}`, `SelectedAttack: ${battle.selectedAttack ?? 'none'}`,
      `Tracking: ${battle.tracking}`, `Neutral: ${Math.round(battle.neutralProgress * 100)}%`, `Hint: ${battle.feedback ?? 'none'}`,
    ].join('\n')}</pre>}
  </section>;
}
