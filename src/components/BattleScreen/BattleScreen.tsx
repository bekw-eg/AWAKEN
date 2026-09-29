import { useState, useEffect, useRef } from 'react';
import type { GameState, ExerciseType, ExerciseEvent } from '../../game/types';
import { CameraView } from '../Camera/CameraView';
import { Icon } from '../UI/Icon';
import { AttackSelector } from './AttackSelector';
import { FighterStatus } from './FighterStatus';
import { BattleStatus, type BattleFeedback } from './BattleStatus';
import './BattleScreen.css';

type Props = {
  state: GameState;
  onExerciseEvent: (event: ExerciseEvent) => void;
  onEnemyAttack: () => void;
  onFlee: () => void;
  autoStart?: boolean;
  mirrored?: boolean;
};

export function BattleScreen({ state, onExerciseEvent, onEnemyAttack, onFlee, autoStart, mirrored }: Props) {
  const { player, currentEnemy } = state;
  const [selectedAttack, setSelectedAttack] = useState<ExerciseType>('squat');
  const [seconds, setSeconds] = useState(5);
  const [feedback, setFeedback] = useState<BattleFeedback>(null);
  const previousHealth = useRef({ player: player.hp, enemy: currentEnemy?.hp ?? 0 });

  // Preserve the existing five-second attack loop, including its reset when the enemy changes.
  useEffect(() => {
    if (!currentEnemy) return;
    let nextStrike = Date.now() + 5000;
    setSeconds(5);
    const timer = setInterval(() => {
      onEnemyAttack();
      nextStrike = Date.now() + 5000;
    }, 5000);
    const countdown = setInterval(() => setSeconds(Math.max(0, (nextStrike - Date.now()) / 1000)), 100);
    return () => { clearInterval(timer); clearInterval(countdown); };
  }, [currentEnemy, onEnemyAttack]);

  useEffect(() => {
    const previous = previousHealth.current;
    const enemyHp = currentEnemy?.hp ?? 0;
    previousHealth.current = { player: player.hp, enemy: enemyHp };
    const damageToEnemy = previous.enemy - enemyHp;
    const damageToPlayer = previous.player - player.hp;
    if (damageToEnemy <= 0 && damageToPlayer <= 0) return;
    setFeedback(damageToEnemy > 0 ? { kind: 'player', damage: damageToEnemy } : { kind: 'enemy', damage: damageToPlayer });
    const timer = setTimeout(() => setFeedback(null), 1500);
    return () => clearTimeout(timer);
  }, [currentEnemy?.hp, player.hp]);

  if (!currentEnemy) return null;
  return <div className="battle-screen">
    <header className="battle-header"><button className="text-button" onClick={onFlee}><Icon name="ArrowLeft" />Journey</button><div><p className="eyebrow">TRAINING GROUNDS</p><h1>{currentEnemy.isBoss ? 'Boss fight' : 'Battle arena'}</h1></div><span className="badge"><Icon name="Flag" />ENCOUNTER {String(state.currentEnemyIndex).padStart(2, '0')}</span></header>
    <div className="combatants">
      <FighterStatus name="Player" level={player.level} hp={player.hp} maxHp={player.maxHp} damage={feedback?.kind === 'enemy' ? feedback.damage : 0} />
      <span className="versus">VS</span>
      <FighterStatus name={currentEnemy.name} hp={currentEnemy.hp} maxHp={currentEnemy.maxHp} enemy boss={currentEnemy.isBoss} damage={feedback?.kind === 'player' ? feedback.damage : 0} />
    </div>
    <CameraView onExerciseEvent={onExerciseEvent} forcedExerciseType={selectedAttack} onExerciseChange={setSelectedAttack} hideSelector autoStart={autoStart} mirrored={mirrored}>
      {(telemetry) => <>
        <BattleStatus telemetry={telemetry} selected={selectedAttack} feedback={feedback} seconds={seconds} />
        <AttackSelector selected={selectedAttack} onSelect={(attack) => { setSelectedAttack(attack); setFeedback(null); }} player={player}
          performing={telemetry.active && telemetry.isPersonDetected && telemetry.trackingStatus === 'ready' && !['standing', 'top', 'closed'].includes(telemetry.phase)}
          completed={feedback?.kind === 'player'} disabled={player.hp <= 0 || currentEnemy.hp <= 0} />
      </>}
    </CameraView>
  </div>;
}
