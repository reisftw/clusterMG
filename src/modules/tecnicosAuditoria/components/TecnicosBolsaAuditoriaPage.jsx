import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  ChevronDown,
  Clock,
  Download,
  CalendarDays,
  Mail,
  PackageSearch,
  RefreshCw,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import ModalShell from "../../../components/ui/ModalShell";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { addClusterLogo } from "../../../utils/pdfBranding";
import {
  atualizarBolsaTecnico,
  atualizarTodasBolsas,
  buscarAuditoriaBolsaTecnico,
  buscarConfiguracaoAuditoriaBolsa,
  buscarJobAuditoriaBolsa,
  buscarLogsAuditoriaBolsa,
  salvarConfiguracaoAuditoriaBolsa,
} from "../services/bolsaTecnicoAuditoriaService";

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";
const JOB_POLL_INTERVAL_MS = 500;
const JOB_TIMEOUT_MS = 45 * 60 * 1000;
const CATEGORY_ORDER = [
  { id: "cabos", label: "Cabos" },
  { id: "ont_onu", label: "Ont e Onu" },
  { id: "roteadores", label: "Roteadores" },
  { id: "cameras", label: "Câmeras" },
  { id: "insumos", label: "Insumos" },
];
const CAMERA_TERMS = ["camera", "câmera", "camera de video", "câmera de vídeo", "video wi-fi", "vídeo wi-fi", "im5", "imxc", "tapo", "tc60"];

function normalizeCategoryText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getVisualCategoryId(item = {}) {
  const name = normalizeCategoryText(item.nome);
  if (CAMERA_TERMS.some((term) => name.includes(normalizeCategoryText(term)))) return "cameras";
  return item.categoria || "insumos";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function formatDayLabel(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}`;
}

function formatQuantity(item) {
  const value = Number(item?.quantidade || 0);
  const formatted = Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return `${formatted} ${item?.unidade || (item?.tipo === "metragem" ? "m" : "un")}`;
}

function metricValue(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? number : number.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatConsumptionAmount(row = {}) {
  const unidades = Number(row.unidades || 0);
  const metros = Number(row.metros || 0);
  if (metros > 0 && unidades <= 0) return `${metricValue(metros)} m`;
  if (unidades > 0 && metros <= 0) return `${metricValue(unidades)} un`;
  if (unidades > 0 && metros > 0) return `${metricValue(unidades)} un · ${metricValue(metros)} m`;
  return "0";
}

function groupItemsByCategory(items = []) {
  const groups = new Map(CATEGORY_ORDER.map((category) => [category.id, { ...category, items: [], unidades: 0, metros: 0 }]));
  items.forEach((item) => {
    const id = getVisualCategoryId(item);
    const group = groups.get(id) || groups.get("insumos");
    group.items.push(item);
    if (item.tipo === "metragem") group.metros += Number(item.quantidade || 0);
    else group.unidades += Number(item.quantidade || 0);
  });
  return [...groups.values()];
}

function canManage(user) {
  return hasPermission(user, "tecnicos.auditoria_bolsa.manage");
}

async function pollRefreshJob(jobId, onProgress) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < JOB_TIMEOUT_MS) {
    const job = await buscarJobAuditoriaBolsa(jobId);
    onProgress?.(job);
    if (job.status === "completed") return job.result || job;
    if (job.status === "failed") throw new Error(job.error || "Falha na atualização da API.");
    await wait(JOB_POLL_INTERVAL_MS);
  }
  throw new Error("Tempo limite aguardando atualização da API.");
}

async function exportTecnicoPdf(tecnico) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const snapshot = tecnico.snapshot || {};

  pdf.setFillColor(5, 35, 75);
  pdf.rect(0, 0, 210, 34, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("Auditoria de Bolsa Técnico", 14, 15);
  pdf.setFontSize(10);
  pdf.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 24);
  await addClusterLogo(pdf);
  pdf.setTextColor(15, 23, 42);

  autoTable(pdf, {
    startY: 44,
    head: [["Campo", "Informação"]],
    body: [
      ["Técnico", tecnico.nome],
      ["Empresa", tecnico.empresaNome],
      ["Regional", tecnico.regional || "-"],
      ["E-mail Hubsoft", tecnico.emailHubsoft || "-"],
      ["ID Sênior", snapshot.seniorId || "-"],
      ["Última atualização", formatDate(snapshot.lastUpdatedAt)],
      ["Unidades", metricValue(snapshot.totals?.unidades)],
      ["Metragem", `${metricValue(snapshot.totals?.metros)} m`],
    ],
    theme: "grid",
    headStyles: { fillColor: [37, 99, 235] },
  });

  autoTable(pdf, {
    startY: (pdf.lastAutoTable?.finalY || 90) + 8,
    head: [["Item", "Tipo", "Quantidade", "Diferença desde ontem"]],
    body: (snapshot.items || []).map((item) => [
      item.nome,
      item.tipo === "metragem" ? "Metragem" : "Unidade",
      formatQuantity(item),
      metricValue(item.diferenca),
    ]),
    theme: "striped",
    headStyles: { fillColor: [15, 23, 42] },
    styles: { fontSize: 8 },
  });

  pdf.save(`bolsa-tecnico-${tecnico.nome || "tecnico"}.pdf`.replace(/\s+/g, "-").toLowerCase());
}

function MetricCard({ label, value, helper, tone = "blue" }) {
  const styles = {
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900",
  };
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${styles[tone] || styles.blue}`}>
      <p className="text-xs font-black uppercase tracking-wide opacity-75">{label}</p>
      <p className="mt-2 whitespace-nowrap text-2xl font-black leading-none">{value}</p>
      {helper ? <p className="mt-1 text-xs font-bold opacity-75">{helper}</p> : null}
    </div>
  );
}

function PaginationControls({ page, totalPages, onPageChange, total, pageSize }) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs font-bold text-slate-500">
      <span>
        Mostrando {Math.min(total, (page - 1) * pageSize + 1)} a {Math.min(total, page * pageSize)} de {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 font-black text-slate-700 disabled:opacity-40"
        >
          ‹
        </button>
        <span className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-blue-600 px-3 font-black text-white">
          {page}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 font-black text-slate-700 disabled:opacity-40"
        >
          ›
        </button>
      </div>
    </div>
  );
}

function CategoryItemsAccordion({ items, max }) {
  const [open, setOpen] = useState({});
  const groups = useMemo(() => groupItemsByCategory(items), [items]);

  if (!items.length) {
    return <p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhum item com saldo positivo encontrado.</p>;
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const isOpen = Boolean(open[group.id]);
        return (
          <section key={group.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={() => setOpen((current) => ({ ...current, [group.id]: !isOpen }))}
              className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left"
            >
              <div className="min-w-0">
                <p className="font-black text-slate-950">{group.label}</p>
                <p className="text-xs font-bold text-slate-500">
                  {group.items.length} item(ns) · {formatConsumptionAmount(group)}
                </p>
              </div>
              <ChevronDown size={18} className={`shrink-0 text-slate-500 transition ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen ? (
              <div className="space-y-3 border-t border-slate-200 p-3">
                {group.items.length ? group.items.map((item) => (
                  <div key={item.key} className="rounded-xl border border-slate-100 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 flex-1 break-words font-black text-slate-900">{item.nome}</p>
                      <span className="whitespace-nowrap rounded-full bg-slate-50 px-3 py-1 text-xs font-black text-slate-600">{formatQuantity(item)}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, (Number(item.quantidade || 0) / max) * 100)}%` }} />
                    </div>
                    <p className="mt-2 text-xs font-bold text-slate-500">
                      Diferença desde a leitura anterior: {metricValue(item.diferenca)} {item.unidade}
                    </p>
                  </div>
                )) : (
                  <p className="rounded-xl bg-white p-3 text-sm font-bold text-slate-500">
                    Nenhum material nesta categoria.
                  </p>
                )}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function MonthlyHistoryTable({ rows = [] }) {
  const pageSize = 8;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  if (!rows.length) {
    return <p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhuma movimentação mensal salva para este técnico.</p>;
  }

  return (
    <div>
      <div className="max-h-72 overflow-auto rounded-2xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
            <tr>
              <th className="whitespace-nowrap px-3 py-3">Data</th>
              <th className="whitespace-nowrap px-3 py-3">Tipo</th>
              <th className="whitespace-nowrap px-3 py-3">Item</th>
              <th className="whitespace-nowrap px-3 py-3">Qtd</th>
              <th className="whitespace-nowrap px-3 py-3">Cliente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.map((row) => (
              <tr key={row.id || `${row.numero}-${row.nome}-${row.data}`}>
                <td className="px-3 py-3 font-bold text-slate-700">{formatDate(row.data)}</td>
                <td className="px-3 py-3 font-bold text-slate-700">{row.tipoMovimentacaoLabel || row.tipoMovimentacao || "-"}</td>
                <td className="px-3 py-3 font-bold text-slate-700">{row.nome || "-"}</td>
                <td className="whitespace-nowrap px-3 py-3 font-black text-slate-900">{metricValue(row.quantidade)} {row.unidade || ""}</td>
                <td className="px-3 py-3 font-bold text-slate-700">{row.clienteNome || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationControls page={safePage} totalPages={totalPages} total={rows.length} pageSize={pageSize} onPageChange={setPage} />
    </div>
  );
}

function MonthlyConsumptionList({ title, rows = [], showClients = false }) {
  const pageSize = 6;
  const [page, setPage] = useState(1);
  const [openClients, setOpenClients] = useState({});
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-3 space-y-2">
        {rows.length ? visibleRows.map((row) => {
          const clients = Array.isArray(row.clientes) ? row.clientes : [];
          const isOpen = Boolean(openClients[row.id || row.nome]);
          return (
            <div key={row.id || row.nome} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-black text-slate-900">{row.nome}</p>
                  {row.categoria ? <p className="text-xs font-bold text-slate-500">{row.categoria}</p> : null}
                  {showClients ? (
                    <button
                      type="button"
                      onClick={() => setOpenClients((current) => ({ ...current, [row.id || row.nome]: !isOpen }))}
                      className="mt-1 inline-flex min-h-8 items-center gap-1 rounded-lg text-xs font-black text-blue-700"
                    >
                      {clients.length} cliente(s) <ChevronDown size={14} className={isOpen ? "rotate-180 transition" : "transition"} />
                    </button>
                  ) : null}
                </div>
                <p className="shrink-0 text-right font-black text-slate-900">
                  {formatConsumptionAmount(row)}
                </p>
              </div>
              {showClients && isOpen ? (
                <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                  {clients.length ? clients.map((cliente) => (
                    <div key={cliente.key || cliente.nome} className="rounded-lg bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words text-xs font-black text-slate-900">{cliente.nome}</p>
                          {cliente.codigo ? <p className="text-[11px] font-bold text-slate-500">Código {cliente.codigo}</p> : null}
                        </div>
                        <p className="shrink-0 text-right text-xs font-black text-slate-800">
                          {formatConsumptionAmount(cliente)}
                        </p>
                      </div>
                    </div>
                  )) : (
                    <p className="rounded-lg bg-white p-3 text-xs font-bold text-slate-500">Nenhum cliente identificado.</p>
                  )}
                </div>
              ) : null}
            </div>
          );
        }) : (
          <p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">Nenhum gasto mensal confirmado.</p>
        )}
      </div>
      <PaginationControls page={safePage} totalPages={totalPages} total={rows.length} pageSize={pageSize} onPageChange={setPage} />
    </section>
  );
}

function DailyHistoryCalendar({ days = [], selectedDay, onSelectDay }) {
  if (!days.length) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500">
        <CalendarDays size={16} /> Calendário de gastos do mês
      </h3>
      <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7 md:grid-cols-10 lg:grid-cols-[repeat(14,minmax(0,1fr))]">
        {days.map((day) => {
          const hasMovement = Number(day.movimentacoes || 0) > 0 || Number(day.estimadoUnidades || 0) > 0 || Number(day.estimadoMetros || 0) > 0;
          const active = selectedDay === day.date;
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onSelectDay(day.date)}
              className={`min-h-14 rounded-xl border px-2 text-xs font-black transition ${
                active
                  ? "border-blue-500 bg-blue-600 text-white"
                  : hasMovement
                    ? day.bate
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-slate-50 text-slate-400"
              }`}
            >
              <span className="block">{formatDayLabel(day.date)}</span>
              <span className="mt-1 block text-[10px]">{metricValue(day.unidades)} un · {metricValue(day.metros)} m</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TecnicoModal({ tecnico, onClose, onRefresh, refreshing }) {
  const snapshot = tecnico.snapshot || {};
  const items = snapshot.items || [];
  const monthlyHistory = snapshot.monthlyHistory || {};
  const days = monthlyHistory.dias || [];
  const [selectedDay, setSelectedDay] = useState(() => [...days].reverse().find((day) => day.movimentacoes || day.estimadoUnidades || day.estimadoMetros)?.date || days[0]?.date || "");
  const selectedDayData = days.find((day) => day.date === selectedDay) || null;
  const max = Math.max(1, ...items.map((item) => Number(item.quantidade || 0)));

  return (
    <ModalShell onClose={onClose} showClose={false} size="6xl" bodyClassName="p-0">
      <div className="overflow-hidden">
        <header className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Bolsa Técnico</p>
            <h2 className="mt-1 truncate text-2xl font-black text-slate-950">{tecnico.nome}</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">{tecnico.empresaNome} · {tecnico.emailHubsoft || "sem e-mail Hubsoft"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => exportTecnicoPdf(tecnico)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
              <Download size={16} /> PDF
            </button>
            <button type="button" disabled={refreshing} onClick={() => onRefresh(tecnico)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Atualizar
            </button>
            <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="grid gap-4 p-5 md:grid-cols-4">
          <MetricCard label="Itens" value={snapshot.totals?.itens || 0} />
          <MetricCard label="Unidades" value={metricValue(snapshot.totals?.unidades)} tone="green" />
          <MetricCard label="Metragem" value={`${metricValue(snapshot.totals?.metros)} m`} tone="amber" />
          <MetricCard label="Alertas" value={snapshot.alerts?.length || 0} tone={snapshot.alerts?.length ? "red" : "blue"} />
          <MetricCard label="Gasto no mês" value={metricValue(monthlyHistory.consumos)} helper="Movimentações" tone="green" />
          <MetricCard label="Itens mês" value={metricValue(monthlyHistory.unidades)} helper="Confirmados" tone="blue" />
          <MetricCard label="Metros mês" value={`${metricValue(monthlyHistory.metros)} m`} helper="Confirmados" tone="amber" />
          <MetricCard label="Histórico" value={metricValue(monthlyHistory.movimentacoes)} helper="Mov. salvas" />
        </div>

        {snapshot.lastError ? (
          <div className="mx-5 mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            Erro na última leitura: {snapshot.lastError}
          </div>
        ) : null}

        <div className="grid gap-5 p-5 pt-0 lg:grid-cols-[1fr_1.4fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Resumo</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3"><dt className="font-bold text-slate-500">Última atualização</dt><dd className="font-black text-slate-900">{formatDate(snapshot.lastUpdatedAt)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="font-bold text-slate-500">ID Sênior</dt><dd className="font-black text-slate-900">{snapshot.seniorId || "-"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="font-bold text-slate-500">Itens recebidos da API</dt><dd className="font-black text-slate-900">{snapshot.diagnostics?.rawItemCount ?? "-"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="font-bold text-slate-500">Itens com saldo positivo</dt><dd className="font-black text-slate-900">{snapshot.diagnostics?.parsedItemCount ?? "-"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="font-bold text-slate-500">Saldo positivo bruto</dt><dd className="font-black text-slate-900">{snapshot.diagnostics?.rawPositiveItemCount ?? "-"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="font-bold text-slate-500">Cidade</dt><dd className="font-black text-slate-900">{tecnico.cidade || "-"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="font-bold text-slate-500">Telefone</dt><dd className="font-black text-slate-900">{tecnico.telefone || "-"}</dd></div>
            </dl>
            {snapshot.alerts?.length ? (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                {snapshot.alerts.map((alert) => <p key={alert}>• {alert}</p>)}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Materiais em bolsa</h3>
            <div className="mt-4 max-h-[54vh] space-y-3 overflow-y-auto pr-1">
              <CategoryItemsAccordion items={items} max={max} />
            </div>
          </section>
        </div>
        <div className="grid gap-5 p-5 pt-0 lg:grid-cols-2">
          <MonthlyConsumptionList title="Gastos do mês por categoria" rows={monthlyHistory.categorias || []} showClients />
          <MonthlyConsumptionList title="Gastos do mês por item" rows={monthlyHistory.itens || []} />
        </div>
        <div className="p-5 pt-0">
          <DailyHistoryCalendar days={days} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
        </div>
        {selectedDayData ? (
          <div className="grid gap-5 p-5 pt-0 lg:grid-cols-[0.85fr_1.15fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Match do dia {formatDayLabel(selectedDayData.date)}</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3"><dt className="font-bold text-slate-500">Playground itens</dt><dd className="font-black text-slate-900">{metricValue(selectedDayData.unidades)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="font-bold text-slate-500">Playground metros</dt><dd className="font-black text-slate-900">{metricValue(selectedDayData.metros)} m</dd></div>
                <div className="flex justify-between gap-3"><dt className="font-bold text-slate-500">Diferença bolsa itens</dt><dd className="font-black text-slate-900">{metricValue(selectedDayData.estimadoUnidades)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="font-bold text-slate-500">Diferença bolsa metros</dt><dd className="font-black text-slate-900">{metricValue(selectedDayData.estimadoMetros)} m</dd></div>
              </dl>
              <div className={`mt-4 rounded-2xl p-4 text-sm font-black ${selectedDayData.bate ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                {selectedDayData.bate ? "Bate com a diferença da bolsa." : "Não bate com a diferença da bolsa. Verifique as movimentações."}
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-4 text-sm font-black uppercase tracking-wide text-slate-500">Movimentações do dia</h3>
              <MonthlyHistoryTable rows={selectedDayData.movimentos || []} />
            </section>
          </div>
        ) : null}
        <section className="p-5 pt-0">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Últimas movimentações do mês</h3>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                {formatDate(monthlyHistory.periodoInicio)} até {formatDate(monthlyHistory.periodoFim)}
              </span>
            </div>
            <MonthlyHistoryTable rows={monthlyHistory.ultimasMovimentacoes || []} />
          </div>
        </section>
      </div>
    </ModalShell>
  );
}

function ConfigModal({ config, job, onClose, onSave, onRefreshAll, saving, refreshingAll }) {
  const [form, setForm] = useState(() => ({
    enabled: config?.enabled !== false,
    alertsEnabled: Boolean(config?.alertsEnabled),
    dailyRunTime: config?.dailyRunTime || "10:00",
    thresholdTotalUnits: config?.thresholdTotalUnits ?? 100,
    thresholdTotalMeters: config?.thresholdTotalMeters ?? 1000,
    categoryThresholds: config?.categoryThresholds || CATEGORY_ORDER.map((category) => ({
      id: category.id,
      label: category.label,
      tipo: category.id === "cabos" ? "metragem" : "unidade",
      limite: category.id === "cabos" ? 1000 : 20,
    })),
    itemThresholds: config?.itemThresholds || [],
  }));
  const [threshold, setThreshold] = useState({ nome: "", quantidade: "", tipo: "unidade" });

  const addThreshold = () => {
    if (!threshold.nome || !threshold.quantidade) return;
    setForm((current) => ({ ...current, itemThresholds: [...current.itemThresholds, threshold] }));
    setThreshold({ nome: "", quantidade: "", tipo: "unidade" });
  };

  return (
    <ModalShell onClose={onClose} showClose={false} size="4xl" bodyClassName="p-0">
      <div className="overflow-hidden">
        <header className="flex items-center justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Configuração</p>
            <h2 className="text-xl font-black text-slate-950">Auditoria de bolsa</h2>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">
            <X size={18} />
          </button>
        </header>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <label className="rounded-2xl border border-slate-200 p-4 text-sm font-black text-slate-800">
            <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} className="mr-2" />
            Rotina diária ativa
          </label>
          <label className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-900">
            <input type="checkbox" checked={form.alertsEnabled} onChange={(event) => setForm((current) => ({ ...current, alertsEnabled: event.target.checked }))} className="mr-2" />
            Enviar alertas aos supervisores
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Horário da rotina</span>
            <input type="time" value={form.dailyRunTime} onChange={(event) => setForm((current) => ({ ...current, dailyRunTime: event.target.value }))} className={inputClass} />
          </label>
        </div>
        <div className="border-t border-slate-100 p-5">
          <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Limites por categoria</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {form.categoryThresholds.map((category, index) => (
              <label key={category.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">
                  {category.label} · {category.tipo === "metragem" ? "metros" : "unidades"}
                </span>
                <input
                  type="number"
                  min="0"
                  value={category.limite}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    categoryThresholds: current.categoryThresholds.map((item, itemIndex) => (
                      itemIndex === index ? { ...item, limite: event.target.value } : item
                    )),
                  }))}
                  className={inputClass}
                />
              </label>
            ))}
          </div>
        </div>
        <div className="border-t border-slate-100 p-5">
          <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Alertas por material</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_130px_150px_auto]">
            <input value={threshold.nome} onChange={(event) => setThreshold((current) => ({ ...current, nome: event.target.value }))} className={inputClass} placeholder="Nome do material" />
            <input value={threshold.quantidade} onChange={(event) => setThreshold((current) => ({ ...current, quantidade: event.target.value }))} className={inputClass} placeholder="Limite" />
            <select value={threshold.tipo} onChange={(event) => setThreshold((current) => ({ ...current, tipo: event.target.value }))} className={inputClass}>
              <option value="unidade">Unidade</option>
              <option value="metragem">Metragem</option>
            </select>
            <button type="button" onClick={addThreshold} className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-black text-white">Adicionar</button>
          </div>
          <div className="mt-3 space-y-2">
            {form.itemThresholds.map((item, index) => (
              <div key={`${item.nome}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                <span>{item.nome} · {item.quantidade} · {item.tipo}</span>
                <button type="button" onClick={() => setForm((current) => ({ ...current, itemThresholds: current.itemThresholds.filter((_, i) => i !== index) }))} className="text-red-600">Remover</button>
              </div>
            ))}
          </div>
        </div>
        {job ? (
          <div className="mx-5 mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-black text-blue-900">
              <span>{job.stage || "Atualizando API"}</span>
              <span>{Number(job.percent || 0)}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100">
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.min(100, Math.max(0, Number(job.percent || 0)))}%` }} />
            </div>
            <p className="mt-2 text-xs font-bold text-blue-700">
              {Number(job.processed || 0)} de {Number(job.total || 0)} técnico(s) processado(s).
            </p>
          </div>
        ) : null}
        <footer className="flex flex-col gap-3 border-t border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            disabled={refreshingAll}
            onClick={onRefreshAll}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 text-sm font-black text-blue-700 hover:bg-blue-100 disabled:opacity-60"
          >
            <RefreshCw size={16} className={refreshingAll ? "animate-spin" : ""} />
            {refreshingAll ? "Atualizando API..." : "Forçar atualização da API"}
          </button>
          <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700">Cancelar</button>
          <button type="button" disabled={saving} onClick={() => onSave(form)} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60">
            {saving ? "Salvando..." : "Salvar"}
          </button>
          </div>
        </footer>
      </div>
    </ModalShell>
  );
}

function LogsModal({ onClose }) {
  const [logs, setLogs] = useState({ items: [], page: 1, totalPages: 1, limit: 20, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    buscarLogsAuditoriaBolsa({ page: logs.page, limit: logs.limit })
      .then((data) => active && setLogs(data))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [logs.page, logs.limit]);

  return (
    <ModalShell onClose={onClose} showClose={false} size="5xl" bodyClassName="p-0">
      <div className="overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Logs</p>
            <h2 className="text-xl font-black text-slate-950">Auditoria de bolsa</h2>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"><X size={18} /></button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {loading ? <p className="text-sm font-bold text-slate-500">Carregando...</p> : null}
          <div className="space-y-3">
            {logs.items.map((log) => (
              <article key={log.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-black text-slate-950">{log.tecnicoNome || log.type}</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${log.status === "erro" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{log.status || "-"}</span>
                </div>
                <p className="mt-1 font-bold text-slate-500">{formatDate(log.createdAt)} · {log.empresaNome || "-"} · {log.regional || "-"}</p>
                {log.error ? <p className="mt-2 font-bold text-red-600">{log.error}</p> : null}
                {log.alerts?.length ? <p className="mt-2 font-bold text-amber-700">Alertas: {log.alerts.join(" | ")}</p> : null}
                {log.alertReason ? <p className="mt-2 font-bold text-slate-500">Envio: {log.alertReason}</p> : null}
              </article>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 text-sm font-black text-slate-600">
            <button type="button" disabled={logs.page <= 1} onClick={() => { setLoading(true); setLogs((current) => ({ ...current, page: current.page - 1 })); }} className="rounded-xl border border-slate-200 px-4 py-2 disabled:opacity-50">Anterior</button>
            <span>Página {logs.page} de {logs.totalPages}</span>
            <button type="button" disabled={logs.page >= logs.totalPages} onClick={() => { setLoading(true); setLogs((current) => ({ ...current, page: current.page + 1 })); }} className="rounded-xl border border-slate-200 px-4 py-2 disabled:opacity-50">Próxima</button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

export default function TecnicosBolsaAuditoriaPage() {
  const { currentUser } = useAuthContext();
  const [data, setData] = useState({ empresas: [], summary: {} });
  const [config, setConfig] = useState(null);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState("");
  const [selectedTecnico, setSelectedTecnico] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [refreshing, setRefreshing] = useState("");
  const [refreshJob, setRefreshJob] = useState(null);
  const [message, setMessage] = useState("");
  const manage = canManage(currentUser);

  const load = async () => {
    setLoading(true);
    try {
      const [dashboard, configResponse] = await Promise.all([
        buscarAuditoriaBolsaTecnico(),
        buscarConfiguracaoAuditoriaBolsa(),
      ]);
      setData(dashboard);
      setConfig(configResponse.config);
      setSelectedEmpresaId((current) => current || dashboard.empresas?.[0]?.id || "");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch((error) => setMessage(error?.message || "Não foi possível carregar a auditoria."));
  }, []);

  const selectedEmpresa = useMemo(
    () => data.empresas.find((empresa) => empresa.id === selectedEmpresaId) || data.empresas[0] || null,
    [data.empresas, selectedEmpresaId],
  );

  useEffect(() => {
    if (!selectedTecnico) return;
    const updatedTecnico = data.empresas
      .flatMap((empresa) => empresa.tecnicos || [])
      .find((tecnico) => tecnico.snapshotId === selectedTecnico.snapshotId);
    if (updatedTecnico && updatedTecnico !== selectedTecnico) {
      setSelectedTecnico(updatedTecnico);
    }
  }, [data.empresas, selectedTecnico]);

  const handleRefreshTecnico = async (tecnico) => {
    setRefreshing(tecnico.snapshotId);
    setMessage("");
    try {
      await atualizarBolsaTecnico(tecnico.snapshotId);
      await load();
      setSelectedTecnico(null);
      setMessage("Bolsa atualizada com sucesso.");
    } catch (error) {
      setMessage(error?.message || "Falha ao atualizar bolsa.");
    } finally {
      setRefreshing("");
    }
  };

  const handleRefreshAll = async () => {
    setRefreshing("all");
    setRefreshJob({
      status: "queued",
      stage: "Iniciando atualização da API",
      percent: 0,
      processed: 0,
      total: data.summary?.tecnicos || 0,
    });
    setMessage("");
    try {
      const started = await atualizarTodasBolsas();
      let result = null;
      if (started?.jobId) {
        setRefreshJob(started);
        result = await pollRefreshJob(started.jobId, setRefreshJob);
      }
      await wait(300);
      await load();
      setMessage(result?.errors ? `Leitura finalizada com ${result.errors} erro(s) e ${result.success || 0} técnico(s) atualizado(s).` : "Leitura geral finalizada.");
      setRefreshJob((current) => current ? {
        ...current,
        status: "completed",
        stage: result?.errors ? `Atualização finalizada com ${result.errors} erro(s)` : "Atualização finalizada",
        percent: 100,
      } : null);
    } catch (error) {
      setMessage(error?.message || "Falha ao atualizar bolsas.");
      setRefreshJob((current) => current ? {
        ...current,
        status: "failed",
        stage: "Falha na atualização",
        error: error?.message || "Falha ao atualizar bolsas.",
        percent: 100,
      } : null);
    } finally {
      setRefreshing("");
    }
  };

  const handleSaveConfig = async (payload) => {
    setSavingConfig(true);
    try {
      const response = await salvarConfiguracaoAuditoriaBolsa(payload);
      setConfig(response.config);
      setShowConfig(false);
      setMessage("Configuração salva.");
    } catch (error) {
      setMessage(error?.message || "Falha ao salvar configuração.");
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <main className="space-y-5">
      {selectedTecnico ? (
        <TecnicoModal
          key={selectedTecnico.snapshotId}
          tecnico={selectedTecnico}
          onClose={() => setSelectedTecnico(null)}
          onRefresh={handleRefreshTecnico}
          refreshing={refreshing === selectedTecnico.snapshotId}
        />
      ) : null}
      {showConfig ? (
        <ConfigModal
          config={config}
          job={refreshJob}
          onClose={() => setShowConfig(false)}
          onSave={handleSaveConfig}
          onRefreshAll={handleRefreshAll}
          saving={savingConfig}
          refreshingAll={refreshing === "all"}
        />
      ) : null}
      {showLogs ? <LogsModal onClose={() => setShowLogs(false)} /> : null}

      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <PackageSearch size={24} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-600">Técnicos</p>
              <h1 className="text-2xl font-black text-slate-950">Auditoria de Bolsa Técnico</h1>
              <p className="text-sm font-semibold text-slate-500">Consulta materiais por e-mail Hubsoft na API Sempre e grava histórico de leitura.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowLogs(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
              <Clock size={16} /> Logs
            </button>
            {manage ? (
              <button type="button" onClick={() => setShowConfig(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
                <Settings size={16} /> Configuração
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {message ? <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800">{message}</div> : null}
      {refreshJob ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-blue-950">{refreshJob.stage || "Atualizando API Sempre"}</p>
              <p className="text-xs font-bold text-blue-700">
                {Number(refreshJob.processed || 0)} de {Number(refreshJob.total || 0)} técnico(s) processado(s)
                {refreshJob.current?.tecnicoNome ? ` · ${refreshJob.current.tecnicoNome}` : ""}
              </p>
              {(refreshJob.success || refreshJob.errors) ? (
                <p className="mt-1 text-xs font-bold text-blue-700">
                  {Number(refreshJob.success || 0)} atualizado(s), {Number(refreshJob.errors || 0)} com erro.
                </p>
              ) : null}
              {refreshJob.error ? <p className="mt-1 text-xs font-black text-red-700">{refreshJob.error}</p> : null}
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-blue-700">{Number(refreshJob.percent || 0)}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.min(100, Math.max(0, Number(refreshJob.percent || 0)))}%` }} />
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Empresas" value={data.summary?.empresas || 0} helper="Com técnicos visíveis" />
        <MetricCard label="Técnicos" value={data.summary?.tecnicos || 0} helper="Cadastrados para auditoria" tone="green" />
        <MetricCard label="Atualizados" value={data.summary?.atualizados || 0} helper="Com leitura salva" tone="amber" />
        <MetricCard label="Alertas" value={data.summary?.alertas || 0} helper="Gerados na última leitura" tone={data.summary?.alertas ? "red" : "blue"} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Empresas</h2>
          <div className="mt-4 space-y-2">
            {data.empresas.map((empresa) => (
              <button
                key={empresa.id}
                type="button"
                onClick={() => setSelectedEmpresaId(empresa.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${selectedEmpresa?.id === empresa.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
              >
                <div className="flex items-center gap-3">
                  <Building2 size={18} className="text-blue-600" />
                  <div className="min-w-0">
                    <p className="truncate font-black text-slate-950">{empresa.nome}</p>
                    <p className="text-xs font-bold text-slate-500">{empresa.regional || "-"} · {empresa.tecnicos.length} técnico(s)</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-950">{selectedEmpresa?.nome || "Técnicos"}</h2>
              <p className="text-sm font-bold text-slate-500">{selectedEmpresa?.regional || "-"}</p>
            </div>
            {loading ? <span className="text-sm font-black text-blue-600">Carregando...</span> : null}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {selectedEmpresa?.tecnicos?.length ? selectedEmpresa.tecnicos.map((tecnico) => {
              const snapshot = tecnico.snapshot || {};
              return (
                <article key={tecnico.snapshotId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black text-slate-950">{tecnico.nome}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs font-bold text-slate-500"><Mail size={13} /> {tecnico.emailHubsoft || "sem e-mail Hubsoft"}</p>
                    </div>
                    {snapshot.lastError ? <AlertTriangle className="shrink-0 text-red-500" size={20} /> : <UserRound className="shrink-0 text-blue-600" size={20} />}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <MetricCard label="Itens" value={snapshot.totals?.itens || 0} />
                    <MetricCard label="Unid." value={metricValue(snapshot.totals?.unidades)} tone="green" />
                    <MetricCard label="M" value={metricValue(snapshot.totals?.metros)} tone="amber" />
                  </div>
                  <p className="mt-3 text-xs font-bold text-slate-500">Última atualização: {formatDate(snapshot.lastUpdatedAt)}</p>
                  {snapshot.diagnostics ? (
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      API: {snapshot.diagnostics.rawItemCount || 0} recebido(s), {snapshot.diagnostics.parsedItemCount || 0} com saldo.
                      {snapshot.diagnostics.rawPositiveItemCount !== undefined ? ` Bruto: ${snapshot.diagnostics.rawPositiveItemCount}.` : ""}
                    </p>
                  ) : null}
                  {snapshot.lastError ? <p className="mt-2 text-xs font-bold text-red-600">{snapshot.lastError}</p> : null}
                  <div className="mt-4 flex gap-2">
                    <button type="button" onClick={() => setSelectedTecnico(tecnico)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 hover:bg-slate-50">
                      <BarChart3 size={15} /> Ver
                    </button>
                    {manage ? (
                      <button type="button" disabled={refreshing === tecnico.snapshotId} onClick={() => handleRefreshTecnico(tecnico)} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-3 text-white hover:bg-blue-700 disabled:opacity-60">
                        <RefreshCw size={16} className={refreshing === tecnico.snapshotId ? "animate-spin" : ""} />
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            }) : (
              <p className="rounded-2xl bg-slate-50 p-5 text-sm font-bold text-slate-500 md:col-span-2 xl:col-span-3">
                Nenhum técnico cadastrado para esta empresa.
              </p>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
