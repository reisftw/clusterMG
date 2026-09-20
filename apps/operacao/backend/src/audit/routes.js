const express = require("express");
const db = require("../db");
const { requireRotAuth, requireRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");

// Leitura dos logs de auditoria — o registro em si ja acontece desde o
// Modulo 1 (auditLog() em users/routes.js e roles/routes.js), so faltava
// uma tela pra ver. Somente leitura, filtros basicos + paginacao.
const router = express.Router();
router.use(requireRotAuth);

function publicLog(row) {
	return {
		id: String(row.id),
		userId: row.user_id,
		userName: row.user_name,
		action: row.action,
		entity: row.entity,
		entityId: row.entity_id,
		beforeData: row.before_data,
		afterData: row.after_data,
		ipAddress: row.ip_address,
		createdAt: row.created_at,
	};
}

router.get("/", requireRotPermission("rot.logs.view"), noStore, async (req, res, next) => {
	try {
		const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
		const offset = Math.max(0, Number(req.query.offset) || 0);
		const params = [];
		const conditions = [];

		if (req.query.entity) {
			params.push(String(req.query.entity));
			conditions.push(`entity = $${params.length}`);
		}
		if (req.query.action) {
			params.push(String(req.query.action));
			conditions.push(`action = $${params.length}`);
		}
		if (req.query.q) {
			params.push(`%${String(req.query.q)}%`);
			conditions.push(`(user_name ilike $${params.length} or entity_id ilike $${params.length})`);
		}

		const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
		const { rows: totalRows } = await db.query(`select count(*)::int as total from rot_audit_logs ${where}`, params);
		params.push(limit, offset);
		const { rows } = await db.query(
			`select * from rot_audit_logs ${where} order by created_at desc limit $${params.length - 1} offset $${params.length}`,
			params,
		);
		res.json({ ok: true, items: rows.map(publicLog), total: totalRows[0]?.total || 0 });
	} catch (error) {
		next(error);
	}
});

router.get("/entities", requireRotPermission("rot.logs.view"), noStore, async (req, res, next) => {
	try {
		const { rows } = await db.query(`select distinct entity from rot_audit_logs order by entity`);
		res.json({ ok: true, items: rows.map((row) => row.entity) });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
