import { useEffect, useRef, useState } from 'react';
import { AnimatedNumber } from './AnimatedNumber';
import { useValueChange } from '../../motion/Motion';

export function RepCounter({ value, series = false }: { value: number; series?: boolean }) {
  const [event, setEvent] = useState<{ id: number; amount: number; before: number } | null>(null);
  const sequence = useRef(0);
  useValueChange(value, (before, after) => {
    setEvent(after > before ? { id: ++sequence.current, amount: after - before, before } : null);
  });
  useEffect(() => {
    if (!event) return;
    const timer = setTimeout(() => setEvent(null), 900);
    return () => clearTimeout(timer);
  }, [event]);
  const step = value === 0 ? 0 : (value - 1) % 5 + 1;
  return <div className="rep-counter">
    <span className={`rep-value${event ? ' rep-confirmed' : ''}`} key={event?.id ?? 'idle'}><AnimatedNumber value={value} from={event?.before} duration={160} /></span>
    <span>VALID REPS</span>
    {event && <span key={`rep-${event.id}`} className="rep-toast" aria-hidden="true">GOOD REP +{event.amount}</span>}
    {series && <div className={`rep-series${step === 5 && event ? ' series-complete' : ''}`} key={`series-${value}`}>
      <span><AnimatedNumber value={step} /> / 5</span><small>{step === 5 ? 'SERIES COMPLETE' : 'REP SERIES'}</small>
      <div className="series-dots" aria-hidden="true">{[1, 2, 3, 4, 5].map(n => <i key={n} className={n <= step ? 'filled' : ''} />)}</div>
    </div>}
  </div>;
}
