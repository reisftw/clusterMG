const crypto = require("node:crypto");
const db = require("./db");
const { broadcastRealtime } = require("./realtime");

const COLLECTION = "system_notifications";
const PREFERENCES_COLLECTION = "notification_preferences";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const COUNTERS_CACHE_TTL_MS = Math.max(
	Number(process.env.NOTIFICATIONS_COUNTERS_CACHE_TTL_MS || 10000),
	0,
);
const countersCache = new Map();
const DEFAULT_ENABLED_TYPES = {
	documentos_pendentes: true,
	documentos_administrativo_pendente: true,
	documentos_administrativo_reprovado: true,
	insumos_requisicao_pendente: true,
	whatsapp_agendamento_auto: true,
	agendamento_nao_recolhido_mapa: true,
	agendamento_recolhido_mapa: true,
	atendimento_caso_novo: true,
	sistema_critico: true,
	backup: true,
	api: true,
	geral: true,
};

const DOCUMENT_NOTIFICATION_TYPES = new Set([
	"documentos_pendentes",
	"documentos_administrativo_pendente",
	"documentos_administrativo_reprovado",
]);

const SYSTEM_NOTIFICATION_TYPES = new Set([
	"sistema_critico",
	"sistema_atualizacao",
]);

const RETIRADA_NOTIFICATION_TYPES = new Set([
	"whatsapp_agendamento_auto",
	"agendamento_nao_recolhido_mapa",
	"agendamento_recolhido_mapa",
	"atendimento_caso_novo",
]);

const DOCUMENT_AND_SYSTEM_ROLES = new Set([
	"supervisor_administrativo",
	"analista_administrativo",
	"supervisor",
	"backoffice",
]);

function nowIso() {
	return new Date().toISOString();
}

function normalizeLimit(value) {
	const parsed = Number(value || DEFAULT_LIMIT);
	if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
	return Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT);
}

function normalizeOffset(value) {
	const parsed = Number(value || 0);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(Math.trunc(parsed), 0);
}

function userKey(user = {}) {
	return (
		String(user.uid || user.id || user.email || "anonimo").trim() || "anonimo"
	);
}

function userRole(user = {}) {
	return String(user.role || user.profile?.role || "")
		.trim()
		.toLowerCase();
}

function countersCacheKey(user = {}) {
	return JSON.stringify({
		uid: userKey(user),
		role: userRole(user),
		regional: normalizeText(user.regional || user.profile?.regional),
		empresaId: normalizeText(
			user.empresaId ||
				user.empresa_id ||
				user.profile?.empresaId ||
				user.profile?.empresa_id,
		),
	});
}

function clearCountersCache() {
	countersCache.clear();
}

function getCachedCounters(key) {
	if (!COUNTERS_CACHE_TTL_MS) return null;
	const cached = countersCache.get(key);
	if (!cached) return null;
	if (Date.now() - cached.createdAt > COUNTERS_CACHE_TTL_MS) {
		countersCache.delete(key);
		return null;
	}
	return cached.value;
}

function setCachedCounters(key, value) {
	if (!COUNTERS_CACHE_TTL_MS) return;
	countersCache.set(key, { createdAt: Date.now(), value });
}

function normalizeText(value) {
	return String(value || "").trim();
}

function normalizeComparableText(value) {
	return normalizeText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

function formatMonthLabel(value) {
	const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
	if (!match) return normalizeText(value) || "-";
	const months = [
		"Janeiro",
		"Fevereiro",
		"Março",
		"Abril",
		"Maio",
		"Junho",
		"Julho",
		"Agosto",
		"Setembro",
		"Outubro",
		"Novembro",
		"Dezembro",
	];
	return `${months[Number(match[2]) - 1] || match[2]}/${match[1]}`;
}

function userRegional(user = {}) {
	return normalizeText(user.regional || user.profile?.regional);
}

function userEmpresaId(user = {}) {
	return normalizeText(
		user.empresaId ||
			user.empresa_id ||
			user.profile?.empresaId ||
			user.profile?.empresa_id,
	);
}

function normalizeTargets(targets = {}) {
	return {
		roles: Array.isArray(targets.roles)
			? targets.roles.map((role) => String(role).toLowerCase())
			: [],
		regionals: Array.isArray(targets.regionais) ? targets.regionais : [],
		empresas: Array.isArray(targets.empresas) ? targets.empresas : [],
		users: Array.isArray(targets.users) ? targets.users : [],
	};
}

function roleCanSeeType(role, type) {
	if (role === "admin") return true;
	if (role === "backoffice_retirada")
		return RETIRADA_NOTIFICATION_TYPES.has(type);
	if (DOCUMENT_AND_SYSTEM_ROLES.has(role)) {
		return (
			DOCUMENT_NOTIFICATION_TYPES.has(type) ||
			SYSTEM_NOTIFICATION_TYPES.has(type)
		);
	}
	return true;
}

function targetMatchesUser(targets, user = {}) {
	const role = userRole(user);
	const regional = normalizeComparableText(userRegional(user));
	const empresaId = userEmpresaId(user);
	const uid = userKey(user);

	if (targets.users.length && !targets.users.includes(uid)) return false;
	if (targets.roles.length && !targets.roles.includes(role)) return false;
	if (
		targets.regionals.length &&
		!targets.regionals.some(
			(item) => normalizeComparableText(item) === regional,
		)
	)
		return false;
	if (targets.empresas.length && !targets.empresas.includes(empresaId))
		return false;
	return true;
}

function canSeeNotification(data = {}, user = {}) {
	const role = userRole(user);
	const type = normalizeText(data.type || "geral");
	return (
		roleCanSeeType(role, type) &&
		targetMatchesUser(normalizeTargets(data.targets), user)
	);
}

function mapNotification(row, user) {
	const data = row?.data || {};
	const readBy =
		data.readBy && typeof data.readBy === "object" ? data.readBy : {};
	const key = userKey(user);
	return {
		id: row.document_id,
		path: row.path,
		type: data.type || "geral",
		title: data.title || "Notificação",
		message: data.message || "",
		severity: data.severity || "info",
		targetPath: data.targetPath || "",
		createdAt: data.createdAt || row.updated_at || row.imported_at,
		createdById: data.createdById || "",
		createdByName: data.createdByName || "",
		meta: data.meta || {},
		targets: data.targets || {},
		read: Boolean(readBy[key]),
		readAt: readBy[key] || null,
	};
}

async function createNotification({
	type = "geral",
	title = "Notificação",
	message = "",
	targetPath = "",
	severity = "info",
	user = {},
	meta = {},
	targets = {},
	dedupeKey = "",
} = {}) {
	const id = dedupeKey
		? String(dedupeKey).replace(/[^\w.-]/g, "_")
		: `${Date.now().toString(36)}-${crypto.randomUUID()}`;
	const createdAt = nowIso();
	const data = {
		id,
		type,
		title,
		message,
		severity,
		targetPath,
		createdAt,
		createdById: userKey(user),
		createdByName: normalizeText(user.nome || user.displayName || user.email),
		readBy: {},
		targets,
		meta,
	};

	await db.query(
		`insert into app_documents (path, collection_path, document_id, parent_path, data)
     values ($1, $2, $3, null, $4::jsonb)
     on conflict (path) do update set
       data = excluded.data,
       updated_at = now()`,
		[`${COLLECTION}/${id}`, COLLECTION, id, JSON.stringify(data)],
	);

	clearCountersCache();
	broadcastRealtime("notifications", {
		action: "created",
		id,
		type,
		targetPath,
		createdAt,
	});
	return data;
}

async function notificationExists(id) {
	const result = await db.query(
		`select 1 from app_documents where path = $1 limit 1`,
		[`${COLLECTION}/${id}`],
	);
	return Boolean(result.rows[0]);
}

async function listRawNotifications({ limit, offset } = {}) {
	const result = await db.query(
		`select path, document_id, data, imported_at, updated_at
       from app_documents
      where collection_path = $1
      order by coalesce(data->>'createdAt', updated_at::text) desc
      limit $2 offset $3`,
		[COLLECTION, normalizeLimit(limit), normalizeOffset(offset)],
	);
	return result.rows;
}

function filterMappedNotifications(
	items,
	{ user, type, severity, unread } = {},
) {
	const normalizedType = normalizeText(type);
	const normalizedSeverity = normalizeText(severity);
	const unreadOnly = unread === true || unread === "true";
	return items
		.filter((item) => canSeeNotification(item.data || {}, user))
		.map((row) => mapNotification(row, user))
		.filter((item) => !normalizedType || item.type === normalizedType)
		.filter(
			(item) => !normalizedSeverity || item.severity === normalizedSeverity,
		)
		.filter((item) => !unreadOnly || !item.read);
}

async function listNotifications({
	user,
	limit,
	offset,
	type,
	severity,
	unread,
} = {}) {
	await syncPendingDocumentNotifications({ user });
	const rawRows = await listRawNotifications({
		limit: Math.min(normalizeLimit(limit) * 3, 300),
		offset,
	});
	const items = filterMappedNotifications(rawRows, {
		user,
		type,
		severity,
		unread,
	}).slice(0, normalizeLimit(limit));
	const unreadRows = await listRawNotifications({ limit: 300, offset: 0 });
	const unreadCount = filterMappedNotifications(unreadRows, { user }).filter(
		(item) => !item.read,
	).length;
	return { items, unreadCount };
}

async function getNotificationStats({ user } = {}) {
	const rows = await listRawNotifications({ limit: 300, offset: 0 });
	const visible = filterMappedNotifications(rows, { user });
	const byType = {};
	const bySeverity = {};
	visible.forEach((item) => {
		byType[item.type] = (byType[item.type] || 0) + 1;
		bySeverity[item.severity] = (bySeverity[item.severity] || 0) + 1;
	});
	return {
		total: visible.length,
		unread: visible.filter((item) => !item.read).length,
		byType,
		bySeverity,
	};
}

async function markNotificationsRead({ user, ids = [], all = false } = {}) {
	const key = userKey(user);
	const readAt = nowIso();
	let result;
	if (all) {
		result = await db.query(
			`update app_documents
          set data = jsonb_set(coalesce(data, '{}'::jsonb), $2::text[], to_jsonb($3::text), true),
              updated_at = now()
        where collection_path = $1`,
			[COLLECTION, ["readBy", key], readAt],
		);
	} else {
		const normalizedIds = (Array.isArray(ids) ? ids : [])
			.map((id) => String(id || "").trim())
			.filter(Boolean);
		if (!normalizedIds.length) return { ok: true, updated: 0 };
		result = await db.query(
			`update app_documents
          set data = jsonb_set(coalesce(data, '{}'::jsonb), $3::text[], to_jsonb($4::text), true),
              updated_at = now()
        where collection_path = $1
          and document_id = any($2::text[])`,
			[COLLECTION, normalizedIds, ["readBy", key], readAt],
		);
	}

	clearCountersCache();
	broadcastRealtime("notifications", { action: "read", userId: key });
	return { ok: true, updated: result.rowCount || 0 };
}

async function getPreferences({ user } = {}) {
	const id = userKey(user);
	const result = await db.query(
		`select data from app_documents where path = $1`,
		[`${PREFERENCES_COLLECTION}/${id}`],
	);
	const data = result.rows[0]?.data || {};
	return {
		sound: data.sound || "ping",
		defaultAvatarUrl: data.defaultAvatarUrl || "",
		defaultAvatarDataUrl: data.defaultAvatarDataUrl || "",
		enabledTypes: {
			...DEFAULT_ENABLED_TYPES,
			...(data.enabledTypes || {}),
		},
		quietHours: data.quietHours || {
			enabled: false,
			start: "22:00",
			end: "07:00",
		},
	};
}

async function savePreferences({ user, preferences = {} } = {}) {
	const id = userKey(user);
	const current = await getPreferences({ user });
	const previousDefaultAvatar = current.defaultAvatarUrl || "";
	const data = {
		...current,
		...preferences,
		enabledTypes: {
			...current.enabledTypes,
			...(preferences.enabledTypes || {}),
		},
		updatedAt: nowIso(),
	};
	await db.query(
		`insert into app_documents (path, collection_path, document_id, parent_path, data)
     values ($1, $2, $3, null, $4::jsonb)
     on conflict (path) do update set data = excluded.data, updated_at = now()`,
		[
			`${PREFERENCES_COLLECTION}/${id}`,
			PREFERENCES_COLLECTION,
			id,
			JSON.stringify(data),
		],
	);
	if (
		Object.prototype.hasOwnProperty.call(preferences, "defaultAvatarUrl") &&
		(data.defaultAvatarUrl || "") !== previousDefaultAvatar
	) {
		await applyDefaultAvatarToUsers(data.defaultAvatarUrl || "");
	}
	return data;
}

async function applyDefaultAvatarToUsers(defaultAvatarUrl = "") {
	const avatarUrl = String(defaultAvatarUrl || "").trim();
	if (!avatarUrl) return;
	await db.query(
		`update app_users
		    set imported_profile = jsonb_set(
		          coalesce(imported_profile, '{}'::jsonb),
		          '{avatarUrl}',
		          to_jsonb($1::text),
		          true
		        ),
		        updated_at = now()
		  where coalesce(imported_profile->>'avatarUrl', imported_profile->>'avatar_url', imported_profile->>'avatarDataUrl', imported_profile->>'avatar_data_url', '') = ''`,
		[avatarUrl],
	);
	await db.query(
		`update app_documents
		    set data = jsonb_set(
		          jsonb_set(coalesce(data, '{}'::jsonb), '{avatarUrl}', to_jsonb($1::text), true),
		          '{avatar_url}',
		          to_jsonb($1::text),
		          true
		        ),
		        updated_at = now()
		  where collection_path = 'usuarios'
		    and coalesce(data->>'avatarUrl', data->>'avatar_url', data->>'avatarDataUrl', data->>'avatar_data_url', '') = ''`,
		[avatarUrl],
	);
}

async function countPendingDocuments(user = {}) {
	const role = userRole(user);
	const params = [
		["supervisor_administrativo", "analista_administrativo"].includes(role)
			? "aguardando_administrativo"
			: "pendente",
	];
	const filters = ["status = $1"];

	if (role === "supervisor") {
		const regional = userRegional(user);
		if (regional) {
			params.push(regional);
			filters.push(`lower(regional) = lower($${params.length})`);
		}
	}

	if (role === "lider_empresa") {
		const empresaId = userEmpresaId(user);
		if (empresaId) {
			params.push(empresaId);
			filters.push(`empresa_id = $${params.length}`);
		}
	}

	const result = await db.query(
		`select count(*)::int as total
       from document_submissions
      where ${filters.join(" and ")}`,
		params,
	);
	return Number(result.rows[0]?.total || 0);
}

async function listPendingDocumentSubmissionsForUser(user = {}) {
	const role = userRole(user);
	const params = ["pendente"];
	const filters = ["status = $1"];

	if (role === "supervisor") {
		const regional = userRegional(user);
		if (!regional) return [];
		params.push(regional);
		filters.push(`lower(regional) = lower($${params.length})`);
	} else if (role === "lider_empresa") {
		const empresaId = userEmpresaId(user);
		if (!empresaId) return [];
		params.push(empresaId);
		filters.push(`empresa_id = $${params.length}`);
	} else if (role !== "admin") {
		return [];
	}

	const result = await db.query(
		`select id, empresa_id, empresa_nome, regional, mes_referencia, submitted_at, submitted_by_name
       from document_submissions
      where ${filters.join(" and ")}
      order by submitted_at desc, created_at desc
      limit 50`,
		params,
	);
	return result.rows;
}

async function createPendingDocumentNotificationForRow(row, user = {}) {
	const role = userRole(user);
	let dedupeKey = "";
	let targets = {};
	let targetPath = "/documentos/pendentes";

	if (role === "admin") {
		dedupeKey = `documentos_pendentes_admin_${row.id}`;
		targets = { roles: ["admin"] };
	} else if (role === "supervisor") {
		dedupeKey = `documentos_pendentes_supervisor_${row.id}`;
		targets = {
			roles: ["supervisor"],
			regionais: row.regional ? [row.regional] : [],
		};
	} else if (role === "lider_empresa") {
		dedupeKey = `documentos_pendentes_empresa_${row.id}`;
		targets = {
			roles: ["lider_empresa"],
			empresas: row.empresa_id ? [row.empresa_id] : [],
		};
		targetPath = "/terceirizados";
	} else {
		return null;
	}

	if (await notificationExists(dedupeKey)) return null;
	return createNotification({
		type: "documentos_pendentes",
		title: "Documentos pendentes",
		message: `${row.empresa_nome || "Empresa"} tem documentos de ${formatMonthLabel(row.mes_referencia)} aguardando avaliação.`,
		targetPath,
		severity: "warning",
		user: {},
		targets,
		dedupeKey,
		meta: {
			submissionId: row.id,
			empresaId: row.empresa_id,
			empresaNome: row.empresa_nome,
			regional: row.regional,
			mesReferencia: row.mes_referencia,
			submittedAt: row.submitted_at,
			submittedByName: row.submitted_by_name,
		},
	});
}

async function syncPendingDocumentNotifications({ user } = {}) {
	try {
		const rows = await listPendingDocumentSubmissionsForUser(user || {});
		let created = 0;
		for (const row of rows) {
			const notification = await createPendingDocumentNotificationForRow(
				row,
				user || {},
			);
			if (notification) created += 1;
		}
		return created;
	} catch (error) {
		console.error(
			"[notifications] Falha ao sincronizar documentos pendentes:",
			error?.message || error,
		);
		return 0;
	}
}

async function getCounters({ user } = {}) {
	const cacheKey = countersCacheKey(user || {});
	const cached = getCachedCounters(cacheKey);
	if (cached) return cached;
	await syncPendingDocumentNotifications({ user });
	const notifications = await listNotifications({ user, limit: 20 });
	const insumosResult = await db.query(
		`select count(*)::int as total
		   from app_documents
		  where collection_path = 'insumos_administrativos_requisicoes'
		    and data->>'status' = 'pendente'`,
	);
	const counters = {
		documentosPendentes: await countPendingDocuments(user || {}),
		insumosRequisicoesPendentes: insumosResult.rows[0]?.total || 0,
		notificacoesNaoLidas: notifications.unreadCount,
	};
	setCachedCounters(cacheKey, counters);
	return counters;
}

async function createCriticalServiceAlerts({ user } = {}) {
	const apiStatus = require("./apiStatus");
	const status = await apiStatus.getApiStatus();
	const offlineServices = (status.services || []).filter(
		(service) => service.status !== "online",
	);
	const created = [];
	for (const service of offlineServices) {
		const hourKey = new Date().toISOString().slice(0, 13).replace(/\D/g, "");
		const notification = await createNotification({
			type: "sistema_critico",
			title: `${service.name} offline`,
			message:
				service.reason || "Serviço indisponível. Verifique o painel de APIs.",
			targetPath: "/configuracoes/apis",
			severity: "critical",
			user,
			targets: { roles: ["admin"] },
			dedupeKey: `critical_${service.id}_${hourKey}`,
			meta: {
				serviceId: service.id,
				serviceName: service.name,
				checkedAt: service.checkedAt,
				details: service.details || {},
			},
		});
		created.push(notification);
	}
	return {
		ok: true,
		checkedAt: status.checkedAt,
		created: created.length,
		offline: offlineServices.map((service) => ({
			id: service.id,
			name: service.name,
			reason: service.reason,
		})),
	};
}

module.exports = {
	createCriticalServiceAlerts,
	createNotification,
	getCounters,
	getNotificationStats,
	getPreferences,
	listNotifications,
	markNotificationsRead,
	savePreferences,
};
