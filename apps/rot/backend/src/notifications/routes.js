const express = require("express");
const db = require("../db");
const { requireRotAuth } = require("../auth/middleware");
const { noStore } = require("../security/noStore");

const router = express.Router();
router.use(requireRotAuth, noStore);

function publicNotification(row) {
	return {
		id: row.id,
		type: row.type,
		title: row.title,
		body: row.body,
		entityType: row.entity_type,
		entityId: row.entity_id,
		deepLink: row.deep_link,
		readAt: row.read_at,
		createdAt: row.created_at,
	};
}

router.get("/", async (req, res, next) => {
	try {
		const onlyUnread = req.query.unread === "true";
		const { rows } = await db.query(
			`select * from rot_notifications where user_id = $1 ${onlyUnread ? "and read_at is null" : ""} order by created_at desc limit 50`,
			[req.rotUser.id],
		);
		const { rows: countRows } = await db.query(`select count(*)::int as n from rot_notifications where user_id = $1 and read_at is null`, [req.rotUser.id]);
		res.json({ ok: true, items: rows.map(publicNotification), unreadCount: countRows[0].n });
	} catch (error) {
		next(error);
	}
});

router.post("/:id/read", async (req, res, next) => {
	try {
		await db.query(`update rot_notifications set read_at = now() where id = $1 and user_id = $2 and read_at is null`, [req.params.id, req.rotUser.id]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.post("/read-all", async (req, res, next) => {
	try {
		await db.query(`update rot_notifications set read_at = now() where user_id = $1 and read_at is null`, [req.rotUser.id]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
