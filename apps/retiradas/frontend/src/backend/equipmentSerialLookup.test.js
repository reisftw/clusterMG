import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(
	path.join(process.cwd(), "apps/retiradas/backend/package.json"),
);
const lookupPath = require.resolve("./api/src/equipmentSerialLookup.js");
const documentsPath = require.resolve("./api/src/documents.js");
const metricsPath = require.resolve("./api/src/metrics.js");

function loadLookup() {
	delete require.cache[lookupPath];
	require.cache[documentsPath] = {
		id: documentsPath,
		filename: documentsPath,
		loaded: true,
		exports: { getDocument: vi.fn(async () => null) },
	};
	require.cache[metricsPath] = {
		id: metricsPath,
		filename: metricsPath,
		loaded: true,
		exports: {
			recordOperation: vi.fn(),
			observeOperation: vi.fn(async (_definition, callback) => callback()),
		},
	};
	return require("./api/src/equipmentSerialLookup.js");
}

describe("equipmentSerialLookup", () => {
	afterEach(() => {
		delete require.cache[lookupPath];
		delete require.cache[documentsPath];
		delete require.cache[metricsPath];
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("compartilha uma operacao simultanea para a mesma chave", async () => {
		const { createSingleFlight } = loadLookup()._testing;
		const run = createSingleFlight();
		const loader = vi.fn(async () => "ok");

		await expect(Promise.all([run("serial", loader), run("serial", loader)])).resolves.toEqual([
			"ok",
			"ok",
		]);
		expect(loader).toHaveBeenCalledTimes(1);
	});

	it("configura timeout na consulta HTTP do HubSoft", async () => {
		const { requestHubsoftClientByWebApi } = loadLookup()._testing;
		const fetchMock = vi.fn(async (_url, options) => {
			expect(options.signal).toBeInstanceOf(AbortSignal);
			return {
				ok: true,
				status: 200,
				text: async () =>
					JSON.stringify({
						data: [{ codigo_cliente: "123", nome: "Cliente Teste" }],
					}),
			};
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await requestHubsoftClientByWebApi(
			"cliente.radius",
			{ baseUrl: "https://sempre.hubsoft.com.br" },
			{ tokenType: "Bearer", accessToken: "token" },
		);

		expect(result).toMatchObject({
			found: true,
			clientCode: "123",
			clientName: "Cliente Teste",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
