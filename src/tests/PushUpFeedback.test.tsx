import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PushUpFeedback } from '../components/PushUpFeedback/PushUpFeedback';
import { PushUpDetector } from '../exercise-engine/pushUpDetector';
import { PushUpSequence } from './fixtures/pushUpFrames';

afterEach(cleanup);
it('shows setup before readiness, with collapsed debug metrics', () => {
  render(<PushUpFeedback result={new PushUpDetector().getResult()} onReset={() => {}} />);
  expect(screen.getByText('SIDE VIEW REQUIRED')).toBeTruthy();
  expect(screen.getByText(/плечо, локоть, кисть, таз, колено и лодыжку/)).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain('SEARCHING');
  expect(screen.getByText('DEBUG METRICS').closest('details')?.open).toBe(false);
});
it('shows a rep, active side and a single actionable error, and supports reset', async () => {
  const s = new PushUpSequence(); s.hold(); s.rep();
  const reset = vi.fn();
  const view = render(<PushUpFeedback result={s.result} onReset={reset} />);
  expect(screen.getByText('1')).toBeTruthy(); expect(screen.getByText(/SIDE: LEFT/)).toBeTruthy();
  s.rep(125);
  view.rerender(<PushUpFeedback result={s.result} onReset={reset} />);
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Опустись ниже'));
  expect(screen.getAllByText('FORM ERROR')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'СБРОСИТЬ СЧЁТЧИК' }));
  expect(reset).toHaveBeenCalledTimes(1);
});
