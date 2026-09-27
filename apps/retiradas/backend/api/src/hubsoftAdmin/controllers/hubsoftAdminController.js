function getProfile(req) {
	return req.user?.profile || req.user || {};
}

function createHubsoftAdminController({ hubsoftIntegration, hubsoftSyncProfiles }) {
	async function readConfig(_req, res, next) {
		try {
			res.json(await hubsoftIntegration.readConfig({ sanitized: true }));
		} catch (error) {
			next(error);
		}
	}

	async function saveConfig(req, res, next) {
		try {
			res.json(
				await hubsoftIntegration.saveConfig(req.body || {}, getProfile(req)),
			);
		} catch (error) {
			next(error);
		}
	}

	async function testConnection(_req, res, next) {
		try {
			res.json(await hubsoftIntegration.testConnection());
		} catch (error) {
			next(error);
		}
	}

	async function associateHubsoft(req, res, next) {
		try {
			res.json(await hubsoftIntegration.associateHubsoft(getProfile(req)));
		} catch (error) {
			next(error);
		}
	}

	async function searchOrdensServico(req, res, next) {
		try {
			res.json(await hubsoftIntegration.searchOrdensServico(req.query || {}));
		} catch (error) {
			next(error);
		}
	}

	async function startSyncJob(req, res, next) {
		try {
			res.json(
				await hubsoftIntegration.startSyncJob(req.body || {}, req.user || {}),
			);
		} catch (error) {
			next(error);
		}
	}

	async function getSyncJob(req, res, next) {
		try {
			const job = await hubsoftIntegration.getSyncJob(req.params.jobId);
			if (!job) {
				res.status(404).json({ error: "Job Hubsoft nao encontrado." });
				return;
			}
			res.json(job);
		} catch (error) {
			next(error);
		}
	}

	async function listSyncRuns(req, res, next) {
		try {
			res.json({
				items: await hubsoftIntegration.listSyncRuns(req.query || {}),
			});
		} catch (error) {
			next(error);
		}
	}

	async function listProfiles(_req, res, next) {
		try {
			res.json({
				items: await hubsoftSyncProfiles.getProfilesOverview(),
			});
		} catch (error) {
			next(error);
		}
	}

	async function runProfile(req, res, next) {
		try {
			if (req.body?.async === true) {
				res.status(202).json(
					await hubsoftSyncProfiles.startProfileRun(
						req.params.profile,
						req.body || {},
						req.user || {},
					),
				);
				return;
			}
			res.json(
				await hubsoftSyncProfiles.runProfile(
					req.params.profile,
					req.body || {},
					req.user || {},
				),
			);
		} catch (error) {
			next(error);
		}
	}

	async function runMetaAudit(req, res, next) {
		try {
			res.status(202).json(
				await hubsoftSyncProfiles.startMetaAudit(
					req.body?.dates || [],
					req.user || {},
				),
			);
		} catch (error) {
			next(error);
		}
	}

	async function listProfileRuns(req, res, next) {
		try {
			res.json({
				items: await hubsoftSyncProfiles.listRuns(req.query || {}),
			});
		} catch (error) {
			next(error);
		}
	}

	async function listRecords(req, res, next) {
		try {
			res.json({
				items: await hubsoftSyncProfiles.listRecords(req.query || {}),
			});
		} catch (error) {
			next(error);
		}
	}

	async function listWithdrawalTechnicians(_req, res, next) {
		try {
			res.json({
				items: await hubsoftSyncProfiles.listWithdrawalTechnicians(),
			});
		} catch (error) {
			next(error);
		}
	}

	async function saveWithdrawalTechnician(req, res, next) {
		try {
			res.json(
				await hubsoftSyncProfiles.upsertWithdrawalTechnician(
					req.body || {},
					req.user || {},
				),
			);
		} catch (error) {
			next(error);
		}
	}

	async function discoverWithdrawalTechnicians(req, res, next) {
		try {
			res.json(
				await hubsoftSyncProfiles.discoverWithdrawalTechnicians(req.user || {}),
			);
		} catch (error) {
			next(error);
		}
	}

	return {
		associateHubsoft,
		discoverWithdrawalTechnicians,
		getSyncJob,
		listProfileRuns,
		listProfiles,
		listRecords,
		listSyncRuns,
		listWithdrawalTechnicians,
		readConfig,
		runProfile,
		runMetaAudit,
		saveConfig,
		saveWithdrawalTechnician,
		searchOrdensServico,
		startSyncJob,
		testConnection,
	};
}

module.exports = {
	createHubsoftAdminController,
};
