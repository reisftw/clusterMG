function createAtendimentoController({ atendimentoService }) {
	const wrap = (handler) => async (req, res, next) => {
		try {
			await handler(req, res);
		} catch (error) {
			next(error);
		}
	};

	return {
		getStatus: wrap(async (_req, res) =>
			res.json(await atendimentoService.getStatus()),
		),
		getStats: wrap(async (_req, res) =>
			res.json(await atendimentoService.getStats()),
		),
		getConfig: wrap(async (_req, res) =>
			res.json(await atendimentoService.readConfig({ sanitized: true })),
		),
		saveConfig: wrap(async (req, res) =>
			res.json(await atendimentoService.saveConfig(req.body || {}, req.user)),
		),
		getTemplates: wrap(async (_req, res) =>
			res.json(await atendimentoService.readTemplates()),
		),
		saveTemplates: wrap(async (req, res) =>
			res.json(
				await atendimentoService.saveTemplates(
					req.body?.templates || req.body || {},
					req.user,
				),
			),
		),
		connect: wrap(async (_req, res) =>
			res.json(await atendimentoService.connect()),
		),
		disconnect: wrap(async (_req, res) =>
			res.json(await atendimentoService.disconnect()),
		),
		resetInstance: wrap(async (_req, res) =>
			res.json(await atendimentoService.resetInstance()),
		),
		configureWebhook: wrap(async (_req, res) =>
			res.json(await atendimentoService.configureWebhook()),
		),
		sendTestMessage: wrap(async (req, res) =>
			res.json(
				await atendimentoService.sendTestMessage(req.body || {}, req.user),
			),
		),
		listCases: wrap(async (req, res) =>
			res.json(await atendimentoService.listCases(req.query || {})),
		),
		getCase: wrap(async (req, res) =>
			res.json(await atendimentoService.getCase(req.params.id)),
		),
		updateCase: wrap(async (req, res) =>
			res.json(
				await atendimentoService.updateCase(
					req.params.id,
					req.body || {},
					req.user,
				),
			),
		),
		replyCase: wrap(async (req, res) =>
			res.json(
				await atendimentoService.replyCase(
					req.params.id,
					req.body || {},
					req.user,
				),
			),
		),
		listTechnicians: wrap(async (req, res) =>
			res.json(await atendimentoService.listTechnicians(req.query || {})),
		),
		updateTechnician: wrap(async (req, res) =>
			res.json(
				await atendimentoService.updateTechnician(
					req.params.phone,
					req.body || {},
					req.user,
				),
			),
		),
		deleteTechnician: wrap(async (req, res) =>
			res.json(
				await atendimentoService.deleteTechnician(req.params.phone, req.user),
			),
		),
		validateHubsoftEmail: wrap(async (req, res) =>
			res.json(
				await atendimentoService.validateHubsoftEmail(req.body?.email || ""),
			),
		),
		listRatings: wrap(async (req, res) =>
			res.json(await atendimentoService.listRatings(req.query || {})),
		),
		listLogs: wrap(async (req, res) =>
			res.json(await atendimentoService.listLogs(req.query || {})),
		),
		listMessages: wrap(async (req, res) =>
			res.json(await atendimentoService.listMessages(req.query || {})),
		),
		clearOperationalData: wrap(async (req, res) =>
			res.json(await atendimentoService.clearOperationalData(req.user)),
		),
	};
}

module.exports = {
	createAtendimentoController,
};
