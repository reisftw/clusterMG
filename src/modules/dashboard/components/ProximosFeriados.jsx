import { CalendarCheck } from "lucide-react";

const ProximosFeriados = ({ feriados }) => {
  /**
   * Converte "YYYY-MM-DD" para Date local (sem deslocamento de fuso).
   * new Date("2026-04-03") interpretaria como UTC 00:00, exibindo
   * 02/04 no Brasil (UTC-3). Ao construir com (ano, mes, dia) o JS
   * usa o fuso local e a data exibida fica correta.
   */
  const formatarData = (dateStr) => {
    if (!dateStr) return "—";
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
          <CalendarCheck size={16} className="text-blue-600" />
        </div>
        <p className="text-sm font-bold text-gray-900">Próximos Feriados</p>
      </div>

      {!feriados?.length ? (
        <p className="text-sm text-gray-400 text-center py-6">
          Nenhum feriado próximo.
        </p>
      ) : (
        <ul className="space-y-2">
          {feriados.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0"
            >
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span className="text-sm text-gray-700 font-medium">
                  {f.name}
                </span>
              </div>
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">
                {formatarData(f.date)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ProximosFeriados;
