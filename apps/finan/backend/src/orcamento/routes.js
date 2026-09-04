const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/resumo", async (_req, res) => {
	const { rows } = await db.query(
		`select
			coalesce(sum(orcado), 0)::numeric as orcado,
			coalesce(sum(realizado), 0)::numeric as realizado,
			count(*)::integer as linhas
		from finan_orcamento_movimentos`,
	);
	res.json({ ok: true, resumo: rows[0] || { orcado: 0, realizado: 0, linhas: 0 } });
});

module.exports = router;
