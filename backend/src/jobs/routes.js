// Roteiro Finan #28 (Fase 4A — Central de Jobs e Integrações): última
// execução, duração, registros processados, erros e reprocessar (quando
// aplicável) para cada tarefa automática do Finan.
//
// A logica de "como disparar cada job manualmente" mora em
// jobExecutionService.reprocessJob (Roteiro #26 — reaproveitada tambem
// pela rota v1 em apiV1/routes/jobs.js, sem duplicar).
const express = require("express");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { enumField, object } = require("../dtos/schema");
const jobExecutionService = require("./jobExecutionService");

const router = express.Router();

const JobKeyParamDTO = object(
	{ jobKey: enumField(Object.keys(jobExecutionService.JOB_REGISTRY), { required: true }) },
	{ unknownKeys: "strip" },
);

router.use(requireFinanPermission("finan.configuracoes.view"));
router.use(noStore);

router.get("/", async (_req, res, next) => {
	try {
		res.json({ ok: true, jobs: await jobExecutionService.getJobsOverview() });
	} catch (error) {
		next(error);
	}
});

router.get(
	"/:jobKey/execucoes",
	validate({ params: JobKeyParamDTO }),
	async (req, res, next) => {
		try {
			const execucoes = await jobExecutionService.listExecutions({
				jobKey: req.params.jobKey,
				limit: req.query.limit,
			});
			res.json({ ok: true, execucoes });
		} catch (error) {
			next(error);
		}
	},
);

router.post(
	"/:jobKey/reprocessar",
	requireFinanPermission("finan.configuracoes.manage"),
	validate({ params: JobKeyParamDTO }),
	async (req, res, next) => {
		try {
			const triggeredBy = {
				id: req.finanUser?.uid,
				name: req.finanUser?.profile?.name || req.finanUser?.email,
			};
			const result = await jobExecutionService.reprocessJob(req.params.jobKey, { triggeredBy });
			res.json({ ok: true, ...(result.kind === "summary" ? { summary: result.summary } : { message: result.message }) });
		} catch (error) {
			if (error instanceof jobExecutionService.JobReprocessError) {
				return res.status(error.code === "NOT_FOUND" ? 404 : 400).json({ ok: false, error: error.message });
			}
			next(error);
		}
	},
);

module.exports = router;
