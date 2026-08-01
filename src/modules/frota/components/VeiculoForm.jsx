import { useState } from "react";
import { X, Car } from "lucide-react";

const CAMPOS_INICIAIS = {
  placa: "",
  modelo: "",
  km_atual: "",
  km_ultima_revisao: "",
  km_proxima_manutencao: "",
  status: "ativo",
  regional: "",
  responsavel: "",
  observacao: "",
};

const VeiculoForm = ({
  onSubmit,
  onClose,
  inicial = null,
  colaboradores = [],
  regionais = [],
}) => {
  const [form, setForm] = useState(inicial ?? CAMPOS_INICIAIS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erro, setErro] = useState("");

  const handle = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro("");
    setIsSubmitting(true);
    try {
      await onSubmit({
        ...form,
        km_atual: Number(form.km_atual),
        km_ultima_revisao: Number(form.km_ultima_revisao),
        km_proxima_manutencao: Number(form.km_proxima_manutencao),
      });
      onClose();
    } catch {
      setErro("Erro ao salvar veículo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const campos = [
    { name: "placa", label: "Placa", type: "text", placeholder: "ABC-1234" },
    { name: "modelo", label: "Modelo", type: "text", placeholder: "Ex: Fiat Strada" },
    { name: "km_atual", label: "KM Atual", type: "number", placeholder: "0" },
    { name: "km_ultima_revisao", label: "KM Última Revisão", type: "number", placeholder: "0" },
    { name: "km_proxima_manutencao", label: "KM Próxima Manutenção", type: "number", placeholder: "0" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
              <Car size={16} className="text-blue-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900">
              {inicial ? "Editar" : "Cadastrar"} Veículo
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            {campos.slice(0, 2).map(({ name, label, type, placeholder }) => (
              <div key={name}>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">{label}</label>
                <input
                  name={name}
                  type={type}
                  value={form[name]}
                  onChange={handle}
                  placeholder={placeholder}
                  required
                  className="input-field"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {campos.slice(2).map(({ name, label, type, placeholder }) => (
              <div key={name}>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">{label}</label>
                <input
                  name={name}
                  type={type}
                  value={form[name]}
                  onChange={handle}
                  placeholder={placeholder}
                  required
                  className="input-field"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Status</label>
              <select name="status" value={form.status} onChange={handle} className="input-field">
                <option value="ativo">Ativo</option>
                <option value="manutencao">Em manutenção</option>
                <option value="parado">Parado</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Regional</label>
              <select name="regional" value={form.regional} onChange={handle} className="input-field">
                <option value="">Selecione...</option>
                {regionais.map((regional) => (
                  <option key={regional.id || regional.nome} value={regional.nome || ""}>
                    {regional.nome || "Sem nome"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">Responsável</label>
              <select
                name="responsavel"
                value={form.responsavel}
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
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Observação</label>
            <textarea
              name="observacao"
              value={form.observacao}
              onChange={handle}
              rows={3}
              className="input-field resize-none"
              placeholder="Observações do veículo"
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
              {isSubmitting ? "Salvando..." : inicial ? "Salvar alterações" : "Cadastrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VeiculoForm;
