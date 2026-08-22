const express = require("express");
const { createWebhooksController } = require("../controllers/webhooksController");

function createWebhooksRouter({
  agendamentoConfirmacao,
  cvortexIntegration,
  evolutionMessaging,
}) {
  const router = express.Router();
  const controller = createWebhooksController({
    agendamentoConfirmacao,
    cvortexIntegration,
    evolutionMessaging,
  });

  router.post("/evolution", controller.handleEvolutionWebhook);
  router.post("/evolution/:event", controller.handleEvolutionWebhook);
  router.post("/evolution-confirmacao", controller.handleEvolutionConfirmationWebhook);
  router.post("/evolution-confirmacao/:event", controller.handleEvolutionConfirmationWebhook);
  router.post("/cvortex", controller.handleCvortexWebhook);
  router.get("/whatsapp-official", controller.verifyOfficialWhatsappWebhook);
  router.post("/whatsapp-official", controller.handleOfficialWhatsappWebhook);

  return router;
}

module.exports = createWebhooksRouter;
