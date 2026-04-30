import { useState } from "react";
import { X, AlertTriangle, Pencil } from "lucide-react";

const TIPOS_SINISTRO = [
  { value: "colisao", label: "💥 Colisão" },
  { value: "furto", label: "🔓 Furto" },
  { value: "roubo", label: "🔫 Roubo" },
  { value: "vandalismo", label: "🪓 Vandalismo" },
  { value: "alagamento", label: "🌊 Alagamento" },
  { value: "outro", label: "📋 Outro" },
];

const STATUS_SINISTRO = [
  { value: "em_analise", label: "Em Análise" },
  { value: "aprovado", label: "Aprovado" },
  { value: "resolvido", label: "Resolvido" },
  { value: "negado", label: "Negado" },
];

const FSFrotaSinistroForm = ({
  veiculoId,
  onSubmit,
  onClose,
  sinistroParaEditar = null,
}) => {
  const modo = !!sinistroParaEditar;

  const [tipo, setTipo] = useState(sinistroParaEditar?.tipo ?? "colisao");
  const [data, setData] = useState(sinistroParaEditar?.data ?? "");
  const [descricao, setDescricao] = useState(
    sinistroParaEditar?.descricao ?? "",
  );
  const [bo, setBo] = useState(sinistroParaEditar?.bo ?? "");
  const [status, setStatus] = useState(
    sinistroParaEditar?.status ?? "em_analise",
  );
  const [valor, setValor] = useState(sinistroParaEditar?.valor ?? "");
  const [erro, setErro] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    setErro("");
    if (!data) return setErro("Informe a data.");
    if (!descricao) return setErro("Informe uma descrição.");

    setIsSaving(true);
    try {
      await onSubmit({
        veiculo_id: veiculoId,
        tipo,
        data,
        descricao: descricao.trim(),
        bo: bo.trim(),
        status,
        valor: valor ? Number(valor) : null,
      });
      onClose();
    } catch {
      setErro("Erro ao salvar sinistro.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${modo ? "bg-orange-50" : "bg-red-50"}`}
            >
              {modo ? (
                <Pencil size={16} className="text-orange-500" />
              ) : (
                <AlertTriangle size={16} className="text-red-500" />
              )}
            </div>
            <p className="font-bold text-gray-900">
              {modo ? "Editar Sinistro" : "Registrar Sinistro"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Tipo */}
          <div>
            <label className="text-xs text-gray-400 mb-2 block">Tipo *</label>
            <div className="grid grid-cols-3 gap-2">
              {TIPOS_SINISTRO.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTipo(t.value)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    tipo === t.value
                      ? "bg-red-600 text-white border-red-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-red-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="text-xs text-gray-400 mb-2 block">Status</label>
            <div className="flex flex-wrap gap-2">
              {STATUS_SINISTRO.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    status === s.value
                      ? "bg-gray-800 text-white border-gray-800"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Data *</label>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                Valor estimado (R$)
              </label>
              <input
                type="number"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                step="0.01"
                className="input-field w-full"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              Nº Boletim de Ocorrência
            </label>
            <input
              value={bo}
              onChange={(e) => setBo(e.target.value)}
              placeholder="Ex: 2024/123456"
              className="input-field w-full"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              Descrição *
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva o ocorrido..."
              rows={3}
              className="input-field w-full resize-none"
            />
          </div>

          {erro && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
              {erro}
            </p>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors ${modo ? "bg-orange-500 hover:bg-orange-600" : "bg-red-600 hover:bg-red-700"}`}
          >
            {isSaving ? "Salvando..." : modo ? "Salvar Edição" : "Registrar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FSFrotaSinistroForm;
