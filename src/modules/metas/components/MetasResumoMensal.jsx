import { useMemo, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  TrendingUp as TrendUp,
  AlertTriangle,
  CheckCircle,
  X,
} from "lucide-react";

const MESES = [
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

const StatusBadge = ({ pct, metaSazonal = 80, mes }) => {
  const n = parseFloat(pct);
  const mesAtualIdx = new Date().getMonth();
  const mesIdx = MESES.indexOf(mes);
  const mesEncerrado = mesIdx >= 0 && mesIdx < mesAtualIdx;

  if (n >= metaSazonal)
    return (
      <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-green-50 text-green-700 border border-green-100 flex items-center gap-1 w-fit">
        <TrendingUp size={11} /> Atingido
      </span>
    );
  if (mesEncerrado)
    return (
      <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-100 flex items-center gap-1 w-fit">
        <TrendingDown size={11} /> Nao atingido
      </span>
    );
  if (n >= 60)
    return (
      <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-600 border border-amber-100 flex items-center gap-1 w-fit">
        <Minus size={11} /> Em andamento
      </span>
    );
  return (
    <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-100 flex items-center gap-1 w-fit">
      <TrendingDown size={11} /> Abaixo
    </span>
  );
};

// ─── helpers de dias úteis ───────────────────────────────────────────────────

function isDiaUtil(mes, dia, feriadosSet) {
  const mIdx = MESES.indexOf(mes);
  if (mIdx < 0) return true;
  const m = mIdx + 1;
  const ano = new Date().getFullYear();
  const dt = new Date(ano, m - 1, dia);
  if (dt.getDay() === 0 || dt.getDay() === 6) return false;
  const key = `${String(m).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  return !feriadosSet.has(key);
}

function calcDiasUteisMes(mes, feriadosSet) {
  const mIdx = MESES.indexOf(mes);
  if (mIdx < 0) return 22;
  const m = mIdx + 1;
  const ano = new Date().getFullYear();
  const diasNoMes = new Date(ano, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    const dt = new Date(ano, m - 1, d);
    if (dt.getDay() === 0 || dt.getDay() === 6) continue;
    const key = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (feriadosSet.has(key)) continue;
    count++;
  }
  return count;
}

function diasUteisRestantesNoMes(mes, feriadosSet, ultimoDiaComDados = 0) {
  const mIdx = MESES.indexOf(mes);
  if (mIdx < 0) return 0;
  const m = mIdx + 1;
  const ano = new Date().getFullYear();
  // só conta restantes se for o mês atual
  const diaInicio = Math.max(1, Number(ultimoDiaComDados) + 1);
  const diasNoMes = new Date(ano, m, 0).getDate();
  let count = 0;
  for (let d = diaInicio; d <= diasNoMes; d++) {
    const dt = new Date(ano, m - 1, d);
    if (dt.getDay() === 0 || dt.getDay() === 6) continue;
    const key = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (feriadosSet.has(key)) continue;
    count++;
  }
  return count;
}

function buildMonthDetail(mes, dados, feriadosSet) {
  if (!dados) return null;

  const percentAchieved = parseFloat(dados.percentAchieved || 0);
  const metaSazonal = Number(dados.metaSazonal ?? 80);
  const meta = Number(dados.meta || 0);
  const totalOS = Number(dados.totalOS || 0);
  const faltaOS = Math.max(0, meta - totalOS);
  const diasUteis = calcDiasUteisMes(mes, feriadosSet);
  const extraPorDiaUtil = faltaOS > 0 && diasUteis > 0 ? Math.ceil(faltaOS / diasUteis) : 0;
  const percentualFaltante = Math.max(
    0,
    Number((metaSazonal - percentAchieved).toFixed(1)),
  );
  const saldoFinal = dados.saldoDiario?.length
    ? dados.saldoDiario[dados.saldoDiario.length - 1].saldoMes
    : 0;
  const regionaisAbaixo = (dados.regionais ?? [])
    .map((regional) => {
      const total = Number(regional.total || 0);
      return {
        name: regional.name,
        total,
        faltaMeta: Math.max(0, 110 - total),
      };
    })
    .filter((regional) => regional.faltaMeta > 0)
    .sort((a, b) => b.faltaMeta - a.faltaMeta);

  const monthIdx = MESES.indexOf(mes);
  const mesEncerrado = monthIdx >= 0 && monthIdx < new Date().getMonth();
  const atingiu = percentAchieved >= metaSazonal;

  return {
    mes,
    meta,
    totalOS,
    percentAchieved,
    metaSazonal,
    faltaOS,
    percentualFaltante,
    diasUteis,
    extraPorDiaUtil,
    saldoFinal,
    mesEncerrado,
    atingiu,
    cancelamentos: Math.round(Number(dados.cancelamentos || 0)),
    topRegional: (dados.regionais ?? [])[0] ?? null,
    topTecnico: (dados.technicians ?? [])[0] ?? null,
    regionaisAbaixo: regionaisAbaixo.slice(0, 3),
  };
}

const MonthDetailModal = ({ detail, onClose }) => {
  if (!detail) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-gray-100 bg-white/95 px-6 py-5 backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Entrega do mes
            </p>
            <h3 className="text-xl font-bold text-gray-900">
              {detail.mes} 2026
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {detail.cancelamentos.toLocaleString("pt-BR")} cancelamentos,{" "}
              {detail.totalOS.toLocaleString("pt-BR")} retiradas entregues
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">Meta</p>
              <p className="mt-1 text-2xl font-extrabold text-blue-700">
                {detail.meta.toLocaleString("pt-BR")}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">Entregue</p>
              <p className="mt-1 text-2xl font-extrabold text-orange-600">
                {detail.totalOS.toLocaleString("pt-BR")}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">% atingido</p>
              <p
                className={`mt-1 text-2xl font-extrabold ${detail.atingiu ? "text-green-700" : "text-red-600"}`}
              >
                {detail.percentAchieved}%
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">Saldo final</p>
              <p
                className={`mt-1 text-2xl font-extrabold ${detail.saldoFinal >= 0 ? "text-green-700" : "text-red-600"}`}
              >
                {detail.saldoFinal >= 0 ? `+${detail.saldoFinal}` : detail.saldoFinal}
              </p>
            </div>
          </div>

          <div
            className={`rounded-3xl border p-5 ${detail.atingiu ? "border-green-100 bg-green-50" : "border-red-100 bg-red-50"}`}
          >
            <p
              className={`text-sm font-bold ${detail.atingiu ? "text-green-700" : "text-red-700"}`}
            >
              {detail.atingiu
                ? "Mes entregue dentro da meta sazonal."
                : detail.mesEncerrado
                  ? "Mes encerrado sem atingir a meta sazonal."
                  : "Mes ainda em andamento abaixo da meta sazonal."}
            </p>

            {!detail.atingiu && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/80 p-4">
                  <p className="text-xs font-semibold uppercase text-gray-400">
                    Faltou em O.S
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-red-600">
                    {detail.faltaOS.toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/80 p-4">
                  <p className="text-xs font-semibold uppercase text-gray-400">
                    Faltou em %
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-red-600">
                    {detail.percentualFaltante} p.p.
                  </p>
                </div>
                <div className="rounded-2xl bg-white/80 p-4">
                  <p className="text-xs font-semibold uppercase text-gray-400">
                    Media extra por dia util
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-red-600">
                    {detail.extraPorDiaUtil} O.S/dia
                  </p>
                </div>
              </div>
            )}

            {!detail.atingiu && (
              <p className="mt-4 text-sm text-gray-700">
                Para atingir a meta de {detail.metaSazonal}%, o mes precisaria de{" "}
                <strong>{detail.faltaOS.toLocaleString("pt-BR")} retiradas a mais</strong>.
                Isso equivale a cerca de{" "}
                <strong>{detail.extraPorDiaUtil} retiradas por dia util</strong>{" "}
                distribuidas ao longo dos {detail.diasUteis} dias uteis do mes.
              </p>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-gray-100 p-5">
              <p className="text-sm font-bold text-gray-900">Destaques</p>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase text-gray-400">Top regional</p>
                  <p className="mt-1 text-base font-bold text-gray-900">
                    {detail.topRegional?.name ?? "Sem dados"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {detail.topRegional
                      ? `${detail.topRegional.total} O.S no mes`
                      : "Sem dados suficientes"}
                  </p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase text-gray-400">Top tecnico</p>
                  <p className="mt-1 text-base font-bold text-gray-900">
                    {detail.topTecnico?.name ?? "Sem dados"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {detail.topTecnico
                      ? `${detail.topTecnico.total} O.S no mes`
                      : "Sem dados suficientes"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-100 p-5">
              <p className="text-sm font-bold text-gray-900">
                Regionais abaixo da referencia
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Considerando a referencia individual de 110 O.S no mes.
              </p>
              <div className="mt-4 space-y-3">
                {detail.regionaisAbaixo.length > 0 ? (
                  detail.regionaisAbaixo.map((regional) => (
                    <div
                      key={regional.name}
                      className="flex items-center justify-between rounded-2xl bg-red-50 p-4"
                    >
                      <div>
                        <p className="text-sm font-bold text-red-700">{regional.name}</p>
                        <p className="text-xs text-red-500">
                          Entregou {regional.total} O.S no mes
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-red-700">
                          -{regional.faltaMeta}
                        </p>
                        <p className="text-xs text-red-500">para chegar em 110</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl bg-green-50 p-4 text-sm font-semibold text-green-700">
                    Todas as regionais ficaram dentro ou acima da referencia individual.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Card de Projeção de Fechamento ─────────────────────────────────────────

const ProjecaoCard = ({ dados, feriadosSet }) => {
  const projecao = useMemo(() => {
    if (!dados?.saldoDiario?.length) return null;

    // Recalcula util em runtime (flag não é persistida no Firebase)
    const saldoComUtil = dados.saldoDiario.map((r) => ({
      ...r,
      util: isDiaUtil(dados.mes, r.dia, feriadosSet),
    }));

    // Todos os dias úteis com produção
    const diasComProd = saldoComUtil.filter((r) => r.util && r.totalDia > 0);
    if (diasComProd.length === 0) return null;

    // Se temos poucos dias (< 5), usa todos; senão usa os últimos 10 para ritmo mais representativo
    const amostra =
      diasComProd.length >= 5 ? diasComProd.slice(-10) : diasComProd;

    const ritmoAtual =
      amostra.reduce((s, r) => s + r.totalDia, 0) / amostra.length;

    const ultimoDiaComDados = saldoComUtil.reduce(
      (ultimoDia, registro) => (registro.totalDia > 0 ? registro.dia : ultimoDia),
      0,
    );

    const diasRestantes = diasUteisRestantesNoMes(
      dados.mes,
      feriadosSet,
      ultimoDiaComDados,
    );
    const totalAtual = Number(dados.totalOS);
    const projecaoFinal = Math.round(totalAtual + ritmoAtual * diasRestantes);
    const pctProjetado =
      dados.cancelamentos > 0
        ? ((projecaoFinal / dados.cancelamentos) * 100).toFixed(1)
        : 0;
    const bateAMeta = projecaoFinal >= dados.meta;
    const faltaOuSobra = projecaoFinal - dados.meta;

    return {
      ritmoAtual: Math.round(ritmoAtual),
      diasRestantes,
      projecaoFinal,
      pctProjetado,
      bateAMeta,
      faltaOuSobra,
      diasAmostra: amostra.length,
      ultimoDiaComDados,
    };
  }, [dados, feriadosSet]);

  if (!projecao) return null;

  const {
    ritmoAtual,
    diasRestantes,
    projecaoFinal,
    pctProjetado,
    bateAMeta,
    faltaOuSobra,
    diasAmostra,
    ultimoDiaComDados,
  } = projecao;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${bateAMeta ? "bg-green-50" : "bg-amber-50"}`}
        >
          {bateAMeta ? (
            <CheckCircle size={16} className="text-green-600" />
          ) : (
            <AlertTriangle size={16} className="text-amber-500" />
          )}
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase font-semibold">
            Projeção de Fechamento
          </p>
          <p className="text-sm font-bold text-gray-900">{dados.mes} 2026</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
          <p className="text-[11px] text-gray-400 font-semibold uppercase mb-1">
            Ritmo atual
          </p>
          <p className="text-lg font-extrabold text-gray-800">
            {ritmoAtual}{" "}
            <span className="text-xs font-normal text-gray-400">O.S/dia</span>
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            últimos {diasAmostra} dias úteis
          </p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
          <p className="text-[11px] text-gray-400 font-semibold uppercase mb-1">
            Dias úteis restantes
          </p>
          <p className="text-lg font-extrabold text-gray-800">
            {diasRestantes}{" "}
            <span className="text-xs font-normal text-gray-400">dias</span>
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            após o dia {ultimoDiaComDados || 0}
          </p>
        </div>
        <div
          className={`rounded-xl p-3 border ${bateAMeta ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}
        >
          <p
            className={`text-[11px] font-semibold uppercase mb-1 ${bateAMeta ? "text-green-600" : "text-red-500"}`}
          >
            Projeção final
          </p>
          <p
            className={`text-lg font-extrabold ${bateAMeta ? "text-green-700" : "text-red-600"}`}
          >
            {projecaoFinal.toLocaleString("pt-BR")}{" "}
            <span className="text-xs font-normal opacity-70">O.S</span>
          </p>
        </div>
        <div
          className={`rounded-xl p-3 border ${bateAMeta ? "bg-green-50 border-green-100" : "bg-amber-50 border-amber-100"}`}
        >
          <p
            className={`text-[11px] font-semibold uppercase mb-1 ${bateAMeta ? "text-green-600" : "text-amber-600"}`}
          >
            % Projetado
          </p>
          <p
            className={`text-lg font-extrabold ${bateAMeta ? "text-green-700" : "text-amber-600"}`}
          >
            {pctProjetado}%
          </p>
        </div>
      </div>

      <div
        className={`text-xs font-semibold rounded-lg px-3 py-2 ${bateAMeta ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}
      >
        {bateAMeta
          ? `✅ No ritmo atual, o mês deve fechar com +${faltaOuSobra.toLocaleString("pt-BR")} O.S acima da meta.`
          : `⚠️ No ritmo atual, o mês deve fechar ${Math.abs(faltaOuSobra).toLocaleString("pt-BR")} O.S abaixo da meta. É necessário acelerar.`}
      </div>
    </div>
  );
};

// ─── Card de Histórico Anual (tabela) ───────────────────────────────────────

const HistoricoAnual = ({
  allData,
  mesSelecionado,
  onSelectMes,
  feriadosSet,
  onOpenMesDetail,
}) => {
  const historico = useMemo(() => {
    return MESES.map((mes) => {
      const m = allData[mes];
      if (!m || m.totalOS === 0) return { mes, vazio: true };

      const diasUteisMes = calcDiasUteisMes(mes, feriadosSet);
      const metaDiaria =
        diasUteisMes > 0 ? Math.ceil(m.meta / diasUteisMes) : 0;
      const saldoFinal = m.saldoDiario?.length
        ? m.saldoDiario[m.saldoDiario.length - 1].saldoMes
        : 0;

      return {
        mes,
        vazio: false,
        cancelamentos: Math.round(m.cancelamentos),
        metaSazonal: m.metaSazonal ?? 80,
        meta: Math.round(m.meta),
        totalOS: Number(m.totalOS),
        falta: Math.max(0, m.meta - m.totalOS),
        percentAchieved: m.percentAchieved,
        metaDiaria,
        diasUteis: diasUteisMes,
        saldoFinal,
      };
    });
  }, [allData, feriadosSet]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-800">
          Resumo Anual — Retirada FTTH
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {[
                "Mês",
                "Cancelamentos",
                "Meta Sazonal",
                "Meta OS",
                "Realizado",
                "Saldo Final",
                "% Total",
                "Status",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {historico.map(({ mes, vazio, ...m }) => {
              const isSelected = mes === mesSelecionado;
              const base = `border-b border-gray-50 cursor-pointer transition-colors ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`;

              if (vazio) {
                return (
                  <tr
                    key={mes}
                    onClick={() => {
                      onSelectMes(mes);
                      onOpenMesDetail(mes);
                    }}
                    className={base}
                  >
                    <td className="px-4 py-3 font-semibold text-gray-700">
                      {mes}
                    </td>
                    <td colSpan={7} className="px-4 py-3 text-gray-300 text-xs">
                      Sem dados
                    </td>
                  </tr>
                );
              }

              const saldoCls =
                m.saldoFinal >= 0 ? "text-green-600" : "text-red-500";

              return (
                <tr
                  key={mes}
                  onClick={() => {
                    onSelectMes(mes);
                    onOpenMesDetail(mes);
                  }}
                  className={base}
                >
                  <td className="px-4 py-3 font-bold text-gray-800">{mes}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {m.cancelamentos.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-purple-600 font-semibold">
                    {m.metaSazonal}%
                  </td>
                  <td className="px-4 py-3 text-blue-700 font-semibold">
                    {m.meta.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-orange-600 font-semibold">
                    {m.totalOS.toLocaleString("pt-BR")}
                  </td>
                  <td className={`px-4 py-3 font-bold ${saldoCls}`}>
                    {m.saldoFinal >= 0 ? `+${m.saldoFinal}` : m.saldoFinal}
                  </td>
                  <td className="px-4 py-3 font-bold">{m.percentAchieved}%</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      mes={mes}
                      pct={m.percentAchieved}
                      metaSazonal={m.metaSazonal}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Componente principal ────────────────────────────────────────────────────

const MetasResumoMensal = ({
  allData,
  mesSelecionado,
  onSelectMes,
  feriadosSet = new Set(),
}) => {
  const d = allData[mesSelecionado];
  const [mesDetalhe, setMesDetalhe] = useState(null);
  const mesAtualNome = [
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
  ][new Date().getMonth()];
  const isMesAtual = mesSelecionado === mesAtualNome;
  const detalheMesSelecionado = mesDetalhe
    ? buildMonthDetail(mesDetalhe, allData[mesDetalhe], feriadosSet)
    : null;

  return (
    <div className="space-y-5">
      {/* KPIs do mês selecionado */}
      {d && d.totalOS > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            {
              label: "Cancelamentos",
              value: Math.round(d.cancelamentos).toLocaleString("pt-BR"),
              color: "bg-gray-50 border-gray-100",
              text: "text-gray-700",
            },
            {
              label: `Meta ${d.metaSazonal}%`,
              value: Math.round(d.meta).toLocaleString("pt-BR"),
              color: "bg-blue-50 border-blue-100",
              text: "text-blue-700",
            },
            {
              label: "Realizado",
              value: Number(d.totalOS).toLocaleString("pt-BR"),
              color: "bg-orange-50 border-orange-100",
              text: "text-orange-600",
            },
            {
              label: "% Atingido",
              value: `${d.percentAchieved}%`,
              color:
                parseFloat(d.percentAchieved) >= (d.metaSazonal ?? 80)
                  ? "bg-green-50 border-green-100"
                  : "bg-red-50 border-red-100",
              text:
                parseFloat(d.percentAchieved) >= (d.metaSazonal ?? 80)
                  ? "text-green-700"
                  : "text-red-600",
            },
            {
              label: "Falta",
              value:
                Math.max(0, d.meta - d.totalOS) > 0
                  ? Math.max(0, d.meta - d.totalOS).toLocaleString("pt-BR")
                  : "—",
              color: "bg-gray-50 border-gray-100",
              text: "text-gray-700",
            },
          ].map(({ label, value, color, text }) => (
            <div key={label} className={`rounded-2xl border p-4 ${color}`}>
              <p className={`text-xs font-semibold mb-1 ${text} opacity-70`}>
                {label}
              </p>
              <p className={`text-2xl font-extrabold ${text}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Projeção de fechamento — só no mês atual com dados */}
      {isMesAtual && d && d.totalOS > 0 && (
        <ProjecaoCard dados={d} feriadosSet={feriadosSet} />
      )}

      {/* Histórico anual */}
      <HistoricoAnual
        allData={allData}
        mesSelecionado={mesSelecionado}
        onSelectMes={onSelectMes}
        feriadosSet={feriadosSet}
        onOpenMesDetail={setMesDetalhe}
      />

      <MonthDetailModal
        detail={detalheMesSelecionado}
        onClose={() => setMesDetalhe(null)}
      />
    </div>
  );
};

export default MetasResumoMensal;
