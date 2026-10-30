const crypto = require("node:crypto");
const db = require("../db");
const notificationsService = require("../notificationsService");
const { broadcastRealtime } = require("../realtime");
const usersRepository = require("../usersRepository");
const serviceOrderRequestsService = require("../serviceOrders/requests/serviceOrderRequestsService");

const MAPS_PERMISSIONS = Object.freeze({
	ACCESS: "retiradas.maps.v2.access",
	ASSIGNED: "retiradas.maps.v2.view_assigned",
	OPPORTUNITIES: "retiradas.maps.v2.view_opportunities",
	RADAR: "retiradas.maps.v2.radar",
	REQUEST: "retiradas.maps.v2.request_os",
	VIEW_REQUESTS: "retiradas.maps.v2.view_requests",
	APPROVE: "retiradas.maps.v2.approve_request",
	REJECT: "retiradas.maps.v2.reject_request",
	ROUTES: "retiradas.maps.v2.manage_routes",
	SETTINGS: "retiradas.maps.v2.manage_settings",
	AUDIT: "retiradas.maps.v2.audit",
	LIVE_TECHNICIANS: "retiradas.maps.v2.live_technicians",
});

const ALLOWED_RADII = new Set([100, 250, 300, 500, 1000]);
const ALLOWED_ORDER_TYPES = Object.freeze([
	"RETIRADA FTTH",
	"RETIRADA - OUTROS",
	"RETIRADA",
	"CANCELAMENTO FTTH",
	"CANCELAMENTO - OUTROS",
	"CANCELAMENTO",
	"CANCELAMENTO & RETIRADA - SEGUNDA TENTATIVA",
	"RETIRADA & CANCELAMENTO - SEGUNDA TENTATIVA",
	"CANCELAMENTO LOJA",
]);
const CLOSED_STATUS_PATTERN = /(CONCLUID|FINALIZ|FECHAD|CANCELAD|REALIZAD)/i;
const AVAILABLE_TECHNICIANS = new Set(["", "FILA", "NENHUM", "NAO DEFINIDO", "SEM TECNICO"]);
const MAX_POINTS = 25000;
const ALERT_COOLDOWN_MINUTES = 30;
const ALERT_HYSTERESIS_METERS = 100;
const MAX_ALERTS_PER_HOUR = 5;
const NATIVE_COORDINATES_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const GEOCODE_QUEUE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const GEOCODE_QUEUE_BATCH_LIMIT = 25000;
const DEFAULT_GEOCODER_URL = "https://nominatim.openstreetmap.org/search";

function broadcastMapsUpdate(action, payload = {}) {
	broadcastRealtime("maps", {
		action,
		...payload,
	});
}

function broadcastMapsAdminUpdate(action, payload = {}) {
	broadcastRealtime("maps-admin", {
		action,
		...payload,
	});
}

function text(value) {
	return String(value ?? "").trim();
}

function normalize(value) {
	return text(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toUpperCase();
}

function apiError(message, statusCode = 400, code = "MAPS_ERROR") {
	const error = new Error(message);
	error.statusCode = statusCode;
	error.code = code;
	return error;
}

function featureEnabled() {
	return String(process.env.RETIRADAS_MAPS_V2_ENABLED || "true").toLowerCase() !== "false";
}

function geocoderUrl() {
	return text(process.env.MAPS_GEOCODER_URL) || DEFAULT_GEOCODER_URL;
}

function userProfile(user = {}) {
	return user.profile || user;
}

function userId(user = {}) {
	const profile = userProfile(user);
	return text(user.uid || user.id || profile.uid || profile.id || user.email || profile.email);
}

function userName(user = {}) {
	const profile = userProfile(user);
	return text(
		user.nome ||
			user.name ||
			user.displayName ||
			profile.nome ||
			profile.name ||
			user.email ||
			profile.email,
	);
}

function userEmail(user = {}) {
	const profile = userProfile(user);
	return text(user.email || profile.email).toLowerCase();
}

function userTechnicianNames(user = {}) {
	const profile = userProfile(user);
	return [...new Set([
		profile.metasTecnicoNome,
		profile.metas_tecnico_nome,
		profile.technicianName,
		profile.nomeTecnico,
		user.metasTecnicoNome,
		userName(user),
	].map(normalize).filter(Boolean))];
}

function userTechnicianName(user = {}) {
	const profile = userProfile(user);
	return text(
		profile.metasTecnicoNome ||
			profile.metas_tecnico_nome ||
			profile.technicianName ||
			profile.nomeTecnico ||
			user.metasTecnicoNome,
	);
}

function isTechnicianUser(user = {}) {
	const profile = userProfile(user);
	return normalize(user.role || profile.role) === "TECNICO";
}

function hasPermission(user = {}, permission) {
	const profile = userProfile(user);
	const permissions = Array.isArray(user.permissions)
		? user.permissions
		: Array.isArray(profile.permissions)
			? profile.permissions
			: [];
	const role = normalize(user.role || profile.role);
	return ["ADMIN", "SUPERADMIN"].includes(role) || permissions.includes("*") || permissions.includes(permission);
}

function numberInRange(value, min, max, fallback = null) {
	if (value === undefined || value === null || value === "") return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
	return parsed;
}

function usableOrderCoordinates(latitudeValue, longitudeValue) {
	const latitude = Number(latitudeValue);
	const longitude = Number(longitudeValue);
	return Number.isFinite(latitude) && Number.isFinite(longitude) &&
		latitude >= -34 && latitude <= 6 && longitude >= -74 && longitude <= -33;
}

function parseCoordinates(input = {}) {
	const latitude = numberInRange(input.latitude ?? input.lat, -90, 90);
	const longitude = numberInRange(input.longitude ?? input.lng, -180, 180);
	if (latitude === null || longitude === null) {
		throw apiError("Informe latitude e longitude validas.");
	}
	return { latitude, longitude };
}

function optionalNumberInRange(value, min, max) {
	if (value === undefined || value === null || value === "") return null;
	return numberInRange(value, min, max);
}

function technicianPresenceStatus(lastSeenAt, now = Date.now()) {
	const timestamp = new Date(lastSeenAt).getTime();
	if (!Number.isFinite(timestamp)) return "stale";
	const ageMs = Math.max(0, now - timestamp);
	if (ageMs <= 2 * 60 * 1000) return "active";
	if (ageMs <= 10 * 60 * 1000) return "recent";
	return "stale";
}

function haversineMeters(left, right) {
	const earthRadius = 6371000;
	const toRad = (value) => (Number(value) * Math.PI) / 180;
	const deltaLat = toRad(Number(right.latitude) - Number(left.latitude));
	const deltaLon = toRad(Number(right.longitude) - Number(left.longitude));
	const lat1 = toRad(left.latitude);
	const lat2 = toRad(right.latitude);
	const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
	return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function boundingBox(latitude, longitude, radiusMeters) {
	const latDelta = radiusMeters / 111320;
	const lonScale = Math.max(Math.cos((latitude * Math.PI) / 180), 0.2);
	const lonDelta = radiusMeters / (111320 * lonScale);
	return {
		minLat: latitude - latDelta,
		maxLat: latitude + latDelta,
		minLng: longitude - lonDelta,
		maxLng: longitude + lonDelta,
	};
}

function firstAndLastName(value) {
	const parts = text(value).split(/\s+/).filter(Boolean);
	if (parts.length < 2) return parts[0] || "Cliente";
	return `${parts[0]} ${parts.at(-1)}`;
}

function deterministicApproximation(orderId, latitude, longitude) {
	const secret = process.env.MAPS_PRIVACY_SECRET || process.env.JWT_SECRET || "maps-v2-privacy";
	const digest = crypto.createHmac("sha256", secret).update(text(orderId)).digest();
	const angle = (digest.readUInt16BE(0) / 65535) * Math.PI * 2;
	const distance = 180 + (digest.readUInt16BE(2) % 170);
	const latOffset = (distance * Math.cos(angle)) / 111320;
	const lonScale = Math.max(Math.cos((Number(latitude) * Math.PI) / 180), 0.2);
	const lonOffset = (distance * Math.sin(angle)) / (111320 * lonScale);
	return {
		latitude: Number((Number(latitude) + latOffset).toFixed(5)),
		longitude: Number((Number(longitude) + lonOffset).toFixed(5)),
	};
}

function isAvailableTechnician(value) {
	return AVAILABLE_TECHNICIANS.has(normalize(value));
}

function categoryForOrder(row, user) {
	if (
		row.open_request_status === "EFFECTED" &&
		text(row.open_requester_user_id) === userId(user)
	) return "assigned";
	const technician = normalize(row.tecnico);
	if (technician && userTechnicianNames(user).includes(technician)) return "assigned";
	return "opportunity";
}

function validateOrderRow(row) {
	return ALLOWED_ORDER_TYPES.includes(normalize(row.tipo)) && !CLOSED_STATUS_PATTERN.test(text(row.status));
}

function mapPoint(row, user, { origin = null } = {}) {
	const category = categoryForOrder(row, user);
	const scheduled = /AGEND/i.test(text(row.status));
	const parsedLatitude = Number(row.latitude);
	const parsedLongitude = Number(row.longitude);
	const locationAvailable = usableOrderCoordinates(parsedLatitude, parsedLongitude);
	const exact = {
		latitude: locationAvailable ? parsedLatitude : null,
		longitude: locationAvailable ? parsedLongitude : null,
	};
	const coordinates = exact;
	const distanceMeters = origin && locationAvailable ? haversineMeters(origin, exact) : null;
	const assignedToCurrentUser = category === "assigned";
	const requestable = category === "opportunity" && isAvailableTechnician(row.tecnico) && !row.open_request_id;
	const base = {
		id: row.id,
		orderNumber: row.num_os,
		clientCode: row.codigo_cliente || "",
		category,
		scheduled,
		latitude: coordinates.latitude,
		longitude: coordinates.longitude,
		coordinatesApproximate: false,
		locationAvailable,
		requestable,
		assignedToCurrentUser,
		clientName: firstAndLastName(row.nome_cliente),
		address: row.endereco_resumo || row.endereco || "Endereco nao informado",
		technician: row.tecnico || "",
		city: row.cidade || "Cidade nao informada",
		neighborhood: row.bairro || "Bairro nao informado",
		company: row.empresa || "",
		regional: row.regional || "",
		type: row.tipo || "",
		status: row.status || "",
		priority: /SEGUNDA TENTATIVA/i.test(text(row.tipo)) ? "high" : "normal",
		distanceMeters,
		lastUpdatedAt: row.updated_at,
	};
	return base;
}

function parseViewport(query = {}) {
	const minLat = numberInRange(query.minLat, -90, 90);
	const maxLat = numberInRange(query.maxLat, -90, 90);
	const minLng = numberInRange(query.minLng, -180, 180);
	const maxLng = numberInRange(query.maxLng, -180, 180);
	if ([minLat, maxLat, minLng, maxLng].every((value) => value !== null)) {
		if (minLat > maxLat || minLng > maxLng) throw apiError("Viewport geografico invalido.");
		return { minLat, maxLat, minLng, maxLng };
	}
	if (query.latitude !== undefined || query.lat !== undefined) {
		const origin = parseCoordinates(query);
		const radiusMeters = Math.min(Math.max(Number(query.radiusMeters || query.radius || 5000), 100), 20000);
		return { ...boundingBox(origin.latitude, origin.longitude, radiusMeters), origin, radiusMeters };
	}
	return null;
}

let nativeCoordinatesSyncPromise = null;
let nativeCoordinatesLastSyncAt = 0;
async function syncNativeCoordinates({ force = false } = {}) {
	if (!force && Date.now() - nativeCoordinatesLastSyncAt < NATIVE_COORDINATES_SYNC_INTERVAL_MS) {
		return { skipped: true };
	}
	if (nativeCoordinatesSyncPromise) return nativeCoordinatesSyncPromise;
	nativeCoordinatesSyncPromise = db.query(
		`insert into maps_order_locations
		 (order_id, latitude, longitude, coordinate_source, accuracy_level, validated_at, last_seen_at)
		 select id, latitude, longitude, 'SOURCE', 'EXACT', now(), now()
		   from ordens_servico
		  where latitude is not null and longitude is not null
		    and latitude between -34 and 6 and longitude between -74 and -33
		 on conflict (order_id) do update set
		   latitude = excluded.latitude,
		   longitude = excluded.longitude,
		   coordinate_source = excluded.coordinate_source,
		   accuracy_level = excluded.accuracy_level,
		   validated_at = excluded.validated_at,
		   last_seen_at = now(),
		   updated_at = now()`,
	).then((result) => {
		nativeCoordinatesLastSyncAt = Date.now();
		return result;
	}).finally(() => {
		nativeCoordinatesSyncPromise = null;
	});
	return nativeCoordinatesSyncPromise;
}

function sourceFilters({ query = {}, params = [] } = {}) {
	const clauses = [
		"o.source_collection in ('ordens_abertas', 'mapa_os_abertas', 'match_os_abertas')",
		"upper(coalesce(o.tipo, '')) = any($1::text[])",
		"upper(coalesce(o.status, '')) !~ '(CONCLUID|FINALIZ|FECHAD|CANCELAD|REALIZAD)'",
	];
	params.push(ALLOWED_ORDER_TYPES);
	const viewport = parseViewport(query);
	if (viewport) {
		params.push(viewport.minLat, viewport.maxLat, viewport.minLng, viewport.maxLng);
		clauses.push(`(
		  l.latitude between $${params.length - 3} and $${params.length - 2}
		  and l.longitude between $${params.length - 1} and $${params.length}
		)`);
	}
	if (text(query.city)) {
		params.push(text(query.city));
		clauses.push(`lower(o.cidade) = lower($${params.length})`);
	}
	if (text(query.neighborhood)) {
		params.push(`%${text(query.neighborhood)}%`);
		clauses.push(`o.bairro ilike $${params.length}`);
	}
	return { clauses, params, viewport };
}

async function queryCandidateRows(query = {}, user = {}, limit = MAX_POINTS) {
	const params = [];
	const { clauses, viewport } = sourceFilters({ query, user, params });
	params.push(Math.min(Math.max(Number(limit || MAX_POINTS), 1), MAX_POINTS));
	const result = await db.query(
		`select * from (
		 select distinct on (o.num_os)
		        o.id, o.num_os, o.codigo_cliente, o.nome_cliente, o.empresa,
		        o.tipo, o.status, o.tecnico, o.cidade, o.regional, o.endereco,
		        o.endereco_resumo, o.bairro, o.numero, o.data_abertura,
		        o.updated_at, l.latitude, l.longitude, l.coordinate_source,
		        l.accuracy_level, request.id as open_request_id,
		        request.status as open_request_status,
		        request.requester_user_id as open_requester_user_id
		   from ordens_servico o
		   left join maps_order_locations l on l.order_id = o.id
		   left join maps_assignment_requests request
		     on request.order_id = o.id
		    and request.status in ('PENDING', 'APPROVED', 'PENDING_EFFECTUATION', 'EFFECTED')
		  where ${clauses.join(" and ")}
		  order by o.num_os, o.updated_at desc
		 ) candidate
		 order by
		   case when latitude between -34 and 6 and longitude between -74 and -33 then 0 else 1 end,
		   data_abertura desc nulls last,
		   updated_at desc
		  limit $${params.length}`,
		params,
	);
	return { rows: result.rows, viewport };
}

function filterVisiblePoint(point, user, categories) {
	if (point.category === "assigned" && !hasPermission(user, MAPS_PERMISSIONS.ASSIGNED)) return false;
	if (point.category === "opportunity" && !hasPermission(user, MAPS_PERMISSIONS.OPPORTUNITIES)) return false;
	if (point.category === "unavailable") return false;
	return !categories.size || categories.has(point.category);
}

async function listPoints(query = {}, user = {}) {
	if (!featureEnabled()) throw apiError("Retiradas Maps 2.0 esta desativado.", 503, "MAPS_DISABLED");
	await reconcileEffectuationRequests();
	await syncNativeCoordinates();
	const categories = new Set(text(query.categories || query.category).split(",").map((item) => item.trim()).filter(Boolean));
	const { rows, viewport } = await queryCandidateRows(query, user, query.limit || MAX_POINTS);
	const origin = viewport?.origin || null;
	let items = rows.filter(validateOrderRow).map((row) => mapPoint(row, user, { origin }));
	items = items.filter((point) => filterVisiblePoint(point, user, categories));
	if (origin && viewport.radiusMeters) {
		items = items.filter((point) => !point.locationAvailable || point.distanceMeters <= viewport.radiusMeters);
	}
	items.sort((left, right) => (left.distanceMeters ?? Infinity) - (right.distanceMeters ?? Infinity));
	return {
		items,
		total: items.length,
		truncated: rows.length >= Math.min(Number(query.limit || MAX_POINTS), MAX_POINTS),
		lastSyncAt: rows.reduce((latest, row) => latest > text(row.updated_at) ? latest : text(row.updated_at), ""),
		summary: {
			assigned: items.filter((item) => item.category === "assigned").length,
			opportunities: items.filter((item) => item.category === "opportunity").length,
			scheduled: items.filter((item) => item.scheduled).length,
			locationPending: items.filter((item) => !item.locationAvailable).length,
		},
		privacy: { opportunitiesApproximate: false },
	};
}

async function getSummary(query = {}, user = {}) {
	const response = await listPoints({ ...query, limit: MAX_POINTS }, user);
	return {
		total: response.total,
		assigned: response.items.filter((item) => item.category === "assigned").length,
		opportunities: response.items.filter((item) => item.category === "opportunity").length,
		scheduled: response.items.filter((item) => item.scheduled).length,
		lastSyncAt: response.lastSyncAt,
		truncated: response.truncated,
	};
}

async function getOrder(orderId, user = {}) {
	const result = await db.query(
		`select o.*, l.latitude, l.longitude, l.coordinate_source, l.accuracy_level,
		        request.id as open_request_id, request.status as open_request_status,
		        request.requester_user_id as open_requester_user_id
		   from ordens_servico o
		   left join maps_order_locations l on l.order_id = o.id
		   left join maps_assignment_requests request
		     on request.order_id = o.id
		    and request.status in ('PENDING', 'APPROVED', 'PENDING_EFFECTUATION', 'EFFECTED')
		  where o.id = $1
		  limit 1`,
		[text(orderId)],
	);
	const row = result.rows[0];
	if (!row || !validateOrderRow(row)) throw apiError("Ordem nao encontrada no Maps.", 404, "ORDER_NOT_FOUND");
	const point = mapPoint(row, user);
	if (!filterVisiblePoint(point, user, new Set())) throw apiError("Voce nao pode visualizar esta ordem.", 403, "ORDER_FORBIDDEN");
	return point;
}

async function createRequest(payload = {}, user = {}) {
	const orderId = text(payload.orderId || payload.order_id);
	if (!orderId) throw apiError("Informe a ordem desejada.");
	const order = await getOrder(orderId, user);
	if (order.category !== "opportunity" || !order.requestable) throw apiError("Esta ordem nao esta disponivel para solicitacao.", 409, "ORDER_UNAVAILABLE");
	try {
		const result = await db.query(
			`insert into maps_assignment_requests
			 (order_id, requester_user_id, requester_name, requester_email, regional, city, source_snapshot)
			 values ($1, $2, $3, $4, $5, $6, $7::jsonb)
			 returning *`,
			[orderId, userId(user), userName(user), userEmail(user), order.regional, order.city, JSON.stringify({
				orderNumber: order.orderNumber,
				clientCode: order.clientCode,
				type: order.type,
				status: order.status,
				company: order.company,
				technicianHubsoftName: userTechnicianName(user),
			})],
		);
		await notificationsService.createNotification({
			type: "maps_solicitacao",
			title: "Nova solicitacao de retirada no Maps",
			message: `${userName(user)} solicitou a O.S ${order.orderNumber} em ${order.city}.`,
			targetPath: "/maps?panel=requests",
			severity: "warning",
			user,
			targets: { roles: ["admin", "backoffice", "backoffice_retirada"] },
			meta: { module: "maps_v2", requestId: result.rows[0].id },
		});
		broadcastMapsUpdate("REQUEST_CREATED", {
			requestId: result.rows[0].id,
			orderId,
			requesterUserId: userId(user),
			status: "PENDING",
		});
		return { item: result.rows[0] };
	} catch (error) {
		if (error?.code === "23505") throw apiError("Esta OS ja possui uma solicitacao em andamento.", 409, "REQUEST_CONFLICT");
		throw error;
	}
}

async function listRequests(query = {}, user = {}, canManage = false) {
	await reconcileEffectuationRequests();
	const params = [];
	const clauses = ["1=1"];
	if (!canManage) {
		params.push(userId(user));
		clauses.push(`requester_user_id = $${params.length}`);
	}
	if (text(query.status)) {
		params.push(normalize(query.status));
		clauses.push(`status = $${params.length}`);
	}
	const limit = Math.min(Math.max(Number(query.limit || 50), 1), 100);
	params.push(limit);
	const result = await db.query(
		`select id, order_id as "orderId", requester_user_id as "requesterUserId",
		        requester_name as "requesterName", regional, city, status,
		        resolution_note as "resolutionNote", reviewed_by_name as "reviewedByName",
		        reviewed_at as "reviewedAt", source_snapshot as "sourceSnapshot",
		        created_at as "createdAt", updated_at as "updatedAt"
		   from maps_assignment_requests
		  where ${clauses.join(" and ")}
		  order by created_at desc
		  limit $${params.length}`,
		params,
	);
	return { items: result.rows };
}

async function resolveRequest(requestId, payload = {}, user = {}, action) {
	let client = await db.connect();
	let current = null;
	let updated = null;
	const approve = action === "approve";
	try {
		await client.query("begin");
		const currentResult = await client.query(
			`select request.*, order_row.status as order_status, order_row.tecnico,
			        order_row.tipo, order_row.codigo_cliente
			   from maps_assignment_requests request
			   left join ordens_servico order_row on order_row.id = request.order_id
			  where request.id = $1
			  for update of request`,
			[text(requestId)],
		);
		current = currentResult.rows[0];
		if (!current) throw apiError("Solicitacao nao encontrada.", 404);
		if (!current.order_id) {
			throw apiError("A O.S. nao esta mais aberta no Maps.", 409, "ORDER_CHANGED");
		}
		const retrying = current.status === "EFFECTUATION_FAILED";
		if (current.status !== "PENDING" && !(approve && retrying)) {
			throw apiError("Esta solicitacao ja foi analisada.", 409);
		}
		if (approve && (!ALLOWED_ORDER_TYPES.includes(normalize(current.tipo)) || CLOSED_STATUS_PATTERN.test(text(current.order_status)) || !isAvailableTechnician(current.tecnico))) {
			throw apiError("A OS deixou de estar elegivel para atribuicao.", 409, "ORDER_CHANGED");
		}
		const nextStatus = approve ? "APPROVED" : "REJECTED";
		const note = text(payload.note || payload.reason) || (approve
			? "Aprovada. Preparando a transferencia da O.S para o tecnico no HubSoft."
			: "Solicitacao recusada.");
		updated = await client.query(
			`update maps_assignment_requests
			    set status = $2, resolution_note = $3, reviewed_by_id = $4,
			        reviewed_by_name = $5, reviewed_at = now(), updated_at = now()
			  where id = $1
			  returning *`,
			[text(requestId), nextStatus, note, userId(user), userName(user)],
		);
		await client.query("commit");
		client.release();
		client = null;
		if (approve) {
			const requesterProfile = await usersRepository.getUserProfile(current.requester_user_id);
			if (!requesterProfile) {
				throw apiError("O usuario solicitante nao foi encontrado.", 422, "REQUESTER_NOT_FOUND");
			}
			const technicianHubsoftName = userTechnicianName({ profile: requesterProfile });
			if (!technicianHubsoftName) {
				throw apiError(
					"O solicitante nao possui tecnico HubSoft vinculado em Metas.",
					422,
					"TECHNICIAN_NOT_LINKED",
				);
			}
			const effectuation = await serviceOrderRequestsService.createRequest(
				{
					clientCode: text(current.codigo_cliente),
					technicianHubsoftName,
				},
				{
					uid: current.requester_user_id,
					email: current.requester_email,
					nome: current.requester_name,
					role: requesterProfile.role,
					profile: requesterProfile,
				},
			);
			const effectuationId = effectuation?.item?.id;
			const pending = await db.query(
				`update maps_assignment_requests
				    set status = 'PENDING_EFFECTUATION',
				        resolution_note = 'Aprovada. Transferencia em andamento no HubSoft.',
				        source_snapshot = coalesce(source_snapshot, '{}'::jsonb) || $2::jsonb,
				        updated_at = now()
				  where id = $1
				  returning *`,
				[
					current.id,
					JSON.stringify({ effectuationRequestId: effectuationId, technicianHubsoftName }),
				],
			);
			updated = pending;
		}
		const finalStatus = approve ? "PENDING_EFFECTUATION" : "REJECTED";
		const finalNote = approve
			? "Aprovada. Transferencia em andamento no HubSoft."
			: note;
		await notificationsService.createNotification({
			type: "geral",
			title: approve ? "Solicitacao aprovada" : "Solicitacao recusada",
			message: finalNote,
			targetPath: "/maps?panel=requests",
			severity: approve ? "success" : "warning",
			user,
			targets: { users: [current.requester_user_id] },
			meta: { module: "maps_v2", requestId: current.id, status: finalStatus },
		});
		broadcastMapsUpdate(approve ? "REQUEST_APPROVED" : "REQUEST_REJECTED", {
			requestId: current.id,
			orderId: current.order_id,
			requesterUserId: current.requester_user_id,
			status: finalStatus,
		});
		return { item: updated.rows[0], effectedAtSource: false };
	} catch (error) {
		await client?.query("rollback").catch(() => {});
		if (approve && current?.id) {
			const failed = await db.query(
				`update maps_assignment_requests
				    set status = 'EFFECTUATION_FAILED', resolution_note = $2, updated_at = now()
				  where id = $1 and status = 'APPROVED'`,
				[current.id, text(error?.message || error).slice(0, 500)],
			).catch(() => {});
			if (failed?.rowCount) {
				broadcastMapsUpdate("REQUEST_EFFECTUATION_FAILED", {
					requestId: current.id,
					orderId: current.order_id,
					requesterUserId: current.requester_user_id,
					status: "EFFECTUATION_FAILED",
				});
			}
		}
		throw error;
	} finally {
		client?.release();
	}
}

let effectuationReconcilePromise = null;
let effectuationReconcileLastAt = 0;
async function reconcileEffectuationRequests({ force = false } = {}) {
	if (!force && Date.now() - effectuationReconcileLastAt < 3000) return;
	if (effectuationReconcilePromise) return effectuationReconcilePromise;
	effectuationReconcilePromise = (async () => {
		const result = await db.query(
			`select request.id, request.order_id, request.requester_user_id,
			        service.status as service_status, service.result_message,
			        service.error_message, service.technician_hubsoft_name
			   from maps_assignment_requests request
			   join service_order_requests service
			     on service.id::text = request.source_snapshot->>'effectuationRequestId'
			  where request.status = 'PENDING_EFFECTUATION'
			    and service.status in ('COMPLETED', 'FAILED')`,
		);
		for (const item of result.rows) {
			const completed = item.service_status === "COMPLETED";
			const status = completed ? "EFFECTED" : "EFFECTUATION_FAILED";
			const note = completed
				? text(item.result_message) || "O.S transferida para o tecnico no HubSoft."
				: text(item.error_message) || "A transferencia da O.S falhou.";
			const changed = await db.query(
				`update maps_assignment_requests
				    set status = $2, resolution_note = $3, updated_at = now()
				  where id = $1 and status = 'PENDING_EFFECTUATION'
				  returning id`,
				[item.id, status, note],
			);
			if (!changed.rowCount) continue;
			if (completed) {
				await db.query(
					`update ordens_servico
					    set tecnico = $2, updated_at = now()
					  where id = $1`,
					[item.order_id, item.technician_hubsoft_name],
				);
			}
			await notificationsService.createNotification({
				type: "geral",
				title: completed ? "O.S atribuida no Maps" : "Falha ao atribuir O.S",
				message: note,
				targetPath: "/maps?panel=requests",
				severity: completed ? "success" : "error",
				targets: { users: [item.requester_user_id] },
				meta: { module: "maps_v2", requestId: item.id, status },
			}).catch(() => {});
			broadcastMapsUpdate(completed ? "REQUEST_EFFECTED" : "REQUEST_EFFECTUATION_FAILED", {
				requestId: item.id,
				orderId: item.order_id,
				requesterUserId: item.requester_user_id,
				status,
			});
		}
		effectuationReconcileLastAt = Date.now();
	})();
	try {
		return await effectuationReconcilePromise;
	} finally {
		effectuationReconcilePromise = null;
	}
}

async function getRadarSettings(user = {}) {
	const id = userId(user);
	const result = await db.query(
		`insert into maps_radar_settings (user_id) values ($1)
		 on conflict (user_id) do update set user_id = excluded.user_id
		 returning user_id as "userId", enabled, radius_meters as "radiusMeters",
		   alert_assigned as "alertAssigned", alert_opportunities as "alertOpportunities",
		   notifications_enabled as "notificationsEnabled", quiet_until as "quietUntil",
		   schedule_start::text as "scheduleStart", schedule_end::text as "scheduleEnd",
		   last_valid_location_at as "lastValidLocationAt", last_alert_at as "lastAlertAt",
		   updated_at as "updatedAt"`,
		[id],
	);
	return result.rows[0];
}

async function saveRadarSettings(payload = {}, user = {}) {
	const current = await getRadarSettings(user);
	const radius = Number(payload.radiusMeters ?? current.radiusMeters);
	if (!ALLOWED_RADII.has(radius)) throw apiError("Raio de alerta invalido.");
	const schedulePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
	const scheduleStart = text(payload.scheduleStart || current.scheduleStart).slice(0, 5);
	const scheduleEnd = text(payload.scheduleEnd || current.scheduleEnd).slice(0, 5);
	if (!schedulePattern.test(scheduleStart) || !schedulePattern.test(scheduleEnd)) throw apiError("Horario de funcionamento invalido.");
	const result = await db.query(
		`update maps_radar_settings
		    set enabled = $2, radius_meters = $3, alert_assigned = $4,
		        alert_opportunities = $5, notifications_enabled = $6,
		        quiet_until = $7, schedule_start = $8::time, schedule_end = $9::time,
		        updated_at = now()
		  where user_id = $1
		  returning user_id as "userId", enabled, radius_meters as "radiusMeters",
		    alert_assigned as "alertAssigned", alert_opportunities as "alertOpportunities",
		    notifications_enabled as "notificationsEnabled", quiet_until as "quietUntil",
		    schedule_start::text as "scheduleStart", schedule_end::text as "scheduleEnd",
		    last_valid_location_at as "lastValidLocationAt", last_alert_at as "lastAlertAt",
		    updated_at as "updatedAt"`,
		[
			userId(user),
			payload.enabled ?? current.enabled,
			radius,
			payload.alertAssigned ?? current.alertAssigned,
			payload.alertOpportunities ?? current.alertOpportunities,
			payload.notificationsEnabled ?? current.notificationsEnabled,
			payload.quietUntil || current.quietUntil || null,
			scheduleStart,
			scheduleEnd,
		],
	);
	return result.rows[0];
}

function radarWithinSchedule(settings, now = new Date()) {
	if (!settings.enabled) return false;
	if (settings.quietUntil && new Date(settings.quietUntil) > now) return false;
	const formatter = new Intl.DateTimeFormat("en-GB", {
		timeZone: "America/Sao_Paulo",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
	const current = formatter.format(now);
	return current >= text(settings.scheduleStart).slice(0, 5) && current <= text(settings.scheduleEnd).slice(0, 5);
}

async function evaluateRadar(payload = {}, user = {}) {
	const origin = parseCoordinates(payload);
	const accuracy = Math.max(0, Number(payload.accuracy || 0));
	const settings = await getRadarSettings(user);
	if (!radarWithinSchedule(settings)) return { alerts: [], status: settings.enabled ? "paused" : "disabled" };
	if (accuracy > Math.max(Number(settings.radiusMeters), 300)) {
		return { alerts: [], status: "imprecise", accuracy };
	}
	await db.query("update maps_radar_settings set last_valid_location_at = now(), updated_at = now() where user_id = $1", [userId(user)]);
	const nearby = await listPoints({
		latitude: origin.latitude,
		longitude: origin.longitude,
		radiusMeters: Number(settings.radiusMeters) + ALERT_HYSTERESIS_METERS,
		limit: 100,
	}, user);
	const eligible = nearby.items.filter((item) =>
		item.distanceMeters <= Number(settings.radiusMeters) &&
		((item.category === "assigned" && settings.alertAssigned) ||
		(item.category === "opportunity" && settings.alertOpportunities)),
	);
	const recentCount = await db.query(
		"select count(*)::int as total from maps_radar_alerts where user_id = $1 and notified_at >= now() - interval '1 hour'",
		[userId(user)],
	);
	if (Number(recentCount.rows[0]?.total || 0) >= MAX_ALERTS_PER_HOUR) {
		return { alerts: [], status: "rate_limited", nearby: eligible.length };
	}
	const orderIds = eligible.map((item) => item.id);
	let cooldown = new Set();
	if (orderIds.length) {
		const result = await db.query(
			`select order_id from maps_radar_alerts
			  where user_id = $1 and order_id = any($2::text[]) and cooldown_until > now()`,
			[userId(user), orderIds],
		);
		cooldown = new Set(result.rows.map((row) => row.order_id));
	}
	const fresh = eligible.filter((item) => !cooldown.has(item.id));
	if (!fresh.length) return { alerts: [], status: "monitoring", nearby: eligible.length };
	const grouped = fresh.length > 1;
	const category = grouped ? "multiple" : fresh[0].category;
	const result = await db.query(
		`insert into maps_radar_alerts
		 (user_id, order_id, category, distance_meters, grouped_count, cooldown_until, metadata)
		 values ($1, $2, $3, $4, $5, now() + interval '${ALERT_COOLDOWN_MINUTES} minutes', $6::jsonb)
		 returning id, category, distance_meters as "distanceMeters", grouped_count as "groupedCount",
		   notified_at as "notifiedAt", metadata`,
		[
			userId(user),
			grouped ? null : fresh[0].id,
			category,
			grouped ? Math.min(...fresh.map((item) => item.distanceMeters)) : fresh[0].distanceMeters,
			fresh.length,
			JSON.stringify({ orderIds: fresh.map((item) => item.id) }),
		],
	);
	await db.query("update maps_radar_settings set last_alert_at = now(), updated_at = now() where user_id = $1", [userId(user)]);
	return { alerts: result.rows, status: "alert", nearby: eligible.length };
}

async function simulateRadar(payload = {}, user = {}) {
	const origin = parseCoordinates(payload);
	const radiusMeters = ALLOWED_RADII.has(Number(payload.radiusMeters))
		? Number(payload.radiusMeters)
		: 300;
	const nearby = await listPoints({
		latitude: origin.latitude,
		longitude: origin.longitude,
		radiusMeters: radiusMeters + ALERT_HYSTERESIS_METERS,
		limit: 100,
	}, user);
	const items = nearby.items
		.filter((item) => item.distanceMeters <= radiusMeters)
		.map((item) => ({ ...item, simulated: true }));
	return {
		simulated: true,
		origin,
		radiusMeters,
		items,
		alertPreview: items.length > 1
			? { category: "multiple", groupedCount: items.length }
			: items[0]
				? { category: items[0].category, groupedCount: 1, distanceMeters: items[0].distanceMeters }
				: null,
	};
}

async function listRadarAlerts(query = {}, user = {}) {
	const limit = Math.min(Math.max(Number(query.limit || 30), 1), 100);
	const result = await db.query(
		`select id, order_id as "orderId", category, distance_meters as "distanceMeters",
		        grouped_count as "groupedCount", dismissed_at as "dismissedAt",
		        notified_at as "notifiedAt", metadata
		   from maps_radar_alerts
		  where user_id = $1
		  order by notified_at desc limit $2`,
		[userId(user), limit],
	);
	return { items: result.rows };
}

async function dismissAlert(alertId, user = {}) {
	const result = await db.query(
		`update maps_radar_alerts set dismissed_at = now(), state = 'DISMISSED'
		  where id = $1 and user_id = $2 returning id`,
		[text(alertId), userId(user)],
	);
	if (!result.rows[0]) throw apiError("Alerta nao encontrado.", 404);
	return { ok: true };
}

async function listRoutes(query = {}, user = {}) {
	const params = [userId(user)];
	let dateClause = "";
	if (text(query.date)) {
		params.push(text(query.date));
		dateClause = `and route_date = $${params.length}::date`;
	}
	const result = await db.query(
		`select route.id, route.name, route.route_date as "routeDate", route.status,
		        route.optimized_at as "optimizedAt", route.updated_at as "updatedAt",
		        coalesce(jsonb_agg(jsonb_build_object(
		          'orderId', item.order_id, 'sequence', item.sequence_number,
		          'distanceMeters', item.distance_from_previous_meters,
		          'estimatedMinutes', item.estimated_travel_minutes,
		          'orderNumber', order_row.num_os, 'city', order_row.cidade,
		          'neighborhood', order_row.bairro, 'address', order_row.endereco_resumo,
		          'clientName', order_row.nome_cliente,
		          'latitude', location.latitude, 'longitude', location.longitude
		        ) order by item.sequence_number) filter (where item.order_id is not null), '[]'::jsonb) as items
		   from maps_routes route
		   left join maps_route_items item on item.route_id = route.id
		   left join ordens_servico order_row on order_row.id = item.order_id
		   left join maps_order_locations location on location.order_id = item.order_id
		  where route.user_id = $1 ${dateClause}
		  group by route.id order by route.route_date desc, route.updated_at desc`,
		params,
	);
	return { items: result.rows };
}

async function assertAssignedOrders(orderIds, user) {
	const unique = [...new Set(orderIds.map(text).filter(Boolean))];
	if (!unique.length) throw apiError("Adicione ao menos uma retirada ao roteiro.");
	const result = await db.query(
		`select o.id, o.tecnico, l.latitude, l.longitude
		   from ordens_servico o join maps_order_locations l on l.order_id = o.id
		  where o.id = any($1::text[])`,
		[unique],
	);
	const ownNames = userTechnicianNames(user);
	const allowed = result.rows.filter((row) => ownNames.includes(normalize(row.tecnico)));
	if (allowed.length !== unique.length) throw apiError("O roteiro aceita apenas retiradas atribuidas a voce.", 403);
	return allowed;
}

async function createRoute(payload = {}, user = {}) {
	const orderIds = Array.isArray(payload.orderIds) ? payload.orderIds : [];
	await assertAssignedOrders(orderIds, user);
	const client = await db.connect();
	try {
		await client.query("begin");
		const route = await client.query(
			`insert into maps_routes (user_id, name, route_date)
			 values ($1, $2, coalesce($3::date, current_date)) returning *`,
			[userId(user), text(payload.name) || "Roteiro do dia", payload.routeDate || null],
		);
		for (const [index, orderId] of orderIds.entries()) {
			await client.query(
				"insert into maps_route_items (route_id, order_id, sequence_number) values ($1, $2, $3)",
				[route.rows[0].id, text(orderId), index + 1],
			);
		}
		await client.query("commit");
		broadcastMapsUpdate("ROUTE_CREATED", {
			routeId: route.rows[0].id,
			userId: userId(user),
		});
		return { item: route.rows[0] };
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function updateRoute(routeId, payload = {}, user = {}) {
	const current = await db.query("select id from maps_routes where id = $1 and user_id = $2", [text(routeId), userId(user)]);
	if (!current.rows[0]) throw apiError("Roteiro nao encontrado.", 404);
	const orderIds = Array.isArray(payload.orderIds) ? payload.orderIds : [];
	await assertAssignedOrders(orderIds, user);
	const client = await db.connect();
	try {
		await client.query("begin");
		await client.query("delete from maps_route_items where route_id = $1", [text(routeId)]);
		for (const [index, orderId] of orderIds.entries()) {
			await client.query(
				"insert into maps_route_items (route_id, order_id, sequence_number) values ($1, $2, $3)",
				[text(routeId), text(orderId), index + 1],
			);
		}
		await client.query(
			"update maps_routes set name = coalesce(nullif($3, ''), name), updated_at = now() where id = $1 and user_id = $2",
			[text(routeId), userId(user), text(payload.name)],
		);
		await client.query("commit");
		broadcastMapsUpdate("ROUTE_UPDATED", {
			routeId: text(routeId),
			userId: userId(user),
		});
		return { ok: true };
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

function optimizeNearestNeighbor(rows, origin) {
	const remaining = rows.map((row) => ({
		...row,
		latitude: Number(row.latitude),
		longitude: Number(row.longitude),
	}));
	const optimized = [];
	let cursor = origin || remaining[0];
	while (remaining.length) {
		let bestIndex = 0;
		let bestDistance = Infinity;
		for (const [index, row] of remaining.entries()) {
			const distance = haversineMeters(cursor, row);
			if (distance < bestDistance) {
				bestDistance = distance;
				bestIndex = index;
			}
		}
		const [next] = remaining.splice(bestIndex, 1);
		optimized.push({ ...next, distanceMeters: bestDistance });
		cursor = next;
	}
	return optimized;
}

function normalizeRouteRows(rows = []) {
	return rows
		.filter((row) => usableOrderCoordinates(row?.latitude, row?.longitude))
		.map((row) => ({
			...row,
			latitude: Number(row.latitude),
			longitude: Number(row.longitude),
		}));
}

function routeTravelMetrics(distanceMeters) {
	const distance = Math.max(0, Math.round(Number(distanceMeters) || 0));
	return {
		distanceMeters: distance,
		estimatedTravelMinutes: Math.max(1, Math.round(distance / 400)),
	};
}

async function optimizeRoute(routeId, payload = {}, user = {}) {
	const route = await db.query("select id from maps_routes where id = $1 and user_id = $2", [text(routeId), userId(user)]);
	if (!route.rows[0]) throw apiError("Roteiro nao encontrado.", 404);
	const items = await db.query(
		`select item.order_id, item.sequence_number, location.latitude, location.longitude
		   from maps_route_items item
		   left join maps_order_locations location on location.order_id = item.order_id
		  where item.route_id = $1
		  order by item.sequence_number`,
		[text(routeId)],
	);
	if (!items.rows.length) throw apiError("O roteiro esta vazio.");
	const routeRows = normalizeRouteRows(items.rows);
	if (routeRows.length !== items.rows.length) {
		throw apiError("Uma ou mais paradas estao sem localizacao valida. Atualize o mapa antes de otimizar.", 422);
	}
	const origin = payload.latitude !== undefined ? parseCoordinates(payload) : null;
	const optimized = optimizeNearestNeighbor(routeRows, origin);
	const client = await db.connect();
	try {
		await client.query("begin");
		// Recriar os itens dentro da mesma transacao evita qualquer colisao da
		// restricao unica (route_id, sequence_number), inclusive em rotas grandes.
		await client.query("delete from maps_route_items where route_id = $1", [text(routeId)]);
		for (const [index, item] of optimized.entries()) {
			const travel = routeTravelMetrics(item.distanceMeters);
			await client.query(
				`insert into maps_route_items
				    (route_id, order_id, sequence_number, distance_from_previous_meters, estimated_travel_minutes)
				 values ($1, $2, $3, $4, $5)`,
				[text(routeId), item.order_id, index + 1, travel.distanceMeters, travel.estimatedTravelMinutes],
			);
		}
		await client.query("update maps_routes set optimized_at = now(), updated_at = now() where id = $1", [text(routeId)]);
		await client.query("commit");
		broadcastMapsUpdate("ROUTE_OPTIMIZED", {
			routeId: text(routeId),
			userId: userId(user),
		});
		return { items: optimized.map((item, index) => ({ orderId: item.order_id, sequence: index + 1, distanceMeters: item.distanceMeters })) };
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

function sourcePayload(row = {}) {
	if (row.source_payload && typeof row.source_payload === "object") return row.source_payload;
	try {
		return JSON.parse(text(row.source_payload)) || {};
	} catch {
		return {};
	}
}

function nestedValue(input = {}, paths = []) {
	for (const path of paths) {
		const value = path.split(".").reduce((current, key) => current?.[key], input);
		if (text(value)) return text(value);
	}
	return "";
}

function uniqueAddressParts(parts = []) {
	const result = [];
	for (const rawPart of parts) {
		const part = text(rawPart).replace(/\s+/g, " ");
		if (!part) continue;
		const normalizedPart = normalize(part);
		const current = normalize(result.join(", "));
		if (current && (current.includes(normalizedPart) || normalizedPart.includes(current))) continue;
		result.push(part);
	}
	return result.join(", ");
}

function addressSearchVariants(row = {}) {
	const source = sourcePayload(row);
	const city = text(row.cidade) || nestedValue(source, ["cidade", "endereco.cidade", "cliente.endereco.cidade"]);
	const neighborhood = text(row.bairro) || nestedValue(source, ["bairro", "endereco.bairro", "cliente.endereco.bairro"]);
	const number = text(row.numero) || nestedValue(source, ["numero", "endereco.numero", "cliente.endereco.numero"]);
	const postalCode = nestedValue(source, ["cep", "endereco.cep", "cliente.endereco.cep"]);
	const streets = [
		row.endereco,
		row.endereco_resumo,
		nestedValue(source, [
			"logradouro",
			"endereco.logradouro",
			"endereco.endereco",
			"endereco.rua",
			"cliente.endereco.logradouro",
			"endereco_instalacao",
		]),
	].map(text).filter(Boolean);
	const variants = [];
	const seen = new Set();
	const add = (parts, accuracyLevel) => {
		const query = uniqueAddressParts([...parts, "Minas Gerais", "Brasil"]);
		const key = normalize(query);
		if (!city || !key || seen.has(key)) return;
		seen.add(key);
		variants.push({ query, accuracyLevel });
	};

	for (const street of streets) {
		add([street, number, neighborhood, postalCode, city], "ADDRESS");
		add([street, number, city], "ADDRESS");
		add([street, neighborhood, city], "STREET");
		add([street, city], "STREET");
	}
	if (neighborhood) add([neighborhood, city], "NEIGHBORHOOD");
	return variants;
}

function addressHash(address) {
	return crypto.createHash("sha256").update(normalize(address)).digest("hex");
}

async function queueMissingGeocodes(limit = GEOCODE_QUEUE_BATCH_LIMIT) {
	const result = await db.query(
		`select o.id, o.endereco, o.endereco_resumo, o.numero, o.bairro, o.cidade,
		        o.source_payload, o.updated_at
		   from ordens_servico o
		   left join maps_order_locations location on location.order_id = o.id
		   left join maps_geocode_jobs job on job.order_id = o.id
		  where o.source_collection in ('ordens_abertas', 'mapa_os_abertas', 'match_os_abertas')
		    and upper(coalesce(o.tipo, '')) = any($2::text[])
		    and upper(coalesce(o.status, '')) !~ '(CONCLUID|FINALIZ|FECHAD|CANCELAD|REALIZAD)'
		    and (
		      location.order_id is null
		      or location.latitude not between -34 and 6
		      or location.longitude not between -74 and -33
		    )
		    and (
		      job.order_id is null
		      or job.status = 'REFRESH'
		      or o.updated_at > job.updated_at
		    )
		    and coalesce(nullif(trim(o.endereco), ''), nullif(trim(o.endereco_resumo), ''),
		                 nullif(trim(o.source_payload#>>'{endereco,logradouro}'), ''),
		                 nullif(trim(o.source_payload->>'logradouro'), ''),
		                 nullif(trim(o.bairro), '')) is not null
		    and coalesce(nullif(trim(o.cidade), ''),
		                 nullif(trim(o.source_payload->>'cidade'), ''),
		                 nullif(trim(o.source_payload#>>'{endereco,cidade}'), '')) is not null
		  order by o.data_abertura desc nulls last
		  limit $1`,
		[
			Math.min(Math.max(Number(limit || GEOCODE_QUEUE_BATCH_LIMIT), 1), GEOCODE_QUEUE_BATCH_LIMIT),
			ALLOWED_ORDER_TYPES,
		],
	);
	if (result.rows.length > 0) {
		const entries = result.rows.map((row) => {
			const searchVariants = addressSearchVariants(row);
			const address = searchVariants[0]?.query || "";
			return { orderId: row.id, address, searchVariants, hash: address ? addressHash(address) : "" };
		}).filter((entry) => entry.address);
		const hashes = entries.map((entry) => entry.hash);
		const addresses = entries.map((entry) => entry.address);
		const variants = entries.map((entry) => JSON.stringify(entry.searchVariants));
		const orderIds = entries.map((entry) => entry.orderId);

		if (entries.length > 0) await db.query(
			`insert into maps_geocode_cache (address_hash, normalized_address, search_variants)
			 select distinct on (payload.address_hash)
			        payload.address_hash, payload.normalized_address, payload.search_variants::jsonb
			   from unnest($1::text[], $2::text[], $3::text[])
			        as payload(address_hash, normalized_address, search_variants)
			  order by payload.address_hash
			 on conflict (address_hash) do update set
			   normalized_address = excluded.normalized_address,
			   search_variants = excluded.search_variants,
			   variant_index = case when maps_geocode_cache.status = 'RESOLVED'
			                        then maps_geocode_cache.variant_index else 0 end,
			   status = case when maps_geocode_cache.status = 'RESOLVED'
			                 then 'RESOLVED' else 'PENDING' end,
			   next_attempt_at = case when maps_geocode_cache.status = 'RESOLVED'
			                          then maps_geocode_cache.next_attempt_at else null end,
			   updated_at = now()`,
			[hashes, addresses, variants],
		);
		if (entries.length > 0) await db.query(
			`insert into maps_geocode_jobs (order_id, address_hash)
			 select payload.order_id, payload.address_hash
			   from unnest($1::text[], $2::text[]) as payload(order_id, address_hash)
			 on conflict (order_id) do update set
			   address_hash = excluded.address_hash,
			   status = case
			     when maps_geocode_jobs.address_hash <> excluded.address_hash
			       or maps_geocode_jobs.status = 'REFRESH' then 'PENDING'
			     else maps_geocode_jobs.status
			   end,
			   updated_at = now()`,
			[orderIds, hashes],
		);
	}
	await db.query(
		`insert into maps_order_locations
		 (order_id, latitude, longitude, coordinate_source, accuracy_level, address_hash, validated_at)
		 select job.order_id, cache.latitude, cache.longitude, 'GEOCODER', cache.accuracy_level,
		        cache.address_hash, now()
		   from maps_geocode_jobs job
		   join maps_geocode_cache cache on cache.address_hash = job.address_hash
		  where job.status = 'PENDING' and cache.status = 'RESOLVED'
		 on conflict (order_id) do update set latitude = excluded.latitude,
		   longitude = excluded.longitude, coordinate_source = excluded.coordinate_source,
		   accuracy_level = excluded.accuracy_level, address_hash = excluded.address_hash,
		   validated_at = excluded.validated_at, last_seen_at = now(), updated_at = now()`,
	);
	await db.query(
		`update maps_geocode_jobs job
		    set status = 'RESOLVED', updated_at = now()
		   from maps_geocode_cache cache
		  where cache.address_hash = job.address_hash
		    and cache.status = 'RESOLVED' and job.status = 'PENDING'`,
	);
	const queue = await db.query(
		`select
		   count(*) filter (where job.status = 'PENDING')::int as pending_orders,
		   count(distinct job.address_hash) filter (where job.status = 'PENDING')::int as pending_addresses,
		   count(*) filter (where job.status = 'RESOLVED')::int as resolved_orders
		 from maps_geocode_jobs job`,
	);
	return { queued: result.rows.length, ...queue.rows[0] };
}

function storedSearchVariants(value, fallbackAddress) {
	const parsed = Array.isArray(value) ? value : [];
	const variants = parsed.map((item) => ({
		query: text(typeof item === "string" ? item : item?.query),
		accuracyLevel: text(item?.accuracyLevel) || "GEOCODED",
	})).filter((item) => item.query);
	if (variants.length) return variants;
	return fallbackAddress ? [{ query: fallbackAddress, accuracyLevel: "GEOCODED" }] : [];
}

function geocodeAccuracy(match = {}, fallback = "GEOCODED") {
	const kind = normalize(match.addresstype || match.type || match.class);
	if (/(HOUSE|BUILDING|RESIDENTIAL|PREMISE)/.test(kind)) return "ADDRESS";
	if (/(ROAD|STREET|HIGHWAY|PEDESTRIAN)/.test(kind)) return "STREET";
	if (/(NEIGHBOUR|NEIGHBOR|SUBURB|QUARTER)/.test(kind)) return "NEIGHBORHOOD";
	return fallback;
}

async function processNextGeocode() {
	const providerUrl = geocoderUrl();
	const result = await db.query(
		`select cache.address_hash, cache.normalized_address, cache.search_variants,
		        cache.variant_index
		   from maps_geocode_cache cache
		  where cache.status in ('PENDING', 'RETRY')
		    and (cache.next_attempt_at is null or cache.next_attempt_at <= now())
		  order by cache.created_at asc limit 1`,
	);
	const item = result.rows[0];
	if (!item) return { processed: false, reason: "queue_empty" };
	try {
		const variants = storedSearchVariants(item.search_variants, item.normalized_address);
		const variantIndex = Math.min(Math.max(Number(item.variant_index || 0), 0), Math.max(variants.length - 1, 0));
		const variant = variants[variantIndex];
		if (!variant) {
			await db.query("update maps_geocode_cache set status = 'NOT_FOUND', updated_at = now() where address_hash = $1", [item.address_hash]);
			await db.query("update maps_geocode_jobs set status = 'NOT_FOUND', updated_at = now() where address_hash = $1", [item.address_hash]);
			return { processed: true, found: false, reason: "address_empty" };
		}
		const url = new URL(providerUrl);
		url.searchParams.set("q", variant.query);
		url.searchParams.set("format", "jsonv2");
		url.searchParams.set("limit", "1");
		url.searchParams.set("countrycodes", "br");
		url.searchParams.set("addressdetails", "1");
		const response = await fetch(url, {
			headers: { "User-Agent": process.env.MAPS_GEOCODER_USER_AGENT || "RetiradasMaps/2.0" },
			signal: AbortSignal.timeout(Number(process.env.MAPS_GEOCODER_TIMEOUT_MS || 8000)),
		});
		if (!response.ok) throw new Error(`Geocoder HTTP ${response.status}`);
		const data = await response.json();
		const match = Array.isArray(data) ? data[0] : data?.items?.[0];
		const latitude = numberInRange(match?.lat ?? match?.latitude, -90, 90);
		const longitude = numberInRange(match?.lon ?? match?.longitude, -180, 180);
		if (latitude === null || longitude === null || !usableOrderCoordinates(latitude, longitude)) {
			if (variantIndex + 1 < variants.length) {
				await db.query(
					`update maps_geocode_cache
					    set status = 'RETRY', variant_index = $2, attempt_count = attempt_count + 1,
					        next_attempt_at = now() + interval '1 second',
					        last_error = 'Endereco nao encontrado; tentando uma variacao menos especifica.',
					        updated_at = now()
					  where address_hash = $1`,
					[item.address_hash, variantIndex + 1],
				);
				return { processed: true, found: false, retrying: true };
			}
			await db.query(
				`update maps_geocode_cache set status = 'NOT_FOUND', attempt_count = attempt_count + 1,
				 updated_at = now(), resolved_at = now() where address_hash = $1`,
				[item.address_hash],
			);
			await db.query("update maps_geocode_jobs set status = 'NOT_FOUND', updated_at = now() where address_hash = $1", [item.address_hash]);
			return { processed: true, found: false };
		}
		const accuracyLevel = geocodeAccuracy(match, variant.accuracyLevel);
		await db.query(
			`update maps_geocode_cache
			    set latitude = $2, longitude = $3, provider = $4, provider_reference = $5,
			        accuracy_level = $6, status = 'RESOLVED', attempt_count = attempt_count + 1,
			        resolved_at = now(), updated_at = now()
			  where address_hash = $1`,
			[item.address_hash, latitude, longitude, new URL(providerUrl).hostname, text(match.place_id || match.id), accuracyLevel],
		);
		await db.query(
			`insert into maps_order_locations
			 (order_id, latitude, longitude, coordinate_source, accuracy_level, address_hash, validated_at)
			 select order_id, $2, $3, 'GEOCODER', $4, $1, now()
			   from maps_geocode_jobs where address_hash = $1
			 on conflict (order_id) do update set latitude = excluded.latitude,
			   longitude = excluded.longitude, coordinate_source = excluded.coordinate_source,
			   accuracy_level = excluded.accuracy_level, address_hash = excluded.address_hash,
			   validated_at = excluded.validated_at, last_seen_at = now(), updated_at = now()`,
			[item.address_hash, latitude, longitude, accuracyLevel],
		);
		await db.query("update maps_geocode_jobs set status = 'RESOLVED', updated_at = now() where address_hash = $1", [item.address_hash]);
		return { processed: true, found: true };
	} catch (error) {
		await db.query(
			`update maps_geocode_cache
			    set status = 'RETRY', attempt_count = attempt_count + 1, last_error = $2,
			        next_attempt_at = now() + interval '15 minutes', updated_at = now()
			  where address_hash = $1`,
			[item.address_hash, text(error.message).slice(0, 500)],
		);
		throw error;
	}
}

async function saveTechnicianPresence(payload = {}, user = {}) {
	if (!isTechnicianUser(user)) {
		throw apiError("A localizacao operacional e exclusiva para tecnicos.", 403, "TECHNICIAN_REQUIRED");
	}
	const coordinates = parseCoordinates(payload);
	const accuracy = optionalNumberInRange(payload.accuracy, 0, 10_000);
	const heading = optionalNumberInRange(payload.heading, 0, 360);
	const speed = optionalNumberInRange(payload.speed, 0, 150);
	const technicianName = userTechnicianName(user) || userName(user);
	const result = await db.query(
		`insert into maps_technician_presence
		 (user_id, latitude, longitude, accuracy_meters, heading_degrees, speed_mps,
		  technician_name, display_name, consent_source, last_seen_at)
		 values ($1, $2, $3, $4, $5, $6, $7, $8, 'BROWSER_GEOLOCATION', now())
		 on conflict (user_id) do update set
		   latitude = excluded.latitude,
		   longitude = excluded.longitude,
		   accuracy_meters = excluded.accuracy_meters,
		   heading_degrees = excluded.heading_degrees,
		   speed_mps = excluded.speed_mps,
		   technician_name = excluded.technician_name,
		   display_name = excluded.display_name,
		   consent_source = excluded.consent_source,
		   last_seen_at = now(),
		   updated_at = now()
		 returning last_seen_at as "lastSeenAt"`,
		[
			userId(user),
			coordinates.latitude,
			coordinates.longitude,
			accuracy,
			heading,
			speed,
			technicianName,
			userName(user),
		],
	);
	broadcastMapsAdminUpdate("TECHNICIAN_PRESENCE_UPDATED", {
		userId: userId(user),
	});
	return { ok: true, lastSeenAt: result.rows[0]?.lastSeenAt || null };
}

async function listTechnicianPresence() {
	const result = await db.query(
		`with presence as (
		  select location.*,
		         app.display_name as account_display_name,
		         app.email,
		         app.regional,
		         app.imported_profile,
		         coalesce(
		           nullif(location.technician_name, ''),
		           nullif(app.imported_profile->>'metasTecnicoNome', ''),
		           nullif(app.imported_profile->>'metas_tecnico_nome', ''),
		           app.display_name,
		           app.email
		         ) as resolved_technician_name
		    from maps_technician_presence location
		    join app_users app on app.uid = location.user_id
		   where app.disabled = false
		     and lower(coalesce(app.role, '')) = 'tecnico'
		), production as (
		  select lower(trim(raw_excerpt #>> '{tecnicos,0,name}')) as technician_key,
		         count(distinct hubsoft_id)::int as completed_today,
		         max(source_date) as last_completion_at
		    from hubsoft_sync_records
		   where profile in ('META_D0', 'META_D_MINUS_ONE', 'META_AUDIT_DAILY')
		     and active = true
		     and production_channel = 'RETIRADA'
		     and (source_date at time zone 'America/Sao_Paulo')::date =
		         (now() at time zone 'America/Sao_Paulo')::date
		     and jsonb_typeof(raw_excerpt->'tecnicos') = 'array'
		     and jsonb_array_length(raw_excerpt->'tecnicos') = 1
		   group by lower(trim(raw_excerpt #>> '{tecnicos,0,name}'))
		), open_orders as (
		  select lower(trim(tecnico)) as technician_key,
		         count(distinct num_os)::int as open_orders
		    from ordens_servico
		   where source_collection in ('ordens_abertas', 'mapa_os_abertas', 'match_os_abertas')
		     and upper(coalesce(tipo, '')) = any($1::text[])
		     and upper(coalesce(status, '')) !~ '(CONCLUID|FINALIZ|FECHAD|CANCELAD|REALIZAD)'
		     and nullif(trim(tecnico), '') is not null
		   group by lower(trim(tecnico))
		), route_stops as (
		  select route.user_id, count(item.order_id)::int as route_stops
		    from maps_routes route
		    left join maps_route_items item on item.route_id = route.id
		   where route.route_date = (now() at time zone 'America/Sao_Paulo')::date
		     and route.status in ('DRAFT', 'ACTIVE')
		   group by route.user_id
		)
		select presence.user_id as "userId",
		       coalesce(nullif(presence.display_name, ''), presence.account_display_name,
		                presence.resolved_technician_name) as "displayName",
		       presence.resolved_technician_name as "technicianName",
		       presence.regional,
		       presence.latitude,
		       presence.longitude,
		       presence.accuracy_meters as "accuracyMeters",
		       presence.heading_degrees as "headingDegrees",
		       presence.speed_mps as "speedMps",
		       presence.last_seen_at as "lastSeenAt",
		       coalesce(production.completed_today, 0)::int as "completedToday",
		       production.last_completion_at as "lastCompletionAt",
		       coalesce(open_orders.open_orders, 0)::int as "openOrders",
		       coalesce(route_stops.route_stops, 0)::int as "routeStops"
		  from presence
		  left join production
		    on production.technician_key = lower(trim(presence.resolved_technician_name))
		  left join open_orders
		    on open_orders.technician_key = lower(trim(presence.resolved_technician_name))
		  left join route_stops on route_stops.user_id = presence.user_id
		 order by presence.last_seen_at desc`,
		[ALLOWED_ORDER_TYPES],
	);
	const now = Date.now();
	const items = result.rows.map((row) => ({
		...row,
		latitude: Number(row.latitude),
		longitude: Number(row.longitude),
		accuracyMeters: row.accuracyMeters === null ? null : Number(row.accuracyMeters),
		headingDegrees: row.headingDegrees === null ? null : Number(row.headingDegrees),
		speedMps: row.speedMps === null ? null : Number(row.speedMps),
		status: technicianPresenceStatus(row.lastSeenAt, now),
	}));
	return {
		items,
		summary: {
			total: items.length,
			active: items.filter((item) => item.status === "active").length,
			recent: items.filter((item) => item.status === "recent").length,
			stale: items.filter((item) => item.status === "stale").length,
			completedToday: items.reduce((total, item) => total + Number(item.completedToday || 0), 0),
			openOrders: items.reduce((total, item) => total + Number(item.openOrders || 0), 0),
		},
		generatedAt: new Date(now).toISOString(),
	};
}

let workerTimer = null;
let geocodeQueueLastRefreshAt = 0;
let geocoderCycleRunning = false;
async function runGeocoderCycle() {
	if (geocoderCycleRunning) return;
	geocoderCycleRunning = true;
	try {
		if (Date.now() - geocodeQueueLastRefreshAt >= GEOCODE_QUEUE_REFRESH_INTERVAL_MS) {
			await queueMissingGeocodes(GEOCODE_QUEUE_BATCH_LIMIT);
			geocodeQueueLastRefreshAt = Date.now();
		}
		await processNextGeocode();
	} catch (error) {
		if (error?.code !== "42P01" && error?.code !== "42703") {
			console.warn("[mapsV2] Falha no geocoder:", error?.message || error);
		}
	} finally {
		geocoderCycleRunning = false;
	}
}

function initializeGeocoderWorker() {
	if (workerTimer || !featureEnabled()) return;
	const intervalMs = Math.max(Number(process.env.MAPS_GEOCODER_INTERVAL_MS || 1500), 1100);
	void runGeocoderCycle();
	workerTimer = setInterval(runGeocoderCycle, intervalMs);
	workerTimer.unref?.();
}

async function getHealth() {
	const tables = await db.query(
		`select
		  (select count(*)::int from maps_order_locations) as geocoded,
		  (select count(*)::int from maps_geocode_jobs where status = 'PENDING') as geocode_pending,
		  (select count(*)::int from maps_assignment_requests where status = 'PENDING') as requests_pending,
		  (select max(updated_at) from ordens_servico where source_collection in ('ordens_abertas', 'mapa_os_abertas', 'match_os_abertas')) as last_order_sync`,
	);
	return {
		ok: true,
		enabled: featureEnabled(),
		geocoderConfigured: Boolean(geocoderUrl()),
		mapStyleConfigured: Boolean(text(process.env.MAPS_STYLE_URL)),
		...tables.rows[0],
	};
}

module.exports = {
	ALERT_COOLDOWN_MINUTES,
	ALERT_HYSTERESIS_METERS,
	ALLOWED_ORDER_TYPES,
	MAPS_PERMISSIONS,
	createRequest,
	createRoute,
	dismissAlert,
	evaluateRadar,
	featureEnabled,
	getHealth,
	getOrder,
	getRadarSettings,
	getSummary,
	hasPermission,
	initializeGeocoderWorker,
	listPoints,
	listRadarAlerts,
	listRequests,
	listRoutes,
	listTechnicianPresence,
	optimizeRoute,
	queueMissingGeocodes,
	resolveRequest,
	saveRadarSettings,
	saveTechnicianPresence,
	simulateRadar,
	syncNativeCoordinates,
	updateRoute,
	__testables: {
		addressSearchVariants,
		boundingBox,
		categoryForOrder,
		deterministicApproximation,
		firstAndLastName,
		haversineMeters,
		isAvailableTechnician,
		mapPoint,
		normalize,
		normalizeRouteRows,
		optimizeNearestNeighbor,
		parseCoordinates,
		radarWithinSchedule,
		routeTravelMetrics,
		sourceFilters,
		technicianPresenceStatus,
		validateOrderRow,
	},
};
