const express = require("express");
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, requireRotPermission, scopeRegionalFilter, userHasRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { auditLog } = require("../audit/auditLog");

// Frota — fiel a rot/src/pages/FleetPage.tsx: veiculos com responsavel
// (tecnico), sinistros e manutencoes (agenda em oficina + historico
// finalizado). Escopado por regional via scopeRegionalFilter.
const router = express.Router();
router.use(requireRotAuth);

const VALID_OPERATION_SCOPES = new Set(["ROT", "FIELD", "DELIVERY"]);

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

function publicVehicle(row) {
	return {
		id: row.id,
		model: row.model,
		plate: row.plate,
		manufacturer: row.manufacturer,
		regionalId: row.regional_id,
		responsibleId: row.responsible_id,
		operationScope: normalizeOperationScope(row.operation_scope),
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
	};
}

function publicWorkshop(row) {
	return { id: row.id, name: row.name, address: row.address, phone: row.phone, regionalId: row.regional_id };
}

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

router.post("/", requireRotPermission("rot.fleet.manage"), async (req, res, next) => {
	try {
		const { model, plate, manufacturer, regionalId } = req.body || {};
		const operationScope = normalizeOperationScope(req.body?.operationScope);
		if (!model?.trim() || !plate?.trim()) {
			res.status(400).json({ ok: false, error: "Informe modelo e placa do veículo." });
			return;
		}
		if (!canAccessOperation(req, operationScope)) {
			res.status(403).json({ ok: false, error: "Você não pode cadastrar veículo para essa operação." });
			return;
		}
		const id = randomId();
		const { rows } = await db.query(
			`insert into rot_vehicles (id, model, plate, manufacturer, regional_id, operation_scope) values ($1, $2, $3, $4, $5, $6) returning *`,
			[id, model.trim(), plate.trim().toUpperCase(), String(manufacturer || ""), regionalId || req.rotUser.regional_id || null, operationScope],
		);
		await auditLog(req, { action: "create", entity: "rot_vehicles", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, vehicle: publicVehicle(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.put("/:id", requireRotPermission("rot.fleet.manage"), async (req, res, next) => {
	try {
		const { model, plate, manufacturer, regionalId } = req.body || {};
		const { rows: before } = await db.query(`select * from rot_vehicles where id = $1`, [req.params.id]);
		if (!before[0]) {
			res.status(404).json({ ok: false, error: "Veículo não encontrado." });
			return;
		}
		if (!canAccessOperation(req, before[0].operation_scope)) {
			res.status(403).json({ ok: false, error: "Você não pode alterar veículo de outra operação." });
			return;
		}
		const operationScope = req.body?.operationScope !== undefined ? normalizeOperationScope(req.body.operationScope) : before[0].operation_scope;
		if (!canAccessOperation(req, operationScope)) {
			res.status(403).json({ ok: false, error: "Você não pode mover veículo para essa operação." });
			return;
		}
		const { rows } = await db.query(
			`update rot_vehicles set model = coalesce($2, model), plate = coalesce($3, plate), manufacturer = coalesce($4, manufacturer), regional_id = coalesce($5, regional_id), operation_scope = $6 where id = $1 returning *`,
			[req.params.id, model?.trim() || null, plate?.trim()?.toUpperCase() || null, manufacturer ?? null, regionalId || null, operationScope],
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
		if (before[0] && !canAccessOperation(req, before[0].operation_scope)) {
			res.status(403).json({ ok: false, error: "Você não pode excluir veículo de outra operação." });
			return;
		}
		const { rows } = await db.query(`delete from rot_vehicles where id = $1 returning *`, [req.params.id]);
		if (rows[0]) await auditLog(req, { action: "delete", entity: "rot_vehicles", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.put("/:id/responsible", requireRotPermission("rot.fleet.manage"), async (req, res, next) => {
	try {
		const { responsibleId } = req.body || {};
		const { rows: before } = await db.query(`select * from rot_vehicles where id = $1`, [req.params.id]);
		if (before[0] && !canAccessOperation(req, before[0].operation_scope)) {
			res.status(403).json({ ok: false, error: "Você não pode atribuir veículo de outra operação." });
			return;
		}
		if (responsibleId && before[0]) {
			const { rows: responsibleRows } = await db.query(
				`select coalesce(array_remove(array_agg(operation_type order by operation_type), null), array[]::text[]) as operation_scopes
				   from rot_user_operation_scopes
				  where user_id = $1`,
				[responsibleId],
			);
			if (!normalizeOperationScopes(responsibleRows[0]?.operation_scopes).includes(normalizeOperationScope(before[0].operation_scope))) {
				res.status(400).json({ ok: false, error: "O responsável selecionado não pertence à operação deste veículo." });
				return;
			}
		}
		const { rows } = await db.query(`update rot_vehicles set responsible_id = $2 where id = $1 returning *`, [req.params.id, responsibleId || null]);
		if (!rows[0]) {
			res.status(404).json({ ok: false, error: "Veículo não encontrado." });
			return;
		}
		res.json({ ok: true, vehicle: publicVehicle(rows[0]) });
	} catch (error) {
		next(error);
	}
});

// --- Sinistros ---

router.post("/:id/claims", requireRotPermission("rot.fleet.manage"), async (req, res, next) => {
	try {
		const { description, date } = req.body || {};
		const vehicle = await requireVehicleAccess(req, res, req.params.id);
		if (!vehicle) return;
		if (!description?.trim()) {
			res.status(400).json({ ok: false, error: "Descreva a ocorrência." });
			return;
		}
		const id = randomId();
		const { rows } = await db.query(
			`insert into rot_vehicle_claims (id, vehicle_id, description, date, created_by) values ($1, $2, $3, coalesce($4, now()), $5) returning *`,
			[id, req.params.id, description.trim(), date || null, req.rotUser.id],
		);
		res.status(201).json({ ok: true, claim: publicClaim({ ...rows[0], created_by_name: req.rotUser.name }) });
	} catch (error) {
		next(error);
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

// --- Manutencoes ---

router.post("/:id/maintenances", requireRotPermission("rot.fleet.manage"), async (req, res, next) => {
	try {
		const { workshopId, date, time } = req.body || {};
		const vehicle = await requireVehicleAccess(req, res, req.params.id);
		if (!vehicle) return;
		if (!date) {
			res.status(400).json({ ok: false, error: "Informe a data da manutenção." });
			return;
		}
		const id = randomId();
		const { rows } = await db.query(
			`insert into rot_vehicle_maintenances (id, vehicle_id, workshop_id, date, time) values ($1, $2, $3, $4, $5) returning *`,
			[id, req.params.id, workshopId || null, date, String(time || "")],
		);
		res.status(201).json({ ok: true, maintenance: publicMaintenance(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.post("/maintenances/:maintenanceId/finish", requireRotPermission("rot.fleet.manage"), async (req, res, next) => {
	try {
		const vehicle = await requireVehicleAccessByMaintenance(req, res, req.params.maintenanceId);
		if (!vehicle) return;
		const { resolutionNote } = req.body || {};
		const { rows } = await db.query(
			`update rot_vehicle_maintenances set status = 'FINISHED', resolution_note = $2, finished_at = now() where id = $1 returning *`,
			[req.params.maintenanceId, String(resolutionNote || "")],
		);
		if (!rows[0]) {
			res.status(404).json({ ok: false, error: "Manutenção não encontrada." });
			return;
		}
		res.json({ ok: true, maintenance: publicMaintenance(rows[0]) });
	} catch (error) {
		next(error);
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

// --- Oficinas ---

router.post("/workshops", requireRotPermission("rot.fleet.manage"), async (req, res, next) => {
	try {
		const { name, address, phone, regionalId } = req.body || {};
		if (!name?.trim()) {
			res.status(400).json({ ok: false, error: "Informe o nome da oficina." });
			return;
		}
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
		if (!rows[0]) {
			res.status(404).json({ ok: false, error: "Oficina não encontrada." });
			return;
		}
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

module.exports = router;
