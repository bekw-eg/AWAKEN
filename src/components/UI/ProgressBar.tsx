export function ProgressBar({ value, max, label, tone = 'accent' }: {
  value: number; max: number; label: string; tone?: 'accent' | 'danger' | 'muted';
}) {
  const clamped = Math.min(Math.max(value, 0), Math.max(max, 0));
  return (
    <div className={`progress-track progress-${tone}`} role="progressbar" aria-label={label}
      aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={max}>
      <span style={{ width: `${max > 0 ? clamped / max * 100 : 0}%` }} />
    </div>
  );
}
