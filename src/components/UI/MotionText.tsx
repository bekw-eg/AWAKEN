import { useStableText } from '../../motion/Motion';

const phases: Record<string, string> = { standing: 'READY', top: 'READY', closed: 'READY', descending: 'GO DOWN', bottom: 'DEPTH REACHED', ascending: 'COME UP', open: 'FULL EXTENSION', opening: 'OPEN UP', closing: 'RETURN' };
export function PhaseText({ phase }: { phase: string }) {
  return <strong key={phase} className={`motion-text${phase === 'bottom' ? ' phase-reached' : ''}`}>{phases[phase] ?? phase.toUpperCase()}</strong>;
}
export function FeedbackText({ text }: { text: string }) {
  const stable = useStableText(text);
  return <span key={stable} className="motion-text">{stable}</span>;
}
