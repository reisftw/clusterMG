import { useMemo, useState } from "react";
import {
  Activity,
  BriefcaseBusiness,
  Check,
  Copy,
  Gauge,
  Info,
  MapPinned,
  Target,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import Spinner from "../../../components/ui/Spinner";
import { useMapaOS } from "../../../pages/Mapa/hooks/useMapaOS";
import { useAnalises } from "../../../pages/Tecnicos/hooks/useAnalises";
import { useMetasDashboard } from "../../metas/hooks/useMetasDashboard";
import InternalStaticDataStatus from "../../../components/ui/InternalStaticDataStatus";

const META_REGIONAL = 110;
const TOTAL_REGIONAIS = 7;

function businessDaysSnapshot(feriadosSet = new Set()) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();

  let uteisTotais = 0;
  let uteisDecorridos = 0;

  for (let dia = 1; dia <= ultimoDia; dia += 1) {
    const data = new Date(ano, mes, dia);
    const fimDeSemana = data.getDay() === 0 || data.getDay() === 6;
    const key = `${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const feriado = feriadosSet.has(key);

    if (fimDeSemana || feriado) continue;

    uteisTotais += 1;
    if (dia <= hoje.getDate()) uteisDecorridos += 1;
  }

  return {
    uteisTotais,
    uteisDecorridos,
    percentualDecorrido:
      uteisTotais > 0 ? uteisDecorridos / uteisTotais : 0,
  };
}

function isAgenteAutorizado(ordem = {}) {
  const valor = ordem.agente;
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "string") {
    const normalizado = valor.trim().toLowerCase();
    return ["true", "sim", "agente", "autorizado"].includes(normalizado);
  }
  return false;
}

function SectionHeader({ icon, title, subtitle, badge, actions }) {
  const IconComponent = icon;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <IconComponent size={18} />
          </div>
          <p className="text-sm font-bold text-gray-900">{title}</p>
        </div>
        {subtitle ? <p className="mt-2 text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {badge ? (
          <div className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            {badge}
          </div>
        ) : null}
        {actions}
      </div>
    </div>
  );
}

function ExecutiveCard({ label, value, helper, tone = "blue" }) {
  const tones = {
    blue: "text-blue-700 bg-blue-50 border-blue-100",
    green: "text-emerald-700 bg-emerald-50 border-emerald-100",
    amber: "text-amber-700 bg-amber-50 border-amber-100",
    red: "text-red-700 bg-red-50 border-red-100",
  };

  return (
    <div className={`rounded-2xl border p-5 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{value}</p>
      <p className="mt-2 text-xs opacity-80">{helper}</p>
    </div>
  );
}

function DynamicMetaCard({ item, tipo, metaLabel = "Meta Regional", detalheExtra }) {
  const progresso = Math.max(0, Math.min(100, item.percentualConclusao));
  const risco = item.realizadoHoje < item.metaEsperadaHoje;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-gray-900">{item.nome}</p>
          <p className="mt-1 text-xs text-gray-400">
            {tipo} - realizado {item.realizado}
          </p>
          {detalheExtra ? (
            <p className="mt-1 text-[11px] text-gray-400">{detalheExtra}</p>
          ) : null}
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            risco ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
          }`}
        >
          {risco ? "Abaixo do ritmo" : "No ritmo"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-gray-50 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Meta Hoje
          </p>
          <p className="mt-1 text-lg font-black text-blue-700">
            {item.metaEsperadaHoje}
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Desvio
          </p>
          <p
            className={`mt-1 text-lg font-black ${
              item.desvioHoje >= 0 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {item.desvioHoje >= 0 ? "+" : ""}
            {item.desvioHoje}
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            {metaLabel}
          </p>
          <p className="mt-1 text-lg font-black text-gray-800">{META_REGIONAL}</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-[11px] text-gray-400">
          <span>{progresso.toFixed(0)}% da meta regional</span>
          <span>{item.faltam} faltando</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full ${
              risco
                ? "bg-gradient-to-r from-red-500 to-amber-400"
                : "bg-gradient-to-r from-emerald-500 to-lime-400"
            }`}
            style={{ width: `${progresso}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function OperacionalPage() {
  const { ordens, loading: loadingMapa } = useMapaOS();
  const { historico } = useAnalises();
  const { metaMes, loading: loadingMetas, feriadosSet } = useMetasDashboard();
  const [mostrarLogicaSemana, setMostrarLogicaSemana] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [simuladorEntregaTecnicos, setSimuladorEntregaTecnicos] = useState("");

  const ultimaAnalise = historico?.[0] || null;
  const ordensRegionais = useMemo(
    () => (ordens || []).filter((ordem) => !isAgenteAutorizado(ordem)),
    [ordens],
  );

  const dados = useMemo(() => {
    if (!ultimaAnalise) return null;

    const tecnicosAnalise = ultimaAnalise.resultadosTecnicos || [];
    const snapshotDias = businessDaysSnapshot(feriadosSet);
    const metaHoje = Math.round(META_REGIONAL * snapshotDias.percentualDecorrido);
    const totalRetiradasClt = tecnicosAnalise.reduce(
      (acc, tecnico) => acc + Number(tecnico.totalRetiradas || 0),
      0,
    );
    const totalRetiradasGeral = Math.round(Number(metaMes?.totalOS || 0));
    const totalRetiradasTerceirizadas = Math.max(
      0,
      totalRetiradasGeral - totalRetiradasClt,
    );
    const fatorAjusteRegionais =
      totalRetiradasClt > 0 && totalRetiradasGeral > 0
        ? totalRetiradasGeral / totalRetiradasClt
        : 1;

    const regionais = Object.values(
      tecnicosAnalise.reduce((acc, tecnico) => {
        const regional = tecnico.regional || "Sem regional";

        if (!acc[regional]) {
          acc[regional] = {
            nome: regional,
            realizado: 0,
            tecnicos: 0,
          };
        }

        acc[regional].realizado += Number(tecnico.totalRetiradas || 0);
        acc[regional].tecnicos += 1;
        return acc;
      }, {}),
    )
      .map((regional) => {
        const realizadoBaseClt = Number(regional.realizado || 0);
        const realizadoAjustado = Math.round(realizadoBaseClt * fatorAjusteRegionais);

        return {
          ...regional,
          realizadoBaseClt,
          realizadoTerceirizadoEstimado: Math.max(
            0,
            realizadoAjustado - realizadoBaseClt,
          ),
          realizado: realizadoAjustado,
          realizadoHoje: realizadoAjustado,
          metaEsperadaHoje: metaHoje,
          desvioHoje: realizadoAjustado - metaHoje,
          faltam: Math.max(0, META_REGIONAL - realizadoAjustado),
          percentualConclusao: (realizadoAjustado / META_REGIONAL) * 100,
        };
      })
      .sort((a, b) => a.desvioHoje - b.desvioHoje);

    const regionaisMap = regionais.reduce((acc, regional) => {
      acc[regional.nome] = regional;
      return acc;
    }, {});

    const tecnicos = tecnicosAnalise
      .map((tecnico) => {
        const regional = tecnico.regional || "Sem regional";
        const resumoRegional = regionaisMap[regional] || {
          realizado: 0,
          realizadoHoje: 0,
          metaEsperadaHoje: metaHoje,
          desvioHoje: -metaHoje,
          faltam: META_REGIONAL,
          percentualConclusao: 0,
        };
        const contribuicao = Number(tecnico.totalRetiradas || 0);

        return {
          nome: tecnico.nome || "Sem nome",
          regional,
          realizado: resumoRegional.realizado,
          realizadoHoje: resumoRegional.realizadoHoje,
          metaEsperadaHoje: resumoRegional.metaEsperadaHoje,
          desvioHoje: resumoRegional.desvioHoje,
          faltam: resumoRegional.faltam,
          percentualConclusao: resumoRegional.percentualConclusao,
          contribuicao,
          percentualContribuicao:
            resumoRegional.realizado > 0
              ? (contribuicao / resumoRegional.realizado) * 100
              : 0,
        };
      })
      .sort((a, b) => a.desvioHoje - b.desvioHoje);

    return {
      snapshotDias,
      metaHoje,
      totalRetiradasClt,
      totalRetiradasGeral,
      totalRetiradasTerceirizadas,
      regionais,
      tecnicos,
    };
  }, [ultimaAnalise, feriadosSet, metaMes]);

  const mapaOperacional = useMemo(() => {
    if (!ordensRegionais.length || !dados) return [];

    const produtividadePorRegional = (dados.regionais || []).reduce((acc, regional) => {
      acc[regional.nome] = {
        regional: regional.nome,
        tecnicos: Number(regional.tecnicos || 0),
        totalRetiradas: Number(regional.realizado || 0),
        totalRetiradasClt: Number(regional.realizadoBaseClt || 0),
        totalRetiradasTerceirizadas: Number(
          regional.realizadoTerceirizadoEstimado || 0,
        ),
      };
      return acc;
    }, {});

    const backlogPorRegional = ordensRegionais.reduce((acc, ordem) => {
      const regional = ordem.regional || "Sem regional";

      if (!acc[regional]) {
        acc[regional] = {
          regional,
          ordensAbertas: 0,
        };
      }

      acc[regional].ordensAbertas += 1;
      return acc;
    }, {});

    return Object.values(backlogPorRegional)
      .map((item) => {
        const produtividade = produtividadePorRegional[item.regional] || {
          tecnicos: 0,
          totalRetiradas: 0,
        };
        const backlogPorTecnico =
          produtividade.tecnicos > 0
            ? item.ordensAbertas / produtividade.tecnicos
            : item.ordensAbertas;
        const mediaRetiradasPorTecnico =
          produtividade.tecnicos > 0
            ? produtividade.totalRetiradas / produtividade.tecnicos
            : 0;
        const percentualMetaMedio = (mediaRetiradasPorTecnico / META_REGIONAL) * 100;

        return {
          ...item,
          tecnicos: produtividade.tecnicos,
          mediaRetiradasPorTecnico,
          percentualMetaMedio,
          backlogPorTecnico,
          totalRetiradasClt: produtividade.totalRetiradasClt,
          totalRetiradasTerceirizadas: produtividade.totalRetiradasTerceirizadas,
          indicePressao: backlogPorTecnico * 0.7 + percentualMetaMedio / 12,
        };
      })
      .sort((a, b) => b.indicePressao - a.indicePressao)
      .slice(0, 6);
  }, [ordensRegionais, dados]);

  const projecaoSemanal = useMemo(() => {
    if (!ultimaAnalise || !metaMes) return null;

    const snapshotDias = businessDaysSnapshot(feriadosSet);
    const diasUteisRestantesMes = Math.max(
      1,
      snapshotDias.uteisTotais - snapshotDias.uteisDecorridos,
    );
    const totalEntregueMes = Math.round(Number(metaMes.totalOS || 0));
    const metaMensal = Math.round(Number(metaMes.meta || 0));
    const faltaMetaGeral = Math.max(0, Math.round(metaMensal - totalEntregueMes));
    const tecnicosRetirada = Array.isArray(metaMes.technicians)
      ? metaMes.technicians
      : [];

    const totalFaltaTecnicosRetirada = tecnicosRetirada.reduce((acc, tecnico) => {
      const realizado = Math.round(Number(tecnico?.total || 0));
      return acc + Math.max(0, META_REGIONAL - realizado);
    }, 0);

    const saldoParaRegionais = Math.max(
      0,
      faltaMetaGeral - totalFaltaTecnicosRetirada,
    );
    const metaDiariaRegional = Math.ceil(
      saldoParaRegionais / diasUteisRestantesMes,
    );
    const metaDiariaPorRegional = Math.ceil(
      metaDiariaRegional / TOTAL_REGIONAIS,
    );

    const regionais = (dados?.regionais || [])
      .map((regional) => {
        const realizado = Math.round(
          Number(regional?.realizado || regional?.total || 0),
        );
        const faltamMeta = Math.max(0, META_REGIONAL - realizado);
        const necessidadeDia = Math.ceil(faltamMeta / diasUteisRestantesMes);

        return {
          regional: regional?.nome || regional?.name || "Sem regional",
          realizado,
          faltamMeta,
          necessidadeDia,
          tecnicos: Number(regional?.tecnicos || 0),
        };
      })
      .sort((a, b) => b.necessidadeDia - a.necessidadeDia);

    const tecnicosRetiradaDesconto = tecnicosRetirada
      .map((tecnico) => {
        const realizado = Math.round(Number(tecnico?.total || 0));
        const faltam = Math.max(0, META_REGIONAL - realizado);
        return {
          nome: tecnico?.name || "Sem nome",
          realizado,
          faltam,
        };
      })
      .sort((a, b) => {
        if (b.faltam !== a.faltam) return b.faltam - a.faltam;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });

    return {
      totalEntregueMes,
      totalEntregueClt: Math.round(Number(dados?.totalRetiradasClt || 0)),
      totalEntregueTerceirizados: Math.round(
        Number(dados?.totalRetiradasTerceirizadas || 0),
      ),
      metaMensal,
      faltaMetaGeral,
      totalFaltaTecnicosRetirada,
      saldoParaRegionais,
      diasUteisRestantesMes,
      metaDiariaRegional,
      metaDiariaPorRegional,
      regionais,
      tecnicosRetiradaDesconto,
      explicacao:
        `Pegamos o total geral ja entregue no mes pela dashboard (${totalEntregueMes}). Dentro desse total, ${Math.round(
          Number(dados?.totalRetiradasClt || 0),
        )} vieram dos tecnicos CLT e ${Math.round(
          Number(dados?.totalRetiradasTerceirizadas || 0),
        )} sao tratados como terceirizados pela diferenca. A partir desse total consolidado, calculamos quanto falta para bater a meta geral (${faltaMetaGeral}). Depois descontamos o total que ainda falta para os tecnicos de retirada chegarem nas metas individuais (${totalFaltaTecnicosRetirada}). O saldo restante (${saldoParaRegionais}) e dividido pelos ${diasUteisRestantesMes} dias uteis restantes do mes para encontrar quanto as 7 regionais precisam entregar por dia (${metaDiariaRegional}), o que representa cerca de ${metaDiariaPorRegional} por regional ao dia.`,
    };
  }, [ultimaAnalise, metaMes, feriadosSet, dados]);

  const resumoExecutivo = useMemo(() => {
    if (!dados) return null;

    const totalOSAbertas = ordensRegionais.length || 0;
    const produtividadeMedia =
      dados.tecnicos.length > 0
        ? dados.tecnicos.reduce((acc, item) => acc + item.contribuicao, 0) /
          dados.tecnicos.length
        : 0;
    const regionaisRisco = dados.regionais.filter(
      (item) => item.realizadoHoje < item.metaEsperadaHoje,
    ).length;
    const tecnicosRisco = dados.tecnicos.filter(
      (item) => item.realizadoHoje < item.metaEsperadaHoje,
    ).length;
    const percentMeta = Number(metaMes?.percentAchieved || 0);

    return {
      totalOSAbertas,
      produtividadeMedia,
      regionaisRisco,
      tecnicosRisco,
      percentMeta,
      totalEntregueGeral: Math.round(Number(dados.totalRetiradasGeral || 0)),
      totalEntregueClt: Math.round(Number(dados.totalRetiradasClt || 0)),
      totalEntregueTerceirizados: Math.round(
        Number(dados.totalRetiradasTerceirizadas || 0),
      ),
      alertaPrincipal:
        mapaOperacional[0]?.regional || dados.regionais[0]?.nome || "Sem destaque",
    };
  }, [dados, ordensRegionais, metaMes, mapaOperacional]);

  const simulacaoMeta = useMemo(() => {
    if (!projecaoSemanal) return null;

    const entregaTecnicos = Math.max(
      0,
      Math.round(Number(simuladorEntregaTecnicos || 0)),
    );
    const saldoRegionais = Math.max(
      0,
      projecaoSemanal.faltaMetaGeral - entregaTecnicos,
    );
    const porDia = Math.ceil(
      saldoRegionais / Math.max(1, projecaoSemanal.diasUteisRestantesMes),
    );
    const porRegionalDia = Math.ceil(porDia / TOTAL_REGIONAIS);

    return {
      entregaTecnicos,
      saldoRegionais,
      porDia,
      porRegionalDia,
    };
  }, [projecaoSemanal, simuladorEntregaTecnicos]);

  const mensagemWhatsapp = useMemo(() => {
    if (!projecaoSemanal || !resumoExecutivo || !simulacaoMeta) return "";

    const dataTexto = new Date().toLocaleDateString("pt-BR");

    const topRegionais = projecaoSemanal.regionais
      .slice(0, 4)
      .map(
        (regional) =>
          `- ${regional.regional}: faltam ${regional.faltamMeta} no mes | precisa de ${regional.necessidadeDia}/dia`,
      )
      .join("\n");

    return [
      "*Atencao Supervisores - Panorama Operacional da Semana*",
      `Data: ${dataTexto}`,
      "",
      `- Entregue no mes (geral): ${projecaoSemanal.totalEntregueMes}`,
      `- Tecnicos CLT no operacional: ${projecaoSemanal.totalEntregueClt}`,
      `- Tecnicos terceirizados inferidos: ${projecaoSemanal.totalEntregueTerceirizados}`,
      `- Falta para a meta geral: ${projecaoSemanal.faltaMetaGeral}`,
      `- Tecnicos de retirada ainda precisam entregar: ${projecaoSemanal.totalFaltaTecnicosRetirada}`,
      `- Saldo que fica com as regionais: ${projecaoSemanal.saldoParaRegionais}`,
      `- Dias uteis restantes no mes: ${projecaoSemanal.diasUteisRestantesMes}`,
      `- Meta diaria recomendada das regionais: ${projecaoSemanal.metaDiariaRegional}`,
      `- Media por regional ao dia: ${projecaoSemanal.metaDiariaPorRegional}`,
      "",
      "*Simulador do dia*",
      `- Se os tecnicos de retirada entregarem ${simulacaoMeta.entregaTecnicos}, sobra ${simulacaoMeta.saldoRegionais} para as regionais no restante do mes.`,
      `- Nesse cenario, as regionais precisam entregar ${simulacaoMeta.porDia} por dia, cerca de ${simulacaoMeta.porRegionalDia} por regional ao dia.`,
      "",
      `- Meta mensal geral: ${resumoExecutivo.percentMeta.toFixed(1)}%`,
      `- O.S em aberto monitoradas: ${resumoExecutivo.totalOSAbertas}`,
      `- Regionais em risco hoje: ${resumoExecutivo.regionaisRisco}`,
      `- Tecnicos ligados a regionais em risco: ${resumoExecutivo.tecnicosRisco}`,
      "",
      "Regionais que exigem maior atencao diaria:",
      topRegionais,
      "",
      `Solicito atencao especial para ${resumoExecutivo.alertaPrincipal} e acompanhamento proximo das regionais para garantir a entrega diaria necessaria ate o fechamento do mes.`,
    ].join("\n");
  }, [projecaoSemanal, resumoExecutivo, simulacaoMeta]);

  if (loadingMapa || loadingMetas || !dados || !resumoExecutivo || !projecaoSemanal) {
    return <Spinner fullScreen />;
  }

  const tecnicosCriticos = dados.tecnicos.slice(0, 4);
  const regionaisCriticas = dados.regionais.slice(0, 4);
  const maxPressao = Math.max(
    1,
    ...mapaOperacional.map((item) => item.indicePressao),
  );

  const handleCopiarWhatsapp = async () => {
    try {
      await navigator.clipboard.writeText(mensagemWhatsapp);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <SectionHeader
          icon={BriefcaseBusiness}
          title="Operacional"
          subtitle="Visao executiva para diretoria com leitura por mapa, metas dinamicas e foco nos gargalos operacionais."
          badge={`${dados.snapshotDias.uteisDecorridos}/${dados.snapshotDias.uteisTotais} dias uteis corridos`}
        />
      </div>

      <InternalStaticDataStatus className="max-w-xl" />

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <SectionHeader
          icon={TrendingUp}
          title="Resumo Executivo"
          subtitle="Leitura prioritaria para diretoria com plano de fechamento do mes, alerta principal e dados prontos para acionamento."
          badge={`Alerta principal: ${resumoExecutivo.alertaPrincipal}`}
        />

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <ExecutiveCard
            label="Entregue no Mes"
            value={resumoExecutivo.totalEntregueGeral}
            helper="Total geral consolidado da dashboard"
            tone="blue"
          />
          <ExecutiveCard
            label="CLT"
            value={resumoExecutivo.totalEntregueClt}
            helper="Retiradas identificadas pelos tecnicos CLT"
            tone="green"
          />
          <ExecutiveCard
            label="Terceirizados"
            value={resumoExecutivo.totalEntregueTerceirizados}
            helper="Diferenca inferida entre dashboard e CLT"
            tone="amber"
          />
          <ExecutiveCard
            label="Meta Mensal"
            value={`${resumoExecutivo.percentMeta.toFixed(1)}%`}
            helper="Atingimento geral consolidado"
            tone={resumoExecutivo.percentMeta >= 90 ? "green" : "amber"}
          />
          <ExecutiveCard
            label="Regionais em Risco"
            value={resumoExecutivo.regionaisRisco}
            helper="Abaixo da meta proporcional de hoje"
            tone={resumoExecutivo.regionaisRisco > 0 ? "red" : "green"}
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr,0.95fr]">
          <div className="rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-gray-900">
                  Plano para bater a meta do mes
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Considerando o entregue no mes, a meta dos tecnicos de retirada e os dias uteis restantes
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMostrarLogicaSemana((prev) => !prev)}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  <Info size={14} />
                  Info
                </button>
                <button
                  onClick={handleCopiarWhatsapp}
                  className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700"
                >
                  {copiado ? <Check size={14} /> : <Copy size={14} />}
                  {copiado ? "Copiado" : "Copiar para WhatsApp"}
                </button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-500">
                  Falta para Meta
                </p>
                <p className="mt-2 text-3xl font-black text-blue-700">
                  {projecaoSemanal.faltaMetaGeral}
                </p>
                <p className="mt-2 text-xs text-blue-700/80">
                  Diferenca entre a meta mensal e o entregue no mes
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                  Téc. Retirada
                </p>
                <p className="mt-2 text-3xl font-black text-gray-900">
                  {projecaoSemanal.totalFaltaTecnicosRetirada}
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Total que os tecnicos de retirada ainda precisam entregar
                </p>
              </div>
              <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-600">
                  Terceirizados
                </p>
                <p className="mt-2 text-3xl font-black text-orange-700">
                  {projecaoSemanal.totalEntregueTerceirizados}
                </p>
                <p className="mt-2 text-xs text-orange-700/80">
                  Total inferido pela diferenca entre dashboard e CLT
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600">
                  Regionais por Dia
                </p>
                <p className="mt-2 text-3xl font-black text-emerald-700">
                  {projecaoSemanal.metaDiariaRegional}
                </p>
                <p className="mt-2 text-xs text-emerald-700/80">
                  Cerca de {projecaoSemanal.metaDiariaPorRegional} por regional ao dia
                </p>
              </div>
              <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-purple-600">
                  Meta Diária Recomendada
                </p>
                <p className="mt-2 text-3xl font-black text-purple-700">
                  {projecaoSemanal.metaDiariaRegional}
                </p>
                <p className="mt-2 text-xs text-purple-700/80">
                  Ritmo diário automático considerando saldo do mês e dias úteis restantes
                </p>
              </div>
            </div>

            {mostrarLogicaSemana ? (
              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-sm font-bold text-amber-800">Logica usada</p>
                <p className="mt-2 text-sm leading-6 text-amber-900">
                  {projecaoSemanal.explicacao}
                </p>
              </div>
            ) : null}

            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-sm font-bold text-blue-900">
                Simulador de meta
              </p>
              <p className="mt-1 text-xs text-blue-800">
                Informe quantas retiradas os técnicos de retirada devem entregar e veja quanto sobra para as regionais.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[220px,1fr]">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">
                    Técnicos de retirada
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={simuladorEntregaTecnicos}
                    onChange={(e) => setSimuladorEntregaTecnicos(e.target.value)}
                    placeholder={String(projecaoSemanal.totalFaltaTecnicosRetirada)}
                    className="input-field"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">
                      Sobra para regionais
                    </p>
                    <p className="mt-2 text-2xl font-black text-blue-700">
                      {simulacaoMeta.saldoRegionais}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">
                      Regionais por dia
                    </p>
                    <p className="mt-2 text-2xl font-black text-emerald-700">
                      {simulacaoMeta.porDia}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">
                      Por regional / dia
                    </p>
                    <p className="mt-2 text-2xl font-black text-purple-700">
                      {simulacaoMeta.porRegionalDia}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-sm font-bold text-gray-900">
                Tecnicos de retirada considerados no desconto
              </p>
              <div className="mt-3 space-y-2">
                {projecaoSemanal.tecnicosRetiradaDesconto.map((tecnico) => (
                  <div
                    key={tecnico.nome}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {tecnico.nome}
                      </p>
                      <p className="text-xs text-gray-400">
                        Realizado {tecnico.realizado}
                      </p>
                    </div>
                    <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600">
                      Faltam {tecnico.faltam}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center gap-2">
              <TriangleAlert size={16} className="text-amber-600" />
              <p className="text-sm font-bold text-gray-900">Ranking de regionais que mais precisam acelerar</p>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-800">
                {resumoExecutivo.alertaPrincipal} aparece como o principal foco operacional do momento.
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                A orientacao e acompanhar de perto a fila aberta, descontar a
                participacao esperada dos tecnicos de retirada e cobrar a entrega
                diaria necessaria das 7 regionais ate o fechamento do mes.
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {projecaoSemanal.regionais.map((regional, index) => (
                <div key={regional.regional} className="rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {index + 1}. {regional.regional}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        Realizado {regional.realizado} · faltam {regional.faltamMeta} no mes
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                        {regional.necessidadeDia}/dia
                      </span>
                      <p className="mt-2 text-[11px] text-gray-400">
                        {regional.tecnicos} técnico(s)
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-green-100 bg-green-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-green-900">
                    Mensagem pronta para supervisão
                  </p>
                  <p className="mt-1 text-xs text-green-800">
                    Texto automático atualizado com o cenário do dia e a simulação atual.
                  </p>
                </div>
                <button
                  onClick={handleCopiarWhatsapp}
                  className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700"
                >
                  {copiado ? <Check size={14} /> : <Copy size={14} />}
                  {copiado ? "Copiado" : "Copiar"}
                </button>
              </div>

              <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-white p-4 text-xs leading-6 text-gray-700">
                {mensagemWhatsapp}
              </pre>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <SectionHeader
            icon={MapPinned}
            title="Painel Operacional por Mapa"
            subtitle="Cruza O.S abertas com ritmo de retiradas por regional para mostrar onde o backlog esta mais pressionado."
            badge={`${mapaOperacional.length} regionais acompanhadas`}
          />

          <div className="mt-5 space-y-4">
            {mapaOperacional.map((item) => (
              <div key={item.regional} className="rounded-2xl border border-gray-100 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{item.regional}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {item.ordensAbertas} O.S abertas · {item.tecnicos} tecnico(s) regionais
                    </p>
                  </div>
                  <div className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
                    Pressao {item.indicePressao.toFixed(1)}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">
                      Backlog/Tec
                    </p>
                    <p className="mt-1 text-lg font-black text-red-600">
                      {item.backlogPorTecnico.toFixed(1)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">
                      Ret./Tec
                    </p>
                    <p className="mt-1 text-lg font-black text-blue-700">
                      {item.mediaRetiradasPorTecnico.toFixed(1)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">
                      Meta Media
                    </p>
                    <p className="mt-1 text-lg font-black text-emerald-700">
                      {Math.round(item.percentualMetaMedio)}%
                    </p>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">
                      Abertas
                    </p>
                    <p className="mt-1 text-lg font-black text-gray-900">
                      {item.ordensAbertas}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-gray-400">
                    <span>Indice de pressao operacional</span>
                    <span>{item.indicePressao.toFixed(1)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400"
                      style={{ width: `${(item.indicePressao / maxPressao) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <SectionHeader
            icon={Activity}
            title="Leitura de Retiradas"
            subtitle="Quadro executivo de desempenho focado exclusivamente em retiradas feitas."
          />

          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <div className="flex items-center gap-2">
                <TriangleAlert size={16} className="text-amber-600" />
                <p className="text-sm font-bold text-amber-700">Ponto de atencao</p>
              </div>
              <p className="mt-2 text-sm text-amber-800">
                {resumoExecutivo.alertaPrincipal} aparece como o principal foco
                operacional do momento, combinando backlog aberto e ritmo de
                retiradas abaixo do ideal.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center gap-2">
                  <Activity size={15} className="text-blue-600" />
                  <p className="text-sm font-bold text-gray-900">
                    Retiradas medias por tecnico
                  </p>
                </div>
                <p className="mt-2 text-2xl font-black text-blue-700">
                  {resumoExecutivo.produtividadeMedia.toFixed(1)} retiradas
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Media individual de retiradas entre os tecnicos das regionais
                </p>
              </div>

              <div className="rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center gap-2">
                  <Gauge size={15} className="text-emerald-600" />
                  <p className="text-sm font-bold text-gray-900">
                    Meta proporcional de hoje
                  </p>
                </div>
                <p className="mt-2 text-2xl font-black text-emerald-700">
                  {dados.metaHoje} retiradas
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Meta regional proporcional ao dia util atual
                </p>
              </div>

              <div className="rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center gap-2">
                  <Target size={15} className="text-purple-600" />
                  <p className="text-sm font-bold text-gray-900">
                    Diretriz do dia
                  </p>
                </div>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Priorizar redistribuicao de carga nas regionais em risco e
                  monitorar tecnicos que estao contribuindo pouco para a meta
                  da propria regional.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <SectionHeader
            icon={Target}
            title="Leitura Dinamica - Tecnicos das Regionais"
            subtitle="Cada tecnico passa a ser lido pela meta da sua regional, e nao por uma meta propria de 110."
            badge={`${tecnicosCriticos.length} em destaque`}
          />
          <div className="mt-5 space-y-4">
            {tecnicosCriticos.map((item) => (
              <DynamicMetaCard
                key={item.nome}
                item={item}
                tipo={item.regional}
                metaLabel="Meta Regional"
                detalheExtra={`Contribuicao individual: ${item.contribuicao} retiradas (${item.percentualContribuicao.toFixed(0)}% da regional)`}
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <SectionHeader
            icon={MapPinned}
            title="Metas Dinamicas - Regionais"
            subtitle="Comparativo entre o realizado da regional e a meta proporcional do dia."
            badge={`${regionaisCriticas.length} em destaque`}
          />
          <div className="mt-5 space-y-4">
            {regionaisCriticas.map((item) => (
              <DynamicMetaCard
                key={item.nome}
                item={item}
                tipo={`${item.tecnicos} tecnico(s)`}
                metaLabel="Meta Regional"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
