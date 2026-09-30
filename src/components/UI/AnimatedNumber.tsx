import { memo } from 'react';
import { useAnimatedValue } from '../../motion/Motion';

export const AnimatedNumber = memo(function AnimatedNumber({ value, from, duration, delay, className = '', pad = 0 }: {
  value: number; from?: number; duration?: number; delay?: number; className?: string; pad?: number;
}) {
  const display = useAnimatedValue(value, duration, from, delay);
  return <span className={`animated-number ${className}`} aria-label={String(value)}>
    <span aria-hidden="true">{String(Math.round(display)).padStart(pad, '0')}</span>
  </span>;
});
