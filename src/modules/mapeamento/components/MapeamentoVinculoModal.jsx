import { useMemo, useState } from "react";
import { HardHat, Search, UserPlus, X } from "lucide-react";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function MapeamentoVinculoModal({
  regional,
  tecnicosDisponiveis = [],
  saving = false,
  onClose,
  onSave,
}) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState(regional?.tecnicoIds || []);

  const filteredTecnicos = useMemo(() => {
    const term = normalizeText(search);
    return tecnicosDisponiveis.filter((tecnico) => {
      if (!term) return true;
      const haystack = normalizeText(
        `${tecnico.nome} ${tecnico.cargo} ${tecnico.base_operacional}`,
      );
      return haystack.includes(term);
    });
  }, [search, tecnicosDisponiveis]);

  function toggleTecnico(tecnicoId) {
    setSelectedIds((current) =>
      current.includes(tecnicoId)
        ? current.filter((id) => id !== tecnicoId)
        : [...current, tecnicoId],
    );
  }

  async function handleSave() {
    await onSave(selectedIds);
    onClose();
  }

  if (!regional) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <UserPlus size={18} />
            </div>
            <div>
              <p className="text-base font-black text-gray-900">
                Vincular técnicos CLT
              </p>
              <p className="text-xs text-gray-400">{regional.nome}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Técnicos vinculados
              </p>
              <p className="mt-2 text-3xl font-black text-slate-900">
                {selectedIds.length}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Cada técnico CLT soma 110 O.S./mês de capacidade para a regional.
              </p>

              <div className="mt-4 space-y-2">
                {selectedIds.length ? (
                  tecnicosDisponiveis
                    .filter((tecnico) => selectedIds.includes(tecnico.id))
                    .map((tecnico) => (
                      <div
                        key={tecnico.id}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                      >
                        <p className="text-sm font-semibold text-slate-900">
                          {tecnico.nome}
                        </p>
                        <p className="text-xs text-slate-500">
                          {tecnico.cargo || "Técnico"}
                          {tecnico.base_operacional
                            ? ` · ${tecnico.base_operacional}`
                            : ""}
                        </p>
                      </div>
                    ))
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500">
                    Nenhum técnico vinculado ainda.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white">
              <div className="border-b border-gray-100 px-4 py-4">
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Buscar técnicos de Retirada
                </label>
                <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <Search size={16} className="text-gray-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por nome, cargo ou base"
                    className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
                  />
                </div>
              </div>

              <div className="max-h-[420px] overflow-y-auto p-4">
                <div className="space-y-2">
                  {filteredTecnicos.map((tecnico) => {
                    const checked = selectedIds.includes(tecnico.id);

                    return (
                      <label
                        key={tecnico.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition-all ${
                          checked
                            ? "border-blue-200 bg-blue-50"
                            : "border-gray-100 bg-white hover:border-blue-100 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTecnico(tecnico.id)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <HardHat size={14} className="text-blue-600" />
                            <p className="truncate text-sm font-bold text-gray-900">
                              {tecnico.nome}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            {tecnico.cargo || "Técnico"}
                            {tecnico.base_operacional
                              ? ` · ${tecnico.base_operacional}`
                              : ""}
                          </p>
                        </div>
                      </label>
                    );
                  })}

                  {!filteredTecnicos.length ? (
                    <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
                      Nenhum técnico CLT encontrado com esse filtro.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar vínculos"}
          </button>
        </div>
      </div>
    </div>
  );
}
