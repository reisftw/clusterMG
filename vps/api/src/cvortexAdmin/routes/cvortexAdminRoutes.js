const express = require("express");
const { createCvortexAdminController } = require("../controllers/cvortexAdminController");

function createCvortexAdminRouter({
  adminRoles,
  cvortexIntegration,
  requireAuthenticated,
  requireCsrfToken,
  requireRoles,
}) {
  const router = express.Router();
  const controller = createCvortexAdminController({ cvortexIntegration });
  const requireAdmin = requireRoles(adminRoles);

  router.get("/config", requireAuthenticated, requireAdmin, controller.readConfig);
  router.put("/config", requireAuthenticated, requireCsrfToken, requireAdmin, controller.saveConfig);
  router.post("/test", requireAuthenticated, requireCsrfToken, requireAdmin, controller.testConnection);
  router.post("/send-test", requireAuthenticated, requireCsrfToken, requireAdmin, controller.sendTestMessage);
  router.post("/associate", requireAuthenticated, requireCsrfToken, requireAdmin, controller.associateCvortex);

  return router;
}

module.exports = createCvortexAdminRouter;
