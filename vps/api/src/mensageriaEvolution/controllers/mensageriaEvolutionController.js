function createMensageriaEvolutionController({ evolutionMessaging }) {
	const statusCacheTtlMs = Math.max(
		Number(process.env.MENSAGERIA_EVOLUTION_STATUS_CACHE_TTL_MS || 5000),
		0,
	);
	let statusCache = null;
	let statusCachePromise = null;

	function clearStatusCache() {
		statusCache = null;
	}

	async function readStatusPayload() {
		if (
			statusCacheTtlMs &&
			statusCache &&
			Date.now() - statusCache.createdAt <= statusCacheTtlMs
		) {
			return {
				...statusCache.payload,
				cache: {
					hit: true,
					ageMs: Date.now() - statusCache.createdAt,
					ttlMs: statusCacheTtlMs,
				},
			};
		}
		if (!statusCachePromise) {
			statusCachePromise = (async () => {
				const config = await evolutionMessaging.getConfig();
				const connection = await evolutionMessaging.getConnectionInfo(config);
				if (
					String(config.whatsappProvider || "evolution") === "evolution" &&
					config.evolutionEnabled &&
					!config.evolutionPaused &&
					!connection.connected
				) {
					await evolutionMessaging.pauseQueueForDisconnectedEvolution({
						config,
						connection,
						source: "status",
					});
					clearStatusCache();
				}
				const payload = {
					config: await evolutionMessaging.getConfig(),
					worker: evolutionMessaging.getStatus(),
					connection,
					accountsConnection:
						await evolutionMessaging.getAccountsConnectionInfo(),
				};
				if (statusCacheTtlMs) statusCache = { createdAt: Date.now(), payload };
				return payload;
			})().finally(() => {
				statusCachePromise = null;
			});
		}
		return statusCachePromise;
	}

	async function getStatus(_req, res, next) {
		try {
			res.json(await readStatusPayload());
		} catch (error) {
			next(error);
		}
	}

	async function connect(_req, res, next) {
		try {
			clearStatusCache();
			res.json(await evolutionMessaging.createOrConnectInstance());
		} catch (error) {
			next(error);
		}
	}

	async function disconnect(_req, res, next) {
		try {
			clearStatusCache();
			res.json(await evolutionMessaging.logoutInstance());
		} catch (error) {
			next(error);
		}
	}

	async function configureWebhook(req, res, next) {
		try {
			if (req.body?.webhookUrl) {
				await evolutionMessaging.saveConfigPatch({
					evolutionWebhookUrl: req.body.webhookUrl,
				});
			}
			clearStatusCache();
			res.json(await evolutionMessaging.configureWebhook());
		} catch (error) {
			next(error);
		}
	}

	async function getWebhookInfo(_req, res, next) {
		try {
			res.json(await evolutionMessaging.getWebhookInfo());
		} catch (error) {
			next(error);
		}
	}

	async function getDisconnectLogs(req, res, next) {
		try {
			res.json(await evolutionMessaging.listDisconnectLogs(req.query?.limit));
		} catch (error) {
			next(error);
		}
	}

	async function runQueueOnce(_req, res, next) {
		try {
			res.json(await evolutionMessaging.processQueueOnce({ manual: true }));
		} catch (error) {
			next(error);
		}
	}

	async function sendTestMessage(req, res, next) {
		try {
			res.json(
				await evolutionMessaging.sendTestMessage(req.body || {}, req.user),
			);
		} catch (error) {
			next(error);
		}
	}

	async function pauseQueue(_req, res, next) {
		try {
			await evolutionMessaging.saveConfigPatch({ evolutionPaused: true });
			evolutionMessaging.resetNextRunAt();
			clearStatusCache();
			res.json({ ok: true, paused: true });
		} catch (error) {
			next(error);
		}
	}

	async function resumeQueue(_req, res, next) {
		try {
			const config = await evolutionMessaging.getConfig();
			const provider = String(config.whatsappProvider || "evolution");
			await evolutionMessaging.saveConfigPatch({
				evolutionPaused: false,
				autoSend: true,
				evolutionEnabled:
					provider === "evolution" ? true : Boolean(config.evolutionEnabled),
				officialWhatsappEnabled:
					provider === "official_whatsapp"
						? true
						: Boolean(config.officialWhatsappEnabled),
			});
			evolutionMessaging.wakeQueueWorker();
			clearStatusCache();
			res.json({
				ok: true,
				paused: false,
				autoSend: true,
				worker: evolutionMessaging.getStatus(),
			});
		} catch (error) {
			next(error);
		}
	}

	return {
		configureWebhook,
		connect,
		disconnect,
		getDisconnectLogs,
		getStatus,
		getWebhookInfo,
		pauseQueue,
		resumeQueue,
		runQueueOnce,
		sendTestMessage,
	};
}

module.exports = {
	createMensageriaEvolutionController,
};
