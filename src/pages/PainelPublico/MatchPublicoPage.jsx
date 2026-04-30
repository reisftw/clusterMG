import { useMemo } from "react";
import PainelMapaNav from "./components/PainelMapaNav";
import TabMatchOS from "./tabs/TabMatchOS";
import { useMatchPublico } from "./hooks/useMatchPublico";
import PublicPageLoading from "./components/PublicPageLoading";
import { resolveFirestoreDate } from "../../services/firestoreDate";

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

export default function MatchPublicoPage() {
  const { data, ultimaAtualizacao, loading } = useMatchPublico();
  const dadosValidos = useMemo(() => data || null, [data]);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <div className="p-6 max-w-[1400px] mx-auto">
        <PainelMapaNav current="match" />

        <div className="mb-6 rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-700 shadow-sm">
          <div className="flex flex-wrap gap-4">
            <span>
              Ultima atualizacao:{" "}
              <strong className="text-slate-900">
                {formatData(ultimaAtualizacao)}
              </strong>
            </span>
            {ultimaAtualizacao?.periodoInicio && ultimaAtualizacao?.periodoFim ? (
              <span>
                Periodo:{" "}
                <strong className="text-slate-900">
                  {formatarPeriodo(ultimaAtualizacao.periodoInicio)}
                </strong>{" "}
                ate{" "}
                <strong className="text-slate-900">
                  {formatarPeriodo(ultimaAtualizacao.periodoFim)}
                </strong>
              </span>
            ) : null}
          </div>
        </div>

        {loading ? (
          <PublicPageLoading
            title="Carregando match"
            description="Estamos analisando os servicos e as retiradas proximas para montar as oportunidades."
          />
        ) : (
          <TabMatchOS dataOverride={dadosValidos} />
        )}
      </div>
    </div>
  );
}
