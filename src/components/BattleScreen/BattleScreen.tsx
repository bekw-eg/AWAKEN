import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState, ExerciseType, ExerciseEvent } from '../../game/types';
import { CameraView } from '../Camera/CameraView';
import { Icon } from '../UI/Icon';
import { AttackSelector } from './AttackSelector';
import { FighterStatus } from './FighterStatus';
import { BattleStatus, type BattleFeedback } from './BattleStatus';
import { BattleIntro } from './BattleIntro';
import { emitMotionEvent, useValueChange } from '../../motion/Motion';
import './BattleScreen.css';

type Props = {
  state: GameState; onExerciseEvent: (event: ExerciseEvent) => void;
  onEnemyAttack: () => void; onFlee: () => void; autoStart?: boolean; mirrored?: boolean;
  terminal?: boolean; repeated?: boolean;
};
export function BattleScreen({ state, onExerciseEvent, onEnemyAttack, onFlee, autoStart, mirrored, terminal = false, repeated = false }: Props) {
  const { player, currentEnemy } = state;
  const [selectedAttack, setSelectedAttack] = useState<ExerciseType>('squat');
  const [seconds, setSeconds] = useState(5);
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

  // Preserve the existing cadence, including its reset on every enemy HP change.
  useEffect(() => {
    if (!currentEnemy || terminal) return;
    let nextStrike = Date.now() + 5000;
    setSeconds(5);
    const timer = setInterval(() => {
      emitMotionEvent({ type: 'boss-attack', target: 'player' });
      onEnemyAttack();
      nextStrike = Date.now() + 5000;
    }, 5000);
    const countdown = setInterval(() => setSeconds(Math.max(0, (nextStrike - Date.now()) / 1000)), 100);
    return () => { clearInterval(timer); clearInterval(countdown); };
  }, [currentEnemy, onEnemyAttack, terminal]);

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
    {!terminal && <BattleIntro enemy={currentEnemy} repeated={repeated} />}
    <header className="battle-header"><button className="text-button" onClick={onFlee}><Icon name="ArrowLeft" />Journey</button><div><p className="eyebrow">TRAINING GROUNDS</p><h1>{currentEnemy.isBoss ? 'Boss fight' : 'Battle arena'}</h1></div><span className="badge"><Icon name="Flag" />ENCOUNTER {String(state.currentEnemyIndex).padStart(2, '0')}</span></header>
    <div className="combatants">
      <FighterStatus name="Player" level={player.level} hp={player.hp} maxHp={player.maxHp} />
      <span className="versus">VS</span>
      <FighterStatus name={currentEnemy.name} hp={currentEnemy.hp} maxHp={currentEnemy.maxHp} enemy boss={currentEnemy.isBoss} attack={lastAttack.current} />
    </div>
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
