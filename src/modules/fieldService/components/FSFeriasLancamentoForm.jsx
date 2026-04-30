import { useMemo, useState } from "react";
import { CalendarDays, X, User } from "lucide-react";
import { verificarConflito } from "../utils/feriasConflito";
import FSFeriasConflitoBanner from "./FSFeriasConflitoBanner";

const isColaboradorAtivo = (colaborador) => {
  const status = String(colaborador?.status || "").toLowerCase();
  return ["ativo", "ativo(a)", "at", "em experiãªncia", "em experiência", "em_experiencia"].includes(status)
    || status === "ativo"
    || status === "em experiência"
    || status === "em experiãªncia";
};

const FSFeriasLancamentoForm = ({
  onSubmit,
  onClose,
  colaboradores = [],
  feriasExistentes = [],
  colaboradorFixo = null,
  dataLimite = "",
  titulo = "Solicitar FÃ©rias",
  textoAcao = "Solicitar",
}) => {
  const [colaboradorId, setColaboradorId] = useState(colaboradorFixo?.id ?? "");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [observacao, setObservacao] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erro, setErro] = useState("");
  const [conflito, setConflito] = useState(null);

  const colaboradoresDisponiveis = useMemo(
    () =>
      colaboradores
        .filter((item) => isColaboradorAtivo(item))
        .sort((a, b) => String(a?.nome ?? "").localeCompare(String(b?.nome ?? ""))),
    [colaboradores],
  );

  const calcularDias = () => {
    if (!dataInicio || !dataFim) return 0;
    const diff = new Date(dataFim) - new Date(dataInicio);
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1);
  };

  const getColab = () =>
    colaboradorFixo ?? colaboradores.find((item) => item.id === colaboradorId);

  const handleSubmitInterno = async (forcarEnvio = false) => {
    setErro("");

    const colaboradorSelecionadoId = colaboradorFixo?.id ?? colaboradorId;
    if (!colaboradorSelecionadoId) {
      setErro("Selecione um colaborador.");
      return;
    }

    if (!dataInicio || !dataFim) {
      setErro("Preencha as datas.");
      return;
    }

    if (new Date(dataFim) < new Date(dataInicio)) {
      setErro("A data de fim nÃ£o pode ser anterior ao inÃ­cio.");
      return;
    }

    if (dataLimite && dataInicio > dataLimite) {
      setErro(`A data de inÃ­cio deve ser atÃ© ${new Date(dataLimite + "T00:00:00").toLocaleDateString("pt-BR")}.`);
      return;
    }

    const colab = getColab();

    if (!forcarEnvio && colab) {
      const resultado = verificarConflito({
        colaboradorId: colaboradorSelecionadoId,
        regional: colab.regional,
        cargo: colab.cargo,
        dataInicio,
        dataFim,
        feriasExistentes,
        colaboradores,
      });

      if (resultado.conflito) {
        setConflito({ mensagem: resultado.mensagem });
        return;
      }
    }

    setIsSubmitting(true);

    try {
      await onSubmit({
        colaborador_id: colaboradorSelecionadoId,
        data_inicio: dataInicio,
        data_fim: dataFim,
        dias_gozados: calcularDias(),
        observacao,
        tem_conflito: forcarEnvio,
      });
      onClose();
    } catch {
      setErro(`Erro ao ${textoAcao.toLowerCase()}.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const dias = calcularDias();

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                <CalendarDays size={16} className="text-blue-600" />
              </div>
              <p className="font-bold text-gray-900">{titulo}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-6 space-y-4">
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
                    {colaboradorFixo.cargo} Â· {colaboradorFixo.regional}
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
                  onChange={(event) => setColaboradorId(event.target.value)}
                  className="input-field w-full"
                >
                  <option value="">Selecione...</option>
                  {colaboradoresDisponiveis.map((colaborador) => (
                    <option key={colaborador.id} value={colaborador.id}>
                      {colaborador.nome} â€” {colaborador.cargo} ({colaborador.regional})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  Data InÃ­cio *
                </label>
                <input
                  type="date"
                  value={dataInicio}
                  max={dataLimite || undefined}
                  onChange={(event) => setDataInicio(event.target.value)}
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
                  max={dataLimite || undefined}
                  onChange={(event) => setDataFim(event.target.value)}
                  className="input-field w-full"
                />
              </div>
            </div>

            {dias > 0 && (
              <div className="flex items-center justify-center gap-2 px-4 py-2 bg-green-50 border border-green-100 rounded-xl">
                <CalendarDays size={14} className="text-green-600" />
                <span className="text-sm font-bold text-green-700">
                  {dias} dia{dias > 1 ? "s" : ""} de fÃ©rias
                </span>
              </div>
            )}

            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                ObservaÃ§Ã£o (opcional)
              </label>
              <textarea
                value={observacao}
                onChange={(event) => setObservacao(event.target.value)}
                placeholder="Ex: fÃ©rias programadas..."
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
              {isSubmitting ? "Salvando..." : textoAcao}
            </button>
          </div>
        </div>
      </div>

      {conflito && (
        <FSFeriasConflitoBanner
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

export default FSFeriasLancamentoForm;
