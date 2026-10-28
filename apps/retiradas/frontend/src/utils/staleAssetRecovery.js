const ASSET_REFRESH_MARKER = "retiradas:asset-refresh-at";
const ASSET_REFRESH_COOLDOWN_MS = 30_000;

export function isStaleAssetError(error) {
	const message = String(error?.message || error || "").toLowerCase();
	return (
		message.includes("failed to fetch dynamically imported module") ||
		message.includes("importing a module script failed") ||
		message.includes("expected a javascript-or-wasm module script") ||
		message.includes("error loading dynamically imported module") ||
		message.includes("chunkloaderror") ||
		message.includes("loading chunk") ||
		message.includes("failed to fetch module script")
	);
}

export function reloadOnceForFreshAssets() {
	if (typeof window === "undefined") return false;
	const lastRefresh = Number(
		window.sessionStorage.getItem(ASSET_REFRESH_MARKER) || 0,
	);
	const now = Date.now();
	if (now - lastRefresh < ASSET_REFRESH_COOLDOWN_MS) return false;
	window.sessionStorage.setItem(ASSET_REFRESH_MARKER, String(now));
	window.location.reload();
	return true;
}
