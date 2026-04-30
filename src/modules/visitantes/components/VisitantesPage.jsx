import { Globe, Link2, MousePointerClick, Users } from "lucide-react";
import Spinner from "../../../components/ui/Spinner";
import { useVisitantes } from "../hooks/useVisitantes";

function formatDateTime(value) {
  if (!value) return "--";
  const date = value.toDate?.() || new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SummaryCard({ title, value, icon, tone = "orange" }) {
  const IconComponent = icon;
  const toneMap = {
    orange: "from-orange-500/15 to-orange-100 border-orange-200 text-orange-600",
    blue: "from-blue-500/15 to-blue-100 border-blue-200 text-blue-600",
    green: "from-emerald-500/15 to-emerald-100 border-emerald-200 text-emerald-600",
    purple: "from-violet-500/15 to-violet-100 border-violet-200 text-violet-600",
  };

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${toneMap[tone]} p-5 shadow-sm`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className="rounded-2xl bg-white/70 p-3 shadow-sm">
          <IconComponent size={22} />
        </div>
      </div>
    </div>
  );
}

function MiniBarChart({ items = [], emptyText = "Sem dados", color = "bg-blue-500" }) {
  const max = Math.max(...items.map((item) => item.total || 0), 0);

  if (!items.length || max === 0) {
    return <p className="text-sm text-gray-500">{emptyText}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label || item.hora} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
            <span>{item.label || `${String(item.hora).padStart(2, "0")}h`}</span>
            <span className="font-semibold text-gray-700">{item.total}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full ${color}`}
              style={{ width: `${Math.max((item.total / max) * 100, item.total ? 8 : 0)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function VisitantesPage() {
  const { visitas, loading, selectedDate, setSelectedDate, resumo, analytics } =
    useVisitantes();

  if (loading) {
    return <Spinner fullScreen />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestor de Visitas</h1>
          <p className="text-sm text-gray-500">
            Acompanhe quantas visitas entraram na página pública do painel e de
            onde elas vieram.
          </p>
        </div>

        <label className="flex flex-col gap-2 text-sm font-medium text-gray-600">
          Data
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-blue-400"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Total de visitas"
          value={resumo.total}
          icon={Users}
          tone="orange"
        />
        <SummaryCard
          title="Acessos diretos"
          value={resumo.diretas}
          icon={MousePointerClick}
          tone="blue"
        />
        <SummaryCard
          title="Origens externas"
          value={resumo.externas}
          icon={Globe}
          tone="green"
        />
        <SummaryCard
          title="Origens diferentes"
          value={resumo.origens.length}
          icon={Link2}
          tone="purple"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Total no mês"
          value={analytics.totalMes}
          icon={Users}
          tone="blue"
        />
        <SummaryCard
          title="Origem líder"
          value={analytics.topOrigem?.origem || "--"}
          icon={Globe}
          tone="green"
        />
        <SummaryCard
          title="Horário de pico"
          value={`${String(analytics.picoHora.hora || 0).padStart(2, "0")}h`}
          icon={MousePointerClick}
          tone="orange"
        />
        <SummaryCard
          title="Vs. dia anterior"
          value={`${analytics.diferencaDiaAnterior >= 0 ? "+" : ""}${analytics.diferencaDiaAnterior}`}
          icon={Link2}
          tone={analytics.diferencaDiaAnterior >= 0 ? "green" : "purple"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-900">Visitas por dia no mês</h2>
            <p className="text-sm text-gray-500">
              Evolução diária das entradas no mês da data selecionada.
            </p>
          </div>
          <MiniBarChart
            items={analytics.seriesMensal}
            emptyText="Sem visitas registradas neste mês."
            color="bg-blue-500"
          />
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-900">Horários de pico</h2>
            <p className="text-sm text-gray-500">
              Faixas horárias com maior volume na data selecionada.
            </p>
          </div>
          <MiniBarChart
            items={analytics.seriesHoras.filter((item) => item.total > 0)}
            emptyText="Nenhuma visita registrada nesta data."
            color="bg-emerald-500"
          />
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-900">Origem das visitas</h2>
            <p className="text-sm text-gray-500">
              Agrupamento por origem/referrer ou UTM.
            </p>
          </div>

          {resumo.origens.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma visita registrada nesta data.</p>
          ) : (
            <div className="space-y-3">
              {resumo.origens.map((origem) => (
                <div
                  key={origem.origem}
                  className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-gray-700">
                    {origem.origem}
                  </span>
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">
                    {origem.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-900">Visitas do dia</h2>
            <p className="text-sm text-gray-500">
              Histórico detalhado da página pública `/painel`.
            </p>
          </div>

          {visitas.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma visita registrada nesta data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-3 py-3 font-semibold">Horário</th>
                    <th className="px-3 py-3 font-semibold">Origem</th>
                    <th className="px-3 py-3 font-semibold">Tipo</th>
                    <th className="px-3 py-3 font-semibold">Referrer</th>
                  </tr>
                </thead>
                <tbody>
                  {visitas.map((visita) => (
                    <tr
                      key={visita.id}
                      className="border-b border-gray-50 align-top last:border-b-0"
                    >
                      <td className="px-3 py-3 text-gray-700">
                        {formatDateTime(visita.createdAt)}
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-900">
                        {visita.sourceLabel || "Desconhecida"}
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold capitalize text-gray-700">
                          {visita.sourceType || "desconhecido"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500">
                        <div className="max-w-[420px] break-all">
                          {visita.referrer || "Acesso direto"}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
