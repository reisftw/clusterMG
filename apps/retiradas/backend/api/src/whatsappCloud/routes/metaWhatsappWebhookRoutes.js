const express = require("express");

function createMetaWhatsappWebhookRouter({ service, onValidatedPayload }) {
	const router = express.Router();

	router.get("/", async (req, res, next) => {
		try {
			const mode = String(req.query["hub.mode"] || "");
			const token = String(req.query["hub.verify_token"] || "");
			const challenge = String(req.query["hub.challenge"] || "");
			if (mode !== "subscribe" || !(await service.verifyWebhookToken(token))) {
				res.status(403).send("Verification failed");
				return;
			}
			await service.markWebhookVerified();
			res.status(200).send(challenge);
		} catch (error) {
			next(error);
		}
	});

	router.post("/", async (req, res, next) => {
		try {
			const validation = await service.verifyWebhookSignature(
				req.rawBody,
				req.get("x-hub-signature-256"),
			);
			if (!validation.ok) {
				const status = validation.reason === "META_APP_SECRET_NOT_CONFIGURED" ? 503 : 401;
				res.status(status).json({ ok: false, error: validation.reason });
				return;
			}
			const result = await service.acceptWebhook(req.body || {}, {
				signatureValid: true,
			});
			if (typeof onValidatedPayload === "function") {
				await onValidatedPayload(req.body || {}).catch((error) => {
					console.error("[retorninho] Falha ao enfileirar webhook Meta:", error?.message || error);
				});
			}
			res.status(200).json(result);
		} catch (error) {
			next(error);
		}
	});

	return router;
}

module.exports = createMetaWhatsappWebhookRouter;
