import type { GameState, ExerciseEvent } from '../../game/types';
import { CameraView } from '../Camera/CameraView';
import { Icon } from '../UI/Icon';
import { FighterStatus } from './FighterStatus';
import { BattleStatus, type BattleFeedback } from './BattleStatus';
import { BattleIntro } from './BattleIntro';
import { emitMotionEvent, useValueChange } from '../../motion/Motion';
import { BossCharacter } from '../Boss/BossCharacter';
import { useEnemyAttackAnimation } from '../../hooks/useEnemyAttackAnimation';
import './BattleScreen.css';

type Props = {
  state: GameState; onExerciseEvent: (event: ExerciseEvent) => void;
  onEnemyAttack: () => void; onFlee: () => void; autoStart?: boolean; mirrored?: boolean;
  terminal?: boolean; repeated?: boolean;
};
export function BattleScreen({ state, onExerciseEvent, onEnemyAttack, onFlee, autoStart, mirrored, terminal = false }: Props) {
  const { player, currentEnemy } = state;
  const [selectedAttack, setSelectedAttack] = useState<ExerciseType>('squat');
  const { seconds, animation } = useEnemyAttackAnimation(currentEnemy, terminal, onEnemyAttack);
  const [feedback, setFeedback] = useState<BattleFeedback>(null);
  const lastAttack = useRef<ExerciseType>('squat');
  const attackSerial = useRef(0);
  const [attackEvent, setAttackEvent] = useState(0);
  const confirmExercise = useCallback((event: ExerciseEvent) => {
    if (terminal) return;
    if (event.status === 'correct') {
      lastAttack.current = event.exercise;
      setAttackEvent(++attackSerial.current);
      emitMotionEvent({ type: 'attack', exercise: event.exercise });
    }
    onExerciseEvent(event);
  }, [onExerciseEvent, terminal]);

  useValueChange(currentEnemy?.hp ?? 0, (before, after) => {
    if (after < before) setFeedback({ kind: 'player', damage: before - after, id: ++attackSerial.current });
  });
  useValueChange(player.hp, (before, after) => {
    if (after < before) setFeedback({ kind: 'enemy', damage: before - after, id: ++attackSerial.current });
  });
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 1500);
    return () => clearTimeout(timer);
  }, [feedback]);

  if (!currentEnemy) return null;
  return <div className={'battle-screen' + (terminal ? ' terminal-battle' : '')}>
    <BattleOverlay announcement={battleOverlay(snapshot)} />
    <header className="battle-header"><button className="text-button" onClick={onFlee}><Icon name="ArrowLeft" />Journey</button><div><p className="eyebrow">HANDS-FREE COMBAT</p><h1>{currentEnemy.isBoss ? 'Boss fight' : 'Battle arena'}</h1></div><span className="badge"><Icon name="Flag" />ENCOUNTER {String(state.currentEnemyIndex).padStart(2, '0')}</span></header>
    <div className="combatants">
      <FighterStatus name="Player" level={player.level} hp={player.hp} maxHp={player.maxHp} />
      <span className="versus">VS</span>
      <FighterStatus name={currentEnemy.name} hp={currentEnemy.hp} maxHp={currentEnemy.maxHp} enemy boss={currentEnemy.isBoss} attack={selectedExercise} />
    </div>
    {currentEnemy.isBoss && <BossCharacter state={terminal ? currentEnemy.hp <= 0 ? 'death' : 'idle' : animation.state}
      hp={currentEnemy.hp} maxHp={currentEnemy.maxHp} eventId={terminal ? 0 : animation.id} paused={terminal && currentEnemy.hp > 0} />}
    <CameraView onExerciseEvent={confirmExercise} forcedExerciseType={selectedAttack} onExerciseChange={setSelectedAttack} hideSelector autoStart={autoStart} mirrored={mirrored} suspended={terminal}>
      {(telemetry) => <>
        <BattleStatus telemetry={telemetry} selected={selectedAttack} feedback={feedback} seconds={seconds} terminal={terminal} />
        <AttackSelector selected={selectedAttack} onSelect={attack => { setSelectedAttack(attack); setFeedback(null); }} player={player} eventId={attackEvent}
          performing={telemetry.active && telemetry.isPersonDetected && telemetry.trackingStatus === 'ready' && !['standing', 'top', 'closed'].includes(telemetry.phase)}
          completed={feedback?.kind === 'player'} disabled={terminal} />
      </>}
    </CameraView>
  </div>;
}
