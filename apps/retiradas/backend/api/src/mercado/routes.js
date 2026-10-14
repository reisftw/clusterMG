const express = require("express");
const service = require("./service");

function asyncHandler(handler) {
	return async (req, res, next) => {
		try {
			await handler(req, res, next);
		} catch (error) {
			next(error);
		}
	};
}

function createMercadoRouter({
	requireAuthenticated,
	requireAnyPermission,
	requireCsrfToken,
} = {}) {
	const router = express.Router();
	const requireAnyMercado = requireAnyPermission(service.VIEW_PERMISSIONS, []);
	const requireLotesView = requireAnyPermission(service.LOTES_VIEW_PERMISSIONS, []);
	const requireLotesManage = requireAnyPermission(service.LOTES_MANAGE_PERMISSIONS, []);
	const requireLotesAccept = requireAnyPermission(service.LOTES_ACCEPT_PERMISSIONS, []);
	const requireExecucaoView = requireAnyPermission(
		service.EXECUCAO_VIEW_PERMISSIONS,
		[],
	);
	const requireExecucaoManage = requireAnyPermission(
		service.EXECUCAO_MANAGE_PERMISSIONS,
		[],
	);
	const requireBackofficeView = requireAnyPermission(
		service.BACKOFFICE_VIEW_PERMISSIONS,
		[],
	);
	const requireBackofficeManage = requireAnyPermission(
		service.BACKOFFICE_MANAGE_PERMISSIONS,
		[],
	);
	const requireFinanceiroView = requireAnyPermission(
		service.FINANCEIRO_VIEW_PERMISSIONS,
		[],
	);
	const requireFinanceiroManage = requireAnyPermission(
		service.FINANCEIRO_MANAGE_PERMISSIONS,
		[],
	);
	const requireConfigView = requireAnyPermission(service.CONFIG_VIEW_PERMISSIONS, []);
	const requireConfigManage = requireAnyPermission(
		service.CONFIG_MANAGE_PERMISSIONS,
		[],
	);

	router.get(
		"/dashboard",
		requireAuthenticated,
		requireAnyMercado,
		asyncHandler(async (req, res) => {
			res.json(await service.dashboard(req.query || {}, req.user || {}));
		}),
	);

	router.get(
		"/config",
		requireAuthenticated,
		requireConfigView,
		asyncHandler(async (_req, res) => {
			res.json(await service.getCurrentConfig());
		}),
	);

	router.put(
		"/config",
		requireAuthenticated,
		requireCsrfToken,
		requireConfigManage,
		asyncHandler(async (req, res) => {
			res.json(await service.saveConfig(req.body || {}, req.user || {}));
		}),
	);

	router.post(
		"/config/simular",
		requireAuthenticated,
		requireConfigView,
		asyncHandler(async (req, res) => {
			const config = await service.getCurrentConfig();
			res.json({
				result: service.simulatePricing(req.body?.config || config.config, req.body || {}),
			});
		}),
	);

	router.get(
		"/empresas",
		requireAuthenticated,
		requireConfigView,
		asyncHandler(async (req, res) => {
			res.json({ items: await service.listEmpresas(req.query || {}) });
		}),
	);

	router.get(
		"/empresas/habilitacoes",
		requireAuthenticated,
		requireConfigView,
		asyncHandler(async (_req, res) => {
			res.json(await service.listHabilitacoes());
		}),
	);

	router.get(
		"/sugestoes",
		requireAuthenticated,
		requireLotesView,
		asyncHandler(async (req, res) => {
			res.json(await service.listSugestoes(req.query || {}));
		}),
	);

	router.put(
		"/empresas/habilitacoes",
		requireAuthenticated,
		requireCsrfToken,
		requireConfigManage,
		asyncHandler(async (req, res) => {
			res.json(await service.saveHabilitacao(req.body || {}, req.user || {}));
		}),
	);

	router.get(
		"/lotes",
		requireAuthenticated,
		requireLotesView,
		asyncHandler(async (req, res) => {
			res.json(await service.listLotes(req.query || {}, req.user || {}));
		}),
	);

	router.get(
		"/lotes/:id",
		requireAuthenticated,
		requireLotesView,
		asyncHandler(async (req, res) => {
			const result = await service.getLote(req.params.id, req.user || {});
			if (!result) {
				res.status(404).json({ error: "Lote nao encontrado." });
				return;
			}
			res.json(result);
		}),
	);

	router.post(
		"/lotes",
		requireAuthenticated,
		requireCsrfToken,
		requireLotesManage,
		asyncHandler(async (req, res) => {
			res.status(201).json(await service.createManualLote(req.body || {}, req.user || {}));
		}),
	);

	router.post(
		"/lotes/gerar",
		requireAuthenticated,
		requireCsrfToken,
		requireLotesManage,
		asyncHandler(async (req, res) => {
			res.status(201).json(await service.generateLots(req.body || {}, req.user || {}));
		}),
	);

	router.post(
		"/lotes/:id/aceitar",
		requireAuthenticated,
		requireCsrfToken,
		requireLotesAccept,
		asyncHandler(async (req, res) => {
			res.json(await service.acceptLote(req.params.id, req.user || {}));
		}),
	);

	router.post(
		"/lotes/:id/desistir",
		requireAuthenticated,
		requireCsrfToken,
		requireLotesAccept,
		asyncHandler(async (req, res) => {
			res.json(await service.withdrawLote(req.params.id, req.user || {}));
		}),
	);

	router.put(
		"/lotes/:id/valores",
		requireAuthenticated,
		requireCsrfToken,
		requireLotesManage,
		asyncHandler(async (req, res) => {
			res.json(await service.updateLotePricing(req.params.id, req.body || {}, req.user || {}));
		}),
	);

	router.get(
		"/backoffice",
		requireAuthenticated,
		requireBackofficeView,
		asyncHandler(async (req, res) => {
			res.json(await service.listBackoffice(req.query || {}, req.user || {}));
		}),
	);

	router.post(
		"/os/:id/execucao",
		requireAuthenticated,
		requireCsrfToken,
		requireExecucaoManage,
		asyncHandler(async (req, res) => {
			res.json(await service.updateOsExecution(req.params.id, req.body || {}, req.user || {}));
		}),
	);

	router.post(
		"/os/:id/tentativas",
		requireAuthenticated,
		requireCsrfToken,
		requireExecucaoManage,
		asyncHandler(async (req, res) => {
			res.status(201).json(await service.addTentativa(req.params.id, req.body || {}, req.user || {}));
		}),
	);

	router.post(
		"/os/:id/agendamentos",
		requireAuthenticated,
		requireCsrfToken,
		requireExecucaoManage,
		asyncHandler(async (req, res) => {
			res.status(201).json(await service.addAgendamento(req.params.id, req.body || {}, req.user || {}));
		}),
	);

	router.post(
		"/os/:id/evidencias",
		requireAuthenticated,
		requireCsrfToken,
		requireExecucaoManage,
		asyncHandler(async (req, res) => {
			res.status(201).json(await service.addEvidencia(req.params.id, req.body || {}, req.user || {}));
		}),
	);

	router.post(
		"/os/:id/aprovar",
		requireAuthenticated,
		requireCsrfToken,
		requireBackofficeManage,
		asyncHandler(async (req, res) => {
			res.json(await service.approveOs(req.params.id, req.body || {}, req.user || {}));
		}),
	);

	router.post(
		"/tentativas/:id/aprovar",
		requireAuthenticated,
		requireCsrfToken,
		requireBackofficeManage,
		asyncHandler(async (req, res) => {
			res.json(
				await service.updateTentativaApproval(
					req.params.id,
					req.body || {},
					req.user || {},
				),
			);
		}),
	);

	router.post(
		"/evidencias/:id/aprovar",
		requireAuthenticated,
		requireCsrfToken,
		requireBackofficeManage,
		asyncHandler(async (req, res) => {
			res.json(
				await service.updateEvidenciaApproval(
					req.params.id,
					req.body || {},
					req.user || {},
				),
			);
		}),
	);

	router.get(
		"/financeiro",
		requireAuthenticated,
		requireFinanceiroView,
		asyncHandler(async (req, res) => {
			res.json(await service.listFinanceiro(req.query || {}, req.user || {}));
		}),
	);

	router.get(
		"/financeiro/export.csv",
		requireAuthenticated,
		requireAnyPermission(["mercado.financeiro.export", "mercado.financeiro.manage"], []),
		asyncHandler(async (req, res) => {
			const csv = await service.exportFinanceiroCsv(req.query || {}, req.user || {});
			res.setHeader("Content-Type", "text/csv; charset=utf-8");
			res.setHeader(
				"Content-Disposition",
				`attachment; filename="mercado-financeiro-${req.query?.competencia || "apuracao"}.csv"`,
			);
			res.send(csv);
		}),
	);

	router.post(
		"/financeiro/apuracoes",
		requireAuthenticated,
		requireCsrfToken,
		requireFinanceiroManage,
		asyncHandler(async (req, res) => {
			res.json(await service.gerarApuracao(req.body || {}, req.user || {}));
		}),
	);

	router.post(
		"/financeiro/apuracoes/:id/pagamento",
		requireAuthenticated,
		requireCsrfToken,
		requireFinanceiroManage,
		asyncHandler(async (req, res) => {
			res.json(
				await service.registerPagamento(
					req.params.id,
					req.body || {},
					req.user || {},
				),
			);
		}),
	);

	router.post(
		"/suspensoes/recalcular",
		requireAuthenticated,
		requireCsrfToken,
		requireBackofficeManage,
		asyncHandler(async (req, res) => {
			res.json(await service.recalcularSuspensoes(req.body || {}, req.user || {}));
		}),
	);

	router.get(
		"/historico",
		requireAuthenticated,
		requireAnyPermission(["mercado.auditoria.view", "mercado.lotes.view"], []),
		asyncHandler(async (req, res) => {
			res.json(await service.historico(req.query || {}, req.user || {}));
		}),
	);

	router.get(
		"/execucao",
		requireAuthenticated,
		requireExecucaoView,
		asyncHandler(async (req, res) => {
			res.json(
				await service.listLotes(
					{ ...(req.query || {}), status: req.query?.status || "ACCEPTED" },
					req.user || {},
				),
			);
		}),
	);

	return router;
}

module.exports = createMercadoRouter;
