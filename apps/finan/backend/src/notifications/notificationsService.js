// Central de notificacoes internas do Finan — mesmo conceito do
// "system_notifications" do Retiradas (vps/api/src/notificationsService.js),
// adaptado ao RBAC baseado em permissions/cargos do Finan (nao tem
// regional/empresa como o app principal).
//
// Visibilidade (ver canSeeNotification): admin sempre ve tudo. Se
// target_user_ids foi setado, SO esses usuarios veem (mais especifico
// que os outros dois campos). Senao, se target_permissions e
// target_role_ids estao vazios, e visivel a todo mundo autenticado;
// caso contrario, precisa bater com pelo menos uma permission (via
// userHasFinanPermission, que ja cobre o mapeamento finan.*/financeiro.*)
// ou o role_id do usuario.
const db = require("../db");
const { randomId } = require("../secureRandom");
const { userHasFinanPermission } = require("../auth/middleware");

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const RAW_FETCH_LIMIT = 300; // mesmo padrao do Retiradas: busca uma janela ampla e filtra em JS.
const COUNTERS_CACHE_TTL_MS = Math.max(
	Number(process.env.FINAN_NOTIFICATIONS_COUNTERS_CACHE_TTL_MS || 10000),
	0,
);
const countersCache = new Map();

const DEFAULT_ENABLED_TYPES = {
	geral: true,
	import_orcamento: true,
	backup: true,
	integracao_erro: true,
	calendario_alerta: true,
};

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
	return String(user.id || user.uid || "anonimo").trim() || "anonimo";
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

function canSeeNotification(row, user = {}) {
	if (user?.is_admin) return true;
	const targetUserIds = Array.isArray(row.target_user_ids) ? row.target_user_ids : [];
	if (targetUserIds.length) return targetUserIds.includes(userKey(user));
	const targetRoleIds = Array.isArray(row.target_role_ids) ? row.target_role_ids : [];
	const targetPermissions = Array.isArray(row.target_permissions)
		? row.target_permissions
		: [];
	if (!targetRoleIds.length && !targetPermissions.length) return true;
	if (targetRoleIds.length && targetRoleIds.includes(user.role_id)) return true;
	return targetPermissions.some((permission) =>
		userHasFinanPermission(user, permission),
	);
}

function mapNotification(row, user = {}) {
	const readBy = row.read_by && typeof row.read_by === "object" ? row.read_by : {};
	const key = userKey(user);
	return {
		id: row.id,
		type: row.type || "geral",
		title: row.title || "Notificação",
		message: row.message || "",
		severity: row.severity || "info",
		targetPath: row.target_path || "",
		createdAt: row.created_at,
		createdById: row.created_by_id || "",
		createdByName: row.created_by_name || "",
		meta: row.meta || {},
		read: Boolean(readBy[key]),
		readAt: readBy[key] || null,
	};
}

async function listRawNotifications({ limit = RAW_FETCH_LIMIT, offset = 0 } = {}) {
	const { rows } = await db.query(
		`select id, type, title, message, severity, target_path,
			target_permissions, target_role_ids, target_user_ids,
			read_by, meta, created_at, created_by_id, created_by_name
		from finan_notifications
		order by created_at desc
		limit $1 offset $2`,
		[normalizeLimit(limit), normalizeOffset(offset)],
	);
	return rows;
}

function filterMappedNotifications(rows, { user, type, severity, unread } = {}) {
	const normalizedType = String(type || "").trim();
	const normalizedSeverity = String(severity || "").trim();
	const unreadOnly = unread === true || unread === "true";
	return rows
		.filter((row) => canSeeNotification(row, user))
		.map((row) => mapNotification(row, user))
		.filter((item) => !normalizedType || item.type === normalizedType)
		.filter((item) => !normalizedSeverity || item.severity === normalizedSeverity)
		.filter((item) => !unreadOnly || !item.read);
}

async function listNotifications({ user, limit, offset, type, severity, unread } = {}) {
	const rawRows = await listRawNotifications({
		limit: Math.min(normalizeLimit(limit) * 3, RAW_FETCH_LIMIT),
		offset,
	});
	const items = filterMappedNotifications(rawRows, {
		user,
		type,
		severity,
		unread,
	}).slice(0, normalizeLimit(limit));
	const allRows = await listRawNotifications({ limit: RAW_FETCH_LIMIT, offset: 0 });
	const unreadCount = filterMappedNotifications(allRows, { user }).filter(
		(item) => !item.read,
	).length;
	return { items, unreadCount };
}

async function getNotificationStats({ user } = {}) {
	const rows = await listRawNotifications({ limit: RAW_FETCH_LIMIT, offset: 0 });
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

async function getCounters({ user } = {}) {
	const cacheKey = userKey(user);
	const cached = getCachedCounters(cacheKey);
	if (cached) return cached;
	const { unreadCount } = await listNotifications({ user, limit: 1 });
	const counters = { notificacoesNaoLidas: unreadCount };
	setCachedCounters(cacheKey, counters);
	return counters;
}

async function markNotificationsRead({ user, ids = [], all = false } = {}) {
	const key = userKey(user);
	const readAt = nowIso();
	let result;
	if (all) {
		result = await db.query(
			`update finan_notifications
				set read_by = jsonb_set(coalesce(read_by, '{}'::jsonb), $1::text[], to_jsonb($2::text), true)`,
			[[key], readAt],
		);
	} else {
		const normalizedIds = (Array.isArray(ids) ? ids : [])
			.map((id) => String(id || "").trim())
			.filter(Boolean);
		if (!normalizedIds.length) return { ok: true, updated: 0 };
		result = await db.query(
			`update finan_notifications
				set read_by = jsonb_set(coalesce(read_by, '{}'::jsonb), $1::text[], to_jsonb($2::text), true)
			where id = any($3::text[])`,
			[[key], readAt, normalizedIds],
		);
	}
	clearCountersCache();
	return { ok: true, updated: result.rowCount || 0 };
}

async function createNotification({
	type = "geral",
	title = "Notificação",
	message = "",
	targetPath = "",
	severity = "info",
	targets = {},
	meta = {},
	dedupeKey = "",
	createdBy = {},
} = {}) {
	const id = randomId("finan_notif");
	const permissions = Array.isArray(targets.permissions) ? targets.permissions : [];
	const roleIds = Array.isArray(targets.roleIds) ? targets.roleIds : [];
	const userIds = Array.isArray(targets.userIds) ? targets.userIds : [];
	await db.query(
		`insert into finan_notifications (
			id, type, title, message, severity, target_path,
			target_permissions, target_role_ids, target_user_ids,
			meta, dedupe_key, created_by_id, created_by_name
		) values ($1, $2, $3, $4, $5, $6, $7::text[], $8::text[], $9::text[], $10::jsonb, $11, $12, $13)
		on conflict (dedupe_key) do nothing`,
		[
			id,
			type,
			title,
			message,
			severity,
			targetPath,
			permissions,
			roleIds,
			userIds,
			JSON.stringify(meta || {}),
			dedupeKey || null,
			createdBy?.id || null,
			createdBy?.name || null,
		],
	);
	clearCountersCache();
	return { id, type, title, message, severity, targetPath };
}

async function getPreferences({ user } = {}) {
	const id = userKey(user);
	const { rows } = await db.query(
		`select sound, enabled_types, quiet_hours from finan_notification_preferences where user_id = $1`,
		[id],
	);
	const data = rows[0] || {};
	return {
		sound: data.sound || "ping",
		enabledTypes: { ...DEFAULT_ENABLED_TYPES, ...(data.enabled_types || {}) },
		quietHours: data.quiet_hours || { enabled: false, start: "22:00", end: "07:00" },
	};
}

async function savePreferences({ user, preferences = {} } = {}) {
	const id = userKey(user);
	const current = await getPreferences({ user });
	const next = {
		sound: preferences.sound || current.sound,
		enabledTypes: {
			...current.enabledTypes,
			...(preferences.enabledTypes || {}),
		},
		quietHours: preferences.quietHours || current.quietHours,
	};
	await db.query(
		`insert into finan_notification_preferences (user_id, sound, enabled_types, quiet_hours, updated_at)
		values ($1, $2, $3::jsonb, $4::jsonb, now())
		on conflict (user_id) do update set
			sound = excluded.sound,
			enabled_types = excluded.enabled_types,
			quiet_hours = excluded.quiet_hours,
			updated_at = now()`,
		[
			id,
			next.sound,
			JSON.stringify(next.enabledTypes),
			JSON.stringify(next.quietHours),
		],
	);
	return next;
}

async function createCriticalServiceAlerts({ user } = {}) {
	const { rows } = await db.query(
		`select id, provider, name, status, updated_at from finan_integration_configs where status = 'erro'`,
	);
	const hourKey = new Date().toISOString().slice(0, 13).replace(/\D/g, "");
	const created = [];
	for (const service of rows) {
		const notification = await createNotification({
			type: "integracao_erro",
			title: `${service.name || service.provider} com erro`,
			message: "Integração em status de erro. Verifique a página de Integrações.",
			targetPath: "/configuracao-geral/integracoes-apis",
			severity: "critical",
			targets: { permissions: ["finan.integracoes.manage"] },
			dedupeKey: `finan_integracao_erro_${service.id}_${hourKey}`,
			createdBy: { id: userKey(user), name: user?.name },
			meta: { integrationId: service.id, provider: service.provider },
		});
		created.push(notification);
	}
	return {
		ok: true,
		checkedAt: nowIso(),
		created: created.length,
		offline: rows.map((service) => ({
			id: service.id,
			name: service.name || service.provider,
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
