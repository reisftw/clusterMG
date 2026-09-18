// Roteiro Finan #21 (Favoritos/dashboard pessoal): cada usuario fixa uma
// lista curta de atalhos (rota + rotulo) pra sua propria visao. So o
// dono edita a propria lista — sem gate de permissao alem de estar
// autenticado (mesmo padrao de /notifications/personal-preferences).
const express = require("express");
const db = require("../db");
const { noStore } = require("../security/noStore");

const router = express.Router();

router.use(noStore);

const MAX_FAVORITOS = 12;

function sanitizeFavoritos(list) {
	if (!Array.isArray(list)) return [];
	return list
		.filter((item) => item && typeof item === "object" && item.path && item.label)
		.slice(0, MAX_FAVORITOS)
		.map((item) => ({
			path: String(item.path).slice(0, 200),
			label: String(item.label).slice(0, 100),
		}));
}

router.get("/favoritos", async (req, res, next) => {
	try {
		const { rows } = await db.query(`select favoritos from finan_user_preferences where user_id = $1`, [req.finanUser.id]);
		res.json({ ok: true, favoritos: rows[0]?.favoritos || [] });
	} catch (error) {
		next(error);
	}
});

router.put("/favoritos", async (req, res, next) => {
	try {
		const favoritos = sanitizeFavoritos(req.body?.favoritos);
		await db.query(
			`insert into finan_user_preferences (user_id, favoritos, updated_at)
			values ($1, $2::jsonb, now())
			on conflict (user_id) do update set favoritos = excluded.favoritos, updated_at = now()`,
			[req.finanUser.id, JSON.stringify(favoritos)],
		);
		res.json({ ok: true, favoritos });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
