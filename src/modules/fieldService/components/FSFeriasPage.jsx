import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart2,
  Calendar,
  CheckCircle,
  List,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { hasPermission } from "../../../constants/roles";
import Spinner from "../../../components/ui/Spinner";
import { useFSColaboradores } from "../hooks/useFSColaboradores";
import { useFSFerias } from "../hooks/useFSFerias";
import FSFeriasCalendario from "./FSFeriasCalendario";
import FSFeriasLancamentoForm from "./FSFeriasLancamentoForm";
import FSFeriasRelatorioMensal from "./FSFeriasRelatorioMensal";

const STATUS_BADGE = {
  aprovado: "bg-green-50 text-green-700 border-green-100",
  pendente: "bg-yellow-50 text-yellow-700 border-yellow-100",
  reprovado: "bg-red-50 text-red-600 border-red-100",
  cancelado: "bg-gray-50 text-gray-500 border-gray-100",
};

const VIEWS = [
  { key: "lista", label: "Lista", icon: List },
  { key: "calendario", label: "CalendÃ¡rio", icon: Calendar },
  { key: "relatorio", label: "RelatÃ³rio", icon: BarChart2 },
];

const formatarData = (data) =>
  data ? new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR") : "â€”";

const FSFeriasPage = () => {
  const { currentUser } = useAuthContext();
  const {
    ferias,
    loading,
    error,
    solicitar,
    cadastrar,
    atualizarStatus,
    deletar,
    carregar,
  } = useFSFerias(currentUser);
  const { colaboradores } = useFSColaboradores();

  const [view, setView] = useState("lista");
  const [showForm, setShowForm] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [showDelConfirm, setShowDelConfirm] = useState(null);

  const podeAprovar = hasPermission(currentUser?.role, "approve_ferias");
  const podeLancar = hasPermission(currentUser?.role, "request_ferias");
  const podeCadastrarDireto = podeAprovar;

  const dataLimite = useMemo(() => {
    const hoje = new Date();
    hoje.setDate(hoje.getDate() + 90);
    return hoje.toISOString().split("T")[0];
  }, []);

  const colabMap = useMemo(() => {
    const mapa = {};
    colaboradores.forEach((colaborador) => {
      mapa[colaborador.id] = colaborador;
    });
    return mapa;
  }, [colaboradores]);

  const feriasFiltradas = useMemo(() => {
    if (filtroStatus === "todos") return ferias;
    return ferias.filter((item) => item.status === filtroStatus);
  }, [ferias, filtroStatus]);

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <Calendar size={18} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">FÃ©rias FS</h2>
            <p className="text-xs text-gray-400">
              {ferias.length} registro(s) | Limite: {formatarData(dataLimite)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={carregar}
            className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
          >
            <RefreshCw size={16} />
          </button>

          {podeLancar && (
            <button
              onClick={() => setShowForm(true)}
              className="btn-primary flex items-center gap-2"
              title={`LanÃ§amento atÃ© ${formatarData(dataLimite)}`}
            >
              <Plus size={16} />
              {podeCadastrarDireto ? "Cadastrar FÃ©rias" : "Solicitar"}
            </button>
          )}
        </div>
      </div>

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex items-center gap-2">
        <AlertTriangle size={16} />
        <span>
          <strong>LanÃ§amentos atÃ© 90 dias no futuro.</strong> Data limite:{" "}
          <span className="font-bold">{formatarData(dataLimite)}</span>
        </span>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl w-fit">
        {VIEWS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              view === key
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {icon({ size: 13 })} {label}
          </button>
        ))}
      </div>

      {view === "lista" && (
        <>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "todos", label: "Todos" },
              { value: "pendente", label: "Pendentes" },
              { value: "aprovado", label: "Aprovados" },
              { value: "reprovado", label: "Reprovados" },
            ].map((status) => (
              <button
                key={status.value}
                onClick={() => setFiltroStatus(status.value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  filtroStatus === status.value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                }`}
              >
                {status.label}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {[
                      "Colaborador",
                      "Regional",
                      "InÃ­cio",
                      "Fim",
                      "Dias",
                      "Status",
                      "Conflito",
                      "AÃ§Ãµes",
                    ].map((header) => (
                      <th
                        key={header}
                        className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {feriasFiltradas.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="text-center py-10 text-sm text-gray-400"
                      >
                        Nenhuma fÃ©rias encontrada.
                      </td>
                    </tr>
                  ) : (
                    feriasFiltradas.map((item) => {
                      const colaborador = colabMap[item.colaborador_id];

                      return (
                        <tr
                          key={item.id}
                          className="border-b border-gray-50 last:border-0 hover:bg-blue-50/30 transition-colors"
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                                <span className="text-white text-[10px] font-bold">
                                  {colaborador?.nome?.charAt(0)?.toUpperCase() ?? "?"}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium text-gray-800 text-xs">
                                  {colaborador?.nome ?? item.colaborador_id}
                                </p>
                                <p className="text-gray-400 text-[11px]">
                                  {colaborador?.cargo ?? "â€”"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-500">
                            {colaborador?.regional ?? "â€”"}
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-500">
                            {formatarData(item.data_inicio)}
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-500">
                            {formatarData(item.data_fim)}
                          </td>
                          <td className="px-5 py-3 text-xs font-semibold text-gray-700">
                            {item.dias_gozados ?? "â€”"}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`text-xs font-semibold px-2.5 py-1 rounded-lg border capitalize ${
                                STATUS_BADGE[item.status] ?? STATUS_BADGE.cancelado
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            {item.tem_conflito ? (
                              <span className="text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-lg flex items-center gap-1 w-fit">
                                <AlertTriangle size={11} /> Conflito
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">â€”</span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-1">
                              {podeAprovar && item.status === "pendente" && (
                                <>
                                  <button
                                    onClick={() => atualizarStatus(item.id, "aprovado")}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                                    title="Aprovar"
                                  >
                                    <CheckCircle size={15} />
                                  </button>
                                  <button
                                    onClick={() => atualizarStatus(item.id, "reprovado")}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                    title="Reprovar"
                                  >
                                    <XCircle size={15} />
                                  </button>
                                </>
                              )}

                              {podeAprovar && (
                                <button
                                  onClick={() => setShowDelConfirm(item.id)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Excluir"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {view === "calendario" && (
        <FSFeriasCalendario ferias={ferias} colaboradores={colaboradores} />
      )}

      {view === "relatorio" && (
        <FSFeriasRelatorioMensal
          ferias={ferias}
          colaboradores={colaboradores}
        />
      )}

      {showForm && (
        <FSFeriasLancamentoForm
          onSubmit={podeCadastrarDireto ? cadastrar : solicitar}
          onClose={() => setShowForm(false)}
          colaboradores={colaboradores}
          feriasExistentes={ferias}
          dataLimite={dataLimite}
          titulo={podeCadastrarDireto ? "Cadastrar FÃ©rias" : "Solicitar FÃ©rias"}
          textoAcao={podeCadastrarDireto ? "Cadastrar" : "Solicitar"}
        />
      )}

      {showDelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-sm p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 size={22} className="text-red-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 mb-1">Excluir fÃ©rias?</p>
                <p className="text-sm text-gray-500 mb-5">
                  Esta aÃ§Ã£o nÃ£o pode ser desfeita.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDelConfirm(null)}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      await deletar(showDelConfirm);
                      setShowDelConfirm(null);
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

export default FSFeriasPage;
