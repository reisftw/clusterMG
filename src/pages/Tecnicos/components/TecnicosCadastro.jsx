import React, { useState } from "react";
import { Pencil, Trash2, Plus, X, Check } from "lucide-react";
import Spinner from "../../../components/ui/Spinner";

const VAZIO = {
  nome: "",
  regional: "",
  jornada: 8,
  deslocamento: 1.5,
  cidade: "",
};

export default function TecnicosCadastro({
  tecnicos,
  regionais,
  onSalvar,
  onExcluir,
  loading,
}) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  function abrirNovo() {
    setForm(VAZIO);
    setEditId(null);
    setModal(true);
  }

  function abrirEditar(id) {
    const t = tecnicos[id];
    setForm({
      nome: t.nome,
      regional: t.regional || "",
      jornada: t.jornada,
      deslocamento: t.deslocamento ?? 1.5,
      cidade: t.cidade || "",
    });
    setEditId(id);
    setModal(true);
  }

  async function salvar() {
    if (!form.nome.trim()) return;
    setSaving(true);
    await onSalvar(editId, form);
    setSaving(false);
    setModal(false);
  }

  // Label da escala derivado da jornada
  function escalaLabel(jornada) {
    return jornada >= 12 ? "12×36" : "Seg–Sex";
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm font-bold text-gray-700">
          {Object.keys(tecnicos).length} técnico(s) cadastrado(s)
        </p>
        <button
          onClick={abrirNovo}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
        >
          <Plus size={15} /> Novo Técnico
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : Object.keys(tecnicos).length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <span className="text-5xl mb-4">👷</span>
          <p className="text-gray-600 font-semibold">
            Nenhum técnico cadastrado
          </p>
          <p className="text-gray-400 text-sm mt-1">
            Clique em "Novo Técnico" para começar
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Object.entries(tecnicos).map(([id, t]) => (
            <div
              key={id}
              className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-bold text-gray-900">{t.nome}</p>
                  <p className="text-xs text-gray-400">
                    {t.regional || "Sem regional"}{" "}
                    {t.cidade ? `· ${t.cidade}` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => abrirEditar(id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Excluir ${t.nome}?`)) onExcluir(id);
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { v: `${t.jornada}h`, l: "Jornada" },
                  { v: escalaLabel(t.jornada), l: "Escala" },
                  { v: `${t.deslocamento ?? 1.5}h`, l: "Deslocamento" },
                ].map((item) => (
                  <div key={item.l} className="bg-gray-50 rounded-lg p-2">
                    <p className="font-bold text-gray-900 text-sm">{item.v}</p>
                    <p className="text-[10px] text-gray-400 uppercase">
                      {item.l}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-gray-900">
                {editId ? "Editar Técnico" : "Novo Técnico"}
              </h3>
              <button
                onClick={() => setModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {[
                {
                  label: "Nome completo",
                  key: "nome",
                  type: "text",
                  placeholder: "Nome do técnico",
                },
                {
                  label: "Cidade base",
                  key: "cidade",
                  type: "text",
                  placeholder: "Cidade principal",
                },
              ].map((f) => (
                <div key={f.key}>
                  <label className="text-xs font-bold text-gray-500 block mb-1">
                    {f.label}
                  </label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={form[f.key]}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, [f.key]: e.target.value }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
              ))}

              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">
                  Regional
                </label>
                <select
                  value={form.regional}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, regional: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                >
                  <option value="">Selecione a regional</option>
                  {Object.values(regionais).map((r) => (
                    <option key={r.nome} value={r.nome}>
                      {r.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">
                  Jornada diária (horas) —{" "}
                  <span className="text-blue-500">
                    {form.jornada >= 12 ? "Escala 12×36" : "Seg–Sex"}
                  </span>
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="4"
                  max="12"
                  value={form.jornada}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      jornada: parseFloat(e.target.value) || 8,
                    }))
                  }
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                />
                <p className="text-xs text-gray-400 mt-1">
                  8h = Seg–Sex &nbsp;|&nbsp; 12h = 12×36
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">
                  Deslocamento diário (horas)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="4"
                  value={form.deslocamento}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      deslocamento: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Padrão: 1,5h/dia — descontado da capacidade útil
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModal(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={saving || !form.nome.trim()}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Check size={15} />
                )}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
