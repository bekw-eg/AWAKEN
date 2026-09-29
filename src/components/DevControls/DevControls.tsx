import type { ExerciseEvent, ExerciseType } from '../../game/types';

export function DevControls({ onExerciseEvent, onReset }: {
  onExerciseEvent: (event: ExerciseEvent) => void;
  onReset: () => void;
}) {
  if (!import.meta.env.DEV) return null;
  const simulate = (exercise: ExerciseType) => onExerciseEvent({ exercise, status: 'correct', timestamp: Date.now() });
  return (
    <aside className="dev-controls" aria-label="Development controls">
      <p className="eyebrow">DEV CONTROLS</p>
      <div>
        <button type="button" onClick={() => simulate('squat')}>SIMULATE SQUAT</button>
        <button type="button" onClick={() => simulate('jumping-jack')}>SIMULATE JUMPING JACK</button>
        <button type="button" onClick={() => simulate('knee-raise')}>SIMULATE KNEE RAISE</button>
        <button type="button" onClick={onReset}>RESET GAME</button>
      </div>
    </aside>
  );
}
