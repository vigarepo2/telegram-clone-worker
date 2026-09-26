export function StatGrid({
  items,
}: {
  items: { label: string; value: string | number }[];
}) {
  return (
    <div className="stat-grid">
      {items.map((item) => (
        <div className="stat-card" key={item.label}>
          <span className="stat-label">{item.label}</span>
          <strong className="stat-value">{item.value}</strong>
        </div>
      ))}
    </div>
  );
}
