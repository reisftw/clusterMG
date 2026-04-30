import { useState, useMemo } from "react";
import {
  Plus,
  RefreshCw,
  Calendar,
  List,
  Trash2,
  AlertTriangle,
  Search,
  SlidersHorizontal,
  X,
  Pencil,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { useFSEscala } from "../hooks/useFSEscala";
import { useFSColaboradores } from "../hooks/useFSColaboradores";
import { hasPermission } from "../../../constants/roles";
import FSEscalaLancamentoForm from "./FSEscalaLancamentoForm";
import FSEscalaCalendario from "./FSEscalaCalendario";
import Spinner from "../../../components/ui/Spinner";

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const VIEWS = [
  { key: "lista", label: "Lista", icon: List },
  { key: "calendario", label: "Calendário", icon: Calendar },
];

const formatarData = (d) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

const FSEscalaPage = () => {
  const { currentUser } = useAuthContext();

  // ✅ atualizarFolga adicionado
  const {
    folgas,
    loading,
    error,
    lancarFolgas,
    atualizarFolga,
    deletar,
    carregar,
  } = useFSEscala();
  const { colaboradores } = useFSColaboradores();

  const hoje = new Date();
  const [view, setView] = useState("lista");
  const [showForm, setShowForm] = useState(false);
  const [folgaParaEditar, setFolgaParaEditar] = useState(null); // ✅ estado de edição
  const [showDelConfirm, setShowDelConfirm] = useState(null);
  const [busca, setBusca] = useState("");
  const [buscaInput, setBuscaInput] = useState("");
  const [filtroMes, setFiltroMes] = useState(hoje.getMonth());
  const [filtroAno, setFiltroAno] = useState(hoje.getFullYear());
  const [filtroReg, setFiltroReg] = useState("todos");
  const [showFiltros, setShowFiltros] = useState(false);

  const podeGerenciar = hasPermission(currentUser?.role, "manage_fs_escala");

  const colabMap = useMemo(() => {
    const m = {};
    colaboradores.forEach((c) => {
      m[c.id] = c;
    });
    return m;
  }, [colaboradores]);

  const regionais = useMemo(() => {
    const s = new Set(colaboradores.map((c) => c.regional).filter(Boolean));
    return [...s].sort();
  }, [colaboradores]);

  const folgasFiltradas = useMemo(() => {
    const prefixo = `${filtroAno}-${String(filtroMes + 1).padStart(2, "0")}`;
    return folgas.filter((f) => {
      const pertenceMes = f.data?.startsWith(prefixo);
      const pertenceUser = podeGerenciar
        ? true
        : f.colaborador_id === currentUser?.uid;
      const matchBusca =
        !busca ||
        colabMap[f.colaborador_id]?.nome
          ?.toLowerCase()
          .includes(busca.toLowerCase());
      const matchReg =
        filtroReg === "todos" ||
        colabMap[f.colaborador_id]?.regional === filtroReg;
      return pertenceMes && pertenceUser && matchBusca && matchReg;
    });
  }, [
    folgas,
    filtroMes,
    filtroAno,
    busca,
    filtroReg,
    colabMap,
    podeGerenciar,
    currentUser,
  ]);

  const folgasPorColab = useMemo(() => {
    const map = {};
    folgasFiltradas.forEach((f) => {
      if (!map[f.colaborador_id]) map[f.colaborador_id] = [];
      map[f.colaborador_id].push(f);
    });
    return map;
  }, [folgasFiltradas]);

  const anos = [
    hoje.getFullYear() - 1,
    hoje.getFullYear(),
    hoje.getFullYear() + 1,
  ];

  // ✅ Fecha qualquer modal de form/edição
  const fecharForm = () => {
    setShowForm(false);
    setFolgaParaEditar(null);
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
            <h2 className="text-lg font-bold text-gray-900">
              Escala de Folgas FS
            </h2>
            <p className="text-xs text-gray-400">
              {folgasFiltradas.length} folga(s) no período
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
              <Plus size={16} /> Lançar Folga
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Navegação mês/ano */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl overflow-x-auto">
          {MESES.map((m, i) => (
            <button
              key={m}
              onClick={() => setFiltroMes(i)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                filtroMes === i
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {m.slice(0, 3)}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {anos.map((a) => (
            <button
              key={a}
              onClick={() => setFiltroAno(a)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                filtroAno === a
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs + busca */}
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

        {view === "lista" && podeGerenciar && (
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
                placeholder="Buscar colaborador..."
                className="input-field pl-8 text-sm w-48"
              />
            </div>
            <button
              onClick={() => setShowFiltros((v) => !v)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                showFiltros || filtroReg !== "todos"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
              }`}
            >
              <SlidersHorizontal size={13} /> Filtrar
            </button>
          </div>
        )}
      </div>

      {/* Filtro regional */}
      {showFiltros && view === "lista" && (
        <div className="flex flex-wrap gap-2 px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl">
          {["todos", ...regionais].map((r) => (
            <button
              key={r}
              onClick={() => setFiltroReg(r)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                filtroReg === r
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600"
              }`}
            >
              {r === "todos" ? "Todas as Regionais" : r}
            </button>
          ))}
        </div>
      )}

      {/* View: Lista */}
      {view === "lista" && (
        <div className="space-y-3">
          {Object.keys(folgasPorColab).length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-10 text-center text-sm text-gray-400">
              Nenhuma folga em {MESES[filtroMes]} {filtroAno}.
            </div>
          ) : (
            Object.entries(folgasPorColab).map(([colabId, folgasColab]) => {
              const c = colabMap[colabId];
              const temConflito = folgasColab.some((f) => f.tem_conflito);
              return (
                <div
                  key={colabId}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                >
                  {/* Cabeçalho colaborador */}
                  <div
                    className={`flex items-center justify-between px-5 py-3 border-b border-gray-100 ${temConflito ? "bg-orange-50" : "bg-gray-50"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                        <span className="text-white text-xs font-bold">
                          {c?.nome?.charAt(0)?.toUpperCase() ?? "?"}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-800">
                          {c?.nome ?? colabId}
                        </p>
                        <p className="text-xs text-gray-400">
                          {c?.cargo} · {c?.regional} ·{" "}
                          {c?.turno === "12x36" ? "12x36" : "Seg-Sex"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {temConflito && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-orange-600 bg-orange-100 border border-orange-200 px-2 py-1 rounded-lg">
                          <AlertTriangle size={11} /> Conflito
                        </span>
                      )}
                      <span className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg">
                        {folgasColab.length} dia
                        {folgasColab.length > 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {/* Chips de dias */}
                  <div className="p-4">
                    <div className="flex flex-wrap gap-2">
                      {folgasColab
                        .sort((a, b) => a.data.localeCompare(b.data))
                        .map((f) => (
                          <div
                            key={f.id}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${
                              f.tem_conflito
                                ? "bg-orange-50 border-orange-200 text-orange-700"
                                : "bg-blue-50 border-blue-100 text-blue-700"
                            }`}
                          >
                            <Calendar size={12} />
                            <span>{formatarData(f.data)}</span>

                            {f.observacao && (
                              <span className="text-gray-400 font-normal">
                                · {f.observacao}
                              </span>
                            )}

                            {/* ✅ Botões editar e excluir */}
                            {podeGerenciar && (
                              <div className="flex items-center gap-1 ml-1 border-l border-current/20 pl-1.5">
                                <button
                                  onClick={() => setFolgaParaEditar(f)}
                                  title="Editar"
                                  className="text-current opacity-50 hover:opacity-100 transition-opacity"
                                >
                                  <Pencil size={11} />
                                </button>
                                <button
                                  onClick={() => setShowDelConfirm(f.id)}
                                  title="Excluir"
                                  className="text-current opacity-50 hover:opacity-100 hover:text-red-500 transition-all"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* View: Calendário */}
      {view === "calendario" && (
        <FSEscalaCalendario
          folgas={folgasFiltradas}
          colaboradores={colaboradores}
          onDeleteFolga={(id) => setShowDelConfirm(id)}
          onEditFolga={(f) => setFolgaParaEditar(f)} // ✅ editar pelo calendário
          podeGerenciar={podeGerenciar}
        />
      )}

      {/* ✅ Modal lançar novo OU editar existente */}
      {(showForm || folgaParaEditar) && (
        <FSEscalaLancamentoForm
          onSubmit={lancarFolgas}
          onEditar={atualizarFolga}
          onClose={fecharForm}
          colaboradores={colaboradores}
          folgasExistentes={folgas}
          folgaParaEditar={folgaParaEditar}
        />
      )}

      {/* Modal confirmar exclusão */}
      {showDelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-sm p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 size={22} className="text-red-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 mb-1">Remover folga?</p>
                <p className="text-sm text-gray-500 mb-5">
                  Esta ação não pode ser desfeita.
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
                    Remover
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

export default FSEscalaPage;
