import { useMemo, useState } from "react";

const META_INDIVIDUAL = 110;
const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function getCardState(total) {
  if (total >= META_INDIVIDUAL) return "done";
  if (total >= META_INDIVIDUAL * 0.8) return "on-track";
  return "at-risk";
}

function normalizeMonthName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ã§/gi, "c")
    .replace(/ÃƒÂ§/gi, "c")
    .toLowerCase()
    .trim();
}

function getMonthContext(month) {
  const now = new Date();
  const currentMonthIndex = now.getMonth();
  const selectedMonthIndex = MONTHS.findIndex(
    (item) => normalizeMonthName(item) === normalizeMonthName(month),
  );

  if (selectedMonthIndex < 0) {
    return {
      isCurrentMonth: false,
      isPastMonth: false,
      isFutureMonth: false,
      daysRemaining: 0,
    };
  }

  if (selectedMonthIndex === currentMonthIndex) {
    const totalDaysInMonth = new Date(
      now.getFullYear(),
      selectedMonthIndex + 1,
      0,
    ).getDate();

    return {
      isCurrentMonth: true,
      isPastMonth: false,
      isFutureMonth: false,
      daysRemaining: Math.max(0, totalDaysInMonth - now.getDate()),
    };
  }

  if (selectedMonthIndex < currentMonthIndex) {
    return {
      isCurrentMonth: false,
      isPastMonth: true,
      isFutureMonth: false,
      daysRemaining: 0,
    };
  }

  return {
    isCurrentMonth: false,
    isPastMonth: false,
    isFutureMonth: true,
    daysRemaining: new Date(
      now.getFullYear(),
      selectedMonthIndex + 1,
      0,
    ).getDate(),
  };
}

function getStatusText(total, meta, monthContext) {
  const faltam = Math.max(0, meta - total);
  if (monthContext.isFutureMonth) return "Mes ainda nao iniciado";
  if (faltam === 0) return "Meta atingida no mes";
  if (monthContext.isCurrentMonth) return `Em andamento: faltam ${faltam} O.S`;
  if (monthContext.isPastMonth) return `Fechado: faltaram ${faltam} O.S`;
  return `Faltam ${faltam} O.S`;
}

function getDailyNeeded(faltam, meta, monthContext) {
  if (monthContext.isPastMonth) return null;
  if (faltam === 0) return "0.0";

  const diasBase =
    monthContext.daysRemaining > 0 ? monthContext.daysRemaining : 1;
  const base = monthContext.isFutureMonth ? meta : faltam;

  return (base / diasBase).toFixed(1);
}

function getDailyNeededText(dailyNeeded, monthContext) {
  if (dailyNeeded === null) return null;
  if (monthContext.isFutureMonth) return `Meta media: ${dailyNeeded} O.S/dia`;
  if (Number(dailyNeeded) === 0) return "Meta diaria cumprida";
  return `Precisa de ${dailyNeeded} O.S/dia`;
}

export default function TecIndividual({
  title,
  icon,
  items = [],
  meta = META_INDIVIDUAL,
  month,
}) {
  const [collapsed, setCollapsed] = useState(true);
  const monthContext = useMemo(() => getMonthContext(month), [month]);

  const normalizedItems = useMemo(
    () =>
      (Array.isArray(items) ? items : []).map((item) => {
        const realizado = Number(item?.total) || 0;
        const faltam = Math.max(0, meta - realizado);
        const pct = Math.min((realizado / meta) * 100, 100);
        const state = getCardState(realizado);
        const dailyNeeded = getDailyNeeded(faltam, meta, monthContext);

        return {
          name: item?.name || "-",
          realizado,
          meta,
          faltam,
          diasRestantes: monthContext.daysRemaining,
          pct,
          state,
          statusText: getStatusText(realizado, meta, monthContext),
          dailyNeededText: getDailyNeededText(dailyNeeded, monthContext),
        };
      }),
    [items, meta, monthContext],
  );

  return (
    <div className="card grid-full">
      <div
        className="card-title"
        style={{ justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setCollapsed((current) => !current)}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span>{icon}</span>
          <span>{title}</span>
        </span>
        <span className={`dropdown-icon ${collapsed ? "" : "open"}`}>^</span>
      </div>

      {!collapsed && (
        <div className="tec-grid">
          {normalizedItems.map((item) => (
            <div key={item.name} className={`tec-card ${item.state}`}>
              <div className="tec-name">{item.name}</div>

              <div className="tec-numbers">
                <div className="tec-num">
                  <div
                    className="tec-num-val"
                    style={{ color: "var(--orange)" }}
                  >
                    {item.realizado}
                  </div>
                  <div className="tec-num-lbl">Realizado</div>
                </div>

                <div className="tec-num">
                  <div className="tec-num-val" style={{ color: "var(--blue)" }}>
                    {item.meta}
                  </div>
                  <div className="tec-num-lbl">Meta</div>
                </div>

                <div className="tec-num">
                  <div
                    className="tec-num-val"
                    style={{
                      color:
                        item.faltam === 0 ? "var(--green)" : "var(--red)",
                    }}
                  >
                    {item.faltam}
                  </div>
                  <div className="tec-num-lbl">Faltam</div>
                </div>

                <div className="tec-num">
                  <div
                    className="tec-num-val"
                    style={{ color: "var(--muted)" }}
                  >
                    {item.diasRestantes}
                  </div>
                  <div className="tec-num-lbl">Dias Rest.</div>
                </div>
              </div>

              <div className="tec-progress">
                <div
                  className="tec-progress-fill"
                  style={{
                    width: `${item.pct}%`,
                    background:
                      item.faltam === 0
                        ? "linear-gradient(90deg, var(--green), #36B37E)"
                        : "linear-gradient(90deg, var(--orange), #FF8B00)",
                  }}
                />
              </div>

              <div
                className="tec-status"
                style={{
                  color: item.faltam === 0 ? "var(--green)" : "var(--orange)",
                }}
              >
                {item.faltam === 0 ? "OK " : "! "}
                {item.statusText}
              </div>

              {item.dailyNeededText ? (
                <div
                  className="tec-status"
                  style={{
                    marginTop: 4,
                    color: item.faltam === 0 ? "var(--green)" : "var(--blue)",
                  }}
                >
                  OS/dia: {item.dailyNeededText}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
