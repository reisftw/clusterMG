import { useMemo, useState } from "react";
import {
  AlertTriangle,
  HardHat,
  Layers3,
  LineChart,
  MapPinned,
  RefreshCw,
  Target,
} from "lucide-react";
import Spinner from "../../../components/ui/Spinner";
import { resolveFirestoreDate } from "../../../services/firestoreDate";
import { useMapeamento } from "../hooks/useMapeamento";
import MapeamentoUpload from "./MapeamentoUpload";
import MapeamentoVinculoModal from "./MapeamentoVinculoModal";
import InternalStaticDataStatus from "../../../components/ui/InternalStaticDataStatus";

function MetricCard({ label, value, helper, tone = "blue" }) {
  const tones = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    red: "border-red-100 bg-red-50 text-red-700",
  };

  return (
    <div className={`rounded-2xl border p-5 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-75">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{value}</p>
      <p className="mt-2 text-xs opacity-80">{helper}</p>
    </div>
  );
}

function formatMetaDate(value) {
  const date = resolveFirestoreDate(value?.data) || resolveFirestoreDate(value);
  if (!date) return "Nunca atualizado";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RegionalHistoryChart({ series = [] }) {
  const maxValue = Math.max(1, ...series.map((item) => Number(item.value || 0)));

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <LineChart size={15} className="text-blue-600" />
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
          Ultimos 3 meses de O.S. abertas
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {series.map((item) => {
          const height = Math.max(10, (Number(item.value || 0) / maxValue) * 100);

          return (
            <div key={item.key} className="rounded-2xl border border-gray-100 bg-slate-50 p-3">
              <div className="flex h-24 items-end justify-center">
                <div
                  className="w-12 rounded-t-2xl bg-gradient-to-t from-blue-600 to-cyan-400"
                  style={{ height: `${height}%` }}
                />
              </div>
              <p className="mt-3 text-center text-lg font-black text-slate-900">
                {item.value}
              </p>
              <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {item.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RegionalCard({ regional, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(regional)}
      className={`w-full rounded-3xl border bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
        regional.alerta ? "border-red-200" : "border-gray-100"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MapPinned size={18} className="text-blue-600" />
            <h3 className="text-lg font-black text-gray-900">{regional.nome}</h3>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Clique para vincular tecnicos CLT e ajustar a capacidade da regional.
          </p>
        </div>
        {regional.alerta ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
            <AlertTriangle size={12} />
            Sobra abaixo de 110
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            Capacidade confortavel
          </span>
        )}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-400">
            Tecnicos CLT
          </p>
          <p className="mt-2 text-2xl font-black text-slate-900">
            {regional.tecnicos.length}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-400">
            Capacidade total
          </p>
          <p className="mt-2 text-2xl font-black text-blue-700">
            {regional.capacidadeTotal}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-400">
            O.S. abertas
          </p>
          <p className="mt-2 text-2xl font-black text-amber-700">
            {regional.abertasMesAtual}
          </p>
        </div>
        <div className={`rounded-2xl p-4 ${regional.alerta ? "bg-red-50" : "bg-slate-50"}`}>
          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-400">
            Sobra equipe ativa
          </p>
          <p className={`mt-2 text-2xl font-black ${regional.alerta ? "text-red-700" : "text-emerald-700"}`}>
            {regional.sobraEquipeAtiva}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
          Tecnicos vinculados
        </p>
        <div className="flex flex-wrap gap-2">
          {regional.tecnicos.length ? (
            regional.tecnicos.map((tecnico) => (
              <span
                key={tecnico.id}
                className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
              >
                <HardHat size={12} />
                {tecnico.nome}
              </span>
            ))
          ) : (
            <span className="rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-gray-500">
              Nenhum tecnico vinculado
            </span>
          )}
        </div>
      </div>

      <div className="mt-6">
        <RegionalHistoryChart series={regional.historico} />
      </div>
    </button>
  );
}

export default function MapeamentoPage() {
  const {
    data,
    loading,
    error,
    savingRegionalId,
    salvarVinculos,
    carregar,
  } = useMapeamento();
  const [regionalAtiva, setRegionalAtiva] = useState(null);

  const resumo = data?.resumo || {
    totalRegionais: 0,
    totalTecnicosVinculados: 0,
    capacidadeTotal: 0,
    abertasMesAtual: 0,
    alertas: 0,
    totalArquivos: 0,
    totalLinhas: 0,
    ignoradasSemRegional: 0,
    linhasInvalidas: 0,
  };

  const regionais = useMemo(() => data?.regionais || [], [data?.regionais]);
  const tecnicosClt = useMemo(() => data?.tecnicosClt || [], [data?.tecnicosClt]);
  const cidadesNaoMapeadas = useMemo(
    () => data?.cidadesNaoMapeadas || [],
    [data?.cidadesNaoMapeadas],
  );

  const rankingSobra = useMemo(
    () =>
      [...regionais]
        .sort((a, b) => b.sobraEquipeAtiva - a.sobraEquipeAtiva)
        .slice(0, 5),
    [regionais],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600">
            Modulo Operacional
          </p>
          <h1 className="mt-1 text-2xl font-black text-gray-900">Mapeamento</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
            Relaciona regionais, tecnicos CLT de Retirada e a base importada do
            mapeamento para medir capacidade operacional, backlog e pressao por
            regional.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => carregar(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-gray-200 transition-colors hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            Atualizar leitura
          </button>
          <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-right shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
              Base do mapeamento
            </p>
            <p className="mt-1 text-sm font-bold text-gray-900">Resumo importado</p>
            <p className="mt-1 text-xs text-gray-400">
              Atualizado em {formatMetaDate(data?.ultimaAtualizacao)}
            </p>
          </div>
        </div>
      </div>

      <InternalStaticDataStatus className="max-w-xl" />

      <MapeamentoUpload onConcluido={() => carregar(true)} />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Regionais" value={resumo.totalRegionais} helper="Regionais monitoradas no modulo" tone="blue" />
        <MetricCard label="Tecnicos vinculados" value={resumo.totalTecnicosVinculados} helper="Tecnicos CLT ligados as regionais" tone="emerald" />
        <MetricCard label="Capacidade total" value={resumo.capacidadeTotal} helper="Tecnicos x 110 O.S./mes" tone="blue" />
        <MetricCard label="O.S. abertas" value={resumo.abertasMesAtual} helper="Volume atual da operacao" tone="amber" />
        <MetricCard label="Alertas" value={resumo.alertas} helper="Regionais com sobra abaixo de 110" tone={resumo.alertas > 0 ? "red" : "emerald"} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Arquivos lidos" value={resumo.totalArquivos} helper="Planilhas importadas no ultimo upload" tone="blue" />
        <MetricCard label="Linhas lidas" value={resumo.totalLinhas} helper="Registros enviados para analise" tone="emerald" />
        <MetricCard label="Sem regional" value={resumo.ignoradasSemRegional} helper="Cidades sem vinculo no cadastro de regionais" tone={resumo.ignoradasSemRegional > 0 ? "amber" : "emerald"} />
        <MetricCard label="Invalidas" value={resumo.linhasInvalidas} helper="Linhas sem cidade ou data valida" tone={resumo.linhasInvalidas > 0 ? "red" : "emerald"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr,0.55fr]">
        <div className="space-y-4">
          {regionais.map((regional) => (
            <RegionalCard key={regional.id} regional={regional} onOpen={setRegionalAtiva} />
          ))}
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-blue-600" />
            <h2 className="text-base font-black text-gray-900">Prioridades do momento</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            Regionais com maior sobra operacional para a equipe ativa. Esse ranking ajuda a identificar onde a capacidade esta mais pressionada.
          </p>

          <div className="mt-5 space-y-3">
            {rankingSobra.map((regional, index) => (
              <div
                key={regional.id}
                className={`rounded-2xl border p-4 ${
                  regional.alerta ? "border-red-200 bg-red-50" : "border-gray-100 bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      {index + 1}. {regional.nome}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {regional.tecnicos.length} tecnico(s) · capacidade {regional.capacidadeTotal}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-black ${regional.alerta ? "text-red-700" : "text-slate-900"}`}>
                      {regional.sobraEquipeAtiva}
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-gray-400">
                      sobra
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {!rankingSobra.length ? (
              <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
                Nenhuma regional disponivel para analise.
              </div>
            ) : null}
          </div>

          <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-center gap-2">
              <Layers3 size={16} className="text-blue-600" />
              <p className="text-sm font-bold text-blue-900">Regra de capacidade</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-blue-800">
              Cada tecnico CLT vinculado representa 110 O.S./mes de capacidade. A sobra da equipe ativa e calculada por: O.S. abertas no mes atual menos a capacidade total da regional.
            </p>
          </div>

          <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600" />
              <p className="text-sm font-bold text-amber-900">Cidades nao mapeadas</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-amber-800">
              Essas cidades apareceram na planilha, mas ainda nao estao cadastradas em nenhuma regional.
            </p>

            <div className="mt-4 space-y-2">
              {cidadesNaoMapeadas.length ? (
                cidadesNaoMapeadas.map((item) => (
                  <div
                    key={item.cidade}
                    className="flex items-center justify-between rounded-xl border border-amber-200 bg-white px-3 py-2"
                  >
                    <span className="text-sm font-semibold text-amber-900">
                      {String(item.cidade || "").toUpperCase()}
                    </span>
                    <span className="text-xs font-semibold text-amber-700">
                      {item.total} linha(s)
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-amber-200 bg-white px-3 py-4 text-sm text-amber-800">
                  Nenhuma cidade pendente de mapeamento no ultimo upload.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {regionalAtiva ? (
        <MapeamentoVinculoModal
          key={regionalAtiva.id}
          regional={regionalAtiva}
          tecnicosDisponiveis={tecnicosClt}
          saving={savingRegionalId === regionalAtiva.id}
          onClose={() => setRegionalAtiva(null)}
          onSave={(tecnicoIds) => salvarVinculos(regionalAtiva.id, tecnicoIds)}
        />
      ) : null}
    </div>
  );
}
