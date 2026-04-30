import { useMemo } from "react";
import { Target, TrendingUp, Users, MapPin } from "lucide-react";
import { useMetasDashboard } from "../hooks/useMetasDashboard";
import { buildMetasProjection } from "../../../utils/metasProjection";

const MONTHORDER = [
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

function calcDiasUteisMes(mes, feriadosSet) {
  const mIdx = MONTHORDER.indexOf(mes);
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

function isDiaUtil(mes, dia, feriadosSet) {
  const mIdx = MONTHORDER.indexOf(mes);
  if (mIdx < 0) return true;
  const m = mIdx + 1;
  const ano = new Date().getFullYear();
  const dt = new Date(ano, m - 1, dia);
  if (dt.getDay() === 0 || dt.getDay() === 6) return false;
  const key = `${String(m).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  return !feriadosSet.has(key);
}

const MetasDashboardWidget = () => {
  const { metaMes, loading, feriadosSet } = useMetasDashboard();

  const { metaDiaria, diasUteis, saldoRecalculado, projecao } = useMemo(() => {
    if (!metaMes?.saldoDiario?.length)
      return { metaDiaria: 0, diasUteis: 0, saldoRecalculado: [], projecao: null };

    const diasUteis = calcDiasUteisMes(metaMes.mes, feriadosSet);
    const metaDiaria = diasUteis > 0 ? Math.ceil(metaMes.meta / diasUteis) : 0;

    let saldoMes = 0;
    const saldoRecalculado = metaMes.saldoDiario.map((row) => {
      const util = isDiaUtil(metaMes.mes, row.dia, feriadosSet);
      const metaDia = util ? metaDiaria : 0;
      const saldoDia = row.totalDia - metaDia;
      saldoMes += saldoDia;
      return { ...row, util, metaDia, saldoDia, saldoMes };
    });

    const projecao = buildMetasProjection({
      month: metaMes.mes,
      saldoDiario: metaMes.saldoDiario,
      totalOS: metaMes.totalOS,
      meta: metaMes.meta,
      cancelamentos: metaMes.cancelamentos,
      feriadosSet,
    });

    return { metaDiaria, diasUteis, saldoRecalculado, projecao };
  }, [metaMes, feriadosSet]);

  if (loading)
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <p className="text-xs text-gray-400">Carregando metas...</p>
      </div>
    );

  if (!metaMes)
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <p className="text-xs text-gray-400">
          Nenhuma meta carregada para o mês atual.
        </p>
      </div>
    );

  const sazonal = metaMes.metaSazonal ?? 80;
  const cancelamentos = Math.round(metaMes.cancelamentos ?? 0);
  const metaOS = Math.round(metaMes.meta);
  const falta = Math.max(0, metaMes.meta - metaMes.totalOS);
  const topTec = metaMes.technicians?.[0];
  const topReg = metaMes.regionais?.[0];
  const atingido = parseFloat(metaMes.percentAchieved) >= sazonal;

  const ritmoAtual = projecao?.ritmoAtual ?? 0;

  const saldoMesAtual =
    saldoRecalculado[saldoRecalculado.length - 1]?.saldoMes ?? 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Target size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase font-semibold">
              Meta do mês
            </p>
            <p className="text-sm font-bold text-gray-900">
              {metaMes.mes} 2026
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <TrendingUp
            size={14}
            className={atingido ? "text-green-500" : "text-red-400"}
          />
          <span
            className={
              atingido
                ? "text-green-600 font-semibold"
                : "text-red-500 font-semibold"
            }
          >
            {metaMes.percentAchieved}%
          </span>
        </div>
      </div>

      {/* Números principais */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-[11px] text-gray-400 font-semibold mb-1">
            Cancelamentos
          </p>
          <p className="text-base font-bold text-gray-800">
            {cancelamentos.toLocaleString("pt-BR")}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-gray-400 font-semibold mb-1">
            Meta sazonal
          </p>
          <p className="text-base font-bold text-blue-700">
            {metaOS.toLocaleString("pt-BR")}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-gray-400 font-semibold mb-1">
            Realizado
          </p>
          <p className="text-base font-bold text-orange-600">
            {Number(metaMes.totalOS).toLocaleString("pt-BR")}
          </p>
        </div>
      </div>

      {/* Status */}
      <div className="text-[11px] text-gray-500">
        {falta > 0 ? (
          <span>
            Faltam{" "}
            <span className="font-semibold text-gray-800">
              {falta.toLocaleString("pt-BR")} O.S
            </span>{" "}
            para bater a meta.
          </span>
        ) : (
          <span className="font-semibold text-green-600">
            Meta atingida para o mês. 🎉
          </span>
        )}
      </div>

      {/* Ritmo, meta diária, saldo e dias úteis */}
      <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-xs">
        <div>
          <p className="text-[11px] text-gray-400 font-semibold uppercase mb-1">
            Meta diária
          </p>
          <p className="text-base font-bold text-gray-900">
            {metaDiaria}{" "}
            <span className="text-[11px] font-normal text-gray-400">
              O.S/dia
            </span>
          </p>
        </div>
        <div>
          <p className="text-[11px] text-gray-400 font-semibold uppercase mb-1">
            Ritmo atual
          </p>
          <p
            className={`text-base font-bold ${ritmoAtual >= metaDiaria ? "text-green-600" : "text-red-500"}`}
          >
            {ritmoAtual}{" "}
            <span className="text-[11px] font-normal text-gray-400">
              O.S/dia
            </span>
          </p>
        </div>
        <div>
          <p className="text-[11px] text-gray-400 font-semibold uppercase mb-1">
            Saldo do mês
          </p>
          <p
            className={`text-base font-bold ${saldoMesAtual >= 0 ? "text-green-600" : "text-red-500"}`}
          >
            {saldoMesAtual >= 0 ? `+${saldoMesAtual}` : saldoMesAtual}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-gray-400 font-semibold uppercase mb-1">
            Dias úteis/mês
          </p>
          <p className="text-base font-bold text-gray-900">
            {diasUteis}{" "}
            <span className="text-[11px] font-normal text-gray-400">dias</span>
          </p>
        </div>
      </div>

      {/* Top técnico e regional */}
      <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 mt-1 text-xs">
        <div className="flex items-start gap-2">
          <div className="w-7 h-7 rounded-full bg-orange-50 flex items-center justify-center mt-0.5">
            <Users size={14} className="text-orange-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-gray-400 font-semibold uppercase">
              Top Técnico
            </p>
            <p className="text-xs font-semibold text-gray-900 truncate">
              {topTec?.name ?? "—"}
            </p>
            <p className="text-[11px] text-gray-500">
              {topTec ? `${topTec.total} O.S` : "Sem dados"}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center mt-0.5">
            <MapPin size={14} className="text-green-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-gray-400 font-semibold uppercase">
              Top Regional
            </p>
            <p className="text-xs font-semibold text-gray-900 truncate">
              {topReg?.name ?? "—"}
            </p>
            <p className="text-[11px] text-gray-500">
              {topReg ? `${topReg.total} O.S` : "Sem dados"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetasDashboardWidget;
