const express = require("express");
const db = require("../db");
const { noStore } = require("../security/noStore");

// Pagina publica do QR Code — SEM auth (igual ao legado: qualquer um com
// o link/QR le e acessa). So GET, so incrementa visitas, nunca expõe
// nada alem de titulo+links+regional-nao-sensivel.
const router = express.Router();

router.get("/:id", noStore, async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`update rot_qrcodes set visits = visits + 1 where id = $1 and active = true returning id, title, links`,
			[req.params.id],
		);
		if (!rows[0]) {
			res.status(404).json({ ok: false, error: "QR Code não encontrado ou inativo." });
			return;
		}
		res.json({ ok: true, qrcode: { id: rows[0].id, title: rows[0].title, links: rows[0].links || [] } });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
