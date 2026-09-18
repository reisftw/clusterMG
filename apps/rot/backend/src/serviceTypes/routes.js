const express = require("express");
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, requireRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { auditLog } = require("../audit/auditLog");

// Tipos de Servico — catalogo usado pelos Chamados (cada tipo tem uma
// pontuacao, usada no ranking de tecnicos). Global, nao escopado por
// regional (mesmo catalogo pra toda a operacao).
const router = express.Router();
router.use(requireRotAuth);

function publicServiceType(row) {
	return { id: row.id, name: row.name, points: Number(row.points), active: row.active, createdAt: row.created_at, updatedAt: row.updated_at };
}

router.get("/", noStore, async (req, res, next) => {
	try {
		const { rows } = await db.query(`select * from rot_service_types order by name`);
		res.json({ ok: true, items: rows.map(publicServiceType) });
	} catch (error) {
		next(error);
	}
});

router.post("/", requireRotPermission("rot.service_types.manage"), async (req, res, next) => {
	try {
		const { name, points } = req.body || {};
		if (!name?.trim()) {
			res.status(400).json({ ok: false, error: "Informe o nome do tipo de serviço." });
			return;
		}
		const id = randomId();
		const { rows } = await db.query(`insert into rot_service_types (id, name, points) values ($1, $2, $3) returning *`, [id, name.trim(), Number(points) || 0]);
		await auditLog(req, { action: "create", entity: "rot_service_types", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, item: publicServiceType(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.put("/:id", requireRotPermission("rot.service_types.manage"), async (req, res, next) => {
	try {
		const { name, points, active } = req.body || {};
		const { rows } = await db.query(
			`update rot_service_types set name = coalesce($2, name), points = coalesce($3, points), active = coalesce($4, active) where id = $1 returning *`,
			[req.params.id, name?.trim() || null, points === undefined ? null : Number(points), active === undefined ? null : Boolean(active)],
		);
		if (!rows[0]) {
			res.status(404).json({ ok: false, error: "Tipo de serviço não encontrado." });
			return;
		}
		res.json({ ok: true, item: publicServiceType(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", requireRotPermission("rot.service_types.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`delete from rot_service_types where id = $1 returning *`, [req.params.id]);
		if (rows[0]) await auditLog(req, { action: "delete", entity: "rot_service_types", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
