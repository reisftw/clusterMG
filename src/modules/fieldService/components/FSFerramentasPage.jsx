import { useState, useMemo } from "react";
import {
  Wrench,
  Monitor,
  ShieldCheck,
  ShoppingCart,
  Package,
  Plus,
  Search,
  Filter,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  RefreshCw,
  BarChart2,
} from "lucide-react";
import { useFSFerramentas } from "../hooks/useFSFerramentas";
import { useAuthContext } from "../../../context/AuthContext";
import { useRegionais } from "../../regionais/hooks/useRegionais";
import Spinner from "../../../components/ui/Spinner";
import FSInventarioTab from "./FSInventarioTab";
import FSFerramentasTab from "./FSFerramentasTab";
import FSEquipamentosTab from "./FSEquipamentosTab";
import FSEpisTab from "./FSEpisTab";
import FSPedidosTab from "./FSPedidosTab";

// ─── Tabs ──────────────────────────────────────────────────
const TABS = [
  { id: "inventario", label: "Inventário", icon: BarChart2, cor: "blue" },
  { id: "ferramentas", label: "Ferramentas", icon: Wrench, cor: "yellow" },
  { id: "equipamentos", label: "Equipamentos", icon: Monitor, cor: "purple" },
  { id: "epis", label: "EPIs", icon: ShieldCheck, cor: "green" },
  { id: "pedidos", label: "Pedidos", icon: ShoppingCart, cor: "orange" },
];

const COR_MAP = {
  blue: "bg-blue-50 text-blue-600 border-blue-200",
  yellow: "bg-yellow-50 text-yellow-600 border-yellow-200",
  purple: "bg-purple-50 text-purple-600 border-purple-200",
  green: "bg-green-50 text-green-600 border-green-200",
  orange: "bg-orange-50 text-orange-600 border-orange-200",
};

const FSFerramentasPage = () => {
  const { currentUser } = useAuthContext();
  const { regionais: regionaisData = [] } = useRegionais() || {};
  const [tabAtiva, setTabAtiva] = useState("inventario");
  const [filtroRegional, setFiltroRegional] = useState("todos");
  const [busca, setBusca] = useState("");
  const [showExport, setShowExport] = useState(false);

  const hook = useFSFerramentas({
    regionalId: filtroRegional !== "todos" ? filtroRegional : null,
    activeTab: tabAtiva,
    currentUser,
  });

  const {
    ferramentas,
    equipamentos,
    epis,
    pedidos,
    loading,
    error,
    kpis,
    podeGerenciar,
    criarFerramenta,
    atualizarFerramenta,
    deletarFerramenta,
    criarEquipamento,
    atualizarEquipamento,
    deletarEquipamento,
    criarEpi,
    atualizarEpi,
    deletarEpi,
    criarPedido,
    atualizarPedido,
    deletarPedido,
    registrarEntrega,
    registrarDevolucao,
    recarregar,
  } = hook;

  const regionais = useMemo(
    () =>
      regionaisData
        .map((r) => r.nome)
        .filter(Boolean)
        .sort(),
    [regionaisData],
  );

  // ─── Badge por tab ─────────────────────────────────────────
  const badge = {
    inventario: null,
    ferramentas: ferramentas.length,
    equipamentos: equipamentos.length,
    epis: epis.length,
    pedidos: kpis.pedidosPendentes || null,
  };

  // ─── Export XLSX ───────────────────────────────────────────
  const exportarXLSX = async (regionalFiltro = null) => {
    const XLSX = await import("xlsx");

    const filtrar = (arr) =>
      regionalFiltro
        ? arr.filter(
            (i) =>
              i.regionalId === regionalFiltro || i.regional === regionalFiltro,
          )
        : arr;

    const wb = XLSX.utils.book_new();

    // Aba Ferramentas
    const dadosFerr = filtrar(ferramentas).map((f) => ({
      Nome: f.nome || "",
      Categoria: f.categoria || "",
      Marca: f.marca || "",
      "Nº Série": f.numeroSerie || "",
      Status: f.status || "",
      Regional: f.regional || "",
      "Em posse de": f.colaboradorNome || "",
      Observação: f.observacao || "",
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dadosFerr),
      "Ferramentas",
    );

    // Aba Equipamentos
    const dadosEquip = filtrar(equipamentos).map((e) => ({
      Nome: e.nome || "",
      Tipo: e.tipo || "",
      Marca: e.marca || "",
      Modelo: e.modelo || "",
      "Nº Patrimônio": e.patrimonio || "",
      "Nº Série": e.numeroSerie || "",
      Status: e.status || "",
      Regional: e.regional || "",
      "Em posse de": e.colaboradorNome || "",
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dadosEquip),
      "Equipamentos",
    );

    // Aba EPIs
    const dadosEpi = filtrar(epis).map((e) => ({
      Nome: e.nome || "",
      Tipo: e.tipo || "",
      "CA (Certificado)": e.ca || "",
      Colaborador: e.colaboradorNome || "",
      Regional: e.regional || "",
      "Data Entrega": e.dataEntrega || "",
      Validade: e.validade || "",
      Status: e.status || "",
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dadosEpi),
      "EPIs",
    );

    const nome = regionalFiltro
      ? `ferramentas-${regionalFiltro.toLowerCase().replace(/\s/g, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`
      : `ferramentas-geral-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nome);
    setShowExport(false);
  };

  // ─── Export PDF ────────────────────────────────────────────
  const exportarPDF = async (regionalFiltro = null) => {
    const { jsPDF } = await import("jspdf");
    const pdoc = new jsPDF();
    const titulo = regionalFiltro
      ? `FERRAMENTAS FS — ${regionalFiltro.toUpperCase()}`
      : "FERRAMENTAS FS — GERAL";

    pdoc.setFontSize(14);
    pdoc.setFont("helvetica", "bold");
    pdoc.text(titulo, 14, 16);

    pdoc.setFontSize(8);
    pdoc.setFont("helvetica", "normal");
    pdoc.setTextColor(120);
    pdoc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, 14, 23);
    pdoc.setTextColor(0);

    let y = 32;

    const secao = (label) => {
      pdoc.setFillColor(37, 99, 235);
      pdoc.rect(14, y, 182, 7, "F");
      pdoc.setTextColor(255);
      pdoc.setFontSize(8);
      pdoc.setFont("helvetica", "bold");
      pdoc.text(label, 16, y + 5);
      pdoc.setTextColor(0);
      y += 11;
    };

    const linha = (cols, vals) => {
      if (y > 270) {
        pdoc.addPage();
        y = 20;
      }
      cols.forEach((x, i) => {
        pdoc.setFont("helvetica", "normal");
        pdoc.setFontSize(7);
        pdoc.text(String(vals[i] || "").slice(0, 22), x, y);
      });
      y += 7;
    };

    const filtrar = (arr) =>
      regionalFiltro
        ? arr.filter(
            (i) =>
              i.regionalId === regionalFiltro || i.regional === regionalFiltro,
          )
        : arr;

    // Ferramentas
    secao("FERRAMENTAS");
    filtrar(ferramentas).forEach((f) =>
      linha(
        [14, 60, 100, 135, 170],
        [f.nome, f.marca, f.numeroSerie, f.status, f.colaboradorNome],
      ),
    );
    y += 4;

    // Equipamentos
    secao("EQUIPAMENTOS");
    filtrar(equipamentos).forEach((e) =>
      linha(
        [14, 55, 95, 130, 158, 185],
        [e.nome, e.tipo, e.patrimonio, e.modelo, e.status, e.colaboradorNome],
      ),
    );
    y += 4;

    // EPIs
    secao("EPIs");
    filtrar(epis).forEach((e) =>
      linha(
        [14, 60, 100, 135, 170],
        [e.nome, e.tipo, e.ca, e.colaboradorNome, e.status],
      ),
    );

    pdoc.save(
      regionalFiltro
        ? `ferramentas-${regionalFiltro.toLowerCase().replace(/\s/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`
        : `ferramentas-geral-${new Date().toISOString().slice(0, 10)}.pdf`,
    );
    setShowExport(false);
  };

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-yellow-50 flex items-center justify-center">
            <Wrench size={18} className="text-yellow-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Ferramentas & Equipamentos
            </h2>
            <p className="text-xs text-gray-400">
              Gestão de ativos do Field Service
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filtro Regional */}
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

          {/* Export */}
          <div className="relative">
            <button
              onClick={() => setShowExport((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-700 text-white hover:bg-gray-800 transition-colors"
            >
              <FileSpreadsheet size={14} /> Exportar <ChevronDown size={12} />
            </button>

            {showExport && (
              <div className="absolute right-0 top-10 z-30 bg-white border border-gray-100 rounded-2xl shadow-xl w-64 overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                    Geral
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => exportarPDF()}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
                    >
                      <FileText size={12} /> PDF
                    </button>
                    <button
                      onClick={() => exportarXLSX()}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors"
                    >
                      <FileSpreadsheet size={12} /> Excel
                    </button>
                  </div>
                </div>
                <div className="px-3 py-2 max-h-52 overflow-y-auto">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                    Por Regional
                  </p>
                  <div className="space-y-1.5">
                    {regionais.map((r) => (
                      <div
                        key={r}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="text-xs font-semibold text-gray-700 flex-1 truncate">
                          {r}
                        </span>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => exportarPDF(r)}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                          >
                            PDF
                          </button>
                          <button
                            onClick={() => exportarXLSX(r)}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                          >
                            XLS
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={recarregar}
            className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:bg-yellow-50 hover:text-yellow-600 transition-colors"
            title="Atualizar dados"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ── KPIs rápidos ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          {
            label: "Ferramentas",
            val: kpis.totalFerramentas,
            sub: `${kpis.ferramentasDisponiveis} disp.`,
            cor: "yellow",
          },
          {
            label: "Em Uso",
            val: kpis.ferramentasEmUso,
            sub: "ferramentas",
            cor: "blue",
          },
          {
            label: "Equipamentos",
            val: kpis.totalEquipamentos,
            sub: `${kpis.equipDisp} disp.`,
            cor: "purple",
          },
          {
            label: "EPIs",
            val: kpis.totalEpis,
            sub: "cadastrados",
            cor: "green",
          },
          {
            label: "Pedidos",
            val: kpis.pedidosPendentes,
            sub: "pendentes",
            cor: "orange",
          },
        ].map((k) => (
          <div
            key={k.label}
            className={`rounded-2xl border px-4 py-3 ${COR_MAP[k.cor].replace("text-", "border-").split(" ")[0]} bg-${k.cor}-50 border-${k.cor}-100`}
          >
            <p
              className={`text-xs font-semibold uppercase tracking-wide text-${k.cor}-500`}
            >
              {k.label}
            </p>
            <p className={`text-2xl font-bold text-${k.cor}-700 mt-0.5`}>
              {k.val}
            </p>
            <p className={`text-[10px] text-${k.cor}-400`}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const ativo = tabAtiva === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTabAtiva(t.id)}
              className={`relative flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                ativo
                  ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon size={14} />
              {t.label}
              {badge[t.id] > 0 && (
                <span
                  className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    ativo
                      ? `bg-${t.cor}-100 text-${t.cor}-600`
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {badge[t.id]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Busca global ── */}
      <div className="relative">
        <Search
          size={13}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={`Buscar em ${TABS.find((t) => t.id === tabAtiva)?.label}...`}
          className="input-field pl-8 w-full text-sm"
        />
      </div>

      {/* ── Conteúdo da tab ── */}
      <div>
        {tabAtiva === "inventario" && (
          <FSInventarioTab
            ferramentas={ferramentas}
            equipamentos={equipamentos}
            epis={epis}
            kpis={kpis}
            busca={busca}
            regionais={regionais}
            filtroRegional={filtroRegional}
          />
        )}
        {tabAtiva === "ferramentas" && (
          <FSFerramentasTab
            ferramentas={ferramentas}
            busca={busca}
            regionais={regionais}
            podeGerenciar={podeGerenciar}
            onCreate={criarFerramenta}
            onUpdate={atualizarFerramenta}
            onDelete={deletarFerramenta}
            onEntrega={registrarEntrega}
            onDevolucao={registrarDevolucao}
          />
        )}
        {tabAtiva === "equipamentos" && (
          <FSEquipamentosTab
            equipamentos={equipamentos}
            busca={busca}
            regionais={regionais}
            podeGerenciar={podeGerenciar}
            onCreate={criarEquipamento}
            onUpdate={atualizarEquipamento}
            onDelete={deletarEquipamento}
            onEntrega={registrarEntrega}
            onDevolucao={registrarDevolucao}
          />
        )}
        {tabAtiva === "epis" && (
          <FSEpisTab
            epis={epis}
            busca={busca}
            regionais={regionais}
            podeGerenciar={podeGerenciar}
            onCreate={criarEpi}
            onUpdate={atualizarEpi}
            onDelete={deletarEpi}
          />
        )}
        {tabAtiva === "pedidos" && (
          <FSPedidosTab
            pedidos={pedidos}
            busca={busca}
            regionais={regionais}
            podeGerenciar={podeGerenciar}
            onCreate={criarPedido}
            onUpdate={atualizarPedido}
            onDelete={deletarPedido}
          />
        )}
      </div>

      {/* Fechar export ao clicar fora */}
      {showExport && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setShowExport(false)}
        />
      )}
    </div>
  );
};

export default FSFerramentasPage;
