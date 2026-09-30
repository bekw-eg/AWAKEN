import type { GameState, ExerciseEvent } from '../../game/types';
import { CameraView } from '../Camera/CameraView';
import { Icon } from '../UI/Icon';
import { FighterStatus } from './FighterStatus';
import { HandsFreeStatus } from './HandsFreeStatus';
import { HANDS_FREE_ATTACKS } from '../../game/handsFreeConfig';
import { useHandsFreeBattle } from '../../hooks/useHandsFreeBattle';
import './BattleScreen.css';

type Props = {
  state: GameState; onExerciseEvent: (event: ExerciseEvent) => void;
  onEnemyAttack: () => void; onFlee: () => void; autoStart?: boolean; mirrored?: boolean;
  terminal?: boolean; repeated?: boolean;
};
export function BattleScreen({ state, onExerciseEvent, onEnemyAttack, onFlee, autoStart, mirrored, terminal = false }: Props) {
  const { player, currentEnemy } = state;
  const { snapshot, onPoseFrame } = useHandsFreeBattle({ playerHp: player.hp, enemyHp: currentEnemy?.hp ?? 0,
    terminal, onExerciseEvent, onEnemyAttack });
  const selectedExercise = snapshot.selectedAttack ? HANDS_FREE_ATTACKS[snapshot.selectedAttack].exercise : 'squat';
  const debug = import.meta.env.DEV && new URLSearchParams(window.location.search).has('battleDebug');
  if (!currentEnemy) return null;
  return <div className={'battle-screen' + (terminal ? ' terminal-battle' : '')}>
    <header className="battle-header"><button className="text-button" onClick={onFlee}><Icon name="ArrowLeft" />Journey</button><div><p className="eyebrow">HANDS-FREE COMBAT</p><h1>{currentEnemy.isBoss ? 'Boss fight' : 'Battle arena'}</h1></div><span className="badge"><Icon name="Flag" />ENCOUNTER {String(state.currentEnemyIndex).padStart(2, '0')}</span></header>
    <div className="combatants">
      <FighterStatus name="Player" level={player.level} hp={player.hp} maxHp={player.maxHp} />
      <span className="versus">VS</span>
      <FighterStatus name={currentEnemy.name} hp={currentEnemy.hp} maxHp={currentEnemy.maxHp} enemy boss={currentEnemy.isBoss} attack={selectedExercise} />
    </div>
    <CameraView onExerciseEvent={onExerciseEvent} onPoseFrame={onPoseFrame} forcedExerciseType={selectedExercise}
      hideSelector autoStart={autoStart} mirrored={mirrored} suspended={terminal}
      trackingPanel={<HandsFreeStatus battle={snapshot} debug={debug} />} />
  </div>;
}
