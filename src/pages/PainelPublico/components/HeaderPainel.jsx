import { ROUTES } from "../../../router/routes";

export default function HeaderPainel({
  month,
  onMonthChange,
  activeTab,
  onTabChange,
  fbStatusRetiradas,
  fbStatusAgentes,
  fbStatusMapa,
  lastUpdateRetiradas,
  lastUpdateAgentes,
  lastUpdateMapa,
}) {
  const meses = [
    "Janeiro",
    "Fevereiro",
    "Março",
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

  const fbStatus =
    activeTab === "retiradas"
      ? fbStatusRetiradas
      : activeTab === "agentes"
        ? fbStatusAgentes
        : fbStatusMapa;

  const rawLastUpdate =
    activeTab === "retiradas"
      ? lastUpdateRetiradas
      : activeTab === "agentes"
        ? lastUpdateAgentes
        : lastUpdateMapa;

  const lastUpdate =
    rawLastUpdate && typeof rawLastUpdate === "object"
      ? rawLastUpdate.texto ||
        (() => {
          const value =
            rawLastUpdate.data || rawLastUpdate.ultimaAtualizacao || null;
          if (!value) return "";
          const date = value.toDate?.() || new Date(value);
          if (Number.isNaN(date.getTime())) return "";
          return date.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        })()
      : rawLastUpdate;

  return (
    <div className="header">
      <div className="header-left">
        <svg width="140" height="48" viewBox="0 0 140 48" fill="none">
          <path
            d="M22 22C22 17 26 13 31 13C36 13 40 17 40 22C40 27 36 31 31 31C26 31 22 27 22 22Z"
            stroke="#FF6B00"
            strokeWidth="2.8"
            fill="none"
          />
          <path
            d="M22 22C22 17 18 13 13 13C8 13 4 17 4 22C4 27 8 31 13 31"
            stroke="rgba(255,255,255,0.8)"
            strokeWidth="2.8"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M22 22C22 27 18 31 13 31"
            stroke="#FF6B00"
            strokeWidth="2.8"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="31" cy="13" r="2.5" fill="#FF6B00" />
          <text
            x="50"
            y="26"
            fontFamily="Outfit,sans-serif"
            fontWeight="700"
            fontSize="18"
            fill="#FFFFFF"
            letterSpacing="0.5"
          >
            Sempre
          </text>
          <text
            x="50"
            y="40"
            fontFamily="Outfit,sans-serif"
            fontWeight="400"
            fontSize="10"
            fill="#FF6B00"
            letterSpacing="2.5"
          >
            internet
          </text>
        </svg>
        <div>
          <h1>
            {activeTab === "retiradas"
              ? "Dashboard Retiradas"
              : activeTab === "agentes"
                ? "Dashboard Agentes Autorizados"
                : "Dashboard Mapa de O.S"}
            {activeTab === "agentes" && (
              <span className="badge-agente" style={{ marginLeft: 12 }}>
                Agente Aut.
              </span>
            )}
          </h1>
          <p id="last-update-txt">{lastUpdate || "Carregando dados..."}</p>
          <p className="fb-status">{fbStatus}</p>
        </div>
      </div>

      <div className="header-right">
        {/* Tabs */}
        <div className="painel-tabs">
          <button
            className={`painel-tab ${activeTab === "mapa" ? "active" : ""}`}
            onClick={() => window.location.assign(ROUTES.PAINEL_MAPA)}
          >
            🗺️ Mapa de O.S
          </button>
          <button
            className={`painel-tab ${activeTab === "match" ? "active" : ""}`}
            onClick={() => window.location.assign(ROUTES.PAINEL_MATCH)}
          >
            Match - OS
          </button>
          <button
            className={`painel-tab ${activeTab === "retiradas" ? "active" : ""}`}
            onClick={() => onTabChange("retiradas")}
          >
            📊 Retiradas
          </button>
          <button
            className={`painel-tab ${activeTab === "agentes" ? "active" : ""}`}
            onClick={() => onTabChange("agentes")}
          >
            🏢 Agentes Autorizados
          </button>
        </div>

        {/* Mês */}
        <select
          className="month-selector"
          value={month}
          onChange={(e) => onMonthChange(e.target.value)}
        >
          {meses.map((m) => (
            <option key={m} value={m}>
              {m} 2026
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
