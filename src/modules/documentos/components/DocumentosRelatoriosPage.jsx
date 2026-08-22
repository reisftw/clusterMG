import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  ReceiptText,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";
import Spinner from "../../../components/ui/Spinner";
import { listarEnviosDocumentos } from "../services/documentosService";

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

const PAGE_SIZES = [20, 30, 50, 100];

function monthKey(value) {
  if (String(value || "").match(/^\d{4}-\d{2}$/)) return value;
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return value || "-";
  return `${MONTHS[Number(match[2]) - 1] || match[2]}/${match[1]}`;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function percent(value, total) {
  if (!total) return "0,0%";
  return `${((Number(value || 0) / total) * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function durationLabel(ms) {
  const minutes = Math.max(0, Math.round(Number(ms || 0) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}min`;
  return `${mins}min`;
}

function isReviewedSubmission(submission) {
  return Boolean(submission.reviewedAt || submission.adminReviewedAt || ["aprovado", "reprovado"].includes(String(submission.status || "").toLowerCase()));
}

function isRejectedFile(file) {
  return String(file?.status || "").toLowerCase() === "reprovado"
    || String(file?.adminStatus || "").toLowerCase() === "reprovado"
    || Boolean(file?.motivoReprovacao || file?.adminMotivoReprovacao);
}

function isApprovedFile(file) {
  const status = String(file?.status || "").toLowerCase();
  const adminStatus = String(file?.adminStatus || "").toLowerCase();
  return status === "aprovado" || adminStatus === "aprovado";
}

function isInvoiceFile(file) {
  return normalize(file?.categoria) === "nota_fiscal";
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function hasRetrabalho(submission) {
  return String(submission.status || "").toLowerCase() === "reprovado"
    || Boolean(submission.motivoReprovacao)
    || (submission.files || []).some(isRejectedFile);
}

function buildMetrics(submissions) {
  const base = {
    envios: submissions.length,
    analisados: 0,
    aprovados: 0,
    retrabalho: 0,
    documentos: 0,
    documentosAnalisados: 0,
    documentosReprovados: 0,
    notasFiscais: 0,
    valorNotasFiscais: 0,
    aguardandoSupervisor: 0,
    tempoSupervisorTotalMs: 0,
    tempoSupervisorCount: 0,
    tempoPendenteSupervisorTotalMs: 0,
  };
  const companies = new Map();
  const months = new Map();
  const fields = new Map();
  const invoiceCompanies = new Map();
  const invoiceMonths = new Map();
  const invoiceYears = new Map();
  const supervisors = new Map();
  const now = Date.now();

  submissions.forEach((submission) => {
    const files = submission.files || [];
    const reviewed = isReviewedSubmission(submission);
    const rework = hasRetrabalho(submission);
    const approved = String(submission.status || "").toLowerCase() === "aprovado";
    const pendingSupervisor = String(submission.status || "").toLowerCase() === "pendente";
    const submittedAt = submission.submittedAt ? new Date(submission.submittedAt) : null;
    const reviewedAt = submission.reviewedAt ? new Date(submission.reviewedAt) : null;
    const key = submission.empresaId || submission.empresaNome || "sem_empresa";
    const company = companies.get(key) || {
      id: key,
      nome: submission.empresaNome || "Empresa sem nome",
      regional: submission.regional || "-",
      envios: 0,
      analisados: 0,
      aprovados: 0,
      retrabalho: 0,
      documentos: 0,
      documentosReprovados: 0,
    };
    const mk = monthKey(submission.mesReferencia || submission.submittedAt);
    const month = months.get(mk) || {
      key: mk,
      label: monthLabel(mk),
      envios: 0,
      analisados: 0,
      aprovados: 0,
      retrabalho: 0,
    };

    const documentFiles = files.filter((file) => !isInvoiceFile(file));
    const invoiceFiles = files.filter(isInvoiceFile);
    base.documentos += documentFiles.length;
    base.notasFiscais += invoiceFiles.length;
    if (pendingSupervisor) {
      base.aguardandoSupervisor += 1;
      if (submittedAt && !Number.isNaN(submittedAt.getTime())) {
        base.tempoPendenteSupervisorTotalMs += Math.max(0, now - submittedAt.getTime());
      }
    }
    company.envios += 1;
    company.documentos += documentFiles.length;
    month.envios += 1;

    if (reviewed) {
      base.analisados += 1;
      company.analisados += 1;
      month.analisados += 1;
    }
    if (
      reviewedAt &&
      submittedAt &&
      !Number.isNaN(reviewedAt.getTime()) &&
      !Number.isNaN(submittedAt.getTime()) &&
      reviewedAt.getTime() >= submittedAt.getTime()
    ) {
      const supervisorKey = submission.reviewedBy || submission.supervisorId || submission.supervisorNome || "sem_supervisor";
      const supervisor = supervisors.get(supervisorKey) || {
        id: supervisorKey,
        nome: submission.reviewedByName || submission.supervisorNome || "Supervisor não identificado",
        regional: submission.regional || "-",
        avaliacoes: 0,
        totalMs: 0,
      };
      const elapsed = reviewedAt.getTime() - submittedAt.getTime();
      supervisor.avaliacoes += 1;
      supervisor.totalMs += elapsed;
      base.tempoSupervisorTotalMs += elapsed;
      base.tempoSupervisorCount += 1;
      supervisors.set(supervisorKey, supervisor);
    }
    if (approved) {
      base.aprovados += 1;
      company.aprovados += 1;
      month.aprovados += 1;
    }
    if (rework) {
      base.retrabalho += 1;
      company.retrabalho += 1;
      month.retrabalho += 1;
    }

    invoiceFiles.forEach((file) => {
      const valor = Number(file.valor || 0);
      base.valorNotasFiscais += valor;
      const companyInvoice = invoiceCompanies.get(key) || {
        id: key,
        nome: submission.empresaNome || "Empresa sem nome",
        regional: submission.regional || "-",
        notas: 0,
        valor: 0,
      };
      companyInvoice.notas += 1;
      companyInvoice.valor += valor;
      invoiceCompanies.set(key, companyInvoice);
      const mk = monthKey(file.mesReferencia || submission.mesReferencia || file.createdAt || submission.submittedAt);
      if (mk) {
        const monthInvoice = invoiceMonths.get(mk) || { key: mk, label: monthLabel(mk), notas: 0, valor: 0 };
        monthInvoice.notas += 1;
        monthInvoice.valor += valor;
        invoiceMonths.set(mk, monthInvoice);
        const year = mk.slice(0, 4);
        const yearInvoice = invoiceYears.get(year) || { key: year, label: year, notas: 0, valor: 0 };
        yearInvoice.notas += 1;
        yearInvoice.valor += valor;
        invoiceYears.set(year, yearInvoice);
      }
    });

    documentFiles.forEach((file) => {
      if (isApprovedFile(file) || isRejectedFile(file)) base.documentosAnalisados += 1;
      if (isRejectedFile(file)) {
        base.documentosReprovados += 1;
        company.documentosReprovados += 1;
        const fieldKey = file.fieldId || file.fieldNome || file.tipo || file.nome || "sem_campo";
        const field = fields.get(fieldKey) || {
          id: fieldKey,
          nome: file.fieldNome || file.tipo || file.nome || "Documento sem campo",
          reprovacoes: 0,
        };
        field.reprovacoes += 1;
        fields.set(fieldKey, field);
      }
    });

    companies.set(key, company);
    if (mk) months.set(mk, month);
  });

  const companyRows = [...companies.values()].map((company) => ({
    ...company,
    taxaRetrabalho: company.analisados ? company.retrabalho / company.analisados : 0,
    taxaAcerto: company.analisados ? (company.analisados - company.retrabalho) / company.analisados : 0,
  }));
  const supervisorRows = [...supervisors.values()]
    .map((supervisor) => ({
      ...supervisor,
      mediaMs: supervisor.avaliacoes ? supervisor.totalMs / supervisor.avaliacoes : 0,
    }))
    .filter((supervisor) => supervisor.avaliacoes > 0);

  return {
    ...base,
    taxaRetrabalho: base.analisados ? base.retrabalho / base.analisados : 0,
    taxaAcerto: base.analisados ? (base.analisados - base.retrabalho) / base.analisados : 0,
    companies: companyRows,
    months: [...months.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-12),
    fields: [...fields.values()].sort((a, b) => b.reprovacoes - a.reprovacoes).slice(0, 8),
    invoiceCompanies: [...invoiceCompanies.values()].sort((a, b) => b.valor - a.valor),
    invoiceMonths: [...invoiceMonths.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-12),
    invoiceYears: [...invoiceYears.values()].sort((a, b) => a.key.localeCompare(b.key)),
    supervisorRows,
    tempoMedioSupervisorMs: base.tempoSupervisorCount ? base.tempoSupervisorTotalMs / base.tempoSupervisorCount : 0,
    tempoMedioPendenteSupervisorMs: base.aguardandoSupervisor ? base.tempoPendenteSupervisorTotalMs / base.aguardandoSupervisor : 0,
  };
}

async function loadAllSubmissions() {
  const items = [];
  let offset = 0;
  const limit = 100;
  for (let page = 0; page < 60; page += 1) {
    const batch = await listarEnviosDocumentos({ limit, offset });
    items.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return items;
}

function KpiCard({ icon: Icon, label, value, description, tone = "blue" }) {
  const tones = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    red: "border-red-100 bg-red-50 text-red-700",
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">{description}</p>
        </div>
        <span className={`rounded-2xl border p-3 ${tones[tone] || tones.blue}`}>
          <Icon size={22} />
        </span>
      </div>
    </section>
  );
}

function RankingBar({ label, value, max, detail, tone = "blue" }) {
  const colors = {
    blue: "bg-blue-600",
    green: "bg-emerald-500",
    red: "bg-red-500",
    amber: "bg-amber-500",
  };
  const width = max ? Math.max(6, Math.round((value / max) * 100)) : 0;
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-900">{label}</p>
          <p className="text-xs font-semibold text-slate-500">{detail}</p>
        </div>
        <span className="text-lg font-black text-slate-950">{value}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div className={`h-full rounded-full ${colors[tone] || colors.blue}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function SupervisorDurationBar({ item, max, tone = "blue" }) {
  const colors = {
    blue: "bg-blue-600",
    red: "bg-red-500",
  };
  const width = max ? Math.max(6, Math.round((item.mediaMs / max) * 100)) : 0;
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-900">{item.nome}</p>
          <p className="text-xs font-semibold text-slate-500">{item.regional} · {item.avaliacoes} avaliação(ões)</p>
        </div>
        <span className="text-lg font-black text-slate-950">{durationLabel(item.mediaMs)}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div className={`h-full rounded-full ${colors[tone] || colors.blue}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, pageSize, onPage, onPageSize }) {
  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-bold text-slate-500">Página {page} de {totalPages}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Anterior
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Próxima
        </button>
        <select
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value))}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 outline-none"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>{size} por página</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function DocumentosRelatoriosPage() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      setSubmissions(await loadAllSubmissions());
    } catch (error) {
      setMessage(error?.message || "Não foi possível carregar os relatórios administrativos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const periods = useMemo(() => {
    const keys = [...new Set(submissions.map((item) => monthKey(item.mesReferencia || item.submittedAt)).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), "pt-BR"))
      .reverse();
    return keys;
  }, [submissions]);

  const filtered = useMemo(() => {
    const term = normalize(search);
    return submissions.filter((submission) => {
      if (period !== "todos" && monthKey(submission.mesReferencia || submission.submittedAt) !== period) return false;
      if (!term) return true;
      return normalize(`${submission.empresaNome} ${submission.regional} ${submission.supervisorNome}`).includes(term);
    });
  }, [period, search, submissions]);

  const metrics = useMemo(() => buildMetrics(filtered), [filtered]);
  const maxRetrabalho = Math.max(1, ...metrics.companies.map((company) => company.retrabalho));
  const maxAcertos = Math.max(1, ...metrics.companies.map((company) => company.aprovados));
  const maxMonth = Math.max(1, ...metrics.months.map((item) => item.envios));
  const maxField = Math.max(1, ...metrics.fields.map((field) => field.reprovacoes));
  const fastestSupervisors = [...metrics.supervisorRows].sort((a, b) => a.mediaMs - b.mediaMs).slice(0, 6);
  const slowestSupervisors = [...metrics.supervisorRows].sort((a, b) => b.mediaMs - a.mediaMs).slice(0, 6);
  const maxSupervisorDuration = Math.max(1, ...metrics.supervisorRows.map((item) => item.mediaMs));

  const filteredCompanies = useMemo(() => {
    return [...metrics.companies].sort((a, b) => {
      if (b.retrabalho !== a.retrabalho) return b.retrabalho - a.retrabalho;
      return a.nome.localeCompare(b.nome);
    });
  }, [metrics.companies]);

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / pageSize));
  const pageItems = filteredCompanies.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [period, search, pageSize]);

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <span className="rounded-2xl bg-blue-50 p-3 text-blue-600">
              <BarChart3 size={28} />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Administrativo</p>
              <h1 className="text-2xl font-black text-slate-950">Relatórios de documentos</h1>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Analise produtividade, retrabalho, empresas com maior acerto e pontos de atenção.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw size={16} /> Atualizar
          </button>
        </div>
      </header>

      {message ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{message}</div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={FileText} label="Envios analisados" value={metrics.analisados} description={`${metrics.envios} envio(s) no período`} />
        <KpiCard icon={FileCheck2} label="Documentos analisados" value={metrics.documentosAnalisados} description={`${metrics.documentos} arquivo(s) enviados`} tone="green" />
        <KpiCard icon={AlertTriangle} label="Retrabalho" value={metrics.retrabalho} description={`${percent(metrics.retrabalho, metrics.analisados)} dos envios analisados`} tone="red" />
        <KpiCard icon={TrendingUp} label="Taxa de acerto" value={percent(metrics.analisados - metrics.retrabalho, metrics.analisados)} description={`${metrics.aprovados} envio(s) aprovados`} tone="green" />
        <KpiCard icon={Clock3} label="Aguardando supervisor" value={metrics.aguardandoSupervisor} description={`Média parada: ${durationLabel(metrics.tempoMedioPendenteSupervisorMs)}`} tone="amber" />
        <KpiCard icon={Clock3} label="Tempo médio operacional" value={durationLabel(metrics.tempoMedioSupervisorMs)} description={`${metrics.tempoSupervisorCount} avaliação(ões) com tempo medido`} tone="blue" />
        <KpiCard icon={ReceiptText} label="Notas fiscais" value={metrics.notasFiscais} description={`${formatCurrency(metrics.valorNotasFiscais)} em notas`} tone="amber" />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por empresa, regional ou supervisor"
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          >
            <option value="todos">Todos os períodos</option>
            {periods.map((key) => (
              <option key={key} value={key}>{monthLabel(key)}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">Evolução mensal</h2>
              <p className="text-sm font-semibold text-slate-500">Envios, aprovações e retrabalho nos últimos meses.</p>
            </div>
            <BarChart3 className="text-blue-600" size={22} />
          </div>
          <div className="space-y-4">
            {metrics.months.length ? metrics.months.map((item) => (
              <div key={item.key} className="grid gap-2 sm:grid-cols-[120px_1fr_110px] sm:items-center">
                <p className="text-sm font-black text-slate-700">{item.label}</p>
                <div className="h-4 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(4, (item.envios / maxMonth) * 100)}%` }} />
                </div>
                <p className="text-sm font-black text-slate-600">
                  {item.envios} envio(s)
                </p>
                <div className="sm:col-start-2 sm:col-end-4 flex flex-wrap gap-2 text-xs font-black">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{item.aprovados} aprovados</span>
                  <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">{item.retrabalho} com retrabalho</span>
                </div>
              </div>
            )) : (
              <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">Nenhum envio encontrado no período.</p>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Documentos com maior retrabalho</h2>
          <p className="mb-5 text-sm font-semibold text-slate-500">Tipos de documento mais reprovados.</p>
          <div className="space-y-3">
            {metrics.fields.length ? metrics.fields.map((field) => (
              <RankingBar
                key={field.id}
                label={field.nome}
                value={field.reprovacoes}
                max={maxField}
                detail="reprovação(ões)"
                tone="amber"
              />
            )) : (
              <p className="rounded-2xl bg-emerald-50 p-6 text-center text-sm font-bold text-emerald-700">
                Nenhum documento reprovado no período.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">Notas fiscais por mês</h2>
              <p className="text-sm font-semibold text-slate-500">Quantidade e valor total anexados aos envios aprovados.</p>
            </div>
            <ReceiptText className="text-orange-600" size={22} />
          </div>
          <div className="space-y-3">
            {metrics.invoiceMonths.length ? metrics.invoiceMonths.map((item) => (
              <div key={item.key} className="grid gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-[130px_1fr_140px] sm:items-center">
                <p className="text-sm font-black text-slate-800">{item.label}</p>
                <p className="text-sm font-bold text-slate-500">{item.notas} nota(s)</p>
                <p className="text-right text-sm font-black text-slate-950">{formatCurrency(item.valor)}</p>
              </div>
            )) : (
              <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">Nenhuma nota fiscal encontrada no período.</p>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Notas fiscais por ano</h2>
          <p className="mb-5 text-sm font-semibold text-slate-500">Resumo anual dos valores anexados.</p>
          <div className="space-y-3">
            {metrics.invoiceYears.length ? metrics.invoiceYears.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div>
                  <p className="text-sm font-black text-slate-900">{item.label}</p>
                  <p className="text-xs font-semibold text-slate-500">{item.notas} nota(s)</p>
                </div>
                <p className="text-lg font-black text-slate-950">{formatCurrency(item.valor)}</p>
              </div>
            )) : (
              <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">Nenhuma nota fiscal encontrada.</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Empresas com mais retrabalho</h2>
          <p className="mb-5 text-sm font-semibold text-slate-500">Onde a validação mais voltou para correção.</p>
          <div className="space-y-3">
            {[...metrics.companies].sort((a, b) => b.retrabalho - a.retrabalho).slice(0, 6).map((company) => (
              <RankingBar
                key={company.id}
                label={company.nome}
                value={company.retrabalho}
                max={maxRetrabalho}
                detail={`${company.regional} · ${percent(company.retrabalho, company.analisados)} de retrabalho`}
                tone="red"
              />
            ))}
            {!metrics.companies.length ? <p className="text-sm font-bold text-slate-500">Nenhuma empresa encontrada.</p> : null}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Empresas que mais enviam certo</h2>
          <p className="mb-5 text-sm font-semibold text-slate-500">Ranking por aprovações e menor retrabalho.</p>
          <div className="space-y-3">
            {[...metrics.companies]
              .filter((company) => company.analisados > 0)
              .sort((a, b) => (b.taxaAcerto - a.taxaAcerto) || (b.aprovados - a.aprovados))
              .slice(0, 6)
              .map((company) => (
                <RankingBar
                  key={company.id}
                  label={company.nome}
                  value={company.aprovados}
                  max={maxAcertos}
                  detail={`${company.regional} · ${percent(company.analisados - company.retrabalho, company.analisados)} de acerto`}
                  tone="green"
                />
              ))}
            {!metrics.companies.length ? <p className="text-sm font-bold text-slate-500">Nenhuma empresa encontrada.</p> : null}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Supervisores mais rápidos</h2>
          <p className="mb-5 text-sm font-semibold text-slate-500">Menor tempo médio entre envio e avaliação operacional.</p>
          <div className="space-y-3">
            {fastestSupervisors.length ? fastestSupervisors.map((supervisor) => (
              <SupervisorDurationBar
                key={supervisor.id}
                item={supervisor}
                max={maxSupervisorDuration}
                tone="blue"
              />
            )) : (
              <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
                Ainda não há avaliações operacionais com tempo medido.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Supervisores que mais demoram</h2>
          <p className="mb-5 text-sm font-semibold text-slate-500">Maior tempo médio parado antes da avaliação operacional.</p>
          <div className="space-y-3">
            {slowestSupervisors.length ? slowestSupervisors.map((supervisor) => (
              <SupervisorDurationBar
                key={supervisor.id}
                item={supervisor}
                max={maxSupervisorDuration}
                tone="red"
              />
            )) : (
              <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
                Ainda não há avaliações operacionais com tempo medido.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950">Resumo por empresa</h2>
            <p className="text-sm font-semibold text-slate-500">Visão auditável dos envios, aprovações e correções.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">
            <Building2 size={14} /> {filteredCompanies.length} empresa(s)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full divide-y divide-slate-100 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Empresa</th>
                <th className="px-5 py-3">Regional</th>
                <th className="px-5 py-3">Envios</th>
                <th className="px-5 py-3">Analisados</th>
                  <th className="px-5 py-3">Aprovados</th>
                  <th className="px-5 py-3">Retrabalho</th>
                  <th className="px-5 py-3">Notas fiscais</th>
                  <th className="px-5 py-3">Valor NF</th>
                  <th className="px-5 py-3">Taxa de acerto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.map((company) => (
                <tr key={company.id} className="hover:bg-slate-50/70">
                  {(() => {
                    const invoiceCompany = metrics.invoiceCompanies.find((item) => item.id === company.id) || { notas: 0, valor: 0 };
                    return (
                      <>
                  <td className="px-5 py-4 font-black text-slate-900">{company.nome}</td>
                  <td className="px-5 py-4 font-semibold text-slate-600">{company.regional}</td>
                  <td className="px-5 py-4 font-black text-slate-800">{company.envios}</td>
                  <td className="px-5 py-4 font-black text-slate-800">{company.analisados}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                      <CheckCircle2 size={13} /> {company.aprovados}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-black text-red-700">
                      <AlertTriangle size={13} /> {company.retrabalho}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-black text-slate-800">{invoiceCompany.notas}</td>
                  <td className="px-5 py-4 font-black text-slate-800">{formatCurrency(invoiceCompany.valor)}</td>
                  <td className="px-5 py-4 font-black text-slate-900">
                    {percent(company.analisados - company.retrabalho, company.analisados)}
                  </td>
                      </>
                    );
                  })()}
                </tr>
              ))}
              {!pageItems.length ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-sm font-bold text-slate-500">
                    Nenhum resultado encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination
          page={Math.min(page, totalPages)}
          totalPages={totalPages}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={setPageSize}
        />
      </section>
    </div>
  );
}
