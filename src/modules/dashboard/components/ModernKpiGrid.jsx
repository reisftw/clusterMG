import {
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  Clock3,
  Minus,
  TrendingUp,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { COLLECTIONS } from "../../../constants/dataCollections";
import { listAllVpsDocuments } from "../../../services/vpsApiClient";

const KPI_CONFIG = [
  {
    key: "total",
    label: "O.S em aberto",
    helper: "Total em aberto",
    icon: ClipboardList,
    iconClass: "bg-blue-50 text-blue-600",
    trend: { value: "12%", text: "vs mês anterior", tone: "red", icon: ArrowUp },
  },
  {
    key: "pendente",
    label: "Pendentes",
    helper: "Aguardando ação",
    icon: Clock3,
    iconClass: "bg-orange-50 text-orange-500",
    trend: {
      value: "8%",
      text: "vs mês anterior",
      tone: "green",
      icon: ArrowDown,
    },
  },
  {
    key: "aguardando",
    label: "Aguardando agendamento",
    helper: "Para agendar",
    icon: CalendarClock,
    iconClass: "bg-blue-50 text-blue-600",
    trend: {
      value: "5%",
      text: "vs mês anterior",
      tone: "green",
      icon: ArrowDown,
    },
  },
  {
    key: "ferias",
    label: "Colaboradores em férias",
    helper: "No período",
    icon: Users,
    iconClass: "bg-violet-50 text-violet-600",
    trend: { value: "", text: "Sem alteração", tone: "neutral", icon: Minus },
  },
  {
    key: "visitas",
    label: "Visitas no mês",
    helper: "Realizadas",
    icon: TrendingUp,
    iconClass: "bg-green-50 text-green-600",
    trend: { value: "15%", text: "vs mês anterior", tone: "green", icon: ArrowUp },
  },
  {
    key: "feriados",
    label: "Próximos feriados",
    helper: "Nos próximos 30 dias",
    icon: CalendarCheck,
    iconClass: "bg-red-50 text-red-500",
    trend: { value: "", text: "Sem alteração", tone: "neutral", icon: Minus },
  },
  {
    key: "agendamentosMes",
    label: "Agendamentos do mês",
    helper: "Mês atual",
    icon: CalendarClock,
    iconClass: "bg-blue-50 text-blue-600",
    trend: { value: "", text: "Atualizado pela agenda", tone: "neutral", icon: Minus },
  },
];

const trendClass = {
  green: "text-green-600",
  red: "text-red-500",
  neutral: "text-slate-500",
};

function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getPreviousMonthKey(date = new Date()) {
  const previous = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return getMonthKey(previous);
}

function getAppointmentDateValue(item = {}) {
  return String(
    item.data ||
      item.data_agendamento ||
      item.dataAgendamento ||
      item.data_agendada ||
      item.dataAgendada ||
      item.schedule?.date ||
      item.schedule_date ||
      "",
  ).trim();
}

function normalizeAppointmentDateKey(item = {}) {
  const raw = getAppointmentDateValue(item);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const brDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brDate) {
    const [, day, month, year] = brDate;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return `${getMonthKey(parsed)}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function countByMonth(items = [], monthKey) {
  return items.filter((item) => normalizeAppointmentDateKey(item).startsWith(monthKey)).length;
}

function buildMonthTrend(current, previous) {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  if (!previousValue && !currentValue) {
    return { value: "", text: "Sem alteração", tone: "neutral", icon: Minus };
  }
  if (!previousValue) {
    return { value: "100%", text: "vs mês anterior", tone: "green", icon: ArrowUp };
  }
  const variation = ((currentValue - previousValue) / previousValue) * 100;
  const absVariation = Math.abs(variation);
  if (absVariation < 0.1) {
    return { value: "", text: "Sem alteração", tone: "neutral", icon: Minus };
  }
  return {
    value: `${absVariation.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
    text: "vs mês anterior",
    tone: variation >= 0 ? "green" : "red",
    icon: variation >= 0 ? ArrowUp : ArrowDown,
  };
}

const ModernKpiGrid = ({ resumo, ordens = [], hiddenKeys = [] }) => {
  const [agendamentos, setAgendamentos] = useState([]);
  const mesAtual = useMemo(() => getMonthKey(), []);
  const mesAnterior = useMemo(() => getPreviousMonthKey(), []);

  useEffect(() => {
    let active = true;

    const carregarAgendamentos = async () => {
      const items = await listAllVpsDocuments(COLLECTIONS.AGENDAMENTOS, {
        pageSize: 1000,
        max: 10000,
      });
      if (active) setAgendamentos(items);
    };

    carregarAgendamentos().catch(() => {
      if (active) setAgendamentos([]);
    });

    return () => {
      active = false;
    };
  }, []);

  const agendamentosMesAtual = useMemo(
    () => countByMonth(agendamentos, mesAtual),
    [agendamentos, mesAtual],
  );
  const agendamentosMesAnterior = useMemo(
    () => countByMonth(agendamentos, mesAnterior),
    [agendamentos, mesAnterior],
  );

  const mapaKpis = ordens.reduce(
    (acc, os) => {
      acc.total += 1;
      if (os.status === "Pendente") acc.pendente += 1;
      if (os.status === "Aguardando Agendamento") acc.aguardando += 1;
      return acc;
    },
    { total: 0, pendente: 0, aguardando: 0 },
  );

  const agendamentosMesValue = agendamentosMesAtual;
  const agendamentosMesPrevious = agendamentosMesAnterior;
  const dynamicTrends = {
    agendamentosMes: buildMonthTrend(agendamentosMesValue, agendamentosMesPrevious),
  };

  const values = {
    ...mapaKpis,
    ferias: resumo?.tecnicosEmFerias ?? 0,
    visitas: resumo?.visitasNoMes ?? 0,
    feriados: resumo?.feriadosProximos?.length ?? 0,
    agendamentosMes: agendamentosMesValue,
  };

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {KPI_CONFIG.filter((item) => !hiddenKeys.includes(item.key)).map((item) => (
        <KpiCard key={item.key} {...item} trend={dynamicTrends[item.key] || item.trend} value={values[item.key]} />
      ))}
    </section>
  );
};

const KpiCard = ({ label, helper, icon: Icon, iconClass, trend, value }) => {
  const TrendIcon = trend.icon;

  return (
    <article className="flex min-h-[172px] flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-card transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
        >
          <Icon size={22} />
        </div>
        <h3 className="min-w-0 text-sm font-bold leading-snug text-slate-800">
          {label}
        </h3>
      </div>

      <div className="mt-4">
        <p className="text-4xl font-black leading-none text-slate-950">
          {Number(value || 0).toLocaleString("pt-BR")}
        </p>
        <p className="mt-2 text-xs font-semibold text-slate-500">{helper}</p>
      </div>

      <div className="mt-auto border-t border-slate-200 pt-3">
        <p
          className={`flex items-center gap-1.5 text-xs font-bold ${trendClass[trend.tone]}`}
        >
          <TrendIcon size={15} />
          {trend.value && <span>{trend.value}</span>}
          <span className="font-semibold text-slate-500">{trend.text}</span>
        </p>
      </div>
    </article>
  );
};

export default ModernKpiGrid;

