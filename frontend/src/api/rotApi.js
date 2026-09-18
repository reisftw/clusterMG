// Sessao da Operacao fica em cookie HttpOnly (`operacao_session`).
// O localStorage guarda apenas dados de UX/offline, nunca credencial.
const TOKEN_KEY = "rot-auth-token";

export function getRotToken() {
	return "";
}

export function setRotToken(token) {
	window.localStorage.removeItem(TOKEN_KEY);
}

export async function requestRotApi(path, options = {}) {
	const response = await fetch(`/api${path}`, {
		...options,
		cache: "no-store",
		credentials: "include",
		headers: {
			...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
			"X-Requested-With": "XMLHttpRequest",
			...(options.headers || {}),
		},
	});
	const data = await response.json().catch(() => null);
	if (!response.ok || data?.ok === false) {
		// Sessao expirada/invalida: avisa o RotAuthProvider pra derrubar a sessao.
		// PrivateRoute reage sozinho e manda pro login, sem reload manual.
		if (response.status === 401 && !path.startsWith("/auth/login")) {
			setRotToken("");
			window.dispatchEvent(new CustomEvent("rot-session-expired"));
		}
		const error = new Error(data?.error || `Erro HTTP ${response.status}.`);
		error.status = response.status;
		error.data = data;
		throw error;
	}
	return data;
}

// Login pode voltar de duas formas: sessao direta ({user}) quando o
// usuario nao tem MFA por e-mail habilitado, ou um desafio
// ({mfaRequired: true, challengeId, maskedEmail}) que precisa passar por
// verifyRotMfa antes de ganhar sessao. O caller (RotAuthContext) decide o
// que fazer com cada formato.
export async function loginRot(username, password) {
	const data = await requestRotApi("/auth/login", {
		method: "POST",
		body: JSON.stringify({ username, password }),
	});
	if (data.mfaRequired) return data;
	return { user: data.user };
}

export async function loginRotGoogle(idToken) {
	const data = await requestRotApi("/auth/login/google", {
		method: "POST",
		body: JSON.stringify({ idToken }),
	});
	if (data.mfaRequired) return data;
	return { user: data.user };
}

// Publica (sem sessao) — LoginScreen consulta pra saber se mostra o botao
// "Entrar com Google" e com qual clientId, sem depender de env var de build.
export async function fetchRotGoogleAuthConfig() {
	const data = await requestRotApi("/auth/google/config");
	return { enabled: Boolean(data.enabled), clientId: data.clientId || "" };
}

export async function verifyRotMfa(challengeId, code) {
	const data = await requestRotApi("/auth/verify-mfa", {
		method: "POST",
		body: JSON.stringify({ challengeId, code }),
	});
	return data.user;
}

export async function fetchRotMe() {
	const data = await requestRotApi("/auth/me");
	return data.user;
}

export async function logoutRot() {
	await requestRotApi("/auth/logout", { method: "POST" }).catch(() => null);
	setRotToken("");
}

export async function fetchRotOperationDashboard(operation) {
	return requestRotApi(`/admin/dashboard/${encodeURIComponent(operation)}`);
}

export async function changeRotPassword(currentPassword, newPassword) {
	return requestRotApi("/auth/change-password", {
		method: "POST",
		body: JSON.stringify({ currentPassword, newPassword }),
	});
}

export async function forgotRotPassword(username) {
	return requestRotApi("/auth/forgot-password", {
		method: "POST",
		body: JSON.stringify({ username }),
	});
}

export async function resetRotPassword(token, newPassword) {
	return requestRotApi("/auth/reset-password", {
		method: "POST",
		body: JSON.stringify({ token, newPassword }),
	});
}

export async function uploadRotAvatar(file) {
	const formData = new FormData();
	formData.append("avatar", file);
	const response = await fetch("/api/auth/avatar", {
		method: "POST",
		body: formData,
		credentials: "include",
		headers: { "X-Requested-With": "XMLHttpRequest" },
	});
	const data = await response.json().catch(() => null);
	if (!response.ok || data?.ok === false) {
		throw new Error(data?.error || `Erro HTTP ${response.status}.`);
	}
	return data.avatarUrl;
}

export async function fetchRotUsers() {
	const data = await requestRotApi("/admin/users");
	return data.items;
}

export async function fetchRotRoles() {
	const data = await requestRotApi("/admin/users/roles");
	return data.items;
}

export async function createRotUser(payload) {
	const data = await requestRotApi("/admin/users", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data;
}

export async function updateRotUser(id, payload) {
	const data = await requestRotApi(`/admin/users/${encodeURIComponent(id)}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
	return data.user;
}

export async function resetRotUserPassword(id) {
	return requestRotApi(`/admin/users/${encodeURIComponent(id)}/reset-password`, {
		method: "POST",
		body: JSON.stringify({}),
	});
}

export async function deactivateRotUser(id) {
	return requestRotApi(`/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRotRolesManaged() {
	const data = await requestRotApi("/admin/roles");
	return data.items;
}

export async function createRotRole(payload) {
	const data = await requestRotApi("/admin/roles", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data.role;
}

export async function updateRotRole(id, payload) {
	const data = await requestRotApi(`/admin/roles/${encodeURIComponent(id)}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
	return data.role;
}

export async function deleteRotRole(id) {
	return requestRotApi(`/admin/roles/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRotRegionals() {
	const data = await requestRotApi("/admin/regionals");
	return data.items;
}

export async function createRotRegional(payload) {
	const data = await requestRotApi("/admin/regionals", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data.regional;
}

export async function updateRotRegional(id, payload) {
	const data = await requestRotApi(`/admin/regionals/${encodeURIComponent(id)}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
	return data.regional;
}

export async function deleteRotRegional(id) {
	return requestRotApi(`/admin/regionals/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function createRotCity(regionalId, payload) {
	const data = await requestRotApi(`/admin/regionals/${encodeURIComponent(regionalId)}/cities`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data.city;
}

export async function updateRotCity(cityId, payload) {
	const data = await requestRotApi(`/admin/regionals/cities/${encodeURIComponent(cityId)}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
	return data.city;
}

export async function deleteRotCity(cityId) {
	return requestRotApi(`/admin/regionals/cities/${encodeURIComponent(cityId)}`, { method: "DELETE" });
}

export async function fetchRotAgents() {
	const data = await requestRotApi("/admin/agents");
	return data.items;
}

export async function createRotAgent(payload) {
	const data = await requestRotApi("/admin/agents", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data.agent;
}

export async function updateRotAgent(id, payload) {
	const data = await requestRotApi(`/admin/agents/${encodeURIComponent(id)}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
	return data.agent;
}

export async function deleteRotAgent(id) {
	return requestRotApi(`/admin/agents/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRotCompanies() {
	const data = await requestRotApi("/admin/companies");
	return data.items;
}

export async function createRotCompany(payload) {
	const data = await requestRotApi("/admin/companies", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data.company;
}

export async function updateRotCompany(id, payload) {
	const data = await requestRotApi(`/admin/companies/${encodeURIComponent(id)}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
	return data.company;
}

export async function deleteRotCompany(id) {
	return requestRotApi(`/admin/companies/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRotTechnicians() {
	return requestRotApi("/admin/technicians");
}

export async function createRotTechnician(payload) {
	const data = await requestRotApi("/admin/technicians", { method: "POST", body: JSON.stringify(payload) });
	return data.technician;
}

export async function updateRotTechnician(id, payload) {
	const data = await requestRotApi(`/admin/technicians/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.technician;
}

export async function deleteRotTechnician(id) {
	return requestRotApi(`/admin/technicians/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRotStockAdjustments() {
	const data = await requestRotApi("/admin/stock-adjustments");
	return data.items;
}

export async function createRotStockAdjustment(payload) {
	const data = await requestRotApi("/admin/stock-adjustments", { method: "POST", body: JSON.stringify(payload) });
	return data.item;
}

export async function updateRotStockAdjustment(id, payload) {
	const data = await requestRotApi(`/admin/stock-adjustments/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.item;
}

export async function deleteRotStockAdjustment(id) {
	return requestRotApi(`/admin/stock-adjustments/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRotTechDeliveries() {
	const data = await requestRotApi("/admin/tech-deliveries");
	return data.items;
}

export async function createRotTechDelivery(payload) {
	const data = await requestRotApi("/admin/tech-deliveries", { method: "POST", body: JSON.stringify(payload) });
	return data.item;
}

export async function updateRotTechDelivery(id, payload) {
	const data = await requestRotApi(`/admin/tech-deliveries/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.item;
}

export async function deleteRotTechDelivery(id) {
	return requestRotApi(`/admin/tech-deliveries/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRotBagAudits() {
	const data = await requestRotApi("/admin/bag-audit");
	return data.items;
}

export async function createRotBagAudit(payload) {
	const data = await requestRotApi("/admin/bag-audit", { method: "POST", body: JSON.stringify(payload) });
	return data.item;
}

export async function updateRotBagAudit(id, payload) {
	const data = await requestRotApi(`/admin/bag-audit/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.item;
}

export async function deleteRotBagAudit(id) {
	return requestRotApi(`/admin/bag-audit/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRotAuditReports() {
	return requestRotApi("/admin/audit-reports");
}

export async function fetchOperationalMetricCatalog() {
	const data = await requestRotApi("/admin/operational-intelligence/catalog");
	return data.items;
}

export async function fetchOperationalProviderStatus() {
	const data = await requestRotApi("/admin/operational-intelligence/providers/status");
	return data.items;
}

export async function fetchOperationalSummary({ domain = "ROT", from, to } = {}) {
	const params = new URLSearchParams({ domain });
	if (from) params.set("from", from);
	if (to) params.set("to", to);
	return requestRotApi(`/admin/operational-intelligence/metrics/summary?${params.toString()}`);
}

export async function fetchOperationalEvents({ domain = "ROT", from, to, limit = 30 } = {}) {
	const params = new URLSearchParams({ domain, limit: String(limit) });
	if (from) params.set("from", from);
	if (to) params.set("to", to);
	return requestRotApi(`/admin/operational-intelligence/events?${params.toString()}`);
}

export async function fetchOperationalMetricDrilldown({ domain = "ROT", code, from, to, limit = 100 } = {}) {
	const params = new URLSearchParams({ domain, limit: String(limit) });
	if (from) params.set("from", from);
	if (to) params.set("to", to);
	return requestRotApi(`/admin/operational-intelligence/metrics/${encodeURIComponent(code)}/drilldown?${params.toString()}`);
}

export async function fetchOperationalJourney({ domain = "ROT", from, to, technicianId } = {}) {
	const params = new URLSearchParams({ domain });
	if (from) params.set("from", from);
	if (to) params.set("to", to);
	if (technicianId) params.set("technicianId", technicianId);
	return requestRotApi(`/admin/operational-intelligence/journey?${params.toString()}`);
}

export async function fetchOperationalPending({ domain = "ROT", from, to } = {}) {
	const params = new URLSearchParams({ domain });
	if (from) params.set("from", from);
	if (to) params.set("to", to);
	return requestRotApi(`/admin/operational-intelligence/pending?${params.toString()}`);
}

export async function fetchOperationalCockpit({ domain = "ROT", from, to } = {}) {
	const params = new URLSearchParams({ domain });
	if (from) params.set("from", from);
	if (to) params.set("to", to);
	return requestRotApi(`/admin/operational-intelligence/cockpit?${params.toString()}`);
}

export async function fetchOperationalControlTower({ domain = "ROT", from, to } = {}) {
	const params = new URLSearchParams({ domain });
	if (from) params.set("from", from);
	if (to) params.set("to", to);
	return requestRotApi(`/admin/operational-intelligence/control-tower?${params.toString()}`);
}

export async function fetchOperationalHealthScore({ domain = "ROT", from, to } = {}) {
	const params = new URLSearchParams({ domain });
	if (from) params.set("from", from);
	if (to) params.set("to", to);
	return requestRotApi(`/admin/operational-intelligence/health-score?${params.toString()}`);
}

export async function fetchRotAppearance() {
	return requestRotApi("/admin/settings/appearance");
}

export async function saveRotAppearance(payload) {
	return requestRotApi("/admin/settings/appearance", {
		method: "PUT",
		body: JSON.stringify(payload),
	});
}

export async function fetchRotMenuSettings() {
	const data = await requestRotApi("/admin/settings/menu");
	return { menu: data.menu, defaults: data.defaults };
}

export async function saveRotMenuSettings(menu) {
	const data = await requestRotApi("/admin/settings/menu", {
		method: "PUT",
		body: JSON.stringify({ menu }),
	});
	return { menu: data.menu, defaults: data.defaults };
}

export async function fetchRotEmailSettings() {
	const data = await requestRotApi("/admin/settings/email");
	return data.email;
}

export async function saveRotEmailSettings(payload) {
	const data = await requestRotApi("/admin/settings/email", {
		method: "PUT",
		body: JSON.stringify(payload),
	});
	return data.email;
}

export async function sendRotEmailTest(to) {
	return requestRotApi("/admin/settings/email/test", {
		method: "POST",
		body: JSON.stringify({ to }),
	});
}

export async function uploadRotDefaultAvatar(file) {
	const formData = new FormData();
	formData.append("avatar", file);
	const response = await fetch("/api/admin/settings/appearance/avatar", {
		method: "POST",
		body: formData,
		credentials: "include",
		headers: { "X-Requested-With": "XMLHttpRequest" },
	});
	const data = await response.json().catch(() => null);
	if (!response.ok || data?.ok === false) {
		throw new Error(data?.error || `Erro HTTP ${response.status}.`);
	}
	return data.defaultAvatarUrl;
}

export async function fetchRotNotifications() {
	const data = await requestRotApi("/auth/notifications");
	return data.items;
}

export async function saveRotMfaPreference(enabled, currentPassword) {
	return requestRotApi("/auth/mfa-preference", {
		method: "PUT",
		body: JSON.stringify({ enabled, currentPassword }),
	});
}

export async function fetchRotIntegrations() {
	const data = await requestRotApi("/admin/integrations");
	return data.items;
}

export async function saveRotIntegration(provider, payload) {
	return requestRotApi(`/admin/integrations/${encodeURIComponent(provider)}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
}

export async function fetchRotOauthConfig(provider) {
	const data = await requestRotApi(`/admin/oauth/${encodeURIComponent(provider)}`);
	return data.config;
}

export async function saveRotOauthConfig(provider, payload) {
	const data = await requestRotApi(`/admin/oauth/${encodeURIComponent(provider)}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
	return data.config;
}

export async function fetchRotQrCodes() {
	const data = await requestRotApi("/admin/qrcodes");
	return data.items;
}

export async function createRotQrCode(payload) {
	const data = await requestRotApi("/admin/qrcodes", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data.qrcode;
}

export async function updateRotQrCode(id, payload) {
	const data = await requestRotApi(`/admin/qrcodes/${encodeURIComponent(id)}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
	return data.qrcode;
}

export async function deleteRotQrCode(id) {
	return requestRotApi(`/admin/qrcodes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Sem token — pagina publica do QR Code (link-tree), acessivel por
// qualquer um que tenha o link/leia o QR fisico.
export async function fetchPublicQrCode(id) {
	const response = await fetch(`/api/public/qr/${encodeURIComponent(id)}`, { cache: "no-store" });
	const data = await response.json().catch(() => null);
	if (!response.ok || data?.ok === false) {
		const error = new Error(data?.error || `Erro HTTP ${response.status}.`);
		error.status = response.status;
		throw error;
	}
	return data.qrcode;
}

export async function fetchRotAuditLogs({ limit = 30, offset = 0, entity = "", action = "", q = "" } = {}) {
	const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
	if (entity) params.set("entity", entity);
	if (action) params.set("action", action);
	if (q) params.set("q", q);
	return requestRotApi(`/admin/audit-logs?${params.toString()}`);
}

export async function fetchRotAuditLogEntities() {
	const data = await requestRotApi("/admin/audit-logs/entities");
	return data.items;
}

export async function fetchRotHolidays() {
	const data = await requestRotApi("/admin/holidays");
	return data.items;
}

export async function createRotHoliday(payload) {
	const data = await requestRotApi("/admin/holidays", { method: "POST", body: JSON.stringify(payload) });
	return data.holiday;
}

export async function updateRotHoliday(id, payload) {
	const data = await requestRotApi(`/admin/holidays/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.holiday;
}

export async function deleteRotHoliday(id) {
	return requestRotApi(`/admin/holidays/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRotNotices() {
	const data = await requestRotApi("/admin/notices");
	return data.items;
}

export async function createRotNotice({ title, content, targetRegionalId, imageFile }) {
	const formData = new FormData();
	formData.append("title", title);
	formData.append("content", content || "");
	formData.append("targetRegionalId", targetRegionalId || "GLOBAL");
	if (imageFile) formData.append("image", imageFile);
	const response = await fetch("/api/admin/notices", {
		method: "POST",
		body: formData,
		credentials: "include",
		headers: { "X-Requested-With": "XMLHttpRequest" },
	});
	const data = await response.json().catch(() => null);
	if (!response.ok || data?.ok === false) throw new Error(data?.error || `Erro HTTP ${response.status}.`);
	return data.notice;
}

export async function deleteRotNotice(id) {
	return requestRotApi(`/admin/notices/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRotKeys() {
	const data = await requestRotApi("/admin/keys");
	return data.items;
}

export async function fetchRotKeyHistory(id) {
	const data = await requestRotApi(`/admin/keys/${encodeURIComponent(id)}/history`);
	return data.items;
}

export async function createRotKey(payload) {
	const data = await requestRotApi("/admin/keys", { method: "POST", body: JSON.stringify(payload) });
	return data.key;
}

export async function updateRotKey(id, payload) {
	const data = await requestRotApi(`/admin/keys/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.key;
}

export async function deleteRotKey(id) {
	return requestRotApi(`/admin/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function takeRotKey(id) {
	const data = await requestRotApi(`/admin/keys/${encodeURIComponent(id)}/take`, { method: "POST" });
	return data.key;
}

export async function returnRotKey(id) {
	const data = await requestRotApi(`/admin/keys/${encodeURIComponent(id)}/return`, { method: "POST" });
	return data.key;
}

export async function approveRotKeyReturn(id) {
	const data = await requestRotApi(`/admin/keys/${encodeURIComponent(id)}/approve-return`, { method: "POST" });
	return data.key;
}

export async function rejectRotKeyReturn(id) {
	const data = await requestRotApi(`/admin/keys/${encodeURIComponent(id)}/reject-return`, { method: "POST" });
	return data.key;
}

export async function fetchRotMaterialCatalog() {
	const data = await requestRotApi("/admin/materials/catalog");
	return data.items;
}

export async function createRotMaterialCatalogItem(payload) {
	const data = await requestRotApi("/admin/materials/catalog", { method: "POST", body: JSON.stringify(payload) });
	return data.item;
}

export async function updateRotMaterialCatalogItem(id, payload) {
	const data = await requestRotApi(`/admin/materials/catalog/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.item;
}

export async function deleteRotMaterialCatalogItem(id) {
	return requestRotApi(`/admin/materials/catalog/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRotMaterials() {
	return requestRotApi("/admin/materials");
}

export async function fetchRotSupplyHistory(techId) {
	const data = await requestRotApi(`/admin/materials/history/${encodeURIComponent(techId)}`);
	return data.items;
}

export async function sendRotSupply(payload) {
	const data = await requestRotApi("/admin/materials/send", { method: "POST", body: JSON.stringify(payload) });
	return data.supply;
}

export async function acceptRotSupply(id, signature) {
	const data = await requestRotApi(`/admin/materials/${encodeURIComponent(id)}/accept`, { method: "POST", body: JSON.stringify({ signature }) });
	return data.supply;
}

export async function deleteRotSupply(id) {
	return requestRotApi(`/admin/materials/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function deleteRotSupplyHistory(id) {
	return requestRotApi(`/admin/materials/history/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function createRotChecklist(payload) {
	const data = await requestRotApi("/admin/materials/checklists", { method: "POST", body: JSON.stringify(payload) });
	return data.checklist;
}

export async function approveRotChecklist(id, signature) {
	const data = await requestRotApi(`/admin/materials/checklists/${encodeURIComponent(id)}/approve`, { method: "POST", body: JSON.stringify({ signature }) });
	return data.checklist;
}

export async function deleteRotChecklist(id) {
	return requestRotApi(`/admin/materials/checklists/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRotFleet() {
	return requestRotApi("/admin/fleet");
}

export async function createRotVehicle(payload) {
	const data = await requestRotApi("/admin/fleet", { method: "POST", body: JSON.stringify(payload) });
	return data.vehicle;
}

export async function updateRotVehicle(id, payload) {
	const data = await requestRotApi(`/admin/fleet/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.vehicle;
}

export async function deleteRotVehicle(id) {
	return requestRotApi(`/admin/fleet/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function assignRotVehicleResponsible(id, responsibleId) {
	const data = await requestRotApi(`/admin/fleet/${encodeURIComponent(id)}/responsible`, { method: "PUT", body: JSON.stringify({ responsibleId }) });
	return data.vehicle;
}

export async function createRotVehicleClaim(vehicleId, payload) {
	const data = await requestRotApi(`/admin/fleet/${encodeURIComponent(vehicleId)}/claims`, { method: "POST", body: JSON.stringify(payload) });
	return data.claim;
}

export async function deleteRotVehicleClaim(claimId) {
	return requestRotApi(`/admin/fleet/claims/${encodeURIComponent(claimId)}`, { method: "DELETE" });
}

export async function createRotVehicleMaintenance(vehicleId, payload) {
	const data = await requestRotApi(`/admin/fleet/${encodeURIComponent(vehicleId)}/maintenances`, { method: "POST", body: JSON.stringify(payload) });
	return data.maintenance;
}

export async function finishRotVehicleMaintenance(maintenanceId, payload) {
	const data = await requestRotApi(`/admin/fleet/maintenances/${encodeURIComponent(maintenanceId)}/finish`, { method: "POST", body: JSON.stringify(payload) });
	return data.maintenance;
}

export async function deleteRotVehicleMaintenance(maintenanceId) {
	return requestRotApi(`/admin/fleet/maintenances/${encodeURIComponent(maintenanceId)}`, { method: "DELETE" });
}

export async function createRotWorkshop(payload) {
	const data = await requestRotApi("/admin/fleet/workshops", { method: "POST", body: JSON.stringify(payload) });
	return data.workshop;
}

export async function updateRotWorkshop(id, payload) {
	const data = await requestRotApi(`/admin/fleet/workshops/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.workshop;
}

export async function deleteRotWorkshop(id) {
	return requestRotApi(`/admin/fleet/workshops/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// --- Frotas Fase 1: KM, transferência/custódia, bloqueio, inativação, documentos, Ficha 360 ---

export async function fetchRotVehicleDetail(vehicleId) {
	return requestRotApi(`/admin/fleet/${encodeURIComponent(vehicleId)}/detail`);
}

export async function recordRotVehicleKm(vehicleId, payload) {
	const data = await requestRotApi(`/admin/fleet/${encodeURIComponent(vehicleId)}/km`, { method: "POST", body: JSON.stringify(payload) });
	return data.reading;
}

export async function correctRotVehicleKm(vehicleId, payload) {
	const data = await requestRotApi(`/admin/fleet/${encodeURIComponent(vehicleId)}/km/correct`, { method: "POST", body: JSON.stringify(payload) });
	return data.reading;
}

export async function transferRotVehicle(vehicleId, payload) {
	const data = await requestRotApi(`/admin/fleet/${encodeURIComponent(vehicleId)}/transfer`, { method: "POST", body: JSON.stringify(payload) });
	return data.movement;
}

export async function confirmRotVehicleMovement(movementId, payload) {
	const data = await requestRotApi(`/admin/fleet/movements/${encodeURIComponent(movementId)}/confirm`, { method: "POST", body: JSON.stringify(payload) });
	return data.movement;
}

export async function cancelRotVehicleMovement(movementId) {
	return requestRotApi(`/admin/fleet/movements/${encodeURIComponent(movementId)}/cancel`, { method: "POST" });
}

export async function returnRotVehicleToBase(vehicleId, payload) {
	const data = await requestRotApi(`/admin/fleet/${encodeURIComponent(vehicleId)}/return-to-base`, { method: "POST", body: JSON.stringify(payload) });
	return data.vehicle;
}

export async function retrieveRotVehicleFromBase(vehicleId, payload) {
	const data = await requestRotApi(`/admin/fleet/${encodeURIComponent(vehicleId)}/retrieve-from-base`, { method: "POST", body: JSON.stringify(payload) });
	return data.vehicle;
}

export async function blockRotVehicle(vehicleId, payload) {
	const data = await requestRotApi(`/admin/fleet/${encodeURIComponent(vehicleId)}/block`, { method: "POST", body: JSON.stringify(payload) });
	return data.vehicle;
}

export async function unblockRotVehicle(vehicleId, payload) {
	const data = await requestRotApi(`/admin/fleet/${encodeURIComponent(vehicleId)}/unblock`, { method: "POST", body: JSON.stringify(payload) });
	return data.vehicle;
}

export async function inactivateRotVehicle(vehicleId, payload) {
	const data = await requestRotApi(`/admin/fleet/${encodeURIComponent(vehicleId)}/inactivate`, { method: "POST", body: JSON.stringify(payload) });
	return data.vehicle;
}

export async function fetchRotVehicleDocuments(vehicleId) {
	const data = await requestRotApi(`/admin/fleet/${encodeURIComponent(vehicleId)}/documents`);
	return data.items || [];
}

export async function createRotVehicleDocument(vehicleId, payload) {
	const data = await requestRotApi(`/admin/fleet/${encodeURIComponent(vehicleId)}/documents`, { method: "POST", body: JSON.stringify(payload) });
	return data.item;
}

export async function updateRotVehicleDocument(documentId, payload) {
	const data = await requestRotApi(`/admin/fleet/documents/${encodeURIComponent(documentId)}`, { method: "PATCH", body: JSON.stringify(payload) });
	return data.item;
}

export async function deleteRotVehicleDocument(documentId) {
	return requestRotApi(`/admin/fleet/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
}

export async function fetchRotEquipments() {
	return requestRotApi("/admin/equipments");
}

export async function createRotEquipment(payload) {
	const data = await requestRotApi("/admin/equipments", { method: "POST", body: JSON.stringify(payload) });
	return data.equipment;
}

export async function updateRotEquipment(id, payload) {
	const data = await requestRotApi(`/admin/equipments/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.equipment;
}

export async function deleteRotEquipment(id) {
	return requestRotApi(`/admin/equipments/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function assignRotEquipmentResponsible(id, techId) {
	const data = await requestRotApi(`/admin/equipments/${encodeURIComponent(id)}/responsible`, { method: "PUT", body: JSON.stringify({ techId }) });
	return data.equipment;
}

export async function createRotEquipmentAudit(id, payload) {
	const data = await requestRotApi(`/admin/equipments/${encodeURIComponent(id)}/audits`, { method: "POST", body: JSON.stringify(payload) });
	return data.audit;
}

export async function fetchRotServiceTypes() {
	const data = await requestRotApi("/admin/service-types");
	return data.items;
}

export async function createRotServiceType(payload) {
	const data = await requestRotApi("/admin/service-types", { method: "POST", body: JSON.stringify(payload) });
	return data.item;
}

export async function updateRotServiceType(id, payload) {
	const data = await requestRotApi(`/admin/service-types/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.item;
}

export async function deleteRotServiceType(id) {
	return requestRotApi(`/admin/service-types/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRotTickets() {
	return requestRotApi("/admin/tickets");
}

export async function createRotTicket(payload) {
	const data = await requestRotApi("/admin/tickets", { method: "POST", body: JSON.stringify(payload) });
	return data.ticket;
}

export async function updateRotTicket(id, payload) {
	const data = await requestRotApi(`/admin/tickets/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.ticket;
}

export async function deleteRotTicket(id) {
	return requestRotApi(`/admin/tickets/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function importRotTickets(rows) {
	return requestRotApi("/admin/tickets/import", { method: "POST", body: JSON.stringify({ rows }) });
}

export async function fetchRotAbsences() {
	return requestRotApi("/admin/absences");
}

export async function createRotAbsence(payload) {
	const data = await requestRotApi("/admin/absences", { method: "POST", body: JSON.stringify(payload) });
	return data.absence;
}

export async function requestRotAbsence(payload) {
	const data = await requestRotApi("/admin/absences/request", { method: "POST", body: JSON.stringify(payload) });
	return data.absence;
}

export async function decideRotAbsence(id, approved) {
	const data = await requestRotApi(`/admin/absences/${encodeURIComponent(id)}/decide`, { method: "POST", body: JSON.stringify({ approved }) });
	return data.absence;
}

export async function deleteRotAbsence(id) {
	return requestRotApi(`/admin/absences/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRotShifts() {
	return requestRotApi("/admin/shifts");
}

export async function createRotShift(payload) {
	const data = await requestRotApi("/admin/shifts", { method: "POST", body: JSON.stringify(payload) });
	return data.shift;
}

export async function updateRotShift(id, payload) {
	const data = await requestRotApi(`/admin/shifts/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.shift;
}

export async function deleteRotShift(id) {
	return requestRotApi(`/admin/shifts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRotRainAlerts() {
	const data = await requestRotApi("/admin/rain");
	return data.items;
}

export async function createRotRainAlert(payload) {
	const data = await requestRotApi("/admin/rain", { method: "POST", body: JSON.stringify(payload) });
	return data.alert;
}

export async function stopRotRainAlert(id) {
	const data = await requestRotApi(`/admin/rain/${encodeURIComponent(id)}/stop`, { method: "POST" });
	return data.alert;
}

export async function deleteRotRainAlert(id) {
	return requestRotApi(`/admin/rain/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRotRompimentos() {
	const data = await requestRotApi("/admin/rompimentos");
	return data.items;
}

export async function fetchRotRompimentoBases() {
	const data = await requestRotApi("/admin/rompimentos/bases");
	return data.items;
}

export async function saveRotRompimentoBase(regionalId, payload) {
	return requestRotApi(`/admin/rompimentos/bases/${encodeURIComponent(regionalId)}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function createRotRompimento(payload) {
	const data = await requestRotApi("/admin/rompimentos", { method: "POST", body: JSON.stringify(payload) });
	return data.rompimento;
}

export async function createRotRompimentoDraft(payload) {
	const data = await requestRotApi("/admin/rompimentos/draft", { method: "POST", body: JSON.stringify(payload) });
	return data.rompimento;
}

export async function updateRotRompimento(id, payload) {
	const data = await requestRotApi(`/admin/rompimentos/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.rompimento;
}

export async function deleteRotRompimento(id) {
	return requestRotApi(`/admin/rompimentos/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRotAttachments(entityType, entityId) {
	const params = new URLSearchParams({ entityType, entityId });
	const data = await requestRotApi(`/admin/attachments?${params}`);
	return data;
}

export async function requestRotAttachmentUpload({ entityType, entityId, file }) {
	return requestRotApi("/admin/attachments/upload-url", {
		method: "POST",
		body: JSON.stringify({ entityType, entityId, file }),
	});
}

export async function confirmRotAttachment(attachmentId) {
	const data = await requestRotApi(`/admin/attachments/${encodeURIComponent(attachmentId)}/confirm`, { method: "POST" });
	return data.item;
}

export async function deleteRotAttachment(attachmentId) {
	return requestRotApi(`/admin/attachments/${encodeURIComponent(attachmentId)}`, { method: "DELETE" });
}

export async function fetchRotActivities() {
	return requestRotApi("/admin/activities");
}

export async function createRotActivity(payload) {
	const data = await requestRotApi("/admin/activities", { method: "POST", body: JSON.stringify(payload) });
	return data.activity;
}

export async function updateRotActivity(id, payload) {
	const data = await requestRotApi(`/admin/activities/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.activity;
}

export async function deleteRotActivity(id) {
	return requestRotApi(`/admin/activities/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRotRanking({ dataInicio, dataFim, regionalId } = {}) {
	const params = new URLSearchParams();
	if (dataInicio) params.set("dataInicio", dataInicio);
	if (dataFim) params.set("dataFim", dataFim);
	if (regionalId) params.set("regionalId", regionalId);
	const query = params.toString();
	const data = await requestRotApi(`/admin/ranking${query ? `?${query}` : ""}`);
	return data.items;
}

export async function syncRotLegacyOperationData() {
	const data = await requestRotApi("/admin/operation-legacy-sync", { method: "POST" });
	return data.result;
}

export async function fetchAssetsSecurityMeta() {
	return requestRotApi("/admin/assets-security/meta");
}

export async function fetchAssetsSecurityDashboard() {
	return requestRotApi("/admin/assets-security/dashboard");
}

export async function fetchAssetsSecurityAssetsMine() {
	const data = await requestRotApi("/admin/assets-security/assets/mine");
	return data.items || [];
}

export async function fetchAssetsSecurityChecklistsPendingForMe() {
	const data = await requestRotApi("/admin/assets-security/assets/checklists/pending-for-me");
	return data.items || [];
}

export async function checkoutAssetsSecurityAsset(id) {
	const data = await requestRotApi(`/admin/assets-security/assets/${encodeURIComponent(id)}/checkout`, { method: "POST" });
	return data.asset;
}

export async function fetchAssetsSecurityChecklistExecutions() {
	const data = await requestRotApi("/admin/assets-security/checklists/executions");
	return data.items || [];
}

export async function fetchAssetsSecurityChecklistExecution(id) {
	return requestRotApi(`/admin/assets-security/checklists/executions/${encodeURIComponent(id)}`);
}

export async function fetchAssetsSecurityAssets(filters = {}) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(filters)) {
		if (value !== undefined && value !== null && String(value).trim() !== "") params.set(key, value);
	}
	const data = await requestRotApi(`/admin/assets-security/assets${params.toString() ? `?${params}` : ""}`);
	return data;
}

export async function createAssetsSecurityAsset(payload) {
	const data = await requestRotApi("/admin/assets-security/assets", { method: "POST", body: JSON.stringify(payload) });
	return data.asset;
}

export async function updateAssetsSecurityAsset(id, payload) {
	const data = await requestRotApi(`/admin/assets-security/assets/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.asset;
}

export async function deleteAssetsSecurityAsset(id) {
	return requestRotApi(`/admin/assets-security/assets/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchAssetsSecurityTimeline(id) {
	const data = await requestRotApi(`/admin/assets-security/assets/${encodeURIComponent(id)}/timeline`);
	return data.items;
}

export async function upsertAssetsSecurityConfig(kind, payload) {
	const data = await requestRotApi(`/admin/assets-security/settings/${encodeURIComponent(kind)}`, { method: "POST", body: JSON.stringify(payload) });
	return data;
}

export async function deleteAssetsSecurityConfig(kind, id) {
	return requestRotApi(`/admin/assets-security/settings/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchAssetsSecurityChecklistTemplates() {
	const data = await requestRotApi("/admin/assets-security/checklists/templates");
	return data.items;
}

export async function createAssetsSecurityChecklistTemplate(payload) {
	const data = await requestRotApi("/admin/assets-security/checklists/templates", { method: "POST", body: JSON.stringify(payload) });
	return data.template;
}

export async function updateAssetsSecurityChecklistTemplate(id, payload) {
	const data = await requestRotApi(`/admin/assets-security/checklists/templates/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.template;
}

export async function deleteAssetsSecurityChecklistTemplate(id) {
	return requestRotApi(`/admin/assets-security/checklists/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function executeAssetsSecurityChecklist(assetId, payload) {
	const data = await requestRotApi(`/admin/assets-security/assets/${encodeURIComponent(assetId)}/checklists`, { method: "POST", body: JSON.stringify(payload) });
	return data;
}

export async function transferAssetsSecurityAsset(assetId, payload) {
	const data = await requestRotApi(`/admin/assets-security/assets/${encodeURIComponent(assetId)}/transfer`, { method: "POST", body: JSON.stringify(payload) });
	return data;
}

export async function acceptAssetsSecurityTransfer(id, payload = {}) {
	const data = await requestRotApi(`/admin/assets-security/transfers/${encodeURIComponent(id)}/accept`, { method: "POST", body: JSON.stringify(payload) });
	return data;
}

export async function updateAssetsSecurityTransfer(id, payload) {
	const data = await requestRotApi(`/admin/assets-security/transfers/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.transfer;
}

export async function declineAssetsSecurityTransfer(id, payload = {}) {
	const data = await requestRotApi(`/admin/assets-security/transfers/${encodeURIComponent(id)}/decline`, { method: "POST", body: JSON.stringify(payload) });
	return data;
}

export async function fetchPendingAssetTransfersForMe() {
	const data = await requestRotApi("/admin/assets-security/transfers/pending-for-me");
	return data.items || [];
}

export async function returnAssetsSecurityAsset(assetId, payload) {
	const data = await requestRotApi(`/admin/assets-security/assets/${encodeURIComponent(assetId)}/return`, { method: "POST", body: JSON.stringify(payload) });
	return data;
}

export async function reportAssetsSecurityProblem(assetId, payload) {
	const data = await requestRotApi(`/admin/assets-security/assets/${encodeURIComponent(assetId)}/problem`, { method: "POST", body: JSON.stringify(payload) });
	return data;
}

export async function blockAssetsSecurityAsset(assetId, payload) {
	const data = await requestRotApi(`/admin/assets-security/assets/${encodeURIComponent(assetId)}/block`, { method: "POST", body: JSON.stringify(payload) });
	return data;
}

export async function releaseAssetsSecurityAsset(assetId, payload) {
	const data = await requestRotApi(`/admin/assets-security/assets/${encodeURIComponent(assetId)}/release`, { method: "POST", body: JSON.stringify(payload) });
	return data;
}

export async function fetchAssetsSecurityOccurrences() {
	const data = await requestRotApi("/admin/assets-security/occurrences");
	return data.items;
}

export async function fetchAssetsSecurityMaintenance() {
	const data = await requestRotApi("/admin/assets-security/maintenance");
	return data.items;
}

export async function fetchAssetsSecurityTransfers() {
	const data = await requestRotApi("/admin/assets-security/transfers");
	return data.items;
}

export async function fetchAssetsSecurityReturns() {
	const data = await requestRotApi("/admin/assets-security/returns");
	return data.items;
}

export async function fetchAssetsSecurityBlocks() {
	const data = await requestRotApi("/admin/assets-security/blocks");
	return data.items;
}

export async function createAssetsSecurityMaintenance(assetId, payload) {
	const data = await requestRotApi(`/admin/assets-security/assets/${encodeURIComponent(assetId)}/maintenance`, { method: "POST", body: JSON.stringify(payload) });
	return data;
}

export async function updateAssetsSecurityMaintenance(id, payload) {
	const data = await requestRotApi(`/admin/assets-security/maintenance/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data.maintenance;
}

export async function fetchPublicAsset(token) {
	const response = await fetch(`/api/public/assets/${encodeURIComponent(token)}`, { cache: "no-store" });
	const data = await response.json().catch(() => null);
	if (!response.ok || data?.ok === false) {
		throw new Error(data?.error || `Erro HTTP ${response.status}.`);
	}
	return data.asset;
}

export async function checkoutPublicAsset(token) {
	const data = await requestRotApi(`/public/assets/${encodeURIComponent(token)}/checkout`, { method: "POST" });
	return data.asset;
}

// Warlinho — assistente com IA real (Gemini, tool use restrito aos
// dados da Operação). Mesmo padrao do Financeirinho/Victorinho do Finan.
export async function enviarMensagemWarlinho(mensagem, conversaId) {
	return requestRotApi("/admin/warlinho/chat", {
		method: "POST",
		body: JSON.stringify({ mensagem, conversaId: conversaId || undefined }),
	});
}

export async function fetchWarlinhoConversas() {
	const data = await requestRotApi("/admin/warlinho/conversas");
	return data?.conversas || [];
}

export async function fetchWarlinhoConversa(conversaId) {
	const data = await requestRotApi(`/admin/warlinho/conversas/${encodeURIComponent(conversaId)}`);
	return data?.mensagens || [];
}

export async function fetchSstDashboard() {
	return requestRotApi("/admin/sst/dashboard");
}

export async function fetchSstTeam() {
	const data = await requestRotApi("/admin/sst/team");
	return data.items || [];
}

export async function fetchSstProtocols(filters = {}) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(filters)) {
		if (value !== undefined && value !== null && String(value).trim() !== "") params.set(key, value);
	}
	const data = await requestRotApi(`/admin/sst/protocols${params.toString() ? `?${params}` : ""}`);
	return data.items || [];
}

export async function fetchSstProtocol(id) {
	return requestRotApi(`/admin/sst/protocols/${encodeURIComponent(id)}`);
}

export async function createSstProtocol(payload) {
	const data = await requestRotApi("/admin/sst/protocols", { method: "POST", body: JSON.stringify(payload) });
	return data.protocol;
}

export async function updateSstProtocol(id, payload) {
	const data = await requestRotApi(`/admin/sst/protocols/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
	return data.protocol;
}

export async function assignSstProtocol(id, payload = {}) {
	const data = await requestRotApi(`/admin/sst/protocols/${encodeURIComponent(id)}/assign`, { method: "POST", body: JSON.stringify(payload) });
	return data.protocol;
}

export async function changeSstProtocolPriority(id, priority) {
	const data = await requestRotApi(`/admin/sst/protocols/${encodeURIComponent(id)}/change-priority`, { method: "POST", body: JSON.stringify({ priority }) });
	return data.protocol;
}

export async function changeSstProtocolStatus(id, status) {
	const data = await requestRotApi(`/admin/sst/protocols/${encodeURIComponent(id)}/change-status`, { method: "POST", body: JSON.stringify({ status }) });
	return data.protocol;
}

export async function closeSstProtocol(id, note) {
	const data = await requestRotApi(`/admin/sst/protocols/${encodeURIComponent(id)}/close`, { method: "POST", body: JSON.stringify({ note }) });
	return data.protocol;
}

export async function sendSstProtocolMessage(id, payload) {
	return requestRotApi(`/admin/sst/protocols/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify(payload) });
}

export async function createSstInformationRequest(id, payload) {
	return requestRotApi(`/admin/sst/protocols/${encodeURIComponent(id)}/information-requests`, { method: "POST", body: JSON.stringify(payload) });
}

export async function answerSstInformationRequest(id, requestId, answer) {
	return requestRotApi(`/admin/sst/protocols/${encodeURIComponent(id)}/information-requests/${encodeURIComponent(requestId)}/answer`, { method: "POST", body: JSON.stringify({ answer }) });
}

export async function createSstActionPlan(protocolId, payload) {
	return requestRotApi(`/admin/sst/protocols/${encodeURIComponent(protocolId)}/action-plans`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updateSstActionPlan(id, payload) {
	return requestRotApi(`/admin/sst/action-plans/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function submitSstActionPlan(id, completionNote) {
	return requestRotApi(`/admin/sst/action-plans/${encodeURIComponent(id)}/submit`, { method: "POST", body: JSON.stringify({ completionNote }) });
}

export async function validateSstActionPlan(id, approved, note) {
	return requestRotApi(`/admin/sst/action-plans/${encodeURIComponent(id)}/validate`, { method: "POST", body: JSON.stringify({ approved, note }) });
}

export async function fetchRotInboxNotifications(unreadOnly = false) {
	const params = unreadOnly ? "?unread=true" : "";
	return requestRotApi(`/admin/notifications${params}`);
}

export async function markRotInboxNotificationRead(id) {
	return requestRotApi(`/admin/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
}

export async function markAllRotInboxNotificationsRead() {
	return requestRotApi("/admin/notifications/read-all", { method: "POST" });
}

function sstReportsQuery(filters = {}) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(filters)) {
		if (value !== undefined && value !== null && String(value).trim() !== "") params.set(key, value);
	}
	return params.toString() ? `?${params}` : "";
}

export async function fetchSstReportsSummary(filters = {}) {
	return requestRotApi(`/admin/sst/reports/summary${sstReportsQuery(filters)}`);
}

export async function fetchSstReportsTimeline(filters = {}) {
	return requestRotApi(`/admin/sst/reports/timeline${sstReportsQuery(filters)}`);
}

export async function fetchSstReportsDistribution(filters = {}) {
	return requestRotApi(`/admin/sst/reports/distribution${sstReportsQuery(filters)}`);
}

export async function fetchSstReportsOccurrences(filters = {}) {
	return requestRotApi(`/admin/sst/reports/occurrences${sstReportsQuery(filters)}`);
}

export async function fetchSstReportsActionPlans(filters = {}) {
	return requestRotApi(`/admin/sst/reports/action-plans${sstReportsQuery(filters)}`);
}

export async function fetchSstReportsWorkload(filters = {}) {
	return requestRotApi(`/admin/sst/reports/workload${sstReportsQuery(filters)}`);
}

export async function fetchSstReportsDetails(filters = {}) {
	return requestRotApi(`/admin/sst/reports/details${sstReportsQuery(filters)}`);
}

// ---------------------------------------------------------------------
// DSS — Diálogo Semanal de Segurança (Fase 1: temas, programação,
// execuções). Mesmo estilo das funções SST acima.
// ---------------------------------------------------------------------

function dssQuery(filters = {}) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(filters)) {
		if (value !== undefined && value !== null && String(value).trim() !== "") params.set(key, value);
	}
	return params.toString() ? `?${params}` : "";
}

// Devolve {items, total, page, pageSize} — listagens paginadas usam os
// 4 campos, seletores (dropdown de tema) usam so .items com pageSize
// alto pra nao truncar em 30.
export async function fetchDssThemes(filters = {}) {
	return requestRotApi(`/admin/dss/themes${dssQuery(filters)}`);
}

export async function fetchDssTheme(id) {
	const data = await requestRotApi(`/admin/dss/themes/${encodeURIComponent(id)}`);
	return data.item;
}

export async function createDssTheme(payload) {
	const data = await requestRotApi("/admin/dss/themes", { method: "POST", body: JSON.stringify(payload) });
	return data.item;
}

export async function updateDssTheme(id, payload) {
	const data = await requestRotApi(`/admin/dss/themes/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
	return data.item;
}

export async function publishDssTheme(id) {
	const data = await requestRotApi(`/admin/dss/themes/${encodeURIComponent(id)}/publish`, { method: "POST" });
	return data.item;
}

export async function archiveDssTheme(id) {
	const data = await requestRotApi(`/admin/dss/themes/${encodeURIComponent(id)}/archive`, { method: "POST" });
	return data.item;
}

export async function saveDssThemeWeeks(id, weeks) {
	const data = await requestRotApi(`/admin/dss/themes/${encodeURIComponent(id)}/weeks`, { method: "PUT", body: JSON.stringify({ weeks }) });
	return data.items || [];
}

export async function fetchDssSchedules(filters = {}) {
	return requestRotApi(`/admin/dss/schedules${dssQuery(filters)}`);
}

export async function fetchDssSchedule(id) {
	const data = await requestRotApi(`/admin/dss/schedules/${encodeURIComponent(id)}`);
	return data.item;
}

export async function createDssSchedule(payload) {
	const data = await requestRotApi("/admin/dss/schedules", { method: "POST", body: JSON.stringify(payload) });
	return data.item;
}

export async function updateDssSchedule(id, payload) {
	const data = await requestRotApi(`/admin/dss/schedules/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
	return data.item;
}

export async function publishDssSchedule(id) {
	return requestRotApi(`/admin/dss/schedules/${encodeURIComponent(id)}/publish`, { method: "POST" });
}

export async function cancelDssSchedule(id) {
	const data = await requestRotApi(`/admin/dss/schedules/${encodeURIComponent(id)}/cancel`, { method: "POST" });
	return data.item;
}

export async function fetchDssExecutions(filters = {}) {
	return requestRotApi(`/admin/dss/executions${dssQuery(filters)}`);
}

export async function fetchDssCategories(filters = {}) {
	const data = await requestRotApi(`/admin/dss/categories${dssQuery(filters)}`);
	return data.items || [];
}

export async function createDssCategory(payload) {
	const data = await requestRotApi("/admin/dss/categories", { method: "POST", body: JSON.stringify(payload) });
	return data.item;
}

export async function updateDssCategory(id, payload) {
	const data = await requestRotApi(`/admin/dss/categories/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
	return data.item;
}

export async function archiveDssCategory(id) {
	const data = await requestRotApi(`/admin/dss/categories/${encodeURIComponent(id)}/archive`, { method: "POST" });
	return data.item;
}

export async function fetchDssExecution(id) {
	const data = await requestRotApi(`/admin/dss/executions/${encodeURIComponent(id)}`);
	return data.item;
}

export async function updateDssExecutionMemberPresence(executionId, memberId, payload) {
	return requestRotApi(`/admin/dss/executions/${encodeURIComponent(executionId)}/members/${encodeURIComponent(memberId)}`, {
		method: "PATCH",
		body: JSON.stringify(payload),
	});
}

export async function markAllDssExecutionMembersPresent(executionId) {
	const data = await requestRotApi(`/admin/dss/executions/${encodeURIComponent(executionId)}/mark-all-present`, { method: "POST" });
	return data.execution;
}

export async function submitDssExecution(executionId) {
	const data = await requestRotApi(`/admin/dss/executions/${encodeURIComponent(executionId)}/submit`, { method: "POST" });
	return data.item;
}

export async function validateDssExecution(executionId, approved, note) {
	const data = await requestRotApi(`/admin/dss/executions/${encodeURIComponent(executionId)}/validate`, {
		method: "POST",
		body: JSON.stringify({ approved, note }),
	});
	return data.item;
}

export async function fetchDssDashboardSummary(filters = {}) {
	return requestRotApi(`/admin/dss/dashboard/summary${dssQuery(filters)}`);
}

export async function fetchDssDashboardIndicators(filters = {}) {
	return requestRotApi(`/admin/dss/dashboard/indicators${dssQuery(filters)}`);
}

export async function fetchDssDashboardRanking(filters = {}) {
	const data = await requestRotApi(`/admin/dss/dashboard/ranking${dssQuery(filters)}`);
	return data.items || [];
}

export async function fetchDssReportsDetails(filters = {}) {
	return requestRotApi(`/admin/dss/reports/details${dssQuery(filters)}`);
}
