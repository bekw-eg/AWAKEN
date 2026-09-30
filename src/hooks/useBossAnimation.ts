import { useEffect, useRef, useState } from 'react';
import type { Enemy } from '../game/types';
import type { BattlePhase } from '../game/handsFreeBattleController';
import { HANDS_FREE_CONFIG } from '../game/handsFreeConfig';
import { BOSS_IMPACT, BOSS_TIMING, type BossAnimationState } from '../components/Boss/BossCharacter';

/** Presentation only. The hands-free controller remains the sole attack clock. */
export function useBossAnimation(enemy: Enemy | null, phase: BattlePhase, terminal: boolean) {
  const [animation, setAnimation] = useState<{ state: BossAnimationState; id: number }>({ state: 'idle', id: 0 });
  const previous = useRef({ id: enemy?.id, hp: enemy?.hp, phase });
  const strikes = useRef(0);
  const id = enemy?.id, hp = enemy?.hp, boss = enemy?.isBoss;
  const stopped = terminal || !boss || !hp || phase === 'victory' || phase === 'defeat';

  useEffect(() => {
    const before = previous.current;
    previous.current = { id, hp, phase };
    if (before.id !== id) strikes.current = 0;
    if (stopped) {
      setAnimation(value => ({ state: 'idle', id: value.id + 1 }));
      return;
    }
    if (before.id === id && hp !== undefined && before.hp !== undefined && hp < before.hp) {
      setAnimation(value => ({ state: 'hurt', id: value.id + 1 }));
    }
    if (phase === 'enemy_turn' && before.phase !== phase) strikes.current++;
  }, [id, hp, phase, stopped]);

  useEffect(() => {
    if (stopped || (phase !== 'resolving_attack' && phase !== 'resolving_recovery')) return;
    // The controller applies enemy damage when resolveMs expires. Start the
    // visual early enough for its impact to coincide with that transition.
    const state = strikes.current % 2 ? 'heavyAttack' : 'attack';
    const timer = setTimeout(() => setAnimation(value => ({ state, id: value.id + 1 })),
      Math.max(0, HANDS_FREE_CONFIG.resolveMs - BOSS_IMPACT[state]));
    return () => clearTimeout(timer);
  }, [id, phase, stopped]);

  useEffect(() => {
    if (stopped || animation.state === 'idle' || animation.state === 'death') return;
    const timer = setTimeout(() => setAnimation(value => ({ ...value, state: 'idle' })), BOSS_TIMING[animation.state]);
    return () => clearTimeout(timer);
  }, [animation, stopped]);

  return animation;
}
