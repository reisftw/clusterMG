import { useState } from "react";
import HeaderPainel from "./components/HeaderPainel";
import TabRetiradas from "./tabs/TabRetiradas";
import TabAgentes from "./tabs/TabAgentes";
import TabMapaOS from "./tabs/TabMapaOS";
import { useRetiradas } from "./hooks/useRetiradas";
import { useAgentes } from "./hooks/useAgentes";
import { useMapaOS } from "./hooks/useMapaOS";
import "./PainelPublico.css";

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

export default function PainelPublico() {
  const [month, setMonth] = useState(() => MESES[new Date().getMonth()] || "Janeiro");
  const [activeTab, setActiveTab] = useState("retiradas");

  const retiradas = useRetiradas(activeTab === "retiradas");
  const agentes = useAgentes(activeTab === "agentes");
  const mapaOS = useMapaOS(activeTab === "mapa");

  const loading =
    activeTab === "retiradas"
      ? retiradas.loading
      : activeTab === "agentes"
        ? agentes.loading
        : mapaOS.loading;

  return (
    <div className="painel-publico-page">
      <HeaderPainel
        month={month}
        onMonthChange={setMonth}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        fbStatusRetiradas={retiradas.fbStatus}
        fbStatusAgentes={agentes.fbStatus}
        fbStatusMapa={mapaOS.fbStatus}
        lastUpdateRetiradas={retiradas.lastUpdate}
        lastUpdateAgentes={agentes.lastUpdate}
        lastUpdateMapa={mapaOS.lastUpdate}
      />

      {loading ? (
        <div
          style={{
            textAlign: "center",
            padding: "80px 20px",
            color: "var(--muted)",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <p
            style={{
              fontFamily: "Bebas Neue, sans-serif",
              fontSize: 28,
              color: "var(--blue)",
            }}
          >
            Carregando dados...
          </p>
        </div>
      ) : (
        <>
          {activeTab === "retiradas" && (
            <div className="painel-classico">
              <TabRetiradas
                allData={retiradas.allData}
                month={month}
                lastUpdate={retiradas.lastUpdate}
              />
            </div>
          )}

          {activeTab === "agentes" && (
            <div className="painel-classico">
              <TabAgentes allData={agentes.allData} month={month} />
            </div>
          )}

          {activeTab === "mapa" && (
            <TabMapaOS
              allData={mapaOS.allData}
              month={month}
              lastUpdate={mapaOS.lastUpdate}
            />
          )}
        </>
      )}
    </div>
  );
}
