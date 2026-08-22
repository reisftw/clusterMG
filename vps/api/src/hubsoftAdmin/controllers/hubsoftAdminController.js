function getProfile(req) {
  return req.user?.profile || req.user || {};
}

function createHubsoftAdminController({ hubsoftIntegration }) {
  async function readConfig(_req, res, next) {
    try {
      res.json(await hubsoftIntegration.readConfig({ sanitized: true }));
    } catch (error) {
      next(error);
    }
  }

  async function saveConfig(req, res, next) {
    try {
      res.json(await hubsoftIntegration.saveConfig(req.body || {}, getProfile(req)));
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
      res.json(await hubsoftIntegration.startSyncJob(req.body || {}, req.user || {}));
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
      res.json({ items: await hubsoftIntegration.listSyncRuns(req.query || {}) });
    } catch (error) {
      next(error);
    }
  }

  return {
    associateHubsoft,
    getSyncJob,
    listSyncRuns,
    readConfig,
    saveConfig,
    searchOrdensServico,
    startSyncJob,
    testConnection,
  };
}

module.exports = {
  createHubsoftAdminController,
};
