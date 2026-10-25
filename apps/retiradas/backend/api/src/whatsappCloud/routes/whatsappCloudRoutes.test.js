const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");
const request = require("supertest");
const createRouter = require("./whatsappCloudRoutes");

function buildApp() {
	let sends = 0;
	let guidedFlows = 0;
	const service = {
		getOverview: async () => ({ ok: true }),
		getConfig: async () => ({}),
		saveConfig: async (body) => body,
		saveSecrets: async () => ({ ok: true }),
		deleteSecret: async () => ({ ok: true }),
		generateVerifyToken: async () => ({ token: "one-time" }),
		validateConnection: async () => ({ ok: true }),
		listRecipients: async () => [],
		addRecipient: async (body) => body,
		revokeRecipient: async () => ({ ok: true }),
		listTemplates: async () => [],
		syncTemplates: async () => ({ items: [] }),
		listTestMessages: async () => ({ items: [] }),
		listTestFlows: async () => ({ items: [] }),
		sendTestMessage: async () => {
			sends += 1;
			return { status: "ACCEPTED" };
		},
		startTestFlow: async () => {
			guidedFlows += 1;
			return { state: "AWAITING_ACTION" };
		},
		listWebhookEvents: async () => ({ items: [] }),
		getActivationReadiness: async () => ({ ready: false, checks: [] }),
		activateProvider: async () => ({ ok: true }),
		rollbackProvider: async () => ({ ok: true }),
	};
	const app = express();
	app.use(express.json());
	const auth = (req, _res, next) => {
		req.user = { uid: "admin-1" };
		next();
	};
	const csrf = (req, res, next) => {
		if (req.get("x-test-csrf") !== "ok") {
			res.status(403).json({ error: "CSRF" });
			return;
		}
		next();
	};
	const permission = (permissions) => (req, res, next) => {
		if (!permissions.includes(req.get("x-permission"))) {
			res.status(403).json({ error: "Permissao insuficiente." });
			return;
		}
		next();
	};
	app.use(
		createRouter({
			service,
			requireAuthenticated: auth,
			requireCsrfToken: csrf,
			requireAnyPermission: permission,
			adminRoles: [],
		}),
	);
	return {
		app,
		getSends: () => sends,
		getGuidedFlows: () => guidedFlows,
	};
}

test("RBAC protege leitura e escrita e CSRF protege envio real", async () => {
	const context = buildApp();
	await request(context.app).get("/overview").expect(403);
	await request(context.app)
		.get("/overview")
		.set("x-permission", "whatsapp.visualizar")
		.expect(200);
	await request(context.app)
		.post("/tests/send")
		.set("x-permission", "whatsapp.testar")
		.send({})
		.expect(403);
	await request(context.app)
		.post("/tests/send")
		.set("x-permission", "whatsapp.testar")
		.set("x-test-csrf", "ok")
		.send({})
		.expect(202);
	assert.equal(context.getSends(), 1);
	await request(context.app)
		.post("/tests/flows/start")
		.set("x-permission", "whatsapp.testar")
		.send({})
		.expect(403);
	await request(context.app)
		.post("/tests/flows/start")
		.set("x-permission", "whatsapp.testar")
		.set("x-test-csrf", "ok")
		.send({})
		.expect(202);
	assert.equal(context.getGuidedFlows(), 1);
});
