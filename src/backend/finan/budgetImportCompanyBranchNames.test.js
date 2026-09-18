// Bug reportado pelo usuário (2026-09-10): na tela de Configurações >
// Centros de Custo, o modal de edição de um centro mostrava "Matrizes e
// filiais vinculadas" com chips como "1 - 1" / "14 - 14" em vez de um nome
// legível — CostCenterCompaniesField.jsx só renderiza `{codigo} - {nome}`,
// então o problema real é que `nome` vinha igual ao código.
//
// Causa: quando a planilha de importação traz só o código numérico na
// coluna Filial/Empresa (sem "código - nome"), splitCodeName não acha
// separador e devolve o texto inteiro como `nome` (ex.: "1" vira
// {codigo: "", nome: "1"}) — um `nome` puramente numérico que o código
// antigo aceitava sem questionar, produzindo os chips "1 - 1".
//
// mergeBudgetConfigFromRows (financeiro.js) agora só aceita esse `nome`
// quando ele não é puramente numérico, e cura nomes placeholder já
// existentes (de importações antigas) quando uma reimportação traz um nome
// de verdade.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const finanRequire = createRequire(
	path.join(process.cwd(), "apps/finan/backend/package.json"),
);
process.env.FINAN_PGHOST = process.env.FINAN_PGHOST || "localhost";
process.env.FINAN_PGUSER = process.env.FINAN_PGUSER || "test";
process.env.FINAN_PGDATABASE = process.env.FINAN_PGDATABASE || "test";

const { mergeBudgetConfigFromRows } = finanRequire("./src/financeiro.js").__testables;

function buildRow(overrides = {}) {
	return {
		codConta: "1.01",
		nomeConta: "Marketing Digital",
		codCc: "110101",
		nomeCc: "Marketing",
		ano: 2026,
		numMes: 1,
		orcado: 1000,
		realizado: 0,
		...overrides,
	};
}

describe("mergeBudgetConfigFromRows — nome de matriz/filial a partir da planilha", () => {
	it("filial/empresa só com código numérico (sem 'código - nome'): usa 'Matriz {codigo}'/'Filial {codigo}', não o número cru", () => {
		const merged = mergeBudgetConfigFromRows(
			{},
			[buildRow({ filial: "1", empresa: "14" })],
			{},
		);
		const company = merged.config.companies.find((item) => item.codigo === "1");
		const branch = merged.config.branches.find((item) => item.codigo === "14");
		expect(company).toBeTruthy();
		expect(company.nome).toBe("Matriz 1");
		expect(branch).toBeTruthy();
		expect(branch.nome).toBe("Filial 14");
	});

	it("filial/empresa vem como 'código - nome': usa o nome real da planilha", () => {
		const merged = mergeBudgetConfigFromRows(
			{},
			[buildRow({ filial: "1 - Sempre Internet Matriz", empresa: "14 - Filial Divinópolis" })],
			{},
		);
		const company = merged.config.companies.find((item) => item.codigo === "1");
		const branch = merged.config.branches.find((item) => item.codigo === "14");
		expect(company.nome).toBe("Sempre Internet Matriz");
		expect(branch.nome).toBe("Filial Divinópolis");
	});

	it("cura nome placeholder ('1') de uma importação antiga quando a reimportação traz nome real", () => {
		const existingConfig = {
			companies: [
				{
					id: "matriz-1",
					codigo: "1",
					nome: "1",
					filiais: [],
				},
			],
			branches: [],
		};
		const merged = mergeBudgetConfigFromRows(
			existingConfig,
			[buildRow({ filial: "1 - Sempre Internet Matriz", empresa: "14" })],
			{},
		);
		const company = merged.config.companies.find((item) => item.codigo === "1");
		expect(company.nome).toBe("Sempre Internet Matriz");
	});

	it("nunca sobrescreve um nome real já cadastrado por um placeholder numérico vindo de outra linha", () => {
		const existingConfig = {
			companies: [
				{
					id: "matriz-1",
					codigo: "1",
					nome: "Sempre Internet Matriz",
					filiais: [],
				},
			],
			branches: [],
		};
		const merged = mergeBudgetConfigFromRows(
			existingConfig,
			[buildRow({ filial: "1", empresa: "14" })],
			{},
		);
		const company = merged.config.companies.find((item) => item.codigo === "1");
		expect(company.nome).toBe("Sempre Internet Matriz");
	});
});
