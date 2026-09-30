import { useEffect, useRef } from 'react';
import { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '../../types/pose';
import { FORM_DISPLAY_CONFIG, NEUTRAL_FORM, POSE_COLORS, poseColorStatus, type FormFeedback, type FormStatus } from '../../exercise-engine/formFeedback';

type Props = {
  landmarks: NormalizedLandmark[] | null;
  width: number;
  height: number;
  feedback?: FormFeedback;
  enabled?: boolean;
  jointColor?: (index: number) => string;
  connectionColor?: (start: number, end: number) => string;
};

export function PoseOverlay({ landmarks, width, height, feedback = NEUTRAL_FORM, enabled = true, jointColor, connectionColor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = useRef<Record<FormStatus, string>>({ neutral: '', correct: '', warning: '', error: '' });
  const visibleJoints = useRef(new Set<number>());
  const lastPose = useRef<{ landmarks: NormalizedLandmark[]; width: number; height: number; at: number } | null>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const style = getComputedStyle(canvasRef.current);
    for (const key of Object.keys(POSE_COLORS) as FormStatus[]) palette.current[key] = style.getPropertyValue(POSE_COLORS[key]).trim();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!enabled) { lastPose.current = null; visibleJoints.current.clear(); return; }
    // Hold only a short missing-pose gap. Never feed these display points to detection.
    if (landmarks && lastPose.current?.landmarks !== landmarks) lastPose.current = { landmarks, width, height, at: performance.now() };
    const saved = lastPose.current;
    const remaining = saved ? FORM_DISPLAY_CONFIG.trackingGraceMs - (performance.now() - saved.at) : 0;
    const points = landmarks ?? (saved && saved.width === width && saved.height === height && remaining > 0 ? saved.landmarks : null);
    if (!points) { visibleJoints.current.clear(); return; }
    const clearTimer = !landmarks ? setTimeout(() => {
      ctx.clearRect(0, 0, width, height); visibleJoints.current.clear(); lastPose.current = null;
    }, remaining) : undefined;

    points.forEach((point, index) => {
      // Visibility itself used to toggle lines at exactly 0.5 on every frame.
      const threshold = visibleJoints.current.has(index) ? 0.4 : 0.55;
      if (Number.isFinite(point.x) && Number.isFinite(point.y) && (point.visibility ?? 1) >= threshold) visibleJoints.current.add(index);
      else visibleJoints.current.delete(index);
    });

    const scale = Math.max(width / 960, 0.6);
    ctx.lineWidth = 2.5 * scale;
    ctx.lineCap = 'round';
    ctx.shadowBlur = 6 * scale;
    for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
      const a = points[start];
      const b = points[end];
      if (!a || !b || !visibleJoints.current.has(start) || !visibleJoints.current.has(end)) continue;
      ctx.strokeStyle = connectionColor?.(start, end) ?? palette.current[poseColorStatus(feedback, start, end)];
      ctx.shadowColor = ctx.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(a.x * width, a.y * height);
      ctx.lineTo(b.x * width, b.y * height);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    points.forEach((point, index) => {
      if (!visibleJoints.current.has(index)) return;
      ctx.fillStyle = jointColor?.(index) ?? palette.current[poseColorStatus(feedback, index)];
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, 3.5 * scale, 0, Math.PI * 2);
      ctx.fill();
    });
    return () => clearTimeout(clearTimer);
  }, [landmarks, width, height, jointColor, connectionColor, feedback, enabled]);

  return <canvas ref={canvasRef} className="pose-overlay" width={width} height={height} aria-hidden="true" />;
}
