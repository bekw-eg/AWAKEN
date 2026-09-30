import { useEffect, useRef, useState } from 'react';
import type { Enemy } from '../game/types';
import { emitMotionEvent } from '../motion/Motion';
import { BOSS_IMPACT, BOSS_TIMING, type BossAnimationState } from '../components/Boss/BossCharacter';

const ENEMY_ATTACK_INTERVAL = 5000;
type Animation = { state: BossAnimationState; id: number };

/** Owns the existing enemy cadence; visual windups never apply damage. */
export function useEnemyAttackAnimation(enemy: Enemy | null, terminal: boolean, onEnemyAttack: () => void) {
  const [seconds, setSeconds] = useState(5);
  const [animation, setAnimation] = useState<Animation>({ state: 'idle', id: 0 });
  const previous = useRef(enemy);
  const strikes = useRef(0);

  useEffect(() => {
    const before = previous.current;
    previous.current = enemy;
    if (before?.id !== enemy?.id) strikes.current = 0;
    const hurt = enemy?.isBoss && before?.id === enemy.id && enemy.hp < before.hp;
    setAnimation(value => ({ state: !terminal && hurt ? 'hurt' : 'idle', id: value.id + 1 }));
    if (!enemy || enemy.hp <= 0 || terminal) return;

    // Preserve the original five-second interval and its reset on enemy HP changes.
    let nextStrike = Date.now() + ENEMY_ATTACK_INTERVAL;
    let windup: ReturnType<typeof setTimeout>;
    const prepare = () => {
      if (!enemy.isBoss) return;
      // Alternate presentation only: both attacks use the unchanged reducer damage.
      const state = strikes.current % 2 ? 'heavyAttack' : 'attack';
      windup = setTimeout(() => setAnimation(value => ({ state, id: value.id + 1 })), ENEMY_ATTACK_INTERVAL - BOSS_IMPACT[state]);
    };
    setSeconds(ENEMY_ATTACK_INTERVAL / 1000);
    prepare();
    const timer = setInterval(() => {
      emitMotionEvent({ type: 'boss-attack', target: 'player' });
      onEnemyAttack();
      strikes.current++;
      nextStrike = Date.now() + ENEMY_ATTACK_INTERVAL;
      prepare();
    }, ENEMY_ATTACK_INTERVAL);
    const countdown = setInterval(() => setSeconds(Math.max(0, (nextStrike - Date.now()) / 1000)), 100);
    return () => { clearInterval(timer); clearInterval(countdown); clearTimeout(windup); };
  }, [enemy, terminal, onEnemyAttack]);

  useEffect(() => {
    if (terminal || animation.state === 'idle' || animation.state === 'death') return;
    const timer = setTimeout(() => setAnimation(value => ({ ...value, state: 'idle' })), BOSS_TIMING[animation.state]);
    return () => clearTimeout(timer);
  }, [animation, terminal]);

  return { seconds, animation };
}
