import { X } from "lucide-react";

import ModalShell from "../../../components/ui/ModalShell";

const MetasResumoMensalMonthDetailModal = ({ detail, onClose }) => {
  if (!detail) return null;

  return (
    <ModalShell onClose={onClose} showClose={false} size="4xl" bodyClassName="p-0">
      <div className="min-h-0">
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
            className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase text-gray-400">Meta</p>
              <p className="mt-1 text-2xl font-extrabold text-blue-700">
                {detail.meta.toLocaleString("pt-BR")}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Brasil Tecpar 65%
              </p>
              <p className="mt-1 text-2xl font-extrabold text-amber-700">
                {detail.metaBrasilTecpar.meta.toLocaleString("pt-BR")}
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
            className={`rounded-3xl border p-5 ${
              detail.metaBrasilTecpar.atingiu
                ? "border-green-100 bg-green-50"
                : "border-amber-100 bg-amber-50"
            }`}
          >
            <p
              className={`text-sm font-bold ${
                detail.metaBrasilTecpar.atingiu
                  ? "text-green-700"
                  : "text-amber-800"
              }`}
            >
              Meta fixa Brasil Tecpar: 65% em qualquer mes.
            </p>
            <p className="mt-2 text-sm text-gray-700">
              Referencia Brasil Tecpar:{" "}
              <strong>
                {detail.metaBrasilTecpar.meta.toLocaleString("pt-BR")} retiradas
              </strong>{" "}
              sobre {detail.cancelamentos.toLocaleString("pt-BR")} cancelamentos.
              {detail.metaBrasilTecpar.atingiu ? (
                <>
                  {" "}
                  Meta atingida com{" "}
                  <strong>{detail.metaBrasilTecpar.percentAchieved}%</strong> da
                  referencia fixa.
                </>
              ) : (
                <>
                  {" "}
                  Faltam{" "}
                  <strong>
                    {detail.metaBrasilTecpar.falta.toLocaleString("pt-BR")} retiradas
                  </strong>{" "}
                  para atingir essa referencia.
                </>
              )}
            </p>
          </div>

          <div
            className={`rounded-3xl border p-5 ${detail.atingiu ? "border-green-100 bg-green-50" : "border-red-100 bg-red-50"}`}
          >
            <p
              className={`text-sm font-bold ${detail.atingiu ? "text-green-700" : "text-red-700"}`}
            >
              {detail.atingiu
                ? `Mes entregue dentro da ${String(detail.metaModeLabel || "meta sazonal").toLowerCase()}.`
                : detail.mesEncerrado
                  ? `Mes encerrado sem atingir a ${String(detail.metaModeLabel || "meta sazonal").toLowerCase()}.`
                  : `Mes ainda em andamento abaixo da ${String(detail.metaModeLabel || "meta sazonal").toLowerCase()}.`}
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
                Para atingir a {String(detail.metaModeLabel || "meta sazonal").toLowerCase()} de {detail.metaSazonal}%, o mes precisaria de{" "}
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
    </ModalShell>
  );
};

export default MetasResumoMensalMonthDetailModal;

