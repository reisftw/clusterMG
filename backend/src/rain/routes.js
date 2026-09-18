const express = require("express");
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, requireRotPermission, scopeRegionalFilter, userHasRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { auditLog } = require("../audit/auditLog");

// Alertas de Chuva — fiel a rot/src/pages/RainPage.tsx: tecnico declara
// que comecou a chover na cidade/bairro dele, gestor (ou o proprio
// tecnico) marca quando parou.
const router = express.Router();
router.use(requireRotAuth);

function publicAlert(row) {
	return {
		id: row.id,
		regionalId: row.regional_id,
		city: row.city,
		district: row.district,
		techId: row.tech_id,
		techName: row.tech_name || null,
		startTime: row.start_time,
		endTime: row.end_time,
		active: row.active,
		createdAt: row.created_at,
	};
}

router.get("/", noStore, async (req, res, next) => {
	try {
		const regionalScope = scopeRegionalFilter(req);
		const { rows } = await db.query(
			regionalScope
				? `select a.*, u.name as tech_name from rot_rain_alerts a left join rot_users u on u.id = a.tech_id where a.regional_id = $1 order by a.start_time desc`
				: `select a.*, u.name as tech_name from rot_rain_alerts a left join rot_users u on u.id = a.tech_id order by a.start_time desc`,
			regionalScope ? [regionalScope] : [],
		);
		res.json({ ok: true, items: rows.map(publicAlert) });
	} catch (error) {
		next(error);
	}
});

router.post("/", async (req, res, next) => {
	try {
		const { city, district } = req.body || {};
		if (!city?.trim()) {
			res.status(400).json({ ok: false, error: "Informe a cidade." });
			return;
		}
		const id = randomId();
		const { rows } = await db.query(
			`insert into rot_rain_alerts (id, regional_id, city, district, tech_id) values ($1, $2, $3, $4, $5) returning *`,
			[id, req.rotUser.regional_id || null, city.trim(), String(district || ""), req.rotUser.id],
		);
		await auditLog(req, { action: "create", entity: "rot_rain_alerts", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, alert: publicAlert({ ...rows[0], tech_name: req.rotUser.name }) });
	} catch (error) {
		next(error);
	}
});

// Parar a chuva — o proprio tecnico que declarou, ou quem gerencia.
router.post("/:id/stop", async (req, res, next) => {
	try {
		const { rows: before } = await db.query(`select * from rot_rain_alerts where id = $1`, [req.params.id]);
		if (!before[0]) {
			res.status(404).json({ ok: false, error: "Alerta não encontrado." });
			return;
		}
		const isOwner = before[0].tech_id === req.rotUser.id;
		if (!isOwner && !userHasRotPermission(req.rotUser, "rot.rain.manage")) {
			res.status(403).json({ ok: false, error: "Você não pode encerrar este alerta." });
			return;
		}
		const { rows } = await db.query(
			`update rot_rain_alerts a set active = false, end_time = now() where id = $1
			 returning a.*, (select name from rot_users u where u.id = a.tech_id) as tech_name`,
			[req.params.id],
		);
		res.json({ ok: true, alert: publicAlert(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", requireRotPermission("rot.rain.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`delete from rot_rain_alerts where id = $1 returning *`, [req.params.id]);
		if (rows[0]) await auditLog(req, { action: "delete", entity: "rot_rain_alerts", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
