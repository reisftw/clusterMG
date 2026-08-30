import { useEffect, useMemo, useState } from "react";
import { listAllPublicVpsDocuments } from "../../../services/vpsApiClient";
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
	const agentes =
		Array.isArray(matchData?.agentes) && matchData.agentes.length
			? matchData.agentes
			: Array.isArray(agentesData?.agentes)
				? agentesData.agentes
				: [];

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

export function useMatchPublico(options = {}) {
	const detail = Boolean(options.detail);
	const { data, loading } = useDashboardData();
	const [fallbackState, setFallbackState] = useState({
		version: "",
		data: null,
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
		const hasEnoughData =
			hasMatches(matchData) && (!detail || !isCompactMatchData(matchData));
		const shouldLoadDetailFallback =
			detail && isCompactMatchData(matchData) && !hasEnoughData;
		if (loading || hasEnoughData || !shouldLoadDetailFallback) {
			return () => {
				active = false;
			};
		}
		listAllPublicVpsDocuments("match_os_abertas", {
			pageSize: 1000,
			max: 50000,
		})
			.then((ordens) => {
				if (!active) return;
				setFallbackState({
					version: matchVersion,
					data: ordens.length ? buildMatchOSData(ordens) : null,
				});
			})
			.catch(() => {
				if (!active) return;
			});

		return () => {
			active = false;
		};
	}, [detail, loading, matchData, matchVersion]);

	const ultimaAtualizacao = useMemo(
		() => data?.matchOS?.meta || data?.matchOS?.data?.meta || null,
		[data],
	);

	const fallbackData =
		fallbackState.version === matchVersion ? fallbackState.data : null;

	const resolvedData =
		detail && isCompactMatchData(matchData)
			? fallbackData
			: hasMatches(matchData)
				? matchData
				: fallbackData;

	return {
		data: resolvedData,
		ultimaAtualizacao,
		loading:
			loading || (detail && isCompactMatchData(matchData) && !fallbackData),
	};
}
