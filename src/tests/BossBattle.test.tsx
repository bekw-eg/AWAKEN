import { StrictMode, useCallback, useReducer } from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BossCharacter, BOSS_IMPACT, BOSS_TIMING } from '../components/Boss/BossCharacter';
import { useBossAnimation } from '../hooks/useBossAnimation';
import { useHandsFreeBattle } from '../hooks/useHandsFreeBattle';
import { HANDS_FREE_CONFIG as C } from '../game/handsFreeConfig';
import { createGameState, gameReducer, generateEnemy } from '../game/progression';
import { MotionProvider } from '../motion/Motion';
import type { ExerciseEvent, GameState } from '../game/types';
import type { PushUpFrame } from '../exercise-engine/pushUpTypes';
import { closedFrame } from './fixtures/jumpingJackFrames';
import { PushUpSequence, pushUpFrame } from './fixtures/pushUpFrames';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const bossState = (): GameState => ({ ...createGameState(), screen: 'battle', currentEnemyIndex: 10, currentEnemy: generateEnemy(10) });
function useBattle() {
  const [game, dispatch] = useReducer(gameReducer, undefined, bossState);
  const strike = useCallback(() => dispatch({ type: 'enemy_attack' }), []);
  const exercise = useCallback((event: ExerciseEvent) => dispatch({ type: 'exercise', event }), []);
  const terminal = game.screen !== 'battle';
  const battle = useHandsFreeBattle({ playerHp: game.player.hp, enemyHp: game.currentEnemy?.hp ?? 0,
    terminal, onEnemyAttack: strike, onExerciseEvent: exercise });
  const animation = useBossAnimation(game.currentEnemy, battle.snapshot.phase, terminal);
  return { game, animation, ...battle };
}

it('uses real hands-free turns for normal and heavy boss impacts, with no independent damage timer', () => {
  const { result, unmount } = renderHook(useBattle, { wrapper: StrictMode });
  const frame = (pose: Omit<PushUpFrame, 'timestampMs'>) => {
    advance(50);
    act(() => result.current.onPoseFrame({ ...pose, timestampMs: performance.now() }));
  };
  const hold = (pose: Omit<PushUpFrame, 'timestampMs'>, ms: number) => { for (let t = 0; t < ms; t += 50) frame(pose); };
  advance(20000);
  expect(result.current.game.player.hp).toBe(100);
  expect(result.current.animation.state).toBe('idle');
  hold(closedFrame, 4800);
  for (const [turn, state] of (['attack', 'heavyAttack'] as const).entries()) {
    hold(pushUpFrame(0), 800);
    for (let n = 0; n < 150 && result.current.snapshot.phase !== 'performing_attack'; n++) frame(pushUpFrame(0));
    expect(result.current.snapshot.phase).toBe('performing_attack');
    const sequence = new PushUpSequence(); sequence.rep();
    for (const pose of sequence.frames) {
      frame(pose);
      if (result.current.snapshot.phase === 'resolving_attack') break;
    }
    expect(result.current.snapshot.phase).toBe('resolving_attack');
    expect(result.current.animation.state).toBe('hurt');
    const hpBefore = turn === 0 ? 100 : 71;
    expect(result.current.game.player.hp).toBe(hpBefore);
    advance(C.resolveMs - BOSS_IMPACT[state]);
    expect(result.current.animation.state).toBe(state);
    advance(BOSS_IMPACT[state] - 1);
    expect(result.current.game.player.hp).toBe(hpBefore);
    // Real pose frames need not align to the controller's 50 ms UI tick.
    advance(1 + C.uiTickMs);
    expect(result.current.game.player.hp).toBe(hpBefore - 29);
    expect(result.current.snapshot.phase).toBe('enemy_turn');
    advance(BOSS_TIMING[state] - BOSS_IMPACT[state] - C.uiTickMs);
    expect(result.current.animation.state).toBe('idle');
    advance(C.enemyTurnMs + C.betweenTurnsMs);
    advance(10000);
    expect(result.current.snapshot.phase).toBe('selecting_attack');
    expect(result.current.game.player.hp).toBe(hpBefore - 29);
  }
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('restarts hurt on consecutive hits and cancels the earlier recovery', () => {
  const enemy = generateEnemy(10);
  const { result, rerender } = renderHook(({ current }) => useBossAnimation(current, 'performing_attack', false), { initialProps: { current: enemy } });
  rerender({ current: { ...enemy, hp: 570 } });
  const id = result.current.id;
  advance(200);
  rerender({ current: { ...enemy, hp: 540 } });
  expect(result.current.id).toBeGreaterThan(id);
  advance(160);
  expect(result.current.state).toBe('hurt');
  advance(200);
  expect(result.current.state).toBe('idle');
});

it.each(['unmount', 'victory', 'defeat', 'flee'] as const)('cancels pending visual timers on %s', end => {
  const enemy = generateEnemy(10);
  const { rerender, unmount } = renderHook(({ terminal, active }) => useBossAnimation(active ? enemy : null, 'resolving_attack', terminal), {
    initialProps: { terminal: false, active: true }, wrapper: StrictMode,
  });
  advance(C.resolveMs - BOSS_IMPACT.attack);
  if (end === 'unmount') unmount();
  else rerender({ terminal: end !== 'flee', active: end !== 'flee' });
  expect(vi.getTimerCount()).toBe(0);
  advance(20000);
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
