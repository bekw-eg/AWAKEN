import type { BattleAttack } from '../../game/exerciseDamage';
import type { GameState, ExerciseEvent } from '../../game/types';
import { CameraView } from '../Camera/CameraView';
import { Icon } from '../UI/Icon';
import { FighterStatus } from './FighterStatus';
import { HandsFreeStatus } from './HandsFreeStatus';
import { HANDS_FREE_ATTACKS } from '../../game/handsFreeConfig';
import { useHandsFreeBattle } from '../../hooks/useHandsFreeBattle';
import { BattleOverlay } from './BattleOverlay';
import { battleOverlay } from '../../game/battleOverlay';
import { BossCharacter } from '../Boss/BossCharacter';
import { useBossAnimation } from '../../hooks/useBossAnimation';
import './BattleScreen.css';
import { RoundTransition } from './RoundTransition';

type Props = {
  state: GameState; onBattleAttack: (attack: BattleAttack) => void; onExerciseEvent: (event: ExerciseEvent) => void;
  onEnemyAttack: () => void; onFlee: () => void; autoStart?: boolean; mirrored?: boolean;
  terminal?: boolean; repeated?: boolean;
  onRecover: (useNumber: number) => void;
  onRoundDeathComplete: (enemyId: string) => void; onNextRound: (enemyId: string) => void;
  onSkipRound: () => void;
};
export function BattleScreen({ state, onExerciseEvent, onBattleAttack, onEnemyAttack, onRecover, onRoundDeathComplete, onNextRound, onSkipRound, onFlee, autoStart, mirrored, terminal = false }: Props) {
  const { player, currentEnemy } = state;
  const roundEnding = state.roundPhase !== 'active';
  const { snapshot, onPoseFrame } = useHandsFreeBattle({ playerHp: player.hp, playerMaxHp: player.maxHp,
    enemyHp: currentEnemy?.hp ?? 0, enemyId: currentEnemy?.id, round: state.currentEnemyIndex,
    recoveryCharges: state.recoveryCharges, recoveryUses: state.recoveryUses,
    terminal: terminal || roundEnding, onBattleAttack, onEnemyAttack, onRecover });
  const selectedExercise = snapshot.selectedAttack ? HANDS_FREE_ATTACKS[snapshot.selectedAttack].exercise : 'squat';
  const animation = useBossAnimation(currentEnemy, snapshot.phase, terminal);
  const debug = import.meta.env.DEV && new URLSearchParams(window.location.search).has('battleDebug');
  if (!currentEnemy) return null;
  return <div className={'battle-screen' + (terminal ? ' terminal-battle' : '')} data-attack-phase={snapshot.phase} data-attack-damage={snapshot.accumulatedDamage} data-round-phase={state.roundPhase}>
    <BattleOverlay announcement={roundEnding ? null : battleOverlay(snapshot)} />
    <header className="battle-header"><button className="text-button" onClick={onFlee}><Icon name="ArrowLeft" />Journey</button><div><p className="eyebrow">HANDS-FREE COMBAT</p><h1>{currentEnemy.isBoss ? 'Boss fight' : 'Battle arena'}</h1></div><span className="badge"><Icon name="Flag" />ENCOUNTER {String(state.currentEnemyIndex).padStart(2, '0')}</span></header>
    <div className="combatants">
      <FighterStatus name="Player" level={player.level} hp={player.hp} maxHp={player.maxHp} />
      <span className="versus">VS</span>
      <FighterStatus key={currentEnemy.id} name={currentEnemy.name} hp={currentEnemy.hp} maxHp={currentEnemy.maxHp} enemy boss={currentEnemy.isBoss} attack={selectedExercise} />
    </div>
    {currentEnemy.isBoss && <BossCharacter state={terminal ? 'idle' : animation.state}
      hp={currentEnemy.hp} maxHp={currentEnemy.maxHp} eventId={terminal ? 0 : animation.id} paused={terminal && currentEnemy.hp > 0} />}
    {roundEnding && <RoundTransition key={currentEnemy.id} enemyId={currentEnemy.id} phase={state.roundPhase}
      onDeathComplete={onRoundDeathComplete} onNextRound={onNextRound} onSkip={onSkipRound} />}
    <CameraView onExerciseEvent={onExerciseEvent} onPoseFrame={onPoseFrame} forcedExerciseType={selectedExercise}
      hideSelector autoStart={autoStart} mirrored={mirrored} suspended={terminal}
      formFeedback={snapshot.formFeedback} formFeedbackReliable={snapshot.feedbackReliable} poseDebugContext={snapshot}
      formFeedbackSource={`${snapshot.selectedAttack ?? 'selection'}:${['waiting_for_neutral', 'exercise_prepare', 'exercise_announcement'].includes(snapshot.phase) ? 'prepare' : snapshot.phase}`}
      trackingPanel={roundEnding ? <p className="hands-free-status">{state.roundPhase === 'enemy_defeated' ? 'ENEMY DEFEATED' : 'NEXT ROUND INCOMING'}</p> :
        <HandsFreeStatus battle={snapshot} debug={debug} />} />
  </div>;
}
