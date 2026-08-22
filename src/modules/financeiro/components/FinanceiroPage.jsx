import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Copy,
  Download,
  FileText,
  Landmark,
  Loader2,
  ReceiptText,
  RefreshCw,
  Repeat2,
  Settings,
  TableProperties,
  Trash2,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { ROUTES } from "../../../router/routes";
import ModalShell from "../../../components/ui/ModalShell";
import { addClusterLogo } from "../../../utils/pdfBranding";
import {
  buscarDashboardFinanceiro,
  buscarConfigPlanilhasFinanceiro,
  buscarLogsPlanilhasFinanceiro,
  carregarMockupFinanceiro,
  limparMockupFinanceiro,
  salvarConfigPlanilhasFinanceiro,
  sincronizarPlanilhasFinanceiro,
  testarPlanilhaFinanceiro,
} from "../services/financeiroService";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Filler, Tooltip, Legend);

const FINANCE_FONT_STACK = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

ChartJS.defaults.font.family = FINANCE_FONT_STACK;
ChartJS.defaults.font.weight = "600";
ChartJS.defaults.color = "#334155";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

const ICONS = {
  AlertTriangle,
  BadgeDollarSign,
  CalendarClock,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  Landmark,
  ReceiptText,
  Repeat2,
  Wallet,
};

const PAGE_META = {
  dashboard: {
    title: "Painel Financeiro",
    subtitle: "Acompanhamento diário de indicadores",
  },
  contasPagar: {
    title: "Contas a Pagar",
    subtitle: "Controle de vencimentos, pagamentos e pendências.",
  },
  contasReceber: {
    title: "Contas a Receber",
    subtitle: "Recebíveis, inadimplência e saldo em aberto.",
  },
  faturamento: {
    title: "Faturamento",
    subtitle: "Receita por período, cidade, empresa e produto.",
  },
  notas: {
    title: "Notas",
    subtitle: "Acompanhamento de notas lançadas no financeiro.",
  },
  chamados: {
    title: "Chamados Financeiros",
    subtitle: "Tickets, SLA e produtividade do atendimento financeiro.",
  },
  configuracoes: {
    title: "Configurações Financeiras",
    subtitle: "Metas, categorias, alertas e dados demonstrativos.",
  },
};

const DEFAULT_SHEETS_CONFIG = {
  enabled: false,
  intervalMinutes: 30,
  serviceAccountConfigured: false,
  serviceAccountEmail: "",
  serviceAccountProjectId: "",
  serviceAccountError: "",
  lastRunAt: "",
  lastRunStatus: "",
  lastRunMessage: "",
  nextRunAt: "",
  sources: [
    { id: "contas_pagar", label: "Contas a pagar", enabled: false, spreadsheetId: "", spreadsheetUrl: "", sheetName: "", range: "A:Z", headerRow: 1 },
    { id: "contas_receber", label: "Contas a receber", enabled: false, spreadsheetId: "", spreadsheetUrl: "", sheetName: "", range: "A:Z", headerRow: 1 },
    { id: "faturamento", label: "Faturamento", enabled: false, spreadsheetId: "", spreadsheetUrl: "", sheetName: "", range: "A:Z", headerRow: 1 },
    { id: "notas", label: "Notas", enabled: false, spreadsheetId: "", spreadsheetUrl: "", sheetName: "", range: "A:Z", headerRow: 1 },
  ],
};

function formatValue(value, type = "number") {
  if (type === "currency") return brl.format(Number(value || 0));
  if (type === "percent") return `${decimal.format(Number(value || 0))}%`;
  return integer.format(Number(value || 0));
}

function formatUpdatedAt(value) {
  if (!value) return "Sem atualização";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem atualização";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function trendText(trend, label) {
  if (!trend) return "Sem comparativo";
  const arrow = trend.direction === "up" ? "↑" : "↓";
  return `${arrow} ${decimal.format(Number(trend.percent || 0))}% ${label || ""}`.trim();
}

const EXPORT_OPTIONS = [
  { id: "kpis", label: "Indicadores principais" },
  { id: "billing", label: "Últimos faturamentos" },
  { id: "receivables", label: "Previsão x recebido" },
  { id: "methods", label: "Formas de pagamento" },
  { id: "evolution", label: "Evolução de recebimento" },
  { id: "cities", label: "Top cidades" },
  { id: "alerts", label: "Alertas financeiros" },
  { id: "summary", label: "Resumo operacional" },
  { id: "upcoming", label: "Contas a vencer" },
];

function periodLabel(period) {
  if (period === "today") return "Hoje";
  if (period === "year") return "Ano";
  return "Mês";
}

function sanitizeFileName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function buildFinanceiroRows(data, sectionId) {
  if (sectionId === "billing") {
    return (data?.lastBillings || []).map((item) => [item.label, brl.format(Number(item.value || 0))]);
  }
  if (sectionId === "receivables") {
    return (data?.receivables || []).map((item) => [
      item.label,
      brl.format(Number(item.previsto || 0)),
      brl.format(Number(item.recebido || 0)),
    ]);
  }
  if (sectionId === "methods") {
    const total = (data?.paymentMethods || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
    return (data?.paymentMethods || []).map((item) => [
      item.label,
      brl.format(Number(item.value || 0)),
      `${decimal.format(total ? (Number(item.value || 0) / total) * 100 : 0)}%`,
    ]);
  }
  if (sectionId === "evolution") {
    return (data?.revenueEvolution || []).map((item) => [item.label, brl.format(Number(item.value || 0))]);
  }
  if (sectionId === "cities") {
    return (data?.citiesRanking || []).map((item) => [item.label, brl.format(Number(item.value || 0))]);
  }
  if (sectionId === "alerts") {
    return (data?.alerts || []).map((item) => [item.title, item.description || "-", item.severity || "-"]);
  }
  if (sectionId === "summary") {
    return [
      ["Notas lançadas", integer.format(Number(data?.operationalSummary?.notasLancadas || 0))],
      ["Pagamentos conciliados", integer.format(Number(data?.operationalSummary?.pagamentosConciliados || 0))],
      ["Valor conciliado", brl.format(Number(data?.operationalSummary?.valorConciliado || 0))],
      ["Tickets resolvidos", integer.format(Number(data?.operationalSummary?.ticketsResolvidos || 0))],
      ["Pendências em aberto", integer.format(Number(data?.operationalSummary?.pendenciasAbertas || 0))],
    ];
  }
  if (sectionId === "upcoming") {
    return (data?.upcomingAccounts || []).map((item) => [
      item.vencimento,
      item.nome,
      brl.format(Number(item.valor || 0)),
      String(item.dias ?? "-"),
    ]);
  }
  return [];
}

async function exportFinanceiroPdf(data, selectedSections, period) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  let y = 46;

  const ensureSpace = (height = 30) => {
    if (y + height <= pageHeight - 18) return;
    pdf.addPage();
    y = 18;
  };

  const drawTitle = (title) => {
    ensureSpace(18);
    pdf.setTextColor(15, 23, 42);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(title, margin, y);
    y += 6;
  };

  const drawMiniBars = (items, labelKey = "label", valueKey = "value") => {
    const rows = items.slice(0, 6);
    if (!rows.length) return;
    const max = Math.max(...rows.map((item) => Number(item[valueKey] || 0)), 1);
    rows.forEach((item) => {
      ensureSpace(9);
      const value = Number(item[valueKey] || 0);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(51, 65, 85);
      pdf.text(String(item[labelKey] || "-").slice(0, 34), margin, y);
      pdf.setFillColor(226, 232, 240);
      pdf.roundedRect(margin + 48, y - 4, 60, 3.5, 1, 1, "F");
      pdf.setFillColor(37, 99, 235);
      pdf.roundedRect(margin + 48, y - 4, Math.max(3, (value / max) * 60), 3.5, 1, 1, "F");
      pdf.setTextColor(15, 23, 42);
      pdf.text(brl.format(value), margin + 112, y);
      y += 8;
    });
    y += 2;
  };

  pdf.setFillColor(5, 35, 75);
  pdf.rect(0, 0, pageWidth, 34, "F");
  pdf.setFillColor(249, 115, 22);
  pdf.rect(0, 32, pageWidth, 2, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("Painel Financeiro", margin, 14);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`${periodLabel(period)} · Gerado em ${new Date().toLocaleString("pt-BR")} · Atualizado em ${formatUpdatedAt(data?.updatedAt)}`, margin, 24);
  await addClusterLogo(pdf, { width: 24, height: 12, y: 8, marginRight: 12 });

  if (selectedSections.includes("kpis")) {
    drawTitle("Indicadores principais");
    const kpis = (data?.kpis || []).slice(0, 10);
    const cardWidth = 52;
    const cardHeight = 24;
    kpis.forEach((item, index) => {
      const col = index % 5;
      const row = Math.floor(index / 5);
      const x = margin + col * (cardWidth + 4);
      const cardY = y + row * (cardHeight + 4);
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(x, cardY, cardWidth, cardHeight, 2, 2, "F");
      pdf.setDrawColor(226, 232, 240);
      pdf.roundedRect(x, cardY, cardWidth, cardHeight, 2, 2, "S");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(6.8);
      pdf.setTextColor(71, 85, 105);
      pdf.text(`${index + 1}. ${item.title}`.slice(0, 38), x + 3, cardY + 6);
      pdf.setFontSize(12);
      pdf.setTextColor(15, 23, 42);
      pdf.text(formatValue(item.value, item.type), x + 3, cardY + 15);
      pdf.setFontSize(6.5);
      pdf.setTextColor(item.trend?.status === "negative" ? 220 : 22, item.trend?.status === "negative" ? 38 : 163, item.trend?.status === "negative" ? 38 : 74);
      pdf.text(trendText(item.trend, item.trendLabel).slice(0, 30), x + 3, cardY + 21);
    });
    y += kpis.length > 5 ? 58 : 30;
  }

  const tableConfigs = {
    billing: { title: "Últimos faturamentos do mês", head: [["Data", "Faturamento"]] },
    receivables: { title: "Previsão de contas a receber / recebidas", head: [["Dia", "Previsto", "Recebido"]] },
    methods: { title: "Recebimentos por forma de pagamento", head: [["Forma", "Valor", "Participação"]] },
    evolution: { title: "Evolução do recebimento no mês", head: [["Data", "Recebido acumulado"]] },
    cities: { title: "Top cidades por faturamento", head: [["Cidade", "Faturamento"]] },
    alerts: { title: "Alertas financeiros", head: [["Alerta", "Descrição", "Severidade"]] },
    summary: { title: "Resumo operacional do dia", head: [["Indicador", "Valor"]] },
    upcoming: { title: "Contas a vencer", head: [["Vencimento", "Cliente / Grupo", "Valor", "Dias"]] },
  };

  Object.entries(tableConfigs).forEach(([sectionId, config]) => {
    if (!selectedSections.includes(sectionId)) return;
    const body = buildFinanceiroRows(data, sectionId);
    drawTitle(config.title);
    if (["billing", "evolution", "cities"].includes(sectionId)) {
      const source = sectionId === "billing" ? data?.lastBillings : sectionId === "evolution" ? data?.revenueEvolution : data?.citiesRanking;
      drawMiniBars(source || []);
    }
    autoTable(pdf, {
      startY: y,
      head: config.head,
      body: body.length ? body : [["Nenhum dado encontrado", "", "", ""].slice(0, config.head[0].length)],
      theme: "grid",
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2.2, overflow: "linebreak" },
      headStyles: { fillColor: [5, 35, 75], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    y = (pdf.lastAutoTable?.finalY || y) + 9;
  });

  const pages = pdf.internal.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setFillColor(248, 250, 252);
    pdf.rect(0, pageHeight - 12, pageWidth, 12, "F");
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text("Sistema de Retiradas | Cluster MG", margin, pageHeight - 5);
    pdf.text(`Página ${page} de ${pages}`, pageWidth - margin, pageHeight - 5, { align: "right" });
  }

  pdf.save(`painel-financeiro-${sanitizeFileName(periodLabel(period))}.pdf`);
}

function ExportFinanceiroModal({ data, period, onClose }) {
  const [selected, setSelected] = useState(() => EXPORT_OPTIONS.map((item) => item.id));
  const [generating, setGenerating] = useState(false);

  const toggle = (id) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const handleExport = async () => {
    setGenerating(true);
    try {
      await exportFinanceiroPdf(data, selected, period);
      onClose();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ModalShell
      title="Exportar visão geral"
      description="Selecione quais blocos do painel financeiro devem entrar no PDF."
      size="3xl"
      onClose={onClose}
      icon={<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Download size={22} /></span>}
      footer={(
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => setSelected(EXPORT_OPTIONS.map((item) => item.id))} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">
            Selecionar todos
          </button>
          <button type="button" onClick={handleExport} disabled={!selected.length || generating} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
            {generating ? <Loader2 className="animate-spin" size={17} /> : <Download size={17} />}
            {generating ? "Gerando..." : "Gerar PDF"}
          </button>
        </div>
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {EXPORT_OPTIONS.map((option) => (
          <label key={option.id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50">
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              onChange={() => toggle(option.id)}
              className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            {option.label}
          </label>
        ))}
      </div>
    </ModalShell>
  );
}

function FinancialKpiCard({ item, loading, index }) {
  const Icon = ICONS[item.icon] || BadgeDollarSign;
  const positive = item.trend?.status === "positive";
  const negative = item.trend?.status === "negative";
  const accentClasses = negative
    ? "from-orange-50/80 via-white to-white text-orange-600 ring-orange-100"
    : "from-blue-50/90 via-white to-white text-blue-700 ring-blue-100";
  return (
    <article className="group relative min-h-[132px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_42px_rgba(37,99,235,0.13)]">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${negative ? "from-orange-500 to-amber-300" : "from-blue-600 to-cyan-300"}`} />
      <div className="flex items-start gap-3">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ring-1 ${accentClasses}`}>
          <Icon size={25} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 min-h-8 text-[12px] font-bold leading-tight text-slate-950">
            {typeof index === "number" ? `${index + 1}. ` : ""}{item.title}
          </p>
          {loading ? (
            <div className="mt-3 h-7 w-28 animate-pulse rounded-lg bg-slate-100" />
          ) : (
            <p className="mt-3 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(1.15rem,1.25vw,1.55rem)] font-bold leading-none tracking-tight text-slate-950">
              {formatValue(item.value, item.type)}
            </p>
          )}
          <p className={`mt-3 inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${positive ? "bg-emerald-50 text-emerald-700" : negative ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-500"}`}>
            {trendText(item.trend, item.trendLabel)}
          </p>
          {item.helper ? <p className="mt-1 text-xs font-bold text-slate-500">{item.helper}</p> : null}
        </div>
      </div>
    </article>
  );
}

function EmptyState({ text = "Nenhum dado encontrado para o período selecionado." }) {
  return (
    <div className="flex min-h-44 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
      {text}
    </div>
  );
}

function CardFooterLink({ to, children }) {
  return (
    <Link to={to} className="mt-auto flex min-h-11 items-center justify-between rounded-xl border-t border-slate-100 pt-3 text-sm font-bold text-blue-700 hover:text-blue-800">
      <span>{children}</span>
      <ArrowRight size={18} />
    </Link>
  );
}

function FinancePanel({ title, children, actionTo, actionLabel, className = "" }) {
  return (
    <section className={`flex h-full min-h-[320px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title ? <h2 className="text-sm font-bold text-slate-950">{title}</h2> : null}
      {children}
      {actionTo ? <CardFooterLink to={actionTo}>{actionLabel}</CardFooterLink> : null}
    </section>
  );
}

function ChartCard({ title, children, empty, actionTo, actionLabel, headerExtra }) {
  return (
    <section className="flex h-full min-h-[360px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-950">{title}</h2>
        {headerExtra}
      </div>
      {empty ? <EmptyState /> : <div className="min-h-[250px] flex-1">{children}</div>}
      {actionTo ? <CardFooterLink to={actionTo}>{actionLabel}</CardFooterLink> : null}
    </section>
  );
}

function barOptions(formatter = brl.format) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, labels: { boxWidth: 10, font: { weight: "bold" } } },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${formatter(Number(context.raw || 0))}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: { ticks: { callback: (value) => formatter(Number(value)) } },
    },
  };
}

function DashboardContent({ data, loading }) {
  const hasData = data?.source && data.source !== "empty";
  const billingChart = useMemo(() => ({
    labels: (data?.lastBillings || []).map((item) => item.label),
    datasets: [{ label: "Faturamento", data: (data?.lastBillings || []).map((item) => item.value), backgroundColor: "#2563eb", borderRadius: 10 }],
  }), [data?.lastBillings]);
  const receivablesChart = useMemo(() => ({
    labels: (data?.receivables || []).map((item) => item.label),
    datasets: [
      { label: "Previsto", data: (data?.receivables || []).map((item) => item.previsto), backgroundColor: "#1d4ed8", borderRadius: 10 },
      { label: "Recebido", data: (data?.receivables || []).map((item) => item.recebido), backgroundColor: "#f97316", borderRadius: 10 },
    ],
  }), [data?.receivables]);
  const methodsChart = useMemo(() => ({
    labels: (data?.paymentMethods || []).map((item) => item.label),
    datasets: [{ data: (data?.paymentMethods || []).map((item) => item.value), backgroundColor: ["#1d4ed8", "#f97316", "#10b981", "#8b5cf6", "#64748b"], borderWidth: 0 }],
  }), [data?.paymentMethods]);
  const paymentTotal = useMemo(
    () => (data?.paymentMethods || []).reduce((sum, item) => sum + Number(item.value || 0), 0),
    [data?.paymentMethods],
  );
  const evolutionChart = useMemo(() => ({
    labels: (data?.revenueEvolution || []).map((item) => item.label),
    datasets: [{
      label: "Recebido acumulado",
      data: (data?.revenueEvolution || []).map((item) => item.value),
      borderColor: "#2563eb",
      backgroundColor: "rgba(37, 99, 235, 0.12)",
      fill: true,
      tension: 0.35,
    }],
  }), [data?.revenueEvolution]);
  const revenueTotal = Number((data?.revenueEvolution || []).at(-1)?.value || 0);

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {(data?.kpis || Array.from({ length: 10 }, (_, index) => ({ id: `loading-${index}`, title: "Indicador", value: 0 }))).map((item, index) => (
          <FinancialKpiCard key={item.id} item={item} loading={loading} index={index} />
        ))}
      </section>

      {!hasData && !loading ? (
        <EmptyState text="Nenhum dado financeiro real disponível. Use Financeiro > Configurações > Carregar mockup para visualizar o layout com dados demonstrativos." />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-4">
        <ChartCard title="Últimos 5 faturamentos do mês" empty={!data?.lastBillings?.length} actionTo={ROUTES.FINANCEIRO_FATURAMENTO} actionLabel="Ver faturamento">
          <Bar data={billingChart} options={barOptions()} />
        </ChartCard>
        <ChartCard title="Previsão de contas a receber / Recebidas" empty={!data?.receivables?.length} actionTo={ROUTES.FINANCEIRO_CONTAS_RECEBER} actionLabel="Ver contas a receber">
          <Bar data={receivablesChart} options={barOptions()} />
        </ChartCard>
        <ChartCard title="Recebimentos por forma de pagamento" empty={!data?.paymentMethods?.length} actionTo={ROUTES.FINANCEIRO_CONTAS_RECEBER} actionLabel="Ver formas de pagamento">
          <div className="grid h-full min-h-[250px] items-center gap-4 md:grid-cols-[0.9fr_1.1fr]">
            <div className="h-[240px]">
              <Doughnut
                data={methodsChart}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: "62%",
                  plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${brl.format(Number(ctx.raw || 0))}` } },
                  },
                }}
              />
            </div>
            <div className="space-y-3">
              {(data?.paymentMethods || []).map((method, index) => {
                const colors = ["#1d4ed8", "#f97316", "#10b981", "#8b5cf6", "#64748b"];
                const percent = paymentTotal ? (Number(method.value || 0) / paymentTotal) * 100 : 0;
                return (
                  <div key={method.label} className="flex items-start gap-3">
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-950">{method.label}</p>
                      <p className="text-xs font-bold text-slate-600">{brl.format(Number(method.value || 0))} ({decimal.format(percent)}%)</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ChartCard>
        <ChartCard
          title="Evolução do recebimento no mês"
          empty={!data?.revenueEvolution?.length}
          actionTo={ROUTES.FINANCEIRO_CONTAS_RECEBER}
          actionLabel="Ver evolução completa"
          headerExtra={revenueTotal ? (
            <span className="rounded-xl bg-blue-50 px-3 py-2 text-right text-xs font-bold text-blue-700">
              Total do mês<br />{brl.format(revenueTotal)}
            </span>
          ) : null}
        >
          <Line data={evolutionChart} options={barOptions()} />
        </ChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        <FinancePanel title="Top cidades por faturamento" actionTo={ROUTES.FINANCEIRO_FATURAMENTO} actionLabel="Ver todas as cidades">
          <div className="mt-4 flex flex-1 flex-col justify-between gap-3">
            {(data?.citiesRanking || []).length ? data.citiesRanking.map((city) => {
              const max = Math.max(...data.citiesRanking.map((item) => Number(item.value || 0)), 1);
              return (
                <div key={city.label} className="grid grid-cols-[minmax(90px,1fr)_minmax(80px,1fr)_auto] items-center gap-3 text-xs font-bold">
                  <span className="truncate text-slate-700">{city.label}</span>
                  <div className="h-3 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(8, (Number(city.value || 0) / max) * 100)}%` }} />
                  </div>
                  <span className="whitespace-nowrap text-slate-950">{brl.format(city.value)}</span>
                </div>
              );
            }) : <EmptyState />}
          </div>
        </FinancePanel>
        <FinancePanel title="Alertas financeiros" actionTo={ROUTES.FINANCEIRO_CONTAS_RECEBER} actionLabel="Ver todos os alertas">
          <div className="mt-4 flex flex-1 flex-col gap-3">
            {(data?.alerts || []).length ? data.alerts.map((alert) => (
              <div key={alert.id} className={`flex-1 rounded-2xl border p-3 ${alert.severity === "critical" ? "border-red-200 bg-red-50" : alert.severity === "warning" ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}`}>
                <p className="text-sm font-bold text-slate-950">{alert.title}</p>
                <p className="mt-1 text-xs font-bold text-slate-600">{alert.description}</p>
              </div>
            )) : <EmptyState />}
          </div>
        </FinancePanel>
        <FinancePanel title="Resumo operacional do dia" actionTo={ROUTES.FINANCEIRO_CHAMADOS} actionLabel="Ver relatório completo">
          <dl className="mt-4 flex flex-1 flex-col justify-between divide-y divide-slate-100">
            {[
              ["Notas lançadas", data?.operationalSummary?.notasLancadas],
              ["Pagamentos conciliados", data?.operationalSummary?.pagamentosConciliados],
              ["Valor conciliado", brl.format(Number(data?.operationalSummary?.valorConciliado || 0))],
              ["Tickets resolvidos", data?.operationalSummary?.ticketsResolvidos],
              ["Pendências em aberto", data?.operationalSummary?.pendenciasAbertas],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 py-3">
                <dt className="text-xs font-bold text-slate-600">{label}</dt>
                <dd className="whitespace-nowrap text-sm font-bold text-slate-950">{value || 0}</dd>
              </div>
            ))}
          </dl>
        </FinancePanel>
        <FinancePanel title="Contas a vencer" actionTo={ROUTES.FINANCEIRO_CONTAS_PAGAR} actionLabel="Ver todas as contas a vencer">
          <div className="mt-4 flex-1">
            <table className="w-full table-fixed text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                <tr>
                  <th className="w-[26%] px-2 py-3">Vencimento</th>
                  <th className="w-[34%] px-2 py-3">Cliente / Grupo</th>
                  <th className="w-[25%] px-2 py-3">Valor</th>
                  <th className="w-[15%] px-2 py-3 text-center">Dias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.upcomingAccounts || []).length ? data.upcomingAccounts.map((row) => (
                  <tr key={row.id}>
                    <td className="px-2 py-3 font-bold text-slate-700">{row.vencimento}</td>
                    <td className="px-2 py-3 font-bold text-slate-900">{row.nome}</td>
                    <td className="px-2 py-3 font-bold text-slate-950">{brl.format(Number(row.valor || 0))}</td>
                    <td className="px-2 py-3 text-center font-bold text-slate-700">{row.dias}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4}><EmptyState /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </FinancePanel>
      </section>
    </>
  );
}

function SectionPage({ page }) {
  const cards = {
    contasPagar: ["Total a pagar", "Vence hoje", "Vence esta semana", "Vencidas", "Pagas no mês"],
    contasReceber: ["Total a receber", "Receber hoje", "Recebido hoje", "Vencidos", "Inadimplência"],
    faturamento: ["Faturamento do mês", "Mês anterior", "Crescimento", "Receita recorrente", "Receita não recorrente"],
    notas: ["Notas hoje", "Notas no mês", "Pendentes", "Com erro", "Valor total"],
    chamados: ["Abertos", "Em andamento", "Encerrados no mês", "SLA vencido", "Tempo médio"],
  }[page] || [];
  return (
    <>
      <section className="grid gap-4 md:grid-cols-5">
        {cards.map((card) => <FinancialKpiCard key={card} item={{ title: card, value: 0, type: "number", icon: "BadgeDollarSign" }} />)}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Estrutura preparada</h2>
        <p className="mt-2 text-sm font-semibold text-slate-500">
          Esta página já está integrada ao menu, RBAC e layout do sistema. A tabela e os filtros estão preparados para receber dados reais da integração financeira.
        </p>
        <EmptyState text="Nenhum dado real integrado ainda." />
      </section>
    </>
  );
}

function ConfiguracoesPage({ data, onMockup, onClearMockup, loadingAction, canManage }) {
  const [sheetsConfig, setSheetsConfig] = useState(DEFAULT_SHEETS_CONFIG);
  const [logs, setLogs] = useState([]);
  const [sheetsLoading, setSheetsLoading] = useState(true);
  const [sheetsAction, setSheetsAction] = useState("");
  const [sheetsMessage, setSheetsMessage] = useState("");

  const loadSheetsConfig = useCallback(async () => {
    setSheetsLoading(true);
    setSheetsMessage("");
    try {
      const [config, logsResponse] = await Promise.all([
        buscarConfigPlanilhasFinanceiro(),
        buscarLogsPlanilhasFinanceiro(8).catch(() => ({ items: [] })),
      ]);
      setSheetsConfig({ ...DEFAULT_SHEETS_CONFIG, ...config, sources: config.sources || DEFAULT_SHEETS_CONFIG.sources });
      setLogs(logsResponse.items || []);
    } catch (error) {
      setSheetsMessage(error?.message || "Não foi possível carregar a configuração das planilhas.");
    } finally {
      setSheetsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSheetsConfig();
  }, [loadSheetsConfig]);

  const updateSource = (sourceId, field, value) => {
    setSheetsConfig((current) => ({
      ...current,
      sources: (current.sources || []).map((source) =>
        source.id === sourceId ? { ...source, [field]: value } : source,
      ),
    }));
  };

  const handleSaveSheets = async () => {
    setSheetsAction("save");
    setSheetsMessage("");
    try {
      const response = await salvarConfigPlanilhasFinanceiro(sheetsConfig);
      setSheetsConfig({ ...DEFAULT_SHEETS_CONFIG, ...response.config, sources: response.config?.sources || DEFAULT_SHEETS_CONFIG.sources });
      setSheetsMessage("Configuração das Google Planilhas salva.");
    } catch (error) {
      setSheetsMessage(error?.message || "Falha ao salvar a configuração das planilhas.");
    } finally {
      setSheetsAction("");
    }
  };

  const handleSyncSheets = async () => {
    setSheetsAction("sync");
    setSheetsMessage("");
    try {
      const response = await sincronizarPlanilhasFinanceiro();
      setSheetsConfig({ ...DEFAULT_SHEETS_CONFIG, ...response.config, sources: response.config?.sources || DEFAULT_SHEETS_CONFIG.sources });
      setSheetsMessage(response.message || "Leitura das planilhas concluída.");
      await loadSheetsConfig();
    } catch (error) {
      setSheetsMessage(error?.message || "Falha ao ler as planilhas financeiras.");
    } finally {
      setSheetsAction("");
    }
  };

  const handleTestSource = async (sourceId) => {
    setSheetsAction(`test:${sourceId}`);
    setSheetsMessage("");
    try {
      const saved = await salvarConfigPlanilhasFinanceiro(sheetsConfig);
      setSheetsConfig({ ...DEFAULT_SHEETS_CONFIG, ...saved.config, sources: saved.config?.sources || DEFAULT_SHEETS_CONFIG.sources });
      const response = await testarPlanilhaFinanceiro(sourceId);
      const totalRows = response.result?.totalRows ?? 0;
      setSheetsMessage(`Teste concluído: ${totalRows} linha(s) lida(s) na origem selecionada.`);
    } catch (error) {
      setSheetsMessage(error?.message || "Falha ao testar a planilha.");
    } finally {
      setSheetsAction("");
    }
  };

  const handleCopyServiceAccount = async () => {
    const email = sheetsConfig.serviceAccountEmail || "";
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setSheetsMessage("E-mail da Service Account copiado.");
    } catch {
      setSheetsMessage("Não foi possível copiar automaticamente. Selecione o e-mail e copie manualmente.");
    }
  };

  return (
    <section className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Settings size={20} /></span>
            <div>
              <h2 className="text-lg font-bold text-slate-950">Dados demonstrativos</h2>
              <p className="text-sm font-semibold text-slate-500">Use mockup para validar o layout antes da integração real.</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={onMockup} disabled={!canManage || loadingAction} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              {loadingAction === "mockup" ? <Loader2 className="animate-spin" size={17} /> : <BadgeDollarSign size={17} />} Carregar mockup
            </button>
            <button type="button" onClick={onClearMockup} disabled={!canManage || loadingAction} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-50">
              {loadingAction === "clear" ? <Loader2 className="animate-spin" size={17} /> : <Trash2 size={17} />} Limpar mockup
            </button>
          </div>
          {!canManage ? <p className="mt-3 text-xs font-bold text-amber-700">Você pode visualizar, mas precisa de permissão de gerenciamento para alterar dados de mockup.</p> : null}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Status atual</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="text-xs font-bold uppercase text-slate-500">Origem dos dados</dt>
              <dd className="mt-1 text-xl font-bold text-slate-950">{data?.source === "mockup" ? "Mockup" : "Sem dados reais"}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="text-xs font-bold uppercase text-slate-500">Última atualização</dt>
              <dd className="mt-1 text-xl font-bold text-slate-950">{formatUpdatedAt(data?.updatedAt)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><TableProperties size={20} /></span>
            <div>
              <h2 className="text-lg font-bold text-slate-950">Google Planilhas</h2>
              <p className="text-sm font-semibold text-slate-500">Configure a leitura automática das planilhas financeiras a cada intervalo definido.</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                Service Account: {sheetsConfig.serviceAccountConfigured ? "configurada" : "não configurada"} · Última leitura: {formatUpdatedAt(sheetsConfig.lastRunAt)} · Próxima: {formatUpdatedAt(sheetsConfig.nextRunAt)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={loadSheetsConfig} disabled={sheetsLoading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw size={16} className={sheetsLoading ? "animate-spin" : ""} /> Atualizar
            </button>
            <button type="button" onClick={handleSaveSheets} disabled={!canManage || Boolean(sheetsAction)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              {sheetsAction === "save" ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} Salvar
            </button>
            <button type="button" onClick={handleSyncSheets} disabled={!canManage || Boolean(sheetsAction)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {sheetsAction === "sync" ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />} Ler agora
            </button>
          </div>
        </div>

        {sheetsMessage ? <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-800">{sheetsMessage}</div> : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-[260px_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-center justify-between gap-3 text-sm font-bold text-slate-900">
              <span>Automação ativa</span>
              <input type="checkbox" checked={Boolean(sheetsConfig.enabled)} disabled={!canManage} onChange={(event) => setSheetsConfig((current) => ({ ...current, enabled: event.target.checked }))} className="h-5 w-5 rounded border-slate-300 text-blue-600" />
            </label>
            <label className="mt-4 block text-xs font-bold uppercase text-slate-500">
              Intervalo de leitura
              <input
                type="number"
                min="5"
                max="1440"
                value={sheetsConfig.intervalMinutes || 30}
                disabled={!canManage}
                onChange={(event) => setSheetsConfig((current) => ({ ...current, intervalMinutes: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <p className="mt-3 text-xs font-semibold text-slate-500">A planilha precisa ser compartilhada com o e-mail da Service Account usada no Google Drive.</p>
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Usuário de leitura</p>
              <p className="mt-1 break-all text-sm font-black text-slate-950">
                {sheetsConfig.serviceAccountEmail || "Service Account não identificada"}
              </p>
              {sheetsConfig.serviceAccountProjectId ? (
                <p className="mt-1 break-all text-xs font-bold text-emerald-800">Projeto: {sheetsConfig.serviceAccountProjectId}</p>
              ) : null}
              {sheetsConfig.serviceAccountError ? (
                <p className="mt-2 text-xs font-bold text-red-700">{sheetsConfig.serviceAccountError}</p>
              ) : (
                <p className="mt-2 text-xs font-semibold text-emerald-800">Compartilhe cada planilha com este e-mail como Leitor.</p>
              )}
              <button
                type="button"
                onClick={handleCopyServiceAccount}
                disabled={!sheetsConfig.serviceAccountEmail}
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy size={14} /> Copiar e-mail
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {(sheetsConfig.sources || []).map((source) => (
              <div key={source.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <label className="flex items-center gap-3 text-sm font-bold text-slate-950">
                    <input type="checkbox" checked={Boolean(source.enabled)} disabled={!canManage} onChange={(event) => updateSource(source.id, "enabled", event.target.checked)} className="h-5 w-5 rounded border-slate-300 text-blue-600" />
                    {source.label}
                  </label>
                  <button type="button" disabled={!canManage || Boolean(sheetsAction)} onClick={() => handleTestSource(source.id)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    {sheetsAction === `test:${source.id}` ? <Loader2 className="animate-spin" size={14} /> : <TableProperties size={14} />} Testar
                  </button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="text-xs font-bold uppercase text-slate-500">
                    ID ou link da planilha
                    <input value={source.spreadsheetUrl ?? source.spreadsheetId ?? ""} disabled={!canManage} onChange={(event) => updateSource(source.id, "spreadsheetUrl", event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
                  </label>
                  <label className="text-xs font-bold uppercase text-slate-500">
                    Aba
                    <input value={source.sheetName || ""} disabled={!canManage} onChange={(event) => updateSource(source.id, "sheetName", event.target.value)} placeholder="Ex: Agosto" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
                  </label>
                  <label className="text-xs font-bold uppercase text-slate-500">
                    Range
                    <input value={source.range || "A:Z"} disabled={!canManage} onChange={(event) => updateSource(source.id, "range", event.target.value)} placeholder="A:Z" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
                  </label>
                  <label className="text-xs font-bold uppercase text-slate-500">
                    Linha do cabeçalho
                    <input type="number" min="1" value={source.headerRow || 1} disabled={!canManage} onChange={(event) => updateSource(source.id, "headerRow", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
                  </label>
                </div>
                <p className="mt-3 text-xs font-bold text-slate-500">
                  Última leitura: {formatUpdatedAt(source.lastReadAt)} · Status: {source.lastStatus || "-"} · Linhas: {source.lastRows || 0} · {source.lastMessage || "Sem leitura ainda."}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-bold text-slate-950">Últimos logs de leitura</h3>
          <div className="mt-3 divide-y divide-slate-200">
            {logs.length ? logs.map((item) => (
              <div key={item.id} className="flex flex-col gap-1 py-3 text-xs font-bold text-slate-600 md:flex-row md:items-center md:justify-between">
                <span>{formatUpdatedAt(item.createdAt)} · {item.status}</span>
                <span className="text-slate-900">{item.message}</span>
              </div>
            )) : <p className="py-4 text-sm font-bold text-slate-500">Nenhum log de leitura registrado.</p>}
          </div>
        </div>
      </section>
    </section>
  );
}

export default function FinanceiroPage({ page = "dashboard" }) {
  const { currentUser } = useAuthContext();
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState("");
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const meta = PAGE_META[page] || PAGE_META.dashboard;
  const canManage = hasPermission(currentUser, "financeiro.configuracoes.manage");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await buscarDashboardFinanceiro({ period });
      setData(response.data);
    } catch (error) {
      setMessage(error?.message || "Não foi possível carregar os dados financeiros.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const handleMockup = async () => {
    setLoadingAction("mockup");
    setMessage("");
    try {
      const response = await carregarMockupFinanceiro();
      setData(response.data);
      setMessage("Mockup financeiro carregado.");
    } catch (error) {
      setMessage(error?.message || "Falha ao carregar mockup financeiro.");
    } finally {
      setLoadingAction("");
    }
  };

  const handleClearMockup = async () => {
    setLoadingAction("clear");
    setMessage("");
    try {
      const response = await limparMockupFinanceiro();
      setData(response.data);
      setMessage("Mockup financeiro removido.");
    } catch (error) {
      setMessage(error?.message || "Falha ao limpar mockup financeiro.");
    } finally {
      setLoadingAction("");
    }
  };

  return (
    <main className="space-y-5" style={{ fontFamily: FINANCE_FONT_STACK }}>
      <header>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-950 md:text-4xl">{meta.title}</h1>
            <p className="mt-1 text-base font-semibold text-slate-600">{meta.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <span className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-50 px-3 text-xs font-bold text-slate-500">
              <CalendarClock size={18} className="text-slate-700" />
              <span>
                <span className="block leading-tight">Última atualização:</span>
                <span className="block text-sm text-slate-950">{formatUpdatedAt(data?.updatedAt)}</span>
              </span>
            </span>
            <div className="flex overflow-hidden rounded-xl border border-slate-200">
              {["today", "month", "year"].map((option) => (
                <button key={option} type="button" onClick={() => setPeriod(option)} className={`min-h-11 px-5 text-sm font-bold ${period === option ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50"}`}>
                  {option === "today" ? "Hoje" : option === "month" ? "Mês" : "Ano"}
                </button>
              ))}
            </div>
            {page === "dashboard" ? (
              <button
                type="button"
                onClick={() => setExportModalOpen(true)}
                disabled={loading || !data}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                <Download size={16} /> Exportar
              </button>
            ) : null}
            <button type="button" onClick={load} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Atualizar
            </button>
          </div>
        </div>
      </header>
      {message ? <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800">{message}</div> : null}
      {page === "dashboard" ? <DashboardContent data={data} loading={loading} /> : null}
      {exportModalOpen ? <ExportFinanceiroModal data={data} period={period} onClose={() => setExportModalOpen(false)} /> : null}
      {["contasPagar", "contasReceber", "faturamento", "notas", "chamados"].includes(page) ? <SectionPage page={page} /> : null}
      {page === "configuracoes" ? (
        <ConfiguracoesPage
          data={data}
          canManage={canManage}
          loadingAction={loadingAction}
          onMockup={handleMockup}
          onClearMockup={handleClearMockup}
        />
      ) : null}
    </main>
  );
}

