import { useState, useMemo } from "react";
import { Clock, RefreshCw, History, Pencil, Search } from "lucide-react";
import { useBancoHoras, formatarSaldo } from "../hooks/useBancoHoras";
import { useColaboradores } from "../../colaboradores/hooks/useColaboradores";
import { useAuthContext } from "../../../context/AuthContext";
import { hasPermission } from "../../../constants/roles";
import BancoHorasModal from "./BancoHorasModal";
import BancoHorasHistoricoModal from "./BancoHorasHistoricoModal";
import Spinner from "../../../components/ui/Spinner";

const formatarData = (d) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

const formatarDataHora = (str) => {
  if (!str) return "—";
  const d = new Date(str);
  return (
    d.toLocaleDateString("pt-BR") +
    " às " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
};

const SaldoBadge = ({ minutos }) => {
  if (minutos == null || minutos === 0)
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
        Zerado
      </span>
    );
  if (minutos < 0)
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
        Negativo
      </span>
    );
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
      Positivo
    </span>
  );
};

const BancoHorasPage = () => {
  const { currentUser } = useAuthContext();
  const { colaboradores, loading: loadingC } = useColaboradores();
  const { saldos, loading, salvar, carregar } = useBancoHoras();

  const [modalEditar, setModalEditar] = useState(null);
  const [modalHistorico, setModalHistorico] = useState(null);
  const [busca, setBusca] = useState("");
  const [filtroSaldo, setFiltroSaldo] = useState("todos");
  const [filtroCargo, setFiltroCargo] = useState("todos");

  const role = Array.isArray(currentUser?.role)
    ? currentUser.role[0]
    : currentUser?.role;
  const roleNormalizada = String(role || "").toLowerCase();
  const podeEditar =
    hasPermission(currentUser?.role, "manage_banco_horas") ||
    roleNormalizada === "admin" ||
    roleNormalizada === "gestor";

  const saldoMap = useMemo(() => {
    const m = {};
    saldos.forEach((s) => {
      m[s.colaborador_id] = s;
    });
    return m;
  }, [saldos]);

  const colaboradoresAtivos = useMemo(
    () =>
      colaboradores.filter(
        (c) => c.status === "Ativo" || c.status === "Em Experiência",
      ),
    [colaboradores],
  );

  const opcoesCargo = useMemo(
    () =>
      [...new Set(colaboradoresAtivos.map((c) => c.cargo).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    [colaboradoresAtivos],
  );

  const lista = useMemo(
    () =>
      [...colaboradoresAtivos]
        .filter((c) => {
          const termo = busca.trim().toLowerCase();
          const saldo = saldoMap[c.id]?.saldo_minutos ?? 0;
          const nomeOk = !termo
            ? true
            : `${c.nome} ${c.cargo || ""}`.toLowerCase().includes(termo);
          const cargoOk =
            filtroCargo === "todos" ? true : (c.cargo || "") === filtroCargo;
          const saldoOk =
            filtroSaldo === "todos"
              ? true
              : filtroSaldo === "negativo"
                ? saldo < 0
                : filtroSaldo === "zerado"
                  ? saldo === 0
                  : saldo > 0;

          return nomeOk && cargoOk && saldoOk;
        })
        .sort((a, b) => {
          const sa = saldoMap[a.id]?.saldo_minutos ?? 0;
          const sb = saldoMap[b.id]?.saldo_minutos ?? 0;
          return sa - sb;
        }),
    [colaboradoresAtivos, saldoMap, busca, filtroCargo, filtroSaldo],
  );

  const resumo = useMemo(
    () => ({
      negativos: lista.filter((c) => (saldoMap[c.id]?.saldo_minutos ?? 0) < 0)
        .length,
      zerados: lista.filter((c) => (saldoMap[c.id]?.saldo_minutos ?? 0) === 0)
        .length,
      positivos: lista.filter((c) => (saldoMap[c.id]?.saldo_minutos ?? 0) > 0)
        .length,
    }),
    [lista, saldoMap],
  );

  if (loading || loadingC) return <Spinner fullScreen />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {lista.length} colaborador(es) exibido(s)
        </p>
        <button
          onClick={carregar}
          className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="relative block">
            <span className="sr-only">Buscar colaborador</span>
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou cargo"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-300 focus:bg-white"
            />
          </label>

          <select
            value={filtroCargo}
            onChange={(e) => setFiltroCargo(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-300 focus:bg-white"
          >
            <option value="todos">Todos os cargos</option>
            {opcoesCargo.map((cargo) => (
              <option key={cargo} value={cargo}>
                {cargo}
              </option>
            ))}
          </select>

          <select
            value={filtroSaldo}
            onChange={(e) => setFiltroSaldo(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-300 focus:bg-white"
          >
            <option value="todos">Todos os saldos</option>
            <option value="negativo">Somente negativos</option>
            <option value="zerado">Somente zerados</option>
            <option value="positivo">Somente positivos</option>
          </select>
        </div>
      </div>

      {/* Resumo cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-extrabold text-red-500">
            {resumo.negativos}
          </p>
          <p className="text-xs text-gray-500 font-medium mt-0.5">Negativos</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-extrabold text-gray-400">
            {resumo.zerados}
          </p>
          <p className="text-xs text-gray-500 font-medium mt-0.5">Zerados</p>
        </div>
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-extrabold text-green-600">
            {resumo.positivos}
          </p>
          <p className="text-xs text-gray-500 font-medium mt-0.5">Positivos</p>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Colaborador
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Cargo
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Saldo
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Status
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Atualização
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Pgto/Cobrança
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {lista.map((colab) => {
                const reg = saldoMap[colab.id];
                const saldo = reg?.saldo_minutos ?? null;
                const isNeg = saldo != null && saldo < 0;
                const isPos = saldo != null && saldo > 0;

                return (
                  <tr
                    key={colab.id}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            isNeg
                              ? "bg-red-100 text-red-600"
                              : isPos
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {colab.nome.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-800">
                          {colab.nome}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">
                      {colab.cargo}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`font-bold text-sm ${isNeg ? "text-red-500" : isPos ? "text-green-600" : "text-gray-400"}`}
                      >
                        {saldo == null ? "—" : formatarSaldo(saldo)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <SaldoBadge minutos={saldo} />
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-400">
                      {reg ? formatarDataHora(reg.registrado_em) : "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-400">
                      {reg?.data_pgto_cobranca
                        ? formatarData(reg.data_pgto_cobranca)
                        : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setModalHistorico(colab)}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                          title="Histórico"
                        >
                          <History size={14} />
                        </button>
                        {podeEditar && (
                          <button
                            onClick={() =>
                              setModalEditar({ colab, saldoAtual: saldo ?? 0 })
                            }
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-orange-50 hover:text-orange-500 transition-colors"
                            title="Editar"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modais */}
      {modalEditar && (
        <BancoHorasModal
          colaborador={modalEditar.colab}
          saldoAtual={modalEditar.saldoAtual}
          onSalvar={salvar}
          onClose={() => setModalEditar(null)}
        />
      )}
      {modalHistorico && (
        <BancoHorasHistoricoModal
          colaborador={modalHistorico}
          onClose={() => setModalHistorico(null)}
        />
      )}
    </div>
  );
};

export default BancoHorasPage;
