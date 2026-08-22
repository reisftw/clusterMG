import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarClock,
  Clock3,
  Mail,
  MessageCircle,
  RefreshCw,
  Search,
  UserRoundCheck,
} from "lucide-react";
import Spinner from "../../../components/ui/Spinner";
import { listarTratativasDocumentos } from "../services/documentosService";

const PAGE_SIZES = [20, 30, 50, 100];
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

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function monthLabel(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return value || "-";
  return `${MONTHS[Number(match[2]) - 1] || match[2]}/${match[1]}`;
}

function elapsedLabel(start, nowTick) {
  const date = start ? new Date(start) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";
  const diff = Math.max(0, nowTick - date.getTime());
  const minutes = Math.floor(diff / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}min`;
  if (hours > 0) return `${hours}h ${mins}min`;
  return `${Math.max(1, mins)}min`;
}

function whatsappLink(item) {
  const digits = String(item.supervisorTelefone || "").replace(/\D/g, "");
  if (!digits) return "";
  const phone = digits.startsWith("55") ? digits : `55${digits}`;
  const message = [
    `Olá, ${item.supervisorNome || "supervisor"}.`,
    `A empresa ${item.empresaNome || "-"} enviou documentos de ${monthLabel(item.mesReferencia)} e ainda aguarda sua avaliação operacional.`,
    `Enviado em: ${formatDateTime(item.submittedAt)}.`,
  ].join("\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function TreatmentCard({ item, nowTick }) {
  const waUrl = whatsappLink(item);
  const mailUrl = item.supervisorEmail
    ? `mailto:${item.supervisorEmail}?subject=${encodeURIComponent(`Documentos aguardando aprovação - ${item.empresaNome || ""}`)}&body=${encodeURIComponent(`Olá, ${item.supervisorNome || "supervisor"}.\n\nA empresa ${item.empresaNome || "-"} enviou documentos de ${monthLabel(item.mesReferencia)} e ainda aguarda sua avaliação operacional.\n\nEnviado em: ${formatDateTime(item.submittedAt)}.`)}`
    : "";

  return (
    <article className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl bg-amber-50 p-2 text-amber-700">
              <CalendarClock size={18} />
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-amber-700">
              Aguardando supervisor
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
              {monthLabel(item.mesReferencia)}
            </span>
          </div>
          <h2 className="mt-4 truncate text-xl font-black text-slate-950">{item.empresaNome || "Empresa sem nome"}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Enviado por {item.submittedByName || item.submittedByEmail || "-"} em {formatDateTime(item.submittedAt)}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px]">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Tempo com supervisor</p>
            <p className="mt-2 flex items-center gap-2 text-2xl font-black text-slate-950">
              <Clock3 size={20} className="text-amber-600" />
              {elapsedLabel(item.submittedAt, nowTick)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Supervisor responsável</p>
            <p className="mt-2 truncate text-base font-black text-slate-950">{item.supervisorNome || "-"}</p>
            <p className="mt-1 truncate text-xs font-bold text-slate-500">{item.regional || "-"}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-3">
        <div className="rounded-2xl bg-blue-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">Documentos enviados</p>
          <p className="mt-2 text-2xl font-black text-blue-950">{item.files?.length || 0}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">E-mail do supervisor</p>
          <p className="mt-2 truncate text-sm font-black text-slate-800">{item.supervisorEmail || "-"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <a
            href={waUrl || undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!waUrl}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black shadow-sm ${
              waUrl
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "cursor-not-allowed bg-slate-100 text-slate-400"
            }`}
          >
            <MessageCircle size={16} /> WhatsApp
          </a>
          <a
            href={mailUrl || undefined}
            aria-disabled={!mailUrl}
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-black ${
              mailUrl
                ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                : "cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400"
            }`}
          >
            <Mail size={16} /> E-mail
          </a>
        </div>
      </div>
    </article>
  );
}

export default function DocumentosTratativasPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [nowTick, setNowTick] = useState(Date.now());

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      const rows = await listarTratativasDocumentos({ limit: 100, offset: 0 });
      setItems(rows);
    } catch (error) {
      setMessage(error?.message || "Não foi possível carregar as tratativas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    const term = normalize(search);
    if (!term) return items;
    return items.filter((item) =>
      normalize(`${item.empresaNome} ${item.regional} ${item.supervisorNome} ${item.submittedByName}`).includes(term),
    );
  }, [items, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const oldest = filtered.reduce((max, item) => Math.max(max, Number(item.tempoSupervisorMs || 0)), 0);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <span className="rounded-2xl bg-amber-50 p-3 text-amber-600">
              <UserRoundCheck size={28} />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-600">Documentos</p>
              <h1 className="text-2xl font-black text-slate-950">Tratativas</h1>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Empresas que enviaram documentos e aguardam avaliação do supervisor operacional.
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

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
          <p className="text-xs font-black uppercase tracking-wide text-amber-700">Tratativas abertas</p>
          <p className="mt-2 text-3xl font-black text-amber-950">{filtered.length}</p>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">Maior tempo parado</p>
          <p className="mt-2 text-3xl font-black text-blue-950">{oldest ? elapsedLabel(Date.now() - oldest, nowTick) : "-"}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Auditoria</p>
          <p className="mt-2 text-sm font-bold text-slate-600">
            O administrativo só recebe após aprovação operacional.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por empresa, regional, supervisor ou responsável pelo envio"
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </label>
      </section>

      <section className="space-y-4">
        {pageItems.map((item) => (
          <TreatmentCard key={item.id} item={item} nowTick={nowTick} />
        ))}
        {!pageItems.length ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <Building2 className="mx-auto text-slate-300" size={36} />
            <p className="mt-3 text-sm font-bold text-slate-500">Nenhuma tratativa aguardando supervisor.</p>
          </div>
        ) : null}
      </section>

      <footer className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold text-slate-500">Página {Math.min(page, totalPages)} de {totalPages}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Próxima
          </button>
          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 outline-none"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>{size} por página</option>
            ))}
          </select>
        </div>
      </footer>
    </div>
  );
}
