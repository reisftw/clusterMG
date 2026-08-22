import MetasResumoMensalHistoricoAnual from "./MetasResumoMensalHistoricoAnual";
import MetasResumoMensalKpis from "./MetasResumoMensalKpis";
import MetasResumoMensalMonthDetailModal from "./MetasResumoMensalMonthDetailModal";
import MetasResumoMensalProjecaoCard from "./MetasResumoMensalProjecaoCard";
import { useMetasResumoMensal } from "../hooks/useMetasResumoMensal";

const MetasResumoMensal = ({
  allData,
  mesSelecionado,
  onSelectMes,
  feriadosSet = new Set(),
}) => {
  const {
    dadosMesSelecionado,
    detalheMesSelecionado,
    historico,
    isMesAtual,
    kpis,
    projecao,
    setMesDetalhe,
    temMetaMesSelecionado,
  } = useMetasResumoMensal(allData, mesSelecionado, feriadosSet);

  return (
    <div className="space-y-5">
      {dadosMesSelecionado && temMetaMesSelecionado ? (
        <MetasResumoMensalKpis kpis={kpis} />
      ) : null}

      {isMesAtual && dadosMesSelecionado?.totalOS > 0 ? (
        <MetasResumoMensalProjecaoCard
          mes={dadosMesSelecionado.mes}
          projecao={projecao}
        />
      ) : null}

      <MetasResumoMensalHistoricoAnual
        historico={historico}
        mesSelecionado={mesSelecionado}
        onSelectMes={onSelectMes}
        onOpenMesDetail={setMesDetalhe}
      />

      <MetasResumoMensalMonthDetailModal
        detail={detalheMesSelecionado}
        onClose={() => setMesDetalhe(null)}
      />
    </div>
  );
};

export default MetasResumoMensal;

