import type { ReactNode } from 'react';
import type { PlayerState } from '../../game/types';
import { Icon, type IconName } from '../UI/Icon';
import { ProgressBar } from '../UI/ProgressBar';
import './AppShell.css';

export type Page = 'home' | 'journey' | 'training' | 'profile' | 'settings';
const navigation: { page: Page; label: string; icon: IconName }[] = [
  { page: 'home', label: 'Home', icon: 'Home' },
  { page: 'journey', label: 'Journey', icon: 'Map' },
  { page: 'training', label: 'Training', icon: 'Activity' },
  { page: 'profile', label: 'Profile', icon: 'User' },
];

export function AppShell({ page, battle, player, onNavigate, children, reducedMotion }: {
  page: Page; battle: boolean; player: PlayerState; onNavigate: (page: Page) => void;
  children: ReactNode; reducedMotion: boolean;
}) {
  return <div className={`app-shell${reducedMotion ? ' reduce-motion' : ''}`}>
    <a href="#content" className="skip-link">Skip to content</a>
    <aside className="sidebar">
      <button className="wordmark" onClick={() => onNavigate('home')} aria-label="AWAKEN home"><Icon name="Activity" />AWAKEN<span className="brand-period">.</span></button>
      <div className="sidebar-caption">REAL EFFORT. REAL PROGRESS.</div>
      <nav aria-label="Main navigation">
        <p className="nav-label">PLAY</p>
        {navigation.map(({ page: target, label, icon }) => <button key={target}
          className="nav-item" aria-current={page === target ? 'page' : undefined}
          onClick={() => onNavigate(target)}><Icon name={icon} /><span>{label}</span>
          {page === target && <span className="nav-indicator" />}
        </button>)}
      </nav>
      <div className="sidebar-bottom">
        <button className="nav-item" aria-current={page === 'settings' ? 'page' : undefined} onClick={() => onNavigate('settings')}><Icon name="Settings" /><span>Settings</span></button>
        <div className="sidebar-player"><div className="player-monogram"><Icon name="User" /></div><div><strong>Player</strong><span>LEVEL {String(player.level).padStart(2, '0')}</span></div></div>
        <ProgressBar value={player.xp} max={player.xpToNextLevel} label="Player experience" />
        <p className="sidebar-xp">{player.xp} / {player.xpToNextLevel} XP</p>
      </div>
    </aside>
    <div className="app-body">
      <header className="app-topbar"><div className="breadcrumb"><span>AWAKEN</span><Icon name="ChevronRight" /><span>{battle ? 'Battle arena' : page}</span></div>
        <div className="topbar-vitals"><span><Icon name="Heart" />{player.hp}<small>HP</small></span><span className="level-tag">LVL {String(player.level).padStart(2, '0')}</span></div>
      </header>
      <main id="content" className={`app-content${battle ? ' arena-content' : ''}`} tabIndex={-1}>{children}</main>
      <footer className="app-footer"><span>AWAKEN / FITNESS RPG</span><span><Icon name="Shield" /> Your movement. Your progress.</span></footer>
    </div>
  </div>;
}
