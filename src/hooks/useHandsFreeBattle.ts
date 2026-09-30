import { useCallback, useEffect, useRef, useState } from 'react';
import type { PushUpFrame } from '../exercise-engine/pushUpTypes';
import type { ExerciseEvent } from '../game/types';
import { HandsFreeBattleController } from '../game/handsFreeBattleController';
import { HANDS_FREE_CONFIG } from '../game/handsFreeConfig';
import { emitMotionEvent } from '../motion/Motion';

export function useHandsFreeBattle({ playerHp, enemyHp, terminal, onExerciseEvent, onEnemyAttack }: {
  playerHp: number; enemyHp: number; terminal: boolean;
  onExerciseEvent: (event: ExerciseEvent) => void; onEnemyAttack: () => void;
}) {
  const [controller] = useState(() => new HandsFreeBattleController());
  const [snapshot, setSnapshot] = useState(() => controller.snapshot(performance.now()));
  const latest = useRef({ playerHp, enemyHp, terminal, onExerciseEvent, onEnemyAttack });
  useEffect(() => { latest.current = { playerHp, enemyHp, terminal, onExerciseEvent, onEnemyAttack }; });
  const advance = useCallback((frame?: PushUpFrame) => {
    const current = latest.current, now = performance.now();
    const commands = controller.advance(now, current, frame);
    const next = controller.snapshot(now);
    // Timer ticks should not re-render the whole camera and arena when nothing
    // visible changed (the pose pipeline already supplies up to 20 fps).
    setSnapshot(previous => (Object.keys(next) as (keyof typeof next)[]).every(key => previous[key] === next[key]) ? previous : next);
    if (current.terminal) return;
    for (const command of commands) {
      if (command.type === 'attack') {
        emitMotionEvent({ type: 'attack', exercise: command.event.exercise });
        current.onExerciseEvent(command.event);
      } else {
        emitMotionEvent({ type: 'boss-attack', target: 'player' });
        current.onEnemyAttack();
      }
    }
  }, [controller]);
  useEffect(() => {
    if (terminal) { advance(); return; }
    const timer = setInterval(() => advance(), HANDS_FREE_CONFIG.uiTickMs);
    return () => clearInterval(timer);
  }, [advance, terminal]);
  return { snapshot, onPoseFrame: advance };
}
