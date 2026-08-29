import { useEffect, useState } from "react";
import {
	getInternalSnapshotSlice,
	INTERNAL_STATIC_DATA_UPDATED_EVENT,
	SNAPSHOT_DOMAINS,
} from "../../../services/internalStaticDataService";
import { listAllPublicVpsDocuments } from "../../../services/vpsApiClient";

async function loadOrdensFromVps() {
	try {
		return await listAllPublicVpsDocuments("ordens_abertas", {
			pageSize: 1000,
			max: 50000,
		});
	} catch (error) {
		console.warn("[useMapaOS] Falha ao buscar ordens_abertas na VPS.", error);
		return [];
	}
}

export function useMapaOS() {
	const [ordens, setOrdens] = useState([]);
	const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let active = true;
		const VERSION_KEY = "internal-static-data-version";

		async function loadOrdens(force = false) {
			setLoading(true);

			const staticSlice = await getInternalSnapshotSlice(
				SNAPSHOT_DOMAINS.OPERACIONAL,
				(payload) => payload?.mapa ?? null,
				{ force },
			);

			if (Array.isArray(staticSlice?.ordens) && staticSlice.ordens.length > 0) {
				if (!active) return;

				setOrdens(staticSlice.ordens);
				setUltimaAtualizacao(staticSlice?.meta || null);
				setLoading(false);
				return;
			}

			if (
				Array.isArray(staticSlice?.mapa?.ordens) &&
				staticSlice.mapa.ordens.length > 0
			) {
				if (!active) return;

				setOrdens(staticSlice.mapa.ordens);
				setUltimaAtualizacao(
					staticSlice.mapa?.meta || staticSlice?.meta || null,
				);
				setLoading(false);
				return;
			}

			const vpsOrdens = await loadOrdensFromVps();
			if (vpsOrdens.length > 0) {
				if (!active) return;

				setOrdens(vpsOrdens);
				setUltimaAtualizacao(staticSlice?.meta || null);
				setLoading(false);
				return;
			}

			if (!active) return;

			setOrdens([]);
			setUltimaAtualizacao(staticSlice?.meta || null);
			setLoading(false);
		}

		loadOrdens();

		const handleStaticDataUpdated = () => {
			loadOrdens(true);
		};

		const handleStorageChange = (event) => {
			if (event.key !== VERSION_KEY) return;
			loadOrdens(true);
		};

		window.addEventListener(
			INTERNAL_STATIC_DATA_UPDATED_EVENT,
			handleStaticDataUpdated,
		);
		window.addEventListener("storage", handleStorageChange);

		return () => {
			active = false;
			window.removeEventListener(
				INTERNAL_STATIC_DATA_UPDATED_EVENT,
				handleStaticDataUpdated,
			);
			window.removeEventListener("storage", handleStorageChange);
		};
	}, []);

	return {
		ordens,
		ultimaAtualizacao,
		loading,
	};
}
