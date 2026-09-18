// Cobre os DTOs de integração (`dtos/integrationDto.js`) e de configuração
// genérica (`dtos/settingsDto.js`), aplicados em `integrations/routes.js` e
// `settings/routes.js`.
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

// O dbMock generico (testUtils.js) so conhece SELECTs (`from finan_*`); os
// INSERT ... ON CONFLICT ... RETURNING das rotas de PUT nao tem "from"
// nenhum, entao caem no default (`{ rows: [] }`) e o handler quebraria ao
// ler `rows[0]`. Aqui simulamos o retorno do upsert real.
function withIntegrationUpsertSupport(dbMock) {
	const original = dbMock.query.getMockImplementation();
	dbMock.query.mockImplementation(async (text, params) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");
		if (/insert into finan_integration_configs/i.test(sql)) {
			return {
				rows: [
					{
						id: params?.[0],
						provider: params?.[0],
						name: params?.[1],
						status: params?.[2],
						config: JSON.parse(params?.[3] || "{}"),
						updated_at: new Date(),
					},
				],
			};
		}
		return original(text, params);
	});
}

function withSettingsUpsertSupport(dbMock) {
	const original = dbMock.query.getMockImplementation();
	dbMock.query.mockImplementation(async (text, params) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");
		if (/insert into finan_settings/i.test(sql)) {
			return {
				rows: [{ key: params?.[0], value: JSON.parse(params?.[1] || "{}"), updated_at: new Date() }],
			};
		}
		return original(text, params);
	});
}

describe("DTOs de integração (integrations/routes.js)", () => {
	let dbMock;
	let app;

	beforeEach(() => {
		dbMock = createFinanDbMock({ session: adminSession() });
		withIntegrationUpsertSupport(dbMock);
		app = loadFinanApp(dbMock);
	}, 30000);

	it("PUT /finan/integracoes/:provider com config válida é aceito", async () => {
		const response = await request(app)
			.put("/api/finan/integracoes/hubsoft")
			.set("Authorization", BEARER)
			.send({ config: { baseUrl: "https://example.com" }, status: "ativo" });
		expect(response.status).toBe(200);
	});

	it("config ausente -> 400 VALIDATION_ERROR", async () => {
		const response = await request(app)
			.put("/api/finan/integracoes/hubsoft")
			.set("Authorization", BEARER)
			.send({ status: "ativo" });
		expect(response.status).toBe(400);
		expect(response.body.code).toBe("VALIDATION_ERROR");
		expect(response.body.fields.config).toBeTruthy();
	});

	it("config como array (tipo errado) -> 400", async () => {
		const response = await request(app)
			.put("/api/finan/integracoes/hubsoft")
			.set("Authorization", BEARER)
			.send({ config: [1, 2, 3] });
		expect(response.status).toBe(400);
		expect(response.body.fields.config).toBeTruthy();
	});

	it("status fora do enum -> 400", async () => {
		const response = await request(app)
			.put("/api/finan/integracoes/hubsoft")
			.set("Authorization", BEARER)
			.send({ config: {}, status: "voando" });
		expect(response.status).toBe(400);
		expect(response.body.fields.status).toBeTruthy();
	});

	it("provider com caractere fora do charset seguro -> 400 (nunca chega no SQL)", async () => {
		const response = await request(app)
			.put("/api/finan/integracoes/" + encodeURIComponent("hub;drop"))
			.set("Authorization", BEARER)
			.send({ config: {} });
		expect(response.status).toBe(400);
	});

	it("campo desconhecido no corpo -> 400 (anti mass assignment)", async () => {
		const response = await request(app)
			.put("/api/finan/integracoes/hubsoft")
			.set("Authorization", BEARER)
			.send({ config: {}, isAdmin: true });
		expect(response.status).toBe(400);
		expect(response.body.fields.isAdmin).toBeTruthy();
	});
});

describe("DTOs de configuração (settings/routes.js)", () => {
	let dbMock;
	let app;

	beforeEach(() => {
		dbMock = createFinanDbMock({ session: adminSession() });
		withSettingsUpsertSupport(dbMock);
		app = loadFinanApp(dbMock);
	}, 30000);

	it("PUT /finan/configuracoes/section/:key com value objeto é aceito", async () => {
		const response = await request(app)
			.put("/api/finan/configuracoes/section/geral")
			.set("Authorization", BEARER)
			.send({ value: { appName: "Finan" } });
		expect(response.status).toBe(200);
	});

	it("value ausente -> 400 VALIDATION_ERROR", async () => {
		const response = await request(app)
			.put("/api/finan/configuracoes/section/geral")
			.set("Authorization", BEARER)
			.send({});
		expect(response.status).toBe(400);
		expect(response.body.code).toBe("VALIDATION_ERROR");
		expect(response.body.fields.value).toBeTruthy();
	});

	it("value como string (tipo errado) -> 400", async () => {
		const response = await request(app)
			.put("/api/finan/configuracoes/section/geral")
			.set("Authorization", BEARER)
			.send({ value: "não é objeto" });
		expect(response.status).toBe(400);
	});

	it("objeto de configuração maior que o limite -> 400", async () => {
		const response = await request(app)
			.put("/api/finan/configuracoes/section/geral")
			.set("Authorization", BEARER)
			.send({ value: { blob: "x".repeat(60_000) } });
		expect(response.status).toBe(400);
	});
});
