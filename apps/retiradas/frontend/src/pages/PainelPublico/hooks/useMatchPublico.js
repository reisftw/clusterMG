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

function normalizeMatchSlice(slice) {
	if (!slice) return null;
	if (slice.data?.regionais || slice.data?.agentes || slice.data?.resumo) {
		return slice.data;
	}
	if (slice.regionais || slice.agentes || slice.resumo) return slice;
	if (Array.isArray(slice.ordens)) return buildMatchOSData(slice.ordens);
	if (Array.isArray(slice.data?.ordens))
		return buildMatchOSData(slice.data.ordens);
	return null;
}

function mergeMatchAgentes(matchData, agentesData) {
	if (!matchData && !agentesData) return null;

	const regionais = Array.isArray(matchData?.regionais)
		? matchData.regionais
		: [];
	let agentes = [];
	if (Array.isArray(matchData?.agentes) && matchData.agentes.length) {
		agentes = matchData.agentes;
	} else if (Array.isArray(agentesData?.agentes)) {
		agentes = agentesData.agentes;
	}

	const totalRegionais = regionais.length;
	const totalAgentes = agentes.reduce(
		(sum, item) => sum + Number(item.totalCidades || 0),
		0,
	);
	const totalCidades =
		regionais.reduce((sum, item) => sum + Number(item.totalCidades || 0), 0) +
		totalAgentes;
	const totalMatches =
		regionais.reduce((sum, item) => sum + Number(item.totalMatches || 0), 0) +
		agentes.reduce((sum, item) => sum + Number(item.totalMatches || 0), 0);

	return {
		...(matchData || {}),
		regionais,
		agentes,
		resumo: {
			...(matchData?.resumo || {}),
			totalRegionais,
			totalAgentes,
			totalCidades,
			totalMatches,
			totalRetiradasRelacionadas:
				sumRetiradasRelacionadas(regionais) + sumRetiradasRelacionadas(agentes),
		},
	};
}

function hasMatches(matchData) {
	return Number(matchData?.resumo?.totalMatches || 0) > 0;
}

function isCompactMatchData(matchData) {
	return Boolean(matchData?.compact);
}

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveMatchPublicoData({ detail, detailData, matchData }) {
	if (detail) {
		if (detailData) return detailData;
		return isCompactMatchData(matchData) ? null : matchData;
	}
	return hasMatches(matchData) ? matchData : null;
}

export function useMatchPublico(options = {}) {
	const detail = Boolean(options.detail);
	const { data, loading } = useDashboardData();
	const [detailState, setDetailState] = useState({
		version: "",
		data: null,
		loading: false,
	});
	const matchVersion =
		data?.matchOS?.meta?.generatedAt ||
		data?.matchOS?.data?.meta?.generatedAt ||
		data?.matchOS?.meta?.data ||
		data?.matchOS?.data?.meta?.data ||
		data?.generatedAt ||
		"";

	const matchData = useMemo(() => {
		const matchSliceData = normalizeMatchSlice(data?.matchOS);
		const agentesSlice = data?.agentesMatchOS || data?.matchAgentes || null;
		const agentesData = normalizeMatchSlice(agentesSlice);
		return mergeMatchAgentes(matchSliceData, agentesData);
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
				const fullMatchData = mergeMatchAgentes(
					normalizeMatchSlice(payload?.matchOS),
					normalizeMatchSlice(payload?.agentesMatchOS || payload?.matchAgentes),
				);
				setDetailState({
					version: matchVersion,
					data: fullMatchData,
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

	const ultimaAtualizacao = useMemo(
		() => data?.matchOS?.meta || data?.matchOS?.data?.meta || null,
		[data],
	);

	const detailData =
		detailState.version === matchVersion ? detailState.data : null;

	const resolvedData = resolveMatchPublicoData({ detail, detailData, matchData });

	return {
		data: resolvedData,
		ultimaAtualizacao,
		loading: loading || (detail && (detailState.loading || !resolvedData)),
	};
}
