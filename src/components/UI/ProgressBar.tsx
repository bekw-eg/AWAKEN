import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../motion/Motion';

export function ProgressBar({ value, max, label, tone = 'accent', trail = false, from }: {
  value: number; max: number; label: string; tone?: 'accent' | 'danger' | 'muted'; trail?: boolean; from?: number;
}) {
  const clamped = Math.min(Math.max(value, 0), Math.max(max, 0));
  const ratio = max > 0 ? clamped / max : 0;
  const [entered, setEntered] = useState(from === undefined);
  const [behind, setBehind] = useState(ratio);
  const previous = useRef(ratio);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (entered) return;
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [entered]);
  useEffect(() => {
    if (!trail) return;
    const falling = ratio < previous.current;
    previous.current = ratio;
    if (!falling || reduced) { setBehind(ratio); return; }
    const timer = setTimeout(() => setBehind(ratio), 220);
    return () => clearTimeout(timer);
  }, [ratio, trail, reduced]);
  return (
    <div className={`progress-track progress-${tone}`} role="progressbar" aria-label={label}
      aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={max}>
      {trail && <span className="progress-trail" style={{ transform: `scaleX(${reduced ? ratio : behind})` }} />}
      <span className="progress-fill" style={{ transform: `scaleX(${reduced || entered ? ratio : from})` }} />
    </div>
  );
}
