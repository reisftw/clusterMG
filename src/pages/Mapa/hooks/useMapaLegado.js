import { useCallback, useEffect, useState } from "react";
import { loadLegacyDashboardDoc } from "../utils/legacyMapaOS";

export function useMapaLegado(enabled = true) {
	const [summary, setSummary] = useState(null);
	const [meta, setMeta] = useState(null);
	const [loading, setLoading] = useState(enabled);

	const carregar = useCallback(async () => {
		if (!enabled) return;

		setLoading(true);
		try {
			const dashboard = await loadLegacyDashboardDoc();

			setSummary(dashboard?.summary || null);
			setMeta(dashboard?.meta || null);
		} catch (error) {
			console.error("[useMapaLegado] Erro ao carregar acervo legado:", error);
			setSummary(null);
			setMeta(null);
		} finally {
			setLoading(false);
		}
	}, [enabled]);

	useEffect(() => {
		carregar();
	}, [carregar]);

	return {
		summary,
		meta,
		loading,
		refetch: carregar,
	};
}
