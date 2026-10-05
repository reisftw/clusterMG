const express = require("express");
const service = require("../tentativasService");

function createTentativasRouter({
	requireAnyPermission,
	requireAuthenticated,
	requireCsrfToken,
	fallbackRoles = ["admin"],
} = {}) {
	const router = express.Router();
	const requireView = requireAnyPermission(service.VIEW_PERMISSIONS, fallbackRoles);
	const requireExecute = requireAnyPermission(
		service.EXECUTE_PERMISSIONS,
		fallbackRoles,
	);
	const requireHistory = requireAnyPermission(
		service.HISTORY_PERMISSIONS,
		fallbackRoles,
	);
	const requireDistribution = requireAnyPermission(
		service.DISTRIBUTE_PERMISSIONS,
		fallbackRoles,
	);
	const requireCampaign = requireAnyPermission(
		service.CAMPAIGN_PERMISSIONS,
		fallbackRoles,
	);
	const requireTemplate = requireAnyPermission(
		service.TEMPLATE_PERMISSIONS,
		fallbackRoles,
	);
	const requireSettings = requireAnyPermission(
		service.SETTINGS_PERMISSIONS,
		fallbackRoles,
	);
	const requireExport = requireAnyPermission(
		service.EXPORT_PERMISSIONS,
		fallbackRoles,
	);

	router.get("/cidades", requireAuthenticated, requireView, async (req, res, next) => {
		try {
			res.json(await service.listCities(req.query || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/minha-rota", requireAuthenticated, requireView, async (req, res, next) => {
		try {
			res.json(await service.getMyRoute(req.query || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/historico", requireAuthenticated, requireHistory, async (req, res, next) => {
		try {
			res.json(await service.listHistory(req.query || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get(
		"/historico/export.csv",
		requireAuthenticated,
		requireExport,
		async (req, res, next) => {
			try {
				const csv = await service.exportCsv(req.query || {}, req.user || {});
				res.setHeader("Content-Type", "text/csv; charset=utf-8");
				res.setHeader(
					"Content-Disposition",
					'attachment; filename="tentativas.csv"',
				);
				res.send(csv);
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/contacts/:id/resultado",
		requireAuthenticated,
		requireCsrfToken,
		requireExecute,
		async (req, res, next) => {
			try {
				res.json(await service.saveResult(req.params.id, req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/resumo",
		requireAuthenticated,
		requireDistribution,
		async (req, res, next) => {
			try {
				res.json(await service.getOverview(req.query || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/ranking",
		requireAuthenticated,
		requireDistribution,
		async (_req, res, next) => {
			try {
				res.json(await service.getRanking());
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/distribuicao",
		requireAuthenticated,
		requireDistribution,
		async (_req, res, next) => {
			try {
				res.json(await service.listDistribution());
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/cidades-tecnicos",
		requireAuthenticated,
		requireDistribution,
		async (_req, res, next) => {
			try {
				res.json(await service.listTechnicianCities());
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/admin/cidades-tecnicos",
		requireAuthenticated,
		requireCsrfToken,
		requireDistribution,
		async (req, res, next) => {
			try {
				res.json(await service.saveTechnicianCity(req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.delete(
		"/admin/cidades-tecnicos/:id",
		requireAuthenticated,
		requireCsrfToken,
		requireDistribution,
		async (req, res, next) => {
			try {
				res.json(await service.removeTechnicianCity(req.params.id, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/admin/campanhas",
		requireAuthenticated,
		requireCsrfToken,
		requireCampaign,
		async (req, res, next) => {
			try {
				res.json(await service.createCampaign(req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/templates",
		requireAuthenticated,
		requireTemplate,
		async (_req, res, next) => {
			try {
				res.json(await service.listTemplates());
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/admin/templates",
		requireAuthenticated,
		requireCsrfToken,
		requireTemplate,
		async (req, res, next) => {
			try {
				res.json(await service.saveTemplate(req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/configuracoes",
		requireAuthenticated,
		requireSettings,
		async (_req, res, next) => {
			try {
				res.json(await service.getSettings());
			} catch (error) {
				next(error);
			}
		},
	);

	router.put(
		"/admin/configuracoes",
		requireAuthenticated,
		requireCsrfToken,
		requireSettings,
		async (req, res, next) => {
			try {
				res.json(await service.saveSettings(req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get("/:id", requireAuthenticated, requireView, async (req, res, next) => {
		try {
			const item = await service.getOpportunity(req.params.id, req.user || {});
			if (!item) {
				res.status(404).json({ error: "Oportunidade nao encontrada." });
				return;
			}
			res.json(item);
		} catch (error) {
			next(error);
		}
	});

	router.post(
		"/:id/iniciar",
		requireAuthenticated,
		requireCsrfToken,
		requireExecute,
		async (req, res, next) => {
			try {
				res.json(await service.startContact(req.params.id, req.body || {}, req.user || {}, req));
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}

module.exports = createTentativasRouter;
