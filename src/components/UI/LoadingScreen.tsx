import { AnimatedNumber } from './AnimatedNumber';
import { ProgressBar } from './ProgressBar';
import { Icon } from './Icon';

export function LoadingScreen({ status, progress, compact = false, ready = false }: {
  status: string; progress?: number; compact?: boolean; ready?: boolean;
}) {
  return <div className={`system-loading${compact ? ' compact-loading' : ''}${ready ? ' loading-ready' : ''}`} role="status" aria-live="polite" aria-busy={!ready}>
    {compact ? <Icon name={ready ? 'Check' : 'Camera'} /> : <strong className="loading-logo">AWAKEN<span>.</span></strong>}
    <p className="eyebrow motion-text" key={status}>{status}</p>
    {progress === undefined ? <div className="loading-rail" aria-label="Loading application"><span /></div>
      : <><ProgressBar value={progress} max={100} label="Initialization stages completed" /><span className="loading-percent"><AnimatedNumber value={progress} />%</span></>}
    <small>{progress === undefined ? 'PREPARING SYSTEM…' : ready ? 'VISION LINK READY' : 'INITIALIZATION PROGRESS'}</small>
  </div>;
}
