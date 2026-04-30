import { useMemo } from "react";
import { Activity, Gauge, Moon, Trophy } from "lucide-react";

function kpiTone(type) {
  const tones = {
    blue: {
      icon: "bg-blue-50 text-blue-600",
      value: "text-blue-700",
    },
    green: {
      icon: "bg-emerald-50 text-emerald-600",
      value: "text-emerald-700",
    },
    amber: {
      icon: "bg-amber-50 text-amber-600",
      value: "text-amber-700",
    },
    purple: {
      icon: "bg-purple-50 text-purple-600",
      value: "text-purple-700",
    },
  };

  return tones[type] || tones.blue;
}

function KpiCard({ icon, label, value, helper, tone }) {
  const palette = kpiTone(tone);
  const IconComponent = icon;

  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${palette.icon}`}
        >
          <IconComponent size={18} />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
            {label}
          </p>
          <p className={`text-2xl font-black ${palette.value}`}>{value}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">{helper}</p>
    </div>
  );
}

export default function PainelProdutividadeWidget({ historico = [] }) {
  const dados = useMemo(() => {
    const ultimaAnalise = historico?.[0];
    const tecs = ultimaAnalise?.resultadosTecnicos || [];

    if (!tecs.length) {
      return null;
    }

    const totalOS = tecs.reduce((acc, t) => acc + Number(t.totalOS || 0), 0);
    const totalRetiradas = tecs.reduce(
      (acc, t) => acc + Number(t.totalRetiradas || 0),
      0,
    );
    const mediaOcupacao =
      tecs.reduce((acc, t) => acc + Number(t.pctOcupado || 0), 0) / tecs.length;
    const ociosos = tecs.filter((t) =>
      (t.diasAvaliados || []).some((d) => Number(d.capacidadeRestante || 0) > 0),
    ).length;

    const ranking = [...tecs]
      .map((t) => ({
        nome: t.nome || "Sem nome",
        regional: t.regional || "Sem regional",
        totalOS: Number(t.totalOS || 0),
        totalRetiradas: Number(t.totalRetiradas || 0),
        pctOcupado: Number(t.pctOcupado || 0),
      }))
      .sort((a, b) => {
        if (b.totalOS !== a.totalOS) return b.totalOS - a.totalOS;
        return b.totalRetiradas - a.totalRetiradas;
      })
      .slice(0, 5);

    const regionais = Object.values(
      tecs.reduce((acc, t) => {
        const regional = t.regional || "Sem regional";
        if (!acc[regional]) {
          acc[regional] = {
            regional,
            tecnicos: 0,
            totalOS: 0,
            totalRetiradas: 0,
            ocupacaoTotal: 0,
          };
        }

        acc[regional].tecnicos += 1;
        acc[regional].totalOS += Number(t.totalOS || 0);
        acc[regional].totalRetiradas += Number(t.totalRetiradas || 0);
        acc[regional].ocupacaoTotal += Number(t.pctOcupado || 0);
        return acc;
      }, {}),
    )
      .map((item) => ({
        ...item,
        mediaOS: item.tecnicos > 0 ? item.totalOS / item.tecnicos : 0,
        ocupacaoMedia:
          item.tecnicos > 0 ? item.ocupacaoTotal / item.tecnicos : 0,
      }))
      .sort((a, b) => b.mediaOS - a.mediaOS)
      .slice(0, 4);

    const maxRegional = Math.max(1, ...regionais.map((item) => item.mediaOS));

    return {
      totalTecnicos: tecs.length,
      totalOS,
      totalRetiradas,
      mediaOcupacao,
      ociosos,
      ranking,
      regionais,
      maxRegional,
    };
  }, [historico]);

  if (!dados) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Activity size={16} />
          </div>
          <p className="text-sm font-bold text-gray-900">
            Painel de Produtividade
          </p>
        </div>
        <p className="mt-4 text-sm text-gray-400">
          Nenhuma analise de tecnicos encontrada para montar o painel.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Activity size={16} />
            </div>
            <p className="text-sm font-bold text-gray-900">
              Painel de Produtividade
            </p>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Leitura executiva da producao dos tecnicos com foco em ocupacao,
            ritmo e regionais de melhor desempenho.
          </p>
        </div>

        <div className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
          {dados.totalTecnicos} tecnico(s) monitorado(s)
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={Trophy}
          label="OS Analisadas"
          value={dados.totalOS}
          helper="Volume consolidado da ultima analise"
          tone="blue"
        />
        <KpiCard
          icon={Gauge}
          label="Ocupacao Media"
          value={`${Math.round(dados.mediaOcupacao)}%`}
          helper="Media de ocupacao operacional"
          tone="green"
        />
        <KpiCard
          icon={Activity}
          label="Retiradas"
          value={dados.totalRetiradas}
          helper="Retiradas somadas dos tecnicos"
          tone="amber"
        />
        <KpiCard
          icon={Moon}
          label="Com Ociosidade"
          value={dados.ociosos}
          helper="Tecnicos com folga de capacidade"
          tone="purple"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-gray-900">
                Top 5 tecnicos por produtividade
              </p>
              <p className="text-xs text-gray-400">
                Ordenado por O.S analisadas e retiradas realizadas
              </p>
            </div>
            <div className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
              Ranking atual
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {dados.ranking.map((tecnico, index) => {
              const max = dados.ranking[0]?.totalOS || 1;
              return (
                <div key={`${tecnico.nome}-${tecnico.regional}`}>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-gray-900">
                        {index + 1}. {tecnico.nome}
                      </p>
                      <p className="text-xs text-gray-400">
                        {tecnico.regional} · {tecnico.totalRetiradas} retiradas ·{" "}
                        {Math.round(tecnico.pctOcupado)}% ocupacao
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-black text-blue-700">
                      {tecnico.totalOS} OS
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                      style={{ width: `${(tecnico.totalOS / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-gray-900">
                Regionais mais produtivas
              </p>
              <p className="text-xs text-gray-400">
                Media de O.S por tecnico na ultima analise
              </p>
            </div>
            <div className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
              Corte por regional
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {dados.regionais.map((regional) => (
              <div key={regional.regional}>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-gray-900">
                      {regional.regional}
                    </p>
                    <p className="text-xs text-gray-400">
                      {regional.tecnicos} tecnico(s) ·{" "}
                      {Math.round(regional.ocupacaoMedia)}% ocupacao media
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-black text-emerald-700">
                    {regional.mediaOS.toFixed(1)} OS/tec
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-400"
                    style={{
                      width: `${(regional.mediaOS / dados.maxRegional) * 100}%`,
                    }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-gray-400">
                  <span>{regional.totalOS} OS totais</span>
                  <span>{regional.totalRetiradas} retiradas</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
