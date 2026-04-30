import { useState, useMemo, useEffect } from "react";
import { CalendarDays, X, User, Plus, Trash2, Pencil } from "lucide-react";
import { verificarConflitoEscala } from "../utils/escalaConflito";
import FSEscalaConflitoBanner from "./FSEscalaConflitoBanner";

// folgaParaEditar = objeto { id, colaborador_id, data, observacao } ou null (novo)
const FSEscalaLancamentoForm = ({
  onSubmit, // para novo: recebe array de objetos
  onEditar, // para edição: recebe (id, { data, observacao, tem_conflito })
  onClose,
  colaboradores = [],
  folgasExistentes = [],
  folgaParaEditar = null, // se preenchido, modo edição
}) => {
  const modoEdicao = !!folgaParaEditar;

  const [colaboradorId, setColaboradorId] = useState(
    folgaParaEditar?.colaborador_id ?? "",
  );
  const [datas, setDatas] = useState(
    folgaParaEditar ? [folgaParaEditar.data] : [""],
  );
  const [observacao, setObservacao] = useState(
    folgaParaEditar?.observacao ?? "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erro, setErro] = useState("");
  const [conflito, setConflito] = useState(null);

  const colab = useMemo(
    () => colaboradores.find((c) => c.id === colaboradorId),
    [colaboradorId, colaboradores],
  );

  const addData = () => setDatas((d) => [...d, ""]);
  const removeData = (i) => setDatas((d) => d.filter((_, idx) => idx !== i));
  const setData = (i, val) =>
    setDatas((d) => d.map((v, idx) => (idx === i ? val : v)));

  const datasValidas = datas.filter(Boolean);

  const handleSubmitInterno = async (forcar = false) => {
    setErro("");
    if (!colaboradorId) return setErro("Selecione um colaborador.");
    if (datasValidas.length === 0)
      return setErro("Adicione ao menos uma data.");

    // Ao editar, exclui a própria folga da checagem de conflito
    const folgasParaChecar = modoEdicao
      ? folgasExistentes.filter((f) => f.id !== folgaParaEditar.id)
      : folgasExistentes;

    if (!forcar && colab) {
      const resultado = verificarConflitoEscala({
        colaboradorId,
        regional: colab.regional,
        cargo: colab.cargo,
        datas: datasValidas,
        folgasExistentes: folgasParaChecar,
        colaboradores,
      });
      if (resultado.conflito) {
        setConflito({ mensagem: resultado.mensagem });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (modoEdicao) {
        // Edição: atualiza apenas data e observação
        await onEditar(folgaParaEditar.id, {
          data: datasValidas[0],
          observacao,
          tem_conflito: forcar,
        });
      } else {
        // Novo: lança múltiplos dias
        await onSubmit(
          datasValidas.map((data) => ({
            colaborador_id: colaboradorId,
            data,
            observacao,
            tem_conflito: forcar,
          })),
        );
      }
      onClose();
    } catch {
      setErro("Erro ao salvar folga.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center ${modoEdicao ? "bg-orange-50" : "bg-blue-50"}`}
              >
                {modoEdicao ? (
                  <Pencil size={16} className="text-orange-500" />
                ) : (
                  <CalendarDays size={16} className="text-blue-600" />
                )}
              </div>
              <p className="font-bold text-gray-900">
                {modoEdicao ? "Editar Folga" : "Lançar Folga(s)"}
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
            {/* Colaborador — bloqueado no modo edição */}
            {modoEdicao ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">
                    {colab?.nome?.charAt(0)?.toUpperCase() ?? "?"}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    {colab?.nome ?? "—"}
                  </p>
                  <p className="text-xs text-gray-400">
                    {colab?.cargo} · {colab?.regional}
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                  <User size={11} /> Colaborador *
                </label>
                <select
                  value={colaboradorId}
                  onChange={(e) => setColaboradorId(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="">Selecione...</option>
                  {colaboradores
                    .filter((c) => c.status === "ativo")
                    .sort((a, b) => a.nome.localeCompare(b.nome))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} — {c.cargo} ({c.regional})
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Info colaborador (modo novo) */}
            {!modoEdicao && colab && (
              <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 rounded-xl border border-blue-100">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">
                    {colab.nome?.charAt(0)?.toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-blue-800">
                    {colab.nome}
                  </p>
                  <p className="text-xs text-blue-500">
                    {colab.cargo} · {colab.regional} ·{" "}
                    {colab.turno === "12x36" ? "12x36" : "Seg-Sex"}
                  </p>
                </div>
              </div>
            )}

            {/* Datas */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-400">
                  {modoEdicao ? "Nova Data *" : "Dias de Folga *"}
                </label>
                {!modoEdicao && (
                  <button
                    onClick={addData}
                    className="flex items-center gap-1 text-xs text-blue-600 font-semibold hover:underline"
                  >
                    <Plus size={12} /> Adicionar dia
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {datas.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="date"
                      value={d}
                      onChange={(e) => setData(i, e.target.value)}
                      className="input-field flex-1"
                    />
                    {!modoEdicao && datas.length > 1 && (
                      <button
                        onClick={() => removeData(i)}
                        className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Contador */}
            {datasValidas.length > 0 && (
              <div className="flex items-center justify-center gap-2 px-4 py-2 bg-green-50 border border-green-100 rounded-xl">
                <CalendarDays size={14} className="text-green-600" />
                <span className="text-sm font-bold text-green-700">
                  {datasValidas.length} dia{datasValidas.length > 1 ? "s" : ""}{" "}
                  de folga
                </span>
              </div>
            )}

            {/* Observação */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                Observação (opcional)
              </label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: folga compensatória, feriado trabalhado..."
                rows={2}
                className="input-field w-full resize-none"
              />
            </div>

            {erro && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                {erro}
              </p>
            )}
          </div>

          {/* Rodapé */}
          <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => handleSubmitInterno(false)}
              disabled={isSubmitting}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2 ${
                modoEdicao
                  ? "bg-orange-500 hover:bg-orange-600"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {modoEdicao ? <Pencil size={14} /> : <CalendarDays size={14} />}
              {isSubmitting
                ? "Salvando..."
                : modoEdicao
                  ? "Salvar Edição"
                  : "Salvar Folga(s)"}
            </button>
          </div>
        </div>
      </div>

      {conflito && (
        <FSEscalaConflitoBanner
          mensagem={conflito.mensagem}
          onCancelar={() => setConflito(null)}
          onContinuar={() => {
            setConflito(null);
            handleSubmitInterno(true);
          }}
        />
      )}
    </>
  );
};

export default FSEscalaLancamentoForm;
