import { CORRECT_FORM, NEUTRAL_FORM, toFormFeedback, type FormFeedback } from '../exercise-engine/formFeedback';
import type { BattlePhase } from './handsFreeBattleController';
import { HANDS_FREE_ATTACKS, type AttackType } from './handsFreeConfig';

type Result = Parameters<typeof toFormFeedback>[1];
/** Exactly one visual owner for each phase. Selection never renders exercise errors. */
export function resolvePoseFeedback(input: {
  phase: BattlePhase; selectedAttack: AttackType | null; candidate: AttackType | null;
  ready: boolean; squatResult: Result; jumpingJackResult: Result; pushupResult: Result;
}): FormFeedback {
  if (input.phase === 'selecting_attack') return input.candidate ? {
    status: 'correct', regions: input.candidate === 'basic' ? ['legs'] : input.candidate === 'fast' ? ['arms', 'legs'] : ['torso', 'arms'],
  } : NEUTRAL_FORM;
  if (input.phase === 'attack_confirmed') return CORRECT_FORM;
  if (input.phase === 'recovering') return input.ready ? CORRECT_FORM : NEUTRAL_FORM;
  if (['waiting_for_neutral', 'exercise_prepare', 'exercise_announcement'].includes(input.phase)) return input.ready ? CORRECT_FORM : NEUTRAL_FORM;
  if (input.phase !== 'performing_attack' || !input.selectedAttack) return NEUTRAL_FORM;
  const result = input.selectedAttack === 'basic' ? input.squatResult : input.selectedAttack === 'fast' ? input.jumpingJackResult : input.pushupResult;
  return toFormFeedback(HANDS_FREE_ATTACKS[input.selectedAttack].exercise, result);
}
