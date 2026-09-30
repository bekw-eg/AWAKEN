import { useEffect, useRef } from 'react';
import { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '../../types/pose';
import { NEUTRAL_FORM, POSE_COLORS, poseColorStatus, type FormFeedback, type FormStatus } from '../../exercise-engine/formFeedback';

type Props = {
  landmarks: NormalizedLandmark[] | null;
  width: number;
  height: number;
  feedback?: FormFeedback;
  jointColor?: (index: number) => string;
  connectionColor?: (start: number, end: number) => string;
};

export function PoseOverlay({ landmarks, width, height, feedback = NEUTRAL_FORM, jointColor, connectionColor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = useRef<Record<FormStatus, string>>({ neutral: '', correct: '', warning: '', error: '' });
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
    if (!landmarks) return;

    const visible = (point: NormalizedLandmark | undefined): point is NormalizedLandmark =>
      !!point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
      (point.visibility ?? 1) >= 0.5;

    const scale = Math.max(width / 960, 0.6);
    ctx.lineWidth = 2.5 * scale;
    ctx.lineCap = 'round';
    ctx.shadowBlur = 6 * scale;
    for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
      const a = landmarks[start];
      const b = landmarks[end];
      if (!visible(a) || !visible(b)) continue;
      ctx.strokeStyle = connectionColor?.(start, end) ?? palette.current[poseColorStatus(feedback, start, end)];
      ctx.shadowColor = ctx.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(a.x * width, a.y * height);
      ctx.lineTo(b.x * width, b.y * height);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    landmarks.forEach((point, index) => {
      if (!visible(point)) return;
      ctx.fillStyle = jointColor?.(index) ?? palette.current[poseColorStatus(feedback, index)];
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, 3.5 * scale, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [landmarks, width, height, jointColor, connectionColor, feedback]);

  return <canvas ref={canvasRef} className="pose-overlay" width={width} height={height} aria-hidden="true" />;
}
