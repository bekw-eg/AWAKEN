import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExerciseFeedback } from '../components/ExerciseFeedback/ExerciseFeedback';
import { SquatDetector, SQUAT_FEEDBACK } from '../exercise-engine/squatDetector';
import { SquatSequence } from './fixtures/squatFrames';

afterEach(cleanup);

describe('ExerciseFeedback', () => {
  it('shows a neutral state and no technique errors without a person', () => {
    render(<ExerciseFeedback result={new SquatDetector().getResult()} onReset={() => {}} />);
    expect(screen.getByRole('status').textContent).toContain('SEARCHING FOR USER');
    expect(screen.queryByText('FORM ERROR')).toBeNull();
    expect(screen.getAllByText('—')).toHaveLength(7);
  });

  it('shows exactly one prioritized error and exposes the reset action', () => {
    const sequence = new SquatSequence();
    sequence.calibrate();
    sequence.ramp(175, 85, 1000);
    sequence.hold({ knee: 85, kneeRatio: 0.35, torsoLean: 55 }, 700);
    const onReset = vi.fn();
    render(<ExerciseFeedback result={sequence.result} onReset={onReset} />);
    expect(screen.getByRole('status').textContent).toBe(SQUAT_FEEDBACK.knees_in);
    expect(screen.queryByText(SQUAT_FEEDBACK.torso_lean)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'СБРОСИТЬ СЧЁТЧИК' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('shows a counted rep and good form after a complete valid cycle', () => {
    const sequence = new SquatSequence();
    sequence.calibrate();
    sequence.rep();
    render(<ExerciseFeedback result={sequence.result} onReset={() => {}} />);
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('GOOD FORM')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('REP +1');
  });
});
