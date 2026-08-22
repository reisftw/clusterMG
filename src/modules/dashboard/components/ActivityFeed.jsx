import { Activity } from "lucide-react";
import { resolveDataDate } from "../../../services/dataDate";

const MODULO_COLOR = {
  ferias: "bg-blue-50 text-blue-600",
  frota: "bg-green-50 text-green-600",
  feriados: "bg-purple-50 text-purple-600",
  usuarios: "bg-orange-50 text-orange-600",
};

const formatarTempo = (timestamp) => {
  const date = resolveDataDate(timestamp);
  if (!date) return "-";

  const diff = Math.floor((new Date() - date) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
};

const ActivityFeed = ({ atividades }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
    <div className="flex items-center gap-2 mb-5">
      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
        <Activity size={16} className="text-blue-600" />
      </div>
      <p className="text-sm font-bold text-gray-900">Atividade Recente</p>
    </div>

    {!atividades?.length ? (
      <p className="text-sm text-gray-400 text-center py-6">
        Nenhuma atividade registrada.
      </p>
    ) : (
      <ul className="space-y-1">
        {atividades.map((a, i) => (
          <li
            key={i}
            className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                <span className="text-white text-[10px] font-bold">
                  {a.nome?.charAt(0)?.toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-700">
                  <span className="font-semibold text-gray-900">{a.nome}</span>{" "}
                  <span>{a.acao}</span>
                </p>
                {a.modulo && (
                  <span
                    className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-md mt-0.5 ${MODULO_COLOR[a.modulo] ?? "bg-gray-100 text-gray-500"}`}
                  >
                    {a.modulo}
                  </span>
                )}
              </div>
            </div>
            <span className="text-[10px] text-gray-400 font-medium shrink-0 ml-3">
              {formatarTempo(a.timestamp)}
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export default ActivityFeed;

