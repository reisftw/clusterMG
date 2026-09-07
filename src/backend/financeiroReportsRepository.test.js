import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const repositoryPath = require.resolve("./api/src/financeiroReportsRepository.js");
const dbPath = require.resolve("./api/src/db.js");

function clearModules() {
	delete require.cache[repositoryPath];
	delete require.cache[dbPath];
}

function loadRepository({ query = vi.fn(), connect } = {}) {
	clearModules();
	require.cache[dbPath] = {
		id: dbPath,
		filename: dbPath,
		loaded: true,
		exports: {
			query,
			connect:
				connect ||
				vi.fn(async () => ({
					query,
					release: vi.fn(),
				})),
		},
	};
	return require("./api/src/financeiroReportsRepository.js");
}

describe("financeiroReportsRepository", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("reconstroi report Serasa no contrato esperado pela tela", async () => {
		const query = vi
			.fn()
			.mockResolvedValueOnce({
				rows: [
					{
						id: "mov-1",
						data: "2026-08-24",
						ano: 2026,
						mes: 8,
						tipo: "Crédito",
						operacao: "Entrada",
						descricao: "Cliente Teste",
						valor: "120.50",
						direction: "entrada",
						is_net_revenue: false,
						source_payload: { monthName: "Agosto" },
					},
				],
			})
			.mockResolvedValueOnce({
				rows: [
					{
						ano: 2026,
						mes: 8,
						clientes: 6825,
						updated_at: "2026-08-30T10:00:00.000Z",
						source_payload: { key: "2026-08", label: "Agosto 2026" },
					},
				],
			})
			.mockResolvedValueOnce({
				rows: [
					{
						import_info: { fileName: "serasa.xlsx" },
						summary: { totalRows: 1 },
						blocos_detectados: [],
						blocos_nao_mapeados: [],
						source_payload: {},
					},
				],
			});
		const repository = loadRepository({ query });

		const report = await repository.getSerasaFinancialReport();

		expect(report.rows[0]).toMatchObject({
			date: "2026-08-24",
			operation: "Entrada",
			value: 120.5,
		});
		expect(report.clientes).toBe(6825);
		expect(report.importInfo.fileName).toBe("serasa.xlsx");
	});

	it("reconstroi Tarifas separando quantidade e valor por forma de pagamento", async () => {
		const empty = { rows: [] };
		const query = vi
			.fn()
			.mockResolvedValueOnce(empty)
			.mockResolvedValueOnce({
				rows: [
					{
						id: "pag-1",
						ano: 2026,
						mes: 7,
						forma: "PAGAMENTO VIA TED",
						quantidade: "104",
						valor: "485949.49",
						percent: "2.31",
						source_payload: {},
					},
				],
			})
			.mockResolvedValueOnce(empty)
			.mockResolvedValueOnce(empty)
			.mockResolvedValueOnce(empty)
			.mockResolvedValueOnce(empty)
			.mockResolvedValueOnce({
				rows: [
					{
						import_info: { totalSheets: 5 },
						summary: { blocosDetectados: 5 },
						blocos_detectados: [],
						blocos_nao_mapeados: [],
						source_payload: {},
					},
				],
			});
		const repository = loadRepository({ query });

		const report = await repository.getTariffsFinancialReport();

		expect(report.formasPagamentoQuantidade[0]).toMatchObject({
			method: "PAGAMENTO VIA TED",
			quantity: 104,
			percent: 2.31,
		});
		expect(report.formasPagamentoValor[0]).toMatchObject({
			method: "PAGAMENTO VIA TED",
			value: 485949.49,
		});
	});

	it("salva logs de importacao em tabela normalizada", async () => {
		const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
		const repository = loadRepository({ query });

		const id = await repository.recordFinanceiroImportLog({
			sourceId: "serasa",
			label: "Serasa",
			status: "ok",
			importedRows: 510,
		});

		expect(id).toMatch(/^fin_/);
		expect(query.mock.calls[0][0]).toContain("insert into financeiro_import_logs");
	});

	it("lista lancamentos DRE filtrando dados reais ou ficticios", async () => {
		const query = vi
			.fn()
			.mockResolvedValueOnce({
				rows: [
					{
						competencia_ano: 2026,
						competencia_mes: 8,
						linha_dre: "receita_bruta",
						total: "1000.50",
						quantidade: 2,
					},
				],
			})
			.mockResolvedValueOnce({
				rows: [
					{
						id: "dre-1",
						competencia_ano: 2026,
						competencia_mes: 8,
						linha_dre: "receita_bruta",
						categoria_original: "Receita Bruta",
						descricao: "Venda",
						valor: "1000.50",
						origem_arquivo: "dre.xlsx",
						is_fake: false,
						criado_em: "2026-08-31T10:00:00.000Z",
					},
				],
			});
		const repository = loadRepository({ query });

		const report = await repository.listDreLancamentos({
			ano: 2026,
			mes: 8,
			isFake: false,
		});

		expect(report.totalsByLine.receita_bruta).toBe(1000.5);
		expect(report.rows[0]).toMatchObject({
			linhaDre: "receita_bruta",
			isFake: false,
		});
		expect(query.mock.calls[0][1]).toEqual([false, 2026, 8]);
	});

	it("substitui a competencia ao importar DRE para evitar duplicidade", async () => {
		const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
		const release = vi.fn();
		const connect = vi.fn(async () => ({ query, release }));
		const repository = loadRepository({ query, connect });

		const result = await repository.replaceDreLancamentos(
			{
				fileName: "dre.xlsx",
				rows: [
					{
						competenciaAno: 2026,
						competenciaMes: 8,
						linhaDre: "receita_bruta",
						categoriaOriginal: "Receita Bruta",
						valor: 1500,
					},
				],
			},
			{ uid: "user-1" },
		);

		expect(result).toMatchObject({ ok: true, importedRows: 1 });
		expect(query.mock.calls.some(([sql]) => sql === "begin")).toBe(true);
		expect(query.mock.calls.some(([sql]) => String(sql).includes("delete from dre_lancamentos"))).toBe(true);
		expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into dre_lancamentos"))).toBe(true);
		expect(query.mock.calls.some(([sql]) => sql === "commit")).toBe(true);
		expect(release).toHaveBeenCalled();
	});

	it("apaga somente dados ficticios da DRE", async () => {
		const query = vi.fn(async () => ({ rows: [], rowCount: 14 }));
		const repository = loadRepository({ query });

		const result = await repository.deleteFakeDreLancamentos({ uid: "admin" });

		expect(result).toEqual({ ok: true, deletedRows: 14 });
		expect(query.mock.calls[0][0]).toBe(
			"delete from dre_lancamentos where is_fake = true",
		);
	});

	// S-A (docs/SONARQUBE-MAP.md, achado javascript:S6449): stableStringify
	// usava Object.keys(value).sort() sem comparador explícito. A correção
	// usa um comparador por code unit (não localeCompare) — importante que
	// o hash continue determinístico entre chaves fora de ordem alfabética
	// de inserção, e não dependa de locale/ICU do ambiente.
	it("stableStringify ordena chaves de objeto de forma deterministica, independente da ordem de insercao", () => {
		const { stableStringify } = loadRepository();

		const inserçãoA = { zebra: 1, abacaxi: 2, meio: 3 };
		const inserçãoB = { meio: 3, zebra: 1, abacaxi: 2 };

		expect(stableStringify(inserçãoA)).toBe(stableStringify(inserçãoB));
		expect(stableStringify(inserçãoA)).toBe('{"abacaxi":2,"meio":3,"zebra":1}');
	});
});
