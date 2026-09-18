// Roteiro Finan #25 (Central de indicadores): KPI customizado como
// "metricaA operador metricaB" — NUNCA formula/expressao livre do
// usuario. metrica_a/metrica_b sao chaves de METRICS (catalogo fixo
// abaixo); o usuario so escolhe entre elas e um operador, sem risco de
// injetar SQL ou expressao arbitraria.
const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { randomId } = require("../secureRandom");
const { object, string, id } = require("../dtos/schema");
const { METRICS, METRIC_KEYS, OPERADORES, listIndicadoresComValor } = require("./service");

const router = express.Router();

router.use(requireFinanPermission(["finan.gestao_orcamentaria.view", "finan.dashboard.view"]));
router.use(noStore);

const IndicadorDTO = object(
	{
		nome: string({ required: true, maxLength: 120 }),
		metricaA: string({ required: true, pattern: new RegExp(`^(${METRIC_KEYS.join("|")})$`) }),
		operador: string({ required: true, pattern: /^[/*+-]$/ }),
		metricaB: string({ required: true, pattern: new RegExp(`^(${METRIC_KEYS.join("|")})$`) }),
	},
	{ unknownKeys: "reject" },
);
const IdParamDTO = object({ id: id({ required: true }) }, { unknownKeys: "strip" });

router.get("/catalogo", async (_req, res, next) => {
	try {
		res.json({
			ok: true,
			metricas: METRIC_KEYS.map((key) => ({ key, label: METRICS[key].label })),
			operadores: Object.keys(OPERADORES),
		});
	} catch (error) {
		next(error);
	}
});

router.get("/", async (_req, res, next) => {
	try {
		const indicadores = await listIndicadoresComValor();
		res.json({ ok: true, indicadores });
	} catch (error) {
		next(error);
	}
});

router.post(
	"/",
	requireFinanPermission("finan.gestao_orcamentaria.manage"),
	validate({ body: IndicadorDTO }),
	async (req, res, next) => {
		try {
			const dto = req.validated.body;
			const id = randomId("indicador");
			await db.query(
				`insert into finan_indicadores (id, nome, metrica_a, operador, metrica_b, created_by_id, created_by_nome)
				values ($1, $2, $3, $4, $5, $6, $7)`,
				[id, dto.nome, dto.metricaA, dto.operador, dto.metricaB, req.finanUser?.id || null, req.finanUser?.name || req.finanUser?.email || null],
			);
			res.json({ ok: true, id });
		} catch (error) {
			next(error);
		}
	},
);

router.delete("/:id", requireFinanPermission("finan.gestao_orcamentaria.manage"), validate({ params: IdParamDTO }), async (req, res, next) => {
	try {
		await db.query(`delete from finan_indicadores where id = $1`, [req.validated.params.id]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
