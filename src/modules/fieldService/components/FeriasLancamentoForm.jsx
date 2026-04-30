import { useState } from "react";
import { CalendarDays, X, User, MapPin } from "lucide-react";
import { verificarConflito } from "../utils/feriasConflito";
import FeriasConflitoBanner from "./FeriasConflitoBanner";

const FeriasLancamentoForm = ({
  onSubmit,
  onClose,
  colaboradores = [],
  feriasExistentes = [],
  colaboradorFixo = null, // se passado, não deixa selecionar colaborador
  currentUser,
}) => {
  const [colaboradorId, setColaboradorId] = useState(colaboradorFixo?.id ?? "");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [observacao, setObservacao] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erro, setErro] = useState("");
  const [conflito, setConflito] = useState(null); // null | { mensagem, dados }

  const calcularDias = () => {
    if (!dataInicio || !dataFim) return 0;
    const diff = new Date(dataFim) - new Date(dataInicio);
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1);
  };

  const getColab = () =>
    colaboradorFixo ?? colaboradores.find((c) => c.id === colaboradorId);

  const handleSubmitInterno = async (forcarEnvio = false) => {
    setErro("");

    if (!colaboradorId) return setErro("Selecione um colaborador.");
    if (!dataInicio || !dataFim) return setErro("Preencha as datas.");
    if (new Date(dataFim) < new Date(dataInicio))
      return setErro("A data de fim não pode ser anterior ao início.");

    const colab = getColab();

    // Verificar conflito (apenas se não forçou)
    if (!forcarEnvio && colab) {
      const resultado = verificarConflito({
        colaboradorId,
        regional: colab.regional,
        cargo: colab.cargo,
        dataInicio,
        dataFim,
        feriasExistentes,
        colaboradores,
      });

      if (resultado.conflito) {
        setConflito({
          mensagem: resultado.mensagem,
          dados: { data_inicio: dataInicio, data_fim: dataFim },
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        colaborador_id: colaboradorId,
        data_inicio: dataInicio,
        data_fim: dataFim,
        dias_gozados: calcularDias(),
        observacao,
        tem_conflito: forcarEnvio, // flag para o gestor saber que teve conflito
      });
      onClose();
    } catch {
      setErro("Erro ao enviar solicitação.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const dias = calcularDias();

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                <CalendarDays size={16} className="text-blue-600" />
              </div>
              <p className="font-bold text-gray-900">Solicitar Férias</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"
            >
              <X size={16} />
            </button>
          </div>

          {/* Corpo */}
          <div className="p-6 space-y-4">
            {/* Seleção de colaborador */}
            {colaboradorFixo ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 rounded-xl border border-blue-100">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">
                    {colaboradorFixo.nome?.charAt(0)?.toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-blue-800">
                    {colaboradorFixo.nome}
                  </p>
                  <p className="text-xs text-blue-500">
                    {colaboradorFixo.cargo} · {colaboradorFixo.regional}
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

            {/* Datas */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  Data Início *
                </label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  Data Fim *
                </label>
                <input
                  type="date"
                  value={dataFim}
                  min={dataInicio}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="input-field w-full"
                />
              </div>
            </div>

            {/* Contador de dias */}
            {dias > 0 && (
              <div className="flex items-center justify-center gap-2 px-4 py-2 bg-green-50 border border-green-100 rounded-xl">
                <CalendarDays size={14} className="text-green-600" />
                <span className="text-sm font-bold text-green-700">
                  {dias} dia{dias > 1 ? "s" : ""} de férias
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
                placeholder="Ex: Férias programadas para viagem..."
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
          <div className="flex gap-3 px-6 pb-6">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => handleSubmitInterno(false)}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? "Enviando..." : "Solicitar"}
            </button>
          </div>
        </div>
      </div>

      {/* Banner de conflito */}
      {conflito && (
        <FeriasConflitoBanner
          mensagem={conflito.mensagem}
          onCancelar={() => setConflito(null)}
          onContinuar={() => {
            setConflito(null);
            handleSubmitInterno(true); // forçar envio mesmo com conflito
          }}
        />
      )}
    </>
  );
};

export default FeriasLancamentoForm;
