import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const servicePath = require.resolve("./api/src/logisticaIntegration.js");
const documentsPath = require.resolve("./api/src/documents.js");

function clearModules() {
	delete require.cache[servicePath];
	delete require.cache[documentsPath];
}

function loadService() {
	clearModules();
	require.cache[documentsPath] = {
		id: documentsPath,
		filename: documentsPath,
		loaded: true,
		exports: {
			getDocument: vi.fn(async () => null),
			upsertDocument: vi.fn(async () => null),
		},
	};
	return require("./api/src/logisticaIntegration.js");
}

function jsonResponse(data, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		text: vi.fn(async () => JSON.stringify(data)),
	};
}

describe("logisticaIntegration geocodeAddress", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
		delete global.fetch;
	});

	it("tenta uma consulta menos rigida quando o endereco completo nao retorna coordenadas", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse([]))
			.mockResolvedValueOnce(
				jsonResponse([
					{
						lat: "-19.9208",
						lon: "-43.9378",
						display_name: "Rua Teste, Belo Horizonte, Minas Gerais, Brasil",
						address: {
							city: "Belo Horizonte",
							state: "Minas Gerais",
							country: "Brasil",
							country_code: "br",
						},
					},
				]),
			);
		const service = loadService();

		const result = await service.geocodeAddress({
			endereco: "Rua Teste",
			numero: "9999",
			bairro: "Bairro Inexistente",
			cidade: "Belo Horizonte",
		});

		expect(result.lat).toBe("-19.9208");
		expect(result.lng).toBe("-43.9378");
		expect(global.fetch).toHaveBeenCalledTimes(2);
		const secondUrl = new URL(global.fetch.mock.calls[1][0]);
		expect(secondUrl.searchParams.get("q")).toContain("Rua Teste, 9999");
		expect(secondUrl.searchParams.get("countrycodes")).toBe("br");
	});

	it("prioriza resultado compativel com cidade e estado informados", async () => {
		global.fetch = vi.fn(async () =>
			jsonResponse([
				{
					lat: "-23.5505",
					lon: "-46.6333",
					display_name: "Rua Teste, Sao Paulo, Brasil",
					importance: 1,
					address: {
						city: "Sao Paulo",
						state: "Sao Paulo",
						country: "Brasil",
						country_code: "br",
					},
				},
				{
					lat: "-19.9208",
					lon: "-43.9378",
					display_name: "Rua Teste, Belo Horizonte, Minas Gerais, Brasil",
					importance: 0.1,
					address: {
						city: "Belo Horizonte",
						state: "Minas Gerais",
						country: "Brasil",
						country_code: "br",
					},
				},
			]),
		);
		const service = loadService();

		const result = await service.geocodeAddress({
			endereco: "Rua Teste",
			cidade: "Belo Horizonte",
			estado: "MG",
		});

		expect(result.lat).toBe("-19.9208");
		expect(result.lng).toBe("-43.9378");
		expect(result.displayName).toContain("Belo Horizonte");
	});
});
