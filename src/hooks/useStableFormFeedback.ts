import { useEffect, useState } from 'react';
import { FORM_DISPLAY_CONFIG as C, NEUTRAL_FORM, type FormFeedback } from '../exercise-engine/formFeedback';

/** Only display is debounced. Rep validation remains immediate in the detectors. */
export function useStableFormFeedback(feedback: FormFeedback, enabled: boolean, source: string): FormFeedback {
  const [shown, setShown] = useState<{ source: string; feedback: FormFeedback }>({ source, feedback: NEUTRAL_FORM });
  const regions = (feedback.regions ?? []).join(',');
  const status = feedback.status, message = feedback.message;
  useEffect(() => {
    if (!enabled) { setShown({ source, feedback: NEUTRAL_FORM }); return; }
    const next: FormFeedback = { status, message, regions: regions ? regions.split(',') as FormFeedback['regions'] : [] };
    const isProblem = status === 'error' || status === 'warning';
    const wasProblem = shown.source === source && (shown.feedback.status === 'error' || shown.feedback.status === 'warning');
    if (!isProblem && !wasProblem) { setShown({ source, feedback: next }); return; }
    const timer = setTimeout(() => setShown({ source, feedback: next }), isProblem ? C.errorHoldMs : C.clearDelayMs);
    return () => clearTimeout(timer);
    // Output state deliberately excluded: committing feedback must not restart its timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, message, regions, enabled, source]);
  return enabled && shown.source === source ? shown.feedback : NEUTRAL_FORM;
}
