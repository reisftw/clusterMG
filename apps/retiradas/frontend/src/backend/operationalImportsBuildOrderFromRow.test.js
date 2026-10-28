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

describe("operationalImports fine daily groups", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("agrupa multas por dia de cadastro no horario de Sao Paulo", () => {
		const { buildFineDailyGroups } = loadOperationalImports();
		const groups = buildFineDailyGroups(
			[
				{ hubsoft_id: "1", source_date: "2026-10-27T11:22:00.000Z" },
				{ hubsoft_id: "2", source_date: "2026-10-28T01:30:00.000Z" },
			],
			{ startDate: "2026-10-27", endDate: "2026-10-28" },
		);
		expect(groups.map((group) => [group.date, group.records.length])).toEqual([
			["2026-10-27", 2],
			["2026-10-28", 0],
		]);
	});

	it("mantem dias sem multa para zerar valores historicos incorretos", () => {
		const { buildFineDailyGroups } = loadOperationalImports();
		const groups = buildFineDailyGroups([], {
			startDate: "2026-01-01",
			endDate: "2026-01-03",
		});
		expect(groups).toEqual([
			{ date: "2026-01-01", records: [] },
			{ date: "2026-01-02", records: [] },
			{ date: "2026-01-03", records: [] },
		]);
	});

	it("une multas novas sem reduzir o total confirmado anteriormente", () => {
		const { buildIncrementalFineSnapshot } = loadOperationalImports();
		const snapshot = buildIncrementalFineSnapshot(
			{
				fines: 3,
				fineSource: "hubsoft-multas-data-cadastro",
				fineRecordIds: ["multa-1", "multa-2", "multa-3"],
			},
			[
				{ hubsoft_id: "multa-2" },
				{ hubsoft_id: "multa-3" },
				{ hubsoft_id: "multa-4" },
			],
		);

		expect(snapshot).toEqual({
			total: 4,
			recordIds: ["multa-1", "multa-2", "multa-3", "multa-4"],
		});
	});

	it("nao reduz o acumulado quando o HubSoft responde parcialmente", () => {
		const { buildIncrementalFineSnapshot } = loadOperationalImports();
		const snapshot = buildIncrementalFineSnapshot(
			{
				fines: 42,
				fineSource: "hubsoft-multas-data-cadastro",
				fineRecordIds: ["multa-1", "multa-2"],
			},
			[{ hubsoft_id: "multa-2" }],
		);

		expect(snapshot.total).toBe(42);
		expect(snapshot.recordIds).toEqual(["multa-1", "multa-2"]);
	});
});

describe("operationalImports diario fine preservation", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("preserva multas sincronizadas ao atualizar a producao diaria", () => {
		const { buildDiarioEntryFromSaldoDay } = loadOperationalImports();
		const entry = buildDiarioEntryFromSaldoDay({
			dateKey: "2026-10-27",
			row: { totalDia: 120, multas: 0 },
			nowIso: "2026-10-28T13:00:00.000Z",
			existing: {
				fines: 42,
				fineSource: "hubsoft-multas-data-cadastro",
				fineUpdatedAt: "2026-10-28T12:41:52.332Z",
				fineRecordIds: ["1", "2"],
			},
		});

		expect(entry).toMatchObject({
			deliveredTotal: 120,
			fines: 42,
			fineSource: "hubsoft-multas-data-cadastro",
			fineUpdatedAt: "2026-10-28T12:41:52.332Z",
			fineRecordIds: ["1", "2"],
		});
	});
});
