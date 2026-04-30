import React, { useState } from "react";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";

const VAZIO = { nome: "", cidade: "", uf: "" };

export default function TecnicosRegionais({
  regionais,
  tecnicos,
  onSalvar,
  onExcluir,
}) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  function contarTecnicos(nomeRegional) {
    return Object.values(tecnicos).filter((t) => t.regional === nomeRegional)
      .length;
  }

  function abrirNovo() {
    setForm(VAZIO);
    setEditId(null);
    setModal(true);
  }

  function abrirEditar(id) {
    const r = regionais[id];
    setForm({ nome: r.nome, cidade: r.cidade || "", uf: r.uf || "" });
    setEditId(id);
    setModal(true);
  }

  async function salvar() {
    if (!form.nome.trim()) return;
    setSaving(true);
    await onSalvar(editId, { ...form, uf: form.uf.toUpperCase() });
    setSaving(false);
    setModal(false);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm font-bold text-gray-700">
          {Object.keys(regionais).length} regional(is) cadastrada(s)
        </p>
        <button
          onClick={abrirNovo}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
        >
          <Plus size={15} /> Nova Regional
        </button>
      </div>

      {Object.keys(regionais).length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <span className="text-5xl mb-4">🗂️</span>
          <p className="text-gray-600 font-semibold">
            Nenhuma regional cadastrada
          </p>
          <p className="text-gray-400 text-sm mt-1">
            Clique em "Nova Regional" para começar
          </p>
        </div>
      ) : (
        <div className="overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-blue-600 text-white text-xs uppercase tracking-wide">
                {["Regional", "Cidade Base", "Estado", "Técnicos", "Ações"].map(
                  (h) => (
                    <th key={h} className="text-left px-4 py-3">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {Object.entries(regionais).map(([id, r], idx) => (
                <tr
                  key={id}
                  className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                >
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {r.nome}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{r.cidade || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{r.uf || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="bg-blue-50 text-blue-600 font-bold text-xs px-2 py-1 rounded-full">
                      {contarTecnicos(r.nome)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => abrirEditar(id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Excluir ${r.nome}?`)) onExcluir(id);
                        }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-gray-900">
                {editId ? "Editar Regional" : "Nova Regional"}
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
                  label: "Nome da regional",
                  key: "nome",
                  placeholder: "Ex: Metropolitana Sul",
                },
                {
                  label: "Cidade base",
                  key: "cidade",
                  placeholder: "Cidade principal",
                },
                { label: "Estado (UF)", key: "uf", placeholder: "MG", max: 2 },
              ].map((f) => (
                <div key={f.key}>
                  <label className="text-xs font-bold text-gray-500 block mb-1">
                    {f.label}
                  </label>
                  <input
                    type="text"
                    placeholder={f.placeholder}
                    maxLength={f.max}
                    value={form[f.key]}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, [f.key]: e.target.value }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                    style={f.key === "uf" ? { textTransform: "uppercase" } : {}}
                  />
                </div>
              ))}
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
