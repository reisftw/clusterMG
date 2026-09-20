const express = require("express");
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, requireRotPermission, scopeRegionalFilter } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { auditLog } = require("../audit/auditLog");

// Gestao de chaves (POPs) — fiel a rot/src/pages/KeysPage.tsx. Fluxo:
// available -> (resgate) in_use -> (devolucao) awaiting_approval ->
// (aprovacao do gestor) available | (recusa) volta in_use.
const router = express.Router();
router.use(requireRotAuth);

function publicKey(row, usersById) {
	return {
		id: row.id,
		name: row.name,
		address: row.address,
		regionalId: row.regional_id,
		status: row.status,
		currentUserId: row.current_user_id,
		currentUser: row.current_user_id ? usersById?.get(row.current_user_id) || null : null,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

async function resolveUsersById(rows) {
	const ids = [...new Set(rows.map((row) => row.current_user_id).filter(Boolean))];
	const usersById = new Map();
	if (ids.length) {
		const { rows: users } = await db.query(`select id, name from rot_users where id = any($1::text[])`, [ids]);
		for (const user of users) usersById.set(user.id, user.name);
	}
	return usersById;
}

router.get("/", noStore, async (req, res, next) => {
	try {
		const regionalScope = scopeRegionalFilter(req);
		const { rows } = await db.query(
			regionalScope ? `select * from rot_keys where regional_id = $1 order by name` : `select * from rot_keys order by name`,
			regionalScope ? [regionalScope] : [],
		);
		const usersById = await resolveUsersById(rows);
		res.json({ ok: true, items: rows.map((row) => publicKey(row, usersById)) });
	} catch (error) {
		next(error);
	}
});

router.get("/:id/history", noStore, async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select e.*, u.name as user_name from rot_key_events e
			 left join rot_users u on u.id = e.user_id
			 where e.key_id = $1 order by e.created_at desc limit 100`,
			[req.params.id],
		);
		res.json({
			ok: true,
			items: rows.map((row) => ({ id: row.id, action: row.action, userId: row.user_id, userName: row.user_name, createdAt: row.created_at })),
		});
	} catch (error) {
		next(error);
	}
});

router.post("/", requireRotPermission("rot.keys.manage"), async (req, res, next) => {
	try {
		const { name, address, regionalId } = req.body || {};
		if (!name?.trim()) {
			res.status(400).json({ ok: false, error: "Informe o nome/identificação da chave." });
			return;
		}
		const id = randomId();
		const { rows } = await db.query(
			`insert into rot_keys (id, name, address, regional_id, created_by) values ($1, $2, $3, $4, $5) returning *`,
			[id, name.trim(), String(address || ""), regionalId || req.rotUser.regional_id || null, req.rotUser.id],
		);
		await auditLog(req, { action: "create", entity: "rot_keys", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, key: publicKey(rows[0], new Map()) });
	} catch (error) {
		next(error);
	}
});

router.put("/:id", requireRotPermission("rot.keys.manage"), async (req, res, next) => {
	try {
		const { name, address, regionalId } = req.body || {};
		const { rows: before } = await db.query(`select * from rot_keys where id = $1`, [req.params.id]);
		if (!before[0]) {
			res.status(404).json({ ok: false, error: "Chave não encontrada." });
			return;
		}
		const { rows } = await db.query(
			`update rot_keys set name = coalesce($2, name), address = coalesce($3, address), regional_id = coalesce($4, regional_id) where id = $1 returning *`,
			[req.params.id, name?.trim() || null, address ?? null, regionalId || null],
		);
		await auditLog(req, { action: "update", entity: "rot_keys", entityId: req.params.id, before: before[0], after: rows[0] });
		const usersById = await resolveUsersById(rows);
		res.json({ ok: true, key: publicKey(rows[0], usersById) });
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", requireRotPermission("rot.keys.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`delete from rot_keys where id = $1 returning *`, [req.params.id]);
		if (rows[0]) await auditLog(req, { action: "delete", entity: "rot_keys", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.post("/:id/take", async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`update rot_keys set status = 'in_use', current_user_id = $2 where id = $1 and status = 'available' returning *`,
			[req.params.id, req.rotUser.id],
		);
		if (!rows[0]) {
			res.status(409).json({ ok: false, error: "Esta chave não está disponível para resgate." });
			return;
		}
		await db.query(`insert into rot_key_events (id, key_id, action, user_id) values ($1, $2, 'taken', $3)`, [randomId(), req.params.id, req.rotUser.id]);
		res.json({ ok: true, key: publicKey(rows[0], new Map([[req.rotUser.id, req.rotUser.name]])) });
	} catch (error) {
		next(error);
	}
});

router.post("/:id/return", async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`update rot_keys set status = 'awaiting_approval' where id = $1 and status = 'in_use' and current_user_id = $2 returning *`,
			[req.params.id, req.rotUser.id],
		);
		if (!rows[0]) {
			res.status(409).json({ ok: false, error: "Você não está com esta chave em uso." });
			return;
		}
		await db.query(`insert into rot_key_events (id, key_id, action, user_id) values ($1, $2, 'return_requested', $3)`, [
			randomId(),
			req.params.id,
			req.rotUser.id,
		]);
		const usersById = await resolveUsersById(rows);
		res.json({ ok: true, key: publicKey(rows[0], usersById) });
	} catch (error) {
		next(error);
	}
});

router.post("/:id/approve-return", requireRotPermission("rot.keys.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`update rot_keys set status = 'available', current_user_id = null where id = $1 and status = 'awaiting_approval' returning *`,
			[req.params.id],
		);
		if (!rows[0]) {
			res.status(409).json({ ok: false, error: "Esta chave não está aguardando aprovação de devolução." });
			return;
		}
		await db.query(`insert into rot_key_events (id, key_id, action, user_id) values ($1, $2, 'return_approved', $3)`, [
			randomId(),
			req.params.id,
			req.rotUser.id,
		]);
		res.json({ ok: true, key: publicKey(rows[0], new Map()) });
	} catch (error) {
		next(error);
	}
});

router.post("/:id/reject-return", requireRotPermission("rot.keys.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`update rot_keys set status = 'in_use' where id = $1 and status = 'awaiting_approval' returning *`, [req.params.id]);
		if (!rows[0]) {
			res.status(409).json({ ok: false, error: "Esta chave não está aguardando aprovação de devolução." });
			return;
		}
		await db.query(`insert into rot_key_events (id, key_id, action, user_id) values ($1, $2, 'return_rejected', $3)`, [
			randomId(),
			req.params.id,
			req.rotUser.id,
		]);
		const usersById = await resolveUsersById(rows);
		res.json({ ok: true, key: publicKey(rows[0], usersById) });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
