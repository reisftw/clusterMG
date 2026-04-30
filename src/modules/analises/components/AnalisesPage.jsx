import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useAnalisesProjecao, MONTH_OPTIONS } from "../hooks/useAnalisesProjecao";
import { exportAnalisesProjecaoPDF } from "../utils/exportAnalisesPDF";
import Spinner from "../../../components/ui/Spinner";
import InternalStaticDataStatus from "../../../components/ui/InternalStaticDataStatus";

const CURRENT_YEAR = new Date().getFullYear();
const PAGE_SIZE = 10;

function formatInt(value) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatPct(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);
}

function InfoHint({ title, formula }) {
  return (
    <span className="relative inline-flex items-center ml-1 align-middle group">
      <CircleHelp size={14} className="text-gray-400" />
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-80 -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-3 text-left text-xs font-normal text-gray-600 shadow-xl group-hover:block">
        <span className="block font-semibold text-gray-800 mb-1">{title}</span>
        <span className="block leading-5">{formula}</span>
      </span>
    </span>
  );
}

function emptyFormState() {
  return {
    ano: CURRENT_YEAR,
    mes: new Date().getMonth() + 1,
    abertas: "",
    realizadas: "",
  };
}

export default function AnalisesPage() {
  const { items, years, loading, error, carregar, salvar, excluir, buildYearProjection } =
    useAnalisesProjecao();

  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [form, setForm] = useState(emptyFormState());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [historyPage, setHistoryPage] = useState(1);

  const projection = useMemo(
    () => buildYearProjection(selectedYear),
    [buildYearProjection, selectedYear],
  );

  const registrosOrdenados = useMemo(
    () => [...items].sort((a, b) => (b.ano - a.ano) || (b.mes - a.mes)),
    [items],
  );

  const totalPages = Math.max(1, Math.ceil(registrosOrdenados.length / PAGE_SIZE));
  const safeHistoryPage = Math.min(historyPage, totalPages);
  const historyStart = (safeHistoryPage - 1) * PAGE_SIZE;
  const registrosPaginados = registrosOrdenados.slice(
    historyStart,
    historyStart + PAGE_SIZE,
  );

  const editar = (item) => {
    setForm({
      ano: item.ano,
      mes: item.mes,
      abertas: item.abertas,
      realizadas: item.realizadas,
    });
  };

  const limpar = () => {
    setForm(emptyFormState());
  };

  const onChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);

    try {
      await salvar(form);
      limpar();
      setHistoryPage(1);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await excluir(id);
    } finally {
      setDeletingId("");
    }
  };

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-orange-50 flex items-center justify-center">
            <TrendingUp size={18} className="text-orange-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Area de Analises</h2>
            <p className="text-sm text-gray-500">
              Cadastre o historico mensal e acompanhe a estimativa de retiradas que podem abrir nos proximos meses.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={carregar}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 inline-flex items-center gap-2"
        >
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>

      <InternalStaticDataStatus className="max-w-xl" />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-[360px,minmax(0,1fr)] gap-6">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
              <Plus size={16} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Base da Projecao</h3>
              <p className="text-xs text-gray-500">
                Um registro por ano e mes com retiradas abertas e realizadas.
              </p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Ano
                </span>
                <input
                  type="number"
                  className="input-field mt-1"
                  value={form.ano}
                  onChange={(event) => onChange("ano", event.target.value)}
                  min="2020"
                  max="2100"
                  required
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Mes
                </span>
                <select
                  className="input-field mt-1"
                  value={form.mes}
                  onChange={(event) => onChange("mes", event.target.value)}
                  required
                >
                  {MONTH_OPTIONS.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Retiradas abertas
              </span>
              <input
                type="number"
                className="input-field mt-1"
                value={form.abertas}
                onChange={(event) => onChange("abertas", event.target.value)}
                min="0"
                required
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Retiradas realizadas
              </span>
              <input
                type="number"
                className="input-field mt-1"
                value={form.realizadas}
                onChange={(event) => onChange("realizadas", event.target.value)}
                min="0"
                required
              />
            </label>

            <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-600">
              A estimativa de abertas combina o mesmo mes dos anos anteriores com o ritmo recente do ano atual e a faixa sazonal ao redor do mes.
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                <Save size={16} />
                {saving ? "Salvando..." : "Salvar registro"}
              </button>
              <button
                type="button"
                onClick={limpar}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50"
              >
                Limpar
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-50 flex items-center justify-center">
                  <BarChart3 size={18} className="text-orange-500" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 inline-flex items-center">
                    Card de Projecao
                    <InfoHint
                      title="Como a sazonalidade e calculada"
                      formula="Abertas projetadas = 45% da referencia do mesmo mes em anos anteriores + 35% do ritmo projetado do ano atual + 20% da media da faixa sazonal. O ritmo projetado parte do ultimo mes lancado no ano atual e aplica a proporcao historica entre esse mes e o mes futuro nos anos anteriores."
                    />
                  </h3>
                  <p className="text-sm text-gray-500">
                    Foco principal em quantas retiradas provavelmente abrirao nos proximos meses.
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-600">
                <CalendarRange size={16} className="text-gray-400" />
                <span>Ano analisado</span>
                <select
                  className="input-field w-auto min-w-[110px]"
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(Number(event.target.value))}
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() =>
                  exportAnalisesProjecaoPDF({
                    selectedYear,
                    projection,
                    historico: registrosOrdenados,
                  })
                }
                className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 inline-flex items-center gap-2"
              >
                <Download size={16} />
                Exportar PDF
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-5">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs uppercase tracking-wide text-blue-600 font-semibold">
                  Abertas lancadas
                </p>
                <p className="text-2xl font-extrabold text-blue-900 mt-1">
                  {formatInt(projection.summary.abertasAteAgora)}
                </p>
              </div>
              <div className="rounded-2xl border border-green-100 bg-green-50 p-4">
                <p className="text-xs uppercase tracking-wide text-green-600 font-semibold">
                  Ultimo mes lancado
                </p>
                <p className="text-2xl font-extrabold text-green-900 mt-1">
                  {formatInt(projection.summary.latestKnownAbertas)}
                </p>
              </div>
              <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
                <p className="text-xs uppercase tracking-wide text-orange-600 font-semibold">
                  <span className="inline-flex items-center">
                    Abertas projetadas
                    <InfoHint
                      title="Formula de abertas projetadas"
                      formula="Abertas projetadas do mes = 45% mesma competencia historica + 35% ritmo mensal projetado a partir do ultimo mes lancado + 20% faixa sazonal do periodo."
                    />
                  </span>
                </p>
                <p className="text-2xl font-extrabold text-orange-900 mt-1">
                  {formatInt(projection.summary.abertasProjetadasRestante)}
                </p>
              </div>
              <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4">
                <p className="text-xs uppercase tracking-wide text-purple-600 font-semibold">
                  Total projetado do ano
                </p>
                <p className="text-2xl font-extrabold text-purple-900 mt-1">
                  {formatInt(projection.summary.totalProjetadoAbertasAno)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[240px,240px,minmax(0,1fr)] gap-4 mt-5">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                  Media projetada por mes
                </p>
                <p className="text-3xl font-extrabold text-gray-900 mt-2">
                  {formatInt(projection.summary.mediaProjetadaAbertas)}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Volume medio esperado de novas retiradas abertas nos meses ainda sem dado.
                </p>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                  Ritmo atual
                </p>
                <p className="text-3xl font-extrabold text-gray-900 mt-2">
                  {formatInt(projection.summary.ritmoAtualAbertas)}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Media das abertas dos ultimos meses lancados no ano atual.
                </p>
              </div>

              <div className="rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h4 className="text-sm font-bold text-gray-900">Proximos meses projetados</h4>
                    <div className="text-xs text-gray-500">
                      Pico previsto:{" "}
                      <span className="font-semibold text-gray-700">
                        {projection.summary.picoProjetado
                          ? `${projection.summary.picoProjetado.mesLabel} (${formatInt(projection.summary.picoProjetado.abertasProjetadas)})`
                          : "-"}
                      </span>
                    </div>
                  </div>
                </div>

                {projection.projectionRows.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-gray-500">
                    Ja existem registros ate dezembro para {selectedYear}.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-gray-500">
                          <th className="px-4 py-3 text-left font-semibold">Mes</th>
                          <th className="px-4 py-3 text-right font-semibold">Abertas</th>
                          <th className="px-4 py-3 text-right font-semibold">
                            <span className="inline-flex items-center">
                              Meta sazonal
                              <InfoHint
                                title="Meta sazonal do mes"
                                formula="Percentual fixo da tabela sazonal do sistema. Exemplo: Abril = 85%, Maio = 90%, Dezembro = 65%."
                              />
                            </span>
                          </th>
                          <th className="px-4 py-3 text-right font-semibold">
                            <span className="inline-flex items-center">
                              Meta do mes
                              <InfoHint
                                title="Formula da meta do mes"
                                formula="Meta do mes = abertas projetadas x percentual sazonal fixo do mes."
                              />
                            </span>
                          </th>
                          <th className="px-4 py-3 text-right font-semibold">Sazonalidade</th>
                          <th className="px-4 py-3 text-right font-semibold">Faixa sazonal</th>
                          <th className="px-4 py-3 text-right font-semibold">Ritmo atual</th>
                          <th className="px-4 py-3 text-right font-semibold">Base</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projection.projectionRows.map((item) => (
                          <tr
                            key={`${item.ano}-${item.mes}`}
                            className="border-b border-gray-50 last:border-0"
                          >
                            <td className="px-4 py-3 font-semibold text-gray-800">
                              {item.mesLabel}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-900 font-semibold">
                              {formatInt(item.abertasProjetadas)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              {formatPct(item.metaSazonalPercentual)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-900 font-semibold">
                              {formatInt(item.metaDoMes)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              {formatInt(item.referenciaSazonal)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              {formatInt(item.referenciaFaixa)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              {formatInt(item.referenciaRitmoAtual)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500">
                              {item.baseHistorica ? `${item.baseHistorica} ano(s)` : "media"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
              <div className="rounded-2xl border border-gray-100 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                  Meses com base real
                </p>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">
                  {formatInt(projection.summary.mesesComBase)}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Quantidade de meses ja lancados no ano analisado.
                </p>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                  Realizadas no ano
                </p>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">
                  {formatInt(projection.summary.realizadoAteAgora)}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Mantido no painel para comparar volume aberto com volume concluido.
                </p>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                  Conversao ano atual
                </p>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">
                  {formatPct(projection.summary.taxaMediaAnoAtual)}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Media de conversao considerando somente os meses ja lancados do ano analisado.
                </p>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                  Conversao media
                </p>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">
                  {formatPct(projection.summary.taxaMediaTodosAnos)}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Media de todos os anos com dados validos. Anos usados:{" "}
                  {(projection.summary.anosConversao || []).join(", ") || "-"}.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-base font-bold text-gray-900">Historico cadastrado</h3>
                <p className="text-sm text-gray-500">
                  Use esses registros como base para as proximas analises.
                </p>
              </div>
              <div className="text-sm text-gray-500">{registrosOrdenados.length} registro(s)</div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Ano
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Mes
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Abertas
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Realizadas
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Conversao
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Acoes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {registrosOrdenados.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-400">
                        Nenhum mes cadastrado ainda.
                      </td>
                    </tr>
                  ) : (
                    registrosPaginados.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-gray-50 last:border-0 hover:bg-gray-50"
                      >
                        <td className="px-5 py-3 font-semibold text-gray-800">{item.ano}</td>
                        <td className="px-5 py-3 text-gray-600">{item.mesLabel}</td>
                        <td className="px-5 py-3 text-right text-gray-600">
                          {formatInt(item.abertas)}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">
                          {formatInt(item.realizadas)}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-600">
                          {formatPct(item.taxaConversao)}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => editar(item)}
                              className="p-2 rounded-lg text-gray-400 hover:bg-orange-50 hover:text-orange-500"
                              title="Editar"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
                              disabled={deletingId === item.id}
                              className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {registrosOrdenados.length > PAGE_SIZE ? (
              <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-gray-500">
                  Mostrando {historyStart + 1}-
                  {Math.min(historyStart + PAGE_SIZE, registrosOrdenados.length)} de{" "}
                  {registrosOrdenados.length}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}
                    disabled={safeHistoryPage === 1}
                    className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-white disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    <ChevronLeft size={16} />
                    Anterior
                  </button>
                  <div className="text-sm text-gray-600 font-medium min-w-[72px] text-center">
                    {safeHistoryPage} / {totalPages}
                  </div>
                  <button
                    type="button"
                    onClick={() => setHistoryPage((current) => Math.min(totalPages, current + 1))}
                    disabled={safeHistoryPage === totalPages}
                    className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-white disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    Proxima
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
