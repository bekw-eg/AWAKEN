import type { BattleSnapshot } from './handsFreeBattleController';
import { HANDS_FREE_ATTACKS, type AttackType } from './handsFreeConfig';

export type BattleOverlayType = 'countdown' | 'fight' | 'attack_selected' | 'exercise' | 'damage' | 'enemy_turn' | 'victory' | 'defeat';
export type BattleOverlayState = { type: BattleOverlayType; text: string; detail?: string };
export const EXERCISE_ANNOUNCEMENTS: Record<AttackType, string> = { basic: 'SQUAT!', fast: 'JUMPING JACKS!', strong: 'PUSH-UPS!' };

/** A pure view of the battle clock: no presentation timers or detector side effects. */
export function battleOverlay(battle: BattleSnapshot): BattleOverlayState | null {
  const attack = battle.selectedAttack ? HANDS_FREE_ATTACKS[battle.selectedAttack] : null;
  switch (battle.phase) {
    case 'battle_intro': case 'exercise_prepare':
      return battle.countdown > 0 ? { type: 'countdown', text: String(battle.countdown), detail: battle.phase === 'battle_intro' ? 'BATTLE START' : 'GET READY' } : null;
    case 'battle_fight': return { type: 'fight', text: 'FIGHT!' };
    case 'attack_confirmed': return { type: 'attack_selected', text: `${attack?.name} ATTACK`, detail: 'SELECTED' };
    case 'exercise_announcement': return battle.selectedAttack ? { type: 'exercise', text: EXERCISE_ANNOUNCEMENTS[battle.selectedAttack], detail: 'START AFTER THIS TITLE' } : null;
    case 'resolving_attack': return { type: 'damage', text: `${attack?.name} ATTACK`, detail: 'HIT!' };
    case 'resolving_recovery': return { type: 'damage', text: 'RECOVERY COMPLETE', detail: `+${battle.recoveryHealedHp} HP` };
    case 'enemy_turn': return { type: 'enemy_turn', text: 'ENEMY TURN', detail: 'BRACE YOURSELF' };
    case 'victory': return { type: 'victory', text: 'VICTORY' };
    case 'defeat': return { type: 'defeat', text: 'DEFEAT' };
    default: return null;
  }
}
