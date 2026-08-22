function createMensageriaEvolutionController({ evolutionMessaging }) {
  async function getStatus(_req, res, next) {
    try {
      res.json({
        config: await evolutionMessaging.getConfig(),
        worker: evolutionMessaging.getStatus(),
        connection: await evolutionMessaging.getConnectionInfo(),
        accountsConnection: await evolutionMessaging.getAccountsConnectionInfo(),
      });
    } catch (error) {
      next(error);
    }
  }

  async function connect(_req, res, next) {
    try {
      res.json(await evolutionMessaging.createOrConnectInstance());
    } catch (error) {
      next(error);
    }
  }

  async function disconnect(_req, res, next) {
    try {
      res.json(await evolutionMessaging.logoutInstance());
    } catch (error) {
      next(error);
    }
  }

  async function configureWebhook(req, res, next) {
    try {
      if (req.body?.webhookUrl) {
        await evolutionMessaging.saveConfigPatch({ evolutionWebhookUrl: req.body.webhookUrl });
      }
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

  async function runQueueOnce(_req, res, next) {
    try {
      res.json(await evolutionMessaging.processQueueOnce({ manual: true }));
    } catch (error) {
      next(error);
    }
  }

  async function sendTestMessage(req, res, next) {
    try {
      res.json(await evolutionMessaging.sendTestMessage(req.body || {}, req.user));
    } catch (error) {
      next(error);
    }
  }

  async function pauseQueue(_req, res, next) {
    try {
      await evolutionMessaging.saveConfigPatch({ evolutionPaused: true });
      evolutionMessaging.resetNextRunAt();
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
        evolutionEnabled: provider === "evolution" ? true : Boolean(config.evolutionEnabled),
        officialWhatsappEnabled: provider === "official_whatsapp" ? true : Boolean(config.officialWhatsappEnabled),
      });
      evolutionMessaging.wakeQueueWorker();
      res.json({ ok: true, paused: false, autoSend: true, worker: evolutionMessaging.getStatus() });
    } catch (error) {
      next(error);
    }
  }

  return {
    configureWebhook,
    connect,
    disconnect,
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
