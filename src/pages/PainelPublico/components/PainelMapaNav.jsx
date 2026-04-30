import { ArrowLeft } from "lucide-react";
import { ROUTES } from "../../../router/routes";

export default function PainelMapaNav({ current = "mapa" }) {
  function linkClass(active) {
    return `inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border transition-all ${
      active
        ? "bg-blue-600 border-blue-600 text-white shadow-sm"
        : "bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
    }`;
  }

  return (
    <div className="flex gap-3 mb-6 flex-wrap items-center">
      <a href={ROUTES.PAINEL_PUBLICO} className={linkClass(false)}>
        <ArrowLeft size={16} />
        Voltar ao painel
      </a>

      <a href={ROUTES.PAINEL_MAPA} className={linkClass(current === "mapa")}>
        Mapa de O.S
      </a>

      <a href={ROUTES.PAINEL_MATCH} className={linkClass(current === "match")}>
        Match - OS
      </a>
    </div>
  );
}
