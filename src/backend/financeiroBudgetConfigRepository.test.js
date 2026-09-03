import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const repositoryPath = require.resolve("./api/src/financeiroBudgetConfigRepository.js");
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
	return require("./api/src/financeiroBudgetConfigRepository.js");
}

describe("financeiroBudgetConfigRepository", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("reconstroi config orcamentaria usando tabelas normalizadas", async () => {
		const query = vi
			.fn()
			.mockResolvedValueOnce({
				rows: [
					{
						data: {
							settings: {
								directorates: [],
								centerTypes: ["sintetico", "analitico"],
							},
							workflow: { enabled: false },
						},
					},
				],
			})
			.mockResolvedValueOnce({
				rows: [
					{
						id: "1211",
						codigo: "1211",
						nome: "Energia",
						tipo: "despesa",
						grupo: "12 - CUSTOS",
						status: "ativo",
						parent_id: "12",
						source_payload: { reduzida: "1.211" },
					},
				],
			})
			.mockResolvedValueOnce({
				rows: [
					{
						id: "diretoria-operacoes",
						nome: "Diretoria de Operações",
						diretor_nome: "Warley",
						diretor_email: "",
						diretor_numero: "",
						source_payload: {},
					},
				],
			})
			.mockResolvedValueOnce({
				rows: [
					{
						id: "110701",
						codigo: "110701",
						nome: "ROT",
						tipo_centro: "analitico",
						parent_id: "1107",
						diretoria_id: "diretoria-operacoes",
						status: "ativo",
						tipo_despesa: "opex",
						source_payload: { valorMensal: 100 },
					},
				],
			})
			.mockResolvedValueOnce({ rows: [] })
			.mockResolvedValueOnce({ rows: [] })
			.mockResolvedValueOnce({ rows: [] })
			.mockResolvedValueOnce({
				rows: [
					{
						centro_custo_id: "110701",
						conta_id: "1211",
						empresa_id: "0001",
						filial_id: "1",
						ano: 2026,
						mes: 8,
						grupo: "Sempre",
						quebra2: "ORÇAMENTO",
						categoria: "Ocupação",
						status_projetos: "",
						orcado: "0",
						realizado: "730.00",
						linhas: "2",
						fornecedores: ["CEMIG"],
					},
				],
			})
			.mockResolvedValueOnce({
				rows: [
					{
						ano: 2026,
						mes: 8,
						conta_id: "1211",
						centro_custo_id: "110701",
						versao_id: "importacao",
						orcado: "179492.36",
						source_payload: { id: "importado-2026-1211-110701" },
					},
				],
			});
		const repository = loadRepository({ query });

		const config = await repository.getBudgetConfiguration();

		expect(config.accounts[0]).toMatchObject({
			id: "1211",
			codigo: "1211",
			nome: "Energia",
			categoriaMae: "Ocupação",
			categoriaClasse: "basal",
		});
		expect(config.centers[0]).toMatchObject({
			id: "110701",
			nome: "ROT",
			diretoria: "Diretoria de Operações",
			realizedByCompanyBranch: [
				expect.objectContaining({
					accountId: "1211",
					realizado: 730,
					grupo: "Sempre",
					quebra2: "ORÇAMENTO",
				}),
			],
		});
		expect(config.matrix[0]).toMatchObject({
			year: 2026,
			accountId: "1211",
			costCenterId: "110701",
			total: 179492.36,
		});
	});

	it("reconstroi linhas importadas do orçamento preservando payload original", async () => {
		const query = vi
			.fn()
			.mockResolvedValueOnce({
				rows: [
					{
						data: {
							fields: [{ key: "realizado", label: "Realizado" }],
							summary: { totalRows: 1 },
						},
					},
				],
			})
			.mockResolvedValueOnce({
				rows: [
					{
						id: "mov-1",
						ano: 2026,
						mes: 8,
						data: "2026-08-20",
						conta_id: "1211",
						centro_custo_id: "110701",
						fornecedor_id: "260131",
						empresa_id: "1",
						filial_id: "1-1",
						orcado: "0",
						realizado: "730.00",
						source_payload: {
							position: 0,
							nomeConta: "Energia",
							nomeCc: "ROT",
						},
					},
				],
			});
		const repository = loadRepository({ query });

		const data = await repository.getBudgetData();

		expect(data.rows[0]).toMatchObject({
			id: "mov-1",
			ano: 2026,
			numMes: 8,
			codConta: "1211",
			codCc: "110701",
			nomeConta: "Energia",
			realizado: 730,
		});
		expect(data.summary.totalRows).toBe(1);
	});

	it("salva configuracao sem chamar app_documents", async () => {
		const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
		const client = { query, release: vi.fn() };
		const repository = loadRepository({
			query,
			connect: vi.fn(async () => client),
		});

		await repository.saveBudgetConfiguration({
			accounts: [{ id: "1211", nome: "Energia" }],
			centers: [],
			partners: [],
			companies: [],
			branches: [],
			matrix: [],
			settings: { directorates: [] },
		});

		const allSql = query.mock.calls.map((call) => call[0]).join("\n");
		expect(allSql).toContain("insert into financeiro_config_meta");
		expect(allSql).toContain("insert into financeiro_contas");
		expect(allSql).not.toContain("app_documents");
	});

	it("salva lancamentos importados em blocos para evitar excesso de parametros no Postgres", async () => {
		const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
		const release = vi.fn();
		const connect = vi.fn(async () => ({ query, release }));
		const repository = loadRepository({ query, connect });
		const rows = Array.from({ length: 1200 }, (_, index) => ({
			sourceKey: `linha-${index}`,
			ano: 2026,
			numMes: 9,
			data: "2026-09-01",
			codConta: "1001",
			codCc: "2001",
			codFornecedor: "3001",
			empresaId: "0001",
			filialId: "0001",
			realizado: index + 1,
			orcado: 0,
		}));

		await repository.saveBudgetData({ rows }, { uid: "user-1" });

		const insertCalls = query.mock.calls.filter(([sql]) =>
			String(sql).includes("insert into financeiro_orcamento_lancamentos"),
		);
		expect(
			query.mock.calls.some(([sql]) =>
				String(sql).includes("delete from financeiro_orcamento_lancamentos"),
			),
		).toBe(true);
		expect(insertCalls.length).toBeGreaterThan(1);
		expect(insertCalls.every(([, params]) => params.length <= 10000)).toBe(true);
		expect(query.mock.calls.some(([sql]) => sql === "commit")).toBe(true);
		expect(release).toHaveBeenCalled();
	});
});
