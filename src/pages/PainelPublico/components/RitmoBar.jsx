export default function RitmoBar({ ritmo }) {
  if (!ritmo) return null;

  const icons = { ok: "✅", warn: "⚠️", danger: "🚨" };
  const msgs = {
    ok: `Ritmo adequado — média de ${ritmo.media} O.S/dia útil`,
    warn: `Ritmo abaixo do esperado — média de ${ritmo.media} O.S/dia útil`,
    danger: `Ritmo crítico — média de ${ritmo.media} O.S/dia útil`,
  };

  return (
    <div className="ritmo-bar">
      <div className="ritmo-icon">{icons[ritmo.status]}</div>
      <div className="ritmo-content">
        <div className="ritmo-title">Ritmo em Tempo Real</div>
        <div className="ritmo-msg">{msgs[ritmo.status]}</div>
        <div className="ritmo-detail">
          Necessário: {ritmo.necessario} O.S/dia útil &middot;{" "}
          {ritmo.diasAnalisados} dias analisados &middot; {ritmo.ratio}% do
          ritmo necessário
        </div>
      </div>
      <div className={`ritmo-badge ${ritmo.status}`}>{ritmo.badge}</div>
    </div>
  );
}
