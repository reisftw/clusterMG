import { createRequire } from "node:module";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));
const routerPath = require.resolve("./api/src/imoveis.js");
const repositoryPath = require.resolve("./api/src/imoveisRepository.js");
const drivePath = require.resolve(
	"./api/src/documentos/services/googleDriveService.js",
);

function clearModules() {
	delete require.cache[routerPath];
	delete require.cache[repositoryPath];
	delete require.cache[drivePath];
}

function loadRouter(repositoryOverrides = {}) {
	clearModules();
	const repository = {
		getImovelHistorico: vi.fn(async () => null),
		getRelatorioFinanceiroImoveis: vi.fn(async () => ({})),
		...repositoryOverrides,
	};
	require.cache[repositoryPath] = {
		id: repositoryPath,
		filename: repositoryPath,
		loaded: true,
		exports: repository,
	};
	require.cache[drivePath] = {
		id: drivePath,
		filename: drivePath,
		loaded: true,
		exports: {},
	};

	const express = require("express");
	const { createImoveisRouter } = require("./api/src/imoveis.js");
	const app = express();
	app.use(express.json());
	app.use(
		"/api/imoveis",
		createImoveisRouter({
			requireAuthenticated: (_req, _res, next) => next(),
			requireCsrfToken: (_req, _res, next) => next(),
			requireRoles: () => (_req, _res, next) => next(),
		}),
	);
	app.use((error, _req, res, _next) => {
		res.status(error.statusCode || 500).json({ error: error.message });
	});
	return { app, repository };
}

describe("imoveis routes", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("GET /api/imoveis/:id/registros retorna historico do imovel", async () => {
		const historico = {
			imovel: { id: "imovel-1", nome: "Loja Centro" },
			reajustes: [{ id: "reajuste-1" }],
			iptus: [],
			alugueis: [],
			contratos: [{ id: "contrato-1" }],
			anexos: [],
			aditivos: [],
		};
		const { app, repository } = loadRouter({
			getImovelHistorico: vi.fn(async () => historico),
		});

		const response = await request(app).get("/api/imoveis/imovel-1/registros");

		expect(response.status).toBe(200);
		expect(response.body).toEqual(historico);
		expect(repository.getImovelHistorico).toHaveBeenCalledWith("imovel-1");
	});

	it("GET /api/imoveis/relatorios/dados retorna relatorio financeiro", async () => {
		const relatorio = {
			resumo: { totalImoveis: 1, gastosAluguel: 1200 },
			gastosIptu: [],
			gastosAluguel: [],
			contratosProximos: [],
			contratosFinalizados: [],
			iptuProximo: [],
			aluguelProximo: [],
			reajustes: [],
		};
		const { app, repository } = loadRouter({
			getRelatorioFinanceiroImoveis: vi.fn(async () => relatorio),
		});

		const response = await request(app).get(
			"/api/imoveis/relatorios/dados?mes=08&ano=2026",
		);

		expect(response.status).toBe(200);
		expect(response.body).toEqual(relatorio);
		expect(repository.getRelatorioFinanceiroImoveis).toHaveBeenCalledWith(
			expect.objectContaining({ mes: "08", ano: "2026" }),
		);
	});
});
