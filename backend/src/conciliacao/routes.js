// Roteiro Finan #48 (Fase 4F — Conciliação inteligente).
const express = require("express");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { enumField, id, object } = require("../dtos/schema");
const service = require("./service");

const router = express.Router();

const IdParamDTO = object({ id: id({ required: true }) }, { unknownKeys: "strip" });
const ConfirmarDTO = object(
	{
		tipo: enumField(["contas_pagar", "contas_receber"], { required: true }),
		id: id({ required: true }),
	},
	{ unknownKeys: "strip" },
);

router.use(requireFinanPermission(["finan.contas_pagar.view", "finan.contas_receber.view", "finan.dashboard.view"]));
router.use(noStore);

router.get("/sugestoes", async (_req, res, next) => {
	try {
		res.json({ ok: true, sugestoes: await service.sugerirConciliacoes() });
	} catch (error) {
		next(error);
	}
});

router.post(
	"/:id/confirmar",
	requireFinanPermission(["finan.contas_pagar.manage", "finan.contas_receber.manage"]),
	validate({ params: IdParamDTO, body: ConfirmarDTO }),
	async (req, res, next) => {
		try {
			await service.confirmarConciliacao(req.validated.params.id, req.validated.body, {
				id: req.finanUser?.id,
				name: req.finanUser?.name || req.finanUser?.email,
			});
			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	},
);

module.exports = router;
