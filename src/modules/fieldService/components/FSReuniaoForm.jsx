import { useState, useMemo } from "react";
import {
  X,
  Users,
  Clock,
  Calendar,
  RefreshCw,
  Coffee,
  UtensilsCrossed,
  Search,
  Pencil,
} from "lucide-react";
import { CARGOS_FS } from "../../../constants/roles";

const RECORRENCIAS = [
  { value: "nenhuma", label: "Sem recorrência" },
  { value: "semanal", label: "Semanal" },
  { value: "quinzenal", label: "Quinzenal" },
  { value: "mensal", label: "Mensal" },
];

const FSReuniaoForm = ({
  onSubmit,
  onClose,
  colaboradores = [],
  reuniaoParaEditar = null,
}) => {
  const modo = !!reuniaoParaEditar;

  const [titulo, setTitulo] = useState(reuniaoParaEditar?.titulo ?? "");
  const [descricao, setDescricao] = useState(
    reuniaoParaEditar?.descricao ?? "",
  );
  const [dataInicio, setDataInicio] = useState(
    reuniaoParaEditar?.data_inicio ?? "",
  );
  const [horarioInicio, setHorarioInicio] = useState(
    reuniaoParaEditar?.horario_inicio ?? "",
  );
  const [horarioFim, setHorarioFim] = useState(
    reuniaoParaEditar?.horario_fim ?? "",
  );
  const [pausaLanche, setPausaLanche] = useState(
    reuniaoParaEditar?.pausa_lanche ?? false,
  );
  const [minLanche, setMinLanche] = useState(
    reuniaoParaEditar?.min_lanche ?? 15,
  );
  const [pausaAlmoco, setPausaAlmoco] = useState(
    reuniaoParaEditar?.pausa_almoco ?? false,
  );
  const [minAlmoco, setMinAlmoco] = useState(
    reuniaoParaEditar?.min_almoco ?? 60,
  );
  const [recorrencia, setRecorrencia] = useState(
    reuniaoParaEditar?.recorrencia ?? "nenhuma",
  );
  const [recorrenciaFim, setRecorrenciaFim] = useState(
    reuniaoParaEditar?.recorrencia_fim ?? "",
  );
  const [participantes, setParticipantes] = useState(
    new Set(reuniaoParaEditar?.participantes ?? []),
  );
  const [filtroCargo, setFiltroCargo] = useState("todos");
  const [buscaPart, setBuscaPart] = useState("");
  const [erro, setErro] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Duração líquida
  const duracaoLiquida = useMemo(() => {
    if (!horarioInicio || !horarioFim) return null;
    const [hi, mi] = horarioInicio.split(":").map(Number);
    const [hf, mf] = horarioFim.split(":").map(Number);
    let totalMin = hf * 60 + mf - (hi * 60 + mi);
    if (totalMin <= 0) return null;
    if (pausaLanche) totalMin -= minLanche;
    if (pausaAlmoco) totalMin -= minAlmoco;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h${m > 0 ? ` ${m}min` : ""} (líquido)`;
  }, [
    horarioInicio,
    horarioFim,
    pausaLanche,
    minLanche,
    pausaAlmoco,
    minAlmoco,
  ]);

  const colaboradoresFiltrados = useMemo(() => {
    return colaboradores
      .filter((c) => c.status === "ativo")
      .filter((c) => filtroCargo === "todos" || c.cargo === filtroCargo)
      .filter(
        (c) =>
          !buscaPart || c.nome?.toLowerCase().includes(buscaPart.toLowerCase()),
      )
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [colaboradores, filtroCargo, buscaPart]);

  const toggleParticipante = (id) => {
    setParticipantes((prev) => {
      const novo = new Set(prev);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      return novo;
    });
  };

  const selecionarTodosFiltrados = () => {
    setParticipantes((prev) => {
      const novo = new Set(prev);
      colaboradoresFiltrados.forEach((c) => novo.add(c.id));
      return novo;
    });
  };

  const removerTodosFiltrados = () => {
    setParticipantes((prev) => {
      const novo = new Set(prev);
      colaboradoresFiltrados.forEach((c) => novo.delete(c.id));
      return novo;
    });
  };

  const handleSubmit = async () => {
    setErro("");
    if (!titulo.trim()) return setErro("Informe o título da reunião.");
    if (!dataInicio) return setErro("Informe a data.");
    if (!horarioInicio) return setErro("Informe o horário de início.");
    if (!horarioFim) return setErro("Informe o horário de término.");
    if (participantes.size === 0)
      return setErro("Adicione ao menos um participante.");
    if (recorrencia !== "nenhuma" && !recorrenciaFim)
      return setErro("Informe até quando a recorrência deve repetir.");

    setIsSubmitting(true);
    try {
      await onSubmit({
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        data_inicio: dataInicio,
        horario_inicio: horarioInicio,
        horario_fim: horarioFim,
        pausa_lanche: pausaLanche,
        min_lanche: pausaLanche ? Number(minLanche) : 0,
        pausa_almoco: pausaAlmoco,
        min_almoco: pausaAlmoco ? Number(minAlmoco) : 0,
        recorrencia,
        recorrencia_fim: recorrencia !== "nenhuma" ? recorrenciaFim : null,
        participantes: [...participantes],
      });
      onClose();
    } catch {
      setErro("Erro ao salvar reunião.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${modo ? "bg-orange-50" : "bg-blue-50"}`}
            >
              {modo ? (
                <Pencil size={16} className="text-orange-500" />
              ) : (
                <Calendar size={16} className="text-blue-600" />
              )}
            </div>
            <p className="font-bold text-gray-900">
              {modo ? "Editar Reunião" : "Nova Reunião"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Título e descrição */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                Título da Reunião *
              </label>
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Alinhamento mensal de equipe"
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                Breve Relato / Pauta
              </label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descreva os tópicos que serão abordados..."
                rows={3}
                className="input-field w-full resize-none"
              />
            </div>
          </div>

          {/* Data e horários */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Clock size={12} /> Data e Horário
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  Data *
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
                  Início *
                </label>
                <input
                  type="time"
                  value={horarioInicio}
                  onChange={(e) => setHorarioInicio(e.target.value)}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  Término *
                </label>
                <input
                  type="time"
                  value={horarioFim}
                  onChange={(e) => setHorarioFim(e.target.value)}
                  className="input-field w-full"
                />
              </div>
            </div>
            {duracaoLiquida && (
              <div className="mt-2 flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 rounded-xl">
                <Clock size={13} className="text-blue-500" />
                <span className="text-xs font-bold text-blue-700">
                  Duração: {duracaoLiquida}
                </span>
              </div>
            )}
          </div>

          {/* Pausas */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Coffee size={12} /> Pausas
            </p>
            <div className="grid grid-cols-2 gap-3">
              {/* Lanche */}
              <div
                className={`p-4 rounded-xl border transition-all ${pausaLanche ? "border-orange-200 bg-orange-50" : "border-gray-200 bg-gray-50"}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Coffee
                      size={14}
                      className={
                        pausaLanche ? "text-orange-500" : "text-gray-400"
                      }
                    />
                    <span className="text-xs font-semibold text-gray-700">
                      Lanche
                    </span>
                  </div>
                  <button
                    onClick={() => setPausaLanche((v) => !v)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${pausaLanche ? "bg-orange-500" : "bg-gray-300"}`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${pausaLanche ? "left-5" : "left-0.5"}`}
                    />
                  </button>
                </div>
                {pausaLanche && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={5}
                      max={60}
                      value={minLanche}
                      onChange={(e) => setMinLanche(e.target.value)}
                      className="input-field w-16 text-center text-sm"
                    />
                    <span className="text-xs text-gray-500">minutos</span>
                  </div>
                )}
              </div>

              {/* Almoço */}
              <div
                className={`p-4 rounded-xl border transition-all ${pausaAlmoco ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <UtensilsCrossed
                      size={14}
                      className={
                        pausaAlmoco ? "text-green-600" : "text-gray-400"
                      }
                    />
                    <span className="text-xs font-semibold text-gray-700">
                      Almoço
                    </span>
                  </div>
                  <button
                    onClick={() => setPausaAlmoco((v) => !v)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${pausaAlmoco ? "bg-green-500" : "bg-gray-300"}`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${pausaAlmoco ? "left-5" : "left-0.5"}`}
                    />
                  </button>
                </div>
                {pausaAlmoco && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={15}
                      max={120}
                      value={minAlmoco}
                      onChange={(e) => setMinAlmoco(e.target.value)}
                      className="input-field w-16 text-center text-sm"
                    />
                    <span className="text-xs text-gray-500">minutos</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recorrência */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <RefreshCw size={12} /> Recorrência
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {RECORRENCIAS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRecorrencia(r.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    recorrencia === r.value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {recorrencia !== "nenhuma" && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  Repetir até *
                </label>
                <input
                  type="date"
                  value={recorrenciaFim}
                  min={dataInicio}
                  onChange={(e) => setRecorrenciaFim(e.target.value)}
                  className="input-field w-full sm:w-48"
                />
              </div>
            )}
          </div>

          {/* Participantes */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Users size={12} /> Participantes
              <span className="ml-auto text-blue-600 font-bold normal-case text-xs">
                {participantes.size} selecionado(s)
              </span>
            </p>

            {/* Filtros */}
            <div className="space-y-2 mb-3">
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={buscaPart}
                  onChange={(e) => setBuscaPart(e.target.value)}
                  placeholder="Buscar por nome..."
                  className="input-field pl-8 w-full text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setFiltroCargo("todos")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                    filtroCargo === "todos"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
                  }`}
                >
                  Todos
                </button>
                {CARGOS_FS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setFiltroCargo(c.value)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      filtroCargo === c.value
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={selecionarTodosFiltrados}
                  className="text-xs text-blue-600 font-semibold hover:underline"
                >
                  Selecionar todos filtrados ({colaboradoresFiltrados.length})
                </button>
                <span className="text-gray-300">·</span>
                <button
                  onClick={removerTodosFiltrados}
                  className="text-xs text-red-500 font-semibold hover:underline"
                >
                  Remover todos filtrados
                </button>
              </div>
            </div>

            {/* Lista de colaboradores */}
            <div className="border border-gray-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
              {colaboradoresFiltrados.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-6">
                  Nenhum colaborador encontrado.
                </p>
              ) : (
                colaboradoresFiltrados.map((c) => {
                  const selecionado = participantes.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleParticipante(c.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-0 transition-colors text-left ${
                        selecionado ? "bg-blue-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                          selecionado
                            ? "bg-blue-600 border-blue-600"
                            : "border-gray-300"
                        }`}
                      >
                        {selecionado && (
                          <svg
                            width="10"
                            height="8"
                            viewBox="0 0 10 8"
                            fill="none"
                          >
                            <path
                              d="M1 4L3.5 6.5L9 1"
                              stroke="white"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                        <span className="text-white text-[10px] font-bold">
                          {c.nome?.charAt(0)?.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">
                          {c.nome}
                        </p>
                        <p className="text-[10px] text-gray-400 truncate">
                          {c.cargo} · {c.regional}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {erro && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
              {erro}
            </p>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors ${
              modo
                ? "bg-orange-500 hover:bg-orange-600"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isSubmitting
              ? "Salvando..."
              : modo
                ? "Salvar Edição"
                : "Criar Reunião"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FSReuniaoForm;
