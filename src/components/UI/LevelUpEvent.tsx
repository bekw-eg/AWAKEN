import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from '../../motion/Motion';
import { Icon } from './Icon';

export function LevelUpEvent({ from, to, delay = 0 }: { from: number; to: number; delay?: number }) {
  const [visible, setVisible] = useState(true);
  const reduced = useReducedMotion();
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), reduced ? 0 : delay + 900);
    return () => clearTimeout(timer);
  }, [delay, reduced]);
  if (!visible || reduced) return null;
  return createPortal(<div className="level-up-event" style={{ animationDelay: `${delay}ms` }} role="status">
    <Icon name="TrendingUp" /><strong>LEVEL UP</strong><span>{from}<Icon name="ArrowRight" />{to}</span>
  </div>, document.body);
}
