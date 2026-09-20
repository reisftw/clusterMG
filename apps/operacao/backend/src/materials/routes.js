const express = require("express");
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, requireRotPermission, scopeRegionalFilter } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { auditLog } = require("../audit/auditLog");

// Materiais/Insumos — fiel a rot/src/pages/MaterialsPage.tsx: catalogo +
// remessas de material por tecnico (aceite com assinatura) + vistorias
// (checklist) de estoque. Escopado por regional via join com rot_users.
const router = express.Router();
router.use(requireRotAuth);

function publicCatalogItem(row) {
	return { id: row.id, name: row.name, unit: row.unit, active: row.active, createdAt: row.created_at, updatedAt: row.updated_at };
}

function publicSupply(row) {
	return {
		id: row.id,
		techId: row.tech_id,
		itemName: row.item_name,
		quantity: Number(row.quantity),
		status: row.status,
		historyId: row.history_id,
		sentBy: row.sent_by,
		senderName: row.sender_name || null,
		acceptedAt: row.accepted_at,
		signature: row.signature,
		createdAt: row.created_at,
	};
}

function publicHistory(row) {
	return {
		id: row.id,
		techId: row.tech_id,
		techName: row.tech_name || null,
		itemName: row.item_name,
		quantity: Number(row.quantity),
		status: row.status,
		sentBy: row.sent_by,
		sentByName: row.sent_by_name || null,
		sentAt: row.sent_at,
		acceptedAt: row.accepted_at,
		signature: row.signature,
	};
}

function publicChecklist(row) {
	return {
		id: row.id,
		techId: row.tech_id,
		techName: row.tech_name || null,
		inspectorId: row.inspector_id,
		inspectorName: row.inspector_name || null,
		responses: row.responses || {},
		status: row.status,
		signature: row.signature,
		dateAccepted: row.date_accepted,
		createdAt: row.created_at,
		date: row.created_at,
	};
}

// --- Catalogo ---

router.get("/catalog", noStore, async (req, res, next) => {
	try {
		const { rows } = await db.query(`select * from rot_material_catalog order by name`);
		res.json({ ok: true, items: rows.map(publicCatalogItem) });
	} catch (error) {
		next(error);
	}
});

router.post("/catalog", requireRotPermission("rot.materials.manage"), async (req, res, next) => {
	try {
		const { name, unit } = req.body || {};
		if (!name?.trim()) {
			res.status(400).json({ ok: false, error: "Informe o nome do material." });
			return;
		}
		const id = randomId();
		const { rows } = await db.query(`insert into rot_material_catalog (id, name, unit) values ($1, $2, $3) returning *`, [id, name.trim(), String(unit || "un")]);
		await auditLog(req, { action: "create", entity: "rot_material_catalog", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, item: publicCatalogItem(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.put("/catalog/:id", requireRotPermission("rot.materials.manage"), async (req, res, next) => {
	try {
		const { name, unit, active } = req.body || {};
		const { rows } = await db.query(
			`update rot_material_catalog set name = coalesce($2, name), unit = coalesce($3, unit), active = coalesce($4, active) where id = $1 returning *`,
			[req.params.id, name?.trim() || null, unit || null, active === undefined ? null : Boolean(active)],
		);
		if (!rows[0]) {
			res.status(404).json({ ok: false, error: "Item de catálogo não encontrado." });
			return;
		}
		res.json({ ok: true, item: publicCatalogItem(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.delete("/catalog/:id", requireRotPermission("rot.materials.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`delete from rot_material_catalog where id = $1 returning *`, [req.params.id]);
		if (rows[0]) await auditLog(req, { action: "delete", entity: "rot_material_catalog", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

// --- Tecnicos visiveis (mesmo escopo regional) + estoque/historico/vistorias ---

router.get("/", noStore, async (req, res, next) => {
	try {
		const regionalScope = scopeRegionalFilter(req);
		const usersQuery = regionalScope
			? `select id, name, username, avatar_url, role_id, regional_id from rot_users where regional_id = $1 and status = 'ativo' order by name`
			: `select id, name, username, avatar_url, role_id, regional_id from rot_users where status = 'ativo' order by name`;
		const { rows: users } = await db.query(usersQuery, regionalScope ? [regionalScope] : []);
		const techIds = users.map((u) => u.id);

		const [{ rows: supplies }, { rows: checklists }] = techIds.length
			? await Promise.all([
					db.query(`select * from rot_tech_supplies where tech_id = any($1::text[]) order by created_at desc`, [techIds]),
					db.query(
						`select c.*, u.name as tech_name, i.name as inspector_name from rot_inventory_checklists c
						 left join rot_users u on u.id = c.tech_id
						 left join rot_users i on i.id = c.inspector_id
						 where c.tech_id = any($1::text[]) order by c.created_at desc`,
						[techIds],
					),
				])
			: [{ rows: [] }, { rows: [] }];

		res.json({
			ok: true,
			technicians: users.map((u) => ({ id: u.id, name: u.name, username: u.username, avatarUrl: u.avatar_url || "", role: u.role_id, regionalId: u.regional_id })),
			supplies: supplies.map(publicSupply),
			checklists: checklists.map(publicChecklist),
		});
	} catch (error) {
		next(error);
	}
});

router.get("/history/:techId", noStore, async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select h.*, s.name as sent_by_name from rot_supply_history h
			 left join rot_users s on s.id = h.sent_by
			 where h.tech_id = $1 order by h.sent_at desc`,
			[req.params.techId],
		);
		res.json({ ok: true, items: rows.map(publicHistory) });
	} catch (error) {
		next(error);
	}
});

router.post("/send", requireRotPermission("rot.materials.manage"), async (req, res, next) => {
	try {
		const { techId, itemName, quantity } = req.body || {};
		if (!techId || !itemName?.trim() || !quantity) {
			res.status(400).json({ ok: false, error: "Informe técnico, item e quantidade." });
			return;
		}
		const historyId = randomId();
		const supplyId = randomId();
		await db.query(
			`insert into rot_supply_history (id, tech_id, item_name, quantity, status, sent_by) values ($1, $2, $3, $4, 'PENDING', $5)`,
			[historyId, techId, itemName.trim(), Number(quantity), req.rotUser.id],
		);
		const { rows } = await db.query(
			`insert into rot_tech_supplies (id, tech_id, item_name, quantity, status, history_id, sent_by) values ($1, $2, $3, $4, 'PENDING', $5, $6) returning *`,
			[supplyId, techId, itemName.trim(), Number(quantity), historyId, req.rotUser.id],
		);
		await auditLog(req, { action: "create", entity: "rot_tech_supplies", entityId: supplyId, after: rows[0] });
		res.status(201).json({ ok: true, supply: publicSupply(rows[0]) });
	} catch (error) {
		next(error);
	}
});

// Aceite (assinatura) — so o proprio tecnico dono do item.
router.post("/:id/accept", async (req, res, next) => {
	try {
		const { signature } = req.body || {};
		const { rows } = await db.query(
			`update rot_tech_supplies set status = 'ACCEPTED', accepted_at = now(), signature = $2
			 where id = $1 and tech_id = $3 and status = 'PENDING' returning *`,
			[req.params.id, signature || null, req.rotUser.id],
		);
		if (!rows[0]) {
			res.status(409).json({ ok: false, error: "Este material não está pendente para você." });
			return;
		}
		if (rows[0].history_id) {
			await db.query(`update rot_supply_history set status = 'ACCEPTED', accepted_at = now(), signature = $2 where id = $1`, [rows[0].history_id, signature || null]);
		}
		res.json({ ok: true, supply: publicSupply(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", requireRotPermission("rot.materials.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`delete from rot_tech_supplies where id = $1 returning *`, [req.params.id]);
		if (rows[0]) await auditLog(req, { action: "delete", entity: "rot_tech_supplies", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.delete("/history/:id", requireRotPermission("rot.materials.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`delete from rot_supply_history where id = $1 returning *`, [req.params.id]);
		if (rows[0]) await auditLog(req, { action: "delete", entity: "rot_supply_history", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

// --- Vistorias (checklists) ---

router.post("/checklists", requireRotPermission("rot.materials.manage"), async (req, res, next) => {
	try {
		const { techId, responses } = req.body || {};
		if (!techId) {
			res.status(400).json({ ok: false, error: "Selecione o técnico." });
			return;
		}
		const id = randomId();
		const { rows } = await db.query(
			`insert into rot_inventory_checklists (id, tech_id, inspector_id, responses) values ($1, $2, $3, $4::jsonb) returning *`,
			[id, techId, req.rotUser.id, JSON.stringify(responses || {})],
		);
		await auditLog(req, { action: "create", entity: "rot_inventory_checklists", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, checklist: publicChecklist(rows[0]) });
	} catch (error) {
		next(error);
	}
});

// Aprovacao (assinatura) — so o proprio tecnico da vistoria.
router.post("/checklists/:id/approve", async (req, res, next) => {
	try {
		const { signature } = req.body || {};
		const { rows } = await db.query(
			`update rot_inventory_checklists set status = 'APPROVED', signature = $2, date_accepted = now()
			 where id = $1 and tech_id = $3 returning *`,
			[req.params.id, signature || null, req.rotUser.id],
		);
		if (!rows[0]) {
			res.status(409).json({ ok: false, error: "Vistoria não encontrada para este técnico." });
			return;
		}
		res.json({ ok: true, checklist: publicChecklist(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.delete("/checklists/:id", requireRotPermission("rot.materials.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`delete from rot_inventory_checklists where id = $1 returning *`, [req.params.id]);
		if (rows[0]) await auditLog(req, { action: "delete", entity: "rot_inventory_checklists", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
