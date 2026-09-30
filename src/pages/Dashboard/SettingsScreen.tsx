import { Icon } from '../../components/UI/Icon';
import { PageHeader } from '../../components/UI/PageHeader';

export type Preferences = { mirrored: boolean; autoStart: boolean; reducedMotion: boolean };
export const DEFAULT_PREFERENCES: Preferences = { mirrored: true, autoStart: true, reducedMotion: false };

export function SettingsScreen({ preferences, onChange }: { preferences: Preferences; onChange: (value: Preferences) => void }) {
  return <>
    <PageHeader eyebrow="SYSTEM / PREFERENCES" title="Make it your arena." description="Camera and display preferences for this session." />
    <div className="settings-content">
      <section aria-labelledby="camera-settings-title"><h2 id="camera-settings-title"><Icon name="Camera" />Camera</h2>
        <label className="preference-row"><span><strong>Mirror camera view</strong><small>Move naturally with a mirrored video and pose overlay.</small></span><input type="checkbox" role="switch" checked={preferences.mirrored} onChange={(event) => onChange({ ...preferences, mirrored: event.target.checked })} /></label>
        <label className="preference-row"><span><strong>Start camera automatically</strong><small>Connect when entering training or battle. Browser permission is still required.</small></span><input type="checkbox" role="switch" checked={preferences.autoStart} onChange={(event) => onChange({ ...preferences, autoStart: event.target.checked })} /></label>
      </section>
      <section aria-labelledby="display-settings-title"><h2 id="display-settings-title"><Icon name="Sliders" />Display</h2>
        <label className="preference-row"><span><strong>Reduce motion</strong><small>Disable interface transitions. Your device’s motion preference is also respected.</small></span><input type="checkbox" role="switch" checked={preferences.reducedMotion} onChange={(event) => onChange({ ...preferences, reducedMotion: event.target.checked })} /></label>
      </section>
      <div className="privacy-note"><Icon name="Shield" /><div><h3>Private by design.</h3><p>Pose tracking runs on this device. Camera frames are never recorded or uploaded.</p></div></div>
    </div>
  </>;
}
