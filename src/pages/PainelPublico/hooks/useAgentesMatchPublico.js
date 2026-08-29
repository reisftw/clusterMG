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
	const [fallbackState, setFallbackState] = useState({
		version: "",
		data: null,
	});
	const matchVersion =
		data?.agentesMatchOS?.meta?.generatedAt ||
		data?.agentesMatchOS?.data?.meta?.generatedAt ||
		data?.agentesMatchOS?.meta?.data ||
		data?.agentesMatchOS?.data?.meta?.data ||
		data?.matchOS?.meta?.generatedAt ||
		data?.matchOS?.data?.meta?.generatedAt ||
		data?.generatedAt ||
		"";

	const matchData = useMemo(() => {
		const slice = data?.agentesMatchOS || data?.matchAgentes || null;
		return normalizeAgentesSlice(slice);
	}, [data]);

	useEffect(() => {
		let active = true;
		const hasEnoughData =
			hasMatches(matchData) && (!detail || !isCompactMatchData(matchData));
		if (loading || hasEnoughData) {
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
					data: ordens.length ? normalizeAgentesSlice({ ordens }) : null,
				});
			})
			.catch(() => {
				if (!active) return;
			});

		return () => {
			active = false;
		};
	}, [detail, loading, matchData, matchVersion]);

	const ultimaAtualizacao = useMemo(() => {
		const slice = data?.agentesMatchOS || data?.matchAgentes || null;
		return slice?.meta || slice?.data?.meta || null;
	}, [data]);

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
