const express = require("express");
const multer = require("multer");
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, requireRotPermission, scopeRegionalFilter } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { auditLog } = require("../audit/auditLog");
const { NOTICE_IMAGE_UPLOAD_LIMITS, assertUploadedImage, imageFileFilter } = require("../security/uploadFilters");

// Quadro de avisos — fiel a rot/src/pages/NoticesPage.tsx. target_regional_id
// = 'GLOBAL' visivel a todos autenticados; senao so a regional-dono (mais
// usuarios globais, que veem tudo). Imagem guardada como data URL direto
// na coluna — mesmo padrao ja usado pro avatar padrao em settings/routes.js.
const router = express.Router();
router.use(requireRotAuth);
const upload = multer({
	storage: multer.memoryStorage(),
	limits: NOTICE_IMAGE_UPLOAD_LIMITS,
	fileFilter: imageFileFilter,
});

function publicNotice(row, usersById) {
	return {
		id: row.id,
		title: row.title,
		content: row.content,
		imageUrl: row.image_url || "",
		targetRegionalId: row.target_regional_id,
		createdBy: row.created_by,
		createdByName: usersById?.get(row.created_by) || null,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

router.get("/", noStore, async (req, res, next) => {
	try {
		const regionalScope = scopeRegionalFilter(req);
		const { rows } = await db.query(
			regionalScope
				? `select * from rot_notices where target_regional_id = 'GLOBAL' or target_regional_id = $1 order by created_at desc`
				: `select * from rot_notices order by created_at desc`,
			regionalScope ? [regionalScope] : [],
		);
		const creatorIds = [...new Set(rows.map((row) => row.created_by).filter(Boolean))];
		const usersById = new Map();
		if (creatorIds.length) {
			const { rows: users } = await db.query(`select id, name from rot_users where id = any($1::text[])`, [creatorIds]);
			for (const user of users) usersById.set(user.id, user.name);
		}
		res.json({ ok: true, items: rows.map((row) => publicNotice(row, usersById)) });
	} catch (error) {
		next(error);
	}
});

router.post("/", requireRotPermission("rot.notices.manage"), upload.single("image"), async (req, res, next) => {
	try {
		const { title, content, targetRegionalId } = req.body || {};
		if (!title?.trim()) {
			res.status(400).json({ ok: false, error: "Informe um título para o aviso." });
			return;
		}
		let imageUrl = "";
		if (req.file) {
			const mime = assertUploadedImage(req.file);
			imageUrl = `data:${mime};base64,${req.file.buffer.toString("base64")}`;
		}
		const id = randomId();
		const { rows } = await db.query(
			`insert into rot_notices (id, title, content, image_url, target_regional_id, created_by)
			 values ($1, $2, $3, $4, $5, $6) returning *`,
			[id, title.trim(), String(content || ""), imageUrl, targetRegionalId || "GLOBAL", req.rotUser.id],
		);
		await auditLog(req, { action: "create", entity: "rot_notices", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, notice: publicNotice(rows[0], new Map([[req.rotUser.id, req.rotUser.name]])) });
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", requireRotPermission("rot.notices.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`delete from rot_notices where id = $1 returning *`, [req.params.id]);
		if (rows[0]) await auditLog(req, { action: "delete", entity: "rot_notices", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
