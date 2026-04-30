import { useMemo } from "react";
import TabMatchOS from "./tabs/TabMatchOS";
import { useAgentesMatchPublico } from "./hooks/useAgentesMatchPublico";
import { resolveFirestoreDate } from "../../services/firestoreDate";
import PublicPageLoading from "./components/PublicPageLoading";

function formatData(meta) {
  if (!meta?.data) return "Nunca atualizado";
  const date = resolveFirestoreDate(meta.data);

  if (!date || Number.isNaN(date.getTime())) return "Nunca atualizado";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatarPeriodo(data) {
  if (!data) return "";
  const date = new Date(`${data}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR");
}

export default function AgentesMatchPage() {
  const { data, ultimaAtualizacao, loading } = useAgentesMatchPublico();
  const dadosValidos = useMemo(() => data || null, [data]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1200px]">
        <div className="overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-700 shadow-[0_24px_80px_rgba(15,23,42,0.25)]">
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <div className="inline-flex items-center rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-amber-100">
              Portal de Oportunidades
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Oportunidades para Agentes Autorizados
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200 sm:text-base">
              Aqui voce acompanha oportunidades identificadas para atendimento
              nas cidades dos agentes autorizados, com destaque para servicos
              proximos de retiradas e cancelamentos.
            </p>
            <div className="mt-5 flex flex-wrap gap-4 text-xs text-slate-200 sm:text-sm">
              <span>
                Ultima atualizacao:{" "}
                <strong className="text-white">
                  {formatData(ultimaAtualizacao)}
                </strong>
              </span>
              {ultimaAtualizacao?.periodoInicio && ultimaAtualizacao?.periodoFim ? (
                <span>
                  Periodo:{" "}
                  <strong className="text-white">
                    {formatarPeriodo(ultimaAtualizacao.periodoInicio)}
                  </strong>{" "}
                  ate{" "}
                  <strong className="text-white">
                    {formatarPeriodo(ultimaAtualizacao.periodoFim)}
                  </strong>
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6">
          {loading ? (
            <PublicPageLoading
              title="Carregando oportunidades"
              description="Estamos reunindo os matches disponiveis para os agentes autorizados."
            />
          ) : (
            <TabMatchOS
              dataOverride={dadosValidos}
              mode="agentes-only"
              note="Consulte abaixo os matches disponiveis para cidades de agentes autorizados e identifique oportunidades de atendimento com maior proximidade."
            />
          )}
        </div>
      </div>
    </div>
  );
}
