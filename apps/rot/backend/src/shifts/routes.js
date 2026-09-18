const express = require("express");
const { READ_PERMISSIONS } = require("../auth/readPermissions");
const readGuard = require("../auth/middleware").requireRotPermission;
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, requireRotPermission, scopeRegionalFilter } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { auditLog } = require("../audit/auditLog");

// Turnos/Escala (Plantoes) — fiel a rot/src/pages/GlobalShiftsPage.tsx e
// MyShiftsPage.tsx. Escopado por regional (quem nao e global so ve os
// plantoes da propria regional, mesma regra do resto da Operação).
const router = express.Router();
router.use(requireRotAuth);

function publicShift(row) {
	return {
		id: row.id,
		tipo: row.tipo,
		start: row.start_at,
		end: row.end_at,
		regionalId: row.regional_id,
		teamIds: row.team_ids || [],
		notes: row.notes,
		createdBy: row.created_by,
		createdAt: row.created_at,
	};
}

router.get("/", readGuard(READ_PERMISSIONS.shifts), noStore, async (req, res, next) => {
	try {
		const regionalScope = scopeRegionalFilter(req);
		const params = regionalScope ? [regionalScope] : [];
		const [{ rows }, { rows: users }] = await Promise.all([
			db.query(
				regionalScope ? `select * from rot_shifts where regional_id = $1 order by start_at desc` : `select * from rot_shifts order by start_at desc`,
				params,
			),
			db.query(
				regionalScope ? `select id, name, regional_id from rot_users where regional_id = $1 and status = 'ativo' order by name` : `select id, name, regional_id from rot_users where status = 'ativo' order by name`,
				params,
			),
		]);
		res.json({ ok: true, items: rows.map(publicShift), technicians: users.map((u) => ({ id: u.id, name: u.name, regionalId: u.regional_id })) });
	} catch (error) {
		next(error);
	}
});

router.post("/", requireRotPermission("rot.shifts.manage"), async (req, res, next) => {
	try {
		const { tipo, start, end, regionalId, teamIds, notes } = req.body || {};
		if (!start || !end || !regionalId) {
			res.status(400).json({ ok: false, error: "Informe início, fim e regional do plantão." });
			return;
		}
		const id = randomId();
		const { rows } = await db.query(
			`insert into rot_shifts (id, tipo, start_at, end_at, regional_id, team_ids, notes, created_by)
			 values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
			[id, ["plantao", "escala", "on_call"].includes(tipo) ? tipo : "plantao", start, end, regionalId, Array.isArray(teamIds) ? teamIds : [], String(notes || ""), req.rotUser.id],
		);
		await auditLog(req, { action: "create", entity: "rot_shifts", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, shift: publicShift(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.put("/:id", requireRotPermission("rot.shifts.manage"), async (req, res, next) => {
	try {
		const { tipo, start, end, regionalId, teamIds, notes } = req.body || {};
		const { rows: before } = await db.query(`select * from rot_shifts where id = $1`, [req.params.id]);
		if (!before[0]) {
			res.status(404).json({ ok: false, error: "Plantão não encontrado." });
			return;
		}
		const { rows } = await db.query(
			`update rot_shifts set
				tipo = coalesce($2, tipo), start_at = coalesce($3, start_at), end_at = coalesce($4, end_at),
				regional_id = coalesce($5, regional_id), team_ids = coalesce($6, team_ids), notes = coalesce($7, notes)
			 where id = $1 returning *`,
			[req.params.id, tipo || null, start || null, end || null, regionalId || null, Array.isArray(teamIds) ? teamIds : null, notes === undefined ? null : String(notes)],
		);
		await auditLog(req, { action: "update", entity: "rot_shifts", entityId: req.params.id, before: before[0], after: rows[0] });
		res.json({ ok: true, shift: publicShift(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", requireRotPermission("rot.shifts.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`delete from rot_shifts where id = $1 returning *`, [req.params.id]);
		if (rows[0]) await auditLog(req, { action: "delete", entity: "rot_shifts", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
