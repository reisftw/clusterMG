import { createRequire } from "node:module";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(
	path.join(process.cwd(), "apps/retiradas/backend/package.json"),
);
const express = require("express");
const routerPath = require.resolve(
	"./api/src/pushNotifications/routes/pushNotificationsRoutes.js",
);
const pushServicePath = require.resolve("./api/src/pushNotificationsService.js");

function loadRouter() {
	delete require.cache[routerPath];
	require.cache[pushServicePath] = {
		id: pushServicePath,
		filename: pushServicePath,
		loaded: true,
		exports: {},
	};
	return require(routerPath);
}

function buildApp() {
	const createPushNotificationsRouter = loadRouter();
	const notificationsService = {
		createNotification: vi.fn(async (payload) => ({
			id: "notification-1",
			...payload,
			pushDelivery: { selected: 3, sent: 2, failed: 1 },
		})),
	};
	const pushService = {
		estimateAudience: vi.fn(async () => 12),
		getOverview: vi.fn(async () => ({ active: 3, users: 2, allUsers: 12 })),
		listCampaigns: vi.fn(async () => ({ items: [], page: 1, totalPages: 1, total: 0 })),
		listRecipients: vi.fn(async () => [{ id: "user-1", name: "Pessoa", activeDevices: 1 }]),
		saveCampaign: vi.fn(async ({ notification, targetMode, audienceCount }) => ({
			id: 1,
			notificationId: notification.id,
			targetMode,
			audienceCount,
			sentDevices: notification.pushDelivery.sent,
		})),
	};
	const app = express();
	app.use(express.json());
	const auth = (req, _res, next) => {
		req.user = { profile: { uid: "admin-1", email: "admin@example.com", role: "admin" } };
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
		"/api/push",
		createPushNotificationsRouter({
			adminRoles: [],
			notificationsService,
			pushService,
			requireAnyPermission: permission,
			requireAuthenticated: auth,
			requireCsrfToken: csrf,
		}),
	);
	app.use((error, _req, res, _next) => {
		res.status(error.statusCode || 500).json({ error: error.message });
	});
	return { app, notificationsService, pushService };
}

describe("push admin routes", () => {
	afterEach(() => {
		delete require.cache[routerPath];
		delete require.cache[pushServicePath];
		vi.restoreAllMocks();
	});

	it("protege leitura e envio com RBAC e CSRF", async () => {
		const { app } = buildApp();
		await request(app).get("/api/push/admin/campaigns").expect(403);
		await request(app)
			.get("/api/push/admin/campaigns")
			.set("x-permission", "configuracao.push.view")
			.expect(200);
		await request(app)
			.post("/api/push/send")
			.set("x-permission", "configuracao.push.manage")
			.send({ title: "Aviso", message: "Mensagem" })
			.expect(403);
	});

	it("envia para todos e registra a campanha", async () => {
		const { app, notificationsService, pushService } = buildApp();
		const response = await request(app)
			.post("/api/push/send")
			.set("x-permission", "configuracao.push.manage")
			.set("x-test-csrf", "ok")
			.send({
				title: "Aviso operacional",
				message: "Confira sua rota.",
				targetMode: "ALL",
				targetPath: "/maps",
				severity: "warning",
			})
			.expect(201);

		expect(response.body.campaign).toMatchObject({
			targetMode: "ALL",
			audienceCount: 12,
			sentDevices: 2,
		});
		expect(notificationsService.createNotification).toHaveBeenCalledWith(
			expect.objectContaining({
				targets: { all: true },
				targetPath: "/maps",
				severity: "warning",
			}),
		);
		expect(pushService.saveCampaign).toHaveBeenCalledOnce();
	});

	it("recusa envio individual sem destinatario", async () => {
		const { app, notificationsService } = buildApp();
		await request(app)
			.post("/api/push/send")
			.set("x-permission", "configuracao.push.manage")
			.set("x-test-csrf", "ok")
			.send({ title: "Aviso", message: "Mensagem", targetMode: "USERS" })
			.expect(400);
		expect(notificationsService.createNotification).not.toHaveBeenCalled();
	});
});
