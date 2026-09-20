import { useCallback, useEffect, useState } from "react";
import { INTERNAL_STATIC_DATA_UPDATED_EVENT } from "../../../services/internalStaticDataService";
import { applyMetasBaseConfigToAllData } from "../constants/metasBaseConfig";
import {
	buscarFeriados,
	buscarMetasBaseConfig,
	buscarTodasMetas,
} from "../services/metasService";

const MESES = [
	"Janeiro",
	"Fevereiro",
	"Marco",
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

function withMonth(meta, mes) {
	if (!meta || typeof meta !== "object") return meta;

	return ["consolidado", "onnet", "onnetSempre"].reduce(
		(acc, key) => {
			if (acc[key] && typeof acc[key] === "object") {
				acc[key] = { mes, ...acc[key] };
			}
			return acc;
		},
		{ mes, ...meta },
	);
}

function getDashboardMonth(todos, currentMonth) {
	if (!todos || typeof todos !== "object") return null;
	return { mes: currentMonth, data: todos[currentMonth] ?? null };
}

export const useMetasDashboard = () => {
	const [metaMes, setMetaMes] = useState(null);
	const [allData, setAllData] = useState({});
	const [loading, setLoading] = useState(true);
	const [feriadosSet, setFeriadosSet] = useState(new Set());

	const carregar = useCallback(async (force = false) => {
		try {
			setLoading(true);
			const [todos, feriados, baseConfig] = await Promise.all([
				buscarTodasMetas(force),
				buscarFeriados(force),
				buscarMetasBaseConfig(force).catch(() => null),
			]);
			const metasConfiguradas = applyMetasBaseConfigToAllData(
				todos || {},
				baseConfig,
			);
			const agora = new Date();
			const mesNome = MESES[agora.getMonth()];
			const selected = getDashboardMonth(metasConfiguradas, mesNome);
			setAllData(metasConfiguradas || {});
			setMetaMes(selected ? withMonth(selected.data, selected.mes) : null);
			setFeriadosSet(feriados instanceof Set ? feriados : new Set());
		} catch (e) {
			console.error("Erro ao carregar metas dashboard", e);
			setAllData({});
			setMetaMes(null);
			setFeriadosSet(new Set());
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		const VERSION_KEY = "internal-static-data-version";
		carregar();

		const handleStaticDataUpdated = () => {
			carregar(true);
		};

		const handleStorageChange = (event) => {
			if (event.key !== VERSION_KEY) return;
			carregar(true);
		};

		window.addEventListener(
			INTERNAL_STATIC_DATA_UPDATED_EVENT,
			handleStaticDataUpdated,
		);
		window.addEventListener("storage", handleStorageChange);

		return () => {
			window.removeEventListener(
				INTERNAL_STATIC_DATA_UPDATED_EVENT,
				handleStaticDataUpdated,
			);
			window.removeEventListener("storage", handleStorageChange);
		};
	}, [carregar]);

	return {
		metaMes,
		allData,
		loading,
		feriadosSet,
		refetch: () => carregar(true),
	};
};
