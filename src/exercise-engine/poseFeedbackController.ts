import { FORM_DISPLAY_CONFIG as C, NEUTRAL_FORM, type BodyRegion, type FormFeedback, type FormStatus } from './formFeedback';

type Pending<T> = { value: T; since: number };
const problem = (status: FormStatus) => status === 'error' || status === 'warning';

/** Display state only. No detector, rep, selection or attack can consume this state. */
export class PoseFeedbackController {
  private status: FormStatus = 'neutral';
  private baseStatus: 'neutral' | 'correct' = 'neutral';
  private pendingStatus: Pending<FormStatus> | null = null;
  private regions = new Set<BodyRegion>();
  private pendingRegions = new Map<BodyRegion, Pending<boolean>>();
  private lostAt: number | null = null;
  private shown: FormFeedback = NEUTRAL_FORM;
  private message: string | undefined;
  nextUpdateMs: number | null = null;

  update(raw: FormFeedback, reliable: boolean, now: number): FormFeedback {
    this.nextUpdateMs = null;
    const wakeAt = (at: number) => { this.nextUpdateMs = Math.min(this.nextUpdateMs ?? Infinity, Math.max(1, at - now)); };
    if (!reliable) {
      this.lostAt ??= now;
      this.pendingStatus = null;
      this.pendingRegions.clear();
      if (now - this.lostAt < C.trackingGraceMs) {
        wakeAt(this.lostAt + C.trackingGraceMs);
        return this.shown;
      }
      this.status = 'neutral'; this.baseStatus = 'neutral'; this.regions.clear(); this.message = undefined;
      return this.shown = NEUTRAL_FORM;
    }
    this.lostAt = null;
    if (raw.status === this.status) this.pendingStatus = null;
    else {
      if (this.pendingStatus?.value !== raw.status) this.pendingStatus = { value: raw.status, since: now };
      const delay = problem(raw.status) ? C.errorHoldMs : raw.status === 'correct' ? C.correctEnterMs : C.clearDelayMs;
      const at = this.pendingStatus.since + delay;
      if (now >= at) { this.status = raw.status; this.pendingStatus = null; }
      else wakeAt(at);
    }
    // Each region has its own evidence window: a noisy leg cannot reset an arms error.
    const wanted = new Set(raw.regions ?? []);
    for (const region of new Set([...wanted, ...this.regions, ...this.pendingRegions.keys()])) {
      const value = wanted.has(region);
      if (value === this.regions.has(region)) { this.pendingRegions.delete(region); continue; }
      let pending = this.pendingRegions.get(region);
      if (!pending || pending.value !== value) {
        pending = { value, since: now }; this.pendingRegions.set(region, pending);
      }
      const at = pending.since + (value ? problem(raw.status) ? C.errorHoldMs : C.correctEnterMs : C.clearDelayMs);
      if (now >= at) {
        if (value) this.regions.add(region); else this.regions.delete(region);
        this.pendingRegions.delete(region);
      } else wakeAt(at);
    }
    if (!problem(this.status)) this.baseStatus = this.status === 'correct' ? 'correct' : 'neutral';
    const regions = [...this.regions].sort();
    if (this.status === raw.status && regions.join(',') === [...wanted].sort().join(',')) this.message = raw.message;
    const next: FormFeedback = { status: this.status, regions, message: this.message, baseStatus: this.baseStatus };
    if (JSON.stringify(next) !== JSON.stringify(this.shown)) this.shown = next;
    return this.shown;
  }
}
