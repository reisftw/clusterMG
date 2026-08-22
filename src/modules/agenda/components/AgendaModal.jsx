import { useState } from "react";
import { X, Calendar, MapPin, Users } from "lucide-react";
import { useColaboradores } from "../../colaboradores/hooks/useColaboradores";

const TIPOS = ["Viagem", "Reuniao", "Visita Tecnica", "Treinamento", "Outro"];

const inputClass =
  "w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all";

const buildInitialForm = (evento) => ({
  atividade: evento?.atividade || "",
  tipo: evento?.tipo || "Viagem",
  cidade: evento?.cidade || "",
  data_inicio: evento?.data_inicio || "",
  data_fim: evento?.data_fim || "",
  descricao: evento?.descricao || "",
  participantes: evento?.participantes || [],
});

const AgendaModalContent = ({ evento, onSalvar, onClose }) => {
  const editando = !!evento;
  const { colaboradores } = useColaboradores();
  const [form, setForm] = useState(() => buildInitialForm(evento));
  const [saving, setSaving] = useState(false);

  const set = (field, val) => setForm((f) => ({ ...f, [field]: val }));

  const toggleParticipante = (colab) => {
    setForm((f) => {
      const existe = f.participantes.find((p) => p.id === colab.id);
      return {
        ...f,
        participantes: existe
          ? f.participantes.filter((p) => p.id !== colab.id)
          : [...f.participantes, { id: colab.id, nome: colab.nome, cargo: colab.cargo }],
      };
    });
  };

  const handleSalvar = async () => {
    if (!form.atividade.trim() || !form.data_inicio) return;
    setSaving(true);
    await onSalvar({ ...form, data_fim: form.data_fim || form.data_inicio });
    setSaving(false);
    onClose();
  };

  const tecnicos = colaboradores.filter(
    (c) => c.status === "Ativo" || c.status === "Em Experiencia",
  );
  const isSelected = (id) => form.participantes.some((p) => p.id === id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Calendar size={16} className="text-blue-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900">
              {editando ? "Editar Evento" : "Novo Evento"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Atividade *
            </label>
            <input
              className={inputClass}
              placeholder="Nome do evento"
              value={form.atividade}
              onChange={(e) => set("atividade", e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Tipo
            </label>
            <div className="flex flex-wrap gap-2">
              {TIPOS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("tipo", t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    form.tipo === t
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              <span className="flex items-center gap-1">
                <MapPin size={11} /> Cidade
              </span>
            </label>
            <input
              className={inputClass}
              placeholder="Ex: Belo Horizonte"
              value={form.cidade}
              onChange={(e) => set("cidade", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Data Inicio *
              </label>
              <input
                type="date"
                className={inputClass}
                value={form.data_inicio}
                onChange={(e) => set("data_inicio", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Data Fim
              </label>
              <input
                type="date"
                className={inputClass}
                value={form.data_fim}
                onChange={(e) => set("data_fim", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Descricao
            </label>
            <textarea
              className={`${inputClass} resize-none`}
              rows={3}
              placeholder="Detalhes do evento..."
              value={form.descricao}
              onChange={(e) => set("descricao", e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              <span className="flex items-center gap-1">
                <Users size={11} /> Participantes
              </span>
            </label>
            <div className="max-h-36 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-2 bg-gray-50">
              {tecnicos.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleParticipante(c)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${
                    isSelected(c.id)
                      ? "bg-blue-50 border border-blue-200"
                      : "hover:bg-white border border-transparent"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                      isSelected(c.id)
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {c.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`text-xs font-semibold truncate ${
                        isSelected(c.id) ? "text-blue-700" : "text-gray-700"
                      }`}
                    >
                      {c.nome}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">{c.cargo}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={saving || !form.atividade.trim() || !form.data_inicio}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Salvando..." : editando ? "Salvar alteracoes" : "Criar evento"}
          </button>
        </div>
      </div>
    </div>
  );
};

const AgendaModal = (props) => (
  <AgendaModalContent key={props.evento?.id ?? "novo-evento"} {...props} />
);

export default AgendaModal;

