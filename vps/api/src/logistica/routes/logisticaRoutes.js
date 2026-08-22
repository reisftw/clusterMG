const express = require("express");
const { createLogisticaController } = require("../controllers/logisticaController");

function createLogisticaRouter({
  fullOperationRoles,
  logisticaIntegration,
  requireAuthenticated,
  requireCsrfToken,
  requireRoles,
}) {
  const router = express.Router();
  const controller = createLogisticaController({ logisticaIntegration });
  const requireFullOperation = requireRoles(fullOperationRoles);

  router.get("/config", requireAuthenticated, requireFullOperation, controller.readConfig);
  router.put("/config", requireAuthenticated, requireCsrfToken, requireFullOperation, controller.saveConfig);
  router.post("/lalamove/quote", requireAuthenticated, requireCsrfToken, requireFullOperation, controller.requestLalamoveQuotation);
  router.post("/geocode", requireAuthenticated, requireCsrfToken, requireFullOperation, controller.geocodeAddress);

  return router;
}

module.exports = createLogisticaRouter;
