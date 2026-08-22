import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Download, RefreshCw, Send, Settings, X } from "lucide-react";
import ModalShell from "../../../components/ui/ModalShell";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { addClusterLogo } from "../../../utils/pdfBranding";
import {
  atualizarMovimentacoesRelatorioBolsa,
  buscarConfiguracaoAuditoriaBolsa,
  buscarJobAuditoriaBolsa,
  buscarRelatorioAuditoriaBolsa,
  enviarRelatorioAuditoriaBolsaEmail,
  salvarConfiguracaoAuditoriaBolsa,
} from "../services/bolsaTecnicoAuditoriaService";

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

function metricValue(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? number.toLocaleString("pt-BR") : number.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function formatPeriod(periodo) {
  const labels = {
    diario: "Diário",
    semanal: "Semanal",
    mensal: "Mensal",
    anual: "Anual",
  };
  return labels[periodo] || "Mensal";
}

function MetricCard({ label, value, helper, tone = "blue" }) {
  const styles = {
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    violet: "border-violet-200 bg-violet-50 text-violet-900",
  };
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${styles[tone] || styles.blue}`}>
      <p className="text-xs font-black uppercase tracking-wide opacity-75">{label}</p>
      <p className="mt-2 whitespace-nowrap text-2xl font-black leading-none">{value}</p>
      {helper ? <p className="mt-1 text-xs font-bold opacity-75">{helper}</p> : null}
    </div>
  );
}

function ReportTable({ title, rows, columns }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
          <p className="text-xs font-bold text-slate-500">{rows.length} registro(s)</p>
        </div>
        <select
          value={pageSize}
          onChange={(event) => {
            setPage(1);
            setPageSize(Number(event.target.value));
          }}
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        >
          <option value={5}>5 por página</option>
          <option value={20}>20 por página</option>
          <option value={30}>30 por página</option>
          <option value={50}>50 por página</option>
        </select>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="whitespace-nowrap px-3 py-3">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.length ? visibleRows.map((row, index) => (
              <tr key={row.id || row.nome || `${title}-${safePage}-${index}`}>
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-3 font-bold text-slate-700">
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            )) : (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center font-bold text-slate-400">
                  Nenhum consumo encontrado no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm font-black text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Página {safePage} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="min-h-11 rounded-xl border border-slate-200 px-4 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              className="min-h-11 rounded-xl border border-slate-200 px-4 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

async function buildReportPdf(report, filters) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  pdf.setFillColor(5, 35, 75);
  pdf.rect(0, 0, 210, 34, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("Relatório de Auditoria de Bolsa Técnica", 14, 15);
  pdf.setFontSize(10);
  pdf.text(`${formatPeriod(filters.periodo)} · Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 24);
  await addClusterLogo(pdf);
  pdf.setTextColor(15, 23, 42);

  autoTable(pdf, {
    startY: 42,
    head: [["Indicador", "Valor"]],
    body: [
      ["Leituras no período", metricValue(report.summary?.leituras)],
      ["Empresas com consumo", metricValue(report.summary?.empresas)],
      ["Técnicos com consumo", metricValue(report.summary?.tecnicos)],
      ["Itens confirmados", metricValue(report.summary?.unidades)],
      ["Metragem confirmada", `${metricValue(report.summary?.metros)} m`],
      ["Movimentações Playground", metricValue(report.summary?.movimentacoes)],
      ["Consumos confirmados em cliente", metricValue(report.summary?.consumosConfirmados)],
      ["Unidades confirmadas", metricValue(report.summary?.unidadesMovimentadas)],
      ["Metragem confirmada", `${metricValue(report.summary?.metrosMovimentados)} m`],
    ],
    theme: "grid",
    headStyles: { fillColor: [37, 99, 235] },
  });

  const sections = [
    ["Consumo por empresa", report.porEmpresa],
    ["Consumo por técnico", report.porTecnico],
    ["Consumo por categoria", report.porCategoria],
    ["Itens mais consumidos", report.itens],
    ["Consumo confirmado por empresa", report.movimentosPorEmpresa],
    ["Consumo confirmado por técnico", report.movimentosPorTecnico],
    ["Itens confirmados pelo Playground", report.movimentosItens],
  ];

  let startY = (pdf.lastAutoTable?.finalY || 80) + 8;
  sections.forEach(([title, rows]) => {
    if (startY > 245) {
      pdf.addPage();
      startY = 16;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(title, 14, startY);
    autoTable(pdf, {
      startY: startY + 4,
      head: [["Nome", "Itens", "Metros"]],
      body: (rows || []).map((row) => [
        row.nome || row.empresaNome || "-",
        metricValue(row.unidades),
        metricValue(row.metros),
      ]),
      theme: "striped",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 23, 42] },
    });
    startY = (pdf.lastAutoTable?.finalY || startY) + 8;
  });

  if ((report.movimentosConsumo || []).length) {
    if (startY > 220) {
      pdf.addPage();
      startY = 16;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("Últimos consumos confirmados no Playground", 14, startY);
    autoTable(pdf, {
      startY: startY + 4,
      head: [["Data", "Técnico", "Cliente", "Item", "Qtd", "Nota"]],
      body: (report.movimentosConsumo || []).slice(0, 80).map((row) => [
        formatDate(row.data),
        row.tecnicoNome || "-",
        row.clienteNome || "-",
        row.nome || "-",
        metricValue(row.quantidade),
        row.numero || "-",
      ]),
      theme: "striped",
      styles: { fontSize: 7 },
      headStyles: { fillColor: [5, 35, 75] },
    });
  }

  return pdf;
}

function ReportConfigModal({ config, onClose, onSave, saving }) {
  const [form, setForm] = useState(() => ({
    enabled: config?.enabled !== false,
    dailyRunTime: config?.dailyRunTime || "10:00",
    alertsEnabled: Boolean(config?.alertsEnabled),
  }));

  return (
    <ModalShell onClose={onClose} showClose={false} size="2xl" bodyClassName="p-0">
      <div className="overflow-hidden">
        <header className="flex items-center justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Configuração</p>
            <h2 className="text-xl font-black text-slate-950">Rotina dos relatórios</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">A leitura do Playground será salva para consulta pelos filtros.</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">
            <X size={18} />
          </button>
        </header>
        <div className="space-y-4 p-5">
          <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-800">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
            />
            Rotina diária ativa
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Horário da leitura diária</span>
            <input
              type="time"
              value={form.dailyRunTime}
              onChange={(event) => setForm((current) => ({ ...current, dailyRunTime: event.target.value }))}
              className={inputClass}
            />
          </label>
          <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 text-sm font-black text-amber-900">
            <input
              type="checkbox"
              checked={form.alertsEnabled}
              onChange={(event) => setForm((current) => ({ ...current, alertsEnabled: event.target.checked }))}
            />
            Enviar alertas aos supervisores
          </label>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-900">
            <p>Última atualização salva: {formatDate(config?.lastReportRefreshAt)}</p>
            <p className="mt-1">Movimentações salvas: {metricValue(config?.lastReportRefreshTotal)}</p>
          </div>
        </div>
        <footer className="flex justify-end gap-3 border-t border-slate-100 p-5">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700">Cancelar</button>
          <button type="button" disabled={saving} onClick={() => onSave(form)} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60">
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </footer>
      </div>
    </ModalShell>
  );
}

export default function TecnicosAuditoriaRelatoriosPage() {
  const { currentUser } = useAuthContext();
  const [filters, setFilters] = useState({ periodo: "mensal", regional: "", empresaId: "", tecnicoId: "" });
  const [apiRange, setApiRange] = useState({ dataInicio: "", dataFim: "" });
  const [report, setReport] = useState(null);
  const [config, setConfig] = useState(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [refreshingCache, setRefreshingCache] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(null);
  const [message, setMessage] = useState("");
  const manage = hasPermission(currentUser, "tecnicos.auditoria_bolsa.manage");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, configResponse] = await Promise.all([
        buscarRelatorioAuditoriaBolsa(filters),
        buscarConfiguracaoAuditoriaBolsa(),
      ]);
      setReport(data);
      setConfig(configResponse.config);
    } catch (error) {
      setMessage(error?.message || "Não foi possível carregar o relatório.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const tecnicosOptions = useMemo(() => {
    const all = report?.options?.tecnicos || [];
    return all.filter((tecnico) => (
      (!filters.regional || tecnico.regional === filters.regional) &&
      (!filters.empresaId || tecnico.empresaId === filters.empresaId)
    ));
  }, [filters.empresaId, filters.regional, report?.options?.tecnicos]);

  const empresasOptions = useMemo(() => {
    const all = report?.options?.empresas || [];
    return all.filter((empresa) => !filters.regional || empresa.regional === filters.regional);
  }, [filters.regional, report?.options?.empresas]);

  const handleDownload = async () => {
    if (!report) return;
    const pdf = await buildReportPdf(report, filters);
    pdf.save(`relatorio-bolsa-tecnica-${filters.periodo}.pdf`);
  };

  const handleSendEmail = async () => {
    if (!report) return;
    setSending(true);
    setMessage("");
    try {
      const pdf = await buildReportPdf(report, filters);
      const base64 = pdf.output("datauristring").split(",")[1];
      await enviarRelatorioAuditoriaBolsaEmail({
        to: email,
        pdfBase64: base64,
        fileName: `relatorio-bolsa-tecnica-${filters.periodo}.pdf`,
        filters,
      });
      setMessage("Relatório enviado por e-mail.");
    } catch (error) {
      setMessage(error?.message || "Falha ao enviar relatório.");
    } finally {
      setSending(false);
    }
  };

  const handleForceRefresh = async () => {
    setRefreshingCache(true);
    setRefreshProgress({ stage: "Consultando movimentações do Playground", percent: 20, total: 0 });
    setMessage("");
    try {
      const result = await atualizarMovimentacoesRelatorioBolsa({
        periodo: filters.periodo,
        dataInicio: apiRange.dataInicio,
        dataFim: apiRange.dataFim,
      });
      let finalResult = result;
      if (result?.jobId) {
        let completed = false;
        setRefreshProgress({
          stage: result.stage || "Atualização em segundo plano iniciada",
          percent: Number(result.percent || 5),
          total: 0,
        });
        for (let attempt = 0; attempt < 1200; attempt += 1) {
          await wait(3000);
          const job = await buscarJobAuditoriaBolsa(result.jobId);
          setRefreshProgress({
            stage: job?.stage || "Atualizando movimentações do Playground",
            percent: Number(job?.percent || 0),
            total: Number(job?.total || job?.processed || job?.result?.movements || 0),
            error: job?.error || "",
          });
          if (job?.status === "completed") {
            finalResult = job.result || job;
            completed = true;
            break;
          }
          if (job?.status === "failed") {
            throw new Error(job.error || "Falha ao atualizar movimentações do Playground.");
          }
        }
        if (!completed) {
          throw new Error("Tempo esgotado ao acompanhar a atualização. A rotina pode continuar em segundo plano; recarregue em alguns minutos.");
        }
      } else {
        setRefreshProgress({ stage: "Salvando movimentações no banco", percent: 80, total: result?.movements || 0 });
      }
      await load();
      const totalMovements = finalResult?.movements || finalResult?.saved || finalResult?.processed || 0;
      setMessage(`${metricValue(totalMovements)} movimentação(ões) atualizada(s) para consulta.`);
      setRefreshProgress({ stage: "Atualização finalizada", percent: 100, total: totalMovements });
    } catch (error) {
      const message = String(error?.message || "Falha ao atualizar dados da auditoria.");
      const hint = message.includes("404")
        ? "Rota de atualização não encontrada na API. Atualize também o app.js na VPS antes de testar novamente."
        : message;
      setMessage(hint);
      setRefreshProgress((current) => current ? {
        ...current,
        stage: "Falha na atualização",
        error: hint,
        percent: 100,
      } : null);
    } finally {
      setRefreshingCache(false);
    }
  };

  const handleSaveConfig = async (payload) => {
    setSavingConfig(true);
    setMessage("");
    try {
      const response = await salvarConfiguracaoAuditoriaBolsa({
        ...config,
        ...payload,
      });
      setConfig(response.config);
      setShowConfig(false);
      setMessage("Configuração da rotina salva.");
    } catch (error) {
      setMessage(error?.message || "Falha ao salvar configuração.");
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <main className="space-y-5">
      {showConfig ? (
        <ReportConfigModal
          config={config}
          onClose={() => setShowConfig(false)}
          onSave={handleSaveConfig}
          saving={savingConfig}
        />
      ) : null}
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <BarChart3 size={24} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-600">Auditoria</p>
              <h1 className="text-2xl font-black text-slate-950">Relatórios de Bolsa Técnico</h1>
              <p className="text-sm font-semibold text-slate-500">Consumo confirmado pelo Playground por empresa, técnico, categoria e item.</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Última atualização: <span className="text-slate-900">{formatDate(config?.lastReportRefreshAt || report?.cache?.lastReportRefreshAt)}</span>
            </p>
            <div className="flex flex-wrap justify-end gap-2">
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700">
              <span className="text-xs uppercase tracking-wide text-slate-500">API de</span>
              <input
                type="date"
                value={apiRange.dataInicio}
                onChange={(event) => setApiRange((current) => ({ ...current, dataInicio: event.target.value }))}
                className="min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-black text-slate-900 outline-none"
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700">
              <span className="text-xs uppercase tracking-wide text-slate-500">API até</span>
              <input
                type="date"
                value={apiRange.dataFim}
                onChange={(event) => setApiRange((current) => ({ ...current, dataFim: event.target.value }))}
                className="min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-black text-slate-900 outline-none"
              />
            </label>
            <button type="button" onClick={load} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Recarregar
            </button>
            {manage ? (
              <>
                <button type="button" onClick={handleForceRefresh} disabled={refreshingCache} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-60">
                  <RefreshCw size={16} className={refreshingCache ? "animate-spin" : ""} /> Forçar atualização
                </button>
                <button type="button" onClick={() => setShowConfig(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
                  <Settings size={16} /> Configuração
                </button>
              </>
            ) : null}
            <button type="button" onClick={handleDownload} disabled={loading || !report} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
              <Download size={16} /> Baixar PDF
            </button>
            </div>
          </div>
        </div>
      </header>

      {message ? <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800">{message}</div> : null}
      {loading ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
              <RefreshCw size={22} className="animate-spin" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-black text-blue-950">Carregando dados da auditoria...</p>
              <p className="mt-1 text-sm font-bold text-blue-700">
                Consultando o histórico salvo no banco. Use “Forçar atualização” para buscar uma nova leitura no Playground.
              </p>
            </div>
          </div>
        </section>
      ) : null}
      {refreshProgress ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-emerald-950">{refreshProgress.stage || "Atualizando movimentações do Playground"}</p>
              <p className="text-xs font-bold text-emerald-700">
                Essa atualização lê apenas as movimentações/notas e salva o histórico para os filtros.
              </p>
              {refreshProgress.total ? <p className="mt-1 text-xs font-bold text-emerald-700">{metricValue(refreshProgress.total)} movimentação(ões) encontrada(s).</p> : null}
              {refreshProgress.error ? <p className="mt-1 text-xs font-black text-red-700">{refreshProgress.error}</p> : null}
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-emerald-700">{Number(refreshProgress.percent || 0)}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100">
            <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${Math.min(100, Math.max(0, Number(refreshProgress.percent || 0)))}%` }} />
          </div>
        </section>
      ) : null}
      {report?.movementsError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          Movimentações do Playground não carregadas: {report.movementsError}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Período</span>
            <select value={filters.periodo} onChange={(event) => setFilters((current) => ({ ...current, periodo: event.target.value }))} className={inputClass}>
              <option value="diario">Diário</option>
              <option value="semanal">Semanal</option>
              <option value="mensal">Mensal</option>
              <option value="anual">Anual</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Regional</span>
            <select value={filters.regional} onChange={(event) => setFilters((current) => ({ ...current, regional: event.target.value, empresaId: "", tecnicoId: "" }))} className={inputClass}>
              <option value="">Todas</option>
              {(report?.options?.regionais || []).map((regional) => <option key={regional} value={regional}>{regional}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Empresa</span>
            <select value={filters.empresaId} onChange={(event) => setFilters((current) => ({ ...current, empresaId: event.target.value, tecnicoId: "" }))} className={inputClass}>
              <option value="">Todas</option>
              {empresasOptions.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Técnico</span>
            <select value={filters.tecnicoId} onChange={(event) => setFilters((current) => ({ ...current, tecnicoId: event.target.value }))} className={inputClass}>
              <option value="">Todos</option>
              {tecnicosOptions.map((tecnico) => <option key={tecnico.id} value={tecnico.id}>{tecnico.nome}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <button type="button" onClick={load} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-black text-white disabled:opacity-60">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Aplicar filtros
          </button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} placeholder="E-mail para enviar PDF" />
            <button type="button" onClick={handleSendEmail} disabled={sending || loading || !report || !email} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 text-sm font-black text-emerald-700 disabled:opacity-60">
              {sending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />} Enviar
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
        <MetricCard label="Leituras" value={metricValue(report?.summary?.leituras)} helper={formatPeriod(filters.periodo)} />
        <MetricCard label="Empresas" value={metricValue(report?.summary?.empresas)} helper="Com consumo" tone="green" />
        <MetricCard label="Técnicos" value={metricValue(report?.summary?.tecnicos)} helper="Com consumo" tone="amber" />
        <MetricCard label="Itens" value={metricValue(report?.summary?.unidades)} helper="Confirmados" tone="violet" />
        <MetricCard label="Metragem" value={`${metricValue(report?.summary?.metros)} m`} helper="Confirmada" />
        <MetricCard label="Movimentações" value={metricValue(report?.summary?.movimentacoes)} helper="Playground" tone="green" />
        <MetricCard label="Consumo real" value={metricValue(report?.summary?.consumosConfirmados)} helper="Cliente" tone="amber" />
        <MetricCard label="Metros reais" value={`${metricValue(report?.summary?.metrosMovimentados)} m`} helper="Playground" tone="violet" />
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <ReportTable title="Consumo por empresa" rows={report?.porEmpresa || []} columns={[
          { key: "nome", label: "Empresa" },
          { key: "regional", label: "Regional" },
          { key: "unidades", label: "Itens", render: (row) => metricValue(row.unidades) },
          { key: "metros", label: "Metros", render: (row) => metricValue(row.metros) },
        ]} />
        <ReportTable title="Consumo por técnico" rows={report?.porTecnico || []} columns={[
          { key: "nome", label: "Técnico" },
          { key: "empresaNome", label: "Empresa" },
          { key: "unidades", label: "Itens", render: (row) => metricValue(row.unidades) },
          { key: "metros", label: "Metros", render: (row) => metricValue(row.metros) },
        ]} />
        <ReportTable title="Consumo por categoria" rows={report?.porCategoria || []} columns={[
          { key: "nome", label: "Categoria" },
          { key: "unidades", label: "Unidades", render: (row) => metricValue(row.unidades) },
          { key: "metros", label: "Metros", render: (row) => metricValue(row.metros) },
        ]} />
        <ReportTable title="Itens mais consumidos" rows={report?.itens || []} columns={[
          { key: "nome", label: "Item" },
          { key: "categoria", label: "Categoria" },
          { key: "unidades", label: "Unidades", render: (row) => metricValue(row.unidades) },
          { key: "metros", label: "Metros", render: (row) => metricValue(row.metros) },
        ]} />
        <ReportTable title="Consumo confirmado por empresa" rows={report?.movimentosPorEmpresa || []} columns={[
          { key: "nome", label: "Empresa" },
          { key: "regional", label: "Regional" },
          { key: "unidades", label: "Itens", render: (row) => metricValue(row.unidades) },
          { key: "metros", label: "Metros", render: (row) => metricValue(row.metros) },
        ]} />
        <ReportTable title="Consumo confirmado por técnico" rows={report?.movimentosPorTecnico || []} columns={[
          { key: "nome", label: "Técnico" },
          { key: "empresaNome", label: "Empresa" },
          { key: "unidades", label: "Itens", render: (row) => metricValue(row.unidades) },
          { key: "metros", label: "Metros", render: (row) => metricValue(row.metros) },
        ]} />
      </div>

      <ReportTable title="Últimas movimentações do Playground" rows={report?.movimentosConsumo || []} columns={[
        { key: "data", label: "Data", render: (row) => formatDate(row.data) },
        { key: "tecnicoNome", label: "Técnico" },
        { key: "clienteNome", label: "Cliente" },
        { key: "nome", label: "Item" },
        { key: "quantidade", label: "Qtd", render: (row) => `${metricValue(row.quantidade)} ${row.unidade || ""}` },
        { key: "numero", label: "Nota" },
        { key: "status", label: "Status" },
      ]} />
      <div className="grid gap-5 xl:grid-cols-2">
        <ReportTable title="Categorias confirmadas pelo Playground" rows={report?.movimentosPorCategoria || []} columns={[
          { key: "nome", label: "Categoria" },
          { key: "unidades", label: "Unidades", render: (row) => metricValue(row.unidades) },
          { key: "metros", label: "Metros", render: (row) => metricValue(row.metros) },
        ]} />
        <ReportTable title="Itens confirmados pelo Playground" rows={report?.movimentosItens || []} columns={[
          { key: "nome", label: "Item" },
          { key: "categoria", label: "Categoria" },
          { key: "unidades", label: "Unidades", render: (row) => metricValue(row.unidades) },
          { key: "metros", label: "Metros", render: (row) => metricValue(row.metros) },
        ]} />
      </div>
    </main>
  );
}
