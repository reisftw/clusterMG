import { useMemo, useState } from "react";
import { Target, TrendingUp, CalendarDays, Activity } from "lucide-react";
import { useMetasDashboard } from "../../metas/hooks/useMetasDashboard";
import { buildMonthProjection } from "../../metas/hooks/useMetasResumoMensal";
import { recalcularSaldoDiario } from "../../metas/utils/metasSaldo";
import { META_BASES } from "../../metas/constants/metasBaseConfig";
import RetorninhoLoader from "../../../components/ui/RetorninhoLoader";

const FONTES_DADOS_DASHBOARD = META_BASES;

const MESES_DASHBOARD = [
  "Janeiro",
  "Fevereiro",
  "Marco",
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

function getMetaMesPorFonte(metaMes, fonte) {
  if (!metaMes) return null;
  if (fonte === "onnet") return metaMes.onnet || null;
  if (fonte === "onnetSempre") return metaMes.onnetSempre || null;
  return metaMes;
}

function temDadosOperacionais(metaMes) {
  return Boolean(
    metaMes &&
    (Number(metaMes.totalOS || 0) > 0 || Number(metaMes.meta || 0) > 0),
  );
}

const FeaturedMetasPanel = () => {
  const { metaMes, allData, loading, feriadosSet } = useMetasDashboard();
  const [fonteDados, setFonteDados] = useState("sempre");

  const metaMesFonte = useMemo(
    () => getMetaMesPorFonte(metaMes, fonteDados),
    [metaMes, fonteDados],
  );

  const fonteSelecionada =
    FONTES_DADOS_DASHBOARD.find((fonte) => fonte.id === fonteDados) ||
    FONTES_DADOS_DASHBOARD[0];

  const ultimasEntregas = useMemo(() => {
    const currentIndex = MESES_DASHBOARD.indexOf(metaMes?.mes);
    const maxIndex = currentIndex >= 0 ? currentIndex : MESES_DASHBOARD.length - 1;

    return MESES_DASHBOARD
      .slice(0, maxIndex + 1)
      .map((mes) => {
        const dados = getMetaMesPorFonte(allData?.[mes], fonteDados);
        if (!temDadosOperacionais(dados)) return null;
        const percent = Number(
          String(dados.percentAchieved ?? 0)
            .replace("%", "")
            .replace(",", "."),
        );
        return {
          mes: mes === "Marco" ? "Março" : mes,
          total: Number(dados.totalOS || 0),
          meta: Number(dados.meta || 0),
          percent: Number.isFinite(percent) ? percent : 0,
        };
      })
      .filter(Boolean)
      .reverse()
      .slice(0, 4);
  }, [allData, fonteDados, metaMes?.mes]);

  const metaStats = useMemo(() => {
    if (!temDadosOperacionais(metaMesFonte)) return null;

    const { metaDiaria, diasUteis, saldoDiario } = recalcularSaldoDiario(
      metaMesFonte,
      feriadosSet,
    );
    const projecao = metaMesFonte?.saldoDiario?.length
      ? buildMonthProjection(metaMesFonte, feriadosSet)
      : null;
    const meta = Number(metaMesFonte.meta || 0);
    const total = Number(metaMesFonte.totalOS || 0);
    const percentReal = Number(
      String(metaMesFonte.percentAchieved ?? 0)
        .replace("%", "")
        .replace(",", "."),
    );
    const percent = Number.isFinite(percentReal) ? percentReal : 0;
    const percentVisual = Math.min(100, Math.max(0, percent));
    const falta = Math.max(0, meta - total);
    const saldoMesAtual = saldoDiario[saldoDiario.length - 1]?.saldoMes ?? 0;

    return {
      meta,
      total,
      percent,
      percentVisual,
      falta,
      metaDiaria,
      diasUteis,
      ritmoAtual: projecao?.ritmoAtual ?? 0,
      saldoMesAtual,
      metaSazonal: metaMesFonte.metaSazonal ?? 80,
      metaModeLabel: metaMesFonte.metaModeLabel || "Meta sazonal",
      mes: metaMesFonte.mes,
    };
  }, [metaMesFonte, feriadosSet]);

  const renderFonteSelector = () => {
    if (!metaMes) return null;

    return (
      <div className="mt-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Base dos dados:{" "}
          <span className="text-orange-600">{fonteSelecionada.label}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {FONTES_DADOS_DASHBOARD.map((fonte) => {
            const disponivel = temDadosOperacionais(
              getMetaMesPorFonte(metaMes, fonte.id),
            );
            const ativo = fonteDados === fonte.id;

            return (
              <button
                key={fonte.id}
                type="button"
                onClick={() => disponivel && setFonteDados(fonte.id)}
                disabled={!disponivel}
                className={`rounded-lg border px-3 py-1.5 text-xs font-black transition ${
                  ativo
                    ? "border-orange-500 bg-orange-500 text-white shadow-orange"
                    : disponivel
                      ? "border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50"
                      : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                }`}
                title={
                  disponivel
                    ? `Ver dados ${fonte.label}`
                    : `Sem dados ${fonte.label} para este mês`
                }
              >
                {fonte.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <section className="rounded-lg border border-orange-100 bg-white p-6 shadow-card">
        <RetorninhoLoader compact size="sm" title="Carregando metas..." />
      </section>
    );
  }

  if (!metaStats) {
    return (
      <section className="rounded-lg border border-orange-100 bg-white p-6 shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50">
            <Target size={20} className="text-orange-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-950">META DO MÊS</p>
            <p className="text-sm text-slate-500">
              Nenhuma meta carregada para o mês atual.
            </p>
          </div>
        </div>
        {renderFonteSelector()}
      </section>
    );
  }

  const goalReached = metaStats.percent >= 100;
  const percentLabel = metaStats.percent.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-orange-200 bg-white shadow-card">
      <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <div className="min-w-0 border-b border-orange-100 bg-gradient-to-br from-orange-50 via-white to-white p-6 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-orange-600">
                Metas em destaque
              </p>
              <h2 className="text-2xl font-black text-slate-950">
                META DO MÊS
              </h2>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500 text-white shadow-orange">
              <Target size={20} />
            </div>
          </div>
          {renderFonteSelector()}

          <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full bg-slate-100">
            <div
              className="flex h-36 w-36 items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(#f97316 ${metaStats.percentVisual * 3.6}deg, #e5e7eb 0deg)`,
              }}
            >
              <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white">
                <span className="text-4xl font-black text-slate-950">
                  {percentLabel}%
                </span>
                <span className="text-sm font-semibold text-slate-500">
                  da meta
                </span>
              </div>
            </div>
          </div>

        </div>

        <div className="min-w-0 flex flex-col p-6">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">
                Desempenho até agora
              </p>
              <p className="mt-1 text-4xl font-black text-blue-700">
                {metaStats.total.toLocaleString("pt-BR")}
                <span className="text-2xl font-bold text-slate-500">
                  {" "}
                  / {metaStats.meta.toLocaleString("pt-BR")}
                </span>
              </p>
              <p className="text-sm font-semibold text-slate-500">
                O.S realizadas em {metaStats.mes === "Marco" ? "Março" : metaStats.mes}
              </p>
            </div>
            <span className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
              {metaStats.metaModeLabel} {metaStats.metaSazonal}%
            </span>
          </div>

          <div className="mb-6">
            <div className="h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-400"
                style={{ width: `${metaStats.percentVisual}%` }}
              />
            </div>
            <div className="mt-3 flex flex-col gap-2 text-sm font-semibold text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Faltam{" "}
                <span className="font-extrabold text-slate-950">
                  {metaStats.falta.toLocaleString("pt-BR")} O.S
                </span>{" "}
                para alcançar a meta
              </span>
              <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
                <TrendingUp size={14} className="mr-1 inline" />
                {goalReached ? "No ritmo" : "Acompanhar"}
              </span>
            </div>
          </div>

          <div className="mt-auto grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <CalendarDays size={18} className="mb-2 text-blue-600" />
              <p className="text-xs font-bold uppercase text-slate-500">
                Meta diária
              </p>
              <p className="text-xl font-black text-slate-950">
                {metaStats.metaDiaria}{" "}
                <span className="text-xs font-semibold text-slate-500">
                  O.S/dia
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <Activity size={18} className="mb-2 text-orange-500" />
              <p className="text-xs font-bold uppercase text-slate-500">
                Ritmo atual
              </p>
              <p
                className={`text-xl font-black ${
                  metaStats.ritmoAtual >= metaStats.metaDiaria
                    ? "text-green-700"
                    : "text-red-600"
                }`}
              >
                {metaStats.ritmoAtual}{" "}
                <span className="text-xs font-semibold text-slate-500">
                  O.S/dia
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <TrendingUp size={18} className="mb-2 text-green-600" />
              <p className="text-xs font-bold uppercase text-slate-500">
                Saldo do mês
              </p>
              <p
                className={`text-xl font-black ${
                  metaStats.saldoMesAtual >= 0
                    ? "text-green-700"
                    : "text-red-600"
                }`}
              >
                {metaStats.saldoMesAtual >= 0
                  ? `+${metaStats.saldoMesAtual}`
                  : metaStats.saldoMesAtual}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto border-t border-orange-100 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-black uppercase tracking-wide text-slate-600">
            Últimas entregas
          </p>
          <span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-black text-orange-600">
            {fonteSelecionada.label}
          </span>
        </div>
        {ultimasEntregas.length ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {ultimasEntregas.map((item) => (
              <div
                key={item.mes}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-800">
                    {item.mes}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-500">
                    {item.percent.toLocaleString("pt-BR", {
                      maximumFractionDigits: 1,
                    })}
                    % da meta
                  </p>
                </div>
                <p className="text-sm font-black text-blue-700">
                  {item.total.toLocaleString("pt-BR")}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs font-bold text-slate-400">
            Sem entregas anteriores carregadas.
          </p>
        )}
      </div>
    </section>
  );
};

export default FeaturedMetasPanel;

