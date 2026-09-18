const express = require("express");
const { READ_PERMISSIONS, absenceReadTypes } = require("../auth/readPermissions");
const readGuard = require("../auth/middleware").requireRotPermission;
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, requireRotPermission, scopeRegionalFilter, userHasRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { auditLog } = require("../audit/auditLog");

// Ausencias/Folgas/Ferias — fiel a rot/src/pages/AbsencesPage.tsx e
// TimeOffPage.tsx, consolidado numa unica tabela (ver 009_rot_absences.sql).
// Dois fluxos: (1) gestor lanca direto, ja aprovado; (2) usuario
// solicita ("Agendar Folga"/"Solicitar Ferias"), fica pendente ate um
// gestor aprovar/recusar.
const router = express.Router();
router.use(requireRotAuth);

function approvalPermissionFor(type) {
	if (type === "folga") return "rot.timeoff.approve";
	if (type === "ferias") return "rot.vacations.approve";
	return "rot.absences.manage";
}

function publicAbsence(row) {
	return {
		id: row.id,
		userId: row.user_id,
		userName: row.user_name || null,
		regionalId: row.regional_id,
		type: row.type,
		startDate: row.start_date,
		endDate: row.end_date,
		reason: row.reason,
		status: row.status,
		requestedBy: row.requested_by,
		approvedBy: row.approved_by,
		approvedAt: row.approved_at,
		createdAt: row.created_at,
	};
}

router.get("/", readGuard(READ_PERMISSIONS.absences), noStore, async (req, res, next) => {
	try {
		const regionalScope = scopeRegionalFilter(req);
		const params = regionalScope ? [regionalScope] : [];
		const [{ rows }, { rows: users }] = await Promise.all([
			db.query(
				regionalScope
					? `select a.*, u.name as user_name from rot_absences a join rot_users u on u.id = a.user_id where a.regional_id = $1 and a.type = any($2::text[]) order by a.start_date desc`
					: `select a.*, u.name as user_name from rot_absences a join rot_users u on u.id = a.user_id where a.type = any($1::text[]) order by a.start_date desc`,
				[...params, absenceReadTypes(req.rotUser)],
			),
			db.query(
				regionalScope ? `select id, name, regional_id from rot_users where regional_id = $1 and status = 'ativo' order by name` : `select id, name, regional_id from rot_users where status = 'ativo' order by name`,
				params,
			),
		]);
		res.json({ ok: true, items: rows.map(publicAbsence), users: users.map((u) => ({ id: u.id, name: u.name, regionalId: u.regional_id })) });
	} catch (error) {
		next(error);
	}
});

// Lancamento direto pelo gestor — ja nasce aprovado (mesmo "Lancar
// Ausencia" do AbsencesPage.tsx, restrito a quem gerencia).
router.post("/", requireRotPermission("rot.absences.manage"), async (req, res, next) => {
	try {
		const { userId, type, startDate, endDate, reason } = req.body || {};
		if (!userId || !["ferias", "folga", "atestado"].includes(type) || !startDate) {
			res.status(400).json({ ok: false, error: "Informe colaborador, tipo e data de início." });
			return;
		}
		const { rows: userRows } = await db.query(`select regional_id from rot_users where id = $1`, [userId]);
		if (!userRows[0]) {
			res.status(404).json({ ok: false, error: "Colaborador não encontrado." });
			return;
		}
		const id = randomId();
		const { rows } = await db.query(
			`insert into rot_absences (id, user_id, regional_id, type, start_date, end_date, reason, status, requested_by, approved_by, approved_at)
			 values ($1, $2, $3, $4, $5, $6, $7, 'aprovado', $8, $8, now()) returning *`,
			[id, userId, userRows[0].regional_id, type, startDate, endDate || startDate, String(reason || ""), req.rotUser.id],
		);
		await auditLog(req, { action: "create", entity: "rot_absences", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, absence: publicAbsence({ ...rows[0], user_name: null }) });
	} catch (error) {
		next(error);
	}
});

// Solicitacao pelo proprio usuario (folga ou ferias) — fica pendente.
router.post("/request", async (req, res, next) => {
	try {
		const { type, startDate, endDate, reason } = req.body || {};
		if (!["ferias", "folga"].includes(type) || !startDate) {
			res.status(400).json({ ok: false, error: "Informe o tipo (folga/férias) e a data." });
			return;
		}
		const id = randomId();
		const { rows } = await db.query(
			`insert into rot_absences (id, user_id, regional_id, type, start_date, end_date, reason, status, requested_by)
			 values ($1, $2, $3, $4, $5, $6, $7, 'pendente', $2) returning *`,
			[id, req.rotUser.id, req.rotUser.regional_id, type, startDate, endDate || startDate, String(reason || "")],
		);
		await auditLog(req, { action: "create", entity: "rot_absences", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, absence: publicAbsence({ ...rows[0], user_name: req.rotUser.name }) });
	} catch (error) {
		next(error);
	}
});

router.post("/:id/decide", async (req, res, next) => {
	try {
		const { approved } = req.body || {};
		const { rows: before } = await db.query(`select * from rot_absences where id = $1`, [req.params.id]);
		if (!before[0]) {
			res.status(404).json({ ok: false, error: "Solicitação não encontrada." });
			return;
		}
		if (!userHasRotPermission(req.rotUser, approvalPermissionFor(before[0].type))) {
			res.status(403).json({ ok: false, error: "Você não tem permissão para decidir sobre esta solicitação." });
			return;
		}
		const { rows } = await db.query(
			`update rot_absences set status = $2, approved_by = $3, approved_at = now() where id = $1 returning *`,
			[req.params.id, approved ? "aprovado" : "recusado", req.rotUser.id],
		);
		await auditLog(req, { action: "update", entity: "rot_absences", entityId: req.params.id, before: before[0], after: rows[0] });
		res.json({ ok: true, absence: publicAbsence(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", requireRotPermission("rot.absences.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`delete from rot_absences where id = $1 returning *`, [req.params.id]);
		if (rows[0]) await auditLog(req, { action: "delete", entity: "rot_absences", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
