function getProfile(req) {
  return req.user?.profile || req.user || {};
}

function createSeniorAdminController({ seniorIntegration }) {
  async function readConfig(_req, res, next) {
    try {
      res.json(await seniorIntegration.readConfig({ sanitized: true }));
    } catch (error) {
      next(error);
    }
  }

  async function saveConfig(req, res, next) {
    try {
      res.json(await seniorIntegration.saveConfig(req.body || {}, getProfile(req)));
    } catch (error) {
      next(error);
    }
  }

  async function testConnection(_req, res, next) {
    try {
      res.json(await seniorIntegration.testConnection());
    } catch (error) {
      next(error);
    }
  }

  return {
    readConfig,
    saveConfig,
    testConnection,
  };
}

module.exports = {
  createSeniorAdminController,
};
