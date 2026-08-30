import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "../../../services/vpsApiClient";
import { buildMatchOSData } from "../../Mapa/utils/matchOs";
import { useDashboardData } from "./useDashboardData";

function sumRetiradasRelacionadas(section = []) {
	return section.reduce(
		(totalSection, item) =>
			totalSection +
			(item.cidades || []).reduce(
				(totalCidades, cidade) =>
					totalCidades + Number(cidade.totalRetiradasRelacionadas || 0),
				0,
			),
		0,
	);
}

function normalizeAgentesSlice(slice) {
	if (!slice) return null;
	if (slice.data?.agentes || slice.data?.resumo) return slice.data;
	if (slice.agentes || slice.resumo) return slice;

	const ordens = Array.isArray(slice.ordens)
		? slice.ordens
		: Array.isArray(slice.data?.ordens)
			? slice.data.ordens
			: null;

	if (!ordens) return null;

	const raw = buildMatchOSData(ordens);
	return {
		agentes: raw.agentes,
		regionais: [],
		resumo: {
			...raw.resumo,
			totalRegionais: 0,
			totalCidades: raw.agentes.reduce(
				(sum, item) => sum + item.totalCidades,
				0,
			),
			totalMatches: raw.agentes.reduce(
				(sum, item) => sum + item.totalMatches,
				0,
			),
			totalRetiradasRelacionadas: sumRetiradasRelacionadas(raw.agentes),
		},
	};
}

function hasMatches(matchData) {
	return Number(matchData?.resumo?.totalMatches || 0) > 0;
}

function isCompactMatchData(matchData) {
	return Boolean(matchData?.compact);
}

export function useAgentesMatchPublico(options = {}) {
	const detail = Boolean(options.detail);
	const { data, loading } = useDashboardData();
	const [detailState, setDetailState] = useState({
		version: "",
		data: null,
		loading: false,
	});
	const matchVersion =
		data?.agentesMatchOS?.meta?.generatedAt ||
		data?.agentesMatchOS?.data?.meta?.generatedAt ||
		data?.agentesMatchOS?.meta?.data ||
		data?.agentesMatchOS?.data?.meta?.data ||
		data?.generatedAt ||
		"";

	const matchData = useMemo(() => {
		const slice = data?.agentesMatchOS || data?.matchAgentes || null;
		return normalizeAgentesSlice(slice);
	}, [data]);

	useEffect(() => {
		let active = true;
		if (!detail || loading) {
			return () => {
				active = false;
			};
		}

		const versionParam = encodeURIComponent(matchVersion || "latest");
		Promise.resolve()
			.then(() => {
				if (!active) return null;
				setDetailState((current) => ({
					...current,
					loading: current.version !== matchVersion,
				}));
				return fetch(
					`${getApiBaseUrl()}/public/dashboard?detail=match&v=${versionParam}`,
					{
						cache: "no-store",
						credentials: "include",
					},
				);
			})
			.then((response) => {
				if (!response) return null;
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				return response.json();
			})
			.then((payload) => {
				if (!active || !payload) return;
				const fullAgentesData = normalizeAgentesSlice(
					payload?.agentesMatchOS || payload?.matchAgentes,
				);
				setDetailState({
					version: matchVersion,
					data: fullAgentesData,
					loading: false,
				});
			})
			.catch(() => {
				if (!active) return;
				setDetailState((current) => ({ ...current, loading: false }));
			});

		return () => {
			active = false;
		};
	}, [detail, loading, matchVersion]);

	const ultimaAtualizacao = useMemo(() => {
		const slice = data?.agentesMatchOS || data?.matchAgentes || null;
		return slice?.meta || slice?.data?.meta || null;
	}, [data]);

	const detailData =
		detailState.version === matchVersion ? detailState.data : null;

	const resolvedData = detail
		? detailData || (isCompactMatchData(matchData) ? null : matchData)
		: hasMatches(matchData)
			? matchData
			: null;

	return {
		data: resolvedData,
		ultimaAtualizacao,
		loading: loading || (detail && (detailState.loading || !resolvedData)),
	};
}
