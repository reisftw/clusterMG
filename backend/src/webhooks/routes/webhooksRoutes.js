const express = require("express");
const {
	createWebhooksController,
} = require("../controllers/webhooksController");

function createWebhooksRouter({
	agendamentoConfirmacao,
	atendimentoService,
	cvortexIntegration,
	evolutionMessaging,
}) {
	const router = express.Router();
	const controller = createWebhooksController({
		agendamentoConfirmacao,
		atendimentoService,
		cvortexIntegration,
		evolutionMessaging,
	});

	router.post("/evolution", controller.handleEvolutionWebhook);
	router.post("/evolution/:event", controller.handleEvolutionWebhook);
	router.post(
		"/evolution-confirmacao",
		controller.handleEvolutionConfirmationWebhook,
	);
	router.post(
		"/evolution-confirmacao/:event",
		controller.handleEvolutionConfirmationWebhook,
	);
	router.post(
		"/evolution-atendimento",
		controller.handleEvolutionAtendimentoWebhook,
	);
	router.post(
		"/evolution-atendimento/:event",
		controller.handleEvolutionAtendimentoWebhook,
	);
	router.post("/cvortex", controller.handleCvortexWebhook);
	router.get("/whatsapp-official", controller.verifyOfficialWhatsappWebhook);
	router.post("/whatsapp-official", controller.handleOfficialWhatsappWebhook);

	return router;
}

module.exports = createWebhooksRouter;
