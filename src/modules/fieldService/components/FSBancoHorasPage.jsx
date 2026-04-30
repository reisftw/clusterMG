import { useState, useMemo, useCallback } from "react";
import {
  Plus,
  RefreshCw,
  Search,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  FileSpreadsheet,
  ChevronDown,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { useFSBancoHoras } from "../hooks/useFSBancoHoras";
import { useFSColaboradores } from "../hooks/useFSColaboradores";
import { useRegionais } from "../../regionais/hooks/useRegionais";
import { hasPermission } from "../../../constants/roles";
import FSBancoHorasCard from "./FSBancoHorasCard";
import FSBancoHorasForm from "./FSBancoHorasForm";
import FSBancoHorasDetalhe from "./FSBancoHorasDetalhe";
import Spinner from "../../../components/ui/Spinner";

const FSBancoHorasPage = () => {
  const { currentUser } = useAuthContext();
  const { colaboradores: todosColaboradores = [] } = useFSColaboradores() || {};
  const { regionais: regionaisData = [] } = useRegionais() || {};
  const {
    lancamentos,
    lancamentosPorColaborador,
    loading,
    error,
    adicionarLancamento: criar,
    atualizarLancamento: atualizar,
    deletarLancamento: deletar,
    recarregar,
  } = useFSBancoHoras({
    currentUser,
    colaboradores: todosColaboradores,
    regionais: regionaisData,
  });

  const [busca, setBusca] = useState("");
  const [filtroSaldo, setFiltroSaldo] = useState("todos");
  const [filtroRegional, setFiltroRegional] = useState("todos");
  const [showForm, setShowForm] = useState(false);
  const [colaboradorDetalhe, setColaboradorDetalhe] = useState(null);
  const [lancamentoEditando, setLancamentoEditando] = useState(null);
  const [colaboradorFixo, setColaboradorFixo] = useState(null);
  const [showDelConfirm, setShowDelConfirm] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const podeGerenciar = hasPermission(
    currentUser?.role,
    "manage_fs_banco_horas",
  );

  const calcularSaldo = useCallback(
    (colaboradorId) => {
      const colab = lancamentosPorColaborador?.find(
        (c) => c.id === colaboradorId,
      );
      return colab?.saldo || 0;
    },
    [lancamentosPorColaborador],
  );

  const minutosParaHoras = useCallback((minutos) => {
    const abs = Math.abs(minutos);
    const h = Math.floor(abs / 60)
      .toString()
      .padStart(2, "0");
    const m = (abs % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
  }, []);

  const regionais = useMemo(
    () =>
      regionaisData
        ?.map((r) => r.nome)
        .filter(Boolean)
        .sort() || [],
    [regionaisData],
  );

  const colaboradoresComSaldo = useMemo(() => {
    if (!Array.isArray(todosColaboradores)) return [];

    return todosColaboradores
      .filter((c) => c.status === "ativo" || c.status === "Ativo")
      .map((c) => ({ ...c, saldo: calcularSaldo(c.id) }))
      .filter(
        (c) =>
          (!busca ||
            c.nome?.toLowerCase().includes(busca.toLowerCase()) ||
            c.cargo?.toLowerCase().includes(busca.toLowerCase())) &&
          (filtroRegional === "todos" || c.regional === filtroRegional) &&
          (filtroSaldo === "todos"
            ? true
            : filtroSaldo === "positivo"
              ? c.saldo > 0
              : filtroSaldo === "negativo"
                ? c.saldo < 0
                : c.saldo === 0),
      )
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [
    todosColaboradores,
    busca,
    filtroSaldo,
    filtroRegional,
    calcularSaldo,
  ]);

  // KPIs
  const totalCredito = useMemo(() => {
    return (
      lancamentos
        ?.filter((l) => l.tipo === "credito")
        .reduce((acc, l) => {
          const [h, m] = (l.horas || "0:0").split(":").map(Number);
          return acc + h * 60 + m;
        }, 0) || 0
    );
  }, [lancamentos]);

  const totalDebito = useMemo(() => {
    return (
      lancamentos
        ?.filter((l) => l.tipo === "debito")
        .reduce((acc, l) => {
          const [h, m] = (l.horas || "0:0").split(":").map(Number);
          return acc + h * 60 + m;
        }, 0) || 0
    );
  }, [lancamentos]);

  const cobrancasHoje = useMemo(() => {
    const hoje = new Date().toISOString().split("T")[0];
    return lancamentos?.filter((l) => l.data_cobranca === hoje).length || 0;
  }, [lancamentos]);

  const handleNovoLancamento = useCallback((colaborador = null) => {
    setColaboradorFixo(colaborador);
    setLancamentoEditando(null);
    setShowForm(true);
  }, []);

  const handleEditarLancamento = useCallback((lancamento) => {
    setLancamentoEditando(lancamento);
    setColaboradorFixo(null);
    setShowForm(true);
  }, []);

  const handleSubmit = async (dados) => {
    if (lancamentoEditando) {
      await atualizar(lancamentoEditando.id, dados);
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
            <Clock size={18} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Banco de Horas</h2>
            <p className="text-xs text-gray-400">
              {colaboradoresComSaldo.length} colaborador(es)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={recarregar}
            className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
          >
            <RefreshCw size={16} />
          </button>

          {/* Export Menu */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-700 text-white hover:bg-gray-800 transition-colors"
            >
              <FileSpreadsheet size={14} /> Exportar <ChevronDown size={12} />
            </button>
            {/* MENU EXPORT COMPLETO */}
          </div>

          {podeGerenciar && (
            <button
              onClick={() => handleNovoLancamento()}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={16} /> Novo Lançamento
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar colaborador..."
            className="input-field pl-8 w-full text-sm"
          />
        </div>

        <select
          value={filtroRegional}
          onChange={(e) => setFiltroRegional(e.target.value)}
          className="input-field text-xs font-semibold"
        >
          <option value="todos">Todas as regionais</option>
          {regionais.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <div className="flex gap-1.5">
          {[
            { value: "todos", label: "Todos" },
            { value: "positivo", label: "🟢" },
            { value: "negativo", label: "🔴" },
            { value: "zerado", label: "⚪" },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setFiltroSaldo(f.value)}
              title={f.value}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                filtroSaldo === f.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
          <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide">
            Colaboradores
          </p>
          <p className="text-2xl font-bold text-blue-700 mt-0.5">
            {
              (todosColaboradores || []).filter(
                (c) => c.status === "ativo" || c.status === "Ativo",
              ).length
            }
          </p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-2xl px-4 py-3">
          <p className="text-xs font-semibold text-green-500 uppercase tracking-wide flex items-center gap-1">
            <TrendingUp size={11} /> Crédito
          </p>
          <p className="text-2xl font-bold text-green-700 mt-0.5 font-mono">
            {minutosParaHoras(totalCredito)}h
          </p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
          <p className="text-xs font-semibold text-red-500 uppercase tracking-wide flex items-center gap-1">
            <TrendingDown size={11} /> Débito
          </p>
          <p className="text-2xl font-bold text-red-600 mt-0.5 font-mono">
            {minutosParaHoras(totalDebito)}h
          </p>
        </div>
        <div
          className={`border rounded-2xl px-4 py-3 ${cobrancasHoje > 0 ? "bg-orange-50 border-orange-200" : "bg-gray-50 border-gray-100"}`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-wide flex items-center gap-1 ${cobrancasHoje > 0 ? "text-orange-500" : "text-gray-400"}`}
          >
            <AlertCircle size={11} /> Cobranças Hoje
          </p>
          <p
            className={`text-2xl font-bold mt-0.5 ${cobrancasHoje > 0 ? "text-orange-600" : "text-gray-500"}`}
          >
            {cobrancasHoje}
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Lista */}
      {colaboradoresComSaldo.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-14 text-center">
          <Clock size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-400">
            Nenhum colaborador encontrado.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {colaboradoresComSaldo.map((c) => (
            <FSBancoHorasCard
              key={c.id}
              colaborador={c}
              lancamentos={lancamentos || []}
              calcularSaldo={calcularSaldo}
              minutosParaHoras={minutosParaHoras}
              onClick={setColaboradorDetalhe}
            />
          ))}
        </div>
      )}

      {/* Modais */}
      {showForm && (
        <FSBancoHorasForm
          colaboradores={todosColaboradores || []}
          colaboradorFixo={colaboradorFixo}
          lancamentoParaEditar={lancamentoEditando}
          currentUserNome={currentUser?.nome ?? currentUser?.email ?? ""}
          onSubmit={handleSubmit}
          onClose={() => {
            setShowForm(false);
            setLancamentoEditando(null);
            setColaboradorFixo(null);
          }}
        />
      )}

      {colaboradorDetalhe && (
        <FSBancoHorasDetalhe
          colaborador={colaboradorDetalhe}
          lancamentos={lancamentos || []}
          calcularSaldo={calcularSaldo}
          minutosParaHoras={minutosParaHoras}
          onClose={() => setColaboradorDetalhe(null)}
          onNovoLancamento={handleNovoLancamento}
          onEditarLancamento={handleEditarLancamento}
          onDeletarLancamento={(id) => setShowDelConfirm(id)}
          podeGerenciar={podeGerenciar}
        />
      )}

      {showDelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-sm p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Clock size={22} className="text-red-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 mb-1">
                  Excluir lançamento?
                </p>
                <p className="text-sm text-gray-500 mb-5">
                  O saldo será recalculado automaticamente.
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

      {showExportMenu && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setShowExportMenu(false)}
        />
      )}
    </div>
  );
};

export default FSBancoHorasPage;
