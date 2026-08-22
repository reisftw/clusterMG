function getProfile(req) {
  return req.user?.profile || req.user || {};
}

function createCvortexAdminController({ cvortexIntegration }) {
  async function readConfig(_req, res, next) {
    try {
      res.json(await cvortexIntegration.readConfig({ sanitized: true }));
    } catch (error) {
      next(error);
    }
  }

  async function saveConfig(req, res, next) {
    try {
      res.json(await cvortexIntegration.saveConfig(req.body || {}, getProfile(req)));
    } catch (error) {
      next(error);
    }
  }

  async function testConnection(_req, res, next) {
    try {
      res.json(await cvortexIntegration.testConnection());
    } catch (error) {
      next(error);
    }
  }

  async function sendTestMessage(req, res, next) {
    try {
      res.json(await cvortexIntegration.sendTestMessage(req.body || {}, req.user));
    } catch (error) {
      next(error);
    }
  }

  async function associateCvortex(req, res, next) {
    try {
      res.json(await cvortexIntegration.associateCvortex(getProfile(req)));
    } catch (error) {
      next(error);
    }
  }

  return {
    associateCvortex,
    readConfig,
    saveConfig,
    sendTestMessage,
    testConnection,
  };
}

module.exports = {
  createCvortexAdminController,
};
