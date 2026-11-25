import { useCallback, useEffect, useState } from "react";
import { subscribeRealtimeTopics } from "../../../services/realtimeEvents";
import { getApiBaseUrl } from "../../../services/vpsApiClient";

export function useCancellationCities(enabled = true, year = new Date().getFullYear()) {
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(enabled);
	const [error, setError] = useState("");

	const load = useCallback(async (silent = false) => {
		if (!enabled) return;
		if (!silent) setLoading(true);
		try {
			const response = await fetch(
				`${getApiBaseUrl()}/public/cancellations/cities?year=${encodeURIComponent(year)}&v=${Date.now()}`,
				{ cache: "no-store" },
			);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			setData(await response.json());
			setError("");
		} catch (caught) {
			setError(caught?.message || "Não foi possível carregar os cancelamentos.");
		} finally {
			setLoading(false);
		}
	}, [enabled, year]);

	useEffect(() => {
		if (!enabled) return undefined;
		void load(false);
		const interval = window.setInterval(() => void load(true), 60_000);
		const unsubscribe = subscribeRealtimeTopics(
			["cancellations"],
			() => void load(true),
			{ debounceMs: 500, public: true },
		);
		return () => {
			window.clearInterval(interval);
			unsubscribe();
		};
	}, [enabled, load]);

	return {
		data,
		loading,
		error,
		fbStatus: error ? `Falha ao atualizar: ${error}` : "Cancelamentos sincronizados",
		lastUpdate: data?.updatedAt || null,
		refresh: () => load(false),
	};
}
