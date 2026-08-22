import { CalendarCheck } from "lucide-react";

const ProximosFeriados = ({ feriados }) => {
  /**
   * Converte "YYYY-MM-DD" para Date local (sem deslocamento de fuso).
   * new Date("2026-04-03") interpretaria como UTC 00:00, exibindo
   * 02/04 no Brasil (UTC-3). Ao construir com (ano, mes, dia) o JS
   * usa o fuso local e a data exibida fica correta.
   */
  const formatarData = (dateStr) => {
    if (!dateStr) return "-";
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    });
  };

  return (
    <div className="flex flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
          <CalendarCheck size={16} className="text-blue-600" />
        </div>
        <p className="text-sm font-bold text-gray-900">Próximos Feriados</p>
      </div>

      {!feriados?.length ? (
        <p className="py-6 text-center text-sm text-gray-400">
          Nenhum feriado próximo.
        </p>
      ) : (
        <ul className="space-y-2">
          {feriados.map((feriado, index) => (
            <li
              key={index}
              className="flex items-center justify-between border-b border-gray-50 py-2.5 last:border-0"
            >
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                <span className="text-sm font-medium text-gray-700">
                  {feriado.name}
                </span>
              </div>
              <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600">
                {formatarData(feriado.date)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ProximosFeriados;
