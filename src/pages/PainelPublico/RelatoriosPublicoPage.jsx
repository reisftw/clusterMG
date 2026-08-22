import { useMemo, useState } from "react";
import {
  FileSpreadsheet,
  FileText,
  Map,
  Target,
  Truck,
  UserRound,
  Users,
} from "lucide-react";
import PainelMapaNav from "./components/PainelMapaNav";
import PublicPageLoading from "./components/PublicPageLoading";
import { useRetiradas } from "./hooks/useRetiradas";
import { useAgentes } from "./hooks/useAgentes";
import { useMatchPublico } from "./hooks/useMatchPublico";
import { useDashboardData } from "./hooks/useDashboardData";
import { obterMesAtual } from "../../utils/mes";
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
} from "../../modules/relatorios/services/relatoriosExportService";
import { resolveVpsDate } from "../../services/vpsDate";

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

function formatLastUpdate(value) {
  const raw =
    value?.texto ||
    value?.lastUpdate ||
    value?.updatedAt ||
    value?.data ||
    value?.ultimaAtualizacao ||
    value ||
    null;

  if (!raw) return "Nunca atualizado";

  if (typeof raw === "string") {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return raw;
  }

  const date = resolveVpsDate(raw);
  if (!date) return "Nunca atualizado";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SummaryCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <Icon size={20} />
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            {label}
          </div>
          <div className="mt-1 text-3xl font-black leading-none text-slate-900">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportButton({
  icon: Icon,
  label,
  disabled,
  active,
  onClick,
  variant = "secondary",
}) {
  const baseClass =
    "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all";

  const variantClass =
    variant === "primary"
      ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700 hover:border-blue-700"
      : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || active}
      className={`${baseClass} ${variantClass} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <Icon size={16} className={active ? "animate-pulse" : ""} />
      {active ? "Gerando..." : label}
    </button>
  );
}

function ReportCard({
  icon: Icon,
  title,
  description,
  note,
  disabled,
  loadingPdf,
  loadingXlsx,
  onPdf,
  onXlsx,
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-orange-50 text-blue-700">
          <Icon size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-black tracking-tight text-slate-900">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          {note ? (
            <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-medium leading-5 text-slate-500">
              {note}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <ExportButton
          icon={FileText}
          label="Baixar PDF"
          disabled={disabled}
          active={loadingPdf}
          onClick={onPdf}
          variant="primary"
        />
        <ExportButton
          icon={FileSpreadsheet}
          label="Baixar XLSX"
          disabled={disabled}
          active={loadingXlsx}
          onClick={onXlsx}
        />
      </div>
    </section>
  );
}

export default function RelatoriosPublicoPage() {
  const [month, setMonth] = useState(() => obterMesAtual() || "Janeiro");
  const [activeLoading, setActiveLoading] = useState("");
  const retiradas = useRetiradas(true);
  const agentes = useAgentes(true);
  const match = useMatchPublico();
  const { data, loading, error } = useDashboardData();

  const dadosMes = retiradas.allData?.[month] || null;
  const dadosAgentesMes = agentes.allData?.[month] || null;
  const mapaOrdens = data?.mapa?.ordens || [];
  const mapaMeta = data?.mapa?.meta || null;
  const matchOrdens = data?.matchOS?.ordens || [];
  const matchMeta = data?.matchOS?.meta || null;

  const pageLoading = loading || retiradas.loading || agentes.loading || match.loading;

  const resumo = useMemo(
    () => [
      {
        label: "Técnicos",
        value: dadosMes?.technicians?.length || 0,
        icon: UserRound,
      },
      {
        label: "Regionais",
        value: dadosMes?.regionais?.length || 0,
        icon: Users,
      },
      {
        label: "Agentes",
        value: dadosAgentesMes?.cidades?.length || 0,
        icon: Target,
      },
      {
        label: "Mapa O.S",
        value: mapaOrdens.length,
        icon: Map,
      },
      {
        label: "Match O.S",
        value: match?.data?.resumo?.totalMatches || matchOrdens.length || 0,
        icon: Truck,
      },
    ],
    [dadosAgentesMes, dadosMes, mapaOrdens.length, match?.data, matchOrdens.length],
  );

  const ultimaAtualizacao = useMemo(() => {
    const candidatos = [
      retiradas.lastUpdate,
      agentes.lastUpdate,
      mapaMeta,
      matchMeta,
    ].filter(Boolean);

    return formatLastUpdate(candidatos[0] || null);
  }, [agentes.lastUpdate, mapaMeta, matchMeta, retiradas.lastUpdate]);

  async function runExport(key, action) {
    setActiveLoading(key);
    try {
      await action();
    } finally {
      setActiveLoading("");
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
        <PainelMapaNav current="relatorios" />

        <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
                Central de relatórios
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                Relatórios do Painel Público
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Baixe os principais relatórios do painel em PDF ou XLSX usando os
                dados públicos mais recentes disponíveis.
              </p>
            </div>

            <div className="grid w-full min-w-0 gap-4 sm:grid-cols-2 xl:w-[420px] xl:max-w-full">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Última atualização
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {ultimaAtualizacao}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Mês base
                </label>
                <select
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400"
                >
                  {MESES.map((mes) => (
                    <option key={mes} value={mes}>
                      {mes}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>

        {pageLoading ? (
          <PublicPageLoading
            title="Carregando relatórios"
            description="Estamos reunindo os dados públicos para liberar os downloads da central."
          />
        ) : (
          <>
            <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {resumo.map((item) => (
                <SummaryCard
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  value={item.value}
                />
              ))}
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <ReportCard
                icon={UserRound}
                title={`Técnicos · ${month}`}
                description="Ranking dos técnicos com total realizado e percentual de meta individual do mês selecionado."
                disabled={!dadosMes?.technicians?.length}
                loadingPdf={activeLoading === "tecnicos-publico:pdf"}
                loadingXlsx={activeLoading === "tecnicos-publico:xlsx"}
                onPdf={() =>
                  runExport("tecnicos-publico:pdf", () => exportTecnicosPdf(month, dadosMes))
                }
                onXlsx={() =>
                  runExport("tecnicos-publico:xlsx", () => exportTecnicosXlsx(month, dadosMes))
                }
              />

              <ReportCard
                icon={Users}
                title={`Regionais · ${month}`}
                description="Resumo por regional com total de retiradas e percentual comparativo da meta de referência."
                disabled={!dadosMes?.regionais?.length}
                loadingPdf={activeLoading === "regionais-publico:pdf"}
                loadingXlsx={activeLoading === "regionais-publico:xlsx"}
                onPdf={() =>
                  runExport("regionais-publico:pdf", () => exportRegionaisPdf(month, dadosMes))
                }
                onXlsx={() =>
                  runExport("regionais-publico:xlsx", () => exportRegionaisXlsx(month, dadosMes))
                }
              />

              <ReportCard
                icon={Truck}
                title={`Entrega do mês · ${month}`}
                description="Fechamento do mês com distribuição por técnico, agente autorizado, loja, regionais e histórico diário."
                disabled={!dadosMes}
                loadingPdf={activeLoading === "entregas-publico:pdf"}
                loadingXlsx={activeLoading === "entregas-publico:xlsx"}
                onPdf={() =>
                  runExport("entregas-publico:pdf", () => exportEntregaMesPdf(month, dadosMes))
                }
                onXlsx={() =>
                  runExport("entregas-publico:xlsx", () => exportEntregaMesXlsx(month, dadosMes))
                }
              />

              <ReportCard
                icon={Target}
                title={`Agente autorizado · ${month}`}
                description="Cidades de agente autorizado com cancelamentos, meta 80%, total realizado e percentual consolidado."
                disabled={!dadosAgentesMes?.cidades?.length}
                loadingPdf={activeLoading === "agentes-publico:pdf"}
                loadingXlsx={activeLoading === "agentes-publico:xlsx"}
                onPdf={() =>
                  runExport("agentes-publico:pdf", () => exportAgentesPdf(month, dadosAgentesMes))
                }
                onXlsx={() =>
                  runExport("agentes-publico:xlsx", () => exportAgentesXlsx(month, dadosAgentesMes))
                }
              />

              <ReportCard
                icon={Map}
                title="Mapa O.S"
                description="Ordens abertas do mapa com status, cidade, regional, cliente e endereço resumido."
                note="Os downloads do mapa dependem das ordens abertas estarem disponíveis no snapshot público atual."
                disabled={!mapaOrdens.length}
                loadingPdf={activeLoading === "mapa-publico:pdf"}
                loadingXlsx={activeLoading === "mapa-publico:xlsx"}
                onPdf={() =>
                  runExport("mapa-publico:pdf", () => exportMapaPdf(mapaOrdens, mapaMeta))
                }
                onXlsx={() =>
                  runExport("mapa-publico:xlsx", () => exportMapaXlsx(mapaOrdens))
                }
              />

              <ReportCard
                icon={FileSpreadsheet}
                title="Match O.S"
                description="Consolidação dos matches por regional e agentes autorizados, com exportação das ordens e do resumo."
                note="Os downloads do match dependem das ordens estarem presentes na fonte pública atual."
                disabled={!matchOrdens.length}
                loadingPdf={activeLoading === "match-publico:pdf"}
                loadingXlsx={activeLoading === "match-publico:xlsx"}
                onPdf={() =>
                  runExport("match-publico:pdf", () => exportMatchPdf(matchOrdens, matchMeta))
                }
                onXlsx={() =>
                  runExport("match-publico:xlsx", () => exportMatchXlsx(matchOrdens))
                }
              />
            </section>

            {error ? (
              <section className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
                Houve uma falha ao ler parte do snapshot público: {error}
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

