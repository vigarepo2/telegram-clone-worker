export function ProgressBar({
  processed = 0,
  total = 0,
  failed = 0,
}: {
  processed?: number | null;
  total?: number | null;
  failed?: number | null;
}) {
  const count = Math.min(total ?? 0, (processed ?? 0) + (failed ?? 0));
  const percent = total ? Math.min(100, Math.round((count / total) * 100)) : 0;
  return (
    <div className="task-progress">
      <progress
        className="progress"
        max={100}
        value={percent}
        aria-label="History scan progress"
      />
      <div className="progress-caption">
        <span>
          {count.toLocaleString()} of {(total ?? 0).toLocaleString()} message
          IDs checked
        </span>
        <span>{percent}%</span>
      </div>
    </div>
  );
}
