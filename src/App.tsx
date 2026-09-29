import { useEffect, useState, type ComponentType } from 'react';
import { LoadingScreen } from './components/UI/LoadingScreen';
import { MotionProvider } from './motion/Motion';
import './styles/tokens.css';
import './styles/motion.css';

// Follow the actual application chunk request; no fabricated loading percentage.
const application = import('./pages/Dashboard/Dashboard');

export default function App() {
  const [Dashboard, setDashboard] = useState<ComponentType | null>(null);
  const [exiting, setExiting] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    application.then(module => {
      if (!active) return;
      setDashboard(() => module.Dashboard);
      setExiting(true);
      timer = setTimeout(() => setExiting(false), 260);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; clearTimeout(timer); };
  }, []);
  return <MotionProvider>
    {Dashboard && <Dashboard />}
    {(!Dashboard || exiting) && <div className={`boot-overlay${exiting ? ' boot-exit' : ''}`}>
      <LoadingScreen status={failed ? 'CONNECTION INTERRUPTED' : Dashboard ? 'READY' : 'INITIALIZING'} ready={!!Dashboard} />
      {failed && <button className="button button-primary" onClick={() => window.location.reload()}>Retry loading</button>}
    </div>}
  </MotionProvider>;
}
