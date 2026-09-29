import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ExerciseType } from '../game/types';

export const MOTION = { micro: 160, normal: 260, event: 480, page: 320, major: 800, impact: 760 } as const;
const ReducedMotion = createContext(false);
export function MotionProvider({ reduced = false, children }: { reduced?: boolean; children: ReactNode }) {
  const [system, setSystem] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const change = () => setSystem(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return <ReducedMotion.Provider value={reduced || system}>{children}</ReducedMotion.Provider>;
}
export const useReducedMotion = () => useContext(ReducedMotion);

export type MotionEvent = {
  id: number;
  type: 'rep-success' | 'attack' | 'damage' | 'boss-attack' | 'victory' | 'defeat' | 'level-up';
  exercise?: ExerciseType; amount?: number; target?: 'player' | 'enemy';
};
let eventId = 0;
/** Presentation-only events. Future sound adapters can subscribe without touching game rules. */
export function emitMotionEvent(event: Omit<MotionEvent, 'id'>) {
  const detail = { ...event, id: ++eventId };
  window.dispatchEvent(new CustomEvent<MotionEvent>('awaken:motion', { detail }));
  return detail;
}

/** Compare primitive values, never pose objects. Safe across StrictMode effect replays. */
export function useValueChange(value: number, onChange: (before: number, after: number) => void) {
  const previous = useRef(value);
  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    if (before !== value) onChange(before, value);
  }, [value, onChange]);
}

export function useAnimatedValue(value: number, duration: number = MOTION.event, from = value, delay = 0) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(from);
  const current = useRef(from);
  useEffect(() => {
    if (reduced || current.current === value) {
      current.current = value;
      setDisplay(value);
      return;
    }
    let frame = 0;
    const start = current.current;
    const started = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - started) / duration));
      current.current = start + (value - start) * (1 - (1 - t) ** 3);
      setDisplay(current.current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced, delay]);
  return reduced ? value : display;
}

/** Require feedback to stay stable briefly, avoiding per-frame error flicker. */
export function useStableText(text: string, delay = 160) {
  const [stable, setStable] = useState(text);
  useEffect(() => {
    if (text === stable) return;
    const timer = setTimeout(() => setStable(text), delay);
    return () => clearTimeout(timer);
  }, [text, stable, delay]);
  return stable;
}
