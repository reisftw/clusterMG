const db = require("./db");

function text(value) {
	return String(value ?? "").trim();
}

function integer(value) {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function nowIso() {
	return new Date().toISOString();
}

function mapRuntimeEvent(row = {}) {
	const payload = row.payload || {};
	return {
		...payload,
		id: row.id,
		type: row.type || payload.type || "",
		pid: row.pid ?? payload.pid ?? null,
		nodeVersion: row.node_version || payload.nodeVersion || "",
		uptimeSeconds: Number(row.uptime_seconds ?? payload.uptimeSeconds ?? 0),
		createdAt: payload.createdAt || row.created_at,
		details: row.details || payload.details || {},
	};
}

function mapServiceEvent(row = {}) {
	const payload = row.payload || {};
	return {
		...payload,
		id: row.id,
		type: row.type || payload.type || "",
		serviceId: row.service_id || payload.serviceId || "",
		serviceName: row.service_name || payload.serviceName || "",
		status: row.status || payload.status || "",
		previousStatus: row.previous_status || payload.previousStatus || "",
		reason: row.reason || payload.reason || "",
		responseMs: row.response_ms ?? payload.responseMs ?? null,
		checkedAt: row.checked_at || payload.checkedAt || null,
		createdAt: payload.createdAt || row.created_at,
	};
}

async function recordRuntimeEvent(data = {}) {
	const id = text(data.id);
	await db.query(
		`insert into api_runtime_events (
       id, type, pid, node_version, uptime_seconds, details, payload,
       legacy_path, legacy_document_id
     ) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)
     on conflict (id) do update set
       type = excluded.type,
       pid = excluded.pid,
       node_version = excluded.node_version,
       uptime_seconds = excluded.uptime_seconds,
       details = excluded.details,
       payload = excluded.payload,
       legacy_path = excluded.legacy_path,
       legacy_document_id = excluded.legacy_document_id,
       updated_at = now()`,
		[
			id,
			text(data.type),
			integer(data.pid),
			text(data.nodeVersion),
			integer(data.uptimeSeconds),
			JSON.stringify(data.details || {}),
			JSON.stringify(data),
			`api_runtime_events/${id}`,
			id,
		],
	);
	return data;
}

async function listRuntimeEvents(limit = 30) {
	const safeLimit = Math.max(1, Math.min(Number(limit || 30), 100));
	const result = await db.query(
		`select * from api_runtime_events
		  order by created_at desc
		  limit $1`,
		[safeLimit],
	);
	return result.rows.map(mapRuntimeEvent);
}

async function recordServiceEvent(data = {}) {
	const id = text(data.id);
	await db.query(
		`insert into api_service_events (
       id, type, service_id, service_name, status, previous_status, reason,
       response_ms, checked_at, payload, legacy_path, legacy_document_id
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)
     on conflict (id) do update set
       type = excluded.type,
       service_id = excluded.service_id,
       service_name = excluded.service_name,
       status = excluded.status,
       previous_status = excluded.previous_status,
       reason = excluded.reason,
       response_ms = excluded.response_ms,
       checked_at = excluded.checked_at,
       payload = excluded.payload,
       legacy_path = excluded.legacy_path,
       legacy_document_id = excluded.legacy_document_id,
       updated_at = now()`,
		[
			id,
			text(data.type),
			text(data.serviceId),
			text(data.serviceName),
			text(data.status),
			text(data.previousStatus),
			text(data.reason),
			numberOrNull(data.responseMs),
			data.checkedAt || null,
			JSON.stringify(data),
			`api_service_events/${id}`,
			id,
		],
	);
	return data;
}

async function listServiceEvents(limit = 50) {
	const safeLimit = Math.max(1, Math.min(Number(limit || 50), 100));
	const result = await db.query(
		`select * from api_service_events
		  order by created_at desc
		  limit $1`,
		[safeLimit],
	);
	return result.rows.map(mapServiceEvent);
}

async function getLastServiceStatuses(limit = 300) {
	const safeLimit = Math.max(1, Math.min(Number(limit || 300), 1000));
	const result = await db.query(
		`select * from api_service_events
		  order by created_at desc
		  limit $1`,
		[safeLimit],
	);
	const map = new Map();
	result.rows.map(mapServiceEvent).forEach((event) => {
		if (event.serviceId && !map.has(event.serviceId)) {
			map.set(event.serviceId, event);
		}
	});
	return map;
}

function buildRuntimeEvent(type, details = {}) {
	const createdAt = nowIso();
	const id = `${createdAt.replace(/\D/g, "")}_${process.pid}_${type}`;
	return {
		id,
		type,
		pid: process.pid,
		nodeVersion: process.version,
		uptimeSeconds: Math.floor(process.uptime()),
		createdAt,
		details,
	};
}

function buildServiceEvent(service, previousStatus = "") {
	const createdAt = nowIso();
	return {
		id: `${createdAt.replace(/\D/g, "")}_${service.id}_${service.status}`,
		type: previousStatus ? "status_change" : "initial",
		serviceId: service.id,
		serviceName: service.name,
		status: service.status,
		previousStatus,
		reason: service.reason || "",
		responseMs: service.details?.responseMs ?? null,
		checkedAt: service.checkedAt,
		createdAt,
	};
}

module.exports = {
	buildRuntimeEvent,
	buildServiceEvent,
	getLastServiceStatuses,
	listRuntimeEvents,
	listServiceEvents,
	recordRuntimeEvent,
	recordServiceEvent,
};
