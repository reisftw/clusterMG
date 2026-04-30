import { useState, useMemo, useEffect } from "react";
import {
  Plus,
  RefreshCw,
  Search,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Archive,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
  MessageSquareWarning,
  Download,
} from "lucide-react";
import { useFSReclamacoes } from "../hooks/useFSReclamacoes";
import { useFSColaboradores } from "../hooks/useFSColaboradores";
import { useAuthContext } from "../../../context/AuthContext";
import { hasPermission } from "../../../constants/roles";
import { useRegionais } from "../../regionais/hooks/useRegionais";
import FSReclamacaoDetalheModal from "./FSReclamacaoDetalheModal";
import Spinner from "../../../components/ui/Spinner";
import { exportarReclamacaoPDF } from "../utils/exportReclamacoes";

const POR_PAGINA_OPCOES = [10, 20, 30];
const STEPS = ["Identificação", "Detalhes", "Prioridade"];

const CATEGORIAS = [
  "Comportamento",
  "Atendimento",
  "Operacional",
  "EPI / Segurança",
  "Atraso",
  "Outros",
];

const STATUS_CONFIG = {
  aberta: {
    label: "Aberta",
    style: "bg-red-50 text-red-600 border-red-100",
    icon: <AlertTriangle size={11} />,
  },
  em_analise: {
    label: "Em Análise",
    style: "bg-yellow-50 text-yellow-600 border-yellow-100",
    icon: <Clock size={11} />,
  },
  resolvida: {
    label: "Resolvida",
    style: "bg-green-50 text-green-700 border-green-100",
    icon: <CheckCircle2 size={11} />,
  },
  arquivada: {
    label: "Arquivada",
    style: "bg-gray-100 text-gray-500 border-gray-200",
    icon: <Archive size={11} />,
  },
};

const PRIORIDADE_CONFIG = {
  baixa: { label: "Baixa", style: "bg-gray-100 text-gray-500 border-gray-200" },
  media: { label: "Média", style: "bg-blue-50 text-blue-600 border-blue-100" },
  alta: {
    label: "Alta",
    style: "bg-orange-50 text-orange-600 border-orange-100",
  },
  critica: { label: "Crítica", style: "bg-red-50 text-red-600 border-red-100" },
};

const FORM_INICIAL = {
  titulo: "",
  tipo: "externa",
  categoria: "",
  reclamante: "",
  colaboradores_envolvidos: [],
  regional: "",
  data_ocorrido: "",
  descricao: "",
  prioridade: "media",
  resolucao: "",
  status: "aberta",
};

const FSReclamacoesPage = () => {
  const { currentUser } = useAuthContext();
  const {
    reclamacoes,
    loading,
    error,
    cadastrar,
    atualizar,
    deletar,
    carregar,
  } = useFSReclamacoes();

  const podeGerenciar = hasPermission(
    currentUser?.role,
    "manage_fs_colaboradores",
  );

  const { regionais } = useRegionais();
  const { colaboradores: colaboradoresFS } = useFSColaboradores();

  // 🔍 Debug temporário — remova após confirmar o campo correto
  useEffect(() => {
    if (colaboradoresFS.length > 0) {
      console.log("🔍 Primeiro colaborador FS:", colaboradoresFS[0]);
    }
  }, [colaboradoresFS]);

  const [busca, setBusca] = useState("");
  const [buscaInput, setBuscaInput] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroPrioridade, setFiltroPrioridade] = useState("todos");
  const [showFiltros, setShowFiltros] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [showDelConfirm, setShowDelConfirm] = useState(null);
  const [modalAberto, setModalAberto] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(FORM_INICIAL);
  const [buscaColaborador, setBuscaColaborador] = useState("");
  const [nomeAvulso, setNomeAvulso] = useState("");
  const [showDropColaborador, setShowDropColaborador] = useState(false);
  const [exportando, setExportando] = useState(false);

  const setF = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const resetForm = () => {
    setForm(FORM_INICIAL);
    setStep(0);
    setEditando(null);
    setBuscaColaborador("");
    setNomeAvulso("");
  };

  const pesquisar = () => {
    setBusca(buscaInput);
    setPagina(1);
  };
  const hFiltro = (setter) => (val) => {
    setter(val);
    setPagina(1);
  };

  const filtrosAtivos = [filtroStatus, filtroTipo, filtroPrioridade].filter(
    (f) => f !== "todos",
  ).length;

  // ✅ Adicionar colaborador cadastrado — fallback de nome
  const adicionarColaboradorCadastrado = (col) => {
    const jaAdicionado = form.colaboradores_envolvidos.some(
      (c) => c.id === col.id,
    );
    if (!jaAdicionado) {
      const nomeResolvido =
        col.nome || col.name || col.nomeCompleto || "Sem nome";
      setF("colaboradores_envolvidos", [
        ...form.colaboradores_envolvidos,
        { id: col.id, nome: nomeResolvido, avulso: false },
      ]);
    }
    setBuscaColaborador("");
    setShowDropColaborador(false);
  };

  const adicionarColaboradorAvulso = () => {
    if (!nomeAvulso.trim()) return;
    setF("colaboradores_envolvidos", [
      ...form.colaboradores_envolvidos,
      { id: `avulso_${Date.now()}`, nome: nomeAvulso.trim(), avulso: true },
    ]);
    setNomeAvulso("");
  };

  const removerColaborador = (id) => {
    setF(
      "colaboradores_envolvidos",
      form.colaboradores_envolvidos.filter((c) => c.id !== id),
    );
  };

  // ✅ Filtro dropdown — fallback de nome
  const colaboradoresFiltrados = colaboradoresFS
    .filter((c) => {
      const nome = c.nome || c.name || c.nomeCompleto || "";
      return (
        nome.toLowerCase().includes(buscaColaborador.toLowerCase()) &&
        !form.colaboradores_envolvidos.some((x) => x.id === c.id)
      );
    })
    .slice(0, 6);

  const filtrados = useMemo(() => {
    return reclamacoes.filter((r) => {
      const matchBusca =
        r.titulo?.toLowerCase().includes(busca.toLowerCase()) ||
        r.reclamante?.toLowerCase().includes(busca.toLowerCase()) ||
        (Array.isArray(r.colaboradores_envolvidos) &&
          r.colaboradores_envolvidos.some((c) =>
            c.nome?.toLowerCase().includes(busca.toLowerCase()),
          ));
      const matchStatus = filtroStatus === "todos" || r.status === filtroStatus;
      const matchTipo = filtroTipo === "todos" || r.tipo === filtroTipo;
      const matchPrior =
        filtroPrioridade === "todos" || r.prioridade === filtroPrioridade;
      return matchBusca && matchStatus && matchTipo && matchPrior;
    });
  }, [reclamacoes, busca, filtroStatus, filtroTipo, filtroPrioridade]);

  const totalPaginas = Math.ceil(filtrados.length / porPagina);
  const paginados = filtrados.slice(
    (pagina - 1) * porPagina,
    pagina * porPagina,
  );

  const handleEditar = (r) => {
    setEditando(r);
    setForm({
      ...FORM_INICIAL,
      ...r,
      colaboradores_envolvidos: r.colaboradores_envolvidos ?? [],
    });
    setStep(0);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (editando) await atualizar(editando.id, form);
    else await cadastrar(form);
    setShowForm(false);
    resetForm();
  };

  const handleDeletar = async (id) => {
    await deletar(id);
    setShowDelConfirm(null);
  };

  const handleAtualizarStatus = async (id, novoStatus) => {
    await atualizar(id, { status: novoStatus });
    if (modalAberto?.id === id)
      setModalAberto((prev) => ({ ...prev, status: novoStatus }));
  };

  const handleExportarPDF = async (reclamacao) => {
    setExportando(true);
    try {
      await exportarReclamacaoPDF(reclamacao);
    } catch (e) {
      console.error(e);
      alert("Erro ao gerar PDF");
    } finally {
      setExportando(false);
    }
  };

  const fmt = (ts) => {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("pt-BR");
  };

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
            <MessageSquareWarning size={18} className="text-red-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Reclamações FS</h2>
            <p className="text-xs text-gray-400">
              {reclamacoes.length} registro(s)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={carregar}
            className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
          >
            <RefreshCw size={16} />
          </button>
          {podeGerenciar && (
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={16} /> Nova
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Cards resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const total = reclamacoes.filter((r) => r.status === key).length;
          return (
            <button
              key={key}
              onClick={() =>
                hFiltro(setFiltroStatus)(filtroStatus === key ? "todos" : key)
              }
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-left ${
                filtroStatus === key
                  ? cfg.style + " ring-2 ring-offset-1 ring-blue-300"
                  : "bg-white border-gray-100 hover:border-gray-200"
              }`}
            >
              <span className={filtroStatus === key ? "" : "opacity-40"}>
                {cfg.icon}
              </span>
              <div>
                <p className="text-lg font-bold text-gray-900">{total}</p>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">
                  {cfg.label}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Busca */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={buscaInput}
            onChange={(e) => setBuscaInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pesquisar()}
            placeholder="Buscar por título, reclamante ou colaborador..."
            className="input-field w-full pl-8 text-sm"
          />
        </div>
        <button
          onClick={pesquisar}
          className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Search size={14} /> Pesquisar
        </button>
        <button
          onClick={() => setShowFiltros((v) => !v)}
          className={`relative px-4 py-2 rounded-xl text-sm font-semibold border transition-all flex items-center gap-2 ${
            showFiltros || filtrosAtivos > 0
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600"
          }`}
        >
          <SlidersHorizontal size={15} /> Filtrar
          {filtrosAtivos > 0 && (
            <span className="w-5 h-5 rounded-full bg-white text-blue-600 text-[10px] font-bold flex items-center justify-center">
              {filtrosAtivos}
            </span>
          )}
        </button>
      </div>

      {/* Filtros */}
      {showFiltros && (
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Tipo
              </span>
              {filtroTipo !== "todos" && (
                <button
                  onClick={() => hFiltro(setFiltroTipo)("todos")}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <X size={11} /> Limpar
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "todos", label: "Todos" },
                { value: "interna", label: "Interna" },
                { value: "externa", label: "Externa" },
              ].map((t) => (
                <button
                  key={t.value}
                  onClick={() => hFiltro(setFiltroTipo)(t.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${filtroTipo === t.value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Prioridade
              </span>
              {filtroPrioridade !== "todos" && (
                <button
                  onClick={() => hFiltro(setFiltroPrioridade)("todos")}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <X size={11} /> Limpar
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => hFiltro(setFiltroPrioridade)("todos")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${filtroPrioridade === "todos" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200"}`}
              >
                Todos
              </button>
              {Object.entries(PRIORIDADE_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => hFiltro(setFiltroPrioridade)(key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${filtroPrioridade === key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200"}`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>
          {filtrosAtivos > 0 && (
            <div className="pt-1 border-t border-gray-200">
              <button
                onClick={() => {
                  hFiltro(setFiltroStatus)("todos");
                  hFiltro(setFiltroTipo)("todos");
                  hFiltro(setFiltroPrioridade)("todos");
                }}
                className="text-xs text-red-500 hover:underline font-semibold"
              >
                Limpar todos os filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {[
                  "Título",
                  "Tipo",
                  "Categoria",
                  "Reclamante",
                  "Colaboradores",
                  "Regional",
                  "Data",
                  "Prioridade",
                  "Status",
                  "Ações",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginados.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-5 py-10 text-center text-sm text-gray-400"
                  >
                    Nenhuma reclamação encontrada.
                  </td>
                </tr>
              ) : (
                paginados.map((r) => {
                  const st = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.aberta;
                  const pr = PRIORIDADE_CONFIG[r.prioridade];
                  const cols = Array.isArray(r.colaboradores_envolvidos)
                    ? r.colaboradores_envolvidos
                    : r.colaborador_envolvido
                      ? [{ nome: r.colaborador_envolvido }]
                      : [];
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-gray-50 last:border-0 hover:bg-red-50/20 transition-colors"
                    >
                      <td
                        className="px-5 py-3 cursor-pointer max-w-[180px]"
                        onClick={() => setModalAberto(r)}
                      >
                        <p className="font-medium text-gray-800 truncate">
                          {r.titulo}
                        </p>
                      </td>
                      <td
                        className="px-5 py-3 text-xs cursor-pointer"
                        onClick={() => setModalAberto(r)}
                      >
                        <span
                          className={`px-2 py-1 rounded-lg border font-semibold ${r.tipo === "interna" ? "bg-purple-50 text-purple-600 border-purple-100" : "bg-blue-50 text-blue-600 border-blue-100"}`}
                        >
                          {r.tipo === "interna" ? "Interna" : "Externa"}
                        </span>
                      </td>
                      <td
                        className="px-5 py-3 text-xs text-gray-500 cursor-pointer"
                        onClick={() => setModalAberto(r)}
                      >
                        {r.categoria || "—"}
                      </td>
                      <td
                        className="px-5 py-3 text-xs text-gray-500 cursor-pointer"
                        onClick={() => setModalAberto(r)}
                      >
                        {r.reclamante || "—"}
                      </td>
                      <td
                        className="px-5 py-3 cursor-pointer"
                        onClick={() => setModalAberto(r)}
                      >
                        {cols.length === 0 ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {cols.slice(0, 2).map((c, i) => (
                              <span
                                key={i}
                                className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-lg font-medium"
                              >
                                {c.nome}
                              </span>
                            ))}
                            {cols.length > 2 && (
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-lg font-medium">
                                +{cols.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td
                        className="px-5 py-3 text-xs text-gray-500 cursor-pointer"
                        onClick={() => setModalAberto(r)}
                      >
                        {r.regional || "—"}
                      </td>
                      <td
                        className="px-5 py-3 text-xs text-gray-500 cursor-pointer whitespace-nowrap"
                        onClick={() => setModalAberto(r)}
                      >
                        {r.data_ocorrido || fmt(r.criado_em)}
                      </td>
                      <td className="px-5 py-3">
                        {pr && (
                          <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${pr.style}`}
                          >
                            {pr.label}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border ${st.style}`}
                        >
                          {st.icon} {st.label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleExportarPDF(r)}
                            disabled={exportando}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Baixar PDF"
                          >
                            <Download size={14} />
                          </button>
                          {podeGerenciar && (
                            <button
                              onClick={() => setShowDelConfirm(r.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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

        {/* Paginação */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Mostrar:</span>
            {POR_PAGINA_OPCOES.map((n) => (
              <button
                key={n}
                onClick={() => {
                  setPorPagina(n);
                  setPagina(1);
                }}
                className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${porPagina === n ? "bg-blue-600 text-white" : "bg-white text-gray-500 border border-gray-200 hover:border-blue-300"}`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {filtrados.length === 0
                ? "0"
                : `${(pagina - 1) * porPagina + 1}–${Math.min(pagina * porPagina, filtrados.length)}`}{" "}
              de {filtrados.length}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina === 1}
                className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagina === totalPaginas || totalPaginas === 0}
                className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Detalhe */}
      {modalAberto && (
        <FSReclamacaoDetalheModal
          reclamacao={modalAberto}
          onClose={() => setModalAberto(null)}
          onEditar={handleEditar}
          onDeletar={handleDeletar}
          onAtualizarStatus={handleAtualizarStatus}
          onExportarPDF={handleExportarPDF}
        />
      )}

      {/* Confirm Delete */}
      {showDelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-sm p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={24} className="text-red-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 mb-1">
                  Excluir reclamação?
                </p>
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
                    onClick={() => handleDeletar(showDelConfirm)}
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

      {/* Modal Novo / Editar */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <p className="font-bold text-gray-900">
                  {editando ? "Editar Reclamação" : "Nova Reclamação"}
                </p>
                <button
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                {STEPS.map((s, i) => (
                  <div key={s} className="flex items-center gap-2 flex-1">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                        i < step
                          ? "bg-blue-600 text-white"
                          : i === step
                            ? "bg-blue-600 text-white ring-4 ring-blue-100"
                            : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {i < step ? "✓" : i + 1}
                    </div>
                    <span
                      className={`text-xs font-semibold truncate ${i === step ? "text-blue-600" : "text-gray-400"}`}
                    >
                      {s}
                    </span>
                    {i < STEPS.length - 1 && (
                      <div
                        className={`h-px flex-1 ${i < step ? "bg-blue-600" : "bg-gray-200"}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 space-y-3 max-h-[55vh] overflow-y-auto">
              {step === 0 && (
                <>
                  <input
                    placeholder="Título da reclamação *"
                    value={form.titulo}
                    onChange={(e) => setF("titulo", e.target.value)}
                    className="input-field w-full"
                  />
                  <div className="flex gap-2">
                    {[
                      { value: "externa", label: "Externa" },
                      { value: "interna", label: "Interna" },
                    ].map((t) => (
                      <button
                        key={t.value}
                        onClick={() => setF("tipo", t.value)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${form.tipo === t.value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <select
                    value={form.categoria}
                    onChange={(e) => setF("categoria", e.target.value)}
                    className="input-field w-full"
                  >
                    <option value="">Categoria...</option>
                    {CATEGORIAS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    value={form.regional}
                    onChange={(e) => setF("regional", e.target.value)}
                    className="input-field w-full"
                  >
                    <option value="">Regional...</option>
                    {regionais.map((r) => (
                      <option key={r.id} value={r.nome}>
                        {r.nome}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {step === 1 && (
                <>
                  <input
                    placeholder="Reclamante (nome ou cliente)"
                    value={form.reclamante}
                    onChange={(e) => setF("reclamante", e.target.value)}
                    className="input-field w-full"
                  />

                  <div>
                    <label className="text-xs text-gray-400 mb-1 block font-semibold">
                      Colaboradores Envolvidos
                    </label>
                    {form.colaboradores_envolvidos.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {form.colaboradores_envolvidos.map((c) => (
                          <span
                            key={c.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-xl text-xs font-semibold"
                          >
                            {c.nome}
                            {c.avulso && (
                              <span className="text-[9px] bg-gray-200 text-gray-500 px-1 py-0.5 rounded-full">
                                externo
                              </span>
                            )}
                            <button
                              onClick={() => removerColaborador(c.id)}
                              className="ml-0.5 text-blue-400 hover:text-red-500"
                            >
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Busca cadastrado */}
                    <div className="relative">
                      <Search
                        size={13}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <input
                        placeholder="Buscar colaborador cadastrado..."
                        value={buscaColaborador}
                        onChange={(e) => {
                          setBuscaColaborador(e.target.value);
                          setShowDropColaborador(true);
                        }}
                        onFocus={() => setShowDropColaborador(true)}
                        className="input-field w-full pl-8 text-sm"
                      />
                      {showDropColaborador &&
                        buscaColaborador &&
                        colaboradoresFiltrados.length > 0 && (
                          <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden">
                            {colaboradoresFiltrados.map((c) => {
                              const nomeExibido =
                                c.nome ||
                                c.name ||
                                c.nomeCompleto ||
                                "Sem nome";
                              return (
                                <button
                                  key={c.id}
                                  onClick={() =>
                                    adicionarColaboradorCadastrado(c)
                                  }
                                  className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors flex items-center gap-2"
                                >
                                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                                    <span className="text-white text-[9px] font-bold">
                                      {nomeExibido.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-gray-800">
                                      {nomeExibido}
                                    </p>
                                    <p className="text-[10px] text-gray-400">
                                      {c.cargo} · {c.regional}
                                    </p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                    </div>

                    {/* Avulso */}
                    <div className="flex gap-2 mt-2">
                      <input
                        placeholder="Nome avulso / outro setor..."
                        value={nomeAvulso}
                        onChange={(e) => setNomeAvulso(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && adicionarColaboradorAvulso()
                        }
                        className="input-field flex-1 text-sm"
                      />
                      <button
                        onClick={adicionarColaboradorAvulso}
                        disabled={!nomeAvulso.trim()}
                        className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40 transition-colors font-bold text-lg"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">
                      Data do Ocorrido
                    </label>
                    <input
                      type="date"
                      value={form.data_ocorrido}
                      onChange={(e) => setF("data_ocorrido", e.target.value)}
                      className="input-field w-full"
                    />
                  </div>
                  <textarea
                    placeholder="Descrição detalhada *"
                    value={form.descricao}
                    onChange={(e) => setF("descricao", e.target.value)}
                    rows={4}
                    className="input-field w-full resize-none"
                  />
                </>
              )}

              {step === 2 && (
                <>
                  <p className="text-xs font-semibold text-gray-500 mb-1">
                    Prioridade
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(PRIORIDADE_CONFIG).map(([key, cfg]) => (
                      <button
                        key={key}
                        onClick={() => setF("prioridade", key)}
                        className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${form.prioridade === key ? cfg.style + " ring-2 ring-offset-1 ring-blue-300" : "bg-white text-gray-500 border-gray-200"}`}
                      >
                        {cfg.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    placeholder="Resolução / Parecer (opcional)"
                    value={form.resolucao}
                    onChange={(e) => setF("resolucao", e.target.value)}
                    rows={3}
                    className="input-field w-full resize-none mt-2"
                  />
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-1.5 mt-2">
                    <p className="text-xs font-bold text-blue-700 mb-2">
                      Resumo
                    </p>
                    {[
                      { label: "Título", value: form.titulo },
                      {
                        label: "Tipo",
                        value: form.tipo === "interna" ? "Interna" : "Externa",
                      },
                      { label: "Categoria", value: form.categoria },
                      { label: "Regional", value: form.regional },
                      { label: "Reclamante", value: form.reclamante },
                      {
                        label: "Colaboradores",
                        value: form.colaboradores_envolvidos
                          .map((c) => c.nome)
                          .join(", "),
                      },
                    ].map(({ label, value }) =>
                      value ? (
                        <div
                          key={label}
                          className="flex justify-between text-xs"
                        >
                          <span className="text-blue-500 font-medium">
                            {label}
                          </span>
                          <span className="text-blue-800 font-semibold text-right max-w-[60%]">
                            {value}
                          </span>
                        </div>
                      ) : null,
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 px-6 pb-6 pt-2">
              {step > 0 && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  Voltar
                </button>
              )}
              {step < STEPS.length - 1 ? (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  disabled={step === 0 && !form.titulo}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Próximo
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors"
                >
                  {editando ? "Salvar" : "Cadastrar"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FSReclamacoesPage;
