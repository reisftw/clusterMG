import { useMemo } from "react";
import {
  Clock,
  TrendingUp,
  TrendingDown,
  Calendar,
  ChevronRight,
} from "lucide-react";

const FSBancoHorasCard = ({
  colaborador,
  lancamentos,
  calcularSaldo,
  minutosParaHoras,
  onClick,
}) => {
  const saldoMinutos = useMemo(
    () => calcularSaldo(colaborador.id),
    [colaborador.id, lancamentos],
  );

  const saldoTexto = minutosParaHoras(saldoMinutos);
  const positivo = saldoMinutos >= 0;
  const zerado = saldoMinutos === 0;

  const totalLancamentos = lancamentos.filter(
    (l) => l.colaborador_id === colaborador.id,
  ).length;

  const proximaCobranca = useMemo(() => {
    const hoje = new Date().toISOString().split("T")[0];
    return lancamentos
      .filter(
        (l) =>
          l.colaborador_id === colaborador.id &&
          l.data_cobranca &&
          l.data_cobranca >= hoje,
      )
      .sort((a, b) => a.data_cobranca.localeCompare(b.data_cobranca))[0];
  }, [lancamentos, colaborador.id]);

  return (
    <div
      className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group flex items-center gap-3 px-4 py-3"
      onClick={() => onClick(colaborador)}
    >
      {/* Avatar + saldo colorido */}
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-white text-sm ${
          zerado ? "bg-gray-400" : positivo ? "bg-green-600" : "bg-red-500"
        }`}
      >
        {colaborador.nome?.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-gray-800 truncate">
            {colaborador.nome}
          </p>
          {proximaCobranca && (
            <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-lg">
              <Calendar size={9} />
              {new Date(
                proximaCobranca.data_cobranca + "T00:00:00",
              ).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-[10px] text-gray-400 truncate">
            {colaborador.cargo}
          </p>
          {colaborador.regional && (
            <span className="text-[10px] text-gray-400">
              · {colaborador.regional}
            </span>
          )}
          <span className="text-[10px] text-gray-300">
            · {totalLancamentos} lançto(s)
          </span>
        </div>
      </div>

      {/* Saldo */}
      <div className="shrink-0 flex flex-col items-end gap-1">
        <div
          className={`flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-xs font-bold ${
            zerado
              ? "bg-gray-100 text-gray-500"
              : positivo
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-600"
          }`}
        >
          {!zerado &&
            (positivo ? <TrendingUp size={11} /> : <TrendingDown size={11} />)}
          {saldoTexto}h
        </div>
        <ChevronRight
          size={13}
          className="text-gray-300 group-hover:text-blue-400 transition-colors"
        />
      </div>
    </div>
  );
};

export default FSBancoHorasCard;
