const express = require("express");
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, requireRotPermission, scopeRegionalFilter } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { auditLog } = require("../audit/auditLog");

// Equipamentos — fiel a rot/src/pages/EquipmentsPage.tsx: ativos
// (fusion/outro) com responsavel + historico de auditorias.
const router = express.Router();
router.use(requireRotAuth);

function publicEquipment(row) {
	return {
		id: row.id,
		name: row.name,
		brand: row.brand,
		serialNumber: row.serial_number,
		type: row.type,
		regionalId: row.regional_id,
		techId: row.tech_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function publicAudit(row) {
	return {
		id: row.id,
		equipmentId: row.equipment_id,
		equipmentName: row.equipment_name || null,
		regionalId: row.regional_id,
		auditorId: row.auditor_id,
		auditorName: row.auditor_name || null,
		responses: row.responses || {},
		notes: row.notes,
		date: row.date,
	};
}

router.get("/", noStore, async (req, res, next) => {
	try {
		const regionalScope = scopeRegionalFilter(req);
		const where = regionalScope ? `where regional_id = $1` : "";
		const params = regionalScope ? [regionalScope] : [];
		const [{ rows: equipments }, { rows: audits }, { rows: users }] = await Promise.all([
			db.query(`select * from rot_equipments ${where} order by name`, params),
			db.query(
				`select a.*, e.name as equipment_name, u.name as auditor_name from rot_equipment_audits a
				 left join rot_equipments e on e.id = a.equipment_id
				 left join rot_users u on u.id = a.auditor_id
				 ${regionalScope ? "where a.regional_id = $1" : ""}
				 order by a.date desc limit 200`,
				params,
			),
			db.query(regionalScope ? `select id, name, regional_id from rot_users where regional_id = $1 and status = 'ativo' order by name` : `select id, name, regional_id from rot_users where status = 'ativo' order by name`, params),
		]);
		res.json({
			ok: true,
			items: equipments.map(publicEquipment),
			audits: audits.map(publicAudit),
			technicians: users.map((u) => ({ id: u.id, name: u.name, regionalId: u.regional_id })),
		});
	} catch (error) {
		next(error);
	}
});

router.post("/", requireRotPermission("rot.equipments.manage"), async (req, res, next) => {
	try {
		const { name, brand, serialNumber, type, regionalId, techId } = req.body || {};
		if (!name?.trim()) {
			res.status(400).json({ ok: false, error: "Informe o nome do equipamento." });
			return;
		}
		const id = randomId();
		const { rows } = await db.query(
			`insert into rot_equipments (id, name, brand, serial_number, type, regional_id, tech_id) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
			[id, name.trim(), String(brand || ""), String(serialNumber || ""), type === "FUSION" ? "FUSION" : "OTHER", regionalId || req.rotUser.regional_id || null, techId || null],
		);
		await auditLog(req, { action: "create", entity: "rot_equipments", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, equipment: publicEquipment(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.put("/:id", requireRotPermission("rot.equipments.manage"), async (req, res, next) => {
	try {
		const { name, brand, serialNumber, type, regionalId, techId } = req.body || {};
		const { rows: before } = await db.query(`select * from rot_equipments where id = $1`, [req.params.id]);
		if (!before[0]) {
			res.status(404).json({ ok: false, error: "Equipamento não encontrado." });
			return;
		}
		const { rows } = await db.query(
			`update rot_equipments set
				name = coalesce($2, name), brand = coalesce($3, brand), serial_number = coalesce($4, serial_number),
				type = coalesce($5, type), regional_id = coalesce($6, regional_id), tech_id = $7
			 where id = $1 returning *`,
			[req.params.id, name?.trim() || null, brand ?? null, serialNumber ?? null, type === "FUSION" || type === "OTHER" ? type : null, regionalId || null, techId === undefined ? before[0].tech_id : techId || null],
		);
		await auditLog(req, { action: "update", entity: "rot_equipments", entityId: req.params.id, before: before[0], after: rows[0] });
		res.json({ ok: true, equipment: publicEquipment(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", requireRotPermission("rot.equipments.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`delete from rot_equipments where id = $1 returning *`, [req.params.id]);
		if (rows[0]) await auditLog(req, { action: "delete", entity: "rot_equipments", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.put("/:id/responsible", requireRotPermission("rot.equipments.manage"), async (req, res, next) => {
	try {
		const { techId } = req.body || {};
		const { rows } = await db.query(`update rot_equipments set tech_id = $2 where id = $1 returning *`, [req.params.id, techId || null]);
		if (!rows[0]) {
			res.status(404).json({ ok: false, error: "Equipamento não encontrado." });
			return;
		}
		res.json({ ok: true, equipment: publicEquipment(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.post("/:id/audits", requireRotPermission("rot.equipments.manage"), async (req, res, next) => {
	try {
		const { responses, notes } = req.body || {};
		const { rows: equipmentRows } = await db.query(`select regional_id from rot_equipments where id = $1`, [req.params.id]);
		if (!equipmentRows[0]) {
			res.status(404).json({ ok: false, error: "Equipamento não encontrado." });
			return;
		}
		const id = randomId();
		const { rows } = await db.query(
			`insert into rot_equipment_audits (id, equipment_id, regional_id, auditor_id, responses, notes) values ($1, $2, $3, $4, $5::jsonb, $6) returning *`,
			[id, req.params.id, equipmentRows[0].regional_id, req.rotUser.id, JSON.stringify(responses || {}), String(notes || "")],
		);
		res.status(201).json({ ok: true, audit: publicAudit({ ...rows[0], auditor_name: req.rotUser.name }) });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
