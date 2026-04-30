import { useState, useMemo } from "react";
import {
  Plus,
  RefreshCw,
  Download,
  Search,
  Trash2,
  Copy,
  FileText,
  UsersRound,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  X,
  Loader2,
} from "lucide-react";
import { useFSColaboradores } from "../hooks/useFSColaboradores";
import { useAuthContext } from "../../../context/AuthContext";
import { hasPermission, CARGOS_FS } from "../../../constants/roles";
import FSColaboradorModal from "./FSColaboradorModal";
import Spinner from "../../../components/ui/Spinner";
import {
  exportarXLSX,
  exportarPDF,
  copiarParaWhatsApp,
} from "../utils/exportColaboradores";
import { useRegionais } from "../../regionais/hooks/useRegionais";

const TURNOS_LABEL = { "12x36": "12x36", seg_sex: "Seg-Sex" };
const POR_PAGINA_OPCOES = [10, 20, 30];
const STEPS = ["Identificação", "Cargo & Lotação", "Status"];

const FSColaboradoresPage = () => {
  const { currentUser } = useAuthContext();
  const {
    colaboradores,
    naoImportados,
    loading,
    error,
    importar,
    cadastrar,
    atualizar,
    deletar,
    buscarHistorico,
    carregar,
  } = useFSColaboradores();
  const { regionais } = useRegionais();

  const [busca, setBusca] = useState("");
  const [buscaInput, setBuscaInput] = useState("");
  const [filtroCargo, setFiltroCargo] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroReg, setFiltroReg] = useState("todos");
  const [showFiltros, setShowFiltros] = useState(false);
  const [modalAberto, setModalAberto] = useState(null);
  const [showImportar, setShowImportar] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [selecionados, setSelecionados] = useState(new Set());
  const [exportando, setExportando] = useState(false);
  const [showDelConfirm, setShowDelConfirm] = useState(null);
  const [novoForm, setNovoForm] = useState({
    nome: "",
    matricula: "",
    telefone: "",
    data_aniversario: "",
    data_contratacao: "",
    cargo: "",
    turno: "",
    regional: "",
    lider_responsavel: "",
    status: "ativo",
    data_demissao: "",
    motivo_demissao: "",
  });

  const podeGerenciar = hasPermission(
    currentUser?.role,
    "manage_fs_colaboradores",
  );

  const setN = (key, val) => setNovoForm((f) => ({ ...f, [key]: val }));

  const lideres = colaboradores.filter((c) => {
    const r = c.cargo?.toLowerCase() ?? "";
    return (
      r.includes("lider") ||
      r.includes("líder") ||
      r.includes("supervisor") ||
      r.includes("coordenador") ||
      r.includes("gerente")
    );
  });

  const filtrados = useMemo(() => {
    return colaboradores.filter((c) => {
      const matchBusca = c.nome?.toLowerCase().includes(busca.toLowerCase());
      const matchCargo = filtroCargo === "todos" || c.cargo === filtroCargo;
      const matchStatus = filtroStatus === "todos" || c.status === filtroStatus;
      const matchReg = filtroReg === "todos" || c.regional === filtroReg;
      return matchBusca && matchCargo && matchStatus && matchReg;
    });
  }, [colaboradores, busca, filtroCargo, filtroStatus, filtroReg]);

  const totalPaginas = Math.ceil(filtrados.length / porPagina);
  const paginados = filtrados.slice(
    (pagina - 1) * porPagina,
    pagina * porPagina,
  );

  const pesquisar = () => {
    setBusca(buscaInput);
    setPagina(1);
  };

  const hFiltro = (setter) => (val) => {
    setter(val);
    setPagina(1);
  };

  const filtrosAtivos = [filtroCargo, filtroStatus, filtroReg].filter(
    (f) => f !== "todos",
  ).length;

  const resetForm = () => {
    setNovoForm({
      nome: "",
      matricula: "",
      telefone: "",
      data_aniversario: "",
      data_contratacao: "",
      cargo: "",
      turno: "",
      regional: "",
      lider_responsavel: "",
      status: "ativo",
      data_demissao: "",
      motivo_demissao: "",
    });
    setStep(0);
  };

  const toggleSelecionado = (id) => {
    const novo = new Set(selecionados);
    novo.has(id) ? novo.delete(id) : novo.add(id);
    setSelecionados(novo);
  };

  const selecionarTodos = () => {
    if (selecionados.size === paginados.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(paginados.map((c) => c.id)));
    }
  };

  const colaboradoresSelecionados = colaboradores.filter((c) =>
    selecionados.has(c.id),
  );

  const handleExportar = async (formato) => {
    setExportando(true);
    try {
      const dataStr = new Date()
        .toLocaleDateString("pt-BR")
        .replace(/\//g, "-");
      if (formato === "xlsx") {
        exportarXLSX(
          colaboradoresSelecionados,
          colaboradores,
          `Colaboradores_${dataStr}.xlsx`,
        );
      } else if (formato === "pdf") {
        exportarPDF(
          colaboradoresSelecionados,
          `Colaboradores_${dataStr}.pdf`,
          colaboradores,
        );
      }
      setSelecionados(new Set());
    } catch (err) {
      console.error("Erro ao exportar:", err);
    } finally {
      setExportando(false);
    }
  };

  const handleDeletar = async (id) => {
    await deletar(id);
    setShowDelConfirm(null);
    setSelecionados((prev) => {
      const novo = new Set(prev);
      novo.delete(id);
      return novo;
    });
  };

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <UsersRound size={18} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Colaboradores FS
            </h2>
            <p className="text-xs text-gray-400">
              {colaboradores.length} colaborador(es)
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
            <>
              <button
                onClick={() => setShowImportar(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <Download size={15} /> Importar
              </button>
              <button
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
                className="btn-primary flex items-center gap-2"
              >
                <Plus size={16} /> Novo
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ── Barra seleção + exportação ────────────────────────────────────── */}
      {selecionados.size > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border border-blue-100 rounded-2xl">
          <span className="text-sm font-semibold text-blue-600">
            {selecionados.size} selecionado(s)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExportar("xlsx")}
              disabled={exportando}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {exportando ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileText size={14} />
              )}
              XLSX
            </button>
            <button
              onClick={() => handleExportar("pdf")}
              disabled={exportando}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {exportando ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileText size={14} />
              )}
              PDF
            </button>
            <button
              onClick={() => setSelecionados(new Set())}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-500 hover:bg-white transition-colors"
            >
              <X size={14} /> Limpar
            </button>
          </div>
        </div>
      )}

      {/* ── Barra pesquisa + filtros ──────────────────────────────────────── */}
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
            placeholder="Buscar por nome..."
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
          <SlidersHorizontal size={15} />
          Filtrar
          {filtrosAtivos > 0 && (
            <span className="w-5 h-5 rounded-full bg-white text-blue-600 text-[10px] font-bold flex items-center justify-center">
              {filtrosAtivos}
            </span>
          )}
        </button>
      </div>

      {/* ── Painel filtros recolhível ─────────────────────────────────────── */}
      {showFiltros && (
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-4">
          {/* Regional */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Regional
              </span>
              {filtroReg !== "todos" && (
                <button
                  onClick={() => hFiltro(setFiltroReg)("todos")}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <X size={11} /> Limpar
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {["todos", ...regionais.map((r) => r.nome)].map((r) => (
                <button
                  key={r}
                  onClick={() => hFiltro(setFiltroReg)(r)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    filtroReg === r
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                  }`}
                >
                  {r === "todos" ? "Todas" : r}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Status
              </span>
              {filtroStatus !== "todos" && (
                <button
                  onClick={() => hFiltro(setFiltroStatus)("todos")}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <X size={11} /> Limpar
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "todos", label: "Todos" },
                { value: "ativo", label: "Ativo" },
                { value: "inativo", label: "Inativo" },
                { value: "demitido", label: "Demitido" },
              ].map((s) => (
                <button
                  key={s.value}
                  onClick={() => hFiltro(setFiltroStatus)(s.value)}
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
          </div>

          {/* Cargo */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Cargo
              </span>
              {filtroCargo !== "todos" && (
                <button
                  onClick={() => hFiltro(setFiltroCargo)("todos")}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <X size={11} /> Limpar
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => hFiltro(setFiltroCargo)("todos")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  filtroCargo === "todos"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                }`}
              >
                Todos
              </button>
              {CARGOS_FS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => hFiltro(setFiltroCargo)(c.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    filtroCargo === c.value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {filtrosAtivos > 0 && (
            <div className="pt-1 border-t border-gray-200">
              <button
                onClick={() => {
                  hFiltro(setFiltroCargo)("todos");
                  hFiltro(setFiltroStatus)("todos");
                  hFiltro(setFiltroReg)("todos");
                }}
                className="text-xs text-red-500 hover:underline font-semibold"
              >
                Limpar todos os filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Tabela ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={
                      paginados.length > 0 &&
                      selecionados.size === paginados.length
                    }
                    onChange={selecionarTodos}
                    className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                  />
                </th>
                {[
                  "Colaborador",
                  "Cargo",
                  "Turno",
                  "Regional",
                  "Telefone",
                  "Email", // ✅ NOVO
                  "Cód. Empresa", // ✅ NOVO
                  "Cód. EPR", // ✅ NOVO
                  "Status",
                  "Ações",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
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
                    colSpan={11}
                    className="px-5 py-10 text-center text-sm text-gray-400"
                  >
                    Nenhum colaborador encontrado.
                  </td>
                </tr>
              ) : (
                paginados.map((c) => (
                  <tr
                    key={c.id}
                    className={`border-b border-gray-50 last:border-0 hover:bg-blue-50/30 transition-colors ${
                      selecionados.has(c.id) ? "bg-blue-100/40" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selecionados.has(c.id)}
                        onChange={() => toggleSelecionado(c.id)}
                        className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                      />
                    </td>

                    {/* Colaborador */}
                    <td
                      className="px-5 py-3 cursor-pointer"
                      onClick={() => setModalAberto(c)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                          <span className="text-white text-[10px] font-bold">
                            {c.nome?.charAt(0)?.toUpperCase() ?? "?"}
                          </span>
                        </div>
                        <span className="font-medium text-gray-800">
                          {c.nome}
                        </span>
                      </div>
                    </td>

                    {/* Cargo */}
                    <td
                      className="px-5 py-3 text-gray-500 text-xs capitalize cursor-pointer"
                      onClick={() => setModalAberto(c)}
                    >
                      {c.cargo ?? "—"}
                    </td>

                    {/* Turno */}
                    <td
                      className="px-5 py-3 text-gray-500 text-xs cursor-pointer"
                      onClick={() => setModalAberto(c)}
                    >
                      {TURNOS_LABEL[c.turno] ?? "—"}
                    </td>

                    {/* Regional */}
                    <td
                      className="px-5 py-3 text-gray-500 text-xs cursor-pointer"
                      onClick={() => setModalAberto(c)}
                    >
                      {c.regional ?? "—"}
                    </td>

                    {/* Telefone */}
                    <td
                      className="px-5 py-3 text-gray-500 text-xs cursor-pointer"
                      onClick={() => setModalAberto(c)}
                    >
                      {c.telefone ?? "—"}
                    </td>

                    {/* ✅ NOVO: Email */}
                    <td
                      className="px-5 py-3 text-xs font-mono text-gray-600 cursor-pointer"
                      onClick={() => setModalAberto(c)}
                    >
                      {c.email || "—"}
                    </td>

                    {/* ✅ NOVO: Código Empresa */}
                    <td
                      className="px-5 py-3 text-xs font-bold text-blue-600 cursor-pointer"
                      onClick={() => setModalAberto(c)}
                    >
                      {c.codigo_empresa || "—"}
                    </td>

                    {/* ✅ NOVO: Código EPR */}
                    <td
                      className="px-5 py-3 text-xs font-bold text-purple-600 cursor-pointer"
                      onClick={() => setModalAberto(c)}
                    >
                      {c.codigo_epr || "—"}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${
                          c.status === "ativo"
                            ? "bg-green-50 text-green-700 border-green-100"
                            : c.status === "demitido"
                              ? "bg-red-50 text-red-600 border-red-100"
                              : "bg-gray-50 text-gray-500 border-gray-100"
                        }`}
                      >
                        {c.status === "ativo"
                          ? "Ativo"
                          : c.status === "demitido"
                            ? "Demitido"
                            : "Inativo"}
                      </span>
                    </td>

                    {/* Ações */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            copiarParaWhatsApp(c, colaboradores);
                            alert("✓ Copiado para a área de transferência!");
                          }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Copiar para WhatsApp"
                        >
                          <Copy size={14} />
                        </button>
                        {podeGerenciar && (
                          <button
                            onClick={() => setShowDelConfirm(c.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
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
                className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
                  porPagina === n
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-500 border border-gray-200 hover:border-blue-300 hover:text-blue-600"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {filtrados.length === 0
                ? "0"
                : `${(pagina - 1) * porPagina + 1}–${Math.min(
                    pagina * porPagina,
                    filtrados.length,
                  )}`}{" "}
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

      {/* ── Modal detalhes ────────────────────────────────────────────────── */}
      {modalAberto && (
        <FSColaboradorModal
          colaborador={modalAberto}
          colaboradoresFS={colaboradores}
          onSalvar={atualizar}
          onDelete={(id) => {
            setShowDelConfirm(id);
            setModalAberto(null);
          }}
          onCopiar={(c) => {
            copiarParaWhatsApp(c, colaboradores);
            alert("✓ Copiado para a área de transferência!");
          }}
          onClose={() => setModalAberto(null)}
          buscarHistorico={buscarHistorico}
        />
      )}

      {/* ── Modal confirmação delete ──────────────────────────────────────── */}
      {showDelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-sm p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 size={24} className="text-red-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 mb-1">
                  Excluir colaborador?
                </p>
                <p className="text-sm text-gray-500 mb-5">
                  Esta ação não pode ser desfeita. O colaborador será removido
                  permanentemente.
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

      {/* ── Modal importar ────────────────────────────────────────────────── */}
      {showImportar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <p className="font-bold text-gray-900">Importar do Retiradas</p>
              <button
                onClick={() => setShowImportar(false)}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {naoImportados.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  Todos os colaboradores já foram importados.
                </p>
              ) : (
                naoImportados.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-100 hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {c.nome}
                      </p>
                      <p className="text-xs text-gray-400">
                        {c.cargo} · {c.regional}
                      </p>
                    </div>
                    <button
                      onClick={() => importar(c)}
                      className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Importar
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal novo — Step by Step ─────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <p className="font-bold text-gray-900">Novo Colaborador FS</p>
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
                      className={`text-xs font-semibold truncate ${
                        i === step ? "text-blue-600" : "text-gray-400"
                      }`}
                    >
                      {s}
                    </span>
                    {i < STEPS.length - 1 && (
                      <div
                        className={`h-px flex-1 ${
                          i < step ? "bg-blue-600" : "bg-gray-200"
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 space-y-3">
              {step === 0 && (
                <>
                  <input
                    placeholder="Nome completo *"
                    value={novoForm.nome}
                    onChange={(e) => setN("nome", e.target.value)}
                    className="input-field w-full"
                  />
                  <input
                    placeholder="Matrícula"
                    value={novoForm.matricula}
                    onChange={(e) => setN("matricula", e.target.value)}
                    className="input-field w-full"
                  />
                  <input
                    placeholder="Telefone"
                    value={novoForm.telefone}
                    onChange={(e) => setN("telefone", e.target.value)}
                    className="input-field w-full"
                  />
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">
                      Data de Aniversário
                    </label>
                    <input
                      type="date"
                      value={novoForm.data_aniversario}
                      onChange={(e) => setN("data_aniversario", e.target.value)}
                      className="input-field w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">
                      Data de Contratação
                    </label>
                    <input
                      type="date"
                      value={novoForm.data_contratacao}
                      onChange={(e) => setN("data_contratacao", e.target.value)}
                      className="input-field w-full"
                    />
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <select
                    value={novoForm.cargo}
                    onChange={(e) => setN("cargo", e.target.value)}
                    className="input-field w-full"
                  >
                    <option value="">Cargo...</option>
                    {CARGOS_FS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={novoForm.turno}
                    onChange={(e) => setN("turno", e.target.value)}
                    className="input-field w-full"
                  >
                    <option value="">Turno...</option>
                    <option value="12x36">12x36</option>
                    <option value="seg_sex">Segunda a Sexta</option>
                  </select>
                  <select
                    value={novoForm.regional}
                    onChange={(e) => setN("regional", e.target.value)}
                    className="input-field w-full"
                  >
                    <option value="">Regional...</option>
                    {regionais.map((r) => (
                      <option key={r.id} value={r.nome}>
                        {r.nome}
                      </option>
                    ))}
                  </select>
                  <select
                    value={novoForm.lider_responsavel}
                    onChange={(e) => setN("lider_responsavel", e.target.value)}
                    className="input-field w-full"
                  >
                    <option value="">Líder Imediato...</option>
                    {lideres.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome} ({l.cargo})
                      </option>
                    ))}
                  </select>
                </>
              )}

              {step === 2 && (
                <>
                  <p className="text-xs font-semibold text-gray-500 mb-1">
                    Status inicial
                  </p>
                  <div className="flex gap-2">
                    {[
                      { value: "ativo", label: "Ativo", color: "green" },
                      { value: "inativo", label: "Inativo", color: "gray" },
                    ].map((s) => (
                      <button
                        key={s.value}
                        onClick={() => setN("status", s.value)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                          novoForm.status === s.value
                            ? s.color === "green"
                              ? "bg-green-600 text-white border-green-600"
                              : "bg-gray-500 text-white border-gray-500"
                            : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-1.5">
                    <p className="text-xs font-bold text-blue-700 mb-2">
                      Resumo
                    </p>
                    {[
                      { label: "Nome", value: novoForm.nome },
                      { label: "Matrícula", value: novoForm.matricula },
                      { label: "Cargo", value: novoForm.cargo },
                      { label: "Regional", value: novoForm.regional },
                      { label: "Turno", value: novoForm.turno },
                    ].map(({ label, value }) =>
                      value ? (
                        <div
                          key={label}
                          className="flex justify-between text-xs"
                        >
                          <span className="text-blue-500 font-medium">
                            {label}
                          </span>
                          <span className="text-blue-800 font-semibold capitalize">
                            {value}
                          </span>
                        </div>
                      ) : null,
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 px-6 pb-6">
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
                  disabled={step === 0 && !novoForm.nome}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Próximo
                </button>
              ) : (
                <button
                  onClick={async () => {
                    await cadastrar(novoForm);
                    setShowForm(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors"
                >
                  Cadastrar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FSColaboradoresPage;
