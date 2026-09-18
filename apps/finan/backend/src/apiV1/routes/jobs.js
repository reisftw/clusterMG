// Roteiro Finan #26: equivalente v1 de /api/finan/jobs — mesma Central de
// Jobs (Roteiro #28), agora com paginação real no histórico de execuções
// (a versão legada so tinha `limit`, sem total).
const express = require("express");
const { requireApiV1Permission } = require("../auth");
const { noStore } = require("../../security/noStore");
const { validate } = require("../../dtos/middleware");
const { enumField, object } = require("../../dtos/schema");
const jobExecutionService = require("../../jobs/jobExecutionService");
const { ApiError } = require("../ApiError");
const { sendData } = require("../envelope");
const { parsePagination, buildMeta } = require("../pagination");

const router = express.Router();

const JobKeyParamDTO = object(
	{ jobKey: enumField(Object.keys(jobExecutionService.JOB_REGISTRY), { required: true }) },
	{ unknownKeys: "strip" },
);

router.use(requireApiV1Permission("finan.configuracoes.view"));
router.use(noStore);

router.get("/", async (_req, res, next) => {
	try {
		sendData(res, await jobExecutionService.getJobsOverview());
	} catch (error) {
		next(error);
	}
});

router.get("/:jobKey/execucoes", validate({ params: JobKeyParamDTO }), async (req, res, next) => {
	try {
		const { page, pageSize, offset, limit } = parsePagination(req.query);
		const { executions, total } = await jobExecutionService.listExecutions({
			jobKey: req.params.jobKey,
			limit,
			offset,
			withTotal: true,
		});
		sendData(res, executions, { meta: buildMeta({ page, pageSize, total }) });
	} catch (error) {
		next(error);
	}
});

router.post(
	"/:jobKey/reprocessar",
	requireApiV1Permission("finan.configuracoes.manage"),
	validate({ params: JobKeyParamDTO }),
	async (req, res, next) => {
		try {
			const triggeredBy = {
				id: req.finanUser?.uid,
				name: req.finanUser?.profile?.name || req.finanUser?.email,
			};
			const result = await jobExecutionService.reprocessJob(req.params.jobKey, { triggeredBy });
			sendData(res, result.kind === "summary" ? result.summary : { message: result.message });
		} catch (error) {
			if (error instanceof jobExecutionService.JobReprocessError) {
				return next(
					error.code === "NOT_FOUND" ? ApiError.notFound(error.message) : ApiError.validation(error.message),
				);
			}
			next(error);
		}
	},
);

module.exports = router;
