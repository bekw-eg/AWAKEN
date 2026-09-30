import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ROUND_TRANSITION } from '../../game/handsFreeConfig';
import type { GameState } from '../../game/types';
import { useReducedMotion } from '../../motion/Motion';
import { Icon } from '../UI/Icon';

export function RoundTransition({ enemyId, phase, onDeathComplete, onNextRound }: {
  enemyId: string; phase: GameState['roundPhase'];
  onDeathComplete: (enemyId: string) => void; onNextRound: (enemyId: string) => void;
}) {
  const completed = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [seconds, setSeconds] = useState(5);
  const menu = useRef<HTMLDialogElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const startNextRound = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    clearTimeout(timeout.current);
    onNextRound(enemyId);
  }, [enemyId, onNextRound]);

  useEffect(() => {
    if (phase !== 'round_transition') return;
    const dialog = menu.current;
    const previousFocus = document.activeElement;
    // A native modal sits above the arena and keeps keyboard focus inside.
    dialog?.showModal?.();
    continueButton.current?.focus({ preventScroll: true });
    return () => {
      dialog?.close?.();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [phase]);

  useEffect(() => {
    if (phase === 'enemy_defeated') {
      const timer = setTimeout(() => onDeathComplete(enemyId), ROUND_TRANSITION.deathDurationMs);
      return () => clearTimeout(timer);
    }
    if (phase !== 'round_transition') return;
    const deadline = performance.now() + ROUND_TRANSITION.countdownMs;
    timeout.current = setTimeout(startNextRound, ROUND_TRANSITION.countdownMs);
    // Only the text ticks. CSS owns the continuous progress animation.
    const labels = setInterval(() => setSeconds(Math.max(0, Math.ceil((deadline - performance.now()) / 1000))), 250);
    return () => { clearTimeout(timeout.current); clearInterval(labels); };
  }, [enemyId, phase, onDeathComplete, startNextRound]);

  if (phase !== 'round_transition') return null;
  return createPortal(<dialog ref={menu} className={`round-transition${reduced ? ' reduce-motion' : ''}`} aria-label="Round complete"
    onCancel={event => { event.preventDefault(); startNextRound(); }}>
    <div className="round-emblem" aria-hidden="true"><Icon name="Check" /></div>
    <div role="status"><p className="eyebrow">+50 XP</p><h2>ROUND COMPLETE</h2><p>Next opponent in {seconds} sec</p></div>
    <button ref={continueButton} type="button" className="round-continue" onClick={startNextRound}>
      <span className="round-countdown-fill" aria-hidden="true" />
      <span>CONTINUE →</span><span aria-hidden="true">{seconds} SEC</span>
    </button>
    <p className="round-menu-hint">Ready? Skip the wait.</p>
  </dialog>, document.body);
}
