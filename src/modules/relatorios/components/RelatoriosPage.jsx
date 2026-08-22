import { useEffect, useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Map,
  Target,
  Truck,
  UserRound,
  Users,
} from "lucide-react";
import { buscarTodasMetas } from "../../metas/services/metasService";
import { obterMesAtual } from "../../../utils/mes";
import { useAgentes } from "../../../pages/PainelPublico/hooks/useAgentes";
import { useMapaOS } from "../../../pages/Mapa/hooks/useMapaOS";
import { useMatchOS } from "../../../pages/Mapa/hooks/useMatchOS";
import {
  exportAgentesPdf,
  exportAgentesXlsx,
  exportEntregaMesPdf,
  exportEntregaMesXlsx,
  exportMapaPdf,
  exportMapaXlsx,
  exportMatchPdf,
  exportMatchXlsx,
  exportRegionaisPdf,
  exportRegionaisXlsx,
  exportTecnicosPdf,
  exportTecnicosXlsx,
} from "../services/relatoriosExportService";

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

function ActionButton({ onClick, icon: Icon, label, disabled, loading, variant = "light" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
        variant === "primary"
          ? "bg-blue-600 text-white hover:bg-blue-700"
          : "border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
      {label}
    </button>
  );
}

function ReportCard({
  icon: Icon,
  title,
  description,
  pdfDisabled,
  xlsxDisabled,
  onPdf,
  onXlsx,
  loadingKey,
  activeLoading,
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-orange-50 text-blue-700">
          <Icon size={22} />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-black text-slate-900">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <ActionButton
          onClick={onPdf}
          icon={FileText}
          label="Baixar PDF"
          disabled={pdfDisabled}
          loading={activeLoading === `${loadingKey}:pdf`}
          variant="primary"
        />
        <ActionButton
          onClick={onXlsx}
          icon={FileSpreadsheet}
          label="Baixar XLSX"
          disabled={xlsxDisabled}
          loading={activeLoading === `${loadingKey}:xlsx`}
        />
      </div>
    </div>
  );
}

export default function RelatoriosPage() {
  const [mesSelecionado, setMesSelecionado] = useState(() => obterMesAtual() || "Janeiro");
  const [metasData, setMetasData] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeLoading, setActiveLoading] = useState("");

  const agentes = useAgentes(true);
  const mapa = useMapaOS();
  const match = useMatchOS();

  useEffect(() => {
    let active = true;

    async function loadData() {
      setLoading(true);
      try {
        const metas = await buscarTodasMetas(true);
        if (!active) return;
        setMetasData(metas || {});
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, []);

  const dadosMes = metasData[mesSelecionado] || null;
  const dadosAgentesMes = agentes.allData?.[mesSelecionado] || null;

  const resumo = useMemo(
    () => ({
      tecnicos: dadosMes?.technicians?.length || 0,
      regionais: dadosMes?.regionais?.length || 0,
      agentes: dadosAgentesMes?.cidades?.length || 0,
      mapa: mapa.ordens?.length || 0,
      match: match.ordens?.length || 0,
    }),
    [dadosAgentesMes, dadosMes, mapa.ordens, match.ordens],
  );

  async function runExport(key, action) {
    setActiveLoading(key);
    try {
      await action();
    } finally {
      setActiveLoading("");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-[#001a57] via-[#003087] to-[#0d5bcb] px-6 py-6 text-white shadow-lg">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">
              <Download size={12} />
              Central de Relatórios
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight">
              Baixe os relatórios do Painel em um só lugar
            </h1>
            <p className="mt-2 text-sm leading-6 text-white/80">
              Reunimos os principais relatórios operacionais para exportar em PDF ou XLSX:
              técnicos, regionais, entregas do mês, agentes autorizados, match e mapa.
            </p>
          </div>

          <div className="w-full max-w-xs rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
            <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
              Mês base
            </label>
            <select
              value={mesSelecionado}
              onChange={(event) => setMesSelecionado(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-sm font-semibold text-white outline-none"
            >
              {MESES.map((mes) => (
                <option key={mes} value={mes} className="text-slate-900">
                  {mes}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Técnicos", value: resumo.tecnicos, icon: UserRound },
          { label: "Regionais", value: resumo.regionais, icon: Users },
          { label: "Agentes", value: resumo.agentes, icon: Target },
          { label: "Mapa O.S", value: resumo.mapa, icon: Map },
          { label: "Match O.S", value: resumo.match, icon: Truck },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                <item.icon size={18} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {item.label}
                </p>
                <p className="mt-1 text-2xl font-black text-slate-900">
                  {loading ? "—" : item.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <ReportCard
          icon={UserRound}
          title={`Técnicos · ${mesSelecionado}`}
          description="Ranking dos técnicos com total realizado e percentual de meta individual do mês selecionado."
          pdfDisabled={!dadosMes?.technicians?.length}
          xlsxDisabled={!dadosMes?.technicians?.length}
          activeLoading={activeLoading}
          loadingKey="tecnicos"
          onPdf={() =>
            runExport("tecnicos:pdf", () => exportTecnicosPdf(mesSelecionado, dadosMes))
          }
          onXlsx={() =>
            runExport("tecnicos:xlsx", () => exportTecnicosXlsx(mesSelecionado, dadosMes))
          }
        />

        <ReportCard
          icon={Users}
          title={`Regionais · ${mesSelecionado}`}
          description="Resumo por regional com total de retiradas e percentual comparativo da meta de referência."
          pdfDisabled={!dadosMes?.regionais?.length}
          xlsxDisabled={!dadosMes?.regionais?.length}
          activeLoading={activeLoading}
          loadingKey="regionais"
          onPdf={() =>
            runExport("regionais:pdf", () => exportRegionaisPdf(mesSelecionado, dadosMes))
          }
          onXlsx={() =>
            runExport("regionais:xlsx", () => exportRegionaisXlsx(mesSelecionado, dadosMes))
          }
        />

        <ReportCard
          icon={Truck}
          title={`Entrega do Mês · ${mesSelecionado}`}
          description="Fechamento do mês com distribuição por técnico, agente autorizado, loja e regionais, além do diário."
          pdfDisabled={!dadosMes}
          xlsxDisabled={!dadosMes}
          activeLoading={activeLoading}
          loadingKey="entregas"
          onPdf={() =>
            runExport("entregas:pdf", () => exportEntregaMesPdf(mesSelecionado, dadosMes))
          }
          onXlsx={() =>
            runExport("entregas:xlsx", () => exportEntregaMesXlsx(mesSelecionado, dadosMes))
          }
        />

        <ReportCard
          icon={Target}
          title={`Agente Autorizado · ${mesSelecionado}`}
          description="Cidades de agente autorizado com cancelamentos, meta 80%, total realizado e percentual do mês."
          pdfDisabled={!dadosAgentesMes?.cidades?.length}
          xlsxDisabled={!dadosAgentesMes?.cidades?.length}
          activeLoading={activeLoading}
          loadingKey="agentes"
          onPdf={() =>
            runExport("agentes:pdf", () => exportAgentesPdf(mesSelecionado, dadosAgentesMes))
          }
          onXlsx={() =>
            runExport("agentes:xlsx", () => exportAgentesXlsx(mesSelecionado, dadosAgentesMes))
          }
        />

        <ReportCard
          icon={Map}
          title="Mapa O.S"
          description="Ordens abertas do mapa com status, cidade, regional, cliente e endereço resumido."
          pdfDisabled={!mapa.ordens?.length}
          xlsxDisabled={!mapa.ordens?.length}
          activeLoading={activeLoading}
          loadingKey="mapa"
          onPdf={() =>
            runExport("mapa:pdf", () => exportMapaPdf(mapa.ordens, mapa.ultimaAtualizacao))
          }
          onXlsx={() =>
            runExport("mapa:xlsx", () => exportMapaXlsx(mapa.ordens))
          }
        />

        <ReportCard
          icon={FileSpreadsheet}
          title="Match O.S"
          description="Consolidação dos matches por regional e agentes autorizados, com exportação das ordens e do resumo."
          pdfDisabled={!match.ordens?.length}
          xlsxDisabled={!match.ordens?.length}
          activeLoading={activeLoading}
          loadingKey="match"
          onPdf={() =>
            runExport("match:pdf", () => exportMatchPdf(match.ordens, match.ultimaAtualizacao))
          }
          onXlsx={() =>
            runExport("match:xlsx", () => exportMatchXlsx(match.ordens))
          }
        />
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-500">
        Os relatórios de técnicos, regionais, entregas do mês e agentes autorizados usam o mês selecionado acima.
        Já os relatórios de mapa e match exportam a fotografia mais recente disponível no sistema.
      </section>
    </div>
  );
}

