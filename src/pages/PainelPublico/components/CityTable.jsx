export default function CityTable({ cidades = [], onCityClick }) {
  function pctClass(pct) {
    if (pct > 100) return "over";
    if (pct >= 80) return "ok";
    if (pct >= 50) return "warn";
    return "bad";
  }

  function statusPill(pct) {
    if (pct > 100)
      return <span className="status-pill over">⚡ Acima da Meta</span>;
    if (pct >= 80)
      return <span className="status-pill atingido">✅ Meta Atingida</span>;
    if (pct >= 50)
      return <span className="status-pill andamento">⏳ Em Andamento</span>;
    return <span className="status-pill abaixo">🚨 Abaixo</span>;
  }

  const total = cidades.reduce(
    (acc, c) => ({
      cancelamentos: acc.cancelamentos + c.cancelamentos,
      meta80: acc.meta80 + c.meta80,
      realizado: acc.realizado + c.realizado,
      falta: acc.falta + c.falta,
    }),
    { cancelamentos: 0, meta80: 0, realizado: 0, falta: 0 },
  );

  const totalPct =
    total.cancelamentos > 0
      ? ((total.realizado / total.cancelamentos) * 100).toFixed(1)
      : 0;

  return (
    <div className="city-table-wrap">
      <table className="city-table">
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Cidade</th>
            <th>Cancelamentos</th>
            <th>Meta 80%</th>
            <th>Realizado</th>
            <th>Falta</th>
            <th>% Atingido</th>
            <th>Status</th>
            <th>Relatório</th>
          </tr>
        </thead>
        <tbody>
          {cidades.map((c, i) => {
            const cls = pctClass(c.pct);
            return (
              <tr
                key={i}
                style={{ cursor: "pointer" }}
                onClick={() => onCityClick(c)}
              >
                <td>{c.nome}</td>
                <td>{c.cancelamentos}</td>
                <td>{Math.round(c.meta80)}</td>
                <td>
                  <strong>{c.realizado}</strong>
                </td>
                <td>
                  <span
                    className={`badge ${c.falta > 0 ? "neg" : c.falta < 0 ? "pos" : "zero"}`}
                  >
                    {c.falta > 0 ? `-${c.falta}` : `+${Math.abs(c.falta)}`}
                  </span>
                </td>
                <td>
                  <div className="pct-bar-wrap">
                    <div className="pct-bar">
                      <div
                        className={`pct-fill ${cls}`}
                        style={{ width: `${Math.min(c.pct, 100)}%` }}
                      />
                    </div>
                    <span className={`pct-txt ${cls}`}>{c.pct}%</span>
                  </div>
                </td>
                <td>{statusPill(c.pct)}</td>
                <td>
                  <button
                    className="btn-city-pdf"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCityClick(c);
                    }}
                  >
                    📄 Ver
                  </button>
                </td>
              </tr>
            );
          })}

          <tr className="total-row">
            <td>TOTAL GERAL</td>
            <td>{total.cancelamentos}</td>
            <td>{Math.round(total.meta80)}</td>
            <td>{total.realizado}</td>
            <td>
              <span className={`badge ${total.falta > 0 ? "neg" : "pos"}`}>
                {total.falta > 0
                  ? `-${Math.round(total.falta)}`
                  : `+${Math.abs(Math.round(total.falta))}`}
              </span>
            </td>
            <td>
              <div className="pct-bar-wrap">
                <div className="pct-bar">
                  <div
                    className={`pct-fill ${pctClass(parseFloat(totalPct))}`}
                    style={{ width: `${Math.min(parseFloat(totalPct), 100)}%` }}
                  />
                </div>
                <span className={`pct-txt ${pctClass(parseFloat(totalPct))}`}>
                  {totalPct}%
                </span>
              </div>
            </td>
            <td colSpan="2">{statusPill(parseFloat(totalPct))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
