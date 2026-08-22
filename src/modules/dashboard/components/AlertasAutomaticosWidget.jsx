import { AlertTriangle, BellRing } from "lucide-react";
import { useMemo } from "react";
import { useMetasDashboard } from "../../metas/hooks/useMetasDashboard";

function AlertItem({ icon, title, description, tone = "amber" }) {
  const IconComponent = icon;
  const tones = {
    red: "border-red-200 bg-red-50 text-red-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
  };

  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-white/70 p-2">
          <IconComponent size={16} />
        </div>
        <div>
          <p className="text-sm font-bold">{title}</p>
          <p className="mt-1 text-xs leading-5 opacity-90">{description}</p>
        </div>
      </div>
    </div>
  );
}

export default function AlertasAutomaticosWidget() {
  const { metaMes, loading } = useMetasDashboard();

  const alertas = useMemo(() => {
    const items = [];

    if (metaMes) {
      const pct = Number(metaMes.percentAchieved) || 0;
      const sazonal = Number(metaMes.metaSazonal) || 80;
      const metaLabel = String(metaMes.metaModeLabel || "meta sazonal").toLowerCase();

      if (pct < sazonal) {
        items.push({
          icon: AlertTriangle,
          title: "Meta mensal abaixo do esperado",
          description: `${pct.toFixed(1)}% atingido frente a ${metaLabel} de ${sazonal.toFixed(1)}%.`,
          tone: pct < sazonal * 0.8 ? "red" : "amber",
        });
      }
    }

    return items;
  }, [metaMes]);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
          <BellRing size={16} className="text-amber-600" />
        </div>
        <p className="text-sm font-bold text-gray-900">Alertas Automaticos</p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Atualizando alertas...</p>
      ) : alertas.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          Nenhum alerta critico no momento.
        </div>
      ) : (
        <div className="space-y-3">
          {alertas.map((alerta, index) => (
            <AlertItem key={index} {...alerta} />
          ))}
        </div>
      )}
    </div>
  );
}

