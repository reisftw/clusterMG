const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");

const router = express.Router();

router.use(requireFinanPermission("finan.gestao_orcamentaria.view"));

router.get("/resumo", async (_req, res) => {
	const now = new Date();
	const year = Number(_req.query?.ano || now.getFullYear());
	const month = Number(_req.query?.mes || now.getMonth() + 1);
	const { rows } = await db.query(
		`with matriz as (
			select coalesce(sum(orcado), 0)::numeric as orcado
			from finan_orcamento_matriz
			where ano = $1 and mes = $2
		),
		lancamentos as (
			select
				coalesce(sum(realizado), 0)::numeric as realizado,
				count(*)::integer as linhas
			from finan_orcamento_lancamentos
			where ano = $1 and mes = $2
		)
		select matriz.orcado, lancamentos.realizado, lancamentos.linhas
		from matriz cross join lancamentos`,
		[year, month],
	);
	res.json({
		ok: true,
		periodo: { ano: year, mes: month },
		resumo: rows[0] || { orcado: 0, realizado: 0, linhas: 0 },
	});
});

module.exports = router;
