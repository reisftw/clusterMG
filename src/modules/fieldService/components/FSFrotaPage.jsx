import { useState, useMemo } from "react";
import {
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Car,
  AlertTriangle,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { useFSFrota } from "../hooks/useFSFrota";
import { useFSColaboradores } from "../hooks/useFSColaboradores";
import { hasPermission } from "../../../constants/roles";
import FSFrotaCard from "./FSFrotaCard";
import FSFrotaForm from "./FSFrotaForm";
import FSFrotaDetalhe from "./FSFrotaDetalhe";
import FSFrotaManutencaoForm from "./FSFrotaManutencaoForm";
import FSFrotaSinistroForm from "./FSFrotaSinistroForm";
import Spinner from "../../../components/ui/Spinner";
import { useRegionais } from "../../regionais/hooks/useRegionais";

const CARROCERIAS = ["HATCH", "SEDAN", "CAMINHONETE", "UTILITARIO"];

const FSFrotaPage = () => {
  const { currentUser } = useAuthContext();
  const {
    veiculos,
    manutencoes,
    sinistros,
    loading,
    error,
    criarVeiculo,
    atualizarVeiculo,
    atualizarResponsavel,
    deletarVeiculo,
    criarManutencao,
    atualizarManutencao,
    deletarManutencao,
    criarSinistro,
    atualizarSinistro,
    deletarSinistro,
    carregar,
  } = useFSFrota();
  const { colaboradores } = useFSColaboradores();
  const { regionais: regionaisData } = useRegionais();
  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [showFiltros, setShowFiltros] = useState(false);
  const [filtroRegional, setFiltroRegional] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroCarroceria, setFiltroCarroceria] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const [showForm, setShowForm] = useState(false);
  const [veiculoEditando, setVeiculoEditando] = useState(null);
  const [veiculoDetalhe, setVeiculoDetalhe] = useState(null);
  const [showDelConfirm, setShowDelConfirm] = useState(null);

  const [manutVeiculoId, setManutVeiculoId] = useState(null);
  const [manutEditando, setManutEditando] = useState(null);
  const [sinistVeiculoId, setSinistVeiculoId] = useState(null);
  const [sinistEditando, setSinistEditando] = useState(null);

  const podeGerenciar = hasPermission(currentUser?.role, "manage_fs_frota");

  const regionais = useMemo(
    () =>
      regionaisData
        .map((r) => r.nome)
        .filter(Boolean)
        .sort(),
    [regionaisData],
  );

  const veiculosFiltrados = useMemo(() => {
    return veiculos.filter((v) => {
      const matchBusca =
        !busca ||
        v.placa?.toLowerCase().includes(busca.toLowerCase()) ||
        v.modelo?.toLowerCase().includes(busca.toLowerCase());
      const matchReg =
        filtroRegional === "todos" || v.regional === filtroRegional;
      const matchTipo = filtroTipo === "todos" || v.tipo === filtroTipo;
      const matchCarr =
        filtroCarroceria === "todos" || v.carroceria === filtroCarroceria;
      const kmRest =
        v.km_prox_revisao && v.km_atual ? v.km_prox_revisao - v.km_atual : null;
      const matchStatus =
        filtroStatus === "todos"
          ? true
          : filtroStatus === "base"
            ? !!v.parado_na_base
            : filtroStatus === "em_uso"
              ? !v.parado_na_base
              : filtroStatus === "alerta"
                ? kmRest != null && kmRest <= 3000
                : true;
      return matchBusca && matchReg && matchTipo && matchCarr && matchStatus;
    });
  }, [
    veiculos,
    busca,
    filtroRegional,
    filtroTipo,
    filtroCarroceria,
    filtroStatus,
  ]);

  const alertasCriticos = useMemo(
    () =>
      veiculos.filter(
        (v) =>
          v.km_prox_revisao &&
          v.km_atual &&
          v.km_prox_revisao - v.km_atual <= 0,
      ).length,
    [veiculos],
  );

  const filtrosAtivos = [
    filtroRegional,
    filtroTipo,
    filtroCarroceria,
    filtroStatus,
  ].filter((f) => f !== "todos").length;

  // ✅ Exportar PDF
  const gerarPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("FROTA FS — RELATÓRIO", 20, 20);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(
      `Gerado em ${new Date().toLocaleDateString("pt-BR")} · ${veiculosFiltrados.length} veículo(s)`,
      20,
      28,
    );
    doc.setTextColor(0);

    // Cabeçalho tabela
    doc.setFillColor(37, 99, 235);
    doc.rect(14, 34, 182, 7, "F");
    doc.setTextColor(255);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    const cols = [15, 60, 80, 100, 122, 145, 168];
    [
      "MODELO",
      "PLACA",
      "REGIONAL",
      "TIPO",
      "KM ATUAL",
      "PRÓ. REV.",
      "RESPONSÁVEL",
    ].forEach((h, i) => {
      doc.text(h, cols[i], 39.5);
    });
    doc.setTextColor(0);

    let y = 49;
    veiculosFiltrados.forEach((v, i) => {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
      if (i % 2 === 0) {
        doc.setFillColor(245, 247, 255);
        doc.rect(14, y - 4.5, 182, 7.5, "F");
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(v.modelo?.slice(0, 18) ?? "—", cols[0], y);
      doc.text(v.placa ?? "—", cols[1], y);
      doc.text(v.regional ?? "—", cols[2], y);
      doc.text(v.tipo === "proprio" ? "Próprio" : "Alugado", cols[3], y);
      doc.text(
        v.km_atual ? v.km_atual.toLocaleString("pt-BR") : "—",
        cols[4],
        y,
      );
      doc.text(
        v.km_prox_revisao ? v.km_prox_revisao.toLocaleString("pt-BR") : "—",
        cols[5],
        y,
      );
      doc.text(
        (v.parado_na_base ? "Na base" : (v.responsavel_nome ?? "—")).slice(
          0,
          18,
        ),
        cols[6],
        y,
      );
      y += 8;
    });

    doc.save(`frota-fs-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ✅ Exportar Excel
  const gerarExcel = async () => {
    const XLSX = await import("xlsx");
    const dados = veiculosFiltrados.map((v) => ({
      Modelo: v.modelo ?? "",
      Placa: v.placa ?? "",
      Regional: v.regional ?? "",
      Tipo: v.tipo === "proprio" ? "Próprio" : "Alugado",
      Carroceria: v.carroceria ?? "",
      Ano: v.ano ?? "",
      Cor: v.cor ?? "",
      "KM Atual": v.km_atual ?? 0,
      "KM Próx. Revisão": v.km_prox_revisao ?? "",
      "Revisão Periódica": v.revisao_periodica
        ? `A cada ${v.intervalo_km} km`
        : "Não",
      Responsável: v.parado_na_base
        ? "Parado na base"
        : (v.responsavel_nome ?? ""),
      Status: v.parado_na_base ? "Na base" : "Em uso",
    }));

    const ws = XLSX.utils.json_to_sheet(dados);
    ws["!cols"] = [22, 12, 12, 10, 14, 6, 10, 12, 16, 20, 22, 10].map((w) => ({
      wch: w,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Frota FS");
    XLSX.writeFile(
      wb,
      `frota-fs-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const fecharForm = () => {
    setShowForm(false);
    setVeiculoEditando(null);
  };
  const fecharDetalhe = () => setVeiculoDetalhe(null);

  const handleSubmitVeiculo = async (dados) => {
    if (veiculoEditando) await atualizarVeiculo(veiculoEditando.id, dados);
    else await criarVeiculo(dados);
  };

  const limparFiltros = () => {
    setFiltroRegional("todos");
    setFiltroTipo("todos");
    setFiltroCarroceria("todos");
    setFiltroStatus("todos");
  };

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <Car size={18} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Frota FS</h2>
            <p className="text-xs text-gray-400">
              {veiculosFiltrados.length} de {veiculos.length} veículo(s)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {alertasCriticos > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle size={14} className="text-red-500" />
              <span className="text-xs font-bold text-red-600">
                {alertasCriticos} revisão(ões) vencida(s)
              </span>
            </div>
          )}

          <button
            onClick={carregar}
            className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
            title="Recarregar"
          >
            <RefreshCw size={16} />
          </button>

          {/* ✅ Exportar PDF */}
          <button
            onClick={gerarPDF}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
            title="Exportar PDF"
          >
            <FileText size={14} /> PDF
          </button>

          {/* ✅ Exportar Excel */}
          <button
            onClick={gerarExcel}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors"
            title="Exportar Excel"
          >
            <FileSpreadsheet size={14} /> Excel
          </button>

          {podeGerenciar && (
            <button
              onClick={() => setShowForm(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={16} /> Novo Veículo
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ── Cards resumo ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: veiculos.length, cor: "blue" },
          {
            label: "Próprios",
            value: veiculos.filter((v) => v.tipo === "proprio").length,
            cor: "green",
          },
          {
            label: "Alugados",
            value: veiculos.filter((v) => v.tipo === "alugado").length,
            cor: "purple",
          },
          {
            label: "Na Base",
            value: veiculos.filter((v) => v.parado_na_base).length,
            cor: "gray",
          },
        ].map(({ label, value, cor }) => (
          <div
            key={label}
            className={`bg-${cor}-50 border border-${cor}-100 rounded-2xl px-4 py-3`}
          >
            <p
              className={`text-xs font-semibold text-${cor}-500 uppercase tracking-wide`}
            >
              {label}
            </p>
            <p className={`text-2xl font-bold text-${cor}-700 mt-0.5`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Busca + Filtros ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={buscaInput}
            onChange={(e) => setBuscaInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setBusca(buscaInput);
              if (e.key === "Escape") {
                setBuscaInput("");
                setBusca("");
              }
            }}
            placeholder="Buscar placa ou modelo... (Enter)"
            className="input-field pl-8 w-full text-sm"
          />
        </div>
        <button
          onClick={() => setShowFiltros((v) => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
            showFiltros || filtrosAtivos > 0
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
          }`}
        >
          <SlidersHorizontal size={13} /> Filtrar
          {filtrosAtivos > 0 && (
            <span className="w-4 h-4 rounded-full bg-white text-blue-600 text-[10px] font-bold flex items-center justify-center">
              {filtrosAtivos}
            </span>
          )}
        </button>
      </div>

      {/* ── Painel de filtros ── */}
      {showFiltros && (
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-4">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
              Regional
            </p>
            <div className="flex flex-wrap gap-2">
              {["todos", ...regionais].map((r) => (
                <button
                  key={r}
                  onClick={() => setFiltroRegional(r)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    filtroRegional === r
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
                  }`}
                >
                  {r === "todos" ? "Todas" : r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
              Propriedade
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "todos", label: "Todos" },
                { value: "proprio", label: "Próprio" },
                { value: "alugado", label: "Alugado" },
              ].map((t) => (
                <button
                  key={t.value}
                  onClick={() => setFiltroTipo(t.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    filtroTipo === t.value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
              Carroceria
            </p>
            <div className="flex flex-wrap gap-2">
              {["todos", ...CARROCERIAS].map((c) => (
                <button
                  key={c}
                  onClick={() => setFiltroCarroceria(c)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    filtroCarroceria === c
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
                  }`}
                >
                  {c === "todos" ? "Todas" : c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
              Status
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "todos", label: "Todos" },
                { value: "em_uso", label: "🟢 Em Uso" },
                { value: "base", label: "🔵 Na Base" },
                { value: "alerta", label: "🔴 Alerta KM" },
              ].map((s) => (
                <button
                  key={s.value}
                  onClick={() => setFiltroStatus(s.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    filtroStatus === s.value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {filtrosAtivos > 0 && (
            <button
              onClick={limparFiltros}
              className="text-xs font-semibold text-red-500 hover:underline"
            >
              ✕ Limpar todos os filtros
            </button>
          )}
        </div>
      )}

      {/* ── Grid de cards ── */}
      {veiculosFiltrados.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-14 text-center">
          <Car size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-400">
            Nenhum veículo encontrado.
          </p>
          {filtrosAtivos > 0 && (
            <button
              onClick={limparFiltros}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {veiculosFiltrados.map((v) => (
            <FSFrotaCard
              key={v.id}
              veiculo={v}
              manutencoes={manutencoes}
              sinistros={sinistros}
              onVerDetalhe={setVeiculoDetalhe}
              onEditar={(v) => {
                setVeiculoEditando(v);
                setShowForm(true);
              }}
              onDeletar={(id) => setShowDelConfirm(id)}
              podeGerenciar={podeGerenciar}
            />
          ))}
        </div>
      )}

      {/* ── Modal: Form veículo ── */}
      {showForm && (
        <FSFrotaForm
          onSubmit={handleSubmitVeiculo}
          onClose={fecharForm}
          veiculoParaEditar={veiculoEditando}
          regionais={regionais}
        />
      )}

      {/* ── Modal: Detalhe ── */}
      {veiculoDetalhe && (
        <FSFrotaDetalhe
          veiculo={veiculoDetalhe}
          colaboradores={colaboradores}
          manutencoes={manutencoes}
          sinistros={sinistros}
          onClose={fecharDetalhe}
          onNovaManutencao={(id) => {
            setManutVeiculoId(id);
            setManutEditando(null);
          }}
          onEditarManutencao={(m) => {
            setManutEditando(m);
            setManutVeiculoId(m.veiculo_id);
          }}
          onDeletarManutencao={deletarManutencao}
          onNovoSinistro={(id) => {
            setSinistVeiculoId(id);
            setSinistEditando(null);
          }}
          onEditarSinistro={(s) => {
            setSinistEditando(s);
            setSinistVeiculoId(s.veiculo_id);
          }}
          onDeletarSinistro={deletarSinistro}
          onAtualizarResponsavel={atualizarResponsavel}
          podeGerenciar={podeGerenciar}
        />
      )}

      {/* ── Modal: Manutenção ── */}
      {manutVeiculoId && (
        <FSFrotaManutencaoForm
          veiculoId={manutVeiculoId}
          manutencaoParaEditar={manutEditando}
          onSubmit={
            manutEditando
              ? (d) => atualizarManutencao(manutEditando.id, d)
              : criarManutencao
          }
          onClose={() => {
            setManutVeiculoId(null);
            setManutEditando(null);
          }}
        />
      )}

      {/* ── Modal: Sinistro ── */}
      {sinistVeiculoId && (
        <FSFrotaSinistroForm
          veiculoId={sinistVeiculoId}
          sinistroParaEditar={sinistEditando}
          onSubmit={
            sinistEditando
              ? (d) => atualizarSinistro(sinistEditando.id, d)
              : criarSinistro
          }
          onClose={() => {
            setSinistVeiculoId(null);
            setSinistEditando(null);
          }}
        />
      )}

      {/* ── Modal: Confirmar exclusão ── */}
      {showDelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-sm p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Car size={22} className="text-red-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 mb-1">Excluir veículo?</p>
                <p className="text-sm text-gray-500 mb-5">
                  O veículo será removido permanentemente.
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
                      await deletarVeiculo(showDelConfirm);
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

export default FSFrotaPage;
