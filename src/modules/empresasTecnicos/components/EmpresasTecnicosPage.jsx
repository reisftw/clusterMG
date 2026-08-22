import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Camera,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Eye,
  File,
  FolderPlus,
  FolderOpen,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Spinner from "../../../components/ui/Spinner";
import ModalShell from "../../../components/ui/ModalShell";
import { useAuthContext } from "../../../context/AuthContext";
import { hasPermission, ROLES } from "../../../constants/roles";
import { ROUTES } from "../../../router/routes";
import { criarUsuarioAdmin } from "../../auth/services/authService";
import { useRegionais } from "../../regionais/hooks/useRegionais";
import { useEmpresasTecnicos } from "../hooks/useEmpresasTecnicos";
import {
  baixarEnvioDocumentosZip,
  baixarDriveItemEmpresa,
  carregarDriveItemEmpresaUrl,
  criarPastaEmpresa,
  listarPastaDriveEmpresa,
  listarEnviosDocumentos,
  obterCobrancaDocumentos,
} from "../../documentos/services/documentosService";
import { buildDocumentosFinanceiroEmail } from "../../documentos/utils/financeiroEmail";
import {
  DEFAULT_EMPRESA_TECNICOS_FORM,
  LOGO_MAX_BYTES,
  normalizeEmpresaStatus,
  normalizeText,
  slugifyEmpresa,
} from "../services/empresasTecnicosService";

const ATUACOES = [
  { value: "Ativacao", label: "Ativação" },
  { value: "Manutencao", label: "Manutenção" },
  { value: "Ambos", label: "Ambos" },
];

const EMPRESA_STATUS_OPTIONS = [
  { value: "Ativa", label: "Ativa" },
  { value: "Inativa", label: "Inativa" },
];

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

function createTecnico() {
  return {
    id: crypto.randomUUID(),
    nome: "",
    emailHubsoft: "",
    telefone: "",
    cidade: "",
    status: "Ativo",
  };
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}

function formatMonthLabel(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return value || "-";
  const monthNames = [
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
  return `${monthNames[Number(match[2]) - 1] || match[2]}/${match[1]}`;
}

function formatCnpj(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 14) return value || "-";
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function canPreviewDriveItem(item) {
  const mime = String(item?.mimeType || "");
  return mime === "application/pdf" || mime.startsWith("image/");
}

function FinanceiroEmailModal({ text, onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <ModalShell onClose={onClose} showClose={false} size="3xl" bodyClassName="p-0">
      <div className="overflow-hidden">
        <header className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-600">Financeiro</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">E-mail para envio da documentação</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">
            Fechar
          </button>
        </header>
        <div className="p-5">
          <textarea
            readOnly
            value={text}
            className="min-h-[360px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-800 outline-none"
          />
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={handleCopy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700">
              <Copy size={16} /> {copied ? "Copiado" : "Copiar e-mail"}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function DrivePreviewModal({ item, url, onClose }) {
  return (
    <ModalShell onClose={onClose} showClose={false} size="5xl" bodyClassName="p-0">
      <div className="flex min-h-0 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-4 border-b border-slate-100 p-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Visualização</p>
            <h2 className="truncate text-lg font-black text-slate-950">{item?.name || "Documento"}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">
            Fechar
          </button>
        </header>
        <div className="min-h-0 flex-1 bg-slate-100 p-3">
          {String(item?.mimeType || "").startsWith("image/") ? (
            <img src={url} alt={item?.name || "Documento"} className="mx-auto max-h-[75vh] max-w-full rounded-2xl bg-white object-contain shadow-sm" />
          ) : (
            <iframe title={item?.name || "Documento"} src={url} className="h-[75vh] w-full rounded-2xl border border-slate-200 bg-white" />
          )}
        </div>
      </div>
    </ModalShell>
  );
}

function statusBadgeClass(status) {
  const styles = {
    pendente: "border-amber-200 bg-amber-50 text-amber-700",
    aprovado: "border-emerald-200 bg-emerald-50 text-emerald-700",
    reprovado: "border-red-200 bg-red-50 text-red-700",
  };
  return `inline-flex rounded-full border px-2.5 py-1 text-xs font-black uppercase ${styles[status] || styles.pendente}`;
}

function empresaStatusClass(status) {
  const normalized = normalizeEmpresaStatus(status);
  return normalized === "Inativa"
    ? {
        box: "border-red-100 bg-red-50",
        label: "text-red-700",
        value: "text-red-700",
      }
    : {
        box: "border-emerald-100 bg-emerald-50",
        label: "text-emerald-700",
        value: "text-emerald-700",
      };
}

function firstLetters(value) {
  return String(value || "EM")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => item[0]?.toUpperCase())
    .join("");
}

function canSeeEmpresa(user, empresa) {
  if (!empresa) return false;
  const role = normalizeText(user?.role);
  if (role === ROLES.SUPERVISOR) {
    return normalizeText(user?.regional) === normalizeText(empresa.regional);
  }
  if (![ROLES.LIDER_EMPRESA, ROLES.AGENTE_AUTORIZADO].includes(role)) return true;
  const userEmpresaId = String(user?.empresaId || user?.empresa_id || "");
  const userEmpresaNome = normalizeText(user?.empresaNome || user?.empresa_nome);
  return Boolean(
    (userEmpresaId && userEmpresaId === empresa.id) ||
      (userEmpresaNome && userEmpresaNome === normalizeText(empresa.nome)),
  );
}

function canEditEmpresa(user, empresa) {
  const role = normalizeText(user?.role);
  if (hasPermission(role, "manage_empresas_tecnicos") && role !== ROLES.LIDER_EMPRESA) return true;
  return [ROLES.LIDER_EMPRESA, ROLES.AGENTE_AUTORIZADO].includes(role) && canSeeEmpresa(user, empresa);
}

function canCreateEmpresaUser(user, empresa) {
  const role = normalizeText(user?.role);
  if (role === ROLES.ADMIN) return true;
  if (role === ROLES.SUPERVISOR_ADMINISTRATIVO) return true;
  if (role !== ROLES.SUPERVISOR) return false;
  return normalizeText(user?.regional) === normalizeText(empresa?.regional);
}

function buildForm(empresa) {
  return {
    ...DEFAULT_EMPRESA_TECNICOS_FORM,
    ...(empresa || {}),
    status: normalizeEmpresaStatus(empresa?.status),
    responsavel: {
      ...DEFAULT_EMPRESA_TECNICOS_FORM.responsavel,
      ...(empresa?.responsavel || {}),
    },
    supervisor: {
      ...DEFAULT_EMPRESA_TECNICOS_FORM.supervisor,
      ...(empresa?.supervisor || {}),
    },
    tecnicos: empresa?.tecnicos?.length ? empresa.tecnicos : [createTecnico()],
  };
}

function EmpresaLogo({ empresa, className = "" }) {
  if (empresa?.logo) {
    return (
      <img
        src={empresa.logo}
        alt={empresa.nome}
        className={`bg-white object-contain p-1 ${className}`}
      />
    );
  }
  return (
    <div className={`flex items-center justify-center bg-blue-50 text-blue-700 ${className}`}>
      <span className="text-xl font-black">{firstLetters(empresa?.nome)}</span>
    </div>
  );
}

function Metric({ label, value, tone = "slate" }) {
  const styles = {
    slate: "border-slate-200 bg-white text-slate-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${styles[tone] || styles.slate}`}>
      <p className="text-xs font-black uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function EmpresasMetricCard({ icon: Icon, label, value, helper, tone = "blue" }) {
  const styles = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    purple: "bg-violet-50 text-violet-700 border-violet-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${styles[tone] || styles.blue}`}>
            <Icon size={22} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
            <p className="text-xs font-semibold text-slate-500">{helper}</p>
          </div>
        </div>
        <div className={`h-8 w-16 rounded-full opacity-80 ${tone === "green" ? "bg-emerald-100" : tone === "purple" ? "bg-violet-100" : tone === "amber" ? "bg-amber-100" : "bg-blue-100"}`} />
      </div>
    </div>
  );
}

function PaginationControls({ page, totalPages, totalItems, pageSize, pageSizeOptions, onPageChange, onPageSizeChange, label = "registros" }) {
  const safeTotalPages = Math.max(1, totalPages);
  const start = totalItems ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(totalItems, page * pageSize);
  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <p>
        Mostrando {start} a {end} de {totalItems} {label}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(1)} className="rounded-xl border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          «
        </button>
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-xl border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          ‹
        </button>
        {Array.from({ length: safeTotalPages }).slice(0, 5).map((_, index) => {
          const pageNumber = Math.min(safeTotalPages, Math.max(1, page - 2) + index);
          return (
            <button
              key={`${pageNumber}-${index}`}
              type="button"
              onClick={() => onPageChange(pageNumber)}
              className={`rounded-xl border px-3 py-2 ${pageNumber === page ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
            >
              {pageNumber}
            </button>
          );
        })}
        <button type="button" disabled={page >= safeTotalPages} onClick={() => onPageChange(page + 1)} className="rounded-xl border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          ›
        </button>
        <button type="button" disabled={page >= safeTotalPages} onClick={() => onPageChange(safeTotalPages)} className="rounded-xl border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          »
        </button>
      </div>
      <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 outline-none">
        {pageSizeOptions.map((option) => (
          <option key={option} value={option}>{option} por página</option>
        ))}
      </select>
    </div>
  );
}

function EmpresaForm({ initialValue, regionais, supervisores, currentUser, onCancel, onSave, saving }) {
  const [form, setForm] = useState(() => buildForm(initialValue));
  const [logoError, setLogoError] = useState("");
  const canChangeSupervisor = normalizeText(currentUser?.role) === ROLES.ADMIN;

  const regionaisOrdenadas = useMemo(
    () => [...(regionais || [])].sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR")),
    [regionais],
  );

  const cidadesDisponiveis = useMemo(() => {
    const selected = normalizeText(form.regional);
    return regionaisOrdenadas
      .filter((regional) => normalizeText(regional.nome) === selected)
      .flatMap((regional) => regional.cidades || [])
      .map((cidade) => (typeof cidade === "string" ? cidade : cidade?.nome || cidade?.cidade || ""))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [form.regional, regionaisOrdenadas]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const updateNested = (group, field, value) =>
    setForm((current) => ({
      ...current,
      [group]: { ...(current[group] || {}), [field]: value },
    }));

  const handleRegionalChange = (value) => {
    const supervisor = supervisores.find((item) => normalizeText(item.regional) === normalizeText(value));
    setForm((current) => ({
      ...current,
      regional: value,
      cidades: [],
      supervisor:
        canChangeSupervisor && current.supervisor?.uid
          ? current.supervisor
          : supervisor
            ? { uid: supervisor.id, nome: supervisor.nome, email: supervisor.email }
            : DEFAULT_EMPRESA_TECNICOS_FORM.supervisor,
    }));
  };

  const toggleCidade = (cidade) =>
    setForm((current) => {
      const exists = current.cidades.some((item) => normalizeText(item) === normalizeText(cidade));
      return {
        ...current,
        cidades: exists
          ? current.cidades.filter((item) => normalizeText(item) !== normalizeText(cidade))
          : [...current.cidades, cidade],
      };
    });

  const updateTecnico = (id, field, value) =>
    setForm((current) => ({
      ...current,
      tecnicos: current.tecnicos.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    }));

  const addTecnico = () =>
    setForm((current) => ({ ...current, tecnicos: [...current.tecnicos, createTecnico()] }));

  const removeTecnico = (id) =>
    setForm((current) => ({
      ...current,
      tecnicos: current.tecnicos.length > 1 ? current.tecnicos.filter((item) => item.id !== id) : current.tecnicos,
    }));

  const handleLogo = (file) => {
    setLogoError("");
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError("A logo deve ter no máximo 450 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update("logo", String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSave({
      ...form,
      slug: form.slug || slugifyEmpresa(form.nome),
    });
  };

  return (
    <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-950">
            {initialValue?.id ? "Editar empresa" : "Cadastrar empresa"}
          </h2>
          <p className="text-sm text-slate-500">
            Dados usados para alertas, perfil, técnicos e histórico de acerto de estoque.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          <X size={16} /> Fechar
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-5 xl:grid-cols-12">
        <div className="xl:col-span-3">
          <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Logo da empresa</span>
          <div className="rounded-3xl border border-dashed border-blue-200 bg-blue-50/40 p-4 text-center">
            <EmpresaLogo empresa={form} className="mx-auto h-28 w-28 rounded-3xl shadow-sm" />
            <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700">
              <Upload size={16} /> Enviar logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => handleLogo(event.target.files?.[0])}
              />
            </label>
            <p className="mt-2 text-xs font-semibold text-slate-500">PNG, JPG ou WebP até 450 KB.</p>
            {logoError ? <p className="mt-2 text-xs font-bold text-red-600">{logoError}</p> : null}
          </div>
        </div>

        <div className="grid gap-4 xl:col-span-9 xl:grid-cols-2">
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Empresa</span>
            <input
              value={form.nome}
              onChange={(event) => update("nome", event.target.value)}
              className={inputClass}
              required
              placeholder="Nome da empresa"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">CNPJ</span>
            <input
              value={form.cnpj || ""}
              onChange={(event) => update("cnpj", event.target.value)}
              className={inputClass}
              inputMode="numeric"
              placeholder="00.000.000/0000-00"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">E-mail de alertas</span>
            <input
              type="email"
              value={form.responsavel.email}
              onChange={(event) => updateNested("responsavel", "email", event.target.value)}
              className={inputClass}
              placeholder="alertas@empresa.com"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Responsável</span>
            <input
              value={form.responsavel.nome}
              onChange={(event) => updateNested("responsavel", "nome", event.target.value)}
              className={inputClass}
              placeholder="Nome do responsável"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Regional</span>
            <select
              value={form.regional}
              onChange={(event) => handleRegionalChange(event.target.value)}
              className={inputClass}
            >
              <option value="">Selecione</option>
              {regionaisOrdenadas.map((regional) => (
                <option key={regional.id || regional.nome} value={regional.nome}>
                  {regional.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Supervisor responsável</span>
            <select
              value={form.supervisor.uid}
              disabled={!canChangeSupervisor}
              onChange={(event) => {
                const supervisor = supervisores.find((item) => item.id === event.target.value);
                update("supervisor", supervisor ? { uid: supervisor.id, nome: supervisor.nome, email: supervisor.email } : DEFAULT_EMPRESA_TECNICOS_FORM.supervisor);
              }}
              className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500`}
            >
              <option value="">Sem supervisor</option>
              {supervisores.map((supervisor) => (
                <option key={supervisor.id} value={supervisor.id}>
                  {supervisor.nome} {supervisor.regional ? `- ${supervisor.regional}` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              {canChangeSupervisor
                ? "Admin pode selecionar qualquer supervisor, mesmo de outra regional."
                : "Somente admin pode alterar o supervisor responsável."}
            </p>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Atuação</span>
            <select value={form.atuacao} onChange={(event) => update("atuacao", event.target.value)} className={inputClass}>
              {ATUACOES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Status da empresa</span>
            <select value={normalizeEmpresaStatus(form.status)} onChange={(event) => update("status", event.target.value)} className={inputClass}>
              {EMPRESA_STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">
            <span className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-amber-700">
              <Star size={16} /> Agente autorizado
            </span>
            <span className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(form.agenteAutorizado)}
                onChange={(event) => update("agenteAutorizado", event.target.checked)}
              />
              É agente?
            </span>
          </label>
          {form.agenteAutorizado ? (
            <label>
              <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Cidade(s) do agente</span>
              <textarea
                value={(form.agenteCidades || []).join("\n")}
                onChange={(event) => update("agenteCidades", event.target.value.split(/\n|,|;/).map((item) => item.trim()).filter(Boolean))}
                className={`${inputClass} min-h-24`}
                placeholder="Uma cidade por linha"
              />
              <p className="mt-1 text-xs font-semibold text-slate-400">Você pode informar mais de uma cidade.</p>
            </label>
          ) : null}
        </div>

        <div className="xl:col-span-6">
          <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Cidades que atua</span>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
            {cidadesDisponiveis.length ? cidadesDisponiveis.map((cidade) => (
              <label key={cidade} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.cidades.some((item) => normalizeText(item) === normalizeText(cidade))}
                  onChange={() => toggleCidade(cidade)}
                />
                {cidade}
              </label>
            )) : (
              <p className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-400">
                Selecione uma regional para carregar as cidades.
              </p>
            )}
          </div>
        </div>

        <div className="xl:col-span-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="block text-xs font-black uppercase tracking-wide text-slate-500">Técnicos</span>
            <button
              type="button"
              onClick={addTecnico}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-50"
            >
              <Plus size={14} /> Técnico
            </button>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
            {form.tecnicos.map((tecnico) => (
              <div key={tecnico.id} className="grid gap-2 rounded-xl bg-white p-3 md:grid-cols-[1fr_1fr_150px_1fr_38px]">
                <input
                  value={tecnico.nome}
                  onChange={(event) => updateTecnico(tecnico.id, "nome", event.target.value)}
                  className={inputClass}
                  placeholder="Nome"
                />
                <input
                  type="email"
                  value={tecnico.emailHubsoft || ""}
                  onChange={(event) => updateTecnico(tecnico.id, "emailHubsoft", event.target.value)}
                  className={inputClass}
                  placeholder="E-mail Hubsoft"
                />
                <input
                  value={tecnico.telefone}
                  onChange={(event) => updateTecnico(tecnico.id, "telefone", event.target.value)}
                  className={inputClass}
                  placeholder="Telefone"
                />
                <input
                  value={tecnico.cidade}
                  onChange={(event) => updateTecnico(tecnico.id, "cidade", event.target.value)}
                  className={inputClass}
                  placeholder="Cidade"
                />
                <button
                  type="button"
                  onClick={() => removeTecnico(tecnico.id)}
                  className="rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Remover técnico"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <label className="xl:col-span-12">
          <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Observações</span>
          <textarea
            value={form.observacoes}
            onChange={(event) => update("observacoes", event.target.value)}
            className={`${inputClass} min-h-24`}
            placeholder="Regras, contatos alternativos, SLA ou observações operacionais."
          />
        </label>

        <div className="flex justify-end xl:col-span-12">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-100 hover:bg-blue-700 disabled:opacity-60"
          >
            <Save size={18} /> {saving ? "Salvando..." : "Salvar empresa"}
          </button>
        </div>
      </form>
    </section>
  );
}

function CriarLiderEmpresaModal({ empresa, onClose, onCreated }) {
  const [form, setForm] = useState({
    nome: empresa?.responsavel?.nome || "",
    email: empresa?.responsavel?.email || "",
    temporaryPassword: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const result = await criarUsuarioAdmin({
        nome: form.nome,
        email: form.email,
        role: empresa?.agenteAutorizado ? ROLES.AGENTE_AUTORIZADO : ROLES.LIDER_EMPRESA,
        regional: empresa.regional,
        empresaId: empresa.id,
        empresaNome: empresa.nome,
        temporaryPassword: form.temporaryPassword,
      });
      setMessage(`Usuário criado. Senha temporária: ${result?.temporaryPassword || "-"}`);
      onCreated?.();
    } catch (error) {
      setMessage(error?.message || "Não foi possível criar o usuário.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose} showClose={false} size="lg" bodyClassName="p-0">
      <form onSubmit={handleSubmit} className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-950">
              {empresa?.agenteAutorizado ? "Criar Agente Autorizado" : "Criar Líder Empresa"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              A conta será vinculada à empresa {empresa.nome}.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 p-2 text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Nome</span>
            <input
              value={form.nome}
              onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
              className={inputClass}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">E-mail</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              className={inputClass}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Senha temporária</span>
            <input
              value={form.temporaryPassword}
              onChange={(event) => setForm((current) => ({ ...current, temporaryPassword: event.target.value }))}
              className={inputClass}
              placeholder="Opcional. Se vazio, o sistema gera."
            />
          </label>
          {message ? (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm font-bold text-blue-800">
              {message}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">
            Fechar
          </button>
          <button disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60">
            {saving ? "Criando..." : "Criar usuário"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function EmpresaProfile({
  empresa,
  acertos,
  loadingAcertos,
  canEdit,
  onEdit,
  canEditSupervisor,
  onEditSupervisor,
  ownerUser,
  canCreateOwnerUser,
  onCreateOwnerUser,
}) {
  const latestAcertos = acertos.slice(0, 20);
  const [documentos, setDocumentos] = useState([]);
  const [loadingDocumentos, setLoadingDocumentos] = useState(false);
  const [documentosError, setDocumentosError] = useState("");
  const [driveMessage, setDriveMessage] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [financeiroTemplate, setFinanceiroTemplate] = useState("");
  const [financeiroEmailText, setFinanceiroEmailText] = useState("");
  const [financeiroLoadingId, setFinanceiroLoadingId] = useState("");
  const [driveFolder, setDriveFolder] = useState(null);
  const [driveItems, setDriveItems] = useState([]);
  const [drivePath, setDrivePath] = useState([]);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [drivePreview, setDrivePreview] = useState(null);
  const [drivePreviewUrl, setDrivePreviewUrl] = useState("");

  useEffect(() => {
    let active = true;
    async function loadDocumentos() {
      setLoadingDocumentos(true);
      setDocumentosError("");
      try {
        const [items, config] = await Promise.all([
          listarEnviosDocumentos({ empresaId: empresa.id, limit: 100 }),
          obterCobrancaDocumentos().catch(() => null),
        ]);
        if (active) setDocumentos(items);
        if (active) setFinanceiroTemplate(config?.financeEmailTemplate || "");
      } catch (error) {
        if (active) setDocumentosError(error?.message || "Não foi possível carregar documentos da empresa.");
      } finally {
        if (active) setLoadingDocumentos(false);
      }
    }
    loadDocumentos();
    return () => {
      active = false;
    };
  }, [empresa.id]);

  const loadDriveFolder = useCallback(async (folderId = "", nextPath = null) => {
    setLoadingDrive(true);
    setDocumentosError("");
    try {
      const response = await listarPastaDriveEmpresa(empresa.id, folderId);
      setDriveFolder(response.folder || null);
      setDriveItems(response.items || []);
      setDrivePath(nextPath || [{ id: response.folder?.id || response.rootFolderId, name: "Raiz" }]);
    } catch (error) {
      setDocumentosError(error?.message || "Não foi possível listar a pasta da empresa.");
    } finally {
      setLoadingDrive(false);
    }
  }, [empresa.id]);

  useEffect(() => {
    setDriveFolder(null);
    setDriveItems([]);
    setDrivePath([]);
    loadDriveFolder();
  }, [empresa.id, loadDriveFolder]);

  useEffect(() => () => {
    if (drivePreviewUrl) URL.revokeObjectURL(drivePreviewUrl);
  }, [drivePreviewUrl]);

  const handleEnsureFolder = async () => {
    setCreatingFolder(true);
    setDriveMessage("");
    setDocumentosError("");
    try {
      const response = await criarPastaEmpresa(empresa.id);
      const folderId = response?.folder?.driveFolderId || response?.driveFolderId || "";
      setDriveMessage(folderId ? `Pasta criada/garantida no Drive. ID: ${folderId}` : "Pasta criada/garantida no Drive.");
      await loadDriveFolder(folderId || "");
    } catch (error) {
      setDocumentosError(error?.message || "Não foi possível criar a pasta da empresa.");
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleOpenDriveFolder = (item) => {
    const nextPath = [...drivePath, { id: item.id, name: item.name }];
    loadDriveFolder(item.id, nextPath);
  };

  const handleBackDriveFolder = () => {
    if (drivePath.length <= 1) return;
    const nextPath = drivePath.slice(0, -1);
    loadDriveFolder(nextPath.at(-1)?.id || "", nextPath);
  };

  const handlePreviewDriveItem = async (item) => {
    if (!canPreviewDriveItem(item)) {
      await baixarDriveItemEmpresa(empresa.id, item, driveFolder?.id || "");
      return;
    }
    setLoadingDrive(true);
    setDocumentosError("");
    try {
      const url = await carregarDriveItemEmpresaUrl(empresa.id, item, driveFolder?.id || "");
      if (drivePreviewUrl) URL.revokeObjectURL(drivePreviewUrl);
      setDrivePreviewUrl(url);
      setDrivePreview(item);
    } catch (error) {
      setDocumentosError(error?.message || "Não foi possível abrir o arquivo.");
    } finally {
      setLoadingDrive(false);
    }
  };

  const handleFinanceiroEmail = async (submission) => {
    setFinanceiroLoadingId(submission.id);
    setDocumentosError("");
    try {
      await baixarEnvioDocumentosZip(submission);
      setFinanceiroEmailText(buildDocumentosFinanceiroEmail({
        empresa,
        submission,
        template: financeiroTemplate,
      }));
    } catch (error) {
      setDocumentosError(error?.message || "Não foi possível gerar o e-mail ao financeiro.");
    } finally {
      setFinanceiroLoadingId("");
    }
  };

  return (
    <div className="space-y-5">
      {financeiroEmailText ? (
        <FinanceiroEmailModal text={financeiroEmailText} onClose={() => setFinanceiroEmailText("")} />
      ) : null}
      {drivePreview && drivePreviewUrl ? (
        <DrivePreviewModal
          item={drivePreview}
          url={drivePreviewUrl}
          onClose={() => {
            URL.revokeObjectURL(drivePreviewUrl);
            setDrivePreviewUrl("");
            setDrivePreview(null);
          }}
        />
      ) : null}
      <section className="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm">
        <div className="bg-[linear-gradient(135deg,#061b38,#0b4aa2)] p-6 text-white">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-4">
              <EmpresaLogo empresa={empresa} className="h-24 w-24 rounded-3xl bg-white/10 ring-4 ring-white/20" />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-blue-100">Perfil da empresa</p>
                <h1 className="mt-2 text-3xl font-black">{empresa.nome}</h1>
                <p className="mt-1 text-sm font-semibold text-blue-100">
                  {empresa.regional || "-"} · {empresa.atuacao || "Ambos"} · {normalizeEmpresaStatus(empresa.status)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to={ROUTES.EMPRESAS_TECNICOS}
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-black text-white hover:bg-white/20"
              >
                <ArrowLeft size={16} /> Empresas
              </Link>
              {canEdit ? (
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-black text-blue-700 hover:bg-blue-50"
                >
                  <Pencil size={16} /> Editar
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-4">
          <Metric label="Técnicos" value={empresa.tecnicos.length} tone="blue" />
          <Metric label="Cidades" value={empresa.cidades.length} />
          <Metric label="Acertos" value={acertos.length} tone="green" />
          <Metric label="Último acerto" value={acertos[0]?.dataAcerto ? formatDate(acertos[0].dataAcerto).split(",")[0] : "-"} tone="amber" />
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
            <Building2 size={15} /> Dados fiscais
          </p>
          <p className="mt-3 text-lg font-black text-slate-950">{formatCnpj(empresa.cnpj)}</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">CNPJ da empresa</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
            <UserRound size={15} /> Responsável
          </p>
          {empresa.responsavel.nome && canCreateOwnerUser && !ownerUser ? (
            <button
              type="button"
              onClick={onCreateOwnerUser}
              className="mt-3 text-left text-lg font-black text-blue-700 underline decoration-blue-200 underline-offset-4 hover:text-blue-800"
            >
              {empresa.responsavel.nome}
            </button>
          ) : (
            <p className="mt-3 text-lg font-black text-slate-950">{empresa.responsavel.nome || "-"}</p>
          )}
          {ownerUser ? (
            <p className="mt-1 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
              Usuário cadastrado
            </p>
          ) : null}
          <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Mail size={15} /> {empresa.responsavel.email || "-"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
            <ShieldCheck size={15} /> Supervisor
          </p>
          <p className="mt-3 text-lg font-black text-slate-950">{empresa.supervisor.nome || "-"}</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">{empresa.supervisor.email || "-"}</p>
          {canEditSupervisor ? (
            <button
              type="button"
              onClick={onEditSupervisor}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-blue-200 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-50"
            >
              <Pencil size={14} /> Alterar supervisor
            </button>
          ) : null}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
            <MapPin size={15} /> Cidades
          </p>
          <p className="mt-3 text-sm font-bold leading-relaxed text-slate-700">
            {empresa.cidades.join(", ") || "-"}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <FolderOpen className="text-blue-600" size={20} />
            <div>
              <h2 className="text-lg font-black text-slate-950">Arquivos da empresa</h2>
              <p className="text-sm text-slate-500">Navegue pelas pastas e documentos do Drive sem sair do sistema.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={loadingDrive || drivePath.length <= 1}
              onClick={handleBackDriveFolder}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <ArrowLeft size={14} /> Voltar
            </button>
            <button
              type="button"
              disabled={loadingDrive}
              onClick={() => loadDriveFolder(driveFolder?.id || "")}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-50 disabled:opacity-60"
            >
              <RefreshCw className={loadingDrive ? "animate-spin" : ""} size={14} /> Atualizar
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
          {(drivePath.length ? drivePath : [{ id: "root", name: "Raiz" }]).map((part, index) => (
            <button
              key={`${part.id}-${index}`}
              type="button"
              disabled={loadingDrive || index === drivePath.length - 1}
              onClick={() => {
                const nextPath = drivePath.slice(0, index + 1);
                loadDriveFolder(part.id, nextPath);
              }}
              className="rounded-lg px-2 py-1 hover:bg-slate-100 disabled:cursor-default disabled:bg-blue-50 disabled:text-blue-700"
            >
              {part.name}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100">
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Tamanho</th>
                  <th className="px-4 py-3">Atualizado</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingDrive ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm font-bold text-blue-700">
                      <RefreshCw className="mx-auto mb-2 animate-spin" size={20} />
                      Carregando arquivos...
                    </td>
                  </tr>
                ) : driveItems.length ? driveItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-black text-slate-900">
                      <div className="flex items-center gap-2">
                        {item.isFolder ? <FolderOpen className="text-amber-500" size={18} /> : <File className="text-blue-600" size={18} />}
                        <span className="max-w-[360px] truncate">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.isFolder ? "Pasta" : item.mimeType || "Arquivo"}</td>
                    <td className="px-4 py-3 text-slate-600">{item.isFolder ? "-" : formatFileSize(item.size)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(item.modifiedTime || item.createdTime)}</td>
                    <td className="px-4 py-3 text-right">
                      {item.isFolder ? (
                        <button
                          type="button"
                          onClick={() => handleOpenDriveFolder(item)}
                          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700"
                        >
                          Abrir <ExternalLink size={14} />
                        </button>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handlePreviewDriveItem(item)}
                            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-50"
                          >
                            <Eye size={14} /> {canPreviewDriveItem(item) ? "Ver" : "Baixar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => baixarDriveItemEmpresa(empresa.id, item, driveFolder?.id || "").catch((error) => setDocumentosError(error?.message || "Não foi possível baixar o arquivo."))}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                          >
                            <Download size={14} /> Baixar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm font-bold text-slate-400">
                      Nenhum arquivo encontrado nesta pasta.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <FileText className="text-blue-600" size={20} />
            <div>
              <h2 className="text-lg font-black text-slate-950">Documentação mensal</h2>
              <p className="text-sm text-slate-500">Meses enviados, status de aprovação e acesso ao pacote financeiro.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {loadingDocumentos ? <RefreshCw className="animate-spin text-blue-600" size={18} /> : null}
            {canEdit ? (
              <button
                type="button"
                disabled={creatingFolder}
                onClick={handleEnsureFolder}
                className="inline-flex items-center gap-2 rounded-xl border border-blue-200 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-50 disabled:opacity-60"
              >
                {creatingFolder ? <RefreshCw className="animate-spin" size={14} /> : <FolderPlus size={14} />}
                Criar pasta
              </button>
            ) : null}
          </div>
        </div>
        {driveMessage ? (
          <div className="mb-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
            {driveMessage}
          </div>
        ) : null}        {documentosError ? (
          <div className="mb-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700">
            {documentosError}
          </div>
        ) : null}
        <div className="overflow-hidden rounded-2xl border border-slate-100">
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Mês</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Enviado em</th>
                  <th className="px-4 py-3">Arquivos</th>
                  <th className="px-4 py-3 text-right">Financeiro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documentos.length ? documentos.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-black text-slate-900">{formatMonthLabel(item.mesReferencia)}</td>
                    <td className="px-4 py-3"><span className={statusBadgeClass(item.status)}>{item.status}</span></td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(item.submittedAt)}</td>
                    <td className="px-4 py-3 text-slate-600">{item.files?.length || 0}</td>
                    <td className="px-4 py-3 text-right">
                      {item.status === "aprovado" ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => baixarEnvioDocumentosZip(item).catch((error) => setDocumentosError(error?.message || "Não foi possível baixar o ZIP."))}
                            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-50"
                          >
                            <Download size={14} /> ZIP
                          </button>
                          <button
                            type="button"
                            disabled={financeiroLoadingId === item.id}
                            onClick={() => handleFinanceiroEmail(item)}
                            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-60"
                          >
                            {financeiroLoadingId === item.id ? <RefreshCw className="animate-spin" size={14} /> : <Send size={14} />}
                            E-mail
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-slate-400">Aguardando aprovação</span>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm font-bold text-slate-400">
                      Nenhum envio de documentação encontrado para esta empresa.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <Users className="text-blue-600" size={20} />
          <div>
            <h2 className="text-lg font-black text-slate-950">Técnicos cadastrados</h2>
            <p className="text-sm text-slate-500">Equipe vinculada à empresa.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {empresa.tecnicos.length ? empresa.tecnicos.map((tecnico) => (
            <div key={tecnico.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="font-black text-slate-950">{tecnico.nome}</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
                <Phone size={14} /> {tecnico.telefone || "-"}
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
                <Mail size={14} /> {tecnico.emailHubsoft || tecnico.email || "Sem e-mail Hubsoft"}
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
                <MapPin size={14} /> {tecnico.cidade || "-"}
              </p>
            </div>
          )) : (
            <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm font-bold text-slate-400">
              Nenhum técnico cadastrado.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">Histórico de acerto de estoque</h2>
            <p className="text-sm text-slate-500">Últimos registros vinculados à empresa.</p>
          </div>
          {loadingAcertos ? <RefreshCw className="animate-spin text-blue-600" size={18} /> : null}
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-100">
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Cidade / turno</th>
                  <th className="px-4 py-3">Técnico</th>
                  <th className="px-4 py-3">Feito por</th>
                  <th className="px-4 py-3">Itens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {latestAcertos.length ? latestAcertos.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-black text-slate-900">{item.codigo}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(item.dataAcerto)}</td>
                    <td className="px-4 py-3 text-slate-600">{item.cidade || "-"} / {item.turno || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{item.tecnico || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{item.feitoPor || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{item.produtos.length}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm font-bold text-slate-400">
                      Nenhum acerto encontrado para esta empresa.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function EmpresasTecnicosPage() {
  const { slug } = useParams();
  const { currentUser } = useAuthContext();
  const { regionais } = useRegionais();
  const {
    empresas,
    supervisores,
    usuariosEmpresa,
    acertos,
    loading,
    loadingAcertos,
    saving,
    error,
    carregar,
    carregarAcertos,
    salvar,
    excluir,
  } = useEmpresasTecnicos();
  const [query, setQuery] = useState("");
  const [regionalFilter, setRegionalFilter] = useState("Todas");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showCreateOwnerUser, setShowCreateOwnerUser] = useState(false);
  const isAdmin = normalizeText(currentUser?.role) === ROLES.ADMIN;

  const visibleEmpresas = useMemo(
    () => empresas.filter((empresa) => canSeeEmpresa(currentUser, empresa)),
    [currentUser, empresas],
  );

  const selectedEmpresa = useMemo(() => {
    if (slug) {
      return visibleEmpresas.find((item) => item.slug === slug || item.id === slug) || null;
    }
    return null;
  }, [slug, visibleEmpresas]);

  const regionaisFiltro = useMemo(
    () =>
      [...new Set(visibleEmpresas.map((empresa) => empresa.regional).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [visibleEmpresas],
  );

  const filteredEmpresas = useMemo(() => {
    const regionalKey = normalizeText(regionalFilter);
    const key = normalizeText(query);
    return visibleEmpresas.filter((empresa) => {
      if (regionalKey && regionalKey !== "todas" && normalizeText(empresa.regional) !== regionalKey) {
        return false;
      }
      if (!key) return true;
      return [empresa.nome, empresa.cnpj, empresa.regional, empresa.responsavel.email, empresa.responsavel.nome, ...empresa.cidades]
        .some((value) => normalizeText(value).includes(key));
    });
  }, [query, regionalFilter, visibleEmpresas]);

  const totalPages = Math.max(1, Math.ceil(filteredEmpresas.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedEmpresas = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredEmpresas.slice(start, start + pageSize);
  }, [filteredEmpresas, pageSize, safePage]);

  const selectedOwnerUser = useMemo(() => {
    if (!selectedEmpresa) return null;
    return usuariosEmpresa.find((usuario) =>
      (usuario.empresaId && usuario.empresaId === selectedEmpresa.id) ||
      (usuario.empresaNome && normalizeText(usuario.empresaNome) === normalizeText(selectedEmpresa.nome)) ||
      (usuario.email && normalizeText(usuario.email) === normalizeText(selectedEmpresa.responsavel.email)),
    ) || null;
  }, [selectedEmpresa, usuariosEmpresa]);

  useEffect(() => {
    if (selectedEmpresa) carregarAcertos(selectedEmpresa);
  }, [carregarAcertos, selectedEmpresa]);

  const handleSave = async (payload) => {
    const ok = await salvar(payload);
    if (ok) {
      setShowForm(false);
      setEditing(null);
    }
  };

  const handleQueryChange = (event) => {
    setQuery(event.target.value);
    setPage(1);
  };

  const handleRegionalFilterChange = (event) => {
    setRegionalFilter(event.target.value);
    setPage(1);
  };

  const handlePageSizeChange = (nextPageSize) => {
    setPageSize(nextPageSize);
    setPage(1);
  };

  if (loading) return <Spinner fullScreen />;

  if (slug) {
    if (!selectedEmpresa) {
      return (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <Building2 size={34} className="mx-auto text-slate-300" />
          <h1 className="mt-3 text-xl font-black text-slate-900">Empresa não encontrada</h1>
          <p className="mt-1 text-sm text-slate-500">Verifique o endereço ou seu vínculo de acesso.</p>
          <Link to={ROUTES.EMPRESAS_TECNICOS} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white">
            <ArrowLeft size={16} /> Voltar
          </Link>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        {showCreateOwnerUser && canCreateEmpresaUser(currentUser, selectedEmpresa) ? (
          <CriarLiderEmpresaModal
            empresa={selectedEmpresa}
            onClose={() => setShowCreateOwnerUser(false)}
            onCreated={() => {
              setShowCreateOwnerUser(false);
              carregar();
            }}
          />
        ) : null}
        {showForm && canEditEmpresa(currentUser, selectedEmpresa) ? (
          <EmpresaForm
            initialValue={editing || selectedEmpresa}
            regionais={regionais}
            supervisores={supervisores}
            currentUser={currentUser}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false);
              setEditing(null);
            }}
            saving={saving}
          />
        ) : null}
        <EmpresaProfile
          empresa={selectedEmpresa}
          acertos={acertos}
          loadingAcertos={loadingAcertos}
          canEdit={canEditEmpresa(currentUser, selectedEmpresa)}
          canEditSupervisor={isAdmin}
          onEditSupervisor={() => {
            setEditing(selectedEmpresa);
            setShowForm(true);
          }}
          ownerUser={selectedOwnerUser}
          canCreateOwnerUser={canCreateEmpresaUser(currentUser, selectedEmpresa)}
          onCreateOwnerUser={() => setShowCreateOwnerUser(true)}
          onEdit={() => {
            setEditing(selectedEmpresa);
            setShowForm(true);
          }}
        />
      </div>
    );
  }

  const canCreate =
    hasPermission(currentUser?.role, "manage_empresas_tecnicos") &&
    normalizeText(currentUser?.role) !== ROLES.LIDER_EMPRESA;

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <Building2 size={23} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-950">Empresas</h1>
              <p className="text-sm text-slate-500">
                Gerencie empresas, técnicos, responsáveis, regionais e visualize o histórico de acertos.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={carregar}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw size={16} /> Atualizar
            </button>
            {canCreate ? (
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setShowForm(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-blue-700"
              >
                <Plus size={16} /> Nova empresa
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      {showForm && canCreate ? (
        <EmpresaForm
          initialValue={editing}
          regionais={regionais}
          supervisores={supervisores}
          currentUser={currentUser}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
          saving={saving}
        />
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <EmpresasMetricCard icon={Building2} label="Empresas" value={visibleEmpresas.length} helper="Total cadastradas" tone="blue" />
        <EmpresasMetricCard icon={CheckCircle2} label="Ativas" value={visibleEmpresas.filter((item) => normalizeEmpresaStatus(item.status) === "Ativa").length} helper="Empresas ativas" tone="green" />
        <EmpresasMetricCard icon={Users} label="Técnicos" value={visibleEmpresas.reduce((sum, item) => sum + item.tecnicos.length, 0)} helper="Total cadastrados" tone="purple" />
        <EmpresasMetricCard icon={MapPin} label="Regionais" value={new Set(visibleEmpresas.map((item) => item.regional).filter(Boolean)).size} helper="Regionais ativas" tone="amber" />
      </section>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950">Empresas cadastradas</h2>
            <p className="text-sm text-slate-500">{filteredEmpresas.length} registro(s)</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-3xl">
            <label className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                value={query}
                onChange={handleQueryChange}
                className={`${inputClass} pl-11`}
                placeholder="Buscar por empresa, regional, cidade ou responsável"
              />
            </label>
            <select
              value={regionalFilter}
              onChange={handleRegionalFilterChange}
              className={`${inputClass} sm:w-64`}
            >
              <option value="Todas">Todas as regionais</option>
              {regionaisFiltro.map((regional) => (
                <option key={regional} value={regional}>
                  {regional}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {paginatedEmpresas.length ? paginatedEmpresas.map((empresa) => (
            <article key={empresa.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start gap-4">
                <EmpresaLogo empresa={empresa} className="h-14 w-14 shrink-0 rounded-2xl" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-black text-slate-950">{empresa.nome}</h3>
                  <p className="mt-1 truncate text-xs font-black uppercase tracking-wide text-slate-500">
                    {empresa.regional || "-"} · {empresa.atuacao}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    CNPJ: {formatCnpj(empresa.cnpj)}
                  </p>
                  <p className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-500">
                    <Mail size={13} /> {empresa.responsavel.email || "Sem e-mail"}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                  <p className="text-[10px] font-black uppercase text-blue-700">Téc.</p>
                  <p className="text-xl font-black text-blue-700">{empresa.tecnicos.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase text-slate-500">Cid.</p>
                  <p className="text-xl font-black text-slate-950">{empresa.cidades.length}</p>
                </div>
                <div className={`rounded-xl border p-3 ${empresaStatusClass(empresa.status).box}`}>
                  <p className={`text-[10px] font-black uppercase ${empresaStatusClass(empresa.status).label}`}>Status</p>
                  <p className={`text-xl font-black ${empresaStatusClass(empresa.status).value}`}>
                    {normalizeEmpresaStatus(empresa.status)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
                <Link
                  to={`${ROUTES.EMPRESAS_TECNICOS}/${empresa.slug || empresa.id}`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700"
                >
                  Ver perfil <ExternalLink size={15} />
                </Link>
                {canEditEmpresa(currentUser, empresa) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(empresa);
                      setShowForm(true);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 text-slate-600 hover:bg-slate-100"
                    aria-label="Editar"
                  >
                    <Pencil size={16} />
                  </button>
                ) : null}
                {canCreate ? (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(`Excluir ${empresa.nome}?`)) return;
                      await excluir(empresa.id);
                    }}
                    className="rounded-xl border border-red-100 bg-white px-3 text-red-500 hover:bg-red-50"
                    aria-label="Excluir"
                  >
                    <Trash2 size={16} />
                  </button>
                ) : null}
              </div>
            </article>
          )) : (
            <div className="col-span-full rounded-3xl border border-dashed border-slate-200 p-10 text-center">
              <Camera size={32} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm font-black text-slate-600">Nenhuma empresa encontrada.</p>
            </div>
          )}
        </div>

        <PaginationControls
          page={safePage}
          totalPages={totalPages}
          totalItems={filteredEmpresas.length}
          pageSize={pageSize}
          pageSizeOptions={[6, 12, 24]}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
          label="empresas"
        />
      </section>
    </div>
  );
}
