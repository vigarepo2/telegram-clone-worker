export type BadgeVariant =
  "live" | "running" | "paused" | "complete" | "error" | "failed" | "idle";
const tone: Record<BadgeVariant, string> = {
  live: "success",
  running: "success",
  complete: "success",
  paused: "warning",
  error: "danger",
  failed: "danger",
  idle: "neutral",
};
const labels: Record<BadgeVariant, string> = {
  live: "New messages",
  running: "Copying",
  complete: "Completed",
  paused: "Paused",
  error: "Error",
  failed: "Needs attention",
  idle: "Stopped",
};
export function Badge({
  variant,
  label,
}: {
  variant: BadgeVariant;
  label?: string;
}) {
  return (
    <span className={`badge badge-${tone[variant]}`}>
      <span className="badge-dot" aria-hidden="true" />
      {label ?? labels[variant]}
    </span>
  );
}
