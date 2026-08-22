import { useMemo, useState } from "react";
import { BookOpen, CircleHelp, Search, ChevronDown } from "lucide-react";
import { useDashboardData } from "../PainelPublico/hooks/useDashboardData";
import RetorninhoLoader from "../../components/ui/RetorninhoLoader";

let fallbackDuvidaIdCounter = 0;

function createDuvidaId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `duvida_${uuid}`;
  fallbackDuvidaIdCounter += 1;
  return `duvida_${Date.now()}_${fallbackDuvidaIdCounter}`;
}

function normalizeDuvidasPublicas(payload = {}) {
  return {
    titulo: String(payload?.titulo || "Wiki da Retirada").trim(),
    descricao: String(
      payload?.descricao ||
        "Principais duvidas da operacao respondidas de forma rapida.",
    ).trim(),
    atualizadoEm: payload?.atualizadoEm || payload?.atualizado_em || null,
    duvidas: Array.isArray(payload?.duvidas)
      ? payload.duvidas.map((item) => ({
          id: item?.id || createDuvidaId(),
          pergunta: String(item?.pergunta || "").trim(),
          resposta: String(item?.resposta || "").trim(),
          categoria: String(item?.categoria || "").trim(),
        }))
      : [],
  };
}

function formatarAtualizacao(value) {
  if (!value) return "";
  const date =
    typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date?.getTime?.())) return "";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FaqItem({ item, open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full rounded-[28px] border border-slate-200 bg-white p-5 text-left shadow-[0_18px_40px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(15,23,42,0.12)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {item.categoria ? (
            <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">
              {item.categoria}
            </span>
          ) : null}
          <h3 className="mt-3 text-lg font-black tracking-tight text-slate-900">
            {item.pergunta}
          </h3>
        </div>
        <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <ChevronDown
            size={18}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </div>
      {open ? (
        <div className="mt-4 border-t border-slate-100 pt-4 text-sm leading-7 text-slate-600">
          {item.resposta}
        </div>
      ) : null}
    </button>
  );
}

export default function DuvidasPublicoPage() {
  const { data, loading, error } = useDashboardData();
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState(null);

  const conteudo = useMemo(
    () => normalizeDuvidasPublicas(data?.duvidas || {}),
    [data],
  );

  const categorias = useMemo(
    () =>
      [...new Set(conteudo.duvidas.map((item) => item.categoria).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    [conteudo.duvidas],
  );

  const duvidasFiltradas = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conteudo.duvidas;
    return conteudo.duvidas.filter((item) =>
      `${item.pergunta} ${item.resposta} ${item.categoria}`
        .toLowerCase()
        .includes(term),
    );
  }, [conteudo.duvidas, search]);

  const ultimaAtualizacao = formatarAtualizacao(conteudo.atualizadoEm);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#e0ecff_0%,#f7f9fc_38%,#eef2f8_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="overflow-hidden rounded-[36px] bg-gradient-to-br from-slate-950 via-blue-950 to-sky-700 shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
          <div className="px-6 py-8 sm:px-8 sm:py-10 lg:px-10">
            <div className="inline-flex items-center rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-amber-100">
              POP da Retirada
            </div>
            <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
                  {conteudo.titulo}
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">
                  {conteudo.descricao}
                </p>
              </div>
              <div className="rounded-[24px] border border-white/15 bg-white/10 px-5 py-4 backdrop-blur">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-200">
                  Base de consulta
                </p>
                <p className="mt-2 text-3xl font-black text-white">
                  {conteudo.duvidas.length}
                </p>
                <p className="text-xs text-slate-200">
                  respostas organizadas para consulta rapida
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="-mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[32px] border border-slate-200 bg-white/95 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <BookOpen size={20} />
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">
                  Busca rapida
                </h2>
                <p className="text-xs text-slate-500">
                  Encontre o passo a passo certo antes de acionar suporte.
                </p>
              </div>
            </div>

            <label className="relative mt-5 block">
              <Search
                size={17}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por pergunta, resposta ou categoria"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white"
              />
            </label>

            <div className="mt-5 rounded-[28px] bg-slate-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Categorias principais
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {categorias.length === 0 ? (
                  <span className="text-sm text-slate-400">
                    Nenhuma categoria publicada ainda.
                  </span>
                ) : (
                  categorias.map((categoria) => (
                    <span
                      key={categoria}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                    >
                      {categoria}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="mt-5 rounded-[28px] bg-slate-950 p-5 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-amber-300">
                  <CircleHelp size={18} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">
                    Leitura orientada
                  </p>
                  <p className="text-sm text-white/90">
                    Priorize esta wiki antes de abrir duvida operacional.
                  </p>
                </div>
              </div>
              {ultimaAtualizacao ? (
                <p className="mt-4 text-xs text-slate-300">
                  Ultima atualizacao: <strong className="text-white">{ultimaAtualizacao}</strong>
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            {loading ? (
              <div className="rounded-[32px] border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
                <RetorninhoLoader
                  compact
                  title="Carregando wiki..."
                  description="O Retorninho esta separando as respostas."
                />
              </div>
            ) : error ? (
              <div className="rounded-[32px] border border-red-200 bg-red-50 p-8 text-sm text-red-700 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
                {error}
              </div>
            ) : duvidasFiltradas.length === 0 ? (
              <div className="rounded-[32px] border border-slate-200 bg-white p-10 text-center shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
                <p className="text-lg font-bold text-slate-900">
                  Nenhuma resposta encontrada
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Tente outra busca ou volte mais tarde para novas publicacoes.
                </p>
              </div>
            ) : (
              duvidasFiltradas.map((item) => (
                <FaqItem
                  key={item.id}
                  item={item}
                  open={activeId === item.id}
                  onToggle={() =>
                    setActiveId((current) => (current === item.id ? null : item.id))
                  }
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

