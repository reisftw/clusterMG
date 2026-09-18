const crypto = require("node:crypto");
const db = require("./db");
const auditLog = require("./auditLog");
const emailService = require("./emailService");

const KEY_STATUS = Object.freeze({
	AVAILABLE: "DISPONIVEL",
	IN_USE: "EM_POSSE",
	OVERDUE: "ATRASADA",
	LOST: "PERDIDA",
	BLOCKED: "BLOQUEADA",
	INACTIVE: "INATIVA",
});

const STATUS_LABELS = Object.freeze({
	[KEY_STATUS.AVAILABLE]: "Disponível",
	[KEY_STATUS.IN_USE]: "Em posse",
	[KEY_STATUS.OVERDUE]: "Atrasada",
	[KEY_STATUS.LOST]: "Perdida",
	[KEY_STATUS.BLOCKED]: "Bloqueada",
	[KEY_STATUS.INACTIVE]: "Inativa",
});

const KEY_TYPES = Object.freeze([
	"Chave física",
	"Controle remoto",
	"Tag",
	"Cartão",
	"Credencial",
	"Outro",
]);

function normalizeText(value) {
	return String(value || "").trim();
}

function normalizeDate(value) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString();
}

function toInt(value, fallback, min, max) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(min, Math.min(max, parsed));
}

function escapeLike(value) {
	return String(value || "").replace(/[\\%_]/g, "\\$&");
}

function currentUserId(user = {}) {
	return normalizeText(user.uid || user.id || user.email);
}

function currentUserName(user = {}) {
	return normalizeText(user.nome || user.name || user.displayName || user.email);
}

function randomId(prefix) {
	return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

function qrToken() {
	return crypto.randomBytes(24).toString("base64url");
}

function mapKey(row = {}) {
	return {
		id: row.id,
		code: row.code,
		codigo: row.code,
		description: row.description,
		name: row.description,
		type: row.type,
		companyId: row.company_id,
		regionalId: row.regional_id,
		propertyId: row.property_id,
		environmentId: row.environment_id,
		locationDescription: row.location_description,
		address: row.location_description,
		status: row.status,
		statusLabel: STATUS_LABELS[row.status] || row.status,
		currentHolderUserId: row.current_holder_user_id,
		currentUserId: row.current_holder_user_id,
		currentHolderName: row.current_holder_name,
		currentUser: row.current_holder_name,
		checkedOutAt: row.checked_out_at,
		expectedReturnAt: row.expected_return_at,
		returnedAt: row.returned_at,
		qrToken: row.qr_token,
		qrVersion: row.qr_version,
		notes: row.notes,
		legacySource: row.legacy_source,
		legacyId: row.legacy_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		active: row.active,
		source: "facilities_keys",
	};
}

function mapEvent(row = {}) {
	return {
		id: row.id,
		keyId: row.key_id,
		action: row.event_type,
		eventType: row.event_type,
		userId: row.actor_user_id,
		holderUserId: row.holder_user_id,
		userName: row.actor_name,
		holderName: row.holder_name,
		occurredAt: row.occurred_at,
		createdAt: row.created_at,
		expectedReturnAt: row.expected_return_at,
		notes: row.notes,
		metadata: row.metadata || {},
	};
}

async function nextKeyCode(client) {
	const { rows } = await client.query(
		"select code from facilities_keys where code ~ '^CHV-[0-9]+$' order by code desc limit 1",
	);
	const last = Number(String(rows[0]?.code || "").replace(/\D/g, ""));
	return `CHV-${String(Number.isFinite(last) ? last + 1 : 1).padStart(6, "0")}`;
}

async function insertEvent(client, keyId, eventType, user, payload = {}) {
	const id = randomId("fkevt");
	await client.query(
		`insert into facilities_key_events (
       id, key_id, event_type, actor_user_id, holder_user_id,
       occurred_at, expected_return_at, notes, metadata
     ) values ($1, $2, $3, $4, $5, now(), $6, $7, $8::jsonb)`,
		[
			id,
			keyId,
			eventType,
			currentUserId(user),
			normalizeText(payload.holderUserId),
			normalizeDate(payload.expectedReturnAt),
			normalizeText(payload.notes),
			JSON.stringify(payload.metadata || {}),
		],
	);
	return id;
}

async function markOverdueKeys() {
	await db.query(
		`update facilities_keys
		    set status = $1
		  where status = $2
		    and expected_return_at is not null
		    and expected_return_at < now()
		    and active = true`,
		[KEY_STATUS.OVERDUE, KEY_STATUS.IN_USE],
	);
}

function appendKeyFilters({ query = {}, values = [], where = ["active = true"] } = {}) {
	const search = normalizeText(query.search || query.q);
	if (search) {
		values.push(`%${escapeLike(search)}%`);
		const idx = values.length;
		where.push(`(
			code ilike $${idx} escape '\\'
			or description ilike $${idx} escape '\\'
			or coalesce(location_description, '') ilike $${idx} escape '\\'
			or coalesce(current_holder_name, '') ilike $${idx} escape '\\'
			or coalesce(type, '') ilike $${idx} escape '\\'
		)`);
	}
	const status = normalizeText(query.status);
	if (status) {
		values.push(status);
		where.push(`status = $${values.length}`);
	}
	const type = normalizeText(query.type);
	if (type) {
		values.push(type);
		where.push(`type = $${values.length}`);
	}
	const propertyId = normalizeText(query.propertyId || query.imovelId);
	if (propertyId) {
		values.push(propertyId);
		where.push(`property_id = $${values.length}`);
	}
	const environmentId = normalizeText(query.environmentId || query.ambienteId);
	if (environmentId) {
		values.push(environmentId);
		where.push(`environment_id = $${values.length}`);
	}
	const holder = normalizeText(query.holder || query.portador);
	if (holder) {
		values.push(`%${escapeLike(holder)}%`);
		where.push(`coalesce(current_holder_name, '') ilike $${values.length} escape '\\'`);
	}
	if (String(query.withoutQr || "") === "true") {
		where.push("(qr_token is null or qr_token = '')");
	}
	return { values, where };
}

function orderClause(sort = "") {
	switch (sort) {
		case "recentes":
			return "created_at desc, code asc";
		case "retiradas":
			return "checked_out_at desc nulls last, code asc";
		case "atrasadas":
			return "expected_return_at asc nulls last, code asc";
		case "imovel":
			return "location_description asc nulls last, code asc";
		case "codigo":
		default:
			return "code asc";
	}
}

async function listKeys(query = {}) {
	await markOverdueKeys();
	const page = toInt(query.page, 1, 1, 100000);
	const pageSize = toInt(query.pageSize || query.limit, 25, 1, 100);
	const values = [];
	const { where } = appendKeyFilters({ query, values });
	const whereSql = where.length ? `where ${where.join(" and ")}` : "";
	const countValues = [...values];
	const countResult = await db.query(
		`select count(*)::int as total from facilities_keys ${whereSql}`,
		countValues,
	);
	values.push(pageSize, (page - 1) * pageSize);
	const { rows } = await db.query(
		`select * from facilities_keys
		  ${whereSql}
		  order by ${orderClause(query.sort)}
		  limit $${values.length - 1}
		  offset $${values.length}`,
		values,
	);
	return {
		items: rows.map(mapKey),
		pagination: {
			page,
			pageSize,
			total: countResult.rows[0]?.total || 0,
			totalPages: Math.max(1, Math.ceil((countResult.rows[0]?.total || 0) / pageSize)),
		},
	};
}

async function getKeysDashboard() {
	await markOverdueKeys();
	const [{ rows: summaryRows }, { rows: eventRows }, { rows: attentionRows }] = await Promise.all([
		db.query(
			`select
				count(*)::int as total,
				count(*) filter (where status = $1)::int as available,
				count(*) filter (where status = $2)::int as checked_out,
				count(*) filter (where status = $3)::int as overdue,
				count(*) filter (where status = $4)::int as lost,
				count(*) filter (where qr_token is null or qr_token = '')::int as without_qr
			   from facilities_keys
			  where active = true`,
			[KEY_STATUS.AVAILABLE, KEY_STATUS.IN_USE, KEY_STATUS.OVERDUE, KEY_STATUS.LOST],
		),
		db.query(
			`select e.*, k.code, k.description, k.location_description, k.status
			   from facilities_key_events e
			   join facilities_keys k on k.id = e.key_id
			  order by e.occurred_at desc
			  limit 8`,
		),
		db.query(
			`select *
			   from facilities_keys
			  where active = true
			    and (
			      status in ($1, $2)
			      or qr_token is null
			      or qr_token = ''
			    )
			  order by
			    case when status = $1 then 1 when status = $2 then 2 else 3 end,
			    expected_return_at asc nulls last,
			    code asc
			  limit 8`,
			[KEY_STATUS.OVERDUE, KEY_STATUS.LOST],
		),
	]);
	const summary = summaryRows[0] || {};
	return {
		total: summary.total || 0,
		available: summary.available || 0,
		checkedOut: summary.checked_out || 0,
		overdue: summary.overdue || 0,
		lost: summary.lost || 0,
		withoutQr: summary.without_qr || 0,
		recentEvents: eventRows.map((row) => ({
			...mapEvent(row),
			keyCode: row.code,
			keyDescription: row.description,
			keyLocation: row.location_description,
			keyStatus: row.status,
		})),
		attentionItems: attentionRows.map(mapKey),
	};
}

async function getPublicKeyByQrToken(token) {
	const cleanToken = normalizeText(token).replace(/^key-/, "");
	if (!cleanToken) return null;
	await markOverdueKeys();
	const { rows } = await db.query(
		`select id, code, description, type, location_description, status,
		        current_holder_name, expected_return_at, qr_token, updated_at
		   from facilities_keys
		  where active = true
		    and qr_token = $1
		  limit 1`,
		[cleanToken],
	);
	const key = rows[0] ? mapKey(rows[0]) : null;
	if (!key) return null;
	return {
		id: key.id,
		kind: "key",
		code: key.code,
		codigo: key.codigo,
		description: key.description,
		name: key.name,
		type: key.type,
		locationDescription: key.locationDescription,
		address: key.address,
		status: key.status,
		statusLabel: key.statusLabel,
		currentHolderName: key.currentHolderName,
		expectedReturnAt: key.expectedReturnAt,
		qrToken: key.qrToken,
		updatedAt: key.updatedAt,
		source: "facilities_keys",
	};
}

async function getKey(id, client = db) {
	const { rows } = await client.query("select * from facilities_keys where id = $1", [id]);
	return rows[0] || null;
}

async function createKey(payload = {}, user = {}) {
	const client = await db.connect();
	try {
		await client.query("begin");
		const code = normalizeText(payload.code || payload.codigo) || (await nextKeyCode(client));
		const description = normalizeText(payload.description || payload.name || payload.descricao);
		if (!description) {
			const error = new Error("Informe a descrição da chave.");
			error.status = 400;
			throw error;
		}
		const type = KEY_TYPES.includes(payload.type) ? payload.type : "Chave física";
		const id = randomId("fkey");
		const { rows } = await client.query(
			`insert into facilities_keys (
         id, code, description, type, company_id, regional_id, property_id,
         environment_id, location_description, status, qr_token, notes,
         created_by, updated_by
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
       returning *`,
			[
				id,
				code,
				description,
				type,
				normalizeText(payload.companyId),
				normalizeText(payload.regionalId),
				normalizeText(payload.propertyId),
				normalizeText(payload.environmentId),
				normalizeText(payload.locationDescription || payload.address),
				KEY_STATUS.AVAILABLE,
				qrToken(),
				normalizeText(payload.notes),
				currentUserId(user),
			],
		);
		await insertEvent(client, id, "CREATED", user, { notes: "Chave criada no ADM." });
		await client.query("commit");
		const key = mapKey(rows[0]);
		auditLog.recordAuditLog({
			action: "FACILITY_KEY_CREATED",
			module: "facilities",
			entity: "facilities_keys",
			recordId: key.id,
			afterData: key,
			changedFields: auditLog.calculateChangedFields(null, key),
		});
		return key;
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function updateKey(id, payload = {}, user = {}) {
	const client = await db.connect();
	try {
		await client.query("begin");
		const before = await getKey(id, client);
		if (!before) {
			const error = new Error("Chave não encontrada.");
			error.status = 404;
			throw error;
		}
		const { rows } = await client.query(
			`update facilities_keys set
         description = coalesce(nullif($2, ''), description),
         type = coalesce(nullif($3, ''), type),
         company_id = $4,
         regional_id = $5,
         property_id = $6,
         environment_id = $7,
         location_description = $8,
         notes = $9,
         updated_by = $10
       where id = $1
       returning *`,
			[
				id,
				normalizeText(payload.description || payload.name || payload.descricao),
				KEY_TYPES.includes(payload.type) ? payload.type : "",
				normalizeText(payload.companyId),
				normalizeText(payload.regionalId),
				normalizeText(payload.propertyId),
				normalizeText(payload.environmentId),
				normalizeText(payload.locationDescription || payload.address),
				normalizeText(payload.notes),
				currentUserId(user),
			],
		);
		await insertEvent(client, id, "UPDATED", user, { notes: normalizeText(payload.changeNotes) });
		await client.query("commit");
		const after = mapKey(rows[0]);
		auditLog.recordAuditLog({
			action: "FACILITY_KEY_UPDATED",
			module: "facilities",
			entity: "facilities_keys",
			recordId: id,
			beforeData: mapKey(before),
			afterData: after,
			changedFields: auditLog.calculateChangedFields(mapKey(before), after),
		});
		return after;
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function checkoutKey(id, payload = {}, user = {}) {
	const client = await db.connect();
	try {
		await client.query("begin");
		const { rows: locked } = await client.query(
			"select * from facilities_keys where id = $1 for update",
			[id],
		);
		const before = locked[0];
		if (!before) {
			const error = new Error("Chave não encontrada.");
			error.status = 404;
			throw error;
		}
		if (![KEY_STATUS.AVAILABLE].includes(before.status)) {
			const error = new Error("Esta chave não está disponível para retirada.");
			error.status = 409;
			throw error;
		}
		const holderUserId = normalizeText(payload.holderUserId) || currentUserId(user);
		const holderName = normalizeText(payload.holderName) || currentUserName(user);
		const expectedReturnAt = normalizeDate(payload.expectedReturnAt);
		if (!holderName) {
			const error = new Error("Informe o portador da chave.");
			error.status = 400;
			throw error;
		}
		const { rows } = await client.query(
			`update facilities_keys set
         status = $2,
         current_holder_user_id = $3,
         current_holder_name = $4,
         checked_out_at = now(),
         expected_return_at = $5,
         returned_at = null,
         updated_by = $6
       where id = $1 returning *`,
			[id, KEY_STATUS.IN_USE, holderUserId, holderName, expectedReturnAt, currentUserId(user)],
		);
		await insertEvent(client, id, "CHECKED_OUT", user, {
			holderUserId,
			expectedReturnAt,
			notes: normalizeText(payload.notes),
			metadata: { holderName },
		});
		await client.query("commit");
		const after = mapKey(rows[0]);
		auditLog.recordAuditLog({
			action: "FACILITY_KEY_CHECKED_OUT",
			module: "facilities",
			entity: "facilities_keys",
			recordId: id,
			beforeData: mapKey(before),
			afterData: after,
			changedFields: auditLog.calculateChangedFields(mapKey(before), after),
		});
		sendKeyEmail(after, "retirada").catch(() => {});
		return after;
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function returnKey(id, payload = {}, user = {}) {
	const client = await db.connect();
	try {
		await client.query("begin");
		const { rows: locked } = await client.query(
			"select * from facilities_keys where id = $1 for update",
			[id],
		);
		const before = locked[0];
		if (!before) {
			const error = new Error("Chave não encontrada.");
			error.status = 404;
			throw error;
		}
		if (![KEY_STATUS.IN_USE, KEY_STATUS.OVERDUE].includes(before.status)) {
			const error = new Error("Esta chave não está em posse para devolução.");
			error.status = 409;
			throw error;
		}
		const { rows } = await client.query(
			`update facilities_keys set
         status = $2,
         current_holder_user_id = null,
         current_holder_name = null,
         returned_at = now(),
         updated_by = $3
       where id = $1 returning *`,
			[id, KEY_STATUS.AVAILABLE, currentUserId(user)],
		);
		await insertEvent(client, id, "RETURNED", user, { notes: normalizeText(payload.notes) });
		await client.query("commit");
		const after = mapKey(rows[0]);
		auditLog.recordAuditLog({
			action: "FACILITY_KEY_RETURNED",
			module: "facilities",
			entity: "facilities_keys",
			recordId: id,
			beforeData: mapKey(before),
			afterData: after,
			changedFields: auditLog.calculateChangedFields(mapKey(before), after),
		});
		sendKeyEmail(mapKey(before), "devolucao").catch(() => {});
		return after;
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function declareLostKey(id, payload = {}, user = {}) {
	const justification = normalizeText(payload.justification || payload.notes);
	if (!justification) {
		const error = new Error("Informe a justificativa para declarar a chave perdida.");
		error.status = 400;
		throw error;
	}
	return setKeyStatus(id, KEY_STATUS.LOST, "FACILITY_KEY_LOST", "LOST", user, {
		notes: justification,
	});
}

async function deactivateKey(id, payload = {}, user = {}) {
	return setKeyStatus(id, KEY_STATUS.INACTIVE, "FACILITY_KEY_DEACTIVATED", "DEACTIVATED", user, {
		notes: normalizeText(payload.notes),
		active: false,
	});
}

async function setKeyStatus(id, status, auditAction, eventType, user, options = {}) {
	const client = await db.connect();
	try {
		await client.query("begin");
		const before = await getKey(id, client);
		if (!before) {
			const error = new Error("Chave não encontrada.");
			error.status = 404;
			throw error;
		}
		const { rows } = await client.query(
			`update facilities_keys set status = $2, active = $3, updated_by = $4 where id = $1 returning *`,
			[id, status, options.active === false ? false : before.active, currentUserId(user)],
		);
		await insertEvent(client, id, eventType, user, { notes: options.notes });
		await client.query("commit");
		const after = mapKey(rows[0]);
		auditLog.recordAuditLog({
			action: auditAction,
			module: "facilities",
			entity: "facilities_keys",
			recordId: id,
			beforeData: mapKey(before),
			afterData: after,
			changedFields: auditLog.calculateChangedFields(mapKey(before), after),
		});
		return after;
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function regenerateQr(id, user = {}) {
	const client = await db.connect();
	try {
		await client.query("begin");
		const before = await getKey(id, client);
		if (!before) {
			const error = new Error("Chave não encontrada.");
			error.status = 404;
			throw error;
		}
		const { rows } = await client.query(
			`update facilities_keys
			    set qr_token = $2, qr_version = qr_version + 1, updated_by = $3
			  where id = $1 returning *`,
			[id, qrToken(), currentUserId(user)],
		);
		await insertEvent(client, id, "QR_REGENERATED", user);
		await client.query("commit");
		const after = mapKey(rows[0]);
		auditLog.recordAuditLog({
			action: "FACILITY_KEY_QR_REGENERATED",
			module: "facilities",
			entity: "facilities_keys",
			recordId: id,
			beforeData: mapKey(before),
			afterData: after,
			changedFields: auditLog.calculateChangedFields(mapKey(before), after),
		});
		return after;
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function listKeyHistory(keyId) {
	const { rows } = await db.query(
		`select e.*,
		        coalesce(e.metadata->>'actorName', e.actor_user_id) as actor_name,
		        coalesce(e.metadata->>'holderName', e.holder_user_id) as holder_name
		   from facilities_key_events e
		  where e.key_id = $1
		  order by e.occurred_at desc
		  limit 200`,
		[keyId],
	);
	return rows.map(mapEvent);
}

async function getMigrationReport() {
	const [{ rows: legacyPresence }, { rows: keys }, { rows: events }] = await Promise.all([
		db.query("select to_regclass('public.rot_keys') is not null as has_keys, to_regclass('public.rot_key_events') is not null as has_events"),
		db.query("select count(*)::int as total from facilities_keys where legacy_source = 'rot_keys'"),
		db.query("select count(*)::int as total from facilities_key_events where metadata->>'legacyId' is not null"),
	]);
	const safeCount = async (enabled, tableName) => {
		if (!enabled) return 0;
		try {
			const result = await db.query(`select count(*)::int as total from public.${tableName}`);
			return result.rows[0]?.total || 0;
		} catch {
			return 0;
		}
	};
	const legacyKeys = await safeCount(legacyPresence[0]?.has_keys === true, "rot_keys");
	const legacyEvents = await safeCount(legacyPresence[0]?.has_events === true, "rot_key_events");
	return {
		before: {
			rot_keys: legacyKeys,
			rot_key_events: legacyEvents,
		},
		migrated: {
			facilities_keys: keys[0]?.total || 0,
			facilities_key_events: events[0]?.total || 0,
		},
		failures: 0,
		ignored: [],
	};
}

async function sendKeyEmail(key, type) {
	const to = normalizeText(key.currentHolderEmail || "");
	if (!to) return;
	const subject =
		type === "devolucao"
			? `Confirmação de devolução de chave - ${key.code}`
			: `Confirmação de retirada de chave - ${key.code}`;
	await emailService.sendMail({
		to,
		subject,
		html: `<p>${subject}</p><p><strong>${key.description}</strong></p><p>${key.locationDescription || ""}</p>`,
		text: `${subject}\n${key.description}\n${key.locationDescription || ""}`,
		meta: { type: `facility_key_${type}`, keyId: key.id },
	});
}

module.exports = {
	KEY_STATUS,
	KEY_TYPES,
	checkoutKey,
	createKey,
	deactivateKey,
	declareLostKey,
	getKeysDashboard,
	getPublicKeyByQrToken,
	getMigrationReport,
	listKeyHistory,
	listKeys,
	regenerateQr,
	returnKey,
	updateKey,
};
