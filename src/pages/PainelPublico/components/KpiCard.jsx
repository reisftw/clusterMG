export default function KpiCard({ label, value, sub, color = "orange" }) {
  return (
    <div className={`kpi ${color}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}
