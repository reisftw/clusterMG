import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));
const modulePath = require.resolve("./api/src/operationalImports.js");
const dbPath = require.resolve("./api/src/db.js");

function clearModules() {
	delete require.cache[modulePath];
	delete require.cache[dbPath];
}

function setMock(mockPath, exports) {
	require.cache[mockPath] = {
		id: mockPath,
		filename: mockPath,
		loaded: true,
		exports,
	};
}

function loadOperationalImports() {
	clearModules();
	setMock(dbPath, { query: vi.fn(), connect: vi.fn() });
	return require("./api/src/operationalImports.js");
}

// achado javascript:S3776 (docs/SONARQUBE-MAP.md): buildOrderFromRow foi
// extraida de buildOrdersFromRows pra reduzir complexidade cognitiva.
// Esses testes fixam o comportamento ANTES de qualquer novo refactor —
// operationalImports.js exige validacao extra por causa do painel/mapa
// publico (ver CLAUDE.md).
describe("operationalImports buildOrderFromRow", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	const baseContext = () => ({
		cityMap: {
			"BELO HORIZONTE": {
				nome: "Belo Horizonte",
				regional: "Metropolitana",
				agente: false,
			},
		},
		ignoredTypes: { adicionais: [], todos: ["Cancelamento Loja"] },
		fontesSet: new Set(["sempre"]),
		forMatch: false,
	});

	it("ignora linha sem numero de OS", () => {
		const { buildOrderFromRow } = loadOperationalImports();
		const result = buildOrderFromRow(
			{ tipo: "Retirada", status: "Pendente" },
			baseContext(),
		);
		expect(result).toEqual({ status: "skip" });
	});

	it("ignora linha com status '-'", () => {
		const { buildOrderFromRow } = loadOperationalImports();
		const result = buildOrderFromRow(
			{ numero_os: "123", tipo: "Retirada", status: "-" },
			baseContext(),
		);
		expect(result).toEqual({ status: "skip" });
	});

	it("ignora por tipo quando forMatch e o tipo esta na lista de ignorados", () => {
		const { buildOrderFromRow } = loadOperationalImports();
		const result = buildOrderFromRow(
			{
				numero_os: "123",
				tipo: "Cancelamento Loja",
				status: "Pendente",
			},
			{ ...baseContext(), forMatch: true },
		);
		expect(result).toEqual({ status: "ignoredByType", tipo: "Cancelamento Loja" });
	});

	it("nao ignora por tipo quando forMatch e false, mesmo com tipo na lista", () => {
		const { buildOrderFromRow } = loadOperationalImports();
		const result = buildOrderFromRow(
			{
				numero_os: "123",
				tipo: "Cancelamento Loja",
				status: "Pendente",
				cidade: "Belo Horizonte",
			},
			baseContext(),
		);
		expect(result.status).toBe("ok");
	});

	it("ignora quando nao consegue normalizar a cidade", () => {
		const { buildOrderFromRow } = loadOperationalImports();
		const result = buildOrderFromRow(
			{ numero_os: "123", tipo: "Retirada", status: "Pendente" },
			baseContext(),
		);
		expect(result).toEqual({ status: "skip" });
	});

	it("ignora por falta de regional quando forMatch e a cidade nao tem regional", () => {
		const { buildOrderFromRow } = loadOperationalImports();
		const result = buildOrderFromRow(
			{
				numero_os: "123",
				tipo: "Retirada",
				status: "Pendente",
				cidade: "Cidade Sem Regional",
			},
			{ ...baseContext(), forMatch: true },
		);
		expect(result).toEqual({ status: "ignoredNoRegional" });
	});

	it("ignora quando a fonte da linha nao esta no conjunto selecionado", () => {
		const { buildOrderFromRow } = loadOperationalImports();
		const result = buildOrderFromRow(
			{
				numero_os: "123",
				tipo: "Retirada",
				status: "Pendente",
				cidade: "Belo Horizonte",
			},
			{ ...baseContext(), fontesSet: new Set(["onnet"]) },
		);
		expect(result).toEqual({ status: "skip" });
	});

	it("constroi a ordem completa pra uma linha valida", () => {
		const { buildOrderFromRow } = loadOperationalImports();
		const result = buildOrderFromRow(
			{
				numero_os: "456",
				tipo: "Retirada FTTH",
				status: "Pendente",
				cidade: "Belo Horizonte",
				codigo_cliente: "789",
				nome_cliente: "Cliente Teste",
				endereco: "Rua Teste, 100",
				numero: "100",
				bairro: "Centro",
				mac_addr: "aabbccddeeff",
				telefone: "31999998888",
			},
			baseContext(),
		);

		expect(result.status).toBe("ok");
		expect(result.id).toBeTruthy();
		expect(result.order).toMatchObject({
			num_os: "456",
			tipo: "Retirada FTTH",
			status: "Pendente",
			cidade: "Belo Horizonte",
			regional: "Metropolitana",
			agente: false,
			codigo_cliente: "789",
			nome_cliente: "Cliente Teste",
			bairro: "Centro",
		});
	});
});
