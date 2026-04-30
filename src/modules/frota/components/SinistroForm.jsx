import { useState } from "react";
import { ShieldAlert, X } from "lucide-react";

const INICIAL = {
  veiculo_id: "",
  data: "",
  tipo: "colisao",
  status: "aberto",
  responsavel: "",
  regional: "",
  valor_estimado: "",
  franquia: "",
  descricao: "",
  observacao: "",
};

export default function SinistroForm({
  veiculos,
  colaboradores = [],
  regionais = [],
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
        valor_estimado: Number(form.valor_estimado || 0),
        franquia: Number(form.franquia || 0),
      });
      onClose();
    } catch {
      setErro("Erro ao salvar sinistro.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50">
              <ShieldAlert size={18} className="text-rose-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {inicial ? "Editar" : "Registrar"} sinistro
              </h3>
              <p className="text-xs text-slate-400">Central de ocorrencias da frota</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Veiculo</label>
              <select
                name="veiculo_id"
                value={form.veiculo_id}
                onChange={handle}
                required
                className="input-field"
              >
                <option value="">Selecione...</option>
                {veiculos.map((veiculo) => (
                  <option key={veiculo.id} value={veiculo.id}>
                    {veiculo.placa} · {veiculo.modelo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Data</label>
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Tipo</label>
              <select name="tipo" value={form.tipo} onChange={handle} className="input-field">
                <option value="colisao">Colisao</option>
                <option value="furto">Furto</option>
                <option value="avaria">Avaria</option>
                <option value="terceiros">Terceiros</option>
                <option value="outro">Outro</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Status</label>
              <select name="status" value={form.status} onChange={handle} className="input-field">
                <option value="aberto">Aberto</option>
                <option value="analise">Em analise</option>
                <option value="resolvido">Resolvido</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Regional</label>
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
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Responsavel</label>
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Valor estimado</label>
              <input
                name="valor_estimado"
                type="number"
                step="0.01"
                value={form.valor_estimado}
                onChange={handle}
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Franquia</label>
              <input
                name="franquia"
                type="number"
                step="0.01"
                value={form.franquia}
                onChange={handle}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Descricao</label>
            <input
              name="descricao"
              value={form.descricao}
              onChange={handle}
              required
              className="input-field"
              placeholder="Resumo do ocorrido"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Observacao</label>
            <textarea
              name="observacao"
              value={form.observacao}
              onChange={handle}
              rows={3}
              className="input-field resize-none"
              placeholder="Detalhes adicionais do sinistro"
            />
          </div>

          {erro ? (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {erro}
            </div>
          ) : null}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
            >
              {isSubmitting ? "Salvando..." : inicial ? "Salvar alteracoes" : "Registrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
