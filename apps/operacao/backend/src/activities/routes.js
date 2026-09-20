const express = require("express");
const { READ_PERMISSIONS } = require("../auth/readPermissions");
const readGuard = require("../auth/middleware").requireRotPermission;
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, requireRotPermission, scopeRegionalFilter } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { auditLog } = require("../audit/auditLog");

// Atividades — fiel ao ActivityDocument do legado: visita/atendimento
// comercial agendado, com tecnico responsavel. Escopado por regional.
const router = express.Router();
router.use(requireRotAuth);

function publicActivity(row) {
	return {
		id: row.id,
		regionalId: row.regional_id,
		cityId: row.city_id,
		clientName: row.client_name,
		companyContact: row.company_contact,
		date: row.date,
		time: row.time,
		locationUrl: row.location_url,
		priority: row.priority,
		serviceDescription: row.service_description,
		status: row.status,
		requestedBy: row.requested_by,
		userId: row.user_id,
		userName: row.user_name || null,
		createdBy: row.created_by,
		createdAt: row.created_at,
	};
}

router.get("/", readGuard(READ_PERMISSIONS.activities), noStore, async (req, res, next) => {
	try {
		const regionalScope = scopeRegionalFilter(req);
		const params = regionalScope ? [regionalScope] : [];
		const [{ rows }, { rows: users }] = await Promise.all([
			db.query(
				regionalScope
					? `select a.*, u.name as user_name from rot_activities a left join rot_users u on u.id = a.user_id where a.regional_id = $1 order by a.date desc`
					: `select a.*, u.name as user_name from rot_activities a left join rot_users u on u.id = a.user_id order by a.date desc`,
				params,
			),
			db.query(
				regionalScope ? `select id, name, regional_id from rot_users where regional_id = $1 and status = 'ativo' order by name` : `select id, name, regional_id from rot_users where status = 'ativo' order by name`,
				params,
			),
		]);
		res.json({ ok: true, items: rows.map(publicActivity), technicians: users.map((u) => ({ id: u.id, name: u.name, regionalId: u.regional_id })) });
	} catch (error) {
		next(error);
	}
});

router.post("/", requireRotPermission("rot.activities.manage"), async (req, res, next) => {
	try {
		const { regionalId, cityId, clientName, companyContact, date, time, locationUrl, priority, serviceDescription, requestedBy, userId } = req.body || {};
		if (!regionalId || !clientName?.trim() || !date) {
			res.status(400).json({ ok: false, error: "Informe regional, cliente e data." });
			return;
		}
		const id = randomId();
		const { rows } = await db.query(
			`insert into rot_activities (id, regional_id, city_id, client_name, company_contact, date, time, location_url, priority, service_description, requested_by, user_id, created_by)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
			[
				id,
				regionalId,
				cityId || null,
				clientName.trim(),
				String(companyContact || ""),
				date,
				String(time || ""),
				String(locationUrl || ""),
				["baixa", "normal", "alta"].includes(priority) ? priority : "normal",
				String(serviceDescription || ""),
				String(requestedBy || ""),
				userId || null,
				req.rotUser.id,
			],
		);
		await auditLog(req, { action: "create", entity: "rot_activities", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, activity: publicActivity(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.put("/:id", requireRotPermission("rot.activities.manage"), async (req, res, next) => {
	try {
		const { clientName, companyContact, date, time, locationUrl, priority, serviceDescription, requestedBy, userId, status, cityId } = req.body || {};
		const { rows: before } = await db.query(`select * from rot_activities where id = $1`, [req.params.id]);
		if (!before[0]) {
			res.status(404).json({ ok: false, error: "Atividade não encontrada." });
			return;
		}
		const { rows } = await db.query(
			`update rot_activities set
				client_name = coalesce($2, client_name), company_contact = coalesce($3, company_contact),
				date = coalesce($4, date), time = coalesce($5, time), location_url = coalesce($6, location_url),
				priority = coalesce($7, priority), service_description = coalesce($8, service_description),
				requested_by = coalesce($9, requested_by), user_id = $10, status = coalesce($11, status), city_id = $12
			 where id = $1 returning *`,
			[
				req.params.id,
				clientName?.trim() || null,
				companyContact ?? null,
				date || null,
				time ?? null,
				locationUrl ?? null,
				["baixa", "normal", "alta"].includes(priority) ? priority : null,
				serviceDescription ?? null,
				requestedBy ?? null,
				userId === undefined ? before[0].user_id : userId || null,
				["pendente", "concluida", "cancelada"].includes(status) ? status : null,
				cityId === undefined ? before[0].city_id : cityId || null,
			],
		);
		await auditLog(req, { action: "update", entity: "rot_activities", entityId: req.params.id, before: before[0], after: rows[0] });
		res.json({ ok: true, activity: publicActivity(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", requireRotPermission("rot.activities.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`delete from rot_activities where id = $1 returning *`, [req.params.id]);
		if (rows[0]) await auditLog(req, { action: "delete", entity: "rot_activities", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
