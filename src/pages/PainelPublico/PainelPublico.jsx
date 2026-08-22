import { useMemo, useState } from "react";
import HeaderPainel from "./components/HeaderPainel";
import TabRetiradas from "./tabs/TabRetiradas";
import TabAgentes from "./tabs/TabAgentes";
import TabMapaOS from "./tabs/TabMapaOS";
import { useRetiradas } from "./hooks/useRetiradas";
import { useAgentes } from "./hooks/useAgentes";
import { useMapaOS } from "./hooks/useMapaOS";
import { obterMesAtual } from "../../utils/mes";
import RetorninhoLoader from "../../components/ui/RetorninhoLoader";
import MelzFooter from "../../components/layout/MelzFooter";
import "./PainelPublico.css";

const MONTH_ORDER = [
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

function normalizeMonthName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function resolveMonthRecord(allData = {}, month) {
  const normalizedMonth = normalizeMonthName(month);
  const monthKey = Object.keys(allData || {}).find(
    (key) => normalizeMonthName(key) === normalizedMonth,
  );
  return monthKey ? allData[monthKey] : allData?.[month];
}

function hasMonthData(record) {
  if (!record || typeof record !== "object") return false;
  const values = [
    record.totalOS,
    record.totalRealizado,
    record.totalCancelamentos,
    record.meta,
    record.onnet?.totalOS,
    record.onnetSempre?.totalOS,
  ];
  return values.some((value) => Number(value || 0) > 0);
}

function latestMonthWithData(allData = {}) {
  const orderedMonth = [...MONTH_ORDER]
    .reverse()
    .find((monthName) => hasMonthData(resolveMonthRecord(allData, monthName)));

  return (
    orderedMonth ||
    Object.keys(allData || {})
      .reverse()
      .find((monthName) => hasMonthData(allData?.[monthName]))
  );
}

export default function PainelPublico({ initialTab = "retiradas" }) {
  const [month, setMonth] = useState(() => obterMesAtual() || "Janeiro");
  const activeTab = initialTab;

  const retiradas = useRetiradas(activeTab === "retiradas");
  const agentes = useAgentes(activeTab === "agentes");
  const mapaOS = useMapaOS(activeTab === "mapa");

  const displayMonth = useMemo(() => {
    if (activeTab === "mapa") return month;

    const source = activeTab === "agentes" ? agentes.allData : retiradas.allData;
    if (hasMonthData(resolveMonthRecord(source, month))) return month;

    return latestMonthWithData(source) || month;
  }, [activeTab, agentes.allData, month, retiradas.allData]);

  const loading =
    activeTab === "retiradas"
      ? retiradas.loading
      : activeTab === "agentes"
        ? agentes.loading
        : mapaOS.loading;

  return (
    <div className="painel-publico-page">
      <HeaderPainel
        month={displayMonth}
        onMonthChange={setMonth}
        activeTab={activeTab}
        fbStatusRetiradas={retiradas.fbStatus}
        fbStatusAgentes={agentes.fbStatus}
        fbStatusMapa={mapaOS.fbStatus}
        lastUpdateRetiradas={retiradas.lastUpdate}
        lastUpdateAgentes={agentes.lastUpdate}
        lastUpdateMapa={mapaOS.lastUpdate}
      />

      {loading ? (
        <div style={{ padding: "40px 0 80px" }}>
          <RetorninhoLoader
            card
            title="Carregando dados..."
            description="O Retorninho está atualizando os indicadores do painel público."
            size="lg"
          />
        </div>
      ) : (
        <>
          {activeTab === "retiradas" && (
            <div className="painel-classico">
              <TabRetiradas
                allData={retiradas.allData}
                month={displayMonth}
                lastUpdate={retiradas.lastUpdate}
                forcaTarefa={retiradas.forcaTarefa}
                agentesData={retiradas.agentesData}
                feriadosSet={retiradas.feriadosSet}
              />
            </div>
          )}

          {activeTab === "agentes" && (
            <div className="painel-classico">
              <TabAgentes
                allData={agentes.allData}
                month={displayMonth}
                lastUpdate={agentes.lastUpdate}
              />
            </div>
          )}

          {activeTab === "mapa" && (
            <TabMapaOS
              allData={mapaOS.allData}
              month={displayMonth}
              lastUpdate={mapaOS.lastUpdate}
            />
          )}
        </>
      )}
      <MelzFooter className="mt-8" />
    </div>
  );
}

