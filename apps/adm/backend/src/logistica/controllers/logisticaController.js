function createLogisticaController({ logisticaIntegration }) {
	async function readConfig(_req, res, next) {
		try {
			res.json(await logisticaIntegration.readConfig({ sanitized: true }));
		} catch (error) {
			next(error);
		}
	}

	async function saveConfig(req, res, next) {
		try {
			res.json(await logisticaIntegration.saveConfig(req.body || {}));
		} catch (error) {
			next(error);
		}
	}

	async function requestLalamoveQuotation(req, res, next) {
		try {
			res.json(
				await logisticaIntegration.requestLalamoveQuotation(req.body || {}),
			);
		} catch (error) {
			next(error);
		}
	}

	async function geocodeAddress(req, res, next) {
		try {
			res.json(await logisticaIntegration.geocodeAddress(req.body || {}));
		} catch (error) {
			next(error);
		}
	}

	return {
		geocodeAddress,
		readConfig,
		requestLalamoveQuotation,
		saveConfig,
	};
}

module.exports = {
	createLogisticaController,
};
