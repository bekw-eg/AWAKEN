import { EXERCISE_DAMAGE } from '../../game/exerciseDamage';
import type { ExerciseType, PlayerState } from '../../game/types';
import { Icon, type IconName } from '../UI/Icon';

export const ATTACKS: { exercise: ExerciseType; title: string; label: string; icon: IconName; stat: 'strength' | 'agility' | 'power'; shortStat: string; description: string }[] = [
  { exercise: 'push-up', title: 'Push-up', label: 'Strong attack', icon: 'Target', stat: 'strength', shortStat: 'STR', description: 'High damage' },
  { exercise: 'jumping-jack', title: 'Jumping jack', label: 'Fast attack', icon: 'Zap', stat: 'agility', shortStat: 'AGI', description: 'Fast, lighter hits' },
  { exercise: 'squat', title: 'Squat', label: 'Basic attack', icon: 'Activity', stat: 'power', shortStat: 'POW', description: 'Balanced damage' },
];

export function AttackSelector({ selected, onSelect, player, performing, completed, disabled = false, eventId = 0 }: {
  selected: ExerciseType; onSelect: (exercise: ExerciseType) => void; player: PlayerState;
  performing: boolean; completed: boolean; disabled?: boolean; eventId?: number;
}) {
  return <section className="attack-selection" aria-labelledby="attack-title">
    <div className="section-title"><h2 id="attack-title">Choose your attack</h2><span>Every correct rep adds damage.</span></div>
    <div className="attack-cards" role="group" aria-label="Attack selection">
      {ATTACKS.map((attack, index) => {
        const isSelected = selected === attack.exercise;
        const state = disabled ? 'disabled' : isSelected ? completed ? 'completed' : performing ? 'performing' : 'selected' : 'default';
        return <button key={attack.exercise} type="button" className="attack-card" data-state={state} aria-pressed={isSelected}
          aria-label={`${attack.title}: ${attack.label}`} disabled={disabled} onClick={() => onSelect(attack.exercise)}>
          <span className="attack-card-top"><Icon name={attack.icon} /><span>{isSelected ? <Icon name="CheckCircle" /> : `0${index + 1}`}</span></span>
          <span className="attack-label">{attack.label}</span><strong className="attack-name">{attack.title}</strong>
          <span className="attack-detail">{attack.description}<span>{attack.shortStat} {player[attack.stat]}</span></span>
          <span key={isSelected ? eventId : 'idle'} className="attack-card-footer"><span>{state === 'completed' ? 'EXERCISE COMPLETE · HIT CONFIRMED' : state === 'performing' ? 'PERFORMING' : `${isSelected ? 'SELECTED · ' : ''}${EXERCISE_DAMAGE[attack.exercise]} DMG / REP`}</span><Icon name={state === 'completed' ? 'Check' : 'ArrowRight'} /></span>
        </button>;
      })}
    </div>
  </section>;
}
