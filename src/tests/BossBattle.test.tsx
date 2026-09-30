import { StrictMode, useCallback, useReducer } from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BossCharacter, BOSS_IMPACT, BOSS_TIMING } from '../components/Boss/BossCharacter';
import { useEnemyAttackAnimation } from '../hooks/useEnemyAttackAnimation';
import { createGameState, gameReducer, generateEnemy } from '../game/progression';
import { MotionProvider } from '../motion/Motion';
import type { ExerciseType, GameState } from '../game/types';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const bossState = (): GameState => ({ ...createGameState(), screen: 'battle', currentEnemyIndex: 10, currentEnemy: generateEnemy(10) });
function useBattle() {
  const [game, dispatch] = useReducer(gameReducer, undefined, bossState);
  const strike = useCallback(() => dispatch({ type: 'enemy_attack' }), []);
  const visual = useEnemyAttackAnimation(game.currentEnemy, game.screen !== 'battle', strike);
  return { game, dispatch, ...visual };
}

it('telegraphs normal and heavy strikes and applies existing damage exactly once at each impact', () => {
  const { result, unmount } = renderHook(useBattle, { wrapper: StrictMode });
  advance(5000 - BOSS_IMPACT.attack);
  expect(result.current.animation.state).toBe('attack');
  expect(result.current.game.player.hp).toBe(100);
  advance(BOSS_IMPACT.attack - 1);
  expect(result.current.game.player.hp).toBe(100);
  advance(1);
  expect(result.current.game.player.hp).toBe(57);
  advance(BOSS_TIMING.attack - BOSS_IMPACT.attack);
  expect(result.current.animation.state).toBe('idle');
  advance(5000 - BOSS_IMPACT.heavyAttack - (BOSS_TIMING.attack - BOSS_IMPACT.attack));
  expect(result.current.animation.state).toBe('heavyAttack');
  expect(result.current.game.player.hp).toBe(57);
  advance(BOSS_IMPACT.heavyAttack);
  expect(result.current.game.player.hp).toBe(14);
  advance(BOSS_TIMING.heavyAttack - BOSS_IMPACT.heavyAttack);
  expect(result.current.animation.state).toBe('idle');
  expect(result.current.game.player.hp).toBe(14);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it.each<ExerciseType>(['squat', 'push-up', 'jumping-jack'])('%s hits once, interrupts a windup, and restarts the existing cadence', exercise => {
  const { result } = renderHook(useBattle, { wrapper: StrictMode });
  advance(5000 - BOSS_IMPACT.attack);
  const action = { type: 'exercise' as const, event: { exercise, status: 'correct' as const, timestamp: Date.now() } };
  const expected = gameReducer(result.current.game, action);
  act(() => result.current.dispatch(action));
  expect(result.current.game).toEqual(expected);
  expect(result.current.animation.state).toBe('hurt');
  advance(BOSS_TIMING.hurt);
  expect(result.current.animation.state).toBe('idle');
  advance(5000 - BOSS_TIMING.hurt - 1);
  expect(result.current.game.player.hp).toBe(100);
  advance(1);
  expect(result.current.game.player.hp).toBe(57);
});

it('restarts hurt on consecutive hits and cancels the earlier recovery', () => {
  const enemy = generateEnemy(10);
  const strike = vi.fn();
  const { result, rerender } = renderHook(({ current }) => useEnemyAttackAnimation(current, false, strike), { initialProps: { current: enemy } });
  rerender({ current: { ...enemy, hp: 570 } });
  const id = result.current.animation.id;
  advance(200);
  rerender({ current: { ...enemy, hp: 540 } });
  expect(result.current.animation.id).toBeGreaterThan(id);
  advance(160);
  expect(result.current.animation.state).toBe('hurt');
  advance(200);
  expect(result.current.animation.state).toBe('idle');
});

it.each(['unmount', 'victory', 'defeat', 'flee'] as const)('cancels pending attacks and recovery on %s', end => {
  const enemy = generateEnemy(10);
  const strike = vi.fn();
  const { rerender, unmount } = renderHook(({ terminal, active }) => useEnemyAttackAnimation(active ? enemy : null, terminal, strike), {
    initialProps: { terminal: false, active: true }, wrapper: StrictMode,
  });
  advance(5000 - BOSS_IMPACT.attack);
  if (end === 'unmount') unmount();
  else rerender({ terminal: end !== 'flee', active: end !== 'flee' });
  advance(20000);
  expect(strike).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps rage orthogonal to each action, enters death at zero HP, and honors reduced motion', () => {
  const { container, rerender } = render(<BossCharacter hp={181} maxHp={600} state="idle" />);
  const scene = () => container.querySelector('.boss-scene')!;
  expect(scene().getAttribute('data-rage')).toBe('false');
  for (const state of ['idle', 'hurt', 'attack', 'heavyAttack'] as const) {
    rerender(<BossCharacter hp={180} maxHp={600} state={state} />);
    expect(scene().getAttribute('data-rage')).toBe('true');
    expect(scene().getAttribute('data-state')).toBe(state);
  }
  rerender(<MotionProvider reduced><BossCharacter hp={0} maxHp={600} state="heavyAttack" /></MotionProvider>);
  expect(scene().getAttribute('data-state')).toBe('death');
  expect(scene().getAttribute('data-rage')).toBe('false');
  expect(container.querySelector('.boss-reduced-motion')).toBeTruthy();
  expect(container.querySelectorAll('img')).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
});
