import { useState, useMemo } from "react";
import {
  Plus,
  RefreshCw,
  Calendar,
  List,
  Clock,
  Users,
  Search,
  SlidersHorizontal,
  FileText,
  RefreshCw as RecIcon,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { useFSReunioes } from "../hooks/useFSReunioes";
import { useFSColaboradores } from "../hooks/useFSColaboradores";
import { hasPermission } from "../../../constants/roles";
import FSReuniaoForm from "./FSReuniaoForm";
import FSReuniaoDetalhe from "./FSReuniaoDetalhe";
import FSReuniaoCalendario from "./FSReuniaoCalendario";
import FSReuniaoCountdown from "./FSReuniaoCountdown";
import Spinner from "../../../components/ui/Spinner";

const VIEWS = [
  { key: "lista", label: "Lista", icon: List },
  { key: "calendario", label: "Calendário", icon: Calendar },
];

const STATUS_BADGE = {
  agendada: "bg-blue-50 text-blue-700 border-blue-200",
  realizada: "bg-green-50 text-green-700 border-green-200",
  cancelada: "bg-red-50 text-red-500 border-red-200",
};

const RECORRENCIA_ICON = {
  semanal: "↻ Semanal",
  quinzenal: "↻ Quinzenal",
  mensal: "↻ Mensal",
};

const formatarDataCurta = (d) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

const FSReunioesPage = () => {
  const { currentUser } = useAuthContext();
  const {
    reunioes,
    loading,
    error,
    criar,
    atualizar,
    atualizarParticipantes,
    atualizarStatus,
    salvarAta,
    deletar,
    carregar,
  } = useFSReunioes();
  const { colaboradores } = useFSColaboradores();

  const [view, setView] = useState("lista");
  const [showForm, setShowForm] = useState(false);
  const [reuniaoEditando, setReuniaoEditando] = useState(null);
  const [reuniaoDetalhe, setReuniaoDetalhe] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [buscaInput, setBuscaInput] = useState("");
  const [showFiltros, setShowFiltros] = useState(false);

  const podeGerenciar = hasPermission(currentUser?.role, "manage_fs_reunioes");

  const reunioesFiltradas = useMemo(() => {
    return reunioes
      .filter((r) => filtroStatus === "todos" || r.status === filtroStatus)
      .filter(
        (r) => !busca || r.titulo?.toLowerCase().includes(busca.toLowerCase()),
      )
      .sort((a, b) => a.data_inicio?.localeCompare(b.data_inicio));
  }, [reunioes, filtroStatus, busca]);

  // Próximas reuniões agendadas
  const proximas = useMemo(() => {
    const hoje = new Date().toISOString().split("T")[0];
    return reunioes
      .filter((r) => r.status === "agendada" && r.data_inicio >= hoje)
      .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
      .slice(0, 3);
  }, [reunioes]);

  const fecharForm = () => {
    setShowForm(false);
    setReuniaoEditando(null);
  };

  const handleSubmitForm = async (dados) => {
    if (reuniaoEditando) {
      await atualizar(reuniaoEditando.id, dados);
    } else {
      await criar(dados);
    }
  };

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <Calendar size={18} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Reuniões FS</h2>
            <p className="text-xs text-gray-400">
              {reunioes.length} reunião(ões) cadastrada(s)
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
          {podeGerenciar && (
            <button
              onClick={() => setShowForm(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={16} /> Nova Reunião
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Cards: próximas reuniões */}
      {proximas.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            Próximas
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {proximas.map((r) => (
              <button
                key={r.id}
                onClick={() => setReuniaoDetalhe(r)}
                className="bg-white border border-blue-100 rounded-2xl px-4 py-3 text-left hover:border-blue-300 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-bold text-gray-800 line-clamp-1">
                    {r.titulo}
                  </p>
                  <FSReuniaoCountdown
                    dataInicio={r.data_inicio}
                    horarioInicio={r.horario_inicio}
                    status={r.status}
                  />
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Calendar size={11} /> {formatarDataCurta(r.data_inicio)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> {r.horario_inicio}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users size={11} /> {r.participantes?.length ?? 0}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabs + filtros */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl w-fit">
          {VIEWS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                view === key
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {view === "lista" && (
          <div className="flex gap-2">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={buscaInput}
                onChange={(e) => setBuscaInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setBusca(buscaInput)}
                placeholder="Buscar reunião..."
                className="input-field pl-8 text-sm w-44"
              />
            </div>
            <button
              onClick={() => setShowFiltros((v) => !v)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                showFiltros || filtroStatus !== "todos"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
              }`}
            >
              <SlidersHorizontal size={13} /> Filtrar
            </button>
          </div>
        )}
      </div>

      {/* Filtro status */}
      {showFiltros && view === "lista" && (
        <div className="flex flex-wrap gap-2 px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl">
          {[
            { value: "todos", label: "Todos" },
            { value: "agendada", label: "Agendadas" },
            { value: "realizada", label: "Realizadas" },
            { value: "cancelada", label: "Canceladas" },
          ].map((s) => (
            <button
              key={s.value}
              onClick={() => setFiltroStatus(s.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                filtroStatus === s.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* View: Lista */}
      {view === "lista" && (
        <div className="space-y-3">
          {reunioesFiltradas.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-10 text-center text-sm text-gray-400">
              Nenhuma reunião encontrada.
            </div>
          ) : (
            reunioesFiltradas.map((r) => (
              <button
                key={r.id}
                onClick={() => setReuniaoDetalhe(r)}
                className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-blue-200 hover:shadow-md transition-all text-left overflow-hidden"
              >
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-lg border ${STATUS_BADGE[r.status]}`}
                        >
                          {r.status}
                        </span>
                        {r.recorrencia && r.recorrencia !== "nenhuma" && (
                          <span className="text-xs font-semibold text-purple-600 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
                            <RecIcon size={10} />{" "}
                            {RECORRENCIA_ICON[r.recorrencia]}
                          </span>
                        )}
                        {r.ata && (
                          <span className="text-xs font-semibold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
                            <FileText size={10} /> Ata
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {r.titulo}
                      </p>
                      {r.descricao && (
                        <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">
                          {r.descricao}
                        </p>
                      )}
                    </div>
                    <FSReuniaoCountdown
                      dataInicio={r.data_inicio}
                      horarioInicio={r.horario_inicio}
                      status={r.status}
                    />
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} /> {formatarDataCurta(r.data_inicio)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={11} /> {r.horario_inicio} – {r.horario_fim}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={11} /> {r.participantes?.length ?? 0}{" "}
                      participante(s)
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* View: Calendário */}
      {view === "calendario" && (
        <FSReuniaoCalendario
          reunioes={reunioes}
          onSelectReuniao={setReuniaoDetalhe}
        />
      )}

      {/* Modal: Form novo/editar */}
      {(showForm || reuniaoEditando) && (
        <FSReuniaoForm
          onSubmit={handleSubmitForm}
          onClose={fecharForm}
          colaboradores={colaboradores}
          reuniaoParaEditar={reuniaoEditando}
        />
      )}

      {/* Modal: Detalhe */}
      {reuniaoDetalhe && (
        <FSReuniaoDetalhe
          reuniao={reuniaoDetalhe}
          colaboradores={colaboradores}
          onClose={() => setReuniaoDetalhe(null)}
          onEditar={(r) => {
            setReuniaoDetalhe(null);
            setReuniaoEditando(r);
          }}
          onDeletar={deletar}
          onAtualizarStatus={atualizarStatus}
          onSalvarAta={salvarAta}
          onAtualizarParticipantes={atualizarParticipantes}
          podeGerenciar={podeGerenciar}
        />
      )}
    </div>
  );
};

export default FSReunioesPage;
