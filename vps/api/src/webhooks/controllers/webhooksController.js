const { verifyWebhookSecret } = require("../utils/webhookSecrets");

function createWebhooksController({
	agendamentoConfirmacao,
	atendimentoService,
	cvortexIntegration,
	evolutionMessaging,
}) {
	async function handleEvolutionWebhook(req, res, next) {
		try {
			if (
				!verifyWebhookSecret(req, res, "EVOLUTION_WEBHOOK_SECRET", "Evolution")
			) {
				return;
			}
			const confirmationResult = await agendamentoConfirmacao
				.registerIncomingResponse(req.body || {})
				.catch((error) => {
					console.warn(
						"[confirmacao-agendamentos] Falha ao processar resposta:",
						error?.message || error,
					);
					return null;
				});
			if (confirmationResult?.confirmed) {
				res.json({ ok: true, confirmation: confirmationResult });
				return;
			}
			const result = await evolutionMessaging.registerCallback({
				...(req.body || {}),
				webhookEvent: req.params?.event || req.body?.event || "",
			});
			res.json(result);
		} catch (error) {
			next(error);
		}
	}

	async function handleEvolutionConfirmationWebhook(req, res, next) {
		try {
			if (
				!verifyWebhookSecret(
					req,
					res,
					"EVOLUTION_CONFIRMATION_WEBHOOK_SECRET",
					"Evolution confirmação",
				)
			) {
				return;
			}
			const confirmationResult =
				await agendamentoConfirmacao.registerIncomingResponse(req.body || {});
			res.json({ ok: true, confirmation: confirmationResult });
		} catch (error) {
			next(error);
		}
	}

	async function handleEvolutionAtendimentoWebhook(req, res, next) {
		try {
			const verification = await atendimentoService.verifyWebhookRequest(req);
			if (!verification.ok) {
				res
					.status(verification.error?.includes("sem segredo") ? 503 : 401)
					.json({ error: verification.error || "Webhook nao autorizado." });
				return;
			}
			const result = await atendimentoService.handleEvolutionWebhook({
				...(req.body || {}),
				webhookEvent: req.params?.event || req.body?.event || "",
			});
			res.json(result);
		} catch (error) {
			next(error);
		}
	}

	async function handleCvortexWebhook(req, res, next) {
		try {
			const verification = await cvortexIntegration.verifyWebhookSecret(req);
			if (!verification.ok) {
				res.status(401).json({ error: "Webhook Cvortex não autorizado." });
				return;
			}
			const result = await evolutionMessaging.registerCallback({
				...(req.body || {}),
				webhookEvent: req.body?.event || req.body?.type || "cvortex",
			});
			res.json(result);
		} catch (error) {
			next(error);
		}
	}

	async function verifyOfficialWhatsappWebhook(req, res, next) {
		try {
			const config = await evolutionMessaging.getConfig();
			const expectedToken = String(
				process.env.WHATSAPP_OFFICIAL_VERIFY_TOKEN ||
					config.officialWebhookVerifyToken ||
					"",
			);
			const mode = String(req.query["hub.mode"] || "");
			const token = String(req.query["hub.verify_token"] || "");
			const challenge = String(req.query["hub.challenge"] || "");
			if (mode === "subscribe" && expectedToken && token === expectedToken) {
				res.status(200).send(challenge);
				return;
			}
			res.status(403).json({ error: "Webhook oficial nao autorizado." });
		} catch (error) {
			next(error);
		}
	}

	async function handleOfficialWhatsappWebhook(req, res, next) {
		try {
			if (
				!verifyWebhookSecret(
					req,
					res,
					"WHATSAPP_OFFICIAL_WEBHOOK_SECRET",
					"WhatsApp Oficial",
				)
			) {
				return;
			}
			res.json(
				await evolutionMessaging.registerCallback({
					...(req.body || {}),
					webhookEvent: "whatsapp_official",
				}),
			);
		} catch (error) {
			next(error);
		}
	}

	return {
		handleCvortexWebhook,
		handleEvolutionAtendimentoWebhook,
		handleEvolutionConfirmationWebhook,
		handleEvolutionWebhook,
		handleOfficialWhatsappWebhook,
		verifyOfficialWhatsappWebhook,
	};
}

module.exports = {
	createWebhooksController,
};
