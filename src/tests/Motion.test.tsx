import { StrictMode } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FighterStatus } from '../components/BattleScreen/FighterStatus';
import { RepCounter } from '../components/UI/RepCounter';
import { AnimatedNumber } from '../components/UI/AnimatedNumber';
import { FeedbackText } from '../components/UI/MotionText';
import { MotionProvider, type MotionEvent } from '../motion/Motion';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('emits one damage event per HP loss, keeps both hits, and retires each independently', () => {
  const events: MotionEvent[] = [];
  const listen = (event: Event) => events.push((event as CustomEvent<MotionEvent>).detail);
  window.addEventListener('awaken:motion', listen);
  const fighter = (hp: number) => <StrictMode><FighterStatus name="Enemy" hp={hp} maxHp={100} enemy /></StrictMode>;
  const view = render(fighter(100));
  view.rerender(fighter(82));
  for (let frame = 0; frame < 50; frame++) view.rerender(fighter(82));
  expect(events.filter(e => e.type === 'damage')).toHaveLength(1);
  expect(view.container.querySelectorAll('.damage-number')).toHaveLength(1);
  expect(view.container.querySelector('.progress-trail')?.getAttribute('style')).toContain('scaleX(1)');
  act(() => vi.advanceTimersByTime(240));
  expect(view.container.querySelector('.progress-trail')?.getAttribute('style')).toContain('scaleX(0.82)');
  view.rerender(fighter(64));
  expect(events.map(e => e.amount)).toEqual([18, 18]);
  act(() => vi.advanceTimersByTime(670));
  expect(view.container.querySelectorAll('.damage-number')).toHaveLength(1);
  act(() => vi.advanceTimersByTime(240));
  expect(view.container.querySelectorAll('.damage-number')).toHaveLength(0);
  view.rerender(fighter(100)); // Healing never counts as damage.
  expect(events).toHaveLength(2);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
  window.removeEventListener('awaken:motion', listen);
});

it('confirms reps once, completes a five-rep series, and does not replay on identical frames or resets', () => {
  const counter = (n: number) => <StrictMode><RepCounter value={n} series /></StrictMode>;
  const view = render(counter(0));
  for (let rep = 1; rep <= 5; rep++) {
    view.rerender(counter(rep));
    const toast = view.container.querySelector('.rep-toast');
    expect(toast?.textContent).toBe('GOOD REP +1');
    for (let frame = 0; frame < 20; frame++) view.rerender(counter(rep));
    expect(view.container.querySelector('.rep-toast')).toBe(toast);
    act(() => vi.advanceTimersByTime(901));
    expect(view.container.querySelector('.rep-toast')).toBeNull();
  }
  expect(view.container.textContent).toContain('5 / 5SERIES COMPLETE');
  view.rerender(counter(0));
  expect(view.container.querySelector('.rep-toast')).toBeNull();
});

it('starts an interrupted number tween from its current value and cancels work on unmount', () => {
  const view = render(<AnimatedNumber value={100} />);
  view.rerender(<AnimatedNumber value={50} />);
  act(() => vi.advanceTimersByTime(160));
  const halfway = Number(view.container.textContent);
  expect(halfway).toBeGreaterThan(50);
  expect(halfway).toBeLessThan(100);
  view.rerender(<AnimatedNumber value={10} />);
  expect(Number(view.container.textContent)).toBe(halfway);
  act(() => vi.advanceTimersByTime(500));
  expect(view.container.textContent).toBe('10');
  view.rerender(<AnimatedNumber value={200} />);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('shows final numbers immediately with reduced motion and filters unstable feedback', () => {
  const view = render(<MotionProvider reduced><AnimatedNumber value={100} from={0} /></MotionProvider>);
  expect(view.container.textContent).toBe('100');
  expect(vi.getTimerCount()).toBe(0);
  view.rerender(<FeedbackText text="READY" />);
  view.rerender(<FeedbackText text="GO LOWER" />);
  act(() => vi.advanceTimersByTime(50));
  view.rerender(<FeedbackText text="READY" />);
  act(() => vi.advanceTimersByTime(200));
  expect(view.container.textContent).toBe('READY');
  view.rerender(<FeedbackText text="GO LOWER" />);
  act(() => vi.advanceTimersByTime(160));
  expect(view.container.textContent).toBe('GO LOWER');
});
