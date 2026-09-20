const express = require("express");
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, requireRotPermission, scopeRegionalFilter } = require("../auth/middleware");
const { noStore } = require("../security/noStore");

// Admin CRUD dos QR Codes — marcado P0 pelo usuario. Pagina publica (sem
// auth, incrementa visitas) fica em ./publicRoutes.js, montada em
// /api/public/qr — separada pra nao herdar router.use(requireRotAuth)
// por engano.
const router = express.Router();
router.use(requireRotAuth);

function sanitizeLinks(input) {
	if (!Array.isArray(input)) return [];
	return input
		.map((item) => ({ label: String(item?.label || "").trim(), url: String(item?.url || "").trim() }))
		.filter((item) => item.label && item.url);
}

function publicQrCode(row) {
	return {
		id: row.id,
		title: row.title,
		links: Array.isArray(row.links) ? row.links : [],
		regionalId: row.regional_id,
		visits: Number(row.visits) || 0,
		active: row.active !== false,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

router.get("/", noStore, async (req, res, next) => {
	try {
		const params = [];
		let where = "1=1";
		const regionalScope = scopeRegionalFilter(req);
		if (regionalScope) {
			params.push(regionalScope === "__none__" ? null : regionalScope);
			where = `(regional_id = $${params.length} or regional_id is null)`;
		}
		const { rows } = await db.query(
			`select * from rot_qrcodes where ${where} order by created_at desc`,
			params,
		);
		res.json({ ok: true, items: rows.map(publicQrCode) });
	} catch (error) {
		next(error);
	}
});

router.post("/", requireRotPermission("rot.qrcodes.manage"), async (req, res, next) => {
	try {
		const title = String(req.body?.title || "").trim();
		const links = sanitizeLinks(req.body?.links);
		if (!title || !links.length) {
			res.status(400).json({ ok: false, error: "Informe um título e pelo menos um link válido." });
			return;
		}
		const regionalId = req.rotUser.is_global ? req.body?.regionalId || null : req.rotUser.regional_id;
		const id = randomId("qr", 5);
		const { rows } = await db.query(
			`insert into rot_qrcodes (id, title, links, regional_id, created_by)
			values ($1, $2, $3::jsonb, $4, $5)
			returning *`,
			[id, title, JSON.stringify(links), regionalId, req.rotUser.id],
		);
		res.json({ ok: true, qrcode: publicQrCode(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.put("/:id", requireRotPermission("rot.qrcodes.manage"), async (req, res, next) => {
	try {
		const { rows: currentRows } = await db.query(`select * from rot_qrcodes where id = $1`, [req.params.id]);
		if (!currentRows[0]) {
			res.status(404).json({ ok: false, error: "QR Code não encontrado." });
			return;
		}
		const regionalScope = scopeRegionalFilter(req);
		if (regionalScope && currentRows[0].regional_id && currentRows[0].regional_id !== req.rotUser.regional_id) {
			res.status(403).json({ ok: false, error: "Você não pode editar um QR Code de outra regional." });
			return;
		}
		const title = req.body?.title !== undefined ? String(req.body.title).trim() : currentRows[0].title;
		const links = req.body?.links !== undefined ? sanitizeLinks(req.body.links) : currentRows[0].links;
		if (!title || !links.length) {
			res.status(400).json({ ok: false, error: "Informe um título e pelo menos um link válido." });
			return;
		}
		const active = req.body?.active !== undefined ? Boolean(req.body.active) : currentRows[0].active;
		const { rows } = await db.query(
			`update rot_qrcodes set title = $2, links = $3::jsonb, active = $4, updated_at = now() where id = $1 returning *`,
			[req.params.id, title, JSON.stringify(links), active],
		);
		res.json({ ok: true, qrcode: publicQrCode(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", requireRotPermission("rot.qrcodes.manage"), async (req, res, next) => {
	try {
		const { rows: currentRows } = await db.query(`select * from rot_qrcodes where id = $1`, [req.params.id]);
		if (!currentRows[0]) {
			res.status(404).json({ ok: false, error: "QR Code não encontrado." });
			return;
		}
		const regionalScope = scopeRegionalFilter(req);
		if (regionalScope && currentRows[0].regional_id && currentRows[0].regional_id !== req.rotUser.regional_id) {
			res.status(403).json({ ok: false, error: "Você não pode excluir um QR Code de outra regional." });
			return;
		}
		await db.query(`delete from rot_qrcodes where id = $1`, [req.params.id]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
