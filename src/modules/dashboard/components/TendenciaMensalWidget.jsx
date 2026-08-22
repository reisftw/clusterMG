import { TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buscarTodasMetas } from "../../metas/services/metasService";
import { INTERNAL_STATIC_DATA_UPDATED_EVENT } from "../../../services/internalStaticDataService";
import RetorninhoLoader from "../../../components/ui/RetorninhoLoader";

const MONTH_ORDER = {
  Janeiro: 1,
  Fevereiro: 2,
  Marco: 3,
  "Março": 3,
  Abril: 4,
  Maio: 5,
  Junho: 6,
  Julho: 7,
  Agosto: 8,
  Setembro: 9,
  Outubro: 10,
  Novembro: 11,
  Dezembro: 12,
};

export default function TendenciaMensalWidget() {
  const [allData, setAllData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const VERSION_KEY = "internal-static-data-version";

    const carregar = (force = false) => {
      setLoading(true);

      buscarTodasMetas(force)
        .then((data) => {
          if (mounted && data && typeof data === "object") setAllData(data);
          if (mounted && (!data || typeof data !== "object")) setAllData({});
        })
        .catch((error) => {
          console.error("Erro ao carregar tendência mensal:", error);
          if (mounted) setAllData({});
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    };

    carregar();

    const handleStaticDataUpdated = () => {
      carregar(true);
    };

    const handleStorageChange = (event) => {
      if (event.key !== VERSION_KEY) return;
      carregar(true);
    };

    window.addEventListener(
      INTERNAL_STATIC_DATA_UPDATED_EVENT,
      handleStaticDataUpdated,
    );
    window.addEventListener("storage", handleStorageChange);

    return () => {
      mounted = false;
      window.removeEventListener(
        INTERNAL_STATIC_DATA_UPDATED_EVENT,
        handleStaticDataUpdated,
      );
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const items = useMemo(() => {
    const validMonths = Object.keys(allData || {})
      .filter((month) => Number(allData?.[month]?.totalOS || 0) > 0)
      .sort((a, b) => (MONTH_ORDER[a] || 99) - (MONTH_ORDER[b] || 99));

    const lastMonths = validMonths.slice(-6);
    const maxTotal = Math.max(
      1,
      ...lastMonths.map((month) => Number(allData?.[month]?.totalOS || 0)),
    );

    return lastMonths.map((month) => {
      const total = Number(allData?.[month]?.totalOS || 0);
      const percent = Number(allData?.[month]?.percentAchieved || 0);
      return {
        month,
        total,
        percent,
        width: `${Math.max(8, Math.round((total / maxTotal) * 100))}%`,
      };
    });
  }, [allData]);

  const variacao = useMemo(() => {
    if (items.length < 2) return null;
    const atual = items[items.length - 1]?.total || 0;
    const anterior = items[items.length - 2]?.total || 0;
    if (!anterior) return null;
    return ((atual - anterior) / anterior) * 100;
  }, [items]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
          <TrendingUp size={16} className="text-violet-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900">Tendência Mensal</p>
          <p className="text-xs text-gray-400">
            Últimos meses com produção registrada
          </p>
        </div>
      </div>

      {loading ? (
        <RetorninhoLoader compact size="sm" title="Carregando tendência..." />
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400">Sem histórico suficiente.</p>
      ) : (
        <>
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.month}>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-gray-700">
                    {item.month === "Marco" ? "Março" : item.month}
                  </span>
                  <span className="text-xs font-semibold text-gray-500">
                    {item.total.toLocaleString("pt-BR")} O.S •{" "}
                    {item.percent.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                    style={{ width: item.width }}
                  />
                </div>
              </div>
            ))}
          </div>

          {variacao != null && (
            <div className="mt-5 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
              Variação do último mês:{" "}
              <span
                className={`font-bold ${variacao >= 0 ? "text-emerald-600" : "text-red-500"}`}
              >
                {variacao >= 0 ? "+" : ""}
                {variacao.toFixed(1)}%
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

