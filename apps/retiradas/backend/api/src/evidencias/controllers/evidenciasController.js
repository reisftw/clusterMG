const evidenciasService = require("../services/evidenciasService");

function createEvidenciasController() {
	return {
		async dashboard(req, res, next) {
			try {
				res.json(await evidenciasService.getDashboard());
			} catch (error) {
				next(error);
			}
		},
		async list(req, res, next) {
			try {
				res.json(await evidenciasService.listEvidences(req.query || {}));
			} catch (error) {
				next(error);
			}
		},
		async detail(req, res, next) {
			try {
				const evidence = await evidenciasService.getEvidence(req.params.id);
				if (!evidence) {
					res.status(404).json({ error: "Evidencia nao encontrada." });
					return;
				}
				res.json(evidence);
			} catch (error) {
				next(error);
			}
		},
		async retry(req, res, next) {
			try {
				res.json(
					await evidenciasService.retryStep(
						req.params.id,
						req.body?.stepType || req.params.stepType,
						req.user,
					),
				);
			} catch (error) {
				next(error);
			}
		},
	};
}

module.exports = {
	createEvidenciasController,
};
