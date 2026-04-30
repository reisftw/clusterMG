import { useState } from "react";
import { X, Clock, Pencil } from "lucide-react";

const FSBancoHorasForm = ({
  colaboradores,
  onSubmit,
  onClose,
  lancamentoParaEditar = null,
  colaboradorFixo = null, // quando aberto pelo detalhe do colaborador
  currentUserNome = "",
}) => {
  const modo = !!lancamentoParaEditar;

  const [colaboradorId, setColaboradorId] = useState(
    lancamentoParaEditar?.colaborador_id ?? colaboradorFixo?.id ?? "",
  );
  const [colaboradorNome, setColaboradorNome] = useState(
    lancamentoParaEditar?.colaborador_nome ?? colaboradorFixo?.nome ?? "",
  );
  const [tipo, setTipo] = useState(lancamentoParaEditar?.tipo ?? "credito");
  const [horas, setHoras] = useState(lancamentoParaEditar?.horas ?? "");
  const [data, setData] = useState(lancamentoParaEditar?.data ?? "");
  const [dataCobranca, setDataCobranca] = useState(
    lancamentoParaEditar?.data_cobranca ?? "",
  );
  const [descricao, setDescricao] = useState(
    lancamentoParaEditar?.descricao ?? "",
  );
  const [motivoEdicao, setMotivoEdicao] = useState("");
  const [erro, setErro] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSelectColab = (e) => {
    const id = e.target.value;
    const colab = colaboradores.find((c) => c.id === id);
    setColaboradorId(id);
    setColaboradorNome(colab?.nome ?? "");
  };

  const handleSubmit = async () => {
    setErro("");
    if (!colaboradorId) return setErro("Selecione o colaborador.");
    if (!horas) return setErro("Informe as horas.");
    if (!/^\d{1,3}:\d{2}$/.test(horas))
      return setErro("Formato de horas inválido. Use HH:MM (ex: 02:30).");
    if (!data) return setErro("Informe a data.");
    if (!descricao.trim()) return setErro("Informe uma descrição.");
    if (modo && !motivoEdicao.trim())
      return setErro("Informe o motivo da edição.");

    setIsSaving(true);
    try {
      await onSubmit(
        {
          colaborador_id: colaboradorId,
          colaborador_nome: colaboradorNome,
          tipo,
          horas,
          data,
          data_cobranca: dataCobranca || null,
          descricao: descricao.trim(),
        },
        currentUserNome,
        motivoEdicao,
      );
      onClose();
    } catch {
      setErro("Erro ao salvar lançamento.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${modo ? "bg-orange-50" : tipo === "credito" ? "bg-green-50" : "bg-red-50"}`}
            >
              {modo ? (
                <Pencil size={16} className="text-orange-500" />
              ) : (
                <Clock
                  size={16}
                  className={
                    tipo === "credito" ? "text-green-600" : "text-red-500"
                  }
                />
              )}
            </div>
            <p className="font-bold text-gray-900">
              {modo ? "Editar Lançamento" : "Novo Lançamento"}
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
          {/* Tipo crédito/débito */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Tipo
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "credito", label: "➕ Crédito", cor: "green" },
                { value: "debito", label: "➖ Débito", cor: "red" },
              ].map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTipo(t.value)}
                  className={`py-3 rounded-xl text-sm font-bold border transition-all ${
                    tipo === t.value
                      ? t.value === "credito"
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-red-600 text-white border-red-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Colaborador */}
          {!colaboradorFixo && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                Colaborador *
              </label>
              <select
                value={colaboradorId}
                onChange={handleSelectColab}
                className="input-field w-full"
              >
                <option value="">Selecione...</option>
                {colaboradores
                  .filter((c) => c.status === "ativo")
                  .sort((a, b) => a.nome.localeCompare(b.nome))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {colaboradorFixo && (
            <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-bold">
                  {colaboradorFixo.nome?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-blue-800">
                  {colaboradorFixo.nome}
                </p>
                <p className="text-[10px] text-blue-500">
                  {colaboradorFixo.cargo}
                </p>
              </div>
            </div>
          )}

          {/* Horas + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                Horas * (HH:MM)
              </label>
              <input
                value={horas}
                onChange={(e) => setHoras(e.target.value)}
                placeholder="Ex: 02:30"
                maxLength={5}
                className="input-field w-full font-mono tracking-widest text-center"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Data *</label>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="input-field w-full"
              />
            </div>
          </div>

          {/* Data de cobrança */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              Data de Cobrança
              <span className="ml-1 text-[10px] text-gray-300">
                (quando será compensado)
              </span>
            </label>
            <input
              type="date"
              value={dataCobranca}
              onChange={(e) => setDataCobranca(e.target.value)}
              className="input-field w-full"
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              Descrição *
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Hora extra plantão sabado 15/03"
              rows={3}
              className="input-field w-full resize-none"
            />
          </div>

          {/* Motivo edição (só no modo editar) */}
          {modo && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                Motivo da Edição *
              </label>
              <input
                value={motivoEdicao}
                onChange={(e) => setMotivoEdicao(e.target.value)}
                placeholder="Ex: Correção de valor lançado incorretamente"
                className="input-field w-full"
              />
            </div>
          )}

          {erro && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
              {erro}
            </p>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors ${
              modo
                ? "bg-orange-500 hover:bg-orange-600"
                : tipo === "credito"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {isSaving ? "Salvando..." : modo ? "Salvar Edição" : "Lançar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FSBancoHorasForm;
