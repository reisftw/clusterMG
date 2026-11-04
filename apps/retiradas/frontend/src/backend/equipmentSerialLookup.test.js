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

	it("classifica timeout do AutoISP como falha de dependencia externa", () => {
		const { normalizeAutoIspError } = loadLookup()._testing;
		const error = normalizeAutoIspError(new Error("Timeout 30000ms exceeded"));

		expect(error.statusCode).toBe(424);
		expect(error.message).toContain("AutoISP nao respondeu");
	});

	it("preserva erros funcionais retornados pelo AutoISP", () => {
		const { normalizeAutoIspError } = loadLookup()._testing;
		const original = Object.assign(new Error("Serial nao encontrado"), {
			statusCode: 404,
		});

		expect(normalizeAutoIspError(original)).toBe(original);
	});

	it("consulta e normaliza o contrato React atual do AutoISP", () => {
		const { buildAutoIspOnusUrl, extractAutoIspPayloadRows } = loadLookup()._testing;
		const url = new URL(
			buildAutoIspOnusUrl("https://autoisp.exemplo", "4857544361b277b7"),
		);
		const rows = extractAutoIspPayloadRows(
			{
				onus: [
					{
						id: 963382,
						rx_status: "online",
						serial_number: "4857544361B277B7",
						description: "cliente.radius",
						olt_hostname: "OLT-01",
						ponlink: "0/13/8",
						onu: "62",
						onu_model_read: "MODELO-X",
					},
				],
			},
			"4857544361b277b7",
		);

		expect(url.pathname).toBe("/onus/provisioned");
		expect(url.searchParams.get("serial_number")).toBe("4857544361B277B7");
		expect(rows).toEqual([
			expect.objectContaining({
				status: "online",
				erpId: "963382",
				descricaoOlt: "cliente.radius",
				olt: "OLT-01",
				pon: "0/13/8",
				onuId: "62",
				modelo: "MODELO-X",
			}),
		]);
	});
});
