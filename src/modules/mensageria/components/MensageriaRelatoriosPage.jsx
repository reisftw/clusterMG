import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarRange,
  Download,
  Funnel,
  RefreshCw,
  Target,
  TrendingUp,
} from "lucide-react";
import { addClusterLogo } from "../../../utils/pdfBranding";
import { buscarDadosRelatorioMensageria } from "../services/mensageriaService";

const MONTHS = [
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

const CURRENT_YEAR = new Date().getFullYear();

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function phoneVariants(value) {
  const digits = normalizeDigits(value);
  if (!digits) return [];
  const variants = new Set([digits]);
  if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
    variants.add(`${digits.slice(0, 4)}${digits.slice(5)}`);
  }
  if (digits.startsWith("55") && digits.length === 12) {
    variants.add(`${digits.slice(0, 4)}9${digits.slice(4)}`);
  }
  return [...variants];
}

function phoneKey(value) {
  const variants = phoneVariants(value);
  return variants.sort((a, b) => a.length - b.length)[0] || normalizeDigits(value);
}

function getDate(item, fields) {
  for (const field of fields) {
    const value = item?.[field];
    if (!value) continue;
    const date = new Date(value?.value || value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function getReferenceDate(item) {
  return getDate(item, [
    "criadoEm",
    "criado_em",
    "ultimoEnvioEm",
    "recebidoEm",
    "recebido_em",
    "data_hora",
    "date_time",
    "momment",
    "timestamp",
    "atualizadoEm",
    "atualizado_em",
  ]);
}

function getAppointmentDate(item) {
  const directDate = getDate(item, [
    "data",
    "date",
    "data_agendamento",
    "dataAgendamento",
    "agendado_para",
    "agendadoPara",
    "criadoEm",
    "criado_em",
    "atualizadoEm",
    "atualizado_em",
  ]);
  if (directDate) return directDate;
  const scheduleDate = item?.schedule?.date;
  if (scheduleDate) {
    const date = new Date(`${scheduleDate}T00:00:00`);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function periodBounds(periodType, month, semester, year) {
  const selectedYear = Number(year) || CURRENT_YEAR;
  if (periodType === "annual") {
    return {
      start: new Date(selectedYear, 0, 1),
      end: new Date(selectedYear + 1, 0, 1),
      label: `${selectedYear}`,
    };
  }
  if (periodType === "semester") {
    const startMonth = semester === "2" ? 6 : 0;
    return {
      start: new Date(selectedYear, startMonth, 1),
      end: new Date(selectedYear, startMonth + 6, 1),
      label: `${semester === "2" ? "2º" : "1º"} semestre de ${selectedYear}`,
    };
  }
  const selectedMonth = Math.max(0, Math.min(11, Number(month) || 0));
  return {
    start: new Date(selectedYear, selectedMonth, 1),
    end: new Date(selectedYear, selectedMonth + 1, 1),
    label: `${MONTHS[selectedMonth]}/${selectedYear}`,
  };
}

function inPeriod(date, bounds) {
  return date && date >= bounds.start && date < bounds.end;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function minDate(left, right) {
  return left.getTime() <= right.getTime() ? left : right;
}

function getCutoffDate(bounds) {
  const yesterday = endOfDay(addDays(new Date(), -1));
  const periodLastDay = new Date(bounds.end.getTime() - 1);
  return minDate(yesterday, periodLastDay);
}

function formatShortDate(date) {
  if (!date || Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function pct(value, total) {
  if (!total) return 0;
  return (Number(value || 0) / Number(total || 0)) * 100;
}

function pctText(value, total) {
  return `${pct(value, total).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function getStatusText(item) {
  return String(item?.status || item?.status_novo || "").toLowerCase();
}

function isSent(item) {
  return getStatusText(item) === "enviado";
}

function isFailed(item) {
  return getStatusText(item) === "falhou";
}

function isCollectedAppointment(item) {
  const status = getStatusText(item)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return Boolean(
    item?.recolhido_em ||
      item?.recolhidoEm ||
      item?.verificacao_mapa?.status === "nao_encontrado_no_mapa" ||
      ["concluido", "entregue", "recolhido", "coletado"].includes(status),
  );
}

function getRecordOrigin(item = {}) {
  return normalizeText(
    item.origem ||
      item.source ||
      item.raw?.origem ||
      item.data?.origem ||
      item.evolutionMode ||
      "",
  );
}

function isTestRecord(item = {}) {
  const origin = getRecordOrigin(item);
  const cliente = normalizeText(item.cliente || item.cliente_nome || item.nome || item.raw?.cliente || "");
  const cidade = normalizeText(item.cidade || item.raw?.cidade || "");
  const os = normalizeText(item.os || item.raw?.os || "");
  const codigo = normalizeText(item.codigo_cliente || item.codigoCliente || item.raw?.codigo_cliente || "");

  return (
    origin.startsWith("teste") ||
    origin.includes("teste_manual") ||
    origin.includes("manual_test") ||
    cliente === "cliente teste" ||
    cliente.includes("teste manual") ||
    cidade === "cidade teste" ||
    os === "os-teste" ||
    codigo === "teste"
  );
}

function buildTestContext({ historico = [], callbacks = [], fila = [] }) {
  const testHistory = historico.filter(isTestRecord);
  const testCallbacks = callbacks.filter(isTestRecord);
  const testQueue = fila.filter(isTestRecord);

  return {
    historyIds: new Set(testHistory.map((item) => String(item.id || item.historicoId || "")).filter(Boolean)),
    queueIds: new Set(
      [...testHistory, ...testCallbacks, ...testQueue]
        .map((item) => String(item.filaId || item.queueId || item.id || ""))
        .filter(Boolean),
    ),
    callbackIds: new Set(testCallbacks.map((item) => String(item.id || item.callbackId || "")).filter(Boolean)),
    appointmentIds: new Set(
      testCallbacks
        .map((item) => String(item.agendamento_id || item.agendamentoId || ""))
        .filter(Boolean),
    ),
    phones: new Set(
      [...testHistory, ...testCallbacks, ...testQueue]
        .flatMap((item) => phoneVariants(item.telefone || item.telefone_digits || item.phone))
        .filter(Boolean),
    ),
  };
}

function isLinkedToTest(item = {}, context = {}) {
  if (isTestRecord(item)) return true;
  const historyId = String(item.historicoId || item.historyId || "");
  const queueId = String(item.filaId || item.queueId || "");
  const callbackId = String(item.callbackId || item.callback_id || "");
  const appointmentId = String(item.agendamento_id || item.agendamentoId || item.id || "");
  const phoneMatches = phoneVariants(item.telefone || item.telefone_digits || item.phone).some((phone) =>
    context.phones?.has(phone),
  );

  return (
    (historyId && context.historyIds?.has(historyId)) ||
    (queueId && context.queueIds?.has(queueId)) ||
    (callbackId && context.callbackIds?.has(callbackId)) ||
    (appointmentId && context.appointmentIds?.has(appointmentId)) ||
    Boolean(phoneMatches && getRecordOrigin(item).includes("teste"))
  );
}

function buildPersonKey(item) {
  return (
    phoneKey(item?.telefone || item?.telefone_digits || item?.phone) ||
    normalizeDigits(item?.codigo_cliente || item?.codigoCliente) ||
    String(item?.os || item?.filaId || item?.id || "")
  );
}

function summarize({ historico = [], callbacks = [], fila = [], agendamentos = [] }, bounds) {
  const testContext = buildTestContext({ historico, callbacks, fila });
  const realHistorico = historico.filter((item) => !isLinkedToTest(item, testContext));
  const realCallbacks = callbacks.filter((item) => !isLinkedToTest(item, testContext));
  const realFila = fila.filter((item) => !isLinkedToTest(item, testContext));
  const realAgendamentos = agendamentos.filter((item) => !isLinkedToTest(item, testContext));

  const sentHistory = realHistorico.filter((item) => isSent(item) && inPeriod(getReferenceDate(item), bounds));
  const failedHistory = realHistorico.filter((item) => isFailed(item) && inPeriod(getReferenceDate(item), bounds));
  const sentKeys = new Set(sentHistory.map(buildPersonKey).filter(Boolean));
  const cutoffDate = getCutoffDate(bounds);
  const nextCutoffDay = startOfDay(addDays(cutoffDate, 1));

  const callbacksInPeriod = realCallbacks;
  const appointmentsInPeriod = realAgendamentos;
  const dueAppointments = appointmentsInPeriod.filter((appointment) => {
    const date = getAppointmentDate(appointment);
    return date ? date < nextCutoffDay : true;
  });
  const futureAppointments = appointmentsInPeriod.filter((appointment) => {
    const date = getAppointmentDate(appointment);
    return date ? date >= nextCutoffDay : false;
  });
  const collectedAppointments = dueAppointments.filter(isCollectedAppointment);

  const byCity = new Map();
  sentHistory.forEach((item) => {
    const city = String(item.cidade || "Sem cidade").trim() || "Sem cidade";
    const current = byCity.get(city) || { cidade: city, enviados: 0, respostas: 0, agendados: 0, recolhidos: 0 };
    current.enviados += 1;
    byCity.set(city, current);
  });
  callbacksInPeriod.forEach((item) => {
    const queue = realFila.find((row) => String(row.id) === String(item.filaId));
    const city = String(item.cidade || queue?.cidade || "Sem cidade").trim() || "Sem cidade";
    const current = byCity.get(city) || { cidade: city, enviados: 0, respostas: 0, agendados: 0, recolhidos: 0 };
    current.respostas += 1;
    byCity.set(city, current);
  });
  appointmentsInPeriod.forEach((item) => {
    const city = String(item.cidade || "Sem cidade").trim() || "Sem cidade";
    const current = byCity.get(city) || { cidade: city, enviados: 0, respostas: 0, agendados: 0, recolhidos: 0 };
    current.agendados += 1;
    byCity.set(city, current);
  });
  collectedAppointments.forEach((item) => {
    const city = String(item.cidade || "Sem cidade").trim() || "Sem cidade";
    const current = byCity.get(city) || { cidade: city, enviados: 0, respostas: 0, agendados: 0, recolhidos: 0 };
    current.recolhidos += 1;
    byCity.set(city, current);
  });

  const totalMessages = sentHistory.length;
  const totalUnique = sentKeys.size || totalMessages;
  const responses = callbacksInPeriod.length;
  const scheduled = appointmentsInPeriod.length;
  const scheduledDue = dueAppointments.length;
  const scheduledFuture = futureAppointments.length;
  const collected = collectedAppointments.length;
  const pendingCollection = Math.max(0, scheduledDue - collected);

  return {
    totalMessages,
    totalUnique,
    failures: failedHistory.length,
    responses,
    scheduled,
    scheduledDue,
    scheduledFuture,
    collected,
    pendingCollection,
    cutoffDate,
    cutoffLabel: formatShortDate(cutoffDate),
    responseRate: pct(responses, totalMessages),
    scheduleRate: pct(scheduled, totalMessages),
    collectionRate: pct(collected, scheduledDue),
    atendimentoConversion: pct(scheduled, responses),
    fieldSuccessRate: pct(collected, scheduledDue),
    byCity: [...byCity.values()].sort((a, b) => b.enviados - a.enviados),
  };
}

function MetricCard({ title, value, helper, tone = "blue", icon: Icon }) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    orange: "border-orange-200 bg-orange-50 text-orange-800",
    purple: "border-violet-200 bg-violet-50 text-violet-800",
  };
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${tones[tone] || tones.blue}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-wide">{title}</p>
        {Icon ? <Icon size={20} /> : null}
      </div>
      <p className="mt-3 text-3xl font-black">{value}</p>
      <p className="mt-1 text-sm font-semibold opacity-80">{helper}</p>
    </div>
  );
}

function FunnelBar({ label, value, total, tone = "bg-blue-600" }) {
  const width = Math.max(4, Math.min(100, pct(value, total)));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm font-bold text-slate-700">
        <span>{label}</span>
        <span>
          {value} / {total || 0} ({pctText(value, total)})
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

async function exportPdf({ summary, periodLabel }) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const generatedAt = new Date().toLocaleString("pt-BR");

  pdf.setFillColor(5, 35, 75);
  pdf.rect(0, 0, 210, 34, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("Relatório de Efetividade da Mensageria", 14, 15);
  pdf.setFontSize(10);
  pdf.text(`Período: ${periodLabel} | Gerado em ${generatedAt}`, 14, 24);
  await addClusterLogo(pdf);

  pdf.setTextColor(15, 23, 42);
  autoTable(pdf, {
    startY: 44,
    head: [["Indicador", "Resultado", "Base"]],
    body: [
      ["Total de mensagens enviadas", String(summary.totalMessages), "Histórico enviado"],
      ["Contatos únicos impactados", String(summary.totalUnique), "Telefone/código"],
      ["Taxa de resposta", pctText(summary.responses, summary.totalMessages), `${summary.responses} de ${summary.totalMessages} responderam`],
      ["Taxa de agendamento", pctText(summary.scheduled, summary.totalMessages), `${summary.scheduled} de ${summary.totalMessages} agendaram`],
      ["Taxa de recolhimento final", pctText(summary.collected, summary.scheduledDue), `${summary.collected} de ${summary.scheduledDue} agendamentos ate ${summary.cutoffLabel}`],
      ["Agendamentos hoje/futuros", String(summary.scheduledFuture), "Nao entram na taxa de recolhimento"],
      ["Diferenca em aberto", String(summary.pendingCollection), `Agendados ate ${summary.cutoffLabel} ainda sem recolhimento`],
      ["Conversão de atendimento", pctText(summary.scheduled, summary.responses), "Agendados sobre respondidos"],
      ["Sucesso técnico/campo", pctText(summary.collected, summary.scheduledDue), "Recolhidos sobre agendados"],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [0, 94, 255] },
  });

  autoTable(pdf, {
    startY: pdf.lastAutoTable.finalY + 8,
    head: [["Cidade", "Enviadas", "Respostas", "Agendamentos", "Recolhimentos"]],
    body: summary.byCity.map((item) => [
      item.cidade,
      item.enviados,
      item.respostas,
      item.agendados,
      item.recolhidos,
    ]),
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [255, 106, 0] },
  });

  pdf.save(`relatorio-mensageria-${periodLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`);
}

export default function MensageriaRelatoriosPage() {
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [data, setData] = useState({ historico: [], callbacks: [], fila: [], agendamentos: [] });
  const [periodType, setPeriodType] = useState("month");
  const [month, setMonth] = useState(new Date().getMonth());
  const [semester, setSemester] = useState(new Date().getMonth() >= 6 ? "2" : "1");
  const [year, setYear] = useState(CURRENT_YEAR);
  const [cityPage, setCityPage] = useState(1);
  const [cityPageSize, setCityPageSize] = useState(20);

  const bounds = useMemo(() => periodBounds(periodType, month, semester, year), [periodType, month, semester, year]);
  const summary = useMemo(() => summarize(data, bounds), [data, bounds]);
  const cityTotalPages = Math.max(1, Math.ceil(summary.byCity.length / cityPageSize));
  const normalizedCityPage = Math.min(cityPage, cityTotalPages);
  const paginatedCities = summary.byCity.slice(
    (normalizedCityPage - 1) * cityPageSize,
    normalizedCityPage * cityPageSize,
  );

  const load = async () => {
    setLoading(true);
    setFeedback("");
    try {
      setData(await buscarDadosRelatorioMensageria());
    } catch (error) {
      setFeedback(error?.message || "Não foi possível carregar os relatórios da Mensageria.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setCityPage(1);
  }, [bounds.label, cityPageSize]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <BarChart3 size={24} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-700">Mensageria</p>
              <h1 className="text-2xl font-black text-slate-950">Relatórios de efetividade</h1>
              <p className="text-sm text-slate-500">
                Acompanhe resposta, agendamento e recolhimento final com base na conferência do mapa.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={load} className="btn-secondary" disabled={loading}>
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Atualizar
            </button>
            <button
              onClick={() => exportPdf({ summary, periodLabel: bounds.label })}
              className="btn-primary"
              disabled={loading || !summary.totalMessages}
            >
              <Download size={16} /> Baixar PDF
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-slate-500">Período</label>
            <select className="input-field" value={periodType} onChange={(event) => setPeriodType(event.target.value)}>
              <option value="month">Mês</option>
              <option value="semester">Semestre</option>
              <option value="annual">Anual</option>
            </select>
          </div>
          {periodType === "month" ? (
            <div>
              <label className="mb-1 block text-xs font-black uppercase text-slate-500">Mês</label>
              <select className="input-field" value={month} onChange={(event) => setMonth(Number(event.target.value))}>
                {MONTHS.map((item, index) => (
                  <option key={item} value={index}>{item}</option>
                ))}
              </select>
            </div>
          ) : null}
          {periodType === "semester" ? (
            <div>
              <label className="mb-1 block text-xs font-black uppercase text-slate-500">Semestre</label>
              <select className="input-field" value={semester} onChange={(event) => setSemester(event.target.value)}>
                <option value="1">1º semestre</option>
                <option value="2">2º semestre</option>
              </select>
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-slate-500">Ano</label>
            <input className="input-field" type="number" value={year} onChange={(event) => setYear(event.target.value)} />
          </div>
          <div className="flex items-end">
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
              <CalendarRange className="mr-2 inline" size={16} />
              {bounds.label}
            </div>
          </div>
        </div>
      </section>

      {feedback ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {feedback}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Mensagens enviadas"
          value={summary.totalMessages}
          helper={`${summary.totalUnique} contato(s) único(s)`}
          tone="blue"
          icon={BarChart3}
        />
        <MetricCard
          title="Taxa de resposta"
          value={pctText(summary.responses, summary.totalMessages)}
          helper={`${summary.responses} de ${summary.totalMessages} mensagens foram respondidas`}
          tone="green"
          icon={TrendingUp}
        />
        <MetricCard
          title="Taxa de agendamento"
          value={pctText(summary.scheduled, summary.totalMessages)}
          helper={`${summary.scheduled} de ${summary.totalMessages} geraram agendamento`}
          tone="purple"
          icon={Target}
        />
        <MetricCard
          title="Recolhimento final"
          value={pctText(summary.collected, summary.scheduledDue)}
          helper={`${summary.collected} de ${summary.scheduledDue} até ${summary.cutoffLabel}; ${summary.scheduledFuture} hoje/futuros`}
          tone="orange"
          icon={Funnel}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Visão geral</h2>
          <p className="mt-1 text-sm text-slate-500">Em relação ao total de mensagens enviadas no período.</p>
          <div className="mt-6 space-y-5">
            <FunnelBar label="Clientes que responderam" value={summary.responses} total={summary.totalMessages} tone="bg-emerald-500" />
            <FunnelBar label="Clientes que agendaram" value={summary.scheduled} total={summary.totalMessages} tone="bg-violet-500" />
            <FunnelBar label={`Recolhimento até ${summary.cutoffLabel}`} value={summary.collected} total={summary.scheduledDue} tone="bg-orange-500" />
          </div>
          <div className="mt-5 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-800">
            {summary.collected} recolhidos sobre {summary.scheduledDue} agendamentos até {summary.cutoffLabel}.
            {" "}
            Diferença em aberto: {summary.pendingCollection}. Hoje/futuros: {summary.scheduledFuture}.
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Visão por etapa do funil</h2>
          <p className="mt-1 text-sm text-slate-500">Efetividade depois que o cliente engaja.</p>
          <div className="mt-6 space-y-5">
            <FunnelBar label="Conversão de atendimento" value={summary.scheduled} total={summary.responses} tone="bg-blue-600" />
            <FunnelBar label="Sucesso do técnico/campo" value={summary.collected} total={summary.scheduledDue} tone="bg-emerald-600" />
            <FunnelBar label="Falhas de envio registradas" value={summary.failures} total={summary.totalMessages + summary.failures} tone="bg-red-500" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950">Cidades enviadas</h2>
            <p className="mt-1 text-sm text-slate-500">
              Todas as cidades com mensagens enviadas no período.
            </p>
          </div>
          <select
            className="input-field w-full md:w-40"
            value={cityPageSize}
            onChange={(event) => setCityPageSize(Number(event.target.value))}
          >
            <option value={20}>20 por página</option>
            <option value={30}>30 por página</option>
            <option value={50}>50 por página</option>
            <option value={100}>100 por página</option>
          </select>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[860px] w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Cidade</th>
                <th className="px-4 py-3">Enviadas</th>
                <th className="px-4 py-3">Respostas</th>
                <th className="px-4 py-3">Agendamentos</th>
                <th className="px-4 py-3">Recolhimentos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedCities.length ? paginatedCities.map((item) => (
                <tr key={item.cidade}>
                  <td className="px-4 py-3 font-bold text-slate-900">{item.cidade}</td>
                  <td className="px-4 py-3">{item.enviados}</td>
                  <td className="px-4 py-3">{item.respostas}</td>
                  <td className="px-4 py-3">{item.agendados}</td>
                  <td className="px-4 py-3">{item.recolhidos}</td>
                </tr>
              )) : (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                    {loading ? "Carregando dados..." : "Nenhum dado encontrado para o período."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
          <span>
            Mostrando {summary.byCity.length ? (normalizedCityPage - 1) * cityPageSize + 1 : 0} a{" "}
            {Math.min(normalizedCityPage * cityPageSize, summary.byCity.length)} de {summary.byCity.length} cidades
          </span>
          <div className="flex items-center gap-2">
            <button
              className="btn-secondary px-3 py-2"
              type="button"
              disabled={normalizedCityPage <= 1}
              onClick={() => setCityPage((page) => Math.max(1, page - 1))}
            >
              Anterior
            </button>
            <span className="rounded-xl bg-slate-50 px-3 py-2 font-bold text-slate-700">
              Página {normalizedCityPage} de {cityTotalPages}
            </span>
            <button
              className="btn-secondary px-3 py-2"
              type="button"
              disabled={normalizedCityPage >= cityTotalPages}
              onClick={() => setCityPage((page) => Math.min(cityTotalPages, page + 1))}
            >
              Próxima
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

