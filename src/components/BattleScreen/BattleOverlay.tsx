import { createPortal } from 'react-dom';
import type { BattleOverlayState } from '../../game/battleOverlay';
import { useReducedMotion } from '../../motion/Motion';
import './BattleOverlay.css';

export function BattleOverlay({ announcement }: { announcement: BattleOverlayState | null }) {
  const reduced = useReducedMotion();
  if (!announcement) return null;
  return createPortal(<div className={`combat-announcement ${announcement.type}${reduced ? ' reduced' : ''}`}
    role="status" aria-live="polite" aria-atomic="true" data-testid="battle-overlay">
    <div className="combat-announcement-impact" key={`${announcement.type}:${announcement.text}`}>
      <strong>{announcement.text}</strong>
      {announcement.detail && <span>{announcement.detail}</span>}
    </div>
  </div>, document.body);
}
