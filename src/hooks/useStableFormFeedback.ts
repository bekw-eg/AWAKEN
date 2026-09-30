import { useEffect, useRef, useState } from 'react';
import { NEUTRAL_FORM, type FormFeedback } from '../exercise-engine/formFeedback';
import { PoseFeedbackController } from '../exercise-engine/poseFeedbackController';

/** One bounded timeout for display transitions; the pose loop still owns inference. */
export function useStableFormFeedback(feedback: FormFeedback, enabled: boolean, source: string, reliable = true): FormFeedback {
  const controller = useRef({ source, value: new PoseFeedbackController() });
  const [shown, setShown] = useState({ source, feedback: NEUTRAL_FORM });
  const regions = [...new Set(feedback.regions ?? [])].sort().join(',');
  const { status, message } = feedback;
  useEffect(() => {
    if (!enabled || controller.current.source !== source) controller.current = { source, value: new PoseFeedbackController() };
    if (!enabled) { setShown({ source, feedback: NEUTRAL_FORM }); return; }
    const raw: FormFeedback = { status, message, regions: regions ? regions.split(',') as FormFeedback['regions'] : [] };
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const value = controller.current.value;
      const next = value.update(raw, reliable, performance.now());
      setShown(previous => previous.source === source && previous.feedback === next ? previous : { source, feedback: next });
      if (value.nextUpdateMs !== null) timer = setTimeout(update, value.nextUpdateMs);
    };
    update();
    return () => clearTimeout(timer);
  }, [status, message, regions, enabled, source, reliable]);
  return enabled && shown.source === source ? shown.feedback : NEUTRAL_FORM;
}
