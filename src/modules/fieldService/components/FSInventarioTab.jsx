import { useState, useMemo } from "react";
import {
  Package,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  BarChart3,
  PieChart,
  Download,
  Filter,
} from "lucide-react";

// ─── Badge Status ──────────────────────────────────────────
const BadgeStatus = ({ tipo, status, count }) => {
  const cores = {
    disponivel: "green",
    em_uso: "blue",
    manutencao: "yellow",
    perdida: "red",
    perdido: "red",
    vencido: "red",
    proximo: "yellow",
    ativo: "green",
  };

  const cor = cores[status] || "gray";
  const emojis = {
    disponivel: "🟢",
    em_uso: "🔵",
    manutencao: "🟡",
    perdida: "🔴",
    perdido: "🔴",
    vencido: "🔴",
    proximo: "⚠️",
    ativo: "✅",
  };

  return (
    <div
      className={`px-3 py-2 bg-${cor}-50 border border-${cor}-200 rounded-xl`}
    >
      <p className={`text-xs font-semibold text-${cor}-600 uppercase`}>
        {emojis[status]} {status.replace(/_/g, " ")}
      </p>
      <p className={`text-lg font-bold text-${cor}-700`}>{count}</p>
    </div>
  );
};

// ─── Card Estatística ──────────────────────────────────────
const StatCard = ({ icon: Icon, label, valor, subtexto, cor }) => (
  <div
    className={`bg-${cor}-50 border border-${cor}-200 rounded-2xl px-4 py-3`}
  >
    <div className="flex items-start justify-between gap-2">
      <div>
        <p
          className={`text-xs font-semibold text-${cor}-600 uppercase tracking-wide`}
        >
          {label}
        </p>
        <p className={`text-2xl font-bold text-${cor}-700 mt-1`}>{valor}</p>
        {subtexto && (
          <p className={`text-xs text-${cor}-500 mt-0.5`}>{subtexto}</p>
        )}
      </div>
      <div
        className={`w-10 h-10 rounded-lg bg-${cor}-100 flex items-center justify-center shrink-0`}
      >
        <Icon size={18} className={`text-${cor}-600`} />
      </div>
    </div>
  </div>
);

// ─── Tabela Regional ───────────────────────────────────────
const TabelaRegional = ({ dados, titulo }) => (
  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
    <div className="px-6 py-4 border-b border-gray-100">
      <h3 className="font-bold text-gray-900">{titulo}</h3>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-6 py-3 text-left font-semibold text-gray-700">
              Regional
            </th>
            <th className="px-6 py-3 text-center font-semibold text-gray-700">
              Disponível
            </th>
            <th className="px-6 py-3 text-center font-semibold text-gray-700">
              Em Uso
            </th>
            <th className="px-6 py-3 text-center font-semibold text-gray-700">
              Manutenção
            </th>
            <th className="px-6 py-3 text-center font-semibold text-gray-700">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {dados.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="px-6 py-3 font-medium text-gray-900">
                {row.regional || "Sem Regional"}
              </td>
              <td className="px-6 py-3 text-center text-green-600 font-bold">
                {row.disponivel}
              </td>
              <td className="px-6 py-3 text-center text-blue-600 font-bold">
                {row.em_uso}
              </td>
              <td className="px-6 py-3 text-center text-yellow-600 font-bold">
                {row.manutencao}
              </td>
              <td className="px-6 py-3 text-center font-bold text-gray-900">
                {row.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ─── Tab Principal ─────────────────────────────────────────
const FSInventarioTab = ({
  ferramentas = [],
  equipamentos = [],
  epis = [],
  kpis,
  busca,
  regionais,
  filtroRegional,
}) => {
  const [abaSelecionada, setAbaSelecionada] = useState("geral");

  // ─── Cálculos gerais ───────────────────────────────────
  const calcularStatus = (validade) => {
    if (!validade) return "ativo";
    const hoje = new Date();
    const vencimento = new Date(validade);
    const diasRestantes = Math.ceil(
      (vencimento - hoje) / (1000 * 60 * 60 * 24),
    );
    if (diasRestantes < 0) return "vencido";
    if (diasRestantes <= 30) return "proximo";
    return "ativo";
  };

  // ─── Ferramentas por status ────────────────────────────
  const ferramStatus = useMemo(() => {
    const filtered =
      filtroRegional !== "todos"
        ? ferramentas.filter((f) => f.regional === filtroRegional)
        : ferramentas;

    return {
      disponivel: filtered.filter((f) => f.status === "disponivel").length,
      em_uso: filtered.filter((f) => f.status === "em_uso").length,
      manutencao: filtered.filter((f) => f.status === "manutencao").length,
      perdida: filtered.filter((f) => f.status === "perdida").length,
    };
  }, [ferramentas, filtroRegional]);

  // ─── Equipamentos por status ───────────────────────────
  const equipStatus = useMemo(() => {
    const filtered =
      filtroRegional !== "todos"
        ? equipamentos.filter((e) => e.regional === filtroRegional)
        : equipamentos;

    return {
      disponivel: filtered.filter((e) => e.status === "disponivel").length,
      em_uso: filtered.filter((e) => e.status === "em_uso").length,
      manutencao: filtered.filter((e) => e.status === "manutencao").length,
      perdido: filtered.filter((e) => e.status === "perdido").length,
    };
  }, [equipamentos, filtroRegional]);

  // ─── EPIs por status ───────────────────────────────────
  const episStatus = useMemo(() => {
    const filtered =
      filtroRegional !== "todos"
        ? epis.filter((e) => e.regional === filtroRegional)
        : epis;

    return {
      ativo: filtered.filter((e) => calcularStatus(e.validade) === "ativo")
        .length,
      proximo: filtered.filter((e) => calcularStatus(e.validade) === "proximo")
        .length,
      vencido: filtered.filter((e) => calcularStatus(e.validade) === "vencido")
        .length,
    };
  }, [epis, filtroRegional]);

  // ─── Dados por regional (Ferramentas) ──────────────────
  const ferramentasPorRegional = useMemo(() => {
    const map = {};
    ferramentas.forEach((f) => {
      const reg = f.regional || "Sem Regional";
      if (!map[reg]) {
        map[reg] = {
          regional: reg,
          disponivel: 0,
          em_uso: 0,
          manutencao: 0,
          total: 0,
        };
      }
      map[reg].total++;
      if (f.status === "disponivel") map[reg].disponivel++;
      if (f.status === "em_uso") map[reg].em_uso++;
      if (f.status === "manutencao") map[reg].manutencao++;
    });
    return Object.values(map).sort((a, b) =>
      a.regional.localeCompare(b.regional),
    );
  }, [ferramentas]);

  // ─── Dados por regional (Equipamentos) ─────────────────
  const equipamentosPorRegional = useMemo(() => {
    const map = {};
    equipamentos.forEach((e) => {
      const reg = e.regional || "Sem Regional";
      if (!map[reg]) {
        map[reg] = {
          regional: reg,
          disponivel: 0,
          em_uso: 0,
          manutencao: 0,
          total: 0,
        };
      }
      map[reg].total++;
      if (e.status === "disponivel") map[reg].disponivel++;
      if (e.status === "em_uso") map[reg].em_uso++;
      if (e.status === "manutencao") map[reg].manutencao++;
    });
    return Object.values(map).sort((a, b) =>
      a.regional.localeCompare(b.regional),
    );
  }, [equipamentos]);

  // ─── Dados por regional (EPIs) ────────────────────────
  const episPorRegional = useMemo(() => {
    const map = {};
    epis.forEach((e) => {
      const reg = e.regional || "Sem Regional";
      if (!map[reg]) {
        map[reg] = {
          regional: reg,
          disponivel: 0,
          em_uso: 0,
          manutencao: 0,
          total: 0,
        };
      }
      map[reg].total++;
      const status = calcularStatus(e.validade);
      if (status === "ativo") map[reg].disponivel++;
      if (status === "proximo") map[reg].manutencao++;
    });
    return Object.values(map).sort((a, b) =>
      a.regional.localeCompare(b.regional),
    );
  }, [epis]);

  // ─── Top items em uso ──────────────────────────────────
  const topItensEmUso = useMemo(() => {
    const items = [
      ...ferramentas
        .filter((f) => f.status === "em_uso" && f.colaboradorNome)
        .map((f) => ({
          tipo: "Ferramenta",
          nome: f.nome,
          colaborador: f.colaboradorNome,
          regional: f.regional,
          emUso: true,
        })),
      ...equipamentos
        .filter((e) => e.status === "em_uso" && e.colaboradorNome)
        .map((e) => ({
          tipo: "Equipamento",
          nome: e.nome,
          colaborador: e.colaboradorNome,
          regional: e.regional,
          emUso: true,
        })),
    ];
    return items.slice(0, 10);
  }, [ferramentas, equipamentos]);

  // ─── EPIs com alerta ───────────────────────────────────
  const episComAlerta = useMemo(() => {
    return epis
      .filter((e) => {
        const status = calcularStatus(e.validade);
        return status === "vencido" || status === "proximo";
      })
      .slice(0, 10);
  }, [epis]);

  return (
    <div className="space-y-6">
      {/* ── Tabs ── */}
      <div className="flex gap-2 bg-gray-100 rounded-2xl p-1 overflow-x-auto">
        {[
          { id: "geral", label: "Visão Geral" },
          { id: "ferramentas", label: "Ferramentas" },
          { id: "equipamentos", label: "Equipamentos" },
          { id: "epis", label: "EPIs" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setAbaSelecionada(t.id)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              abaSelecionada === t.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Visão Geral ── */}
      {abaSelecionada === "geral" && (
        <div className="space-y-6">
          {/* KPIs principais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              icon={Package}
              label="Total Ferramentas"
              valor={kpis?.totalFerramentas || 0}
              subtexto={`${kpis?.ferramentasDisponiveis || 0} disponíveis`}
              cor="yellow"
            />
            <StatCard
              icon={TrendingUp}
              label="Em Uso"
              valor={kpis?.ferramentasEmUso || 0}
              subtexto="ferramentas"
              cor="blue"
            />
            <StatCard
              icon={Package}
              label="Total Equipamentos"
              valor={kpis?.totalEquipamentos || 0}
              subtexto={`${kpis?.equipDisp || 0} disponíveis`}
              cor="purple"
            />
            <StatCard
              icon={CheckCircle}
              label="Total EPIs"
              valor={kpis?.totalEpis || 0}
              subtexto="cadastrados"
              cor="green"
            />
          </div>

          {/* Status resumido */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="col-span-2">
              <h3 className="text-sm font-bold text-gray-900 mb-3">
                Ferramentas
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <BadgeStatus
                  tipo="ferramentas"
                  status="disponivel"
                  count={ferramStatus.disponivel}
                />
                <BadgeStatus
                  tipo="ferramentas"
                  status="em_uso"
                  count={ferramStatus.em_uso}
                />
                <BadgeStatus
                  tipo="ferramentas"
                  status="manutencao"
                  count={ferramStatus.manutencao}
                />
                <BadgeStatus
                  tipo="ferramentas"
                  status="perdida"
                  count={ferramStatus.perdida}
                />
              </div>
            </div>

            <div className="col-span-2">
              <h3 className="text-sm font-bold text-gray-900 mb-3">
                Equipamentos
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <BadgeStatus
                  tipo="equipamentos"
                  status="disponivel"
                  count={equipStatus.disponivel}
                />
                <BadgeStatus
                  tipo="equipamentos"
                  status="em_uso"
                  count={equipStatus.em_uso}
                />
                <BadgeStatus
                  tipo="equipamentos"
                  status="manutencao"
                  count={equipStatus.manutencao}
                />
                <BadgeStatus
                  tipo="equipamentos"
                  status="perdido"
                  count={equipStatus.perdido}
                />
              </div>
            </div>
          </div>

          {/* Itens em uso + Alertas EPIs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Em Uso */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <TrendingUp size={16} className="text-blue-600" />
                </div>
                <h3 className="font-bold text-gray-900">Itens em Uso</h3>
                <span className="ml-auto text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                  {topItensEmUso.length}
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {topItensEmUso.length === 0 ? (
                  <div className="px-6 py-4 text-center text-gray-400 text-sm">
                    Nenhum item em uso
                  </div>
                ) : (
                  topItensEmUso.map((item, i) => (
                    <div
                      key={i}
                      className="px-6 py-3 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {item.nome}
                        </p>
                        <p className="text-xs text-gray-500">
                          👤 {item.colaborador}
                        </p>
                        <p className="text-xs text-gray-400">{item.regional}</p>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${
                          item.tipo === "Ferramenta"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-purple-100 text-purple-700"
                        }`}
                      >
                        {item.tipo}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Alertas EPIs */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <AlertCircle size={16} className="text-red-600" />
                </div>
                <h3 className="font-bold text-gray-900">EPIs com Alerta</h3>
                <span className="ml-auto text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded-full">
                  {episComAlerta.length}
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {episComAlerta.length === 0 ? (
                  <div className="px-6 py-4 text-center text-gray-400 text-sm">
                    Todos os EPIs ok! ✅
                  </div>
                ) : (
                  episComAlerta.map((epi, i) => {
                    const status = calcularStatus(epi.validade);
                    return (
                      <div key={i} className="px-6 py-3">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {epi.nome}
                          </p>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                              status === "vencido"
                                ? "bg-red-100 text-red-700"
                                : "bg-yellow-100 text-yellow-700"
                            }`}
                          >
                            {status === "vencido" ? "VENCIDO" : "PRÓX. VENC."}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          👤 {epi.colaboradorNome}
                        </p>
                        {epi.validade && (
                          <p className="text-xs text-gray-400">
                            Validade:{" "}
                            {new Date(epi.validade).toLocaleDateString("pt-BR")}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Ferramentas ── */}
      {abaSelecionada === "ferramentas" && (
        <div className="space-y-4">
          <TabelaRegional
            dados={ferramentasPorRegional}
            titulo="Ferramentas por Regional"
          />
        </div>
      )}

      {/* ── Equipamentos ── */}
      {abaSelecionada === "equipamentos" && (
        <div className="space-y-4">
          <TabelaRegional
            dados={equipamentosPorRegional}
            titulo="Equipamentos por Regional"
          />
        </div>
      )}

      {/* ── EPIs ── */}
      {abaSelecionada === "epis" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <BadgeStatus tipo="epis" status="ativo" count={episStatus.ativo} />
            <BadgeStatus
              tipo="epis"
              status="proximo"
              count={episStatus.proximo}
            />
            <BadgeStatus
              tipo="epis"
              status="vencido"
              count={episStatus.vencido}
            />
          </div>
          <TabelaRegional
            dados={episPorRegional}
            titulo="EPIs por Regional (Status)"
          />
        </div>
      )}
    </div>
  );
};

export default FSInventarioTab;
