// Testes do Web Push (VAPID): sem chave configurada, fica desativado sem
// quebrar nada; com chave, inscrever/desinscrever funciona pro PROPRIO
// usuario, sem exigir nenhuma permissao especial alem de estar
// autenticado.
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFinanDbMock, loadFinanApp, sessionWithPermissions } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

function extendMockForPush(dbMock) {
	const fallbackQuery = dbMock.query.getMockImplementation();
	dbMock.query.mockImplementation(async (text, params = []) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");
		if (/from finan_push_subscriptions/i.test(sql)) {
			return { rows: [{ total: 0 }] };
		}
		if (/insert into finan_push_subscriptions/i.test(sql)) {
			return { rows: [] };
		}
		if (/delete from finan_push_subscriptions/i.test(sql)) {
			return { rows: [] };
		}
		return fallbackQuery(text, params);
	});
	return dbMock;
}

describe("Web Push: sem VAPID configurado", () => {
	let dbMock;
	let app;
	const originalPublic = process.env.FINAN_VAPID_PUBLIC_KEY;
	const originalPrivate = process.env.FINAN_VAPID_PRIVATE_KEY;

	beforeEach(() => {
		delete process.env.FINAN_VAPID_PUBLIC_KEY;
		delete process.env.FINAN_VAPID_PRIVATE_KEY;
		dbMock = extendMockForPush(createFinanDbMock({ session: sessionWithPermissions([]) }));
		app = loadFinanApp(dbMock);
	}, 30000);

	afterEach(() => {
		dbMock = null;
		app = null;
		if (originalPublic) process.env.FINAN_VAPID_PUBLIC_KEY = originalPublic;
		if (originalPrivate) process.env.FINAN_VAPID_PRIVATE_KEY = originalPrivate;
	});

	it("GET /push/vapid-public-key reporta enabled: false, sem quebrar", async () => {
		const response = await request(app)
			.get("/api/finan/push/vapid-public-key")
			.set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.enabled).toBe(false);
	});

	it("GET /push/status reporta enabled: false", async () => {
		const response = await request(app)
			.get("/api/finan/push/status")
			.set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.enabled).toBe(false);
	});
});

describe("Web Push: inscrição do próprio dispositivo", () => {
	let dbMock;
	let app;

	beforeEach(() => {
		process.env.FINAN_VAPID_PUBLIC_KEY = "fake-public-key-nao-usada-em-teste";
		process.env.FINAN_VAPID_PRIVATE_KEY = "fake-private-key-nao-usada-em-teste";
		dbMock = extendMockForPush(createFinanDbMock({ session: sessionWithPermissions([]) }));
		app = loadFinanApp(dbMock);
	}, 30000);

	afterEach(() => {
		dbMock = null;
		app = null;
		delete process.env.FINAN_VAPID_PUBLIC_KEY;
		delete process.env.FINAN_VAPID_PRIVATE_KEY;
	});

	it("GET sem autenticação -> 401", async () => {
		const response = await request(app).get("/api/finan/push/status");
		expect(response.status).toBe(401);
	});

	it("POST /push/subscribe rejeita inscrição sem endpoint/keys", async () => {
		const response = await request(app)
			.post("/api/finan/push/subscribe")
			.set("Authorization", BEARER)
			.send({ subscription: {} });
		expect(response.status).toBe(400);
	});

	it("POST /push/subscribe aceita uma inscrição válida", async () => {
		const response = await request(app)
			.post("/api/finan/push/subscribe")
			.set("Authorization", BEARER)
			.send({
				subscription: {
					endpoint: "https://fcm.googleapis.com/fake-endpoint",
					keys: { p256dh: "fake-p256dh", auth: "fake-auth" },
				},
			});
		expect(response.status).toBe(200);
		expect(response.body.ok).toBe(true);
	});

	it("POST /push/unsubscribe exige o endpoint", async () => {
		const response = await request(app)
			.post("/api/finan/push/unsubscribe")
			.set("Authorization", BEARER)
			.send({});
		expect(response.status).toBe(400);
	});

	it("POST /push/unsubscribe remove a inscrição", async () => {
		const response = await request(app)
			.post("/api/finan/push/unsubscribe")
			.set("Authorization", BEARER)
			.send({ endpoint: "https://fcm.googleapis.com/fake-endpoint" });
		expect(response.status).toBe(200);
		expect(response.body.ok).toBe(true);
	});
});
