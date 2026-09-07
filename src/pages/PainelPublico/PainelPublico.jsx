import { useState } from "react";
import MelzFooter from "../../components/layout/MelzFooter";
import RetorninhoLoader from "../../components/ui/RetorninhoLoader";
import { obterMesAtual } from "../../utils/mes";
import HeaderPainel from "./components/HeaderPainel";
import { useAgentes } from "./hooks/useAgentes";
import { useMapaOS } from "./hooks/useMapaOS";
import { useRetiradas } from "./hooks/useRetiradas";
import TabAgentes from "./tabs/TabAgentes";
import TabMapaOS from "./tabs/TabMapaOS";
import TabRetiradas from "./tabs/TabRetiradas";
import "./PainelPublico.css";

export default function PainelPublico({ initialTab = "retiradas" }) {
	const [month, setMonth] = useState(() => obterMesAtual() || "Janeiro");
	const activeTab = initialTab;

	const retiradas = useRetiradas(activeTab === "retiradas");
	const agentes = useAgentes(activeTab === "agentes");
	const mapaOS = useMapaOS(activeTab === "mapa");

	const displayMonth = month;

	// Extraido pra achado javascript:S3358 (ternario aninhado).
	let loading = mapaOS.loading;
	if (activeTab === "retiradas") loading = retiradas.loading;
	else if (activeTab === "agentes") loading = agentes.loading;

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
