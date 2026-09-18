// Roteiro Finan #46 (Fase 4E — Business Case dentro do Finan): item
// independente. POST /calcular e stateless (nao salva nada); POST
// /casos salva pra referencia futura.
const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { randomId } = require("../secureRandom");
const { id, money, integer, object, string } = require("../dtos/schema");
const { calcularBusinessCase } = require("./calculo");

const router = express.Router();

const CalculoDTO = object(
	{
		investimentoInicial: money({ required: true }),
		economiaMensal: money({ required: true, allowNegative: true }),
		prazoMeses: integer({ required: true, min: 1, max: 600 }),
		taxaDescontoMensal: money({ required: false, allowNegative: true }),
	},
	{ unknownKeys: "strip" },
);
const SalvarCasoDTO = object(
	{
		nome: string({ required: true, minLength: 1, maxLength: 160 }),
		investimentoInicial: money({ required: true }),
		economiaMensal: money({ required: true, allowNegative: true }),
		prazoMeses: integer({ required: true, min: 1, max: 600 }),
		taxaDescontoMensal: money({ required: false, allowNegative: true }),
	},
	{ unknownKeys: "strip" },
);
const IdParamDTO = object({ id: id({ required: true }) }, { unknownKeys: "strip" });

router.use(requireFinanPermission(["finan.dashboard.view", "finan.gestao_orcamentaria.view"]));
router.use(noStore);

router.post("/calcular", validate({ body: CalculoDTO }), (req, res) => {
	res.json({ ok: true, resultado: calcularBusinessCase(req.validated.body) });
});

function publicCaso(row) {
	return {
		id: row.id,
		nome: row.nome,
		investimentoInicial: Number(row.investimento_inicial),
		economiaMensal: Number(row.economia_mensal),
		prazoMeses: row.prazo_meses,
		taxaDescontoMensal: Number(row.taxa_desconto_mensal),
		resultados: row.resultados || {},
		createdByNome: row.created_by_nome,
		createdAt: row.created_at,
	};
}

router.get("/casos", async (_req, res, next) => {
	try {
		const { rows } = await db.query(`select * from finan_business_cases order by created_at desc limit 100`);
		res.json({ ok: true, casos: rows.map(publicCaso) });
	} catch (error) {
		next(error);
	}
});

router.post(
	"/casos",
	requireFinanPermission("finan.gestao_orcamentaria.manage"),
	validate({ body: SalvarCasoDTO }),
	async (req, res, next) => {
		try {
			const dto = req.validated.body;
			const resultado = calcularBusinessCase(dto);
			const caseId = randomId("bcase");
			const { rows } = await db.query(
				`insert into finan_business_cases (
					id, nome, investimento_inicial, economia_mensal, prazo_meses, taxa_desconto_mensal,
					resultados, created_by_id, created_by_nome
				) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
				returning *`,
				[
					caseId,
					dto.nome,
					dto.investimentoInicial,
					dto.economiaMensal,
					dto.prazoMeses,
					dto.taxaDescontoMensal || 0,
					JSON.stringify(resultado),
					req.finanUser?.id || null,
					req.finanUser?.name || req.finanUser?.email || null,
				],
			);
			res.status(201).json({ ok: true, caso: publicCaso(rows[0]) });
		} catch (error) {
			next(error);
		}
	},
);

router.delete(
	"/casos/:id",
	requireFinanPermission("finan.gestao_orcamentaria.manage"),
	validate({ params: IdParamDTO }),
	async (req, res, next) => {
		try {
			await db.query(`delete from finan_business_cases where id = $1`, [req.validated.params.id]);
			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	},
);

module.exports = router;
