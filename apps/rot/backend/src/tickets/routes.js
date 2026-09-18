const express = require("express");
const { READ_PERMISSIONS } = require("../auth/readPermissions");
const readGuard = require("../auth/middleware").requireRotPermission;
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, requireRotPermission, scopeRegionalFilter } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { auditLog } = require("../audit/auditLog");

// Chamados (Tickets/O.S.) — fiel a rot/src/pages/TicketsPage.tsx: numero
// do ticket, tipo de servico (pontuado), cidade, equipe (varios
// tecnicos). Escopado por regional.
const router = express.Router();
router.use(requireRotAuth);

function publicTicket(row) {
	return {
		id: row.id,
		ticketNumber: row.ticket_number,
		date: row.date,
		serviceTypeId: row.service_type_id,
		regionalId: row.regional_id,
		cityId: row.city_id,
		teamIds: row.team_ids || [],
		status: row.status,
		createdBy: row.created_by,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

router.get("/", readGuard(READ_PERMISSIONS.tickets), noStore, async (req, res, next) => {
	try {
		const regionalScope = scopeRegionalFilter(req);
		const [{ rows }, { rows: users }] = await Promise.all([
			db.query(
				regionalScope ? `select * from rot_tickets where regional_id = $1 order by date desc` : `select * from rot_tickets order by date desc`,
				regionalScope ? [regionalScope] : [],
			),
			db.query(
				regionalScope ? `select id, name, regional_id, role_id from rot_users where regional_id = $1 and status = 'ativo' order by name` : `select id, name, regional_id, role_id from rot_users where status = 'ativo' order by name`,
				regionalScope ? [regionalScope] : [],
			),
		]);
		res.json({
			ok: true,
			items: rows.map(publicTicket),
			technicians: users.map((u) => ({ id: u.id, name: u.name, regionalId: u.regional_id, role: u.role_id })),
		});
	} catch (error) {
		next(error);
	}
});

router.post("/", requireRotPermission("rot.tickets.manage"), async (req, res, next) => {
	try {
		const { ticketNumber, date, serviceTypeId, regionalId, cityId, teamIds } = req.body || {};
		if (!ticketNumber?.trim() || !date || !regionalId) {
			res.status(400).json({ ok: false, error: "Informe número do ticket, data e regional." });
			return;
		}
		const id = randomId();
		const { rows } = await db.query(
			`insert into rot_tickets (id, ticket_number, date, service_type_id, regional_id, city_id, team_ids, created_by)
			 values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
			[id, ticketNumber.trim(), date, serviceTypeId || null, regionalId, cityId || null, Array.isArray(teamIds) ? teamIds : [], req.rotUser.id],
		);
		await auditLog(req, { action: "create", entity: "rot_tickets", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, ticket: publicTicket(rows[0]) });
	} catch (error) {
		if (error?.constraint === "idx_rot_tickets_number_regional") {
			res.status(409).json({ ok: false, error: "Já existe um ticket com esse número nesta regional." });
			return;
		}
		next(error);
	}
});

// Importacao em lote (planilha) — o parsing/reconhecimento roda no
// frontend (mesmo algoritmo do importador do Operação legado, ver
// utils/ticketImport.js), aqui so chega a lista ja resolvida de linhas
// prontas pra inserir. Uma unica transacao: ou entra tudo, ou nada (o
// usuario ve exatamente quantos tickets foram criados, sem estado
// parcial pra reconciliar manualmente depois). Escopado por regional
// como o resto do modulo: usuario nao-global so pode importar pra
// propria regional.
router.post("/import", requireRotPermission("rot.tickets.manage"), async (req, res, next) => {
	const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
	if (!rows.length) {
		res.status(400).json({ ok: false, error: "Nenhuma linha para importar." });
		return;
	}
	if (rows.length > 2000) {
		res.status(400).json({ ok: false, error: "Envie no máximo 2000 linhas por importação." });
		return;
	}

	const client = await db.connect();
	try {
		await client.query("begin");
		const created = [];
		for (const row of rows) {
			const ticketNumber = String(row?.ticketNumber || "").trim();
			const date = row?.date || null;
			let regionalId = row?.regionalId || null;
			if (!req.rotUser.is_global) regionalId = req.rotUser.regional_id;
			if (!ticketNumber || !date || !regionalId) continue;

			const id = randomId();
			const { rows: inserted } = await client.query(
				`insert into rot_tickets (id, ticket_number, date, service_type_id, regional_id, city_id, team_ids, created_by)
				 values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
				[id, ticketNumber, date, row?.serviceTypeId || null, regionalId, row?.cityId || null, Array.isArray(row?.teamIds) ? row.teamIds : [], req.rotUser.id],
			);
			created.push(inserted[0]);
		}
		await client.query("commit");
		for (const row of created) {
			// eslint-disable-next-line no-await-in-loop
			await auditLog(req, { action: "create", entity: "rot_tickets", entityId: row.id, after: row });
		}
		res.status(201).json({ ok: true, imported: created.length, skipped: rows.length - created.length, items: created.map(publicTicket) });
	} catch (error) {
		await client.query("rollback");
		next(error);
	} finally {
		client.release();
	}
});

router.put("/:id", requireRotPermission("rot.tickets.manage"), async (req, res, next) => {
	try {
		const { ticketNumber, date, serviceTypeId, regionalId, cityId, teamIds, status } = req.body || {};
		const { rows: before } = await db.query(`select * from rot_tickets where id = $1`, [req.params.id]);
		if (!before[0]) {
			res.status(404).json({ ok: false, error: "Ticket não encontrado." });
			return;
		}
		const { rows } = await db.query(
			`update rot_tickets set
				ticket_number = coalesce($2, ticket_number),
				date = coalesce($3, date),
				service_type_id = $4,
				regional_id = coalesce($5, regional_id),
				city_id = $6,
				team_ids = coalesce($7, team_ids),
				status = coalesce($8, status)
			 where id = $1 returning *`,
			[
				req.params.id,
				ticketNumber?.trim() || null,
				date || null,
				serviceTypeId === undefined ? before[0].service_type_id : serviceTypeId || null,
				regionalId || null,
				cityId === undefined ? before[0].city_id : cityId || null,
				Array.isArray(teamIds) ? teamIds : null,
				status || null,
			],
		);
		await auditLog(req, { action: "update", entity: "rot_tickets", entityId: req.params.id, before: before[0], after: rows[0] });
		res.json({ ok: true, ticket: publicTicket(rows[0]) });
	} catch (error) {
		if (error?.constraint === "idx_rot_tickets_number_regional") {
			res.status(409).json({ ok: false, error: "Já existe um ticket com esse número nesta regional." });
			return;
		}
		next(error);
	}
});

router.delete("/:id", requireRotPermission("rot.tickets.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`delete from rot_tickets where id = $1 returning *`, [req.params.id]);
		if (rows[0]) await auditLog(req, { action: "delete", entity: "rot_tickets", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
