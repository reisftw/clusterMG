const express = require("express");
const { createNotificationsController } = require("../controllers/notificationsController");

function createNotificationsRouter({
  adminRoles,
  notificationsService,
  requireAnyPermission,
  requireAuthenticated,
  requireCsrfToken,
}) {
  const router = express.Router();
  const controller = createNotificationsController({ notificationsService });
  const requireGeneralManage = requireAnyPermission(["configuracao.geral.manage", "manage_general_settings"], adminRoles);
  const requireNotificationsManage = requireAnyPermission(
    ["configuracao.notificacoes.manage", "manage_general_settings"],
    adminRoles,
  );

  router.get("/", requireAuthenticated, controller.listNotifications);
  router.get("/stats", requireAuthenticated, controller.getNotificationStats);
  router.get("/preferences", requireAuthenticated, controller.getPreferences);
  router.put("/preferences", requireAuthenticated, requireGeneralManage, requireCsrfToken, controller.savePreferences);
  router.get("/counters", requireAuthenticated, controller.getCounters);
  router.post("/read", requireAuthenticated, requireCsrfToken, controller.markNotificationsRead);
  router.post(
    "/check-critical",
    requireAuthenticated,
    requireNotificationsManage,
    requireCsrfToken,
    controller.createCriticalServiceAlerts,
  );

  return router;
}

module.exports = createNotificationsRouter;
