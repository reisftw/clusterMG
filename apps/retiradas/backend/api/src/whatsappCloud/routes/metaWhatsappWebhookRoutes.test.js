const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");
const request = require("supertest");
const createRouter = require("./metaWhatsappWebhookRoutes");

function buildApp(service) {
	const app = express();
	app.use(
		express.json({
			verify(req, _res, buffer) {
				req.rawBody = Buffer.from(buffer);
			},
		}),
	);
	app.use(createRouter({ service }));
	return app;
}

test("responde o challenge somente para verify token válido", async () => {
	let verified = false;
	const app = buildApp({
		verifyWebhookToken: async (token) => token === "token-correto",
		markWebhookVerified: async () => {
			verified = true;
		},
	});
	await request(app)
		.get("/?hub.mode=subscribe&hub.verify_token=incorreto&hub.challenge=123")
		.expect(403);
	const response = await request(app)
		.get("/?hub.mode=subscribe&hub.verify_token=token-correto&hub.challenge=123")
		.expect(200);
	assert.equal(response.text, "123");
	assert.equal(verified, true);
});

test("rejeita assinatura inválida e aceita evento assinado", async () => {
	let accepted = 0;
	const service = {
		verifyWebhookSignature: (_raw, signature) => ({
			ok: signature === "sha256=valida",
			reason: "SIGNATURE_MISMATCH",
		}),
		acceptWebhook: async () => {
			accepted += 1;
			return { ok: true, accepted: 1, duplicates: 0 };
		},
	};
	const app = buildApp(service);
	await request(app).post("/").send({ object: "x" }).expect(401);
	await request(app)
		.post("/")
		.set("x-hub-signature-256", "sha256=valida")
		.send({ object: "x" })
		.expect(200);
	assert.equal(accepted, 1);
});
