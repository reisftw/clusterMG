import { useMemo, useState } from "react";
import { Calendar, Check, List, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { hasPermission } from "../../../constants/roles";
import Spinner from "../../../components/ui/Spinner";
import { useColaboradores } from "../../colaboradores/hooks/useColaboradores";
import { useFerias } from "../hooks/useFerias";
import FeriasCalendario from "./FeriasCalendario";
import FeriasSolicitacaoForm from "./FeriasSolicitacaoForm";

const STATUS_CONFIG = {
  pendente: { label: "Pendente", bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  aprovado: { label: "Aprovado", bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  reprovado: { label: "Reprovado", bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
};

const FeriasStatusBadge = ({ status }) => {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pendente;
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${config.bg} ${config.text} ${config.border}`}>
      {config.label}
    </span>
  );
};

const formatarData = (data) =>
  data ? new Date(data).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";

const FeriasPage = () => {
  const { currentUser } = useAuthContext();
  const { ferias, loading, error, solicitar, cadastrar, atualizarStatus, deletar, carregar } =
    useFerias(currentUser);
  const { colaboradores } = useColaboradores();

  const [showForm, setShowForm] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [visualizacao, setVisualizacao] = useState("lista");
  const [confirmarDel, setConfirmarDel] = useState(null);

  const podeAprovar = hasPermission(currentUser?.role, "approve_ferias");
  const podeLancar = hasPermission(currentUser?.role, "request_ferias");
  const podeCadastrarDireto = podeAprovar;

  const getNomeColaborador = (id) =>
    colaboradores.find((item) => item.id === id)?.nome ?? id ?? "Sem nome";

  const feriasFiltradas = useMemo(() => {
    if (filtroStatus === "todos") return ferias;
    return ferias.filter((item) => item.status === filtroStatus);
  }, [ferias, filtroStatus]);

  const resumo = useMemo(
    () => ({
      pendentes: ferias.filter((item) => item.status === "pendente").length,
      aprovadas: ferias.filter((item) => item.status === "aprovado").length,
      reprovadas: ferias.filter((item) => item.status === "reprovado").length,
    }),
    [ferias],
  );

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
            <button
              onClick={() => setVisualizacao("lista")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                visualizacao === "lista" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <List size={13} /> Lista
            </button>
            <button
              onClick={() => setVisualizacao("calendario")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                visualizacao === "calendario"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Calendar size={13} /> Calendario
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={carregar}
            className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
          >
            <RefreshCw size={16} />
          </button>
          {podeLancar && (
            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
              <Plus size={16} />
              {podeCadastrarDireto ? "Cadastrar Ferias" : "Solicitar Ferias"}
            </button>
          )}
        </div>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{error}</div>}

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Pendentes", value: resumo.pendentes, bg: "bg-yellow-50", border: "border-yellow-100", text: "text-yellow-700" },
          { label: "Aprovadas", value: resumo.aprovadas, bg: "bg-green-50", border: "border-green-100", text: "text-green-700" },
          { label: "Reprovadas", value: resumo.reprovadas, bg: "bg-red-50", border: "border-red-100", text: "text-red-600" },
        ].map(({ label, value, bg, border, text }) => (
          <div key={label} className={`rounded-2xl border ${bg} ${border} p-4 text-center`}>
            <p className={`text-2xl font-extrabold ${text}`}>{value}</p>
            <p className="text-xs text-gray-400 font-medium mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {visualizacao === "calendario" && <FeriasCalendario ferias={ferias} colaboradores={colaboradores} />}

      {visualizacao === "lista" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex-wrap">
            {["todos", "pendente", "aprovado", "reprovado"].map((status) => (
              <button
                key={status}
                onClick={() => setFiltroStatus(status)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  filtroStatus === status
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                }`}
              >
                {status === "todos" ? "Todos" : status === "pendente" ? "Pendentes" : status === "aprovado" ? "Aprovadas" : "Reprovadas"}
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-400 font-medium">{feriasFiltradas.length} registro(s)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {["Colaborador", "Inicio", "Fim", "Dias", "Status", "Acoes"].map((header) => (
                    <th key={header} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {feriasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">
                      Nenhuma solicitacao encontrada.
                    </td>
                  </tr>
                ) : (
                  feriasFiltradas.map((item) => (
                    <tr key={item.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center shrink-0">
                            <span className="text-white text-[10px] font-bold">
                              {String(getNomeColaborador(item.colaborador_id) || "?").charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium text-gray-800 text-sm">{getNomeColaborador(item.colaborador_id)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{formatarData(item.data_inicio)}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{formatarData(item.data_fim)}</td>
                      <td className="px-5 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 bg-orange-50 text-orange-600 rounded-lg border border-orange-100">
                          {item.dias_gozados}d
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <FeriasStatusBadge status={item.status} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          {podeAprovar && item.status === "pendente" && (
                            <>
                              <button
                                onClick={() => atualizarStatus(item.id, "aprovado")}
                                className="p-1.5 rounded-lg text-gray-400 hover:bg-green-50 hover:text-green-600 transition-colors"
                                title="Aprovar"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => atualizarStatus(item.id, "reprovado")}
                                className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                title="Reprovar"
                              >
                                <X size={14} />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setConfirmarDel(item)}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <FeriasSolicitacaoForm
          onSubmit={podeCadastrarDireto ? cadastrar : solicitar}
          onClose={() => setShowForm(false)}
          colaboradores={colaboradores}
          permitirEscolherColaborador={podeCadastrarDireto}
          titulo={podeCadastrarDireto ? "Cadastrar Ferias" : "Solicitar Ferias"}
          textoAcao={podeCadastrarDireto ? "Cadastrar" : "Solicitar"}
        />
      )}

      {confirmarDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-full max-w-sm">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={18} className="text-red-500" />
            </div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-1">Excluir solicitacao?</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              Ferias de <span className="font-semibold text-gray-700">{getNomeColaborador(confirmarDel.colaborador_id)}</span>{" "}
              ({formatarData(confirmarDel.data_inicio)} → {formatarData(confirmarDel.data_fim)}) serao removidas.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmarDel(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  await deletar(confirmarDel.id);
                  setConfirmarDel(null);
                }}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeriasPage;

