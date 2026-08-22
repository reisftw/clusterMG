import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CalendarCheck,
  Clock3,
  Eye,
  Image as ImageIcon,
  MapPin,
  Medal,
  Radio,
  Route,
  Save,
  Settings,
  Siren,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";
import { useAgenda } from "../../modules/agenda/hooks/useAgenda";
import { useDiarioEntries } from "../../modules/diario/hooks/useDiarioEntries";
import {
  DIARIO_HORARIOS,
  formatDateLabel as formatDiarioDateLabel,
} from "../../modules/diario/services/diarioService";
import { useRetiradas } from "../PainelPublico/hooks/useRetiradas";
import {
  invalidateDashboardDataCache,
  useDashboardData,
} from "../PainelPublico/hooks/useDashboardData";
import { useMatchPublico } from "../PainelPublico/hooks/useMatchPublico";
import { buildMatchOSData } from "../Mapa/utils/matchOs";
import { buildPublicMapaSnapshot } from "../Mapa/utils/mapaUtils";
import { obterMesAtual } from "../../utils/mes";
import {
  buildMetaDiariaSchedule,
  buildMonthProjection,
} from "../../utils/metasProjection";
import { invalidateCache } from "../../services/dataCache";
import { COLLECTIONS } from "../../constants/dataCollections";
import {
  getVpsDocument,
  listAllVpsDocuments,
} from "../../services/vpsApiClient";
import { invalidateInternalStaticDataCache } from "../../services/internalStaticDataService";
import { subscribeRealtimeTopics } from "../../services/realtimeEvents";
import {
  deleteAcompanhamentoAd,
  loadAcompanhamentoConfig,
  saveAcompanhamentoConfig,
  uploadAcompanhamentoAd,
} from "./acompanhamentoConfigService";
import "./AcompanhamentoPage.css";

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const SCENE_INTERVAL_MS = 14 * 1000;
const CURSOR_IDLE_TIMEOUT_MS = 60 * 1000;
const CONFIG_STORAGE_KEY = "acompanhamento-panel-config";
const MONTH_ORDER = [
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

const DEFAULT_CONFIG = {
  sections: {
    spotlight: true,
    kpis: true,
    status: true,
    agenda: true,
    entregasDiarias: true,
    atendentes: true,
    cidades: true,
    regionais: true,
    tecnicos: true,
    entregasRegionais: true,
    match: true,
    insights: true,
  },
  customInsights: "",
  ads: {
    enabled: false,
    intervalMinutes: 3,
    durationSeconds: 15,
    images: [],
  },
  metaShowcase: {
    enabled: true,
    intervalMinutes: 1,
    durationSeconds: 12,
  },
  appointmentNotice: {
    durationSeconds: 20,
  },
  festive: {
    enabled: false,
    theme: "christmas",
    intervalSeconds: 120,
    grinchIntervalSeconds: 90,
    grinchDurationSeconds: 8,
  },
};

const GRINCH_PEEK_SIDES = ["bottom", "right", "top", "left"];
const REALTIME_SOURCE_LABELS = {
  mapa: "Mapa",
  match: "MATCH",
  metas: "Metas",
};

const SECTION_LABELS = [
  ["spotlight", "Destaque animado"],
  ["kpis", "Cards principais"],
  ["status", "Entrega da operação"],
  ["agenda", "Agenda do dashboard"],
  ["entregasDiarias", "Entregas por dia"],
  ["atendentes", "Ranking de atendentes"],
  ["cidades", "Cidades com mais O.S"],
  ["regionais", "Regionais com retiradas em aberto"],
  ["tecnicos", "Técnicos com agenda hoje"],
  ["entregasRegionais", "Entregas por regional"],
  ["match", "Match e oportunidades"],
  ["insights", "Barra de avisos"],
];

function loadPanelConfig() {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(CONFIG_STORAGE_KEY) || "null",
    );
    return {
      ...DEFAULT_CONFIG,
      ...(stored || {}),
      sections: {
        ...DEFAULT_CONFIG.sections,
        ...(stored?.sections || {}),
      },
      ads: {
        ...DEFAULT_CONFIG.ads,
        ...(stored?.ads || {}),
        images: Array.isArray(stored?.ads?.images)
          ? stored.ads.images
          : [],
      },
      metaShowcase: {
        ...DEFAULT_CONFIG.metaShowcase,
        ...(stored?.metaShowcase || {}),
      },
      appointmentNotice: {
        ...DEFAULT_CONFIG.appointmentNotice,
        ...(stored?.appointmentNotice || {}),
      },
      festive: {
        ...DEFAULT_CONFIG.festive,
        ...(stored?.festive || {}),
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function editableNumber(value, fallback) {
  return value === "" ? "" : (value ?? fallback);
}

function fileToFullHdAdImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Arquivo invalido."));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = new window.Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const width = 1920;
        const height = 1080;
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        const scale = Math.max(width / image.width, height / image.height);
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        const x = (width - drawWidth) / 2;
        const y = (height - drawHeight) / 2;
        context.drawImage(image, x, y, drawWidth, drawHeight);
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve({ blob, name: file.name })
              : reject(new Error("Nao foi possivel processar a imagem.")),
          "image/jpeg",
          0.88,
        );
      };
      image.onerror = () =>
        reject(new Error("Nao foi possivel carregar a imagem."));
      image.src = String(reader.result || "");
    };
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function parseLocalDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatShortDate(value) {
  const date = parseLocalDate(value);
  return date
    ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    : "--";
}

function formatLongDate(value) {
  const date = parseLocalDate(value);
  return date
    ? date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "-";
}

function normalizeAppointmentNotice(event = {}) {
  if (event.collectionPath !== COLLECTIONS.AGENDAMENTOS) return null;
  const data = event.data && typeof event.data === "object" ? event.data : {};
  const createdAt = data.criado_em || data.createdAt || data.created_at || event.emittedAt;
  const createdTime = createdAt ? new Date(createdAt).getTime() : Date.now();
  const isRecent = Number.isFinite(createdTime)
    ? Date.now() - createdTime <= 90 * 1000
    : true;
  if (!isRecent || event.action === "delete") return null;

  const id = event.documentId || data.id || `${data.codigo_cliente || ""}-${data.data || ""}-${data.hora || data.turno || ""}`;
  const date = data.data || data.data_agendamento || "";
  const time = data.hora || data.hora_agendamento || data.turno || "";

  return {
    id,
    key: `${date || "-"}|${time || "-"}`,
    cliente:
      data.cliente_nome ||
      data.cliente ||
      data.nome_cliente ||
      (data.codigo_cliente ? `Cliente ${data.codigo_cliente}` : "Cliente não informado"),
    codigo: data.codigo_cliente || data.contrato || data.os || "",
    data: date,
    hora: time || "Sem horário",
    agendadoPor:
      data.agendado_por_nome ||
      data.atendente_nome ||
      data.criado_por_nome ||
      data.usuario_nome ||
      "Não informado",
    cidade: data.cidade || "",
  };
}

function buildAppointmentRealtimeEvent(item = {}) {
  return {
    action: "upsert",
    collectionPath: COLLECTIONS.AGENDAMENTOS,
    documentId: item.id || item.documentId || "",
    eventType: "agendamento_upsert",
    data: item,
    emittedAt: new Date().toISOString(),
  };
}

function normalizeLabel(value, fallback = "Nao informado") {
  const text = String(value || "").trim();
  return text || fallback;
}

function localDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDaysDateKey(days, date = new Date()) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return localDateKey(next);
}

function monthDateRangeFor(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    start: localDateKey(start),
    end: localDateKey(end),
  };
}

function countRealtimeBy(items, getKey, fallback = "Nao informado", limit = 8) {
  const totals = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = normalizeLabel(getKey(item), fallback);
    totals.set(key, (totals.get(key) || 0) + 1);
  });
  return [...totals.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort(
      (a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"),
    )
    .slice(0, limit);
}

function buildRealtimeAttendantRanking(items = [], limit = 8) {
  const totals = new Map();

  (Array.isArray(items) ? items : [])
    .filter((item) => item?.status !== "Cancelado")
    .forEach((item) => {
      const key =
        item.atendente_id ||
        item.criado_por_id ||
        item.atualizado_por_id ||
        item.agendado_por_id ||
        item.usuario_id ||
        item.atendente_nome ||
        item.criado_por_nome ||
        item.atualizado_por_nome ||
        item.agendado_por_nome ||
        item.usuario_nome ||
        "";
      const label = normalizeLabel(
        item.atendente_nome ||
          item.criado_por_nome ||
          item.atualizado_por_nome ||
          item.agendado_por_nome ||
          item.usuario_nome,
        "Sem atendente",
      );
      if (!key || label === "Sem atendente") return;
      const current = totals.get(key) || { label, total: 0 };
      current.total += 1;
      totals.set(key, current);
    });

  return [...totals.values()]
    .sort(
      (a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"),
    )
    .slice(0, limit);
}

function useRealtimeAcompanhamento(now, onLiveUpdate) {
  const [monthlyAppointments, setMonthlyAppointments] = useState(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState(null);
  const monthRange = monthDateRangeFor(now);
  const today = localDateKey(now);
  const next7 = addDaysDateKey(7, now);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const items = await listAllVpsDocuments(COLLECTIONS.AGENDAMENTOS, {
        pageSize: 1000,
      });
      if (!active) return;
      setMonthlyAppointments(
        items
          .filter((item) => item.data >= monthRange.start && item.data <= monthRange.end)
          .sort((a, b) => String(a.data || "").localeCompare(String(b.data || ""))),
      );
      onLiveUpdate?.();
    };
    load().catch(console.error);
    const timer = window.setInterval(() => load().catch(console.error), 30000);
    const unsubscribeRealtime = subscribeRealtimeTopics(["acompanhamento"], () => {
      load().catch(console.error);
    }, { debounceMs: 250 });
    return () => {
      active = false;
      window.clearInterval(timer);
      unsubscribeRealtime();
    };
  }, [monthRange.end, monthRange.start, onLiveUpdate]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const items = await listAllVpsDocuments(COLLECTIONS.AGENDAMENTOS, { pageSize: 1000 });
      if (!active) return;
      setUpcomingAppointments(
        items
          .filter((item) => item.data >= today && item.data <= next7)
          .sort((a, b) => String(a.data || "").localeCompare(String(b.data || ""))),
      );
      onLiveUpdate?.();
    };
    load().catch(console.error);
    const timer = window.setInterval(() => load().catch(console.error), 30000);
    const unsubscribeRealtime = subscribeRealtimeTopics(["acompanhamento"], () => {
      load().catch(console.error);
    }, { debounceMs: 250 });
    return () => {
      active = false;
      window.clearInterval(timer);
      unsubscribeRealtime();
    };
  }, [next7, onLiveUpdate, today]);

  return useMemo(() => {
    const result = {};
    if (Array.isArray(monthlyAppointments)) {
      result.atendentes = buildRealtimeAttendantRanking(
        monthlyAppointments,
        8,
      );
    }
    if (Array.isArray(upcomingAppointments)) {
      const activeUpcoming = upcomingAppointments.filter(
        (item) => item.status !== "Cancelado",
      );
      const todayItems = activeUpcoming.filter((item) => item.data === today);
      result.agHojeTotal = todayItems.length;
      result.agProximosTotal = activeUpcoming.length;
      result.pctAgendamentosHoje = activeUpcoming.length
        ? Math.round((todayItems.length / activeUpcoming.length) * 100)
        : 0;
      result.tecnicosHoje = countRealtimeBy(
        todayItems,
        (item) => item.tecnico_nome,
        "Sem técnico",
        5,
      );
      result.regionaisAgendamento = countRealtimeBy(
        activeUpcoming,
        (item) => item.regional,
        "Sem regional",
        8,
      );
    }
    return Object.keys(result).length ? result : null;
  }, [monthlyAppointments, today, upcomingAppointments]);
}

function sumMatchSection(section = []) {
  return section.reduce(
    (sum, item) =>
      sum +
      (item.cidades || []).reduce(
        (citySum, city) => citySum + Number(city.totalMatches || 0),
        0,
      ),
    0,
  );
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function getMetaPace(metaMes, month, feriadosSet = null) {
  if (!metaMes) {
    return {
      status: "neutral",
      projectionPercent: 0,
      percent: 0,
      helper: "Sem meta carregada",
    };
  }

  const percent = Number(metaMes.percentAchieved || 0);
  const projection = buildMonthProjection(
    {
      ...metaMes,
      mes: month || metaMes.mes,
    },
    feriadosSet || new Set(),
  );
  const projectionPercent =
    Number(metaMes.meta || 0) > 0 && projection
      ? (Number(projection.projecaoFinal || 0) / Number(metaMes.meta || 0)) *
        100
      : percent;
  const isLow = projectionPercent + 0.05 < 100;

  return {
    status: isLow ? "low" : "ok",
    projection,
    projectionPercent,
    percent,
    helper: `${formatNumber(metaMes.totalOS)} de ${formatNumber(
      metaMes.meta,
    )} O.S - Projecao ${projectionPercent.toFixed(1)}%`,
  };
}

function formatRealtimeUpdateDate(value) {
  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : value
        ? new Date(value)
        : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getLastDayWithData(metaMes) {
  const rows = Array.isArray(metaMes?.rawDays)
    ? metaMes.rawDays
    : Array.isArray(metaMes?.saldoDiario)
      ? metaMes.saldoDiario
      : [];

  return rows.reduce((lastDay, row, index) => {
    const dia = Number(row?.dia || index + 1);
    return Number(row?.totalDia || 0) > 0 ? dia || lastDay : lastDay;
  }, 0);
}

function getBusinessDaysRemaining(
  monthName,
  lastDayWithData,
  now = new Date(),
) {
  const monthMap = new Map([
    ["janeiro", 0],
    ["fevereiro", 1],
    ["marco", 2],
    ["marco", 2],
    ["abril", 3],
    ["maio", 4],
    ["junho", 5],
    ["julho", 6],
    ["agosto", 7],
    ["setembro", 8],
    ["outubro", 9],
    ["novembro", 10],
    ["dezembro", 11],
  ]);
  const normalized = String(monthName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const monthIndex = monthMap.get(normalized);
  if (monthIndex === undefined || monthIndex !== now.getMonth()) return 0;

  const year = now.getFullYear();
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  let count = 0;
  for (
    let day = Math.max(now.getDate(), lastDayWithData + 1);
    day <= lastDay;
    day += 1
  ) {
    const date = new Date(year, monthIndex, day);
    const weekDay = date.getDay();
    if (weekDay !== 0 && weekDay !== 6) count += 1;
  }
  return count;
}

function getRegionalPaceText(item, daysRemaining) {
  const meta = Number(item?.meta || 110);
  const total = Number(item?.total || 0);
  const faltam = Math.max(0, meta - total);
  if (faltam <= 0) return "Ritmo necessário: meta cumprida";
  const dias = daysRemaining > 0 ? daysRemaining : 1;
  return `Ritmo necessário: ${(faltam / dias).toFixed(1)} O.S/dia`;
}

function buildDailyTrend(metaMes) {
  const rows = Array.isArray(metaMes?.rawDays)
    ? metaMes.rawDays
    : Array.isArray(metaMes?.saldoDiario)
      ? metaMes.saldoDiario
      : [];

  return rows
    .map((item, index) => ({
      dia: Number(item.dia || index + 1),
      total: Number(item.totalDia ?? item.total ?? 0),
    }))
    .filter((item) => item.dia > 0 && item.total > 0)
    .slice(-14);
}

function buildPreviousDeliverySummary(metaMes, now = new Date()) {
  const rows = Array.isArray(metaMes?.saldoDiario)
    ? metaMes.saldoDiario
    : Array.isArray(metaMes?.rawDays)
      ? metaMes.rawDays
      : [];
  if (!rows.length) {
    return {
      dayLabel: "Sem dados",
      items: [
        { label: "Equipe tecnica", total: 0 },
        { label: "Agente Aut.", total: 0 },
        { label: "Entregue loja", total: 0 },
        { label: "Regionais", total: 0 },
      ],
    };
  }

  const yesterday = new Date(now);
  yesterday.setHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDay = yesterday.getDate();
  const monthMatches =
    metaMes?.mes &&
    yesterday
      .toLocaleDateString("pt-BR", { month: "long" })
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase() ===
      String(metaMes.mes)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

  const row =
    (monthMatches
      ? rows.find((item, index) => Number(item?.dia || index + 1) === yesterdayDay)
      : null) ||
    [...rows]
      .reverse()
      .find((item) => Number(item?.totalDia ?? item?.total ?? 0) > 0) ||
    rows.at(-1) ||
    {};

  const day = Number(row.dia || rows.indexOf(row) + 1 || 0);
  return {
    dayLabel: day ? `Dia ${String(day).padStart(2, "0")}` : "Ultimo dia",
    items: [
      { label: "Equipe tecnica", total: Number(row.equipe || 0) },
      { label: "Agente Aut.", total: Number(row.agente || 0) },
      { label: "Entregue loja", total: Number(row.loja || 0) },
      { label: "Regionais", total: Number(row.regionais || 0) },
    ],
  };
}

function formatDayLabel(day) {
  const value = Number(day || 0);
  if (!value) return "Sem data";
  return `Dia ${String(value).padStart(2, "0")}`;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}

function KpiTile({
  icon: Icon,
  label,
  value,
  helper,
  tone = "blue",
  className = "",
  children,
}) {
  return (
    <div
      className={`acomp-kpi acomp-kpi-${tone} ${className}`}
      data-kpi-label={label}
    >
      <div className="acomp-kpi-icon">
        <Icon size={22} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{helper}</span>
      </div>
      {children}
    </div>
  );
}

function MetaShowcaseModal({ tiles, statusOverride, onClose }) {
  const displayedTiles = tiles.map((tile) => {
    if (!statusOverride) return tile;
    return {
      ...tile,
      tone: statusOverride === "low" ? "meta-low" : "meta-ok",
      pace: { ...tile.pace, status: statusOverride },
      helper:
        statusOverride === "low"
          ? "Teste: projecao abaixo da meta"
          : "Teste: meta em dia",
    };
  });

  return (
    <div
      className="acomp-meta-showcase-overlay"
      role="dialog"
      aria-modal="true"
    >
      <section className="acomp-meta-showcase-card">
        <div className="acomp-meta-showcase-header">
          <div>
          <span>DESEMPENHO DO MÊS</span>
          <h2>RESUMO DAS METAS</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar resumo das metas"
          >
            <X size={22} />
          </button>
        </div>
        <div className="acomp-meta-showcase-grid">
          {displayedTiles.map((tile) => (
            <KpiTile
              key={tile.label}
              icon={Target}
              label={tile.label}
              value={tile.value}
              helper={tile.helper}
              tone={tile.tone}
              className="acomp-meta-showcase-tile"
            >
              <MetaStatusVisual status={tile.pace.status} />
            </KpiTile>
          ))}
        </div>
      </section>
    </div>
  );
}

function RealtimeUpdateModal({ notice }) {
  if (!notice) return null;
  return (
    <div className="acomp-realtime-overlay" role="dialog" aria-modal="true">
      <section className="acomp-realtime-card">
        <div className="acomp-realtime-icon">
          <Sparkles size={28} />
        </div>
        <span>Novas informacoes</span>
        <h2>ATUALIZADAS</h2>
        <p>
          {notice.message ||
            "O acompanhamento recebeu dados novos e ja foi atualizado."}
        </p>
        <div className="acomp-realtime-meta">
          <strong>{notice.sourceLabel || "Operacional"}</strong>
          {notice.updatedAt ? (
            <small>{formatRealtimeUpdateDate(notice.updatedAt)}</small>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function AppointmentRealtimeModal({ appointments = [] }) {
  if (!appointments.length) return null;

  const groups = appointments.reduce((acc, appointment) => {
    const key = appointment.key || "sem-data";
    if (!acc[key]) {
      acc[key] = {
        key,
        data: appointment.data,
        hora: appointment.hora,
        items: [],
      };
    }
    acc[key].items.push(appointment);
    return acc;
  }, {});

  const grouped = Object.values(groups);
  const total = appointments.length;

  return (
    <div className="acomp-appointment-overlay" role="dialog" aria-modal="true">
      <section className="acomp-appointment-card">
        <div className="acomp-appointment-head">
          <span className="acomp-appointment-icon">
            <CalendarCheck size={34} />
          </span>
          <div>
            <span>Novo agendamento</span>
            <h2>{total > 1 ? `${total} AGENDAMENTOS` : "AGENDAMENTO"}</h2>
          </div>
        </div>

        <div className="acomp-appointment-groups">
          {grouped.map((group) => (
            <div className="acomp-appointment-group" key={group.key}>
              <div className="acomp-appointment-time">
                <strong>{formatLongDate(group.data)}</strong>
                <span>{group.hora || "Sem horário"}</span>
              </div>
              <div className="acomp-appointment-list">
                {group.items.map((appointment) => (
                  <article className="acomp-appointment-item" key={appointment.id}>
                    <strong>{appointment.cliente}</strong>
                    <span>
                      {appointment.codigo ? `Código/O.S: ${appointment.codigo} · ` : ""}
                      {appointment.cidade || "Cidade não informada"}
                    </span>
                    <small>Agendado por {appointment.agendadoPor}</small>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function getMetaSourceData(monthData, source) {
  if (!monthData) return null;
  if (source === "onnet") return monthData.onnet || null;
  if (source === "consolidado") return monthData.onnetSempre || monthData;
  return monthData;
}

function buildMetaTileData(metaMes, label, month, feriadosSet) {
  const pace = getMetaPace(metaMes, month, feriadosSet);
  const total = formatNumber(metaMes?.totalOS || 0);
  const meta = formatNumber(metaMes?.meta || 0);
  const projection = pace.projection || null;
  const saldoRows = Array.isArray(metaMes?.saldoDiario)
    ? metaMes.saldoDiario
    : [];
  const lastSaldoRow =
    [...saldoRows]
      .reverse()
      .find((row) => Number(row?.totalDia || 0) > 0) ||
    saldoRows.at(-1) ||
    null;
  const monthlyBalance = Number(lastSaldoRow?.saldoMes || 0);
  const hasMonthlyBalance = metaMes && lastSaldoRow;
  const balanceStatus =
    hasMonthlyBalance && monthlyBalance >= 0 ? "ok" : "low";
  const dailySchedule = metaMes
    ? buildMetaDiariaSchedule({
        month: month || metaMes.mes,
        meta: metaMes.meta,
        feriadosSet,
        year: Number(metaMes.ano || metaMes.year) || new Date().getFullYear(),
      })
    : null;
  const dailyGoal = Number(dailySchedule?.metaDiariaMedia || 0);
  const currentPace = Number(projection?.ritmoAtual || 0);
  const hasDailyGoal = dailyGoal > 0;
  const dailyGoalText = hasDailyGoal
    ? Math.ceil(dailyGoal).toLocaleString("pt-BR")
    : "0";
  const balanceText = monthlyBalance.toLocaleString("pt-BR", {
    maximumFractionDigits: 0,
    signDisplay: "always",
  });

  return {
    label,
    metaMes,
    pace: {
      ...pace,
      status: hasMonthlyBalance ? balanceStatus : pace.status,
      dailyGoal,
      currentPace,
      monthlyBalance,
    },
    value: metaMes
      ? `${Number(metaMes.percentAchieved || 0).toFixed(1)}%`
      : "--",
    helper: metaMes
      ? `${total}/${meta} O.S - Saldo ${balanceText} - Meta dia ${dailyGoalText} - Proj. ${pace.projectionPercent.toFixed(1)}%`
      : "Sem meta carregada",
    tone:
      hasMonthlyBalance && balanceStatus === "low"
        ? "meta-low"
        : hasMonthlyBalance && balanceStatus === "ok"
          ? "meta-ok"
          : "purple",
  };
}

function buildRecentDeliveries(allData, currentMonth, limit = 3) {
  const currentIndex = MONTH_ORDER.indexOf(currentMonth);
  const monthNames =
    currentIndex > 0
      ? MONTH_ORDER.slice(0, currentIndex).reverse()
      : MONTH_ORDER.slice().reverse();

  return monthNames
    .map((month) => {
      const metaMes = getMetaSourceData(allData?.[month], "consolidado");
      if (!metaMes) return null;

      const total = Number(metaMes.totalOS || 0);
      const meta = Number(metaMes.meta || 0);
      const percent =
        meta > 0
          ? Number(metaMes.percentAchieved || (total / meta) * 100)
          : Number(metaMes.percentAchieved || 0);

      return {
        month,
        total,
        meta,
        percent,
        hit: meta > 0 && (total >= meta || percent >= 100),
      };
    })
    .filter(Boolean)
    .slice(0, limit);
}

function MetaStatusVisual({ status }) {
  if (status === "low") {
    return (
      <div className="acomp-meta-alert" aria-hidden="true">
        <Siren size={22} />
        <span />
      </div>
    );
  }

  if (status === "ok") {
    return (
      <img
        className="acomp-meta-retorninho"
        src="/retorninho-loader.png"
        alt=""
        aria-hidden="true"
      />
    );
  }

  return null;
}

function RankingList({
  title,
  icon: Icon,
  items,
  suffix = "",
  empty = "Sem dados",
  className = "",
  limit = 5,
  renderSubline = null,
  children = null,
}) {
  const max = Math.max(1, items[0]?.total || 0);

  return (
    <section className={`acomp-panel acomp-ranking ${className}`}>
      <div className="acomp-panel-title">
        <Icon size={19} />
        <h2>{title}</h2>
      </div>
      <div className="acomp-ranking-list">
        {items.length ? (
          items.slice(0, limit).map((item, index) => (
            <div className="acomp-rank-row" key={`${title}-${item.label}`}>
              <span className={`acomp-rank-pos pos-${index + 1}`}>
                {index + 1}
              </span>
              <div className="acomp-rank-main">
                <div className="acomp-rank-label">
                  <span>{item.label}</span>
                  <strong>
                    {formatNumber(item.total)}
                    {suffix}
                  </strong>
                </div>
                <div className="acomp-bar-track">
                  <div style={{ width: `${(item.total / max) * 100}%` }} />
                </div>
                {renderSubline ? (
                  <div className="acomp-rank-subline">
                    {renderSubline(item)}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className="acomp-empty">{empty}</div>
        )}
      </div>
      {children}
    </section>
  );
}

function InsightTicker({ insights }) {
  return (
    <div className="acomp-ticker">
      <div className="acomp-ticker-label">
        <Sparkles size={16} />
        Avisos
      </div>
      <div className="acomp-ticker-window">
        <div className="acomp-ticker-track">
          {[...insights, ...insights].map((item, index) => (
            <span key={`${item}-${index}`}>{item}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConfigPanel({
  config,
  onChange,
  onClose,
  onTestAd,
  onTestMeta,
  onTestFestive,
  onTestGrinch,
  onUploadImages,
  onRemoveImage,
}) {
  const [imageError, setImageError] = useState("");
  const [uploading, setUploading] = useState(false);

  const toggleSection = (key) => {
    onChange((current) => ({
      ...current,
      sections: {
        ...current.sections,
        [key]: !current.sections[key],
      },
    }));
  };

  const updateAds = (patch) => {
    onChange((current) => ({
      ...current,
      ads: {
        ...DEFAULT_CONFIG.ads,
        ...(current.ads || {}),
        ...patch,
      },
    }));
  };

  const updateMetaShowcase = (patch) => {
    onChange((current) => ({
      ...current,
      metaShowcase: {
        ...DEFAULT_CONFIG.metaShowcase,
        ...(current.metaShowcase || {}),
        ...patch,
      },
    }));
  };

  const updateAppointmentNotice = (patch) => {
    onChange((current) => ({
      ...current,
      appointmentNotice: {
        ...DEFAULT_CONFIG.appointmentNotice,
        ...(current.appointmentNotice || {}),
        ...patch,
      },
    }));
  };

  const updateFestive = (patch) => {
    onChange((current) => ({
      ...current,
      festive: {
        ...DEFAULT_CONFIG.festive,
        ...(current.festive || {}),
        ...patch,
      },
    }));
  };

  const addImages = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    setImageError("");

    setUploading(true);
    Promise.all(files.map(fileToFullHdAdImage))
      .then(onUploadImages)
      .then((images) => {
        onChange((current) => {
          const existing = Array.isArray(current.ads?.images)
            ? current.ads.images
            : [];
          return {
            ...current,
            ads: {
              ...DEFAULT_CONFIG.ads,
              ...(current.ads || {}),
              images: [...existing, ...images],
            },
          };
        });
      })
      .catch((error) =>
        setImageError(error.message || "Erro ao salvar imagem localmente."),
      )
      .finally(() => setUploading(false));
  };

  const removeImage = (targetIndex) => {
    const removed = config.ads?.images?.[targetIndex];
    onChange((current) => ({
      ...current,
      ads: {
        ...DEFAULT_CONFIG.ads,
        ...(current.ads || {}),
        images: (current.ads?.images || []).filter(
          (_, index) => index !== targetIndex,
        ),
      },
    }));
    onRemoveImage(removed).catch(() =>
      setImageError("A imagem saiu do painel, mas nao foi removida da nuvem."),
    );
  };

  const adsImages = Array.isArray(config.ads?.images) ? config.ads.images : [];
  const adsEnabled = Boolean(config.ads?.enabled);

  return (
    <div className="acomp-config-overlay">
      <section className="acomp-config-card">
        <div className="acomp-config-header">
          <div>
            <span>Central do painel</span>
            <h2>Configurar acompanhamento</h2>
          </div>
          <button type="button" onClick={onClose} className="acomp-icon-btn">
            <X size={18} />
          </button>
        </div>

        <div className="acomp-config-grid">
          {SECTION_LABELS.map(([key, label]) => (
            <button
              type="button"
              key={key}
              onClick={() => toggleSection(key)}
              className={`acomp-config-toggle ${config.sections[key] ? "is-on" : ""}`}
            >
              <Eye size={16} />
              <span>{label}</span>
              <strong>{config.sections[key] ? "ON" : "OFF"}</strong>
            </button>
          ))}
        </div>

        <label className="acomp-config-label">
          Avisos personalizados
          <textarea
            value={config.customInsights}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                customInsights: event.target.value,
              }))
            }
            placeholder="Digite um aviso por linha para aparecer na TV"
            rows={5}
          />
        </label>

        <section className="acomp-config-ads acomp-config-appointment-notice">
          <div className="acomp-config-ads-header">
            <div>
              <span>Tempo real</span>
              <h3>Avisos de agendamento</h3>
            </div>
          </div>

          <div className="acomp-config-time-grid">
            <label>
              Tempo na tela em segundos
              <input
                type="number"
                min="5"
                max="120"
                value={editableNumber(config.appointmentNotice?.durationSeconds, 20)}
                onChange={(event) =>
                  updateAppointmentNotice({
                    durationSeconds: event.target.value,
                  })
                }
                onBlur={(event) =>
                  updateAppointmentNotice({
                    durationSeconds: clampNumber(event.target.value, 5, 120, 20),
                  })
                }
              />
            </label>
            <div className="acomp-config-help-card">
              O aviso aparece quando um novo agendamento é criado e agrupa clientes do mesmo horário.
            </div>
          </div>
        </section>

        <section className="acomp-config-ads acomp-config-meta-showcase">
          <div className="acomp-config-ads-header">
            <div>
              <span>Destaque automatico</span>
              <h3>Modal das metas</h3>
            </div>
            <button
              type="button"
              onClick={() =>
                updateMetaShowcase({ enabled: !config.metaShowcase?.enabled })
              }
              className={`acomp-config-toggle acomp-config-ad-switch ${config.metaShowcase?.enabled ? "is-on" : ""}`}
            >
              <Eye size={16} />
              <span>
                {config.metaShowcase?.enabled
                  ? "Exibicao ligada"
                  : "Exibicao desligada"}
              </span>
              <strong>{config.metaShowcase?.enabled ? "ON" : "OFF"}</strong>
            </button>
          </div>

          <div className="acomp-config-time-grid">
            <label>
              Intervalo em minutos
              <input
                type="number"
                min="1"
                max="60"
                value={editableNumber(config.metaShowcase?.intervalMinutes, 1)}
                onChange={(event) =>
                  updateMetaShowcase({
                    intervalMinutes: event.target.value,
                  })
                }
                onBlur={(event) =>
                  updateMetaShowcase({
                    intervalMinutes: clampNumber(event.target.value, 1, 60, 1),
                  })
                }
              />
            </label>
            <label>
              Tempo na tela em segundos
              <input
                type="number"
                min="5"
                max="120"
                value={editableNumber(config.metaShowcase?.durationSeconds, 12)}
                onChange={(event) =>
                  updateMetaShowcase({
                    durationSeconds: event.target.value,
                  })
                }
                onBlur={(event) =>
                  updateMetaShowcase({
                    durationSeconds: clampNumber(event.target.value, 5, 120, 12),
                  })
                }
              />
            </label>
          </div>

          <div className="acomp-meta-test-row">
            <button
              type="button"
              className="is-alert"
              onClick={() => onTestMeta("low")}
            >
              <Siren size={17} />
              Testar sirene vermelha
            </button>
            <button
              type="button"
              className="is-ok"
              onClick={() => onTestMeta("ok")}
            >
              <Target size={17} />
              Testar meta em dia
            </button>
          </div>
        </section>

        <section className="acomp-config-ads">
          <div className="acomp-config-ads-header">
            <div>
              <span>Anuncios da TV</span>
              <h3>Imagens em tela cheia</h3>
            </div>
            <button
              type="button"
              onClick={() => updateAds({ enabled: !adsEnabled })}
              className={`acomp-config-toggle acomp-config-ad-switch ${adsEnabled ? "is-on" : ""}`}
            >
              <Eye size={16} />
              <span>
                {adsEnabled ? "Anuncios ligados" : "Anuncios desligados"}
              </span>
              <strong>{adsEnabled ? "ON" : "OFF"}</strong>
            </button>
          </div>

          <div className="acomp-config-time-grid">
            <label>
              Intervalo em minutos
              <input
                type="number"
                min="1"
                max="60"
                value={editableNumber(config.ads?.intervalMinutes, 3)}
                onChange={(event) =>
                  updateAds({
                    intervalMinutes: event.target.value,
                  })
                }
                onBlur={(event) =>
                  updateAds({
                    intervalMinutes: clampNumber(event.target.value, 1, 60, 3),
                  })
                }
              />
            </label>
            <label>
              Tempo na tela em segundos
              <input
                type="number"
                min="5"
                max="120"
                value={editableNumber(config.ads?.durationSeconds, 15)}
                onChange={(event) =>
                  updateAds({
                    durationSeconds: event.target.value,
                  })
                }
                onBlur={(event) =>
                  updateAds({
                    durationSeconds: clampNumber(event.target.value, 5, 120, 15),
                  })
                }
              />
            </label>
          </div>

          <div className="acomp-ad-upload-row">
            <label className="acomp-ad-upload">
              <ImageIcon size={18} />
              <span>{uploading ? "Enviando..." : "Adicionar imagem"}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={uploading}
                onChange={addImages}
              />
            </label>
            <button
              type="button"
              className="acomp-ad-test-btn"
              disabled={!adsImages.length}
              onClick={() => {
                if (onTestAd()) onClose();
              }}
            >
              <Eye size={16} />
              Testar imagem
            </button>
            <small>
              {adsImages.length} imagem(ns) salvas localmente - recomendado 1920x1080
            </small>
          </div>

          {imageError ? (
            <div className="acomp-config-error">{imageError}</div>
          ) : null}

          <div className="acomp-ad-images">
            {adsImages.map((image, index) => (
              <div className="acomp-ad-thumb" key={image.id || image.src}>
                <img src={image.src} alt={`Anuncio ${index + 1}`} />
                <span>{image.name || `Imagem ${index + 1}`}</span>
                <button type="button" onClick={() => removeImage(index)}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="acomp-config-ads acomp-config-festive">
          <div className="acomp-config-ads-header">
            <div>
              <span>Datas festivas</span>
              <h3>Efeitos comemorativos</h3>
            </div>
            <button
              type="button"
              onClick={() =>
                updateFestive({ enabled: !config.festive?.enabled })
              }
              className={`acomp-config-toggle acomp-config-ad-switch ${config.festive?.enabled ? "is-on" : ""}`}
            >
              <Sparkles size={16} />
              <span>
                {config.festive?.enabled
                  ? "Efeitos ligados"
                  : "Efeitos desligados"}
              </span>
              <strong>{config.festive?.enabled ? "ON" : "OFF"}</strong>
            </button>
          </div>

          <div className="acomp-config-time-grid acomp-config-festive-grid">
            <label>
              Tema
              <select
                value={config.festive?.theme || "christmas"}
                onChange={(event) =>
                  updateFestive({ theme: event.target.value })
                }
              >
                <option value="christmas">Natal</option>
                <option value="easter">Pascoa</option>
              </select>
            </label>
            <label>
              Intervalo do Papai Noel em segundos
              <input
                type="number"
                min="10"
                max="900"
                value={editableNumber(config.festive?.intervalSeconds, 120)}
                onChange={(event) =>
                  updateFestive({
                    intervalSeconds: event.target.value,
                  })
                }
                onBlur={(event) =>
                  updateFestive({
                    intervalSeconds: clampNumber(event.target.value, 10, 900, 120),
                  })
                }
              />
            </label>
            <label>
              Intervalo do Grinch em segundos
              <input
                type="number"
                min="10"
                max="900"
                value={editableNumber(config.festive?.grinchIntervalSeconds, 90)}
                onChange={(event) =>
                  updateFestive({
                    grinchIntervalSeconds: event.target.value,
                  })
                }
                onBlur={(event) =>
                  updateFestive({
                    grinchIntervalSeconds: clampNumber(event.target.value, 10, 900, 90),
                  })
                }
              />
            </label>
            <label>
              Tempo do Grinch na tela
              <input
                type="number"
                min="3"
                max="120"
                value={config.festive?.grinchDurationSeconds ?? 8}
                onChange={(event) =>
                  updateFestive({
                    grinchDurationSeconds: clampNumber(
                      event.target.value,
                      3,
                      120,
                      8,
                    ),
                  })
                }
              />
            </label>
          </div>

          <div className="acomp-meta-test-row">
            <button
              type="button"
              className="is-festive"
              onClick={() => {
                onTestFestive();
                onClose();
              }}
            >
              <Sparkles size={17} />
              Testar Papai Noel
            </button>
            <button
              type="button"
              className="is-festive"
              onClick={() => {
                onTestGrinch();
                onClose();
              }}
            >
              <Eye size={17} />
              Testar Grinch
            </button>
          </div>
        </section>

        <div className="acomp-config-actions">
          <button type="button" onClick={onClose} className="acomp-save-btn">
            <Save size={16} />
            Salvar e fechar
          </button>
        </div>
      </section>
    </div>
  );
}

function Spotlight({ scene, data, festiveTheme = null }) {
  const isChristmas = festiveTheme === "christmas";
  const content = {
    atendentes: {
      eyebrow: isChristmas
        ? "Ajudantes do Papai Noel"
        : "Ranking de agendamentos",
      title: data.topAtendente
        ? isChristmas
          ? `${data.topAtendente.label} lidera`
          : `${data.topAtendente.label} lidera agora`
        : isChristmas
          ? "Aguardando ajudantes"
          : "Aguardando agendamentos",
      value: data.topAtendente ? formatNumber(data.topAtendente.total) : "0",
      helper: isChristmas
        ? "agendamento(s) monitorados"
        : "agendamento(s) no período monitorado",
      image: isChristmas
        ? "/retorninho-xmas-list.png"
        : "/retorninho-prancheta.png",
      tone: "orange",
    },
    cidades: {
      eyebrow: isChristmas ? "Mapa da oficina natalina" : "Mapa operacional",
      title: data.topCidadeOS
        ? isChristmas
          ? `${data.topCidadeOS.label} em foco`
          : `${data.topCidadeOS.label} pede atenção`
        : isChristmas
          ? "Oficina tranquila"
          : "Sem cidades no topo",
      value: data.topCidadeOS ? formatNumber(data.topCidadeOS.total) : "0",
      helper: isChristmas ? "O.S abertas" : "O.S abertas na cidade",
      image: isChristmas
        ? "/retorninho-xmas-tree.png"
        : "/retorninho-estela.webp",
      tone: "blue",
    },
    match: {
      eyebrow: isChristmas ? "Presentes de rota" : "Oportunidade de rota",
      title:
        data.totalMatches > 0
          ? isChristmas
            ? "Rotas com presentes"
            : "Matches prontos para aproveitar"
          : isChristmas
            ? "Sem presentes na rota"
            : "Sem match no momento",
      value: formatNumber(data.totalMatches),
      helper: isChristmas
        ? "serviços próximos"
        : "serviços próximos de retiradas",
      image: isChristmas
        ? "/retorninho-xmas-sleigh.png"
        : "/retorninho-loader.png",
      tone: "green",
    },
  }[scene];

  return (
    <section className={`acomp-spotlight acomp-spotlight-${content.tone}`}>
      {isChristmas ? (
        <>
          <span className="acomp-xmas-ribbon" aria-hidden="true" />
          <span className="acomp-xmas-snowbank" aria-hidden="true" />
        </>
      ) : null}
      <div className="acomp-spotlight-copy">
        <span>{content.eyebrow}</span>
        <h1>{content.title}</h1>
        <div className="acomp-spotlight-number">{content.value}</div>
        <p>{content.helper}</p>
      </div>
      <img src={content.image} alt="Retorninho acompanhando indicadores" />
    </section>
  );
}

function StatusPill({ status, total }) {
  return (
    <div className="acomp-status-pill">
      <span>{status}</span>
      <strong>{formatNumber(total)}</strong>
    </div>
  );
}

function RecentDeliveriesCard({ items }) {
  return (
    <section className="acomp-panel acomp-recent-deliveries-panel">
      <div className="acomp-recent-deliveries-head">
        <div>
          <h3>ÚLTIMAS ENTREGAS</h3>
        </div>
        <TrendingUp size={18} />
      </div>
      <div className="acomp-recent-deliveries-list">
        {items.length ? (
          items.map((item) => (
            <div
              className={`acomp-recent-delivery ${item.hit ? "is-hit" : "is-missed"}`}
              key={item.month}
            >
              <div>
                <strong>{item.month}</strong>
                <span>{item.hit ? "Meta batida" : "Abaixo da meta"}</span>
              </div>
              <div className="acomp-recent-delivery-value">
                <strong>{formatNumber(item.total)}</strong>
                <span>
                  {item.meta > 0 ? `${item.percent.toFixed(1)}%` : "Sem meta"}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="acomp-recent-deliveries-empty">
            Aguardando meses anteriores
          </div>
        )}
      </div>
    </section>
  );
}

function DeliveryTrendChart({ items }) {
  const chartItems = items.length ? items : [{ dia: 0, total: 0 }];
  const lastItem = items[items.length - 1] || null;
  const cumulative = [];
  chartItems.reduce((sum, item) => {
    const next = sum + Number(item.total || 0);
    cumulative.push(next);
    return next;
  }, 0);

  const total = cumulative[cumulative.length - 1] || 0;
  const maxDay = Math.max(1, ...chartItems.map((item) => item.total));
  const maxCumulative = Math.max(1, total);
  const width = 320;
  const height = 112;
  const paddingX = 14;
  const baseY = 94;
  const plotWidth = width - paddingX * 2;
  const step =
    chartItems.length > 1 ? plotWidth / (chartItems.length - 1) : plotWidth;
  const barWidth = Math.max(7, Math.min(18, plotWidth / chartItems.length - 5));
  const points = chartItems
    .map((item, index) => {
      const x = paddingX + index * step;
      const y = baseY - (cumulative[index] / maxCumulative) * 76;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <section className="acomp-panel acomp-delivery-panel">
      <div className="acomp-panel-title">
        <TrendingUp size={19} />
        <h2>ENTREGAS POR DIA</h2>
      </div>
      {items.length ? (
        <>
          <div className="acomp-delivery-head">
            <div>
              <strong>{formatNumber(lastItem?.total || 0)}</strong>
              <small>{formatDayLabel(lastItem?.dia)}</small>
            </div>
            <span>
              Ultimos
              <small>{items.length} dias</small>
            </span>
          </div>
          <svg
            className="acomp-delivery-chart"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Gráfico de entregas por dia"
          >
            <line x1="10" y1={baseY} x2="310" y2={baseY} />
            {chartItems.map((item, index) => {
              const x = paddingX + index * step;
              const barHeight = Math.max(5, (item.total / maxDay) * 58);
              return (
                <rect
                  key={`bar-${item.dia}`}
                  x={x - barWidth / 2}
                  y={baseY - barHeight}
                  width={barWidth}
                  height={barHeight}
                  rx="4"
                />
              );
            })}
            <polyline points={points} />
            {points ? (
              <circle
                cx={paddingX + (chartItems.length - 1) * step}
                cy={baseY - (total / maxCumulative) * 76}
                r="4.5"
              />
            ) : null}
          </svg>
          <div className="acomp-delivery-days">
            <span>Dia {items[0].dia}</span>
            <span>Dia {items[items.length - 1].dia}</span>
          </div>
        </>
      ) : (
        <div className="acomp-empty">Sem entregas diarias</div>
      )}
    </section>
  );
}

function AgendaPanel({ eventos }) {
  return (
    <section className="acomp-panel acomp-agenda-panel">
      <div className="acomp-panel-title">
        <CalendarCheck size={19} />
        <h2>AGENDA DO DASHBOARD</h2>
      </div>
      <div className="acomp-agenda-list">
        {eventos.length ? (
          eventos.slice(0, 2).map((evento) => (
            <div
              className="acomp-agenda-item"
              key={evento.id || `${evento.atividade}-${evento.data_inicio}`}
            >
              <div>
                <strong>{evento.atividade || "Agenda sem titulo"}</strong>
              </div>
              <small>{formatShortDate(evento.data_inicio)}</small>
            </div>
          ))
        ) : (
          <div className="acomp-empty">Sem agenda proxima</div>
        )}
      </div>
    </section>
  );
}

function DailyDeliveryPanel({ data }) {
  const today = data.monthEntries.find(
    (day) => day.date === data.referenceDateKey,
  ) || {
    date: data.referenceDateKey,
    horarios: {},
  };
  const dailyTotal = DIARIO_HORARIOS.reduce(
    (sum, horario) => sum + Number(today.horarios?.[horario] || 0),
    0,
  );

  return (
    <section className="acomp-panel acomp-delivery-hours-panel">
      <div className="acomp-panel-title">
        <Clock3 size={19} />
        <h2>ENTREGAS POR HORÁRIO</h2>
      </div>
      <div className="acomp-delivery-hours-date">
        {today.date
          ? formatDiarioDateLabel(today.date, { weekday: true, month: true })
          : "Dia atual"}
      </div>
      <div className="acomp-delivery-hours-grid">
        {DIARIO_HORARIOS.map((horario) => (
          <div className="acomp-delivery-hour" key={horario}>
            <span>{horario}</span>
            <strong>{formatNumber(today.horarios?.[horario] || 0)}</strong>
          </div>
        ))}
      </div>
      <div className="acomp-delivery-hours-total">
        <span>Total dos horários</span>
        <strong>{formatNumber(dailyTotal)}</strong>
      </div>
    </section>
  );
}

function WeeklyProductionPanel({ data }) {
  const currentStatus = data.currentWeek.status;
  return (
    <section className="acomp-panel acomp-weekly-production-panel">
      <div className="acomp-panel-title">
        <TrendingUp size={18} />
        <h2>PRODUÇÃO SEMANAL</h2>
      </div>
      <div className={`acomp-weekly-production-main is-${currentStatus.tone}`}>
        <strong>{formatNumber(data.currentWeek.delivered)}</strong>
        <span>{currentStatus.label}</span>
      </div>
      <div className="acomp-weekly-production-scale">
        <p className="is-good">
          <b>Em dia!</b>
          <span>+600</span>
        </p>
        <p className="is-warn">
          <b>Em melhora</b>
          <span>400-600</span>
        </p>
        <p className="is-bad">
          <b>Em alerta</b>
          <span>-400</span>
        </p>
      </div>
    </section>
  );
}

function FinesPanel({ data }) {
  const currentWeekFines = Number(data.currentWeek?.fines || 0);
  return (
    <section className="acomp-panel acomp-fines-panel">
      <div className="acomp-panel-title">
        <Siren size={18} />
        <h2>MULTAS LANÇADAS</h2>
      </div>
      <div className="acomp-fines-content">
        <strong>{formatNumber(currentWeekFines)}</strong>
        <span>na semana atual</span>
        <small>{formatNumber(data.totals.monthFines)} no mês</small>
      </div>
    </section>
  );
}

function AdOverlay({ image }) {
  if (!image?.src) return null;
  return (
    <div className="acomp-ad-overlay">
      <img src={image.src} alt={image.name || "Anuncio"} />
    </div>
  );
}

function FestiveOverlay({ config, flightKey, grinchPeek }) {
  const festive = {
    ...DEFAULT_CONFIG.festive,
    ...(config || {}),
  };
  const theme = festive.theme === "easter" ? "easter" : "christmas";
  const particles = Array.from(
    { length: theme === "christmas" ? 42 : 28 },
    (_, index) => ({
      id: index,
      left: `${(index * 37) % 100}%`,
      delay: `${-((index * 0.73) % 9).toFixed(2)}s`,
      duration: `${theme === "christmas" ? 8 + (index % 7) : 10 + (index % 6)}s`,
      size: `${theme === "christmas" ? 5 + (index % 6) : 14 + (index % 5)}px`,
      drift: `${((index % 9) - 4) * 10}px`,
    }),
  );

  if (!festive.enabled) return null;

  return (
    <div className={`acomp-festive-overlay is-${theme}`} aria-hidden="true">
      <div className="acomp-festive-particles">
        {particles.map((item) => (
          <span
            key={`${theme}-${item.id}`}
            style={{
              "--particle-left": item.left,
              "--particle-delay": item.delay,
              "--particle-duration": item.duration,
              "--particle-size": item.size,
              "--particle-drift": item.drift,
            }}
          />
        ))}
      </div>
      {flightKey ? (
        theme === "christmas" ? (
          <img
            key={`sleigh-${flightKey}`}
            className="acomp-sleigh-flight"
            src="/retorninho-xmas-sleigh.png"
            alt=""
          />
        ) : (
          <div key={`egg-${flightKey}`} className="acomp-egg-flight" />
        )
      ) : null}
      {theme === "christmas" && grinchPeek ? (
        <img
          key={`grinch-${grinchPeek.key}`}
          className={`acomp-grinch-peeker is-${grinchPeek.side}`}
          src="/retorninho-grinch.png"
          alt=""
          style={{ "--grinch-duration": `${grinchPeek.durationSeconds}s` }}
        />
      ) : null}
    </div>
  );
}

export default function AcompanhamentoPage() {
  const now = useClock();
  const currentMonth = obterMesAtual() || "Janeiro";
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState("");
  const { eventos, loading: loadingAgenda, carregar: carregarAgenda } = useAgenda({ preferStatic: false });
  const { data: publicData, loading: loadingPublicData } = useDashboardData({
    refreshIntervalMs: 5000,
    refreshKey: dashboardRefreshKey,
  });
  const { data: matchPublicoData, loading: loadingMatchPublico } =
    useMatchPublico();
  const retiradas = useRetiradas(true, { refreshKey: dashboardRefreshKey });
  const { boardData: diarioBoardData, loading: loadingDiario } =
    useDiarioEntries(localDateKey(now));
  const [sceneIndex, setSceneIndex] = useState(0);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());
  const [configOpen, setConfigOpen] = useState(false);
  const [panelConfig, setPanelConfig] = useState(loadPanelConfig);
  const [cloudConfigReady, setCloudConfigReady] = useState(false);
  const [activeAdIndex, setActiveAdIndex] = useState(null);
  const [metaShowcase, setMetaShowcase] = useState(null);
  const [realtimeNotice, setRealtimeNotice] = useState(null);
  const [appointmentNoticeItems, setAppointmentNoticeItems] = useState([]);
  const [festiveFlightKey, setFestiveFlightKey] = useState(0);
  const [grinchPeek, setGrinchPeek] = useState(null);
  const [cursorIdle, setCursorIdle] = useState(false);
  const nextAdRef = useRef(0);
  const nextGrinchSideRef = useRef(0);
  const adHideTimerRef = useRef(null);
  const metaHideTimerRef = useRef(null);
  const realtimeNoticeTimerRef = useRef(null);
  const appointmentNoticeTimerRef = useRef(null);
  const appointmentNoticeIdsRef = useRef(new Set());
  const knownAppointmentIdsRef = useRef(new Set());
  const appointmentsSnapshotReadyRef = useRef(false);
  const grinchHideTimerRef = useRef(null);
  const cursorIdleTimerRef = useRef(null);
  const realtimeUpdateKeyRef = useRef("");
  const hasRealtimeUpdateSnapshotRef = useRef(false);
  const carregarAgendaRef = useRef(null);
  const markLiveRefresh = useCallback(() => {
    setLastRefresh(new Date());
  }, []);
  const forceDashboardRefresh = useCallback((versionToken) => {
    const token = versionToken || new Date().toISOString();
    invalidateCache("metas");
    invalidateCache("metas-auditoria");
    invalidateInternalStaticDataCache(token);
    invalidateDashboardDataCache(token);
    setDashboardRefreshKey(token);
    setLastRefresh(new Date());
  }, []);
  const showAppointmentNotice = useCallback((event) => {
    const appointment = normalizeAppointmentNotice(event);
    if (!appointment?.id) return;
    if (appointmentNoticeIdsRef.current.has(appointment.id)) return;

    appointmentNoticeIdsRef.current.add(appointment.id);
    setAppointmentNoticeItems((current) => {
      const next = [...current.filter((item) => item.id !== appointment.id), appointment];
      return next.slice(-8);
    });

    if (appointmentNoticeTimerRef.current) {
      window.clearTimeout(appointmentNoticeTimerRef.current);
    }
    const durationMs =
      clampNumber(panelConfig.appointmentNotice?.durationSeconds, 5, 120, 20) *
      1000;
    appointmentNoticeTimerRef.current = window.setTimeout(() => {
      setAppointmentNoticeItems([]);
      appointmentNoticeTimerRef.current = null;
      if (appointmentNoticeIdsRef.current.size > 80) {
        appointmentNoticeIdsRef.current = new Set(
          [...appointmentNoticeIdsRef.current].slice(-40),
        );
      }
    }, durationMs);
  }, [panelConfig.appointmentNotice?.durationSeconds]);

  useEffect(() => {
    let active = true;

    const loadNewAppointments = async () => {
      const items = await listAllVpsDocuments(COLLECTIONS.AGENDAMENTOS, {
        pageSize: 1000,
      });
      if (!active) return;

      const currentIds = new Set(
        items.map((item) => String(item.id || item.documentId || "")).filter(Boolean),
      );

      if (!appointmentsSnapshotReadyRef.current) {
        knownAppointmentIdsRef.current = currentIds;
        appointmentsSnapshotReadyRef.current = true;
        return;
      }

      const now = Date.now();
      items
        .filter((item) => {
          const id = String(item.id || item.documentId || "");
          if (!id || knownAppointmentIdsRef.current.has(id)) return false;
          const createdAt = item.criado_em || item.createdAt || item.created_at || item.atualizado_em;
          const createdTime = createdAt ? new Date(createdAt).getTime() : now;
          return !Number.isFinite(createdTime) || now - createdTime <= 5 * 60 * 1000;
        })
        .forEach((item) => showAppointmentNotice(buildAppointmentRealtimeEvent(item)));

      knownAppointmentIdsRef.current = currentIds;
    };

    loadNewAppointments().catch(console.error);
    const timer = window.setInterval(() => {
      loadNewAppointments().catch(console.error);
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [showAppointmentNotice]);

  const realtimeAcompanhamento = useRealtimeAcompanhamento(
    now,
    markLiveRefresh,
  );

  useEffect(() => {
    carregarAgendaRef.current = carregarAgenda;
  }, [carregarAgenda]);

  useEffect(() => {
    let active = true;
    loadAcompanhamentoConfig()
      .then((stored) => {
        if (!active || !stored) return;
        setPanelConfig((current) => ({
          ...DEFAULT_CONFIG,
          ...current,
          ...stored,
          sections: { ...DEFAULT_CONFIG.sections, ...(stored.sections || {}) },
          ads: {
            ...DEFAULT_CONFIG.ads,
            ...(stored.ads || {}),
            images: stored.ads?.images || [],
          },
          metaShowcase: {
            ...DEFAULT_CONFIG.metaShowcase,
            ...(stored.metaShowcase || {}),
          },
          appointmentNotice: {
            ...DEFAULT_CONFIG.appointmentNotice,
            ...(stored.appointmentNotice || {}),
          },
          festive: {
            ...DEFAULT_CONFIG.festive,
            ...(stored.festive || {}),
          },
        }));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setCloudConfigReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        CONFIG_STORAGE_KEY,
        JSON.stringify(panelConfig),
      );
    } catch {
      // Imagens muito grandes podem exceder o limite local do navegador.
    }
  }, [panelConfig]);

  useEffect(() => {
    if (!cloudConfigReady) return;
    const timer = window.setTimeout(() => {
      saveAcompanhamentoConfig(panelConfig).catch(() => {});
    }, 500);
    return () => window.clearTimeout(timer);
  }, [cloudConfigReady, panelConfig]);

  useEffect(() => {
    const sceneTimer = window.setInterval(
      () => setSceneIndex((current) => (current + 1) % 3),
      SCENE_INTERVAL_MS,
    );
    return () => window.clearInterval(sceneTimer);
  }, []);

  useEffect(() => {
    const resetCursorIdleTimer = () => {
      setCursorIdle(false);
      if (cursorIdleTimerRef.current) {
        window.clearTimeout(cursorIdleTimerRef.current);
      }
      cursorIdleTimerRef.current = window.setTimeout(() => {
        setCursorIdle(true);
        cursorIdleTimerRef.current = null;
      }, CURSOR_IDLE_TIMEOUT_MS);
    };

    resetCursorIdleTimer();
    window.addEventListener("mousemove", resetCursorIdleTimer);
    window.addEventListener("mousedown", resetCursorIdleTimer);

    return () => {
      window.removeEventListener("mousemove", resetCursorIdleTimer);
      window.removeEventListener("mousedown", resetCursorIdleTimer);
      if (cursorIdleTimerRef.current) {
        window.clearTimeout(cursorIdleTimerRef.current);
        cursorIdleTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      setLastRefresh(new Date());
    };
    const refreshTimer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(refreshTimer);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await getVpsDocument("config/acompanhamento_atualizacoes").catch(() => null);
        if (!active) return;
        const updateKey = data?.lastUpdateKey || data?.generatedAt || "";
        if (!hasRealtimeUpdateSnapshotRef.current) {
          hasRealtimeUpdateSnapshotRef.current = true;
          realtimeUpdateKeyRef.current = updateKey;
          return;
        }
        if (!updateKey || updateKey === realtimeUpdateKeyRef.current) return;
        realtimeUpdateKeyRef.current = updateKey;

        forceDashboardRefresh(data?.generatedAt || updateKey);
        if (realtimeNoticeTimerRef.current) {
          window.clearTimeout(realtimeNoticeTimerRef.current);
        }
        setRealtimeNotice({
          sourceLabel:
            data?.sourceLabel ||
            REALTIME_SOURCE_LABELS[data?.source] ||
            "Operacional",
          message: data?.message || "Novas informacoes atualizadas.",
          updatedAt: data?.updatedAt || null,
        });
        realtimeNoticeTimerRef.current = window.setTimeout(() => {
          setRealtimeNotice(null);
          realtimeNoticeTimerRef.current = null;
        }, 20000);
      } catch (error) {
        console.error(error);
      }
    };
    load();
    const timer = window.setInterval(load, 5000);
    const unsubscribeRealtime = subscribeRealtimeTopics(["acompanhamento", "diario", "metas", "mapa", "match"], (event) => {
      const versionToken = event?.generatedAt || event?.emittedAt || new Date().toISOString();
      forceDashboardRefresh(versionToken);

      if (event?.collectionPath === "agenda" || event?.path?.startsWith?.("agenda/")) {
        carregarAgendaRef.current?.();
      }

      if (event?.collectionPath === COLLECTIONS.AGENDAMENTOS) {
        showAppointmentNotice(event);
      }

      const source = event?.source || (["mapa", "match", "metas"].includes(event?.topic) ? event.topic : null);
      if (source && ["mapa", "match", "metas"].includes(source)) {
        if (realtimeNoticeTimerRef.current) {
          window.clearTimeout(realtimeNoticeTimerRef.current);
        }
        setRealtimeNotice({
          sourceLabel:
            event?.sourceLabel ||
            REALTIME_SOURCE_LABELS[source] ||
            "Operacional",
          message: event?.message || "O acompanhamento recebeu dados novos e ja foi atualizado.",
          updatedAt: event?.updatedAt || event?.generatedAt || event?.emittedAt || null,
        });
        realtimeNoticeTimerRef.current = window.setTimeout(() => {
          setRealtimeNotice(null);
          realtimeNoticeTimerRef.current = null;
        }, 20000);
      }

      load();
    }, { debounceMs: 250 });
    return () => {
      active = false;
      window.clearInterval(timer);
      unsubscribeRealtime();
      if (appointmentNoticeTimerRef.current) {
        window.clearTimeout(appointmentNoticeTimerRef.current);
        appointmentNoticeTimerRef.current = null;
      }
    };
  }, [forceDashboardRefresh, showAppointmentNotice]);

  useEffect(() => {
    const unsubscribeAppointments = subscribeRealtimeTopics("acompanhamento", (event) => {
      if (event?.collectionPath === COLLECTIONS.AGENDAMENTOS) {
        showAppointmentNotice(event);
      }
    });
    return () => unsubscribeAppointments();
  }, [showAppointmentNotice]);

  const showAdNow = useCallback(() => {
    const ads = {
      ...DEFAULT_CONFIG.ads,
      ...(panelConfig.ads || {}),
    };
    const images = Array.isArray(ads.images)
      ? ads.images.filter((image) => image?.src)
      : [];
    if (!images.length) return false;

    const durationMs = clampNumber(ads.durationSeconds, 5, 120, 15) * 1000;
    const index = nextAdRef.current % images.length;
    nextAdRef.current = (index + 1) % images.length;
    setActiveAdIndex(index);

    if (adHideTimerRef.current) window.clearTimeout(adHideTimerRef.current);
    adHideTimerRef.current = window.setTimeout(() => {
      setActiveAdIndex(null);
      adHideTimerRef.current = null;
    }, durationMs);

    return true;
  }, [panelConfig.ads]);

  const showFestiveNow = useCallback(() => {
    const festive = {
      ...DEFAULT_CONFIG.festive,
      ...(panelConfig.festive || {}),
    };

    setFestiveFlightKey((current) => current + 1);
    if (festive.theme === "easter") return;
  }, [panelConfig.festive]);

  const showGrinchNow = useCallback(() => {
    const festive = {
      ...DEFAULT_CONFIG.festive,
      ...(panelConfig.festive || {}),
    };
    if (festive.theme !== "christmas") return false;

    const side =
      GRINCH_PEEK_SIDES[nextGrinchSideRef.current % GRINCH_PEEK_SIDES.length];
    nextGrinchSideRef.current =
      (nextGrinchSideRef.current + 1) % GRINCH_PEEK_SIDES.length;
    const durationSeconds = clampNumber(
      festive.grinchDurationSeconds,
      3,
      120,
      8,
    );

    if (grinchHideTimerRef.current)
      window.clearTimeout(grinchHideTimerRef.current);
    setGrinchPeek({
      key: Date.now(),
      side,
      durationSeconds,
    });
    grinchHideTimerRef.current = window.setTimeout(() => {
      setGrinchPeek(null);
      grinchHideTimerRef.current = null;
    }, durationSeconds * 1000);

    return true;
  }, [panelConfig.festive]);

  useEffect(() => {
    const ads = {
      ...DEFAULT_CONFIG.ads,
      ...(panelConfig.ads || {}),
    };
    const images = Array.isArray(ads.images)
      ? ads.images.filter((image) => image?.src)
      : [];
    const enabled = Boolean(ads.enabled && images.length);

    const resetTimer = window.setTimeout(() => setActiveAdIndex(null), 0);
    if (!enabled) {
      return () => window.clearTimeout(resetTimer);
    }

    const intervalMs = clampNumber(ads.intervalMinutes, 1, 60, 3) * 60 * 1000;
    const intervalTimer = window.setInterval(showAdNow, intervalMs);

    return () => {
      window.clearTimeout(resetTimer);
      window.clearInterval(intervalTimer);
      if (adHideTimerRef.current) {
        window.clearTimeout(adHideTimerRef.current);
        adHideTimerRef.current = null;
      }
    };
  }, [panelConfig.ads, showAdNow]);

  useEffect(() => {
    const festive = {
      ...DEFAULT_CONFIG.festive,
      ...(panelConfig.festive || {}),
    };
    if (!festive.enabled) return undefined;

    const timer = window.setInterval(
      showFestiveNow,
      clampNumber(festive.intervalSeconds, 10, 900, 120) * 1000,
    );
    return () => window.clearInterval(timer);
  }, [panelConfig.festive, showFestiveNow]);

  useEffect(() => {
    const festive = {
      ...DEFAULT_CONFIG.festive,
      ...(panelConfig.festive || {}),
    };
    if (!festive.enabled || festive.theme !== "christmas") return undefined;

    const timer = window.setInterval(
      showGrinchNow,
      clampNumber(festive.grinchIntervalSeconds, 10, 900, 90) * 1000,
    );
    return () => window.clearInterval(timer);
  }, [panelConfig.festive, showGrinchNow]);

  const dashboard = useMemo(() => {
    const acompanhamento = {
      ...(publicData?.acompanhamento || {}),
      ...(realtimeAcompanhamento || {}),
    };
    const publicMatchOrdens = Array.isArray(publicData?.matchOS?.ordens)
      ? publicData.matchOS.ordens
      : [];
    const mapaSnapshot = publicData?.mapa?.summary
      ? publicData.mapa.summary
      : Array.isArray(publicData?.mapa?.ordens)
        ? buildPublicMapaSnapshot(publicData.mapa.ordens)
        : buildPublicMapaSnapshot([]);
    const match =
      matchPublicoData ||
      (publicData?.matchOS?.result &&
      typeof publicData.matchOS.result === "object"
        ? publicData.matchOS.result
        : buildMatchOSData(publicMatchOrdens));
    const metaMonthData = retiradas.allData?.[currentMonth] || null;
    const metaSempre = getMetaSourceData(metaMonthData, "sempre");
    const metaOnnet = getMetaSourceData(metaMonthData, "onnet");
    const metaMes = getMetaSourceData(metaMonthData, "consolidado");
    const metaPace = getMetaPace(metaMes, currentMonth, retiradas.feriadosSet);
    const metaSempreTile = buildMetaTileData(
      metaSempre,
      "Meta Sempre",
      currentMonth,
      retiradas.feriadosSet,
    );
    const metaOnnetTile = buildMetaTileData(
      metaOnnet,
      "Meta Onnet",
      currentMonth,
      retiradas.feriadosSet,
    );
    const metaConsolidadaTile = buildMetaTileData(
      metaMes,
      "Meta do mês",
      currentMonth,
      retiradas.feriadosSet,
    );
    const lastDayWithData = getLastDayWithData(metaMes);
    const regionalDaysRemaining = getBusinessDaysRemaining(
      currentMonth,
      lastDayWithData,
      now,
    );
    const recentDeliveries = buildRecentDeliveries(
      retiradas.allData,
      currentMonth,
    );

    const agHojeTotal = Number(acompanhamento.agHojeTotal || 0);
    const agProximosTotal = Number(acompanhamento.agProximosTotal || 0);
    const atendentes = Array.isArray(acompanhamento.atendentes)
      ? acompanhamento.atendentes
      : [];
    const tecnicosHoje = Array.isArray(acompanhamento.tecnicosHoje)
      ? acompanhamento.tecnicosHoje
      : [];
    const regionaisAgendamento = Array.isArray(
      acompanhamento.regionaisAgendamento,
    )
      ? acompanhamento.regionaisAgendamento
      : [];
    const entregasRegionaisPainel = (metaMes?.regionais || [])
      .map((item) => ({
        label: normalizeLabel(
          item.name || item.nome || item.label,
          "Sem regional",
        ),
        total: Number(item.total ?? item.realizado ?? item.value ?? 0),
        meta: Number(item.meta || 110),
      }))
      .filter((item) => item.total > 0)
      .sort(
        (a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"),
      );
    const entregasRegionais = entregasRegionaisPainel;
    const entregasDiarias = buildDailyTrend(metaMes);
    const entregasDiaAnterior = buildPreviousDeliverySummary(metaMes, now);
    const eventosAgenda = (Array.isArray(eventos) ? eventos : [])
      .filter((evento) => {
        const end = parseLocalDate(evento.data_fim || evento.data_inicio);
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        return end && end >= today;
      })
      .sort(
        (a, b) => parseLocalDate(a.data_inicio) - parseLocalDate(b.data_inicio),
      )
      .slice(0, 4);
    const cidadesOS = [
      ...mapaSnapshot.rankingRegionais.map((item) => ({
        label: item.cidade,
        total: item.total,
      })),
      ...mapaSnapshot.rankingAgentes.map((item) => ({
        label: `${item.cidade} (Agente)`,
        total: item.total,
      })),
    ]
      .sort((a, b) => b.total - a.total)
      .slice(0, 16);
    const regionaisOS = mapaSnapshot.chartRegionais
      .map((item) => ({ label: item.regional, total: item.total }))
      .slice(0, 8);

    const totalMatches = Number(match?.resumo?.totalMatches || 0);
    const totalMatchesRegionais = sumMatchSection(match?.regionais || []);
    const totalMatchesAgentes = sumMatchSection(match?.agentes || []);
    const topAtendente = atendentes[0] || null;
    const topCidadeOS = cidadesOS[0] || null;
    const pctAgendamentosHoje = Number(acompanhamento.pctAgendamentosHoje || 0);

    const customInsights = String(panelConfig.customInsights || "")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    const insights = customInsights;

    return {
      agHojeTotal,
      agProximosTotal,
      atendentes,
      tecnicosHoje,
      regionaisAgendamento,
      entregasRegionais,
      entregasDiarias,
      entregasDiaAnterior,
      recentDeliveries,
      eventosAgenda,
      regionalDaysRemaining,
      cidadesOS,
      regionaisOS,
      mapaSnapshot,
      metaMes,
      metaSempre,
      metaOnnet,
      metaPace,
      metaSempreTile,
      metaOnnetTile,
      metaConsolidadaTile,
      totalMatches,
      totalMatchesRegionais,
      totalMatchesAgentes,
      topAtendente,
      topCidadeOS,
      pctAgendamentosHoje,
      insights,
    };
  }, [
    currentMonth,
    matchPublicoData,
    now,
    eventos,
    panelConfig.customInsights,
    publicData,
    realtimeAcompanhamento,
    retiradas.allData,
    retiradas.feriadosSet,
  ]);

  const showMetaShowcase = useCallback(
    (statusOverride = null) => {
      const config = {
        ...DEFAULT_CONFIG.metaShowcase,
        ...(panelConfig.metaShowcase || {}),
      };
      setMetaShowcase({ statusOverride });
      if (metaHideTimerRef.current)
        window.clearTimeout(metaHideTimerRef.current);
      metaHideTimerRef.current = window.setTimeout(
        () => {
          setMetaShowcase(null);
          metaHideTimerRef.current = null;
        },
        clampNumber(config.durationSeconds, 5, 120, 12) * 1000,
      );
    },
    [panelConfig.metaShowcase],
  );

  const closeMetaShowcase = useCallback(() => {
    setMetaShowcase(null);
    if (metaHideTimerRef.current) {
      window.clearTimeout(metaHideTimerRef.current);
      metaHideTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const config = {
      ...DEFAULT_CONFIG.metaShowcase,
      ...(panelConfig.metaShowcase || {}),
    };
    if (!config.enabled) return undefined;
    const intervalMs =
      clampNumber(config.intervalMinutes, 1, 60, 1) * 60 * 1000;
    const timer = window.setInterval(() => showMetaShowcase(), intervalMs);
    return () => window.clearInterval(timer);
  }, [panelConfig.metaShowcase, showMetaShowcase]);

  useEffect(
    () => () => {
      if (metaHideTimerRef.current)
        window.clearTimeout(metaHideTimerRef.current);
      if (grinchHideTimerRef.current)
        window.clearTimeout(grinchHideTimerRef.current);
      if (realtimeNoticeTimerRef.current)
        window.clearTimeout(realtimeNoticeTimerRef.current);
    },
    [],
  );

  const loading =
    loadingAgenda ||
    loadingPublicData ||
    loadingMatchPublico ||
    loadingDiario ||
    retiradas.loading;
  const scenes = ["atendentes", "cidades", "match"];
  const sections = panelConfig.sections;
  const adImages = Array.isArray(panelConfig.ads?.images)
    ? panelConfig.ads.images.filter((image) => image?.src)
    : [];
  const activeAd =
    activeAdIndex !== null && adImages.length
      ? adImages[activeAdIndex % adImages.length]
      : null;
  const festiveTheme =
    panelConfig.festive?.theme === "easter" ? "easter" : "christmas";
  const festiveEnabled = panelConfig.festive?.enabled === true;
  const useChristmasStatusRetorninho =
    festiveEnabled && festiveTheme === "christmas";

  return (
    <main
      className={`acomp-page ${cursorIdle ? "is-cursor-idle" : ""} ${festiveEnabled ? `acomp-festive-page is-${festiveTheme}` : ""}`}
    >
      <FestiveOverlay
        config={panelConfig.festive}
        flightKey={festiveFlightKey}
        grinchPeek={grinchPeek}
      />
      <div className="acomp-bg-grid" />
      {useChristmasStatusRetorninho ? (
        <div className="acomp-xmas-stage" aria-hidden="true">
          <span className="acomp-xmas-corner acomp-xmas-corner-left" />
          <span className="acomp-xmas-corner acomp-xmas-corner-right" />
          <span className="acomp-xmas-snow-floor" />
        </div>
      ) : null}
      <div className="acomp-shell">
        <header className="acomp-header">
          <div className="acomp-brand">
            <img src="/cluster-mg.png" alt="Sempre Internet" decoding="async" />
            <div>
              <span>
                {useChristmasStatusRetorninho
                  ? "OPERAÇÃO NATAL"
                  : "ACOMPANHAMENTO AO VIVO"}
              </span>
              <h1>SALA DE AGENDAMENTOS</h1>
            </div>
          </div>
          <div className="acomp-live">
            <span className="acomp-live-dot" />
            <strong>{loading ? "SINCRONIZANDO" : "AO VIVO"}</strong>
            <small>
              {formatTime(now)} - atualizado {formatTime(lastRefresh)}
            </small>
            <button
              type="button"
              onClick={() => setConfigOpen(true)}
              className="acomp-settings-btn"
              title="Configurar painel"
            >
              <Settings size={16} />
            </button>
          </div>
        </header>

        <div className="acomp-main-grid">
          {sections.spotlight ? (
            <Spotlight
              scene={scenes[sceneIndex]}
              data={dashboard}
              festiveTheme={festiveEnabled ? festiveTheme : null}
            />
          ) : null}

          {sections.kpis ? (
            <section className="acomp-kpis">
              <KpiTile
                icon={CalendarCheck}
                label="HOJE"
                value={formatNumber(dashboard.agHojeTotal)}
                helper="agendamentos no dia"
                tone="orange"
              />
              <KpiTile
                icon={Clock3}
                label="PRÓXIMOS 7 DIAS"
                value={formatNumber(dashboard.agProximosTotal)}
                helper={`${dashboard.pctAgendamentosHoje}% concentrado hoje`}
                tone="blue"
              />
              <KpiTile
                icon={Route}
                label="MATCHES"
                value={formatNumber(dashboard.totalMatches)}
                helper="oportunidades de rota"
                tone="green"
              />
              <KpiTile
                icon={Target}
                label="SEMPRE"
                value={dashboard.metaSempreTile.value}
                helper={dashboard.metaSempreTile.helper}
                tone={dashboard.metaSempreTile.tone}
                className="acomp-kpi-meta-source"
              >
                <MetaStatusVisual
                  status={dashboard.metaSempreTile.pace.status}
                />
              </KpiTile>
              <KpiTile
                icon={Target}
                label="ONNET"
                value={dashboard.metaOnnetTile.value}
                helper={dashboard.metaOnnetTile.helper}
                tone={dashboard.metaOnnetTile.tone}
                className="acomp-kpi-meta-source"
              >
                <MetaStatusVisual
                  status={dashboard.metaOnnetTile.pace.status}
                />
              </KpiTile>
              <KpiTile
                icon={Target}
                label="META DO MÊS"
                value={dashboard.metaConsolidadaTile.value}
                helper={dashboard.metaConsolidadaTile.helper}
                tone={dashboard.metaConsolidadaTile.tone}
              >
                <MetaStatusVisual
                  status={dashboard.metaConsolidadaTile.pace.status}
                />
              </KpiTile>
            </section>
          ) : null}

          {sections.status ? (
            <>
              <section className="acomp-panel acomp-status-panel">
                {useChristmasStatusRetorninho ? (
                  <span
                    className="acomp-xmas-sleigh-trace"
                    aria-hidden="true"
                  />
                ) : null}
                <div className="acomp-panel-title">
                  <Radio size={19} />
                  <h2>ENTREGA DA OPERAÇÃO</h2>
                  <span>{dashboard.entregasDiaAnterior.dayLabel}</span>
                </div>
                <div className="acomp-status-grid">
                  {dashboard.entregasDiaAnterior.items.map((item) => (
                    <StatusPill
                      key={item.label}
                      status={item.label}
                      total={item.total}
                    />
                  ))}
                </div>
                <img
                  className="acomp-status-retorninho"
                  src={
                    useChristmasStatusRetorninho
                      ? "/retorninho-xmas-sleigh.png"
                      : "/retorninho-esteira.png"
                  }
                  alt=""
                  aria-hidden="true"
                />
              </section>
              <RecentDeliveriesCard items={dashboard.recentDeliveries} />
            </>
          ) : null}

          {sections.agenda ? (
            <div className="acomp-agenda-stack">
              <AgendaPanel eventos={dashboard.eventosAgenda} />
              <FinesPanel data={diarioBoardData} />
            </div>
          ) : null}
          {sections.entregasDiarias ? (
            <DeliveryTrendChart items={dashboard.entregasDiarias} />
          ) : null}

          {sections.atendentes ? (
            <RankingList
              title="CIDADES COM MAIS O.S ABERTA"
              icon={MapPin}
              items={dashboard.cidadesOS}
              empty="Sem O.S abertas"
              className="acomp-atendentes-panel"
              limit={useChristmasStatusRetorninho ? 12 : 16}
            />
          ) : null}
          {sections.cidades ? (
            <RankingList
              title="RANKING DE AGENDAMENTO"
              icon={Trophy}
              items={dashboard.atendentes}
              empty="Aguardando nomes de atendentes"
              className="acomp-cidades-panel"
              limit={5}
            />
          ) : null}
          {sections.regionais ? (
            <RankingList
              title="REGIONAIS COM MAIS RETIRADAS EM ABERTO"
              icon={Medal}
              items={
                dashboard.regionaisOS.length
                  ? dashboard.regionaisOS
                  : dashboard.regionaisAgendamento
              }
              empty="Sem regionais para exibir"
              className="acomp-regionais-panel"
              limit={3}
            />
          ) : null}
          {sections.tecnicos ? (
            <DailyDeliveryPanel data={diarioBoardData} />
          ) : null}
          {sections.entregasRegionais ? (
            <RankingList
              title="ENTREGAS POR REGIONAL"
              icon={CalendarCheck}
              items={dashboard.entregasRegionais}
              empty="Nenhuma entrega concluída"
              className="acomp-entregas-regionais-panel"
              limit={dashboard.entregasRegionais.length}
              renderSubline={(item) =>
                getRegionalPaceText(item, dashboard.regionalDaysRemaining)
              }
            />
          ) : null}

          {sections.match ? (
            <div className="acomp-match-stack">
              <section className="acomp-panel acomp-match-panel">
                <div className="acomp-panel-title">
                  <Activity size={18} />
                  <h2>MATCH E OPORTUNIDADES</h2>
                </div>
                <div className="acomp-match-grid">
                  <div>
                    <strong>
                      {formatNumber(dashboard.totalMatchesRegionais)}
                    </strong>
                    <span>REGIONAIS</span>
                  </div>
                  <div>
                    <strong>
                      {formatNumber(dashboard.totalMatchesAgentes)}
                    </strong>
                    <span>AGENTES</span>
                  </div>
                  <div>
                    <strong>
                      {formatNumber(dashboard.mapaSnapshot.kpis.pendente)}
                    </strong>
                    <span>PENDENTES</span>
                  </div>
                </div>
              </section>
              <WeeklyProductionPanel data={diarioBoardData} />
            </div>
          ) : null}
        </div>

        {sections.insights ? (
          <InsightTicker insights={dashboard.insights} />
        ) : null}
      </div>
      {configOpen ? (
        <ConfigPanel
          config={panelConfig}
          onChange={setPanelConfig}
          onClose={() => setConfigOpen(false)}
          onTestAd={showAdNow}
          onTestMeta={(status) => {
            showMetaShowcase(status);
            setConfigOpen(false);
          }}
          onTestFestive={showFestiveNow}
          onTestGrinch={showGrinchNow}
          onUploadImages={(images) =>
            Promise.all(images.map(uploadAcompanhamentoAd))
          }
          onRemoveImage={deleteAcompanhamentoAd}
        />
      ) : null}
      <AdOverlay image={activeAd} />
      {metaShowcase ? (
        <MetaShowcaseModal
          tiles={[
            dashboard.metaSempreTile,
            dashboard.metaOnnetTile,
            dashboard.metaConsolidadaTile,
          ]}
          statusOverride={metaShowcase.statusOverride}
          onClose={closeMetaShowcase}
        />
      ) : null}
      <AppointmentRealtimeModal appointments={appointmentNoticeItems} />
      <RealtimeUpdateModal notice={realtimeNotice} />
    </main>
  );
}


