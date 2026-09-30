import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RoundTransition } from '../components/BattleScreen/RoundTransition';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

it.each([0, 4999, 5000])('arbitrates continue and timeout once at %i ms in StrictMode', delay => {
  const next = vi.fn();
  render(<StrictMode><RoundTransition enemyId="enemy-1" phase="round_transition" onDeathComplete={vi.fn()} onNextRound={next} /></StrictMode>);
  const button = screen.getByRole('button', { name: 'CONTINUE →' });
  act(() => vi.advanceTimersByTime(delay));
  fireEvent.click(button); fireEvent.click(button);
  act(() => vi.advanceTimersByTime(10000));
  expect(next).toHaveBeenCalledExactlyOnceWith('enemy-1');
});

it.each(['enemy_defeated', 'round_transition'] as const)('clears timers when leaving during %s', phase => {
  const next = vi.fn(), death = vi.fn();
  const view = render(<RoundTransition enemyId="enemy-1" phase={phase} onDeathComplete={death} onNextRound={next} />);
  view.unmount();
  act(() => vi.advanceTimersByTime(10000));
  expect(next).not.toHaveBeenCalled(); expect(death).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
