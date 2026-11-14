import { requestVpsApi } from "../../../services/vpsApiClient";

export async function getPublicMaintenanceStatus() {
	const controller = new AbortController();
	const timer = window.setTimeout(() => controller.abort(), 5000);
	try {
		const response = await fetch(`${window.location.origin}/api/maintenance/status`, {
			cache: "no-store",
			credentials: "include",
			signal: controller.signal,
		});
		if (!response.ok) throw new Error(`Erro HTTP ${response.status}.`);
		return response.json();
	} finally {
		window.clearTimeout(timer);
	}
}

export function getMaintenanceDashboard(hours = 24) {
	return requestVpsApi(`/maintenance/dashboard?hours=${encodeURIComponent(hours)}`);
}

export function getMaintenanceHistory({ page = 1, limit = 10 } = {}) {
	const params = new URLSearchParams({ page: String(page), limit: String(limit) });
	return requestVpsApi(`/maintenance/history?${params.toString()}`);
}

export function activateMaintenance(payload) {
	return requestVpsApi("/maintenance/activate", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function deactivateMaintenance() {
	return requestVpsApi("/maintenance/deactivate", {
		method: "POST",
		body: "{}",
	});
}

export function getMobileAppDashboard() {
	return requestVpsApi("/maintenance/app");
}

export function uploadMobileApp({ apk, versionName, versionCode, notes }) {
	const body = new FormData();
	body.append("apk", apk);
	body.append("versionName", versionName);
	if (versionCode) body.append("versionCode", versionCode);
	if (notes) body.append("notes", notes);
	return requestVpsApi("/maintenance/app/upload", {
		method: "POST",
		body,
	});
}

export function updateMobileAppReleaseNotes(releaseId, notes) {
	return requestVpsApi(`/maintenance/app/releases/${encodeURIComponent(releaseId)}/notes`, {
		method: "PATCH",
		body: JSON.stringify({ notes }),
	});
}
