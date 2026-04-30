import { useState } from "react";
import {
  X,
  Clock,
  Users,
  Calendar,
  Coffee,
  UtensilsCrossed,
  RefreshCw,
  FileText,
  CheckCircle,
  XCircle,
  Pencil,
  Trash2,
  UserPlus,
  UserMinus,
  Search,
} from "lucide-react";
import FSReuniaoCountdown from "./FSReuniaoCountdown";
import { CARGOS_FS } from "../../../constants/roles";

const STATUS_CONFIG = {
  agendada: {
    label: "Agendada",
    cor: "bg-blue-50 text-blue-700 border-blue-200",
  },
  realizada: {
    label: "Realizada",
    cor: "bg-green-50 text-green-700 border-green-200",
  },
  cancelada: {
    label: "Cancelada",
    cor: "bg-red-50 text-red-600 border-red-200",
  },
};

const RECORRENCIA_LABEL = {
  nenhuma: "Sem recorrência",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
};

const formatarData = (d) =>
  d
    ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "—";

const FSReuniaoDetalhe = ({
  reuniao,
  colaboradores,
  onClose,
  onEditar,
  onDeletar,
  onAtualizarStatus,
  onSalvarAta,
  onAtualizarParticipantes,
  podeGerenciar,
}) => {
  const [abaAtiva, setAbaAtiva] = useState("info");
  const [ata, setAta] = useState(reuniao.ata ?? "");
  const [salvandoAta, setSalvandoAta] = useState(false);
  const [filtroCargo, setFiltroCargo] = useState("todos");
  const [buscaPart, setBuscaPart] = useState("");
  const [participantes, setParticipantes] = useState(
    new Set(reuniao.participantes ?? []),
  );
  const [salvandoPart, setSalvandoPart] = useState(false);
  const [showDelConfirm, setShowDelConfirm] = useState(false);

  const colabMap = {};
  colaboradores.forEach((c) => {
    colabMap[c.id] = c;
  });

  const participantesInfo = [...participantes]
    .map((id) => colabMap[id])
    .filter(Boolean)
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const colaboradoresFiltrados = colaboradores
    .filter((c) => c.status === "ativo")
    .filter((c) => filtroCargo === "todos" || c.cargo === filtroCargo)
    .filter(
      (c) =>
        !buscaPart || c.nome?.toLowerCase().includes(buscaPart.toLowerCase()),
    )
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const togglePart = (id) => {
    setParticipantes((prev) => {
      const novo = new Set(prev);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      return novo;
    });
  };

  const handleSalvarParticipantes = async () => {
    setSalvandoPart(true);
    await onAtualizarParticipantes(reuniao.id, [...participantes]);
    setSalvandoPart(false);
  };

  const handleSalvarAta = async () => {
    setSalvandoAta(true);
    await onSalvarAta(reuniao.id, ata);
    setSalvandoAta(false);
  };

  const duracaoTotal = () => {
    if (!reuniao.horario_inicio || !reuniao.horario_fim) return "—";
    const [hi, mi] = reuniao.horario_inicio.split(":").map(Number);
    const [hf, mf] = reuniao.horario_fim.split(":").map(Number);
    let total = hf * 60 + mf - (hi * 60 + mi);
    if (total <= 0) return "—";
    const liquido =
      total - (reuniao.min_lanche || 0) - (reuniao.min_almoco || 0);
    const h = Math.floor(liquido / 60);
    const m = liquido % 60;
    return `${h}h${m > 0 ? ` ${m}min` : ""}`;
  };

  const ABAS = [
    { key: "info", label: "Informações" },
    { key: "participantes", label: `Participantes (${participantes.size})` },
    { key: "ata", label: "Ata" },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${STATUS_CONFIG[reuniao.status]?.cor}`}
                >
                  {STATUS_CONFIG[reuniao.status]?.label}
                </span>
                <FSReuniaoCountdown
                  dataInicio={reuniao.data_inicio}
                  horarioInicio={reuniao.horario_inicio}
                  status={reuniao.status}
                />
              </div>
              <h3 className="text-base font-bold text-gray-900 truncate">
                {reuniao.titulo}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatarData(reuniao.data_inicio)}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {podeGerenciar && (
                <>
                  <button
                    onClick={() => onEditar(reuniao)}
                    className="p-2 rounded-xl text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors"
                    title="Editar"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setShowDelConfirm(true)}
                    className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Status actions */}
          {podeGerenciar && reuniao.status === "agendada" && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => onAtualizarStatus(reuniao.id, "realizada")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors"
              >
                <CheckCircle size={12} /> Marcar como Realizada
              </button>
              <button
                onClick={() => onAtualizarStatus(reuniao.id, "cancelada")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                <XCircle size={12} /> Cancelar Reunião
              </button>
            </div>
          )}
        </div>

        {/* Abas */}
        <div className="flex gap-1 px-6 py-2 border-b border-gray-100 shrink-0">
          {ABAS.map((a) => (
            <button
              key={a.key}
              onClick={() => setAbaAtiva(a.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                abaAtiva === a.key
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Aba: Informações */}
          {abaAtiva === "info" && (
            <div className="space-y-4">
              {/* Pauta */}
              {reuniao.descricao && (
                <div className="px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-1">
                    Pauta
                  </p>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {reuniao.descricao}
                  </p>
                </div>
              )}

              {/* Grid de info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Calendar size={13} className="text-blue-500" />
                    <p className="text-xs font-semibold text-blue-600">Data</p>
                  </div>
                  <p className="text-sm font-bold text-blue-800">
                    {new Date(
                      reuniao.data_inicio + "T00:00:00",
                    ).toLocaleDateString("pt-BR")}
                  </p>
                </div>

                <div className="px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock size={13} className="text-blue-500" />
                    <p className="text-xs font-semibold text-blue-600">
                      Horário
                    </p>
                  </div>
                  <p className="text-sm font-bold text-blue-800">
                    {reuniao.horario_inicio} – {reuniao.horario_fim}
                  </p>
                  <p className="text-xs text-blue-500 mt-0.5">
                    Duração: {duracaoTotal()}
                  </p>
                </div>

                {reuniao.pausa_lanche && (
                  <div className="px-4 py-3 bg-orange-50 border border-orange-100 rounded-xl">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Coffee size={13} className="text-orange-500" />
                      <p className="text-xs font-semibold text-orange-600">
                        Pausa Lanche
                      </p>
                    </div>
                    <p className="text-sm font-bold text-orange-700">
                      {reuniao.min_lanche} minutos
                    </p>
                  </div>
                )}

                {reuniao.pausa_almoco && (
                  <div className="px-4 py-3 bg-green-50 border border-green-100 rounded-xl">
                    <div className="flex items-center gap-1.5 mb-1">
                      <UtensilsCrossed size={13} className="text-green-600" />
                      <p className="text-xs font-semibold text-green-600">
                        Pausa Almoço
                      </p>
                    </div>
                    <p className="text-sm font-bold text-green-700">
                      {reuniao.min_almoco} minutos
                    </p>
                  </div>
                )}

                {reuniao.recorrencia && reuniao.recorrencia !== "nenhuma" && (
                  <div className="px-4 py-3 bg-purple-50 border border-purple-100 rounded-xl col-span-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <RefreshCw size={13} className="text-purple-500" />
                      <p className="text-xs font-semibold text-purple-600">
                        Recorrência
                      </p>
                    </div>
                    <p className="text-sm font-bold text-purple-700">
                      {RECORRENCIA_LABEL[reuniao.recorrencia]}
                      {reuniao.recorrencia_fim && (
                        <span className="font-normal text-purple-500 ml-1">
                          até{" "}
                          {new Date(
                            reuniao.recorrencia_fim + "T00:00:00",
                          ).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Aba: Participantes */}
          {abaAtiva === "participantes" && (
            <div className="space-y-4">
              {/* Filtros */}
              <div className="space-y-2">
                <div className="relative">
                  <Search
                    size={13}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    value={buscaPart}
                    onChange={(e) => setBuscaPart(e.target.value)}
                    placeholder="Buscar colaborador..."
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
              </div>

              {/* Lista com checkboxes */}
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                {colaboradoresFiltrados.map((c) => {
                  const sel = participantes.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => podeGerenciar && togglePart(c.id)}
                      disabled={!podeGerenciar}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-0 transition-colors text-left ${
                        sel ? "bg-blue-50" : "hover:bg-gray-50"
                      } ${!podeGerenciar ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <div
                        className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                          sel
                            ? "bg-blue-600 border-blue-600"
                            : "border-gray-300"
                        }`}
                      >
                        {sel && (
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
                      {sel ? (
                        <UserMinus
                          size={13}
                          className="text-blue-400 shrink-0"
                        />
                      ) : (
                        <UserPlus
                          size={13}
                          className="text-gray-300 shrink-0"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {podeGerenciar && (
                <button
                  onClick={handleSalvarParticipantes}
                  disabled={salvandoPart}
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Users size={14} />
                  {salvandoPart ? "Salvando..." : "Salvar Participantes"}
                </button>
              )}
            </div>
          )}

          {/* Aba: Ata */}
          {abaAtiva === "ata" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl">
                <FileText size={14} className="text-blue-500 shrink-0" />
                <p className="text-xs text-blue-700">
                  {reuniao.status === "realizada"
                    ? "Reunião realizada. Edite a ata quando necessário."
                    : "A ata ficará disponível para edição. Ao salvar, a reunião será marcada como realizada."}
                </p>
              </div>
              <textarea
                value={ata}
                onChange={(e) => setAta(e.target.value)}
                placeholder="Registre aqui os pontos discutidos, decisões tomadas e próximos passos..."
                rows={12}
                disabled={!podeGerenciar}
                className="input-field w-full resize-none text-sm leading-relaxed disabled:bg-gray-50 disabled:cursor-default"
              />
              {podeGerenciar && (
                <button
                  onClick={handleSalvarAta}
                  disabled={salvandoAta || !ata.trim()}
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  <FileText size={14} />
                  {salvandoAta ? "Salvando..." : "Salvar Ata"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal confirmar exclusão */}
      {showDelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-sm p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 size={22} className="text-red-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 mb-1">Excluir reunião?</p>
                <p className="text-sm text-gray-500 mb-5">
                  "{reuniao.titulo}" será removida permanentemente.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDelConfirm(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      onDeletar(reuniao.id);
                      onClose();
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FSReuniaoDetalhe;
