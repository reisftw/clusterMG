import { AlertTriangle, X } from "lucide-react";

const FSFeriasConflitoBanner = ({ mensagem, onContinuar, onCancelar }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
    <div className="bg-white rounded-2xl shadow-2xl border border-orange-200 w-full max-w-md overflow-hidden">
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
          <AlertTriangle size={22} className="text-white" />
        </div>
        <div>
          <p className="font-bold text-white">Conflito de Férias</p>
          <p className="text-orange-100 text-xs">Atenção antes de continuar</p>
        </div>
      </div>
      <div className="p-6">
        <p className="text-gray-700 text-sm leading-relaxed mb-4">{mensagem}</p>
        <p className="text-gray-500 text-xs bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
          Você pode continuar mesmo assim, mas a solicitação precisará de
          aprovação manual de um gestor.
        </p>
      </div>
      <div className="flex gap-3 px-6 pb-6">
        <button
          onClick={onCancelar}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
        >
          <X size={15} /> Cancelar
        </button>
        <button
          onClick={onContinuar}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
        >
          <AlertTriangle size={15} /> Ciente, continuar
        </button>
      </div>
    </div>
  </div>
);

export default FSFeriasConflitoBanner;
