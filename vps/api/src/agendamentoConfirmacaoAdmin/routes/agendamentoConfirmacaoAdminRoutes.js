const express = require("express");
const { createAgendamentoConfirmacaoAdminController } = require("../controllers/agendamentoConfirmacaoAdminController");

function createAgendamentoConfirmacaoAdminRouter({
  adminRoles,
  agendamentoConfirmacao,
  fullOperationRoles,
  requireAuthenticated,
  requireCsrfToken,
  requireRoles,
}) {
  const router = express.Router();
  const controller = createAgendamentoConfirmacaoAdminController({ agendamentoConfirmacao });
  const requireAdmin = requireRoles(adminRoles);
  const requireFullOperation = requireRoles(fullOperationRoles);

  router.get("/config", requireAuthenticated, requireAdmin, controller.getConfig);
  router.put("/config", requireAuthenticated, requireCsrfToken, requireAdmin, controller.saveConfig);
  router.post("/run", requireAuthenticated, requireCsrfToken, requireAdmin, controller.runOnce);
  router.post("/test", requireAuthenticated, requireCsrfToken, requireAdmin, controller.sendTestMessage);
  router.get("/evolution/status", requireAuthenticated, requireAdmin, controller.getEvolutionStatus);
  router.post("/evolution/connect", requireAuthenticated, requireCsrfToken, requireAdmin, controller.connectEvolutionInstance);
  router.post("/evolution/disconnect", requireAuthenticated, requireCsrfToken, requireAdmin, controller.disconnectEvolutionInstance);
  router.post("/evolution/webhook", requireAuthenticated, requireCsrfToken, requireAdmin, controller.configureEvolutionWebhook);
  router.post("/envios/:id/responsavel", requireAuthenticated, requireCsrfToken, requireAdmin, controller.assignManualResponsible);
  router.get("/envios", requireAuthenticated, requireFullOperation, controller.listTracks);
  router.get("/logs", requireAuthenticated, requireFullOperation, controller.listLogs);
  router.get("/preview", requireAuthenticated, requireAdmin, controller.getPreview);
  router.get("/relatorio", requireAuthenticated, requireAdmin, controller.getReport);

  return router;
}

module.exports = createAgendamentoConfirmacaoAdminRouter;
