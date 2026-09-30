import { useState } from 'react';
import { useReducedMotion } from '../../motion/Motion';

/** Presentation of the battle clock. Pose updates never restart the digit roll. */
export function SetCountdown({ seconds }: { seconds: number }) {
  const reduced = useReducedMotion();
  const [digits, setDigits] = useState<{ current: number; previous: number | null }>({ current: seconds, previous: null });
  if (digits.current !== seconds) {
    setDigits({ current: seconds, previous: digits.current });
  }

  return <div className={`set-countdown${reduced ? ' set-countdown-reduced' : ''}`}
    role="timer" aria-label={`Set time remaining: ${seconds} seconds`} aria-live="off">
    <span className="set-countdown-label" aria-hidden="true">SET TIME</span>
    <div key={digits.current} className="set-countdown-window" aria-hidden="true">
      {digits.previous !== null && !reduced && <span className="set-countdown-digit set-countdown-outgoing">{digits.previous}</span>}
      <span className={`set-countdown-digit${digits.previous !== null && !reduced ? ' set-countdown-incoming' : ''}`}>{digits.current}</span>
    </div>
    <span className="set-countdown-unit" aria-hidden="true">SECONDS</span>
  </div>;
}
