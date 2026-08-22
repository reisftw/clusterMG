const express = require("express");
const { createFinanceiroController } = require("../controllers/financeiroController");

function createFinanceiroRouter({
  financeiroManagePermissions,
  financeiroRoles,
  financeiroViewPermissions,
  requireAnyPermission,
  requireAuthenticated,
  requireCsrfToken,
}) {
  const router = express.Router();
  const controller = createFinanceiroController();
  const requireFinanceiroView = requireAnyPermission(financeiroViewPermissions, financeiroRoles);
  const requireFinanceiroManage = requireAnyPermission(financeiroManagePermissions, financeiroRoles);
  const requireConfigView = requireAnyPermission(
    ["financeiro.configuracoes.view", "financeiro.configuracoes.manage"],
    financeiroRoles,
  );

  router.get("/dashboard", requireAuthenticated, requireFinanceiroView, controller.getDashboard);
  router.post("/mockup", requireAuthenticated, requireCsrfToken, requireFinanceiroManage, controller.seedMockup);
  router.delete("/mockup", requireAuthenticated, requireCsrfToken, requireFinanceiroManage, controller.clearMockup);
  router.get("/sheets-config", requireAuthenticated, requireConfigView, controller.getSheetsConfig);
  router.put("/sheets-config", requireAuthenticated, requireCsrfToken, requireFinanceiroManage, controller.saveSheetsConfig);
  router.post("/sheets-config/test/:sourceId", requireAuthenticated, requireCsrfToken, requireFinanceiroManage, controller.testSheetSource);
  router.post("/sheets-config/sync", requireAuthenticated, requireCsrfToken, requireFinanceiroManage, controller.runSheetsImport);
  router.get("/sheets-config/logs", requireAuthenticated, requireConfigView, controller.listImportLogs);

  return router;
}

module.exports = createFinanceiroRouter;
