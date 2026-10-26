const crypto = require("node:crypto");
const db = require("./db");
const apiStatus = require("./apiStatus");
const metrics = require("./metrics");

const CONFIRMATION_WORD = "MANUTENCAO";
const DEFAULT_MESSAGE =
	"Estamos realizando uma manutencao programada. Voltaremos em breve.";
const STATE_CACHE_MS = 2_000;
const MAX_DURATION_MINUTES = 7 * 24 * 60;

let stateCache = null;
let expiryTimer = null;
let lastMiddlewareErrorAt = 0;

function text(value, max = 500) {
	return String(value ?? "").trim().slice(0, max);
}

function compactDetails(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const compact = {};
	for (const [key, detail] of Object.entries(value).slice(0, 20)) {
		const safeKey = text(key, 80);
		if (!safeKey) continue;
		compact[safeKey] =
			typeof detail === "number" || typeof detail === "boolean"
				? detail
				: text(detail, 500);
	}
	return compact;
}

function actor(user = {}) {
	const profile = user.profile || user;
	return {
		id: text(profile.uid || profile.id || profile.email, 160),
		name: text(
			profile.nome || profile.name || profile.displayName || profile.email,
			200,
		),
	};
}

function normalizeConfirmation(value) {
	return text(value, 40)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toUpperCase();
}

function normalizeDuration(value) {
	if (value === null || value === undefined || value === "") return null;
	const duration = Math.trunc(Number(value));
	if (!Number.isFinite(duration) || duration < 1 || duration > MAX_DURATION_MINUTES) {
		const error = new Error(
			`A pausa automatica deve ficar entre 1 e ${MAX_DURATION_MINUTES} minutos.`,
		);
		error.statusCode = 400;
		throw error;
	}
	return duration;
}

function normalizeRedirectUrl(value, enabled) {
	if (!enabled) return "";
	const raw = text(value, 1000);
	if (!raw) {
		const error = new Error("Informe o endereco para redirecionamento.");
		error.statusCode = 400;
		throw error;
	}
	let parsed;
	try {
		parsed = new URL(raw);
	} catch {
		const error = new Error("Informe uma URL valida para redirecionamento.");
		error.statusCode = 400;
		throw error;
	}
	if (!["http:", "https:"].includes(parsed.protocol)) {
		const error = new Error("O redirecionamento deve usar HTTP ou HTTPS.");
		error.statusCode = 400;
		throw error;
	}
	if (/^(www\.)?retiradas\.tech$/i.test(parsed.hostname)) {
		const error = new Error("O redirecionamento nao pode apontar para o proprio site.");
		error.statusCode = 400;
		throw error;
	}
	return parsed.toString();
}

function publicState(row = {}) {
	return {
		active: Boolean(row.active),
		message: row.message || DEFAULT_MESSAGE,
		redirectEnabled: Boolean(row.redirect_enabled),
		redirectUrl: row.redirect_enabled ? row.redirect_url || "" : "",
		startedAt: row.started_at || null,
		scheduledEndAt: row.scheduled_end_at || null,
		updatedAt: row.updated_at || null,
	};
}

function clearStateCache() {
	stateCache = null;
}

async function autoDeactivateExpired() {
	const client = await db.connect();
	try {
		await client.query("begin");
		const current = await client.query(
			`select * from system_maintenance_settings where id=1 for update`,
		);
		const row = current.rows[0];
		if (!row?.active || !row.scheduled_end_at || new Date(row.scheduled_end_at) > new Date()) {
			await client.query("commit");
			return row;
		}
		await client.query(
			`update system_maintenance_history
			    set ended_at=now(),
			        duration_seconds=greatest(0,extract(epoch from (now()-started_at))::integer),
			        ended_by_id='system',ended_by_name='Sistema',ended_reason='AUTO'
			  where id=$1 and ended_at is null`,
			[row.current_history_id],
		);
		const updated = await client.query(
			`update system_maintenance_settings
			    set active=false,redirect_enabled=false,redirect_url=null,
			        scheduled_end_at=null,current_history_id=null,updated_at=now()
			  where id=1 returning *`,
		);
		await client.query("commit");
		clearStateCache();
		return updated.rows[0];
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function getPublicStatus({ force = false } = {}) {
	if (!force && stateCache && Date.now() - stateCache.at < STATE_CACHE_MS) {
		return stateCache.value;
	}
	const result = await db.query(`select * from system_maintenance_settings where id=1`);
	let row = result?.rows?.[0] || {};
	if (row.active && row.scheduled_end_at && new Date(row.scheduled_end_at) <= new Date()) {
		row = await autoDeactivateExpired();
	}
	const value = publicState(row);
	stateCache = { at: Date.now(), value };
	return value;
}

async function activateMaintenance(payload = {}, user = {}) {
	if (normalizeConfirmation(payload.confirmation) !== CONFIRMATION_WORD) {
		const error = new Error(`Digite ${CONFIRMATION_WORD} para confirmar.`);
		error.statusCode = 400;
		throw error;
	}
	const durationMinutes = normalizeDuration(payload.durationMinutes);
	const redirectEnabled = payload.redirectEnabled === true;
	const redirectUrl = normalizeRedirectUrl(payload.redirectUrl, redirectEnabled);
	const message = text(payload.message, 600) || DEFAULT_MESSAGE;
	const reason = text(payload.reason, 600);
	const startedBy = actor(user);
	const historyId = crypto.randomUUID();
	const client = await db.connect();
	try {
		await client.query("begin");
		const current = await client.query(
			`select active from system_maintenance_settings where id=1 for update`,
		);
		if (current.rows[0]?.active) {
			const error = new Error("O site ja esta em manutencao.");
			error.statusCode = 409;
			throw error;
		}
		await client.query(
			`insert into system_maintenance_history
			 (id,scheduled_end_at,planned_minutes,message,reason,redirect_enabled,redirect_url,started_by_id,started_by_name)
			 values ($1,case when $2::integer is null then null else now()+($2::integer*interval '1 minute') end,
			 $2,$3,$4,$5,$6,$7,$8)`,
			[
				historyId,
				durationMinutes,
				message,
				reason || null,
				redirectEnabled,
				redirectUrl || null,
				startedBy.id || null,
				startedBy.name || null,
			],
		);
		const updated = await client.query(
			`update system_maintenance_settings
			    set active=true,message=$1,reason=$2,redirect_enabled=$3,redirect_url=$4,
			        started_at=now(),
			        scheduled_end_at=case when $5::integer is null then null else now()+($5::integer*interval '1 minute') end,
			        started_by_id=$6,started_by_name=$7,current_history_id=$8,updated_at=now()
			  where id=1 returning *`,
			[
				message,
				reason || null,
				redirectEnabled,
				redirectUrl || null,
				durationMinutes,
				startedBy.id || null,
				startedBy.name || null,
				historyId,
			],
		);
		await client.query("commit");
		clearStateCache();
		return publicState(updated.rows[0]);
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function deactivateMaintenance(user = {}, endedReason = "MANUAL") {
	const endedBy = actor(user);
	const client = await db.connect();
	try {
		await client.query("begin");
		const current = await client.query(
			`select * from system_maintenance_settings where id=1 for update`,
		);
		const row = current.rows[0];
		if (!row?.active) {
			await client.query("commit");
			return publicState(row || {});
		}
		await client.query(
			`update system_maintenance_history
			    set ended_at=now(),duration_seconds=greatest(0,extract(epoch from (now()-started_at))::integer),
			        ended_by_id=$2,ended_by_name=$3,ended_reason=$4
			  where id=$1 and ended_at is null`,
			[
				row.current_history_id,
				endedBy.id || null,
				endedBy.name || null,
				endedReason,
			],
		);
		const updated = await client.query(
			`update system_maintenance_settings
			    set active=false,redirect_enabled=false,redirect_url=null,scheduled_end_at=null,
			        current_history_id=null,updated_at=now()
			  where id=1 returning *`,
		);
		await client.query("commit");
		clearStateCache();
		return publicState(updated.rows[0]);
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function listHistory({ page = 1, limit = 20 } = {}) {
	const safePage = Math.max(1, Math.trunc(Number(page) || 1));
	const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 20)));
	const result = await db.query(
		`select count(*) over()::integer total_count,*
		   from system_maintenance_history
		  order by started_at desc limit $1 offset $2`,
		[safeLimit, (safePage - 1) * safeLimit],
	);
	return {
		items: result.rows,
		page: safePage,
		limit: safeLimit,
		total: Number(result.rows[0]?.total_count || 0),
	};
}

async function recordServiceWorkerEvent(payload = {}, userAgent = "") {
	const allowed = new Set([
		"INSTALLED",
		"ACTIVATED",
		"INSTALL_FAILURE",
		"ACTIVATION_FAILURE",
		"NAVIGATION_FAILURE",
		"CACHE_FAILURE",
		"NETWORK_FALLBACK",
		"UPDATE_FOUND",
		"HEARTBEAT",
	]);
	const eventType = text(payload.eventType, 60).toUpperCase();
	if (!allowed.has(eventType)) {
		const error = new Error("Evento de service worker invalido.");
		error.statusCode = 400;
		throw error;
	}
	await db.query(
		`insert into maintenance_service_worker_events
		 (event_type,version,client_id,path,details,user_agent)
		 values ($1,$2,$3,$4,$5::jsonb,$6)`,
		[
			eventType,
			text(payload.version, 100) || null,
			text(payload.clientId, 160) || null,
			text(payload.path, 500) || null,
			JSON.stringify(compactDetails(payload.details)),
			text(userAgent, 500) || null,
		],
	);
	if (Math.random() < 0.02) {
		await db.query(
			`delete from maintenance_service_worker_events where occurred_at < now()-interval '90 days'`,
		);
	}
	return { ok: true };
}

async function getServiceWorkerMetrics(hours = 24) {
	const safeHours = Math.min(24 * 30, Math.max(1, Number(hours) || 24));
	const [summary, versions, recent, dailyVisits] = await Promise.all([
		db.query(
			`select count(*)::integer total,
			 count(*) filter(where event_type in ('INSTALL_FAILURE','ACTIVATION_FAILURE'))::integer failures,
			 count(*) filter(where event_type in ('NAVIGATION_FAILURE','CACHE_FAILURE'))::integer network_failures,
			 count(*) filter(where event_type='NETWORK_FALLBACK')::integer network_fallbacks,
			 count(distinct nullif(client_id,''))::integer clients,
			 max(occurred_at) last_event_at
			 from maintenance_service_worker_events
			 where occurred_at>=now()-($1::numeric*interval '1 hour')`,
			[safeHours],
		),
		db.query(
			`select coalesce(version,'desconhecida') version,count(*)::integer events,
			 max(occurred_at) last_seen_at
			 from maintenance_service_worker_events
			 where occurred_at>=now()-($1::numeric*interval '1 hour')
			 group by version order by last_seen_at desc limit 10`,
			[safeHours],
		),
		db.query(
			`select event_type,version,path,details,occurred_at
			 from maintenance_service_worker_events
			 order by occurred_at desc limit 30`,
		),
		db.query(
			`select
			 count(*) filter(where event_type='HEARTBEAT')::integer visits_today,
			 count(distinct nullif(client_id,'')) filter(where event_type='HEARTBEAT')::integer unique_visitors_today
			 from maintenance_service_worker_events
			 where occurred_at>=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
			   and occurred_at<(date_trunc('day',now() at time zone 'America/Sao_Paulo')+interval '1 day') at time zone 'America/Sao_Paulo'`,
		),
	]);
	return {
		...(summary.rows[0] || {}),
		...(dailyVisits.rows[0] || {}),
		versions: versions.rows,
		recent: recent.rows,
	};
}

async function getPresenceMetrics() {
	const result = await db.query(
		`select
		 count(distinct user_id) filter(where last_seen_at>=now()-interval '5 minutes')::integer online_users,
		 count(distinct session_id) filter(
		   where last_seen_at>=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
		 )::integer authenticated_sessions_today
		 from maintenance_active_sessions
		 where last_seen_at>=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'`,
	);
	return result.rows[0] || {};
}

async function getDashboard({ hours = 24 } = {}) {
	const safeHours = Math.min(24 * 30, Math.max(1, Number(hours) || 24));
	const [state, status, requestMetrics, serviceWorker, presence, history] = await Promise.all([
		getPublicStatus({ force: true }),
		apiStatus.getApiStatus(),
		metrics.getMaintenanceMetrics({ hours: safeHours }),
		getServiceWorkerMetrics(safeHours),
		getPresenceMetrics(),
		listHistory({ page: 1, limit: 8 }),
	]);
	return {
		state,
		status,
		metrics: requestMetrics,
		serviceWorker,
		presence,
		history,
		hours: safeHours,
	};
}

function isExemptPath(pathname = "") {
	return (
		pathname === "/api/health" ||
		pathname.startsWith("/api/auth/") ||
		pathname === "/api/auth" ||
		pathname.startsWith("/api/maintenance/") ||
		pathname === "/api/maintenance"
	);
}

async function maintenanceMiddleware(req, res, next) {
	try {
		if (isExemptPath(req.path)) return next();
		const state = await getPublicStatus();
		if (!state.active) return next();
		res.set("Cache-Control", "no-store");
		res.set("Retry-After", "30");
		res.status(503).json({
			ok: false,
			maintenance: true,
			error: "Sistema temporariamente em manutencao.",
			...state,
		});
	} catch (error) {
		const now = Date.now();
		if (now - lastMiddlewareErrorAt >= 60_000) {
			lastMiddlewareErrorAt = now;
			console.error(
				"[maintenance] Falha ao consultar estado; mantendo acesso liberado:",
				error?.message || error,
			);
		}
		next();
	}
}

function startWorker() {
	if (expiryTimer) return;
	expiryTimer = setInterval(() => {
		getPublicStatus({ force: true }).catch((error) =>
			console.error("[maintenance] Falha ao validar expiracao:", error?.message || error),
		);
	}, 30_000);
	expiryTimer.unref?.();
}

function stopWorker() {
	if (expiryTimer) clearInterval(expiryTimer);
	expiryTimer = null;
}

module.exports = {
	CONFIRMATION_WORD,
	activateMaintenance,
	deactivateMaintenance,
	getDashboard,
	getPublicStatus,
	isExemptPath,
	listHistory,
	maintenanceMiddleware,
	normalizeConfirmation,
	normalizeDuration,
	normalizeRedirectUrl,
	recordServiceWorkerEvent,
	startWorker,
	stopWorker,
};
