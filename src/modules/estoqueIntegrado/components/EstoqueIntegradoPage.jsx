import { useEffect, useState } from "react";
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PackageSearch,
  RefreshCw,
  UsersRound,
} from "lucide-react";
import {
  listarEquipamentosMapaSempre,
  salvarTratativaEquipamentoSempre,
} from "../services/sempreEstoqueService";

const CLASS_TONES = {
  com_cliente: "border-emerald-200 bg-emerald-50 text-emerald-800",
  em_estoque: "border-blue-200 bg-blue-50 text-blue-800",
  outro_vinculo: "border-red-200 bg-red-50 text-red-800",
  nao_encontrado: "border-orange-200 bg-orange-50 text-orange-800",
  indefinido: "border-amber-200 bg-amber-50 text-amber-800",
  erro_consulta: "border-red-200 bg-red-50 text-red-800",
};

function InfoCard({ icon: Icon, label, value, helper, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    orange: "border-orange-200 bg-orange-50 text-orange-900",
    red: "border-red-200 bg-red-50 text-red-900",
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone] || tones.slate}`}>
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-white/80 p-2 shadow-sm">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide opacity-70">{label}</p>
          <p className="mt-1 break-words text-base font-black">{value ?? "-"}</p>
          {helper ? <p className="mt-1 text-xs font-semibold opacity-70">{helper}</p> : null}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, label }) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${CLASS_TONES[status] || CLASS_TONES.indefinido}`}>
      {label || "Sem confirmacao"}
    </span>
  );
}

const TREATMENT_LABELS = {
  pendente: "Pendente",
  em_analise: "Em analise",
  cobrado_tecnico: "Tecnico cobrado",
  resolvido: "Resolvido",
  ignorado: "Ignorado",
};

const TREATMENT_OPTIONS = [
  { value: "pendente", label: "Pendente" },
  { value: "em_analise", label: "Em analise" },
  { value: "cobrado_tecnico", label: "Tecnico cobrado" },
  { value: "resolvido", label: "Resolvido" },
  { value: "ignorado", label: "Ignorado" },
];

function ReadingStatus({ status }) {
  if (!status) return null;
  const percent = Math.min(Math.max(Number(status.percent || 0), 0), 100);
  return (
    <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-black">{status.stage || "Processando leitura"}</p>
          <p className="mt-1 text-xs font-semibold opacity-80">
            {status.processedMacs || 0} de {status.totalMacs || 0} MACs processados. Faltam {status.remainingMacs || 0}.
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700">
          {percent}%
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${percent}%` }} />
      </div>
      {status.error ? (
        <p className="mt-2 text-xs font-bold text-red-700">{status.error}</p>
      ) : null}
    </div>
  );
}

function TreatmentForm({ item, treatment, treatmentStatus, onSaveTreatment, saving }) {
  const [draftStatus, setDraftStatus] = useState(treatmentStatus);
  const [draftNote, setDraftNote] = useState(treatment.observacao || "");

  return (
    <div className="mt-3 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[180px_1fr_auto]">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Tratativa</p>
          <select
            value={draftStatus}
            onChange={(event) => setDraftStatus(event.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none"
          >
            {TREATMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Observacao</p>
          <input
            value={draftNote}
            onChange={(event) => setDraftNote(event.target.value)}
            placeholder="Ex: tecnico cobrado, aguardando devolucao..."
            className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none"
          />
          {treatment.updatedAt ? (
            <p className="mt-1 text-[11px] font-semibold text-slate-400">
              Ultima tratativa: {TREATMENT_LABELS[treatmentStatus] || treatmentStatus} por {treatment.updatedByName || treatment.responsavel || "-"}
            </p>
          ) : null}
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => onSaveTreatment?.(item, { status: draftStatus, observacao: draftNote })}
            disabled={saving}
            className="h-10 rounded-xl bg-slate-900 px-4 text-xs font-black text-white transition hover:bg-slate-800 disabled:bg-slate-300"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
    </div>
  );
}

function EquipmentRow({ item, onSaveTreatment, saving }) {
  const mainResult = item.results?.[0] || {};
  const linked = item.responsibleName || mainResult.primary?.vinculadoEm || mainResult.stockLocal?.display || "-";
  const treatment = item.tratativa || {};
  const treatmentStatus = treatment.status || "pendente";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-black text-slate-950">
            {item.nomeCliente || "Cliente sem nome"}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            OS {item.numero || "-"} - {item.cidade || "-"} - {item.regional || "-"}
          </p>
        </div>
        <StatusBadge status={item.classificationStatus} label={item.classificationLabel} />
      </div>

      <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">MACs</p>
          <p className="mt-1 break-words font-black text-slate-700">{item.macs?.join(" / ") || "-"}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Tecnico no mapa</p>
          <p className="mt-1 break-words font-black text-slate-700">{item.tecnico || "-"}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Vinculo atual</p>
          <p className="mt-1 break-words font-black text-slate-700">{linked}</p>
        </div>
      </div>

      <TreatmentForm
        key={`${treatmentStatus}:${treatment.observacao || ""}`}
        item={item}
        treatment={treatment}
        treatmentStatus={treatmentStatus}
        onSaveTreatment={onSaveTreatment}
        saving={saving}
      />

      {item.acertoProgramado ? (
        <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">
          Acerto programado: {item.acertoProgramado.codigo} - {item.acertoProgramado.cidade || "-"} - {item.acertoProgramado.dataAcerto || "-"}
        </div>
      ) : null}

      {item.results?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.results.map((result) => (
            <span key={result.mac} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              {result.mac}: {result.classification?.reason || result.error || "consultado"}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function EstoqueIntegradoPage() {
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    query: "",
    status: "",
    cidade: "",
    tecnico: "",
    estoque: "",
    empresa: "",
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  async function load(options = {}) {
    setLoading(true);
    setError("");
    try {
      setData(await listarEquipamentosMapaSempre({
        limit,
        page: options.page || page,
        refresh: options.refresh === true,
        filters,
      }));
    } catch (err) {
      setError(err?.message || "Nao foi possivel consultar os equipamentos do mapa.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, page, filters]);

  useEffect(() => {
    if (!data?.refreshing) return undefined;
    const timer = setTimeout(() => {
      load();
    }, 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.refreshing, data?.statusLeitura?.updatedAt]);

  const summary = data?.summary || {};
  const treatmentSummary = data?.treatmentSummary || {};
  const alertas = data?.alertas || {};
  const filterOptions = data?.filterOptions || {};
  const divergentItems = data?.items?.filter((item) => item.classificationStatus !== "com_cliente") || [];

  function updateFilter(key, value) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setPage(1);
    setFilters({
      query: "",
      status: "",
      cidade: "",
      tecnico: "",
      estoque: "",
      empresa: "",
    });
  }

  async function handleSaveTreatment(item, treatment) {
    setSavingId(item.treatmentId);
    setError("");
    try {
      await salvarTratativaEquipamentoSempre({
        id: item.treatmentId,
        status: treatment.status,
        observacao: treatment.observacao,
        macs: item.macs || [],
        item: {
          numero: item.numero,
          documentId: item.documentId,
          cliente: item.nomeCliente,
          cidade: item.cidade,
          tecnico: item.tecnico,
          responsavelAtual: item.responsibleName,
          classificacao: item.classificationLabel,
        },
      });
      await load();
    } catch (err) {
      setError(err?.message || "Nao foi possivel salvar a tratativa.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
              INTEGRACAO SEMPRE
            </p>
            <h1 className="mt-2 text-2xl font-black text-slate-950">Equipamentos</h1>
            <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-500">
              Le apenas ordens de retirada/cancelamento do mapa, consulta a API Sempre e separa os equipamentos por vinculo atual.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
            <PackageSearch size={14} />
            Senior / Playground
          </span>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-950">Equipamentos do Mapa</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Considera Retirada FTTH, Cancelamento FTTH, Cancelamento Loja e Retirada e Cancelamento - Segunda tentativa.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={limit}
              onChange={(event) => {
                setPage(1);
                setLimit(Number(event.target.value));
              }}
              className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-700 outline-none"
            >
              <option value={20}>20 ordens</option>
              <option value={30}>30 ordens</option>
              <option value={50}>50 ordens</option>
              <option value={100}>100 ordens</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setPage(1);
                load({ page: 1, refresh: true });
              }}
              disabled={loading}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-300"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
              Atualizar
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            <AlertCircle size={18} />
            {error}
          </div>
        ) : null}

        {data?.refreshing ? (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
            <Loader2 size={18} className="animate-spin" />
            Leitura completa em segundo plano. Atualize a pagina em alguns instantes para ver o resultado.
          </div>
        ) : null}

        <ReadingStatus status={data?.statusLeitura} />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">Filtros</h2>
            <p className="text-xs font-semibold text-slate-500">
              Filtre antes da paginação para trabalhar só o que precisa.
            </p>
          </div>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
          >
            Limpar filtros
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <input
            value={filters.query}
            onChange={(event) => updateFilter("query", event.target.value)}
            placeholder="OS, cliente, MAC..."
            className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none xl:col-span-2"
          />
          <select
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value)}
            className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-700 outline-none"
          >
            <option value="">Todos status</option>
            <option value="com_cliente">Com cliente</option>
            <option value="em_estoque">Em estoque</option>
            <option value="outro_vinculo">Outro vinculo</option>
            <option value="nao_encontrado">Nao localizado</option>
            <option value="erro_consulta">Erro consulta</option>
          </select>
          <select
            value={filters.cidade}
            onChange={(event) => updateFilter("cidade", event.target.value)}
            className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-700 outline-none"
          >
            <option value="">Todas cidades</option>
            {(filterOptions.cidades || []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <input
            value={filters.tecnico}
            onChange={(event) => updateFilter("tecnico", event.target.value)}
            placeholder="Tecnico/vinculo"
            className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none"
          />
          <input
            value={filters.estoque}
            onChange={(event) => updateFilter("estoque", event.target.value)}
            placeholder="Estoque"
            className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none"
          />
          <input
            value={filters.empresa}
            onChange={(event) => updateFilter("empresa", event.target.value)}
            placeholder="Empresa"
            className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none"
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <InfoCard icon={ClipboardList} label="Ordens com MAC" value={data?.totalOrdensComMac ?? 0} helper={`${data?.totalOrdensElegiveis ?? 0} elegiveis / ${data?.showing ?? 0} na tela`} tone="blue" />
        <InfoCard icon={CheckCircle2} label="Com cliente" value={summary.com_cliente ?? 0} tone="green" />
        <InfoCard icon={AlertCircle} label="Divergencias" value={summary.divergentes ?? 0} tone={summary.divergentes ? "red" : "green"} />
        <InfoCard icon={Boxes} label="Em estoque" value={summary.em_estoque ?? 0} tone="blue" />
        <InfoCard icon={UsersRound} label="Outro vinculo" value={summary.outro_vinculo ?? 0} tone="orange" />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <InfoCard icon={AlertCircle} label="Divergencias abertas" value={alertas.divergenciasAbertas ?? 0} helper={`${treatmentSummary.resolvidos ?? 0} resolvida(s)`} tone={(alertas.divergenciasAbertas ?? 0) ? "red" : "green"} />
        <InfoCard icon={UsersRound} label="Tecnico cobrado" value={treatmentSummary.cobrado_tecnico ?? 0} tone="orange" />
        <InfoCard icon={PackageSearch} label="MAC duplicado" value={alertas.macsDuplicados ?? 0} helper="Mesmo MAC em mais de uma ordem" tone={(alertas.macsDuplicados ?? 0) ? "red" : "green"} />
        <InfoCard icon={Boxes} label="Com acerto" value={alertas.acertoProgramado ?? 0} helper="Responsavel tem acerto recente" tone="blue" />
        <InfoCard icon={CheckCircle2} label="Resolvidos" value={treatmentSummary.resolvido ?? 0} tone="green" />
      </section>

      {alertas.duplicateMacs?.length ? (
        <section className="rounded-3xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <h2 className="text-lg font-black text-red-900">MACs duplicados no mapa</h2>
          <div className="mt-3 grid gap-2">
            {alertas.duplicateMacs.slice(0, 10).map((item) => (
              <div key={item.mac} className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-red-800">
                {item.mac}: {item.total} ordem(ns) - {item.ordens.map((ordem) => ordem.numero).join(", ")}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data?.equipamentosNaoLocalizados?.total ? (
        <section className="rounded-3xl border border-orange-200 bg-orange-50 p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-black text-orange-950">Equipamento nao localizado</h2>
            <p className="text-xs font-semibold text-orange-800">
              {data.equipamentosNaoLocalizados.total} ordem(ns) com MAC sem retorno na API Sempre. Elas nao entram em divergencia por tecnico.
            </p>
          </div>
          <div className="grid gap-3">
            {data.equipamentosNaoLocalizados.items.slice(0, 5).map((item) => (
              <EquipmentRow
                key={`nao-localizado-${item.documentId}-${item.macs?.join("-")}`}
                item={item}
                onSaveTreatment={handleSaveTreatment}
                saving={savingId === item.treatmentId}
              />
            ))}
          </div>
        </section>
      ) : null}

      {loading && !data ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm font-black text-slate-500">
          <Loader2 className="mx-auto mb-3 animate-spin text-blue-600" />
          Consultando equipamentos na API Sempre...
        </div>
      ) : null}

      {data && !data.totalOrdensComMac ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center text-sm font-bold text-amber-800">
          Nenhuma ordem do mapa possui Mac Addr ou Phy Addr salvo. Confira se o ultimo upload foi publicado depois de adicionar as colunas.
        </div>
      ) : null}


      {data?.gruposTecnicos?.length ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="rounded-xl bg-red-50 p-2 text-red-700">
              <UsersRound size={18} />
            </span>
            <div>
              <h2 className="text-lg font-black text-slate-950">Divergencias por Tecnico</h2>
              <p className="text-xs font-semibold text-slate-500">
                Equipamentos com vinculo em tecnico/local diferente. Nao localizados ficam na seção propria.
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            {data.gruposTecnicos.map((group) => (
              <div key={group.tecnico} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">{group.tecnico}</h3>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">
                    {group.total} divergencia(s)
                  </span>
                </div>
                <div className="grid gap-3">
                  {group.items.slice(0, limit).map((item) => (
                    <EquipmentRow
                      key={`${item.documentId}-${item.macs?.join("-")}`}
                      item={item}
                      onSaveTreatment={handleSaveTreatment}
                      saving={savingId === item.treatmentId}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data?.items?.length ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">Clientes Consultados</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Pagina {data.page || page} de {data.totalPages || 1}. {divergentItems.length} divergencia(s) nesta pagina, com {data.totalFiltered ?? data.totalConsultadas ?? 0} ordem(ns) filtradas.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={loading || (data.page || page) <= 1}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(data.totalPages || current + 1, current + 1))}
                disabled={loading || (data.page || page) >= (data.totalPages || 1)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Proxima
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {data.items.map((item) => (
              <EquipmentRow
                key={`${item.documentId}-${item.macs?.join("-")}`}
                item={item}
                onSaveTreatment={handleSaveTreatment}
                saving={savingId === item.treatmentId}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
