import { invalidateDashboardDataCache } from "../pages/PainelPublico/hooks/useDashboardData";
import { invalidateInternalStaticDataCache } from "./internalStaticDataService";
import { requestVpsApi } from "./vpsApiClient";

let staticDataRegenerationPromise = null;

export async function regenerateStaticData(options = {}) {
	if (staticDataRegenerationPromise) {
		return staticDataRegenerationPromise;
	}

	staticDataRegenerationPromise = (async () => {
		const result = await requestVpsApi("/static/refresh", {
			method: "POST",
			body: JSON.stringify(options || {}),
		}).catch(() => ({
			generatedAt: new Date().toISOString(),
			refreshed: false,
		}));

		invalidateDashboardDataCache(result?.generatedAt || null);
		invalidateInternalStaticDataCache(result?.generatedAt || null);
		return result;
	})();

	try {
		return await staticDataRegenerationPromise;
	} finally {
		staticDataRegenerationPromise = null;
	}
}
