export default function AnomaliaList({ anomalias = [] }) {
  if (!anomalias.length)
    return (
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        Sem dados para este mês
      </p>
    );

  return (
    <div className="anomaly-list">
      {anomalias.map((a, i) => (
        <div key={i} className={`anomaly-item ${a.level}`}>
          <div className="anomaly-icon">{a.icon}</div>
          <div>
            <div className="anomaly-title">{a.title}</div>
            <div className="anomaly-desc">{a.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

