import React, { useMemo } from "react";
import "./TopCidadesCard.css";

function rankingCidadesRegionais(ordens, top = 20) {
  const contagem = {};
  ordens.forEach((os) => {
    if (os.agente) return;
    const cidade = os.cidade || "Desconhecida";
    contagem[cidade] = (contagem[cidade] || 0) + 1;
  });
  return Object.entries(contagem)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([cidade, total]) => ({ cidade, total }));
}

function rankingCidadesAgentes(ordens, top = 20) {
  const contagem = {};
  ordens.forEach((os) => {
    if (!os.agente) return;
    const cidade = os.cidade || "Desconhecida";
    contagem[cidade] = (contagem[cidade] || 0) + 1;
  });
  return Object.entries(contagem)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([cidade, total]) => ({ cidade, total }));
}

export default function TopCidadesCard({ ordens }) {
  const top10 = useMemo(() => {
    if (!ordens?.length) return [];

    const regionais = rankingCidadesRegionais(ordens, 20).map((r) => ({
      ...r,
      tipo: "regional",
    }));
    const agentes = rankingCidadesAgentes(ordens, 20).map((a) => ({
      ...a,
      tipo: "agente",
    }));

    return [...regionais, ...agentes]
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [ordens]);

  const maxTotal = top10[0]?.total || 1;

  return (
    <div className="top-cidades-card">
      <div className="top-cidades-header">
        <span className="top-cidades-icon">🏆</span>
        <h2>Top 10 Cidades com mais O.S</h2>
        <span className="top-cidades-subtitle">por volume de O.S</span>
      </div>

      <ol className="top-cidades-lista">
        {top10.map((item, idx) => (
          <li key={`${item.cidade}-${idx}`} className="top-cidades-item">
            <span className={`rank rank-${idx < 3 ? idx + 1 : "default"}`}>
              {idx + 1}
            </span>

            <div className="cidade-info">
              <span className="cidade-nome">{item.cidade}</span>
              {item.tipo === "agente" && (
                <span className="badge-agente">Agente</span>
              )}
            </div>

            <div className="barra-wrapper">
              <div
                className={`barra-fill ${item.tipo === "agente" ? "barra-agente" : ""}`}
                style={{ width: `${(item.total / maxTotal) * 100}%` }}
              />
            </div>

            <span className="cidade-total">{item.total}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
