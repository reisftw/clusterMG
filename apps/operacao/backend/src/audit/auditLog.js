const db = require("../db");

// Extraido do padrao duplicado em users/routes.js e roles/routes.js pra
// nao repetir em cada modulo novo (holidays, notices, keys, etc.).
async function auditLog(req, { action, entity, entityId, before, after }) {
	await db.query(
		`insert into rot_audit_logs (user_id, user_name, action, entity, entity_id, before_data, after_data, ip_address, user_agent)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		[
			req.rotUser?.id || null,
			req.rotUser?.name || null,
			action,
			entity,
			entityId,
			before ? JSON.stringify(before) : null,
			after ? JSON.stringify(after) : null,
			String(req.ip || ""),
			String(req.get?.("user-agent") || "").slice(0, 500),
		],
	);
}

module.exports = { auditLog };
