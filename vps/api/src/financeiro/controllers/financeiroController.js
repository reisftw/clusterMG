const financeiro = require("../../financeiro");

function createFinanceiroController() {
  async function getDashboard(_req, res, next) {
    try {
      res.json(await financeiro.getDashboard());
    } catch (error) {
      next(error);
    }
  }

  async function seedMockup(req, res, next) {
    try {
      res.json(await financeiro.seedMockup(req.user));
    } catch (error) {
      next(error);
    }
  }

  async function clearMockup(_req, res, next) {
    try {
      res.json(await financeiro.clearMockup());
    } catch (error) {
      next(error);
    }
  }

  async function getSheetsConfig(_req, res, next) {
    try {
      res.json(await financeiro.getSheetsConfig());
    } catch (error) {
      next(error);
    }
  }

  async function saveSheetsConfig(req, res, next) {
    try {
      res.json(await financeiro.saveSheetsConfig(req.body || {}, req.user));
    } catch (error) {
      next(error);
    }
  }

  async function testSheetSource(req, res, next) {
    try {
      res.json(await financeiro.testSheetSource(req.params.sourceId));
    } catch (error) {
      next(error);
    }
  }

  async function runSheetsImport(req, res, next) {
    try {
      res.json(await financeiro.runSheetsImport(req.user, { manual: true }));
    } catch (error) {
      next(error);
    }
  }

  async function listImportLogs(req, res, next) {
    try {
      res.json(await financeiro.listImportLogs(req.query.limit));
    } catch (error) {
      next(error);
    }
  }

  return {
    clearMockup,
    getDashboard,
    getSheetsConfig,
    listImportLogs,
    runSheetsImport,
    saveSheetsConfig,
    seedMockup,
    testSheetSource,
  };
}

module.exports = {
  createFinanceiroController,
};
