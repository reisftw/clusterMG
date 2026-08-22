import { useState } from "react";

const PER_PAGE = 8;

export default function RankingList({
  items = [],
  metaRef = 110,
  label = "O.S",
}) {
  const [page, setPage] = useState(0);
  const total = items.length;
  const totalPages = Math.ceil(total / PER_PAGE);
  const start = page * PER_PAGE;
  const slice = items.slice(start, start + PER_PAGE);
  const maxVal = items.length ? items[0].total || items[0].realizado || 1 : 1;

  function getVal(item) {
    return item.total ?? item.realizado ?? 0;
  }

  return (
    <div>
      {slice.map((item, i) => {
        const globalPos = start + i + 1;
        const val = getVal(item);
        const pct = item.percent ?? item.pct ?? 0;
        const w = maxVal > 0 ? Math.min((val / maxVal) * 100, 100) : 0;
        const over = parseFloat(pct) > 100;
        const done = parseFloat(pct) >= 100;
        const fillCls = over ? "over" : done ? "complete" : "";

        return (
          <div className="rank-item" key={item.name ?? item.nome ?? i}>
            <div className={`rank-pos ${globalPos <= 3 ? "top" : ""}`}>
              {globalPos}
            </div>
            <div className="rank-info">
              <div className="rank-name">{item.name ?? item.nome}</div>
              <div className="rank-bar">
                <div
                  className={`rank-fill ${fillCls}`}
                  style={{ width: `${w}%` }}
                />
              </div>
              <div className="rank-meta">
                {val} {label} &middot; meta {Math.round(item.meta80 ?? metaRef)}{" "}
                &middot; {pct}%
              </div>
            </div>
            <div
              className="rank-value"
              style={{
                color: over ? "#7c3aed" : done ? "var(--green)" : "var(--text)",
              }}
            >
              {val}
            </div>
          </div>
        );
      })}

      {totalPages > 1 && (
        <div className="rank-pagination">
          <span className="rank-page-info">
            {start + 1}–{Math.min(start + PER_PAGE, total)} de {total}
          </span>
          <div className="rank-page-btns">
            <button
              className="rank-page-btn"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
            >
              &#8249;
            </button>
            {Array.from({ length: totalPages }, (_, p) => (
              <button
                key={p}
                className={`rank-page-btn ${p === page ? "active" : ""}`}
                onClick={() => setPage(p)}
              >
                {p + 1}
              </button>
            ))}
            <button
              className="rank-page-btn"
              onClick={() => setPage((p) => p + 1)}
              disabled={page === totalPages - 1}
            >
              &#8250;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

