import type { GameState } from '../../game/types';
import { REP_XP } from '../../game/progression';
import { ATTACKS } from '../../components/BattleScreen/AttackSelector';
import { PlayerStats } from '../../components/PlayerStats/PlayerStats';
import { DailyQuest } from '../../components/DailyQuest/DailyQuest';
import { Icon } from '../../components/UI/Icon';
import { PageHeader } from '../../components/UI/PageHeader';
import { ProgressBar } from '../../components/UI/ProgressBar';

export function ProfileScreen({ state, onTrain }: { state: GameState; onTrain: () => void }) {
  return <>
    <PageHeader eyebrow="PLAYER / PROGRESSION" title="Built by your effort." description="Your attributes, exercise mastery, and progress in this session.">
      <button className="button button-primary" onClick={onTrain}><Icon name="Activity" />Start training</button>
    </PageHeader>
    <div className="profile-layout"><PlayerStats player={state.player} /><section className="mastery-section" aria-labelledby="mastery-title">
      <div className="section-title"><h2 id="mastery-title">Exercise mastery</h2><span>+{REP_XP} XP / correct rep</span></div>
      {ATTACKS.map((attack) => {
        const progress = state.exercises[attack.exercise];
        return <div className="mastery-row" key={attack.exercise}><Icon name={attack.icon} /><div><div className="mastery-heading"><div><p className="eyebrow">{attack.label}</p><h3>{attack.title}</h3></div><span>LVL <strong>{String(progress.level).padStart(2, '0')}</strong></span></div><ProgressBar value={progress.xp} max={progress.xpToNextLevel} label={`${attack.title} mastery`} /><div className="mastery-caption"><span>{attack.shortStat} {state.player[attack.stat]}</span><span>{progress.xp} / {progress.xpToNextLevel} XP</span></div></div></div>;
      })}
      <p className="profile-note"><Icon name="Info" />Progress lasts for this session. Reloading starts a new journey.</p>
    </section><DailyQuest quest={state.dailyQuest} /></div>
  </>;
}
