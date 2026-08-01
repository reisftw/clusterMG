import { useState } from "react";
import { Fuel, X } from "lucide-react";

const INICIAL = {
  veiculo_id: "",
  data: "",
  motorista: "",
  posto: "",
  litros: "",
  valor: "",
  km: "",
  comprovante: "",
  observacao: "",
};

export default function AbastecimentoForm({
  veiculos,
  colaboradores = [],
  onSubmit,
  onClose,
  inicial = null,
}) {
  const [form, setForm] = useState(inicial ?? INICIAL);
  const [erro, setErro] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handle = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro("");
    setIsSubmitting(true);
    try {
      await onSubmit({
        ...form,
        litros: Number(form.litros || 0),
        valor: Number(form.valor || 0),
        km: Number(form.km || 0),
      });
      onClose();
    } catch {
      setErro("Erro ao salvar abastecimento.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50">
              <Fuel size={16} className="text-orange-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900">
              {inicial ? "Editar" : "Registrar"} abastecimento
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Veículo</label>
              <select
                name="veiculo_id"
                value={form.veiculo_id}
                onChange={handle}
                required
                className="input-field"
              >
                <option value="">Selecione...</option>
                {veiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa} · {v.modelo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Data</label>
              <input
                name="data"
                type="date"
                value={form.data}
                onChange={handle}
                required
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Motorista</label>
              <select
                name="motorista"
                value={form.motorista}
                onChange={handle}
                className="input-field"
              >
                <option value="">Selecione...</option>
                {colaboradores.map((colaborador) => (
                  <option key={colaborador.id} value={colaborador.nome || ""}>
                    {colaborador.nome || "Sem nome"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Litros</label>
              <input
                name="litros"
                type="number"
                step="0.01"
                value={form.litros}
                onChange={handle}
                required
                className="input-field"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Valor</label>
              <input
                name="valor"
                type="number"
                step="0.01"
                value={form.valor}
                onChange={handle}
                required
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">KM no abastecimento</label>
              <input name="km" type="number" value={form.km} onChange={handle} className="input-field" />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Posto</label>
              <input
                name="posto"
                value={form.posto}
                onChange={handle}
                placeholder="Nome do posto"
                className="input-field"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Comprovante</label>
              <input
                name="comprovante"
                value={form.comprovante}
                onChange={handle}
                placeholder="Link ou referência"
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Observação</label>
            <textarea
              name="observacao"
              value={form.observacao}
              onChange={handle}
              rows={3}
              className="input-field resize-none"
              placeholder="Detalhes do abastecimento"
            />
          </div>

          {erro ? (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {erro}
            </div>
          ) : null}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 disabled:opacity-50">
              {isSubmitting ? "Salvando..." : inicial ? "Salvar alterações" : "Registrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
