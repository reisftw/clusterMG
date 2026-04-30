export default function EmptyState({
  icon = "📊",
  title = "Sem dados",
  desc = "",
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      {desc && <p>{desc}</p>}
    </div>
  );
}
