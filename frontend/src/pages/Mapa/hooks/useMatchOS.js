import { useMemo } from "react";
import { useDashboardData } from "../../PainelPublico/hooks/useDashboardData";

export function useMatchOS() {
	const { data, loading } = useDashboardData();
	const ordens = useMemo(() => {
		if (Array.isArray(data?.matchOS?.ordens)) return data.matchOS.ordens;
		if (Array.isArray(data?.matchOS?.data?.ordens))
			return data.matchOS.data.ordens;
		return [];
	}, [data]);

	const ultimaAtualizacao = useMemo(
		() => data?.matchOS?.meta || data?.matchOS?.data?.meta || null,
		[data],
	);
	const mensagens = useMemo(
		() =>
			data?.matchOS?.meta?.mensagens ||
			data?.matchOS?.data?.meta?.mensagens ||
			null,
		[data],
	);

	return {
		ordens,
		ultimaAtualizacao,
		mensagens,
		loading,
	};
}
