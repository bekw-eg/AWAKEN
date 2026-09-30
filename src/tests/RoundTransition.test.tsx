import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RoundTransition } from '../components/BattleScreen/RoundTransition';
import { mockDialogs } from './fixtures/dialog';

beforeEach(() => { vi.useFakeTimers(); mockDialogs(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it.each([0, 4999, 5000])('arbitrates SKIP and timeout once at %i ms in StrictMode', delay => {
  const next = vi.fn(), skip = vi.fn();
  render(<StrictMode><RoundTransition enemyId="enemy-1" phase="round_transition" onDeathComplete={vi.fn()} onNextRound={next} onSkip={skip} /></StrictMode>);
  const button = screen.getByRole('button', { name: 'SKIP' });
  expect(screen.getByRole('dialog', { name: 'Round complete' }).parentElement).toBe(document.body);
  expect(document.activeElement).toBe(button);
  act(() => vi.advanceTimersByTime(delay));
  fireEvent.click(button); fireEvent.click(button);
  act(() => vi.advanceTimersByTime(10000));
  if (delay < 5000) { expect(skip).toHaveBeenCalledTimes(1); expect(next).not.toHaveBeenCalled(); }
  else { expect(next).toHaveBeenCalledExactlyOnceWith('enemy-1'); expect(skip).not.toHaveBeenCalled(); }
});

it.each(['enemy_defeated', 'round_transition'] as const)('clears timers when leaving during %s', phase => {
  const next = vi.fn(), death = vi.fn(), skip = vi.fn();
  const view = render(<RoundTransition enemyId="enemy-1" phase={phase} onDeathComplete={death} onNextRound={next} onSkip={skip} />);
  view.unmount();
  act(() => vi.advanceTimersByTime(10000));
  expect(next).not.toHaveBeenCalled(); expect(death).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
