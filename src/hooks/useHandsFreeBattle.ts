import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PushUpFrame } from '../exercise-engine/pushUpTypes';
import type { ExerciseEvent } from '../game/types';
import { HandsFreeBattleController } from '../game/handsFreeBattleController';
import { HANDS_FREE_CONFIG } from '../game/handsFreeConfig';
import { emitMotionEvent } from '../motion/Motion';

export function useHandsFreeBattle({ playerHp, playerMaxHp = 100, enemyHp, enemyId, round = 1, recoveryCharges = 0, recoveryUses = 0, terminal, onExerciseEvent, onEnemyAttack, onRecover }: {
  playerHp: number; enemyHp: number; terminal: boolean;
  playerMaxHp?: number; enemyId?: string; round?: number; recoveryCharges?: number; recoveryUses?: number; onRecover?: (useNumber: number) => void;
  onExerciseEvent: (event: ExerciseEvent) => void; onEnemyAttack: () => void;
}) {
  const controller = useMemo(() => new HandsFreeBattleController(round), [enemyId, round]);
  const [snapshot, setSnapshot] = useState(() => controller.snapshot(performance.now()));
  const latest = useRef({ playerHp, playerMaxHp, enemyHp, recoveryCharges, recoveryUses, terminal, onExerciseEvent, onEnemyAttack, onRecover });
  useLayoutEffect(() => { latest.current = { playerHp, playerMaxHp, enemyHp, recoveryCharges, recoveryUses, terminal, onExerciseEvent, onEnemyAttack, onRecover }; });
  const advance = useCallback((frame?: PushUpFrame) => {
    const current = latest.current, now = performance.now();
    const commands = controller.advance(now, { ...current, recoveryCharges: current.onRecover ? current.recoveryCharges : 0 }, frame);
    const next = controller.snapshot(now);
    // Timer ticks should not re-render the whole camera and arena when nothing
    // visible changed (the pose pipeline already supplies up to 20 fps).
    setSnapshot(previous => (Object.keys(next) as (keyof typeof next)[]).every(key => previous[key] === next[key]) ? previous : next);
    if (current.terminal) return;
    for (const command of commands) {
      if (command.type === 'attack') {
        emitMotionEvent({ type: 'attack', exercise: command.event.exercise });
        current.onExerciseEvent(command.event);
      } else if (command.type === 'recover') {
        current.onRecover?.(command.useNumber);
      } else {
        emitMotionEvent({ type: 'boss-attack', target: 'player' });
        current.onEnemyAttack();
      }
    }
  }, [controller]);
  useEffect(() => {
    advance();
    if (terminal) return;
    const timer = setInterval(() => advance(), HANDS_FREE_CONFIG.uiTickMs);
    return () => clearInterval(timer);
  }, [advance, terminal]);
  return { snapshot, onPoseFrame: advance };
}
