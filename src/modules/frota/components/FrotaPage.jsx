import { useMemo, useState } from "react";
import {
  Car,
  CircleDollarSign,
  ClipboardList,
  Download,
  Fuel,
  MapPin,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  Trash2,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { hasPermission } from "../../../constants/roles";
import Spinner from "../../../components/ui/Spinner";
import { useFrota } from "../hooks/useFrota";
import { useColaboradores } from "../../colaboradores/hooks/useColaboradores";
import { useRegionais } from "../../regionais/hooks/useRegionais";
import FrotaAlertBanner from "./FrotaAlertBanner";
import VeiculoForm from "./VeiculoForm";
import AbastecimentoForm from "./AbastecimentoForm";
import MultaForm from "./MultaForm";
import SinistroForm from "./SinistroForm";

function parseDate(value) {
  if (!value) return null;
  if (value?.seconds) return new Date(value.seconds * 1000);
  const raw = String(value).trim().split(" ")[0];
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  const date = parseDate(value);
  return date ? date.toLocaleDateString("pt-BR") : "—";
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function number(value) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function monthCurrent(value) {
  const date = parseDate(value);
  if (!date) return false;
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function toCsvLine(values) {
  return values
    .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
    .join(";");
}

function statusTone(status) {
  if (status === "manutencao") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "parado") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function multaTone(status) {
  if (status === "paga") return "bg-emerald-100 text-emerald-700";
  if (status === "recurso") return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

function sinistroTone(status) {
  if (status === "resolvido") return "bg-emerald-100 text-emerald-700";
  if (status === "analise") return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

const TABS = [
  { id: "overview", label: "Dashboard Executivo" },
  { id: "veiculos", label: "Veiculos" },
  { id: "abastecimentos", label: "Abastecimentos" },
  { id: "multas", label: "Central de Multas" },
  { id: "sinistros", label: "Central de Sinistros" },
];

function MetricCard({ icon, title, value, helper, tone = "blue" }) {
  const IconComponent = icon;
  const tones = {
    blue: "from-blue-600 to-cyan-500",
    emerald: "from-emerald-600 to-teal-500",
    amber: "from-amber-500 to-orange-500",
    rose: "from-rose-600 to-pink-500",
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tones[tone]}`} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{value}</p>
          <p className="mt-2 text-xs text-slate-500">{helper}</p>
        </div>
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${tones[tone]} text-white shadow-lg`}>
            <IconComponent size={20} />
          </div>
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, action, children, className = "" }) {
  return (
    <div className={`rounded-3xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function VinculoVeiculo({ veiculo, colaboradores, onAtualizar }) {
  const [modo, setModo] = useState(null);
  const [valor, setValor] = useState("");
  const tecnico = colaboradores.find((item) => item.id === veiculo.tecnico_id)?.nome;

  const salvar = async () => {
    if (modo === "tecnico") {
      await onAtualizar(veiculo.id, { tecnico_id: valor, base_parado: null });
    } else {
      await onAtualizar(veiculo.id, { tecnico_id: null, base_parado: valor });
    }
    setModo(null);
    setValor("");
  };

  if (modo) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {modo === "tecnico" ? (
          <select value={valor} onChange={(e) => setValor(e.target.value)} className="input-field flex-1 py-2 text-xs">
            <option value="">Selecione...</option>
            {colaboradores.map((colaborador) => (
              <option key={colaborador.id} value={colaborador.id}>
                {colaborador.nome}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Nome da base..."
            className="input-field flex-1 py-2 text-xs"
          />
        )}
        <button onClick={salvar} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
          Salvar
        </button>
        <button onClick={() => setModo(null)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200">
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {veiculo.tecnico_id ? <p className="text-xs font-medium text-emerald-700">Tecnico: {tecnico ?? "—"}</p> : null}
      {veiculo.base_parado ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-blue-600">
          <MapPin size={12} />
          {veiculo.base_parado}
        </p>
      ) : null}
      {!veiculo.tecnico_id && !veiculo.base_parado ? <p className="text-xs italic text-slate-400">Sem vinculo</p> : null}
      <div className="flex gap-2 pt-1">
        <button onClick={() => setModo("tecnico")} className="rounded-xl border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100">
          Tecnico
        </button>
        <button onClick={() => setModo("base")} className="rounded-xl border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100">
          Base
        </button>
      </div>
    </div>
  );
}

export default function FrotaPage() {
  const { currentUser } = useAuthContext();
  const {
    veiculos,
    abastecimentos,
    multas,
    sinistros,
    veiculosAlerta,
    loading,
    error,
    cadastrar,
    atualizar,
    deletar,
    salvarAbastecimento,
    excluirAbastecimento,
    salvarMulta,
    excluirMulta,
    salvarSinistro,
    excluirSinistro,
    carregar,
  } = useFrota();
  const { colaboradores } = useColaboradores();
  const { regionais } = useRegionais();

  const [abaAtiva, setAbaAtiva] = useState("overview");
  const [showVeiculoForm, setShowVeiculoForm] = useState(false);
  const [showAbastecimentoForm, setShowAbastecimentoForm] = useState(false);
  const [showMultaForm, setShowMultaForm] = useState(false);
  const [showSinistroForm, setShowSinistroForm] = useState(false);
  const [veiculoEditando, setVeiculoEditando] = useState(null);
  const [abastecimentoEditando, setAbastecimentoEditando] = useState(null);
  const [multaEditando, setMultaEditando] = useState(null);
  const [sinistroEditando, setSinistroEditando] = useState(null);
  const [confirmarDel, setConfirmarDel] = useState(null);
  const [confirmarDelTipo, setConfirmarDelTipo] = useState(null);

  const podeGerenciar = hasPermission(currentUser?.role, "manage_veiculos");
  const colaboradoresOrdenados = useMemo(
    () => [...colaboradores].sort((a, b) => String(a?.nome || "").localeCompare(String(b?.nome || ""), "pt-BR")),
    [colaboradores],
  );
  const regionaisOrdenadas = useMemo(
    () => [...regionais].sort((a, b) => String(a?.nome || "").localeCompare(String(b?.nome || ""), "pt-BR")),
    [regionais],
  );
  const veiculosMap = useMemo(() => Object.fromEntries(veiculos.map((veiculo) => [veiculo.id, veiculo])), [veiculos]);

  const abastecimentosMes = useMemo(
    () => abastecimentos.filter((item) => monthCurrent(item.data)),
    [abastecimentos],
  );
  const multasMes = useMemo(() => multas.filter((item) => monthCurrent(item.data)), [multas]);
  const sinistrosMes = useMemo(() => sinistros.filter((item) => monthCurrent(item.data)), [sinistros]);

  const dashboard = useMemo(() => {
    const custoAbastecimentoMes = abastecimentosMes.reduce((acc, item) => acc + Number(item.valor || 0), 0);
    const custoMultasMes = multasMes.reduce((acc, item) => acc + Number(item.valor || 0), 0);
    const custoSinistrosMes = sinistrosMes.reduce((acc, item) => acc + Number(item.valor_estimado || 0), 0);
    const ativos = veiculos.filter((veiculo) => (veiculo.status || "ativo") === "ativo").length;
    const emManutencao = veiculos.filter((veiculo) => veiculo.status === "manutencao").length;
    const parados = veiculos.filter((veiculo) => veiculo.status === "parado").length;
    const mediaKm = veiculos.length
      ? Math.round(veiculos.reduce((acc, veiculo) => acc + Number(veiculo.km_atual || 0), 0) / veiculos.length)
      : 0;

    return {
      ativos,
      emManutencao,
      parados,
      alertasManutencao: veiculosAlerta.length,
      multasAbertas: multas.filter((item) => item.status === "aberta").length,
      sinistrosAbertos: sinistros.filter((item) => item.status !== "resolvido").length,
      custoAbastecimentoMes,
      custoMultasMes,
      custoSinistrosMes,
      custoTotalMes: custoAbastecimentoMes + custoMultasMes + custoSinistrosMes,
      mediaKm,
    };
  }, [abastecimentosMes, multas, multasMes, sinistros, sinistrosMes, veiculos, veiculosAlerta]);

  const topCustos = useMemo(() => {
    const custoAbastecimento = abastecimentosMes.reduce((acc, item) => {
      acc[item.veiculo_id] = (acc[item.veiculo_id] || 0) + Number(item.valor || 0);
      return acc;
    }, {});
    const custoMultas = multasMes.reduce((acc, item) => {
      acc[item.veiculo_id] = (acc[item.veiculo_id] || 0) + Number(item.valor || 0);
      return acc;
    }, {});
    const custoSinistros = sinistrosMes.reduce((acc, item) => {
      acc[item.veiculo_id] = (acc[item.veiculo_id] || 0) + Number(item.valor_estimado || 0);
      return acc;
    }, {});

    return veiculos
      .map((veiculo) => {
        const abastecimento = custoAbastecimento[veiculo.id] || 0;
        const multa = custoMultas[veiculo.id] || 0;
        const sinistro = custoSinistros[veiculo.id] || 0;
        return {
          ...veiculo,
          abastecimento,
          multa,
          sinistro,
          custoMes: abastecimento + multa + sinistro,
        };
      })
      .sort((a, b) => b.custoMes - a.custoMes)
      .slice(0, 5);
  }, [abastecimentosMes, multasMes, sinistrosMes, veiculos]);

  const abastecimentosRecentes = useMemo(
    () =>
      [...abastecimentos]
        .sort((a, b) => (parseDate(b.data)?.getTime() || 0) - (parseDate(a.data)?.getTime() || 0))
        .slice(0, 6),
    [abastecimentos],
  );

  const multasCriticas = useMemo(
    () =>
      [...multas]
        .filter((item) => item.status !== "paga")
        .sort(
          (a, b) =>
            (parseDate(a.vencimento || a.data)?.getTime() || Number.MAX_SAFE_INTEGER) -
            (parseDate(b.vencimento || b.data)?.getTime() || Number.MAX_SAFE_INTEGER),
        )
        .slice(0, 6),
    [multas],
  );

  const sinistrosCriticos = useMemo(
    () =>
      [...sinistros]
        .filter((item) => item.status !== "resolvido")
        .sort((a, b) => (parseDate(b.data)?.getTime() || 0) - (parseDate(a.data)?.getTime() || 0))
        .slice(0, 6),
    [sinistros],
  );

  const regionalStats = useMemo(() => {
    const map = {};
    veiculos.forEach((veiculo) => {
      const key = veiculo.regional || "Sem regional";
      if (!map[key]) {
        map[key] = {
          nome: key,
          veiculos: 0,
          manutencao: 0,
          parados: 0,
          abastecimento: 0,
          multas: 0,
          sinistros: 0,
        };
      }
      map[key].veiculos += 1;
      if (veiculo.status === "manutencao") map[key].manutencao += 1;
      if (veiculo.status === "parado") map[key].parados += 1;
    });
    abastecimentosMes.forEach((item) => {
      const veiculo = veiculosMap[item.veiculo_id];
      const key = veiculo?.regional || "Sem regional";
      if (!map[key]) map[key] = { nome: key, veiculos: 0, manutencao: 0, parados: 0, abastecimento: 0, multas: 0, sinistros: 0 };
      map[key].abastecimento += Number(item.valor || 0);
    });
    multasMes.forEach((item) => {
      const veiculo = veiculosMap[item.veiculo_id];
      const key = veiculo?.regional || "Sem regional";
      if (!map[key]) map[key] = { nome: key, veiculos: 0, manutencao: 0, parados: 0, abastecimento: 0, multas: 0, sinistros: 0 };
      map[key].multas += Number(item.valor || 0);
    });
    sinistrosMes.forEach((item) => {
      const veiculo = veiculosMap[item.veiculo_id];
      const key = item.regional || veiculo?.regional || "Sem regional";
      if (!map[key]) map[key] = { nome: key, veiculos: 0, manutencao: 0, parados: 0, abastecimento: 0, multas: 0, sinistros: 0 };
      map[key].sinistros += Number(item.valor_estimado || 0);
    });
    return Object.values(map)
      .map((item) => ({ ...item, custoTotal: item.abastecimento + item.multas + item.sinistros }))
      .sort((a, b) => b.custoTotal - a.custoTotal);
  }, [abastecimentosMes, multasMes, sinistrosMes, veiculos, veiculosMap]);

  const exportarRelatorio = () => {
    const linhas = [
      toCsvLine(["Secao", "Campo", "Valor"]),
      toCsvLine(["Resumo", "Veiculos ativos", dashboard.ativos]),
      toCsvLine(["Resumo", "Em manutencao", dashboard.emManutencao]),
      toCsvLine(["Resumo", "Parados", dashboard.parados]),
      toCsvLine(["Resumo", "Alertas de manutencao", dashboard.alertasManutencao]),
      toCsvLine(["Resumo", "Multas abertas", dashboard.multasAbertas]),
      toCsvLine(["Resumo", "Sinistros abertos", dashboard.sinistrosAbertos]),
      toCsvLine(["Resumo", "Custo abastecimento mes", dashboard.custoAbastecimentoMes]),
      toCsvLine(["Resumo", "Custo multas mes", dashboard.custoMultasMes]),
      toCsvLine(["Resumo", "Custo sinistros mes", dashboard.custoSinistrosMes]),
      toCsvLine(["Resumo", "Custo total mes", dashboard.custoTotalMes]),
      "",
      toCsvLine(["Veiculos", "Placa", "Modelo", "Status", "Regional", "Responsavel", "KM atual", "Proxima manutencao"]),
      ...veiculos.map((veiculo) =>
        toCsvLine(["Veiculo", veiculo.placa, veiculo.modelo, veiculo.status || "ativo", veiculo.regional || "", veiculo.responsavel || "", veiculo.km_atual || 0, veiculo.km_proxima_manutencao || 0]),
      ),
      "",
      toCsvLine(["Abastecimentos", "Veiculo", "Data", "Motorista", "Posto", "Litros", "Valor", "KM"]),
      ...abastecimentos.map((item) =>
        toCsvLine(["Abastecimento", veiculosMap[item.veiculo_id]?.placa || "", formatDate(item.data), item.motorista || "", item.posto || "", item.litros || 0, item.valor || 0, item.km || 0]),
      ),
      "",
      toCsvLine(["Multas", "Veiculo", "Data", "Vencimento", "Descricao", "Responsavel", "Status", "Valor"]),
      ...multas.map((item) =>
        toCsvLine(["Multa", veiculosMap[item.veiculo_id]?.placa || "", formatDate(item.data), formatDate(item.vencimento), item.descricao || "", item.responsavel || "", item.status || "", item.valor || 0]),
      ),
      "",
      toCsvLine(["Sinistros", "Veiculo", "Data", "Tipo", "Status", "Regional", "Responsavel", "Valor estimado"]),
      ...sinistros.map((item) =>
        toCsvLine(["Sinistro", veiculosMap[item.veiculo_id]?.placa || "", formatDate(item.data), item.tipo || "", item.status || "", item.regional || "", item.responsavel || "", item.valor_estimado || 0]),
      ),
    ];

    const blob = new Blob(["\uFEFF" + linhas.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute("download", `relatorio-frota-${stamp}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const excluirRegistro = async () => {
    if (confirmarDelTipo === "veiculo") await deletar(confirmarDel.id);
    if (confirmarDelTipo === "abastecimento") await excluirAbastecimento(confirmarDel.id);
    if (confirmarDelTipo === "multa") await excluirMulta(confirmarDel.id);
    if (confirmarDelTipo === "sinistro") await excluirSinistro(confirmarDel.id);
    setConfirmarDel(null);
    setConfirmarDelTipo(null);
  };

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
        <div className="bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.25),_transparent_35%),linear-gradient(135deg,#0f172a,#1d4ed8_60%,#0ea5e9)] px-6 py-7 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-100">Gestao de frota</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight">Painel executivo, multas, abastecimentos e sinistros</h1>
              <p className="mt-3 max-w-2xl text-sm text-blue-100">
                Uma visao mais limpa para a gestao acompanhar custo, risco, disponibilidade da frota e registrar ocorrencias em um unico lugar.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={carregar} className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15">
                <RefreshCw size={16} />
                Atualizar
              </button>
              <button onClick={exportarRelatorio} className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-lg hover:bg-slate-100">
                <Download size={16} />
                Exportar relatorio
              </button>
              {podeGerenciar ? (
                <>
                  <button onClick={() => { setVeiculoEditando(null); setShowVeiculoForm(true); }} className="flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600">
                    <Plus size={16} />
                    Veiculo
                  </button>
                  <button onClick={() => { setAbastecimentoEditando(null); setShowAbastecimentoForm(true); }} className="flex items-center gap-2 rounded-2xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600">
                    <Plus size={16} />
                    Abastecimento
                  </button>
                  <button onClick={() => { setMultaEditando(null); setShowMultaForm(true); }} className="flex items-center gap-2 rounded-2xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-600">
                    <Plus size={16} />
                    Multa
                  </button>
                  <button onClick={() => { setSinistroEditando(null); setShowSinistroForm(true); }} className="flex items-center gap-2 rounded-2xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-600">
                    <Plus size={16} />
                    Sinistro
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="flex w-fit flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setAbaAtiva(tab.id)}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
              abaAtiva === tab.id ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <FrotaAlertBanner veiculos={veiculosAlerta} />
      {error ? <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div> : null}

      {abaAtiva === "overview" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard icon={Car} title="Veiculos ativos" value={dashboard.ativos} helper={`${dashboard.parados} parado(s) e ${dashboard.emManutencao} em manutencao`} tone="blue" />
            <MetricCard icon={Wrench} title="Alertas de manutencao" value={dashboard.alertasManutencao} helper="Veiculos proximos do limite de revisao" tone="amber" />
            <MetricCard icon={ReceiptText} title="Multas abertas" value={dashboard.multasAbertas} helper="Pendencias em aberto no modulo" tone="rose" />
            <MetricCard icon={ShieldAlert} title="Sinistros em aberto" value={dashboard.sinistrosAbertos} helper="Ocorrencias que ainda exigem acompanhamento" tone="amber" />
            <MetricCard icon={CircleDollarSign} title="Custo total do mes" value={money(dashboard.custoTotalMes)} helper={`${money(dashboard.custoAbastecimentoMes)} abastecimento · ${money(dashboard.custoMultasMes)} multas · ${money(dashboard.custoSinistrosMes)} sinistros`} tone="emerald" />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr,0.75fr]">
            <SectionCard title="Radar operacional da frota" subtitle="Leitura rapida por regional, custo e disponibilidade">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-3xl bg-slate-950 p-5 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Resumo do dia</p>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                      <span className="text-sm text-slate-300">Media de KM da frota</span>
                      <span className="text-lg font-black">{number(dashboard.mediaKm)} km</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                      <span className="text-sm text-slate-300">Abastecimentos do mes</span>
                      <span className="text-lg font-black">{abastecimentosMes.length}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                      <span className="text-sm text-slate-300">Sinistros do mes</span>
                      <span className="text-lg font-black">{sinistrosMes.length}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Maior pressao financeira</p>
                  <div className="mt-4 space-y-3">
                    {topCustos.length ? topCustos.map((item) => (
                      <div key={item.id} className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{item.placa} · {item.modelo}</p>
                            <p className="mt-1 text-xs text-slate-400">{item.regional || "Sem regional"}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-slate-900">{money(item.custoMes)}</p>
                            <p className="mt-1 text-[11px] text-slate-400">Mes atual</p>
                          </div>
                        </div>
                      </div>
                    )) : <p className="text-sm text-slate-400">Sem custo registrado no mes.</p>}
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Paineis rapidos" subtitle="Ocorrencias que pedem atencao imediata">
              <div className="space-y-4">
                <div className="rounded-3xl border border-orange-100 bg-orange-50 p-4">
                  <div className="flex items-center gap-2">
                    <Fuel size={16} className="text-orange-600" />
                    <p className="text-sm font-bold text-orange-900">Ultimos abastecimentos</p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {abastecimentosRecentes.length ? abastecimentosRecentes.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2.5">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{veiculosMap[item.veiculo_id]?.placa || "Sem veiculo"}</p>
                          <p className="text-[11px] text-slate-400">{item.motorista || "Sem responsavel"} · {formatDate(item.data)}</p>
                        </div>
                        <span className="text-sm font-black text-orange-600">{money(item.valor)}</span>
                      </div>
                    )) : <p className="text-sm text-orange-700">Nenhum abastecimento registrado.</p>}
                  </div>
                </div>

                <div className="rounded-3xl border border-rose-100 bg-rose-50 p-4">
                  <div className="flex items-center gap-2">
                    <ShieldAlert size={16} className="text-rose-600" />
                    <p className="text-sm font-bold text-rose-900">Sinistros e multas em foco</p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {[...sinistrosCriticos.slice(0, 3), ...multasCriticas.slice(0, 3)].length ? (
                      <>
                        {sinistrosCriticos.slice(0, 3).map((item) => (
                          <div key={item.id} className="rounded-2xl bg-white px-3 py-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{item.tipo || "Sinistro"} · {veiculosMap[item.veiculo_id]?.placa || "Sem veiculo"}</p>
                                <p className="text-[11px] text-slate-400">{item.regional || "Sem regional"} · {formatDate(item.data)}</p>
                              </div>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${sinistroTone(item.status)}`}>{item.status || "aberto"}</span>
                            </div>
                          </div>
                        ))}
                        {multasCriticas.slice(0, 3).map((item) => (
                          <div key={item.id} className="rounded-2xl bg-white px-3 py-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{item.descricao}</p>
                                <p className="text-[11px] text-slate-400">{veiculosMap[item.veiculo_id]?.placa || "Sem veiculo"} · vencimento {formatDate(item.vencimento || item.data)}</p>
                              </div>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${multaTone(item.status)}`}>{item.status || "aberta"}</span>
                            </div>
                          </div>
                        ))}
                      </>
                    ) : <p className="text-sm text-rose-700">Nenhuma ocorrencia critica no momento.</p>}
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr,1.05fr]">
            <SectionCard title="Custo por regional" subtitle="Distribuicao dos gastos do mes por area">
              <div className="space-y-4">
                {regionalStats.length ? regionalStats.map((item) => {
                  const max = regionalStats[0]?.custoTotal || 1;
                  const width = `${Math.max((item.custoTotal / max) * 100, item.custoTotal ? 8 : 0)}%`;
                  return (
                    <div key={item.nome} className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{item.nome}</p>
                          <p className="text-xs text-slate-400">{item.veiculos} veiculo(s) · {item.manutencao} em manutencao · {item.parados} parados</p>
                        </div>
                        <span className="text-sm font-black text-slate-900">{money(item.custoTotal)}</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500" style={{ width }} />
                      </div>
                    </div>
                  );
                }) : <p className="text-sm text-slate-400">Nenhuma regional com dados financeiros no mes.</p>}
              </div>
            </SectionCard>

            <SectionCard title="Direcionamento executivo" subtitle="Leitura pronta para tomada de decisao">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center gap-2">
                    <TriangleAlert size={16} className="text-amber-500" />
                    <p className="text-sm font-bold text-slate-900">Pontos de atencao</p>
                  </div>
                  <ul className="mt-4 space-y-3 text-sm text-slate-600">
                    <li>{dashboard.alertasManutencao} veiculo(s) proximos da manutencao.</li>
                    <li>{dashboard.multasAbertas} multa(s) exigindo tratativa.</li>
                    <li>{dashboard.sinistrosAbertos} sinistro(s) ainda sem encerramento.</li>
                    <li>{dashboard.parados} veiculo(s) fora de operacao.</li>
                  </ul>
                </div>
                <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                  <div className="flex items-center gap-2">
                    <ClipboardList size={16} className="text-emerald-600" />
                    <p className="text-sm font-bold text-slate-900">Leitura do mes</p>
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-slate-700">
                    <p>Abastecimentos registrados: <strong>{abastecimentosMes.length}</strong></p>
                    <p>Custo total consolidado: <strong>{money(dashboard.custoTotalMes)}</strong></p>
                    <p>Regional com maior custo: <strong>{regionalStats[0]?.nome || "Sem leitura"}</strong></p>
                    <p>Veiculo mais pressionado: <strong>{topCustos[0]?.placa || "Sem leitura"}</strong></p>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      ) : null}

      {abaAtiva === "veiculos" ? (
        veiculos.length ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
            {veiculos.map((veiculo) => {
              const alerta = veiculosAlerta.some((item) => item.id === veiculo.id);
              return (
                <div key={veiculo.id} className={`overflow-hidden rounded-3xl border bg-white shadow-sm ${alerta ? "border-amber-200" : "border-slate-200"}`}>
                  <div className={`h-1 w-full ${alerta ? "bg-amber-400" : "bg-blue-500"}`} />
                  <div className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${alerta ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>
                          <Car size={18} />
                        </div>
                        <div>
                          <p className="text-base font-bold text-slate-900">{veiculo.placa}</p>
                          <p className="text-sm text-slate-400">{veiculo.modelo}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${statusTone(veiculo.status || "ativo")}`}>{veiculo.status || "ativo"}</span>
                        {podeGerenciar ? (
                          <>
                            <button onClick={() => { setVeiculoEditando(veiculo); setShowVeiculoForm(true); }} className="rounded-xl p-2 text-slate-400 hover:bg-orange-50 hover:text-orange-600">
                              <Pencil size={15} />
                            </button>
                            <button onClick={() => { setConfirmarDel(veiculo); setConfirmarDelTipo("veiculo"); }} className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                              <Trash2 size={15} />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">KM atual</p>
                        <p className="mt-2 text-lg font-black text-slate-900">{number(veiculo.km_atual)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ult. revisao</p>
                        <p className="mt-2 text-lg font-black text-slate-900">{number(veiculo.km_ultima_revisao)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Prox. manut.</p>
                        <p className="mt-2 text-lg font-black text-slate-900">{number(veiculo.km_proxima_manutencao)}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                      <p><strong>Regional:</strong> {veiculo.regional || "Nao informada"}</p>
                      <p className="mt-1.5"><strong>Responsavel:</strong> {veiculo.responsavel || "Nao informado"}</p>
                      {veiculo.observacao ? <p className="mt-1.5"><strong>Observacao:</strong> {veiculo.observacao}</p> : null}
                    </div>

                    <div className="rounded-2xl border border-slate-100 p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Vinculo operacional</p>
                      <VinculoVeiculo veiculo={veiculo} colaboradores={colaboradoresOrdenados} onAtualizar={atualizar} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-14 text-center shadow-sm">
            <Car size={34} className="mx-auto mb-4 text-slate-200" />
            <p className="text-sm text-slate-400">Nenhum veiculo cadastrado.</p>
          </div>
        )
      ) : null}

      {abaAtiva === "abastecimentos" ? (
        <SectionCard
          title="Controle de abastecimentos"
          subtitle="Historico completo de gastos e registros de combustivel"
          action={<span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">{abastecimentos.length} registro(s)</span>}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-[0.16em] text-slate-400">
                  {["Veiculo", "Data", "Motorista", "Posto", "Litros", "Valor", "KM", "Comprovante", "Acoes"].map((header) => (
                    <th key={header} className="pb-3 pr-4">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {abastecimentos.map((item) => (
                  <tr key={item.id} className="border-b border-slate-50">
                    <td className="py-3 pr-4 font-semibold text-slate-900">{veiculosMap[item.veiculo_id] ? `${veiculosMap[item.veiculo_id].placa} · ${veiculosMap[item.veiculo_id].modelo}` : "Sem veiculo"}</td>
                    <td className="py-3 pr-4 text-slate-500">{formatDate(item.data)}</td>
                    <td className="py-3 pr-4 text-slate-600">{item.motorista || "—"}</td>
                    <td className="py-3 pr-4 text-slate-600">{item.posto || "—"}</td>
                    <td className="py-3 pr-4 font-bold text-blue-600">{number(item.litros)}</td>
                    <td className="py-3 pr-4 font-bold text-orange-600">{money(item.valor)}</td>
                    <td className="py-3 pr-4 text-slate-600">{number(item.km)}</td>
                    <td className="py-3 pr-4 text-slate-500">{item.comprovante || "—"}</td>
                    <td className="py-3 pr-0">
                      {podeGerenciar ? (
                        <div className="flex gap-1">
                          <button onClick={() => { setAbastecimentoEditando(item); setShowAbastecimentoForm(true); }} className="rounded-xl p-2 text-slate-400 hover:bg-orange-50 hover:text-orange-600">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => { setConfirmarDel(item); setConfirmarDelTipo("abastecimento"); }} className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {abaAtiva === "multas" ? (
        <SectionCard
          title="Central de multas"
          subtitle="Controle de pendencias, recurso e pagamento"
          action={<span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">{multas.length} registro(s)</span>}
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {multas.map((item) => (
              <div key={item.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{item.descricao}</p>
                    <p className="mt-1 text-xs text-slate-400">{veiculosMap[item.veiculo_id]?.placa || "Sem veiculo"} · {formatDate(item.data)}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${multaTone(item.status)}`}>{item.status || "aberta"}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Valor</p>
                    <p className="mt-2 text-lg font-black text-rose-600">{money(item.valor)}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Vencimento</p>
                    <p className="mt-2 text-sm font-black text-slate-900">{formatDate(item.vencimento || item.data)}</p>
                  </div>
                </div>
                <div className="mt-4 text-sm text-slate-600">
                  <p><strong>Responsavel:</strong> {item.responsavel || "Nao informado"}</p>
                  {item.observacao ? <p className="mt-1.5"><strong>Observacao:</strong> {item.observacao}</p> : null}
                </div>
                {podeGerenciar ? (
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => { setMultaEditando(item); setShowMultaForm(true); }} className="flex-1 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                      Editar
                    </button>
                    <button onClick={() => { setConfirmarDel(item); setConfirmarDelTipo("multa"); }} className="rounded-xl bg-rose-500 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-600">
                      Excluir
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {abaAtiva === "sinistros" ? (
        <SectionCard
          title="Central de sinistros"
          subtitle="Ocorrencias da frota, status de tratativa e impacto financeiro"
          action={<span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{sinistros.length} registro(s)</span>}
        >
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.8fr,1.2fr]">
            <div className="space-y-4">
              <div className="rounded-3xl bg-violet-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Indicadores</p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                    <span className="text-sm text-slate-600">Sinistros abertos</span>
                    <span className="text-lg font-black text-violet-700">{dashboard.sinistrosAbertos}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                    <span className="text-sm text-slate-600">Sinistros no mes</span>
                    <span className="text-lg font-black text-violet-700">{sinistrosMes.length}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                    <span className="text-sm text-slate-600">Impacto estimado no mes</span>
                    <span className="text-lg font-black text-violet-700">{money(dashboard.custoSinistrosMes)}</span>
                  </div>
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 p-5">
                <p className="text-sm font-bold text-slate-900">Ultimas ocorrencias</p>
                <div className="mt-4 space-y-3">
                  {sinistrosCriticos.length ? sinistrosCriticos.map((item) => (
                    <div key={item.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{item.tipo || "Sinistro"} · {veiculosMap[item.veiculo_id]?.placa || "Sem veiculo"}</p>
                          <p className="text-[11px] text-slate-400">{item.regional || "Sem regional"} · {formatDate(item.data)}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${sinistroTone(item.status)}`}>{item.status || "aberto"}</span>
                      </div>
                    </div>
                  )) : <p className="text-sm text-slate-400">Nenhum sinistro pendente.</p>}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {sinistros.map((item) => (
                <div key={item.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                          <ShieldAlert size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{item.tipo || "Sinistro"} · {veiculosMap[item.veiculo_id]?.placa || "Sem veiculo"}</p>
                          <p className="text-xs text-slate-400">{formatDate(item.data)} · {item.regional || "Sem regional"}</p>
                        </div>
                      </div>
                      <p className="mt-4 text-sm text-slate-600">{item.descricao}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${sinistroTone(item.status)}`}>{item.status || "aberto"}</span>
                      {podeGerenciar ? (
                        <>
                          <button onClick={() => { setSinistroEditando(item); setShowSinistroForm(true); }} className="rounded-xl p-2 text-slate-400 hover:bg-orange-50 hover:text-orange-600">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => { setConfirmarDel(item); setConfirmarDelTipo("sinistro"); }} className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                            <Trash2 size={15} />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Valor estimado</p>
                      <p className="mt-2 text-lg font-black text-violet-700">{money(item.valor_estimado)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Franquia</p>
                      <p className="mt-2 text-lg font-black text-slate-900">{money(item.franquia)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Responsavel</p>
                      <p className="mt-2 text-sm font-black text-slate-900">{item.responsavel || "Nao informado"}</p>
                    </div>
                  </div>

                  {item.observacao ? <p className="mt-4 text-sm text-slate-500"><strong>Observacao:</strong> {item.observacao}</p> : null}
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      ) : null}

      {showVeiculoForm ? (
        <VeiculoForm
          inicial={veiculoEditando}
          colaboradores={colaboradoresOrdenados}
          regionais={regionaisOrdenadas}
          onSubmit={async (dados) => {
            if (veiculoEditando) await atualizar(veiculoEditando.id, dados);
            else await cadastrar(dados);
          }}
          onClose={() => {
            setShowVeiculoForm(false);
            setVeiculoEditando(null);
          }}
        />
      ) : null}

      {showAbastecimentoForm ? (
        <AbastecimentoForm
          veiculos={veiculos}
          colaboradores={colaboradoresOrdenados}
          inicial={abastecimentoEditando}
          onSubmit={(dados) => salvarAbastecimento(dados, abastecimentoEditando?.id || null)}
          onClose={() => {
            setShowAbastecimentoForm(false);
            setAbastecimentoEditando(null);
          }}
        />
      ) : null}

      {showMultaForm ? (
        <MultaForm
          veiculos={veiculos}
          colaboradores={colaboradoresOrdenados}
          inicial={multaEditando}
          onSubmit={(dados) => salvarMulta(dados, multaEditando?.id || null)}
          onClose={() => {
            setShowMultaForm(false);
            setMultaEditando(null);
          }}
        />
      ) : null}

      {showSinistroForm ? (
        <SinistroForm
          veiculos={veiculos}
          colaboradores={colaboradoresOrdenados}
          regionais={regionaisOrdenadas}
          inicial={sinistroEditando}
          onSubmit={(dados) => salvarSinistro(dados, sinistroEditando?.id || null)}
          onClose={() => {
            setShowSinistroForm(false);
            setSinistroEditando(null);
          }}
        />
      ) : null}

      {confirmarDel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50">
              <Trash2 size={18} className="text-rose-500" />
            </div>
            <h3 className="text-center text-base font-bold text-slate-900">Excluir registro?</h3>
            <p className="mt-2 text-center text-sm text-slate-500">Essa acao remove permanentemente o item selecionado.</p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setConfirmarDel(null);
                  setConfirmarDelTipo(null);
                }}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button onClick={excluirRegistro} className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700">
                Excluir
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
