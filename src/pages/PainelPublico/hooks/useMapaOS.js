import { useEffect, useMemo, useState } from "react";
import { listAllPublicVpsDocuments } from "../../../services/vpsApiClient";
import { buildPublicMapaSnapshot } from "../../Mapa/utils/mapaUtils";
import { useDashboardData } from "./useDashboardData";

const MONTHS = [
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

function resolveMapaSummary(mapaSlice) {
	if (!mapaSlice) return null;
	if (mapaSlice.summary) return mapaSlice.summary;
	if (mapaSlice.data?.summary) return mapaSlice.data.summary;
	if (Array.isArray(mapaSlice.ordens))
		return buildPublicMapaSnapshot(mapaSlice.ordens);
	if (Array.isArray(mapaSlice.data?.ordens)) {
		return buildPublicMapaSnapshot(mapaSlice.data.ordens);
	}
	return null;
}

function hasMapaOrders(summary) {
	return Number(summary?.totalOrdens || summary?.kpis?.total || 0) > 0;
}

export function useMapaOS(enabled = true) {
	const { data, loading, error } = useDashboardData();
	const [fallbackSummary, setFallbackSummary] = useState(null);

	const dashboardSummary = useMemo(() => {
		if (!enabled || !data?.mapa) return null;
		return resolveMapaSummary(data.mapa);
	}, [data, enabled]);

	useEffect(() => {
		let active = true;
		if (!enabled || loading || hasMapaOrders(dashboardSummary)) {
			return () => {
				active = false;
			};
		}
		listAllPublicVpsDocuments("ordens_abertas", { pageSize: 1000, max: 50000 })
			.then((ordens) => {
				if (!active) return;
				setFallbackSummary(
					ordens.length ? buildPublicMapaSnapshot(ordens) : null,
				);
			})
			.catch(() => {
				if (!active) return;
			});

		return () => {
			active = false;
		};
	}, [dashboardSummary, enabled, loading]);

	const allData = useMemo(() => {
		if (!enabled) return {};

		const summary = hasMapaOrders(dashboardSummary)
			? dashboardSummary
			: fallbackSummary;
		if (!summary) return {};

		const replicated = {};
		MONTHS.forEach((month) => {
			replicated[month] = { summary };
		});
		return replicated;
	}, [dashboardSummary, enabled, fallbackSummary]);

	const lastUpdate = useMemo(
		() => data?.mapa?.meta || data?.mapa?.data?.meta || null,
		[data],
	);

	const fbStatus = error
		? "Erro ao carregar dados"
		: loading
			? "Buscando resumo publico do mapa..."
			: allData?.Janeiro?.summary?.totalOrdens
				? "Sincronizado"
				: "Nenhuma O.S em aberto encontrada";

	return {
		allData,
		loading: enabled ? loading : false,
		fbStatus,
		lastUpdate,
	};
}
