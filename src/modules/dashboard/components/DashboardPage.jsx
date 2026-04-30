import { useDashboard } from "../hooks/useDashboard";
import SummaryCards from "./SummaryCards";
import MetasDashboardWidget from "../../metas/components/MetasDashboardWidget";
import MetasAlertWidget from "../../metas/components/MetasAlertWidget";
import MetasPrevisaoWidget from "../../metas/components/MetasPrevisaoWidget";
import ProdutividadeChart from "./ProdutividadeChart";
import ProximosFeriados from "./ProximosFeriados";
import BancoHorasWidget from "../../bancoHoras/components/BancoHorasWidget";
import AniversariantesWidget from "./AniversariantesWidget";
import ProximasAgendas from "../../agenda/components/ProximasAgendas";
import Spinner from "../../../components/ui/Spinner";
import MetasCidadesCriticasWidget from "../../metas/components/MetasCidadesCriticasWidget";
import TopCidadesCard from "../components/TopCidadesCard";
import AlertasAutomaticosWidget from "./AlertasAutomaticosWidget";
import TendenciaMensalWidget from "./TendenciaMensalWidget";
import { useMapaOS } from "../../../pages/Mapa/hooks/useMapaOS";
import MapaKPICards from "./MapaKPICards";
import InternalStaticDataStatus from "../../../components/ui/InternalStaticDataStatus";

const DashboardPage = () => {
  const { resumo, loading, error } = useDashboard();
  const { ordens } = useMapaOS();

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">
            Visao consolidada da operacao com leitura padrao pelo JSON interno.
          </p>
        </div>
        <InternalStaticDataStatus className="max-w-xl" />
      </div>

      <MetasAlertWidget />

      <MapaKPICards />
      <SummaryCards resumo={resumo} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <MetasDashboardWidget />
        <MetasPrevisaoWidget />
        <AlertasAutomaticosWidget resumo={resumo} />
        <MetasCidadesCriticasWidget />
        <TopCidadesCard ordens={ordens} />
        <TendenciaMensalWidget />
        <ProdutividadeChart />
        <BancoHorasWidget />
        <AniversariantesWidget />
        <ProximasAgendas />
        <ProximosFeriados feriados={resumo?.feriadosProximos} />
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
