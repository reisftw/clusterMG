function getProfile(req) {
  return req.user?.profile || req.user || {};
}

function createAgendamentoConfirmacaoAdminController({ agendamentoConfirmacao }) {
  async function getConfig(_req, res, next) {
    try {
      res.json({ ok: true, config: await agendamentoConfirmacao.getConfig(), worker: await agendamentoConfirmacao.getStatus() });
    } catch (error) {
      next(error);
    }
  }

  async function saveConfig(req, res, next) {
    try {
      res.json({ ok: true, config: await agendamentoConfirmacao.saveConfig(req.body || {}) });
    } catch (error) {
      next(error);
    }
  }

  async function runOnce(req, res, next) {
    try {
      res.json(await agendamentoConfirmacao.processOnce({ forceMorning: req.body?.forceMorning === true }));
    } catch (error) {
      next(error);
    }
  }

  async function sendTestMessage(req, res, next) {
    try {
      res.json(await agendamentoConfirmacao.sendTestMessage(req.body || {}, getProfile(req)));
    } catch (error) {
      next(error);
    }
  }

  async function getEvolutionStatus(_req, res, next) {
    try {
      res.json(await agendamentoConfirmacao.getEvolutionStatus());
    } catch (error) {
      next(error);
    }
  }

  async function connectEvolutionInstance(_req, res, next) {
    try {
      res.json(await agendamentoConfirmacao.connectEvolutionInstance());
    } catch (error) {
      next(error);
    }
  }

  async function disconnectEvolutionInstance(_req, res, next) {
    try {
      res.json(await agendamentoConfirmacao.disconnectEvolutionInstance());
    } catch (error) {
      next(error);
    }
  }

  async function configureEvolutionWebhook(req, res, next) {
    try {
      res.json(await agendamentoConfirmacao.configureEvolutionWebhook(req.body?.webhookUrl || ""));
    } catch (error) {
      next(error);
    }
  }

  async function assignManualResponsible(req, res, next) {
    try {
      res.json(await agendamentoConfirmacao.assignManualResponsible(req.params.id, req.body || {}, getProfile(req)));
    } catch (error) {
      next(error);
    }
  }

  async function listTracks(req, res, next) {
    try {
      res.json(await agendamentoConfirmacao.listTracks({ limit: req.query.limit, offset: req.query.offset }));
    } catch (error) {
      next(error);
    }
  }

  async function listLogs(req, res, next) {
    try {
      res.json(await agendamentoConfirmacao.listLogs({ limit: req.query.limit, offset: req.query.offset }));
    } catch (error) {
      next(error);
    }
  }

  async function getPreview(req, res, next) {
    try {
      res.json(await agendamentoConfirmacao.getPreview({ dateKey: req.query.dateKey, daysAhead: req.query.daysAhead }));
    } catch (error) {
      next(error);
    }
  }

  async function getReport(_req, res, next) {
    try {
      res.json(await agendamentoConfirmacao.getReport());
    } catch (error) {
      next(error);
    }
  }

  return {
    assignManualResponsible,
    configureEvolutionWebhook,
    connectEvolutionInstance,
    disconnectEvolutionInstance,
    getConfig,
    getEvolutionStatus,
    getPreview,
    getReport,
    listLogs,
    listTracks,
    runOnce,
    saveConfig,
    sendTestMessage,
  };
}

module.exports = {
  createAgendamentoConfirmacaoAdminController,
};
