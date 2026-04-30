import { useState } from "react";
import { X, Wrench, Pencil } from "lucide-react";

const TIPOS_MANUTENCAO = [
  { value: "preventiva", label: "Preventiva" },
  { value: "corretiva", label: "Corretiva" },
  { value: "revisao", label: "Revisão" },
  { value: "pneu", label: "Pneu" },
  { value: "funilaria", label: "Funilaria" },
  { value: "eletrica", label: "Elétrica" },
  { value: "outro", label: "Outro" },
];

const FSFrotaManutencaoForm = ({
  veiculoId,
  onSubmit,
  onClose,
  manutencaoParaEditar = null,
}) => {
  const modo = !!manutencaoParaEditar;

  const [tipo, setTipo] = useState(manutencaoParaEditar?.tipo ?? "preventiva");
  const [data, setData] = useState(manutencaoParaEditar?.data ?? "");
  const [km, setKm] = useState(manutencaoParaEditar?.km ?? "");
  const [descricao, setDescricao] = useState(
    manutencaoParaEditar?.descricao ?? "",
  );
  const [valor, setValor] = useState(manutencaoParaEditar?.valor ?? "");
  const [oficina, setOficina] = useState(manutencaoParaEditar?.oficina ?? "");
  const [proximaKm, setProximaKm] = useState(
    manutencaoParaEditar?.proxima_km ?? "",
  );
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
        km: km ? Number(km) : null,
        descricao: descricao.trim(),
        valor: valor ? Number(valor) : null,
        oficina: oficina.trim(),
        proxima_km: proximaKm ? Number(proximaKm) : null,
      });
      onClose();
    } catch {
      setErro("Erro ao salvar manutenção.");
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
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${modo ? "bg-orange-50" : "bg-blue-50"}`}
            >
              {modo ? (
                <Pencil size={16} className="text-orange-500" />
              ) : (
                <Wrench size={16} className="text-blue-600" />
              )}
            </div>
            <p className="font-bold text-gray-900">
              {modo ? "Editar Manutenção" : "Registrar Manutenção"}
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
            <div className="flex flex-wrap gap-2">
              {TIPOS_MANUTENCAO.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTipo(t.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    tipo === t.value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
                  }`}
                >
                  {t.label}
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
                KM na data
              </label>
              <input
                type="number"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                placeholder="Ex: 45000"
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                Valor (R$)
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
            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                Próxima revisão (KM)
              </label>
              <input
                type="number"
                value={proximaKm}
                onChange={(e) => setProximaKm(e.target.value)}
                placeholder="Ex: 55000"
                className="input-field w-full"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Oficina</label>
            <input
              value={oficina}
              onChange={(e) => setOficina(e.target.value)}
              placeholder="Nome da oficina"
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
              placeholder="Descreva o serviço realizado..."
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
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors ${modo ? "bg-orange-500 hover:bg-orange-600" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {isSaving ? "Salvando..." : modo ? "Salvar Edição" : "Registrar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FSFrotaManutencaoForm;
