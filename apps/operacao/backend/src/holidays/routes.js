const express = require("express");
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, requireRotPermission, scopeRegionalFilter } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { auditLog } = require("../audit/auditLog");

// Calendario de feriados — fiel a rot/src/pages/HolidaysPage.tsx. Um
// feriado NATIONAL nao tem regional/cidade (visivel a todos); MUNICIPAL
// tem cidade; REGIONAL tem regional. Usuarios nao-globais so veem os da
// propria regional (+ nacionais, que nao tem regional_id).
const router = express.Router();
router.use(requireRotAuth);

function publicHoliday(row) {
	return {
		id: row.id,
		title: row.title,
		date: row.date,
		type: row.type,
		regionalId: row.regional_id,
		cityId: row.city_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

router.get("/", noStore, async (req, res, next) => {
	try {
		const regionalScope = scopeRegionalFilter(req);
		const { rows } = await db.query(
			regionalScope
				? `select * from rot_holidays where regional_id is null or regional_id = $1 order by date asc`
				: `select * from rot_holidays order by date asc`,
			regionalScope ? [regionalScope] : [],
		);
		res.json({ ok: true, items: rows.map(publicHoliday) });
	} catch (error) {
		next(error);
	}
});

router.post("/", requireRotPermission("rot.holidays.manage"), async (req, res, next) => {
	try {
		const { title, date, type, regionalId, cityId } = req.body || {};
		if (!title?.trim() || !date) {
			res.status(400).json({ ok: false, error: "Informe título e data do feriado." });
			return;
		}
		const validType = ["NATIONAL", "MUNICIPAL", "REGIONAL"].includes(type) ? type : "REGIONAL";
		const id = randomId();
		const { rows } = await db.query(
			`insert into rot_holidays (id, title, date, type, regional_id, city_id, created_by)
			 values ($1, $2, $3, $4, $5, $6, $7) returning *`,
			[id, title.trim(), date, validType, validType === "NATIONAL" ? null : regionalId || null, validType === "MUNICIPAL" ? cityId || null : null, req.rotUser.id],
		);
		await auditLog(req, { action: "create", entity: "rot_holidays", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, holiday: publicHoliday(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.put("/:id", requireRotPermission("rot.holidays.manage"), async (req, res, next) => {
	try {
		const { title, date, type, regionalId, cityId } = req.body || {};
		const { rows: before } = await db.query(`select * from rot_holidays where id = $1`, [req.params.id]);
		if (!before[0]) {
			res.status(404).json({ ok: false, error: "Feriado não encontrado." });
			return;
		}
		const validType = ["NATIONAL", "MUNICIPAL", "REGIONAL"].includes(type) ? type : before[0].type;
		const { rows } = await db.query(
			`update rot_holidays set
				title = coalesce($2, title),
				date = coalesce($3, date),
				type = $4,
				regional_id = $5,
				city_id = $6
			 where id = $1 returning *`,
			[
				req.params.id,
				title?.trim() || null,
				date || null,
				validType,
				validType === "NATIONAL" ? null : regionalId ?? before[0].regional_id,
				validType === "MUNICIPAL" ? (cityId ?? before[0].city_id) : null,
			],
		);
		await auditLog(req, { action: "update", entity: "rot_holidays", entityId: req.params.id, before: before[0], after: rows[0] });
		res.json({ ok: true, holiday: publicHoliday(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", requireRotPermission("rot.holidays.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`delete from rot_holidays where id = $1 returning *`, [req.params.id]);
		if (rows[0]) await auditLog(req, { action: "delete", entity: "rot_holidays", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
