const express = require("express");
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, requireRotPermission, scopeRegionalFilter, userHasRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { auditLog } = require("../audit/auditLog");
const { recordOdometerReading, changeVehicleStatus, closeOpenCustody, openCustody } = require("./helpers");

// Frota — Fase 1 da reestruturacao (KM central, transferencia com
// aceite, custodia, status reestruturado, bloqueio, manutencao com KM,
// documentos, Ficha 360). Mantem tudo que ja existia (veiculos,
// sinistros, manutencoes, oficinas), so estende. Escopado por regional
// via scopeRegionalFilter + por operacao (ROT/FIELD/DELIVERY) via
// canAccessOperation — nunca removido, secao 2 do pedido.
const router = express.Router();
router.use(requireRotAuth);

const VALID_OPERATION_SCOPES = new Set(["ROT", "FIELD", "DELIVERY"]);
const VEHICLE_STATUSES = new Set([
	"EM_OPERACAO", "DISPONIVEL_BASE", "AGUARDANDO_RECEBIMENTO", "AGUARDANDO_MANUTENCAO",
	"EM_MANUTENCAO", "BLOQUEADO", "SINISTRO", "RESERVA", "INATIVO",
]);
// Status a partir dos quais um veiculo NAO pode ser movimentado
// normalmente (transferir, devolver, retirar, entrar em manutencao) —
// secao 21: bloqueado/inativo travam o veiculo; aguardando recebimento
// ja tem uma movimentacao em curso.
const LOCKED_STATUSES = new Set(["BLOQUEADO", "INATIVO", "AGUARDANDO_RECEBIMENTO"]);

function fail(status, message, code) {
	const error = new Error(message);
	error.status = status;
	if (code) error.code = code;
	throw error;
}

function normalizeOperationScope(value, fallback = "ROT") {
	const scope = String(value || fallback || "ROT").trim().toUpperCase();
	return VALID_OPERATION_SCOPES.has(scope) ? scope : "ROT";
}

function userOperationScopes(req) {
	if (req.rotUser?.role_id === "site_admin" || req.rotUser?.permissions?.includes("*")) {
		return [...VALID_OPERATION_SCOPES];
	}
	const scopes = Array.isArray(req.rotUser?.operation_scopes)
		? req.rotUser.operation_scopes
		: Array.isArray(req.rotUser?.operationScopes)
			? req.rotUser.operationScopes
			: ["ROT"];
	const normalized = [...new Set(scopes.map((scope) => normalizeOperationScope(scope)).filter(Boolean))];
	return normalized.length ? normalized : ["ROT"];
}

function canAccessOperation(req, scope) {
	return userOperationScopes(req).includes(normalizeOperationScope(scope));
}

function normalizeOperationScopes(values) {
	const source = Array.isArray(values) ? values : ["ROT"];
	const scopes = [...new Set(source.map((value) => normalizeOperationScope(value)).filter(Boolean))];
	return scopes.length ? scopes : ["ROT"];
}

function nullableText(value, max = 2000) {
	const text = String(value ?? "").trim();
	return text ? text.slice(0, max) : null;
}

async function requireVehicleAccess(req, res, vehicleId) {
	const { rows } = await db.query(`select * from rot_vehicles where id = $1`, [vehicleId]);
	const vehicle = rows[0];
	if (!vehicle) {
		res.status(404).json({ ok: false, error: "Veículo não encontrado." });
		return null;
	}
	const regionalScope = scopeRegionalFilter(req);
	if (regionalScope && vehicle.regional_id !== regionalScope) {
		res.status(403).json({ ok: false, error: "Você não pode acessar veículo de outra regional." });
		return null;
	}
	if (!canAccessOperation(req, vehicle.operation_scope)) {
		res.status(403).json({ ok: false, error: "Você não pode acessar veículo de outra operação." });
		return null;
	}
	return vehicle;
}

async function requireVehicleAccessByClaim(req, res, claimId) {
	const { rows } = await db.query(`select vehicle_id from rot_vehicle_claims where id = $1`, [claimId]);
	if (!rows[0]) {
		res.status(404).json({ ok: false, error: "Sinistro não encontrado." });
		return null;
	}
	return requireVehicleAccess(req, res, rows[0].vehicle_id);
}

async function requireVehicleAccessByMaintenance(req, res, maintenanceId) {
	const { rows } = await db.query(`select vehicle_id from rot_vehicle_maintenances where id = $1`, [maintenanceId]);
	if (!rows[0]) {
		res.status(404).json({ ok: false, error: "Manutenção não encontrada." });
		return null;
	}
	return requireVehicleAccess(req, res, rows[0].vehicle_id);
}

// Variante que lanca (fail) em vez de responder direto — usada nos
// fluxos transacionais novos (client.query com "for update" pra travar
// a linha dentro da mesma transacao).
async function loadVehicleForUpdate(client, req, vehicleId) {
	const { rows } = await client.query(`select * from rot_vehicles where id = $1 for update`, [vehicleId]);
	const vehicle = rows[0];
	if (!vehicle) fail(404, "Veículo não encontrado.");
	const regionalScope = scopeRegionalFilter(req);
	if (regionalScope && vehicle.regional_id !== regionalScope) fail(403, "Você não pode acessar veículo de outra regional.");
	if (!canAccessOperation(req, vehicle.operation_scope)) fail(403, "Você não pode acessar veículo de outra operação.");
	return vehicle;
}

async function assertResponsibleMatchesOperation(client, responsibleId, operationScope) {
	if (!responsibleId) return;
	const { rows } = await client.query(
		`select coalesce(array_remove(array_agg(operation_type order by operation_type), null), array[]::text[]) as operation_scopes
		   from rot_user_operation_scopes where user_id = $1`,
		[responsibleId],
	);
	if (!normalizeOperationScopes(rows[0]?.operation_scopes).includes(normalizeOperationScope(operationScope))) {
		fail(400, "O responsável selecionado não pertence à operação deste veículo.");
	}
}

function publicVehicle(row) {
	return {
		id: row.id,
		model: row.model,
		plate: row.plate,
		manufacturer: row.manufacturer,
		year: row.year,
		regionalId: row.regional_id,
		responsibleId: row.responsible_id,
		operationScope: normalizeOperationScope(row.operation_scope),
		status: row.status,
		previousStatus: row.previous_status,
		blockedReason: row.blocked_reason,
		blockedAt: row.blocked_at,
		currentKm: row.current_km,
		currentKmAt: row.current_km_at,
		inactivatedReason: row.inactivated_reason,
		inactivatedAt: row.inactivated_at,
		finalKm: row.final_km,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function publicClaim(row) {
	return { id: row.id, vehicleId: row.vehicle_id, description: row.description, date: row.date, createdBy: row.created_by, createdByName: row.created_by_name };
}

function publicMaintenance(row) {
	return {
		id: row.id,
		vehicleId: row.vehicle_id,
		workshopId: row.workshop_id,
		date: row.date,
		time: row.time,
		status: row.status,
		resolutionNote: row.resolution_note,
		finishedAt: row.finished_at,
		kmIn: row.km_in,
		kmOut: row.km_out,
		reason: row.reason,
		maintenanceType: row.maintenance_type,
		nextKm: row.next_km,
		intervalKm: row.interval_km,
		releasedBy: row.released_by,
		createdAt: row.created_at,
	};
}

function publicWorkshop(row) {
	return { id: row.id, name: row.name, address: row.address, phone: row.phone, regionalId: row.regional_id };
}

function publicMovement(row) {
	return {
		id: row.id,
		vehicleId: row.vehicle_id,
		type: row.type,
		status: row.status,
		operationScope: row.operation_scope,
		regionalId: row.regional_id,
		fromResponsibleId: row.from_responsible_id,
		fromResponsibleName: row.from_responsible_name,
		toResponsibleId: row.to_responsible_id,
		toResponsibleName: row.to_responsible_name,
		kmOut: row.km_out,
		kmIn: row.km_in,
		reason: row.reason,
		note: row.note,
		createdBy: row.created_by,
		createdByName: row.created_by_name,
		confirmedBy: row.confirmed_by,
		confirmedAt: row.confirmed_at,
		createdAt: row.created_at,
	};
}

function publicCustody(row) {
	return {
		id: row.id,
		vehicleId: row.vehicle_id,
		responsibleId: row.responsible_id,
		responsibleName: row.responsible_name,
		operationScope: row.operation_scope,
		regionalId: row.regional_id,
		startedAt: row.started_at,
		startedKm: row.started_km,
		endedAt: row.ended_at,
		endedKm: row.ended_km,
	};
}

function publicOdometerReading(row) {
	return {
		id: row.id,
		vehicleId: row.vehicle_id,
		km: row.km,
		previousKm: row.previous_km,
		origin: row.origin,
		movementId: row.movement_id,
		maintenanceId: row.maintenance_id,
		note: row.note,
		reason: row.reason,
		jumpConfirmed: row.jump_confirmed,
		recordedBy: row.recorded_by,
		recordedByName: row.recorded_by_name,
		recordedAt: row.recorded_at,
	};
}

function publicStatusHistory(row) {
	return {
		id: row.id,
		vehicleId: row.vehicle_id,
		fromStatus: row.from_status,
		toStatus: row.to_status,
		reason: row.reason,
		note: row.note,
		movementId: row.movement_id,
		maintenanceId: row.maintenance_id,
		claimId: row.claim_id,
		changedBy: row.changed_by,
		changedByName: row.changed_by_name,
		changedAt: row.changed_at,
	};
}

function publicDocument(row) {
	return {
		id: row.id,
		vehicleId: row.vehicle_id,
		type: row.type,
		number: row.number,
		issuedAt: row.issued_at,
		expiresAt: row.expires_at,
		note: row.note,
		createdBy: row.created_by,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

// ---------------------------------------------------------------------
// Listagem / CRUD basico de veiculo
// ---------------------------------------------------------------------

router.get("/", noStore, async (req, res, next) => {
	try {
		const regionalScope = scopeRegionalFilter(req);
		const params = [];
		const filters = [];
		if (regionalScope) {
			params.push(regionalScope);
			filters.push(`regional_id = $${params.length}`);
		}
		params.push(userOperationScopes(req));
		filters.push(`operation_scope = any($${params.length}::text[])`);
		const where = filters.length ? `where ${filters.join(" and ")}` : "";
		const { rows: allVehicles } = await db.query(`select * from rot_vehicles ${where} order by model`, params);
		// Sem rot.fleet.manage/.view, so enxerga o proprio veiculo (responsible_id
		// = o proprio usuario) — antes qualquer autenticado via a frota inteira
		// da regional, so as acoes de edicao eram escondidas no frontend.
		const canViewFleet = userHasRotPermission(req.rotUser, ["rot.fleet.manage", "rot.fleet.view"]);
		const vehicles = canViewFleet ? allVehicles : allVehicles.filter((v) => v.responsible_id === req.rotUser.id);
		const ids = vehicles.map((v) => v.id);
		const [claimsResult, maintResult, workshopsResult, usersResult] = await Promise.all([
			ids.length ? db.query(`select c.*, u.name as created_by_name from rot_vehicle_claims c left join rot_users u on u.id = c.created_by where c.vehicle_id = any($1::text[]) order by c.date desc`, [ids]) : { rows: [] },
			ids.length ? db.query(`select * from rot_vehicle_maintenances where vehicle_id = any($1::text[]) order by date desc`, [ids]) : { rows: [] },
			db.query(`select * from rot_workshops order by name`),
			db.query(regionalScope
				? `select u.id, u.name, u.regional_id, coalesce(array_remove(array_agg(s.operation_type order by s.operation_type), null), array[]::text[]) as operation_scopes
				     from rot_users u
				     left join rot_user_operation_scopes s on s.user_id = u.id
				    where u.regional_id = $1 and u.status = 'ativo'
				    group by u.id, u.name, u.regional_id
				    order by u.name`
				: `select u.id, u.name, u.regional_id, coalesce(array_remove(array_agg(s.operation_type order by s.operation_type), null), array[]::text[]) as operation_scopes
				     from rot_users u
				     left join rot_user_operation_scopes s on s.user_id = u.id
				    where u.status = 'ativo'
				    group by u.id, u.name, u.regional_id
				    order by u.name`,
			regionalScope ? [regionalScope] : []),
		]);
		res.json({
			ok: true,
			vehicles: vehicles.map(publicVehicle),
			claims: claimsResult.rows.map(publicClaim),
			maintenances: maintResult.rows.map(publicMaintenance),
			workshops: workshopsResult.rows.map(publicWorkshop),
			technicians: usersResult.rows.map((u) => ({
				id: u.id,
				name: u.name,
				regionalId: u.regional_id,
				operationScopes: Array.isArray(u.operation_scopes) && u.operation_scopes.length ? u.operation_scopes : ["ROT"],
			})),
		});
	} catch (error) {
		next(error);
	}
});

// Cadastro: KM atual passa a ser obrigatorio (secao 6) — gera a
// primeira leitura do historico dentro da mesma transacao do INSERT.
router.post("/", requireRotPermission("rot.fleet.manage"), async (req, res, next) => {
	let client;
	try {
		const { model, plate, manufacturer, regionalId } = req.body || {};
		const operationScope = normalizeOperationScope(req.body?.operationScope);
		const year = req.body?.year ? Number(req.body.year) : null;
		const km = req.body?.km;
		if (!model?.trim() || !plate?.trim()) fail(400, "Informe modelo e placa do veículo.");
		if (km === undefined || km === null || km === "" || Number.isNaN(Number(km)) || Number(km) < 0) {
			fail(400, "Informe a quilometragem atual do veículo.");
		}
		if (!canAccessOperation(req, operationScope)) fail(403, "Você não pode cadastrar veículo para essa operação.");

		const id = randomId();
		client = await db.connect();
		await client.query("begin");
		const { rows } = await client.query(
			`insert into rot_vehicles (id, model, plate, manufacturer, regional_id, operation_scope, year, status)
			 values ($1,$2,$3,$4,$5,$6,$7,'DISPONIVEL_BASE') returning *`,
			[id, model.trim(), plate.trim().toUpperCase(), String(manufacturer || ""), regionalId || req.rotUser.regional_id || null, operationScope, year],
		);
		await recordOdometerReading(client, { vehicleId: id, km: Number(km), userId: req.rotUser.id, origin: "CADASTRO", allowLower: true, jumpConfirmed: true });
		await client.query(
			`insert into rot_vehicle_status_history (vehicle_id, from_status, to_status, reason, changed_by) values ($1, null, 'DISPONIVEL_BASE', 'Cadastro do veículo', $2)`,
			[id, req.rotUser.id],
		);
		await client.query("commit");
		const { rows: hydrated } = await db.query("select * from rot_vehicles where id = $1", [id]);
		await auditLog(req, { action: "create", entity: "rot_vehicles", entityId: id, after: hydrated[0] });
		res.status(201).json({ ok: true, vehicle: publicVehicle(hydrated[0]) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.put("/:id", requireRotPermission("rot.fleet.manage"), async (req, res, next) => {
	try {
		const { model, plate, manufacturer, regionalId } = req.body || {};
		const { rows: before } = await db.query(`select * from rot_vehicles where id = $1`, [req.params.id]);
		if (!before[0]) fail(404, "Veículo não encontrado.");
		if (!canAccessOperation(req, before[0].operation_scope)) fail(403, "Você não pode alterar veículo de outra operação.");
		const operationScope = req.body?.operationScope !== undefined ? normalizeOperationScope(req.body.operationScope) : before[0].operation_scope;
		if (!canAccessOperation(req, operationScope)) fail(403, "Você não pode mover veículo para essa operação.");
		const year = req.body?.year !== undefined ? (req.body.year ? Number(req.body.year) : null) : before[0].year;
		const { rows } = await db.query(
			`update rot_vehicles set model = coalesce($2, model), plate = coalesce($3, plate), manufacturer = coalesce($4, manufacturer), regional_id = coalesce($5, regional_id), operation_scope = $6, year = $7 where id = $1 returning *`,
			[req.params.id, model?.trim() || null, plate?.trim()?.toUpperCase() || null, manufacturer ?? null, regionalId || null, operationScope, year],
		);
		await auditLog(req, { action: "update", entity: "rot_vehicles", entityId: req.params.id, before: before[0], after: rows[0] });
		res.json({ ok: true, vehicle: publicVehicle(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", requireRotPermission("rot.fleet.manage"), async (req, res, next) => {
	try {
		const { rows: before } = await db.query(`select * from rot_vehicles where id = $1`, [req.params.id]);
		if (before[0] && !canAccessOperation(req, before[0].operation_scope)) fail(403, "Você não pode excluir veículo de outra operação.");
		const { rows } = await db.query(`delete from rot_vehicles where id = $1 returning *`, [req.params.id]);
		if (rows[0]) await auditLog(req, { action: "delete", entity: "rot_vehicles", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

// Endpoint legado (select direto). Mantido por compatibilidade, mas o
// frontend novo nao usa mais isso pra atribuir responsavel com veiculo
// ja em uso — secao 10 do pedido exige o fluxo explicito de
// transferencia/aceite abaixo. So funciona pra sair de "sem
// responsavel" -> "tem responsavel" sem custodia/KM (uso interno).
router.put("/:id/responsible", requireRotPermission("rot.fleet.manage"), async (req, res, next) => {
	try {
		const { responsibleId } = req.body || {};
		const { rows: before } = await db.query(`select * from rot_vehicles where id = $1`, [req.params.id]);
		if (before[0] && !canAccessOperation(req, before[0].operation_scope)) fail(403, "Você não pode atribuir veículo de outra operação.");
		if (responsibleId && before[0]) await assertResponsibleMatchesOperation(db, responsibleId, before[0].operation_scope);
		const { rows } = await db.query(`update rot_vehicles set responsible_id = $2 where id = $1 returning *`, [req.params.id, responsibleId || null]);
		if (!rows[0]) fail(404, "Veículo não encontrado.");
		res.json({ ok: true, vehicle: publicVehicle(rows[0]) });
	} catch (error) {
		next(error);
	}
});

// ---------------------------------------------------------------------
// Quilometragem (secoes 5-9)
// ---------------------------------------------------------------------

router.post("/:id/km", requireRotPermission(["rot.fleet.km.manage", "rot.fleet.manage"]), async (req, res, next) => {
	let client;
	try {
		const km = Number(req.body?.km);
		const jumpConfirmed = Boolean(req.body?.jumpConfirmed);
		client = await db.connect();
		await client.query("begin");
		const vehicle = await loadVehicleForUpdate(client, req, req.params.id);
		if (vehicle.status === "INATIVO") fail(409, "Veículo inativo não recebe novas leituras.");
		const reading = await recordOdometerReading(client, {
			vehicleId: vehicle.id, km, userId: req.rotUser.id, origin: "LEITURA_MANUAL",
			note: nullableText(req.body?.note, 500), jumpConfirmed,
		});
		await client.query("commit");
		res.status(201).json({ ok: true, reading: publicOdometerReading(reading) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

// Correcao administrativa (secao 8): so quem tem permissao especifica,
// exige motivo, nunca apaga a leitura anterior — insere uma nova
// leitura de origem CORRECAO_ADMINISTRATIVA e audita antes/depois.
router.post("/:id/km/correct", requireRotPermission(["rot.fleet.km.correct", "rot.fleet.manage"]), async (req, res, next) => {
	let client;
	try {
		const km = Number(req.body?.km);
		const reason = nullableText(req.body?.reason, 500);
		if (!reason) fail(400, "Informe o motivo da correção.");
		client = await db.connect();
		await client.query("begin");
		const vehicle = await loadVehicleForUpdate(client, req, req.params.id);
		const previousKm = vehicle.current_km;
		const reading = await recordOdometerReading(client, {
			vehicleId: vehicle.id, km, userId: req.rotUser.id, origin: "CORRECAO_ADMINISTRATIVA",
			reason, allowLower: true, jumpConfirmed: true,
		});
		await client.query("commit");
		await auditLog(req, { action: "km_correct", entity: "rot_vehicles", entityId: vehicle.id, before: { km: previousKm }, after: { km, reason } });
		res.status(201).json({ ok: true, reading: publicOdometerReading(reading) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

// ---------------------------------------------------------------------
// Transferencia com aceite explicito (secoes 10-12)
// ---------------------------------------------------------------------

router.post("/:id/transfer", requireRotPermission(["rot.fleet.transfer", "rot.fleet.manage"]), async (req, res, next) => {
	let client;
	try {
		const toResponsibleId = String(req.body?.toResponsibleId || "").trim();
		const km = Number(req.body?.km);
		const note = nullableText(req.body?.note, 1000);
		const jumpConfirmed = Boolean(req.body?.jumpConfirmed);
		if (!toResponsibleId) fail(400, "Selecione o novo responsável.");

		client = await db.connect();
		await client.query("begin");
		const vehicle = await loadVehicleForUpdate(client, req, req.params.id);
		if (LOCKED_STATUSES.has(vehicle.status)) fail(409, "Este veículo não pode ser transferido no status atual.");
		if (toResponsibleId === vehicle.responsible_id) fail(400, "O veículo já está com este responsável.");
		await assertResponsibleMatchesOperation(client, toResponsibleId, vehicle.operation_scope);

		const movementId = randomId("mov");
		const reading = await recordOdometerReading(client, {
			vehicleId: vehicle.id, km, userId: req.rotUser.id, origin: "TRANSFERENCIA_ENTREGA",
			movementId, note, jumpConfirmed,
		});
		await client.query(
			`insert into rot_vehicle_movements
			 (id, vehicle_id, type, status, operation_scope, regional_id, from_responsible_id, to_responsible_id, km_out, note, created_by)
			 values ($1,$2,'TRANSFERENCIA','PENDENTE',$3,$4,$5,$6,$7,$8,$9)`,
			[movementId, vehicle.id, vehicle.operation_scope, vehicle.regional_id, vehicle.responsible_id, toResponsibleId, reading.km, note, req.rotUser.id],
		);
		await closeOpenCustody(client, { vehicleId: vehicle.id, endedKm: reading.km, endMovementId: movementId });
		await changeVehicleStatus(client, { vehicleId: vehicle.id, toStatus: "AGUARDANDO_RECEBIMENTO", reason: "Transferência iniciada", movementId, userId: req.rotUser.id, storePrevious: true });
		await client.query("commit");

		const { rows: hydrated } = await db.query("select * from rot_vehicle_movements where id = $1", [movementId]);
		await auditLog(req, { action: "transfer", entity: "rot_vehicles", entityId: vehicle.id, before: { responsibleId: vehicle.responsible_id }, after: { toResponsibleId, km: reading.km } });
		res.status(201).json({ ok: true, movement: publicMovement(hydrated[0]) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/movements/:movementId/confirm", async (req, res, next) => {
	let client;
	try {
		const km = Number(req.body?.km);
		const note = nullableText(req.body?.note, 1000);
		const jumpConfirmed = Boolean(req.body?.jumpConfirmed);

		client = await db.connect();
		await client.query("begin");
		const { rows: movementRows } = await client.query("select * from rot_vehicle_movements where id = $1 for update", [req.params.movementId]);
		const movement = movementRows[0];
		if (!movement || movement.type !== "TRANSFERENCIA") fail(404, "Transferência não encontrada.");
		if (movement.status !== "PENDENTE") fail(409, "Esta transferência já foi confirmada ou cancelada.");
		const isRecipient = movement.to_responsible_id === req.rotUser.id;
		if (!isRecipient && !userHasRotPermission(req.rotUser, ["rot.fleet.receive", "rot.fleet.manage"])) {
			fail(403, "Só o novo responsável (ou a gestão de frotas) pode confirmar o recebimento.");
		}
		const vehicle = await loadVehicleForUpdate(client, req, movement.vehicle_id);

		const reading = await recordOdometerReading(client, {
			vehicleId: vehicle.id, km, userId: req.rotUser.id, origin: "TRANSFERENCIA_RECEBIMENTO",
			movementId: movement.id, note, jumpConfirmed,
		});
		await client.query(
			`update rot_vehicle_movements set status='CONFIRMADO', km_in=$2, confirmed_by=$3, confirmed_at=now() where id=$1`,
			[movement.id, reading.km, req.rotUser.id],
		);
		await openCustody(client, {
			vehicleId: vehicle.id, responsibleId: movement.to_responsible_id, operationScope: vehicle.operation_scope,
			regionalId: vehicle.regional_id, startedKm: reading.km, startMovementId: movement.id,
		});
		await client.query("update rot_vehicles set responsible_id = $2, previous_status = null where id = $1", [vehicle.id, movement.to_responsible_id]);
		await changeVehicleStatus(client, { vehicleId: vehicle.id, toStatus: "EM_OPERACAO", reason: "Recebimento confirmado", movementId: movement.id, userId: req.rotUser.id });
		await client.query("commit");

		const { rows: hydrated } = await db.query("select * from rot_vehicle_movements where id = $1", [movement.id]);
		await auditLog(req, { action: "confirm_transfer", entity: "rot_vehicles", entityId: vehicle.id, after: { km: reading.km, responsibleId: movement.to_responsible_id } });
		res.json({ ok: true, movement: publicMovement(hydrated[0]) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/movements/:movementId/cancel", requireRotPermission(["rot.fleet.transfer", "rot.fleet.manage"]), async (req, res, next) => {
	let client;
	try {
		client = await db.connect();
		await client.query("begin");
		const { rows: movementRows } = await client.query("select * from rot_vehicle_movements where id = $1 for update", [req.params.movementId]);
		const movement = movementRows[0];
		if (!movement || movement.type !== "TRANSFERENCIA") fail(404, "Transferência não encontrada.");
		if (movement.status !== "PENDENTE") fail(409, "Esta transferência já foi confirmada ou cancelada.");
		const vehicle = await loadVehicleForUpdate(client, req, movement.vehicle_id);
		await client.query("update rot_vehicle_movements set status='CANCELADO' where id=$1", [movement.id]);
		// Restaura a custodia do responsavel anterior (a transferencia so
		// fechou a custodia dele, nao abriu uma nova pro destinatario).
		if (vehicle.responsible_id) {
			await openCustody(client, {
				vehicleId: vehicle.id, responsibleId: vehicle.responsible_id, operationScope: vehicle.operation_scope,
				regionalId: vehicle.regional_id, startedKm: vehicle.current_km, startMovementId: null,
			});
		}
		const restoreStatus = vehicle.previous_status || (vehicle.responsible_id ? "EM_OPERACAO" : "DISPONIVEL_BASE");
		await changeVehicleStatus(client, { vehicleId: vehicle.id, toStatus: restoreStatus, reason: "Transferência cancelada", movementId: movement.id, userId: req.rotUser.id });
		await client.query("update rot_vehicles set previous_status = null where id = $1", [vehicle.id]);
		await client.query("commit");
		res.json({ ok: true });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

// ---------------------------------------------------------------------
// Devolucao / retirada da base (secoes 13-14)
// ---------------------------------------------------------------------

router.post("/:id/return-to-base", requireRotPermission(["rot.fleet.transfer", "rot.fleet.manage"]), async (req, res, next) => {
	let client;
	try {
		const km = Number(req.body?.km);
		const reason = nullableText(req.body?.reason, 500);
		const note = nullableText(req.body?.note, 1000);
		const jumpConfirmed = Boolean(req.body?.jumpConfirmed);
		if (!reason) fail(400, "Informe o motivo da devolução.");

		client = await db.connect();
		await client.query("begin");
		const vehicle = await loadVehicleForUpdate(client, req, req.params.id);
		if (LOCKED_STATUSES.has(vehicle.status) || vehicle.status === "EM_MANUTENCAO") fail(409, "Este veículo não pode ser devolvido à base no status atual.");

		const movementId = randomId("mov");
		const reading = await recordOdometerReading(client, {
			vehicleId: vehicle.id, km, userId: req.rotUser.id, origin: "DEVOLUCAO_BASE", movementId, note, jumpConfirmed,
		});
		await client.query(
			`insert into rot_vehicle_movements (id, vehicle_id, type, status, operation_scope, regional_id, from_responsible_id, km_out, reason, note, created_by)
			 values ($1,$2,'DEVOLUCAO_BASE','CONCLUIDO',$3,$4,$5,$6,$7,$8,$9)`,
			[movementId, vehicle.id, vehicle.operation_scope, vehicle.regional_id, vehicle.responsible_id, reading.km, reason, note, req.rotUser.id],
		);
		await closeOpenCustody(client, { vehicleId: vehicle.id, endedKm: reading.km, endMovementId: movementId });
		await client.query("update rot_vehicles set responsible_id = null where id = $1", [vehicle.id]);
		await changeVehicleStatus(client, { vehicleId: vehicle.id, toStatus: "DISPONIVEL_BASE", reason, movementId, userId: req.rotUser.id });
		await client.query("commit");

		const { rows: hydrated } = await db.query("select * from rot_vehicles where id = $1", [vehicle.id]);
		await auditLog(req, { action: "return_to_base", entity: "rot_vehicles", entityId: vehicle.id, after: { km: reading.km, reason } });
		res.json({ ok: true, vehicle: publicVehicle(hydrated[0]) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/:id/retrieve-from-base", requireRotPermission(["rot.fleet.transfer", "rot.fleet.manage"]), async (req, res, next) => {
	let client;
	try {
		const responsibleId = String(req.body?.responsibleId || "").trim();
		const km = Number(req.body?.km);
		const note = nullableText(req.body?.note, 1000);
		const jumpConfirmed = Boolean(req.body?.jumpConfirmed);
		if (!responsibleId) fail(400, "Selecione o responsável.");

		client = await db.connect();
		await client.query("begin");
		const vehicle = await loadVehicleForUpdate(client, req, req.params.id);
		if (vehicle.status !== "DISPONIVEL_BASE") fail(409, "Só é possível retirar da base um veículo disponível na base.");
		await assertResponsibleMatchesOperation(client, responsibleId, vehicle.operation_scope);

		const movementId = randomId("mov");
		const reading = await recordOdometerReading(client, {
			vehicleId: vehicle.id, km, userId: req.rotUser.id, origin: "RETIRADA_BASE", movementId, note, jumpConfirmed,
		});
		await client.query(
			`insert into rot_vehicle_movements (id, vehicle_id, type, status, operation_scope, regional_id, to_responsible_id, km_out, km_in, note, created_by, confirmed_by, confirmed_at)
			 values ($1,$2,'RETIRADA_BASE','CONCLUIDO',$3,$4,$5,$6,$6,$7,$8,$8,now())`,
			[movementId, vehicle.id, vehicle.operation_scope, vehicle.regional_id, responsibleId, reading.km, note, req.rotUser.id],
		);
		await openCustody(client, {
			vehicleId: vehicle.id, responsibleId, operationScope: vehicle.operation_scope, regionalId: vehicle.regional_id,
			startedKm: reading.km, startMovementId: movementId,
		});
		await client.query("update rot_vehicles set responsible_id = $2 where id = $1", [vehicle.id, responsibleId]);
		await changeVehicleStatus(client, { vehicleId: vehicle.id, toStatus: "EM_OPERACAO", reason: "Retirada da base", movementId, userId: req.rotUser.id });
		await client.query("commit");

		const { rows: hydrated } = await db.query("select * from rot_vehicles where id = $1", [vehicle.id]);
		await auditLog(req, { action: "retrieve_from_base", entity: "rot_vehicles", entityId: vehicle.id, after: { km: reading.km, responsibleId } });
		res.json({ ok: true, vehicle: publicVehicle(hydrated[0]) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

// ---------------------------------------------------------------------
// Bloqueio / desbloqueio (secoes 21-22)
// ---------------------------------------------------------------------

router.post("/:id/block", requireRotPermission(["rot.fleet.block", "rot.fleet.manage"]), async (req, res, next) => {
	let client;
	try {
		const reason = nullableText(req.body?.reason, 500);
		const note = nullableText(req.body?.note, 1000);
		if (!reason) fail(400, "Informe o motivo do bloqueio.");
		client = await db.connect();
		await client.query("begin");
		const vehicle = await loadVehicleForUpdate(client, req, req.params.id);
		if (vehicle.status === "BLOQUEADO" || vehicle.status === "INATIVO") fail(409, "Este veículo já está bloqueado ou inativo.");
		await changeVehicleStatus(client, { vehicleId: vehicle.id, toStatus: "BLOQUEADO", reason, note, userId: req.rotUser.id, storePrevious: true });
		await client.query("update rot_vehicles set blocked_reason = $2, blocked_at = now() where id = $1", [vehicle.id, reason]);
		await client.query("commit");
		const { rows: hydrated } = await db.query("select * from rot_vehicles where id = $1", [vehicle.id]);
		await auditLog(req, { action: "block", entity: "rot_vehicles", entityId: vehicle.id, before: { status: vehicle.status }, after: { status: "BLOQUEADO", reason } });
		res.json({ ok: true, vehicle: publicVehicle(hydrated[0]) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/:id/unblock", requireRotPermission(["rot.fleet.unblock", "rot.fleet.manage"]), async (req, res, next) => {
	let client;
	try {
		const reason = nullableText(req.body?.reason, 500);
		if (!reason) fail(400, "Informe o motivo da liberação.");
		client = await db.connect();
		await client.query("begin");
		const vehicle = await loadVehicleForUpdate(client, req, req.params.id);
		if (vehicle.status !== "BLOQUEADO") fail(409, "Este veículo não está bloqueado.");
		const restoreStatus = vehicle.previous_status || (vehicle.responsible_id ? "EM_OPERACAO" : "DISPONIVEL_BASE");
		await changeVehicleStatus(client, { vehicleId: vehicle.id, toStatus: restoreStatus, reason, userId: req.rotUser.id });
		await client.query("update rot_vehicles set blocked_reason = null, blocked_at = null, previous_status = null where id = $1", [vehicle.id]);
		await client.query("commit");
		const { rows: hydrated } = await db.query("select * from rot_vehicles where id = $1", [vehicle.id]);
		await auditLog(req, { action: "unblock", entity: "rot_vehicles", entityId: vehicle.id, before: { status: "BLOQUEADO" }, after: { status: restoreStatus, reason } });
		res.json({ ok: true, vehicle: publicVehicle(hydrated[0]) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

// ---------------------------------------------------------------------
// Baixa / inativacao (secao 43)
// ---------------------------------------------------------------------

router.post("/:id/inactivate", requireRotPermission(["rot.fleet.inactivate", "rot.fleet.manage"]), async (req, res, next) => {
	let client;
	try {
		const reason = nullableText(req.body?.reason, 500);
		const note = nullableText(req.body?.note, 1000);
		const km = Number(req.body?.km);
		if (!reason) fail(400, "Informe o motivo da baixa.");
		client = await db.connect();
		await client.query("begin");
		const vehicle = await loadVehicleForUpdate(client, req, req.params.id);
		if (vehicle.status === "INATIVO") fail(409, "Este veículo já está inativo.");
		const reading = await recordOdometerReading(client, { vehicleId: vehicle.id, km, userId: req.rotUser.id, origin: "INATIVACAO", reason, note });
		await closeOpenCustody(client, { vehicleId: vehicle.id, endedKm: reading.km });
		await changeVehicleStatus(client, { vehicleId: vehicle.id, toStatus: "INATIVO", reason, note, userId: req.rotUser.id });
		await client.query(
			`update rot_vehicles set responsible_id = null, inactivated_reason = $2, inactivated_at = now(), final_km = $3, previous_status = null, blocked_reason = null, blocked_at = null where id = $1`,
			[vehicle.id, reason, reading.km],
		);
		await client.query("commit");
		const { rows: hydrated } = await db.query("select * from rot_vehicles where id = $1", [vehicle.id]);
		await auditLog(req, { action: "inactivate", entity: "rot_vehicles", entityId: vehicle.id, after: { reason, km: reading.km } });
		res.json({ ok: true, vehicle: publicVehicle(hydrated[0]) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

// ---------------------------------------------------------------------
// Sinistros (mantido, agora pode afetar status — secao 20)
// ---------------------------------------------------------------------

router.post("/:id/claims", requireRotPermission("rot.fleet.manage"), async (req, res, next) => {
	let client;
	try {
		const { description, date } = req.body || {};
		const affectsAvailability = req.body?.affectsAvailability !== false;
		const vehicle = await requireVehicleAccess(req, res, req.params.id);
		if (!vehicle) return;
		if (!description?.trim()) fail(400, "Descreva a ocorrência.");
		const id = randomId();
		client = await db.connect();
		await client.query("begin");
		const { rows } = await client.query(
			`insert into rot_vehicle_claims (id, vehicle_id, description, date, created_by) values ($1, $2, $3, coalesce($4, now()), $5) returning *`,
			[id, req.params.id, description.trim(), date || null, req.rotUser.id],
		);
		if (affectsAvailability && !LOCKED_STATUSES.has(vehicle.status)) {
			await changeVehicleStatus(client, { vehicleId: vehicle.id, toStatus: "SINISTRO", reason: "Sinistro registrado", claimId: id, userId: req.rotUser.id, storePrevious: true });
		}
		await client.query("commit");
		res.status(201).json({ ok: true, claim: publicClaim({ ...rows[0], created_by_name: req.rotUser.name }) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.delete("/claims/:claimId", requireRotPermission("rot.fleet.manage"), async (req, res, next) => {
	try {
		const vehicle = await requireVehicleAccessByClaim(req, res, req.params.claimId);
		if (!vehicle) return;
		await db.query(`delete from rot_vehicle_claims where id = $1`, [req.params.claimId]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

// ---------------------------------------------------------------------
// Manutencoes (mantido, agora com KM obrigatorio — secoes 15-19)
// ---------------------------------------------------------------------

router.post("/:id/maintenances", requireRotPermission(["rot.fleet.maintenance.manage", "rot.fleet.manage"]), async (req, res, next) => {
	let client;
	try {
		const { workshopId, date, time } = req.body || {};
		const km = Number(req.body?.km);
		const reason = nullableText(req.body?.reason, 500);
		const maintenanceType = nullableText(req.body?.maintenanceType, 100);
		const jumpConfirmed = Boolean(req.body?.jumpConfirmed);
		let nextKm = req.body?.nextKm ? Number(req.body.nextKm) : null;
		const intervalKm = req.body?.intervalKm ? Number(req.body.intervalKm) : null;
		if (!date) fail(400, "Informe a data da manutenção.");
		if (!Number.isFinite(km) || km < 0) fail(400, "Informe a quilometragem atual do veículo.");

		client = await db.connect();
		await client.query("begin");
		const vehicle = await loadVehicleForUpdate(client, req, req.params.id);
		if (LOCKED_STATUSES.has(vehicle.status) || vehicle.status === "EM_MANUTENCAO") fail(409, "Este veículo não pode entrar em manutenção no status atual.");
		if (intervalKm && !nextKm) nextKm = km + intervalKm;

		const id = randomId();
		const { rows } = await client.query(
			`insert into rot_vehicle_maintenances (id, vehicle_id, workshop_id, date, time, km_in, reason, maintenance_type, next_km, interval_km, previous_status)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
			[id, req.params.id, workshopId || null, date, String(time || ""), km, reason, maintenanceType, nextKm, intervalKm, vehicle.status],
		);
		await recordOdometerReading(client, { vehicleId: vehicle.id, km, userId: req.rotUser.id, origin: "ENTRADA_MANUTENCAO", maintenanceId: id, jumpConfirmed });
		await changeVehicleStatus(client, { vehicleId: vehicle.id, toStatus: "EM_MANUTENCAO", reason: reason || "Entrada em manutenção", maintenanceId: id, userId: req.rotUser.id });
		await client.query("commit");
		res.status(201).json({ ok: true, maintenance: publicMaintenance(rows[0]) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/maintenances/:maintenanceId/finish", requireRotPermission(["rot.fleet.maintenance.manage", "rot.fleet.manage"]), async (req, res, next) => {
	let client;
	try {
		const km = Number(req.body?.km);
		const resolutionNote = nullableText(req.body?.resolutionNote, 1000);
		const jumpConfirmed = Boolean(req.body?.jumpConfirmed);
		if (!Number.isFinite(km) || km < 0) fail(400, "Informe a quilometragem de saída do veículo.");

		client = await db.connect();
		await client.query("begin");
		const { rows: maintRows } = await client.query("select * from rot_vehicle_maintenances where id = $1 for update", [req.params.maintenanceId]);
		const maintenance = maintRows[0];
		if (!maintenance) fail(404, "Manutenção não encontrada.");
		if (maintenance.status === "FINISHED") fail(409, "Esta manutenção já foi concluída.");
		const vehicle = await loadVehicleForUpdate(client, req, maintenance.vehicle_id);

		await recordOdometerReading(client, { vehicleId: vehicle.id, km, userId: req.rotUser.id, origin: "RETORNO_MANUTENCAO", maintenanceId: maintenance.id, jumpConfirmed });
		const { rows } = await client.query(
			`update rot_vehicle_maintenances set status='FINISHED', resolution_note=$2, finished_at=now(), km_out=$3, released_by=$4 where id=$1 returning *`,
			[req.params.maintenanceId, resolutionNote || "", km, req.rotUser.id],
		);
		const restoreStatus = maintenance.previous_status || (vehicle.responsible_id ? "EM_OPERACAO" : "DISPONIVEL_BASE");
		await changeVehicleStatus(client, { vehicleId: vehicle.id, toStatus: restoreStatus, reason: "Retorno de manutenção", maintenanceId: maintenance.id, userId: req.rotUser.id });
		await client.query("commit");
		res.json({ ok: true, maintenance: publicMaintenance(rows[0]) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.delete("/maintenances/:maintenanceId", requireRotPermission("rot.fleet.manage"), async (req, res, next) => {
	try {
		const vehicle = await requireVehicleAccessByMaintenance(req, res, req.params.maintenanceId);
		if (!vehicle) return;
		await db.query(`delete from rot_vehicle_maintenances where id = $1`, [req.params.maintenanceId]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

// ---------------------------------------------------------------------
// Oficinas (mantido)
// ---------------------------------------------------------------------

router.post("/workshops", requireRotPermission("rot.fleet.manage"), async (req, res, next) => {
	try {
		const { name, address, phone, regionalId } = req.body || {};
		if (!name?.trim()) fail(400, "Informe o nome da oficina.");
		const id = randomId();
		const { rows } = await db.query(
			`insert into rot_workshops (id, name, address, phone, regional_id) values ($1, $2, $3, $4, $5) returning *`,
			[id, name.trim(), String(address || ""), String(phone || ""), regionalId || null],
		);
		res.status(201).json({ ok: true, workshop: publicWorkshop(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.put("/workshops/:workshopId", requireRotPermission("rot.fleet.manage"), async (req, res, next) => {
	try {
		const { name, address, phone, regionalId } = req.body || {};
		const { rows } = await db.query(
			`update rot_workshops set name = coalesce($2, name), address = coalesce($3, address), phone = coalesce($4, phone), regional_id = coalesce($5, regional_id) where id = $1 returning *`,
			[req.params.workshopId, name?.trim() || null, address ?? null, phone ?? null, regionalId || null],
		);
		if (!rows[0]) fail(404, "Oficina não encontrada.");
		res.json({ ok: true, workshop: publicWorkshop(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.delete("/workshops/:workshopId", requireRotPermission("rot.fleet.manage"), async (req, res, next) => {
	try {
		await db.query(`delete from rot_workshops where id = $1`, [req.params.workshopId]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

// ---------------------------------------------------------------------
// Documentos (secao 23; arquivo via /admin/attachments entityType
// VEHICLE_DOCUMENT, alerta de vencimento fica pra proxima fase)
// ---------------------------------------------------------------------

router.get("/:id/documents", async (req, res, next) => {
	try {
		const vehicle = await requireVehicleAccess(req, res, req.params.id);
		if (!vehicle) return;
		const { rows } = await db.query(`select * from rot_vehicle_documents where vehicle_id = $1 order by expires_at nulls last, created_at desc`, [req.params.id]);
		res.json({ ok: true, items: rows.map(publicDocument) });
	} catch (error) {
		next(error);
	}
});

router.post("/:id/documents", requireRotPermission(["rot.fleet.documents.manage", "rot.fleet.manage"]), async (req, res, next) => {
	try {
		const vehicle = await requireVehicleAccess(req, res, req.params.id);
		if (!vehicle) return;
		const type = nullableText(req.body?.type, 100);
		if (!type) fail(400, "Informe o tipo do documento.");
		const id = randomId("doc");
		const { rows } = await db.query(
			`insert into rot_vehicle_documents (id, vehicle_id, type, number, issued_at, expires_at, note, created_by)
			 values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
			[id, req.params.id, type, nullableText(req.body?.number, 100), req.body?.issuedAt || null, req.body?.expiresAt || null, nullableText(req.body?.note, 1000), req.rotUser.id],
		);
		await auditLog(req, { action: "create", entity: "rot_vehicle_documents", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, item: publicDocument(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.patch("/documents/:documentId", requireRotPermission(["rot.fleet.documents.manage", "rot.fleet.manage"]), async (req, res, next) => {
	try {
		const { rows: before } = await db.query("select * from rot_vehicle_documents where id = $1", [req.params.documentId]);
		if (!before[0]) fail(404, "Documento não encontrado.");
		const vehicle = await requireVehicleAccess(req, res, before[0].vehicle_id);
		if (!vehicle) return;
		const { rows } = await db.query(
			`update rot_vehicle_documents set type=coalesce($2,type), number=$3, issued_at=$4, expires_at=$5, note=$6 where id=$1 returning *`,
			[req.params.documentId, nullableText(req.body?.type, 100), nullableText(req.body?.number, 100), req.body?.issuedAt || null, req.body?.expiresAt || null, nullableText(req.body?.note, 1000)],
		);
		await auditLog(req, { action: "update", entity: "rot_vehicle_documents", entityId: req.params.documentId, before: before[0], after: rows[0] });
		res.json({ ok: true, item: publicDocument(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.delete("/documents/:documentId", requireRotPermission(["rot.fleet.documents.manage", "rot.fleet.manage"]), async (req, res, next) => {
	try {
		const { rows: before } = await db.query("select * from rot_vehicle_documents where id = $1", [req.params.documentId]);
		if (!before[0]) fail(404, "Documento não encontrado.");
		const vehicle = await requireVehicleAccess(req, res, before[0].vehicle_id);
		if (!vehicle) return;
		await db.query("delete from rot_vehicle_documents where id = $1", [req.params.documentId]);
		await auditLog(req, { action: "delete", entity: "rot_vehicle_documents", entityId: req.params.documentId, before: before[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

// ---------------------------------------------------------------------
// Ficha 360 (secoes 25-30): agrega tudo que o veiculo ja acumulou. O
// frontend monta a Timeline combinando statusHistory + movements +
// maintenances + claims (todas ja retornadas aqui).
// ---------------------------------------------------------------------

router.get("/:id/detail", async (req, res, next) => {
	try {
		const vehicle = await requireVehicleAccess(req, res, req.params.id);
		if (!vehicle) return;

		const [responsibleRow, custodyResult, odometerResult, movementsResult, maintenancesResult, claimsResult, documentsResult, statusHistoryResult, workshopsResult] = await Promise.all([
			vehicle.responsible_id ? db.query("select name from rot_users where id = $1", [vehicle.responsible_id]) : { rows: [] },
			db.query(`select c.*, u.name as responsible_name from rot_vehicle_custody c left join rot_users u on u.id = c.responsible_id where c.vehicle_id = $1 order by c.started_at desc`, [req.params.id]),
			db.query(`select r.*, u.name as recorded_by_name from rot_vehicle_odometer_readings r left join rot_users u on u.id = r.recorded_by where r.vehicle_id = $1 order by r.recorded_at desc limit 200`, [req.params.id]),
			db.query(
				`select m.*, uf.name as from_responsible_name, ut.name as to_responsible_name, uc.name as created_by_name
				 from rot_vehicle_movements m
				 left join rot_users uf on uf.id = m.from_responsible_id
				 left join rot_users ut on ut.id = m.to_responsible_id
				 left join rot_users uc on uc.id = m.created_by
				 where m.vehicle_id = $1 order by m.created_at desc`,
				[req.params.id],
			),
			db.query(`select * from rot_vehicle_maintenances where vehicle_id = $1 order by date desc`, [req.params.id]),
			db.query(`select c.*, u.name as created_by_name from rot_vehicle_claims c left join rot_users u on u.id = c.created_by where c.vehicle_id = $1 order by c.date desc`, [req.params.id]),
			db.query(`select * from rot_vehicle_documents where vehicle_id = $1 order by expires_at nulls last, created_at desc`, [req.params.id]),
			db.query(`select h.*, u.name as changed_by_name from rot_vehicle_status_history h left join rot_users u on u.id = h.changed_by where h.vehicle_id = $1 order by h.changed_at desc`, [req.params.id]),
			db.query(`select * from rot_workshops order by name`),
		]);

		res.json({
			ok: true,
			vehicle: { ...publicVehicle(vehicle), responsibleName: responsibleRow.rows[0]?.name || null },
			custody: custodyResult.rows.map(publicCustody),
			odometerReadings: odometerResult.rows.map(publicOdometerReading),
			movements: movementsResult.rows.map(publicMovement),
			maintenances: maintenancesResult.rows.map(publicMaintenance),
			claims: claimsResult.rows.map(publicClaim),
			documents: documentsResult.rows.map(publicDocument),
			statusHistory: statusHistoryResult.rows.map(publicStatusHistory),
			workshops: workshopsResult.rows.map(publicWorkshop),
		});
	} catch (error) {
		next(error);
	}
});

module.exports = router;
