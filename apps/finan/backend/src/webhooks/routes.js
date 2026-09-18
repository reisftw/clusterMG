// Roteiro Finan #47 (Fase 4F — Webhooks): CRUD.
const express = require("express");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { arrayOf, boolean, enumField, id, object, string } = require("../dtos/schema");
const service = require("./dispatchService");

const router = express.Router();

const IdParamDTO = object({ id: id({ required: true }) }, { unknownKeys: "strip" });
const CreateWebhookDTO = object(
	{
		url: string({ required: true, minLength: 8, maxLength: 500, pattern: /^https?:\/\// }),
		eventos: arrayOf(enumField(service.EVENTOS_SUPORTADOS, { required: true }), { required: true, maxLength: 10 }),
	},
	{ unknownKeys: "strip" },
);
const UpdateWebhookDTO = object(
	{
		ativo: boolean({ required: false }),
		eventos: arrayOf(enumField(service.EVENTOS_SUPORTADOS, { required: true }), { required: false, maxLength: 10 }),
	},
	{ unknownKeys: "strip" },
);

router.use(requireFinanPermission("finan.configuracoes.view"));
router.use(noStore);

router.get("/eventos", (_req, res) => {
	res.json({ ok: true, eventos: service.EVENTOS_SUPORTADOS });
});

router.get("/", async (_req, res, next) => {
	try {
		res.json({ ok: true, webhooks: await service.listWebhooks() });
	} catch (error) {
		next(error);
	}
});

router.post(
	"/",
	requireFinanPermission("finan.configuracoes.manage"),
	validate({ body: CreateWebhookDTO }),
	async (req, res, next) => {
		try {
			const webhook = await service.createWebhook({
				...req.validated.body,
				createdBy: { id: req.finanUser?.id, name: req.finanUser?.name || req.finanUser?.email },
			});
			res.status(201).json({ ok: true, webhook });
		} catch (error) {
			next(error);
		}
	},
);

router.put(
	"/:id",
	requireFinanPermission("finan.configuracoes.manage"),
	validate({ params: IdParamDTO, body: { schema: UpdateWebhookDTO, partial: true } }),
	async (req, res, next) => {
		try {
			res.json({ ok: true, webhook: await service.updateWebhook(req.validated.params.id, req.validated.body) });
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
			await service.deleteWebhook(req.validated.params.id);
			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	},
);

module.exports = router;
