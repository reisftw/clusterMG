// Roteiro Finan #40 (Fase 4D — Regras financeiras configuráveis, v1
// restrito): CRUD do catálogo fixo de regras + avaliação sob demanda
// (via Central de Jobs, Roteiro #28 — jobKey "regras_financeiras").
const express = require("express");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { boolean, id, jsonObject, object, string } = require("../dtos/schema");
const service = require("./service");

const router = express.Router();

const IdParamDTO = object({ id: id({ required: true }) }, { unknownKeys: "strip" });
const CreateRegraDTO = object(
	{
		tipo: string({ required: true, maxLength: 60 }),
		nome: string({ required: true, minLength: 1, maxLength: 160 }),
		parametros: jsonObject({ required: true }),
	},
	{ unknownKeys: "strip" },
);
const UpdateRegraDTO = object(
	{
		nome: string({ required: false, minLength: 1, maxLength: 160 }),
		parametros: jsonObject({ required: false }),
		ativa: boolean({ required: false }),
	},
	{ unknownKeys: "strip" },
);

router.use(requireFinanPermission("finan.configuracoes.view"));
router.use(noStore);

router.get("/tipos", (_req, res) => {
	res.json({ ok: true, tipos: service.getCatalogoTipos() });
});

router.get("/", async (_req, res, next) => {
	try {
		res.json({ ok: true, regras: await service.listRegras() });
	} catch (error) {
		next(error);
	}
});

router.post(
	"/",
	requireFinanPermission("finan.configuracoes.manage"),
	validate({ body: CreateRegraDTO }),
	async (req, res, next) => {
		try {
			const dto = req.validated.body;
			const regra = await service.createRegra({
				...dto,
				createdBy: { id: req.finanUser?.id, name: req.finanUser?.name || req.finanUser?.email },
			});
			res.status(201).json({ ok: true, regra });
		} catch (error) {
			next(error);
		}
	},
);

router.put(
	"/:id",
	requireFinanPermission("finan.configuracoes.manage"),
	validate({ params: IdParamDTO, body: { schema: UpdateRegraDTO, partial: true } }),
	async (req, res, next) => {
		try {
			const regra = await service.updateRegra(req.validated.params.id, req.validated.body);
			res.json({ ok: true, regra });
		} catch (error) {
			next(error);
		}
	},
);

router.delete(
	"/:id",
	requireFinanPermission("finan.configuracoes.manage"),
	validate({ params: IdParamDTO }),
	async (req, res, next) => {
		try {
			await service.deleteRegra(req.validated.params.id);
			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	},
);

module.exports = router;
