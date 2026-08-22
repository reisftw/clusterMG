import { ROUTES } from "../../../router/routes";
import PwaInstallButton from "../../../components/layout/PwaInstallButton";
import PublicNotificationsButton from "../../../components/layout/PublicNotificationsButton";
import { ClipboardList, Map, Route, ShieldCheck } from "lucide-react";
import { resolveVpsDate } from "../../../services/vpsDate";

const MESES_2026 = [
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

const TAB_TITLES = {
  retiradas: "Dashboard Retiradas",
  agentes: "Dashboard Agentes Autorizados",
  relatorios: "Central de Relatórios",
  mapa: "Dashboard Mapa de O.S",
  match: "Dashboard Mapa de O.S",
};

function resolveActiveValue(activeTab, values = {}) {
  return values[activeTab] ?? values.mapa;
}

function formatLastUpdate(rawLastUpdate) {
  if (!rawLastUpdate || typeof rawLastUpdate !== "object") return rawLastUpdate;
  if (rawLastUpdate.texto) return rawLastUpdate.texto;

  const value = rawLastUpdate.data || rawLastUpdate.ultimaAtualizacao || null;
  if (!value) return "";
  const date = resolveVpsDate(value);
  if (!date) return "";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HeaderPainel({
  month,
  onMonthChange,
  activeTab,
  fbStatusRetiradas,
  fbStatusAgentes,
  fbStatusMapa,
  fbStatusRelatorios,
  lastUpdateRetiradas,
  lastUpdateAgentes,
  lastUpdateMapa,
  lastUpdateRelatorios,
}) {
  const fbStatus = resolveActiveValue(activeTab, {
    retiradas: fbStatusRetiradas,
    agentes: fbStatusAgentes,
    relatorios: fbStatusRelatorios,
    mapa: fbStatusMapa,
  });
  const lastUpdate = formatLastUpdate(resolveActiveValue(activeTab, {
    retiradas: lastUpdateRetiradas,
    agentes: lastUpdateAgentes,
    relatorios: lastUpdateRelatorios,
    mapa: lastUpdateMapa,
  }));
  const title = TAB_TITLES[activeTab] || TAB_TITLES.mapa;

  return (
    <div className="header">
      <div className="header-left">
        <img
          src="/cluster-mg.png"
          alt="Logo Retirada Painel"
          className="header-logo"
        />
        <div>
          <h1>
            {title}
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
        <div className="painel-tabs">
          <button
            className={`painel-tab ${activeTab === "retiradas" ? "active" : ""}`}
            onClick={() => window.location.assign(ROUTES.PAINEL_PUBLICO)}
          >
            <ClipboardList size={14} aria-hidden="true" />
            Visão geral
          </button>
          <button
            className={`painel-tab ${activeTab === "agentes" ? "active" : ""}`}
            onClick={() => window.location.assign(ROUTES.PAINEL_AGENTES)}
          >
            <ShieldCheck size={14} aria-hidden="true" />
            Agentes
          </button>
          <PublicNotificationsButton className="public-install-btn public-header-btn" />
          <PwaInstallButton
            labelMode="full"
            className="public-install-btn public-header-btn"
          />
          <button
            className={`painel-tab ${activeTab === "mapa" ? "active" : ""}`}
            onClick={() => window.location.assign(ROUTES.PAINEL_MAPA)}
          >
            <Map size={14} aria-hidden="true" />
            Mapa de O.S.
          </button>
          <button
            className={`painel-tab ${activeTab === "match" ? "active" : ""}`}
            onClick={() => window.location.assign(ROUTES.PAINEL_MATCH)}
          >
            <Route size={14} aria-hidden="true" />
            Match - OS
          </button>
        </div>

        <select
          className="month-selector"
          value={month}
          onChange={(e) => onMonthChange(e.target.value)}
        >
          {MESES_2026.map((m) => (
            <option key={m} value={m}>
              {m} 2026
            </option>
          ))}
        </select>
        <span className="header-avatar" aria-label="Usuario AD">
          AD
        </span>
      </div>
    </div>
  );
}

