import { describe, expect, it } from "vitest";
import {
	removeAccount,
	removeBranch,
	removeCompany,
	removePartner,
	upsertAccount,
	upsertCenter,
	upsertCompanyOrBranch,
	upsertPartner,
} from "./budgetConfigActions";

describe("budgetConfigActions", () => {
	it("updates linked cost center account ids when an account is edited", () => {
		const config = {
			accounts: [{ id: "old", codigo: "1211", nome: "Energia" }],
			centers: [
				{
					id: "cc-1",
					contasFinanceiras: ["old"],
					contaFinanceiraPadrao: "old",
				},
			],
		};

		const result = upsertAccount(
			{ id: "new", codigo: "1211", nome: "Energia elétrica" },
			config,
		);

		expect(result.accounts[0]).toMatchObject({
			id: "new",
			codigo: "1211",
			nome: "Energia elétrica",
			categoriaMae: "Ocupação",
			categoriaClasse: "basal",
		});
		expect(result.centers[0].contasFinanceiras).toEqual(["new"]);
		expect(result.centers[0].contaFinanceiraPadrao).toBe("new");
	});

	it("removes account references from cost centers", () => {
		const result = removeAccount("conta-1", {
			accounts: [{ id: "conta-1" }, { id: "conta-2" }],
			centers: [
				{
					id: "cc-1",
					contasFinanceiras: ["conta-1", "conta-2"],
					contaFinanceiraPadrao: "conta-1",
				},
			],
		});

		expect(result.accounts).toEqual([{ id: "conta-2" }]);
		expect(result.centers[0].contasFinanceiras).toEqual(["conta-2"]);
		expect(result.centers[0].contaFinanceiraPadrao).toBe("");
	});

	it("deduplicates partner cost centers and updates linked partner ids", () => {
		const result = upsertPartner(
			{
				id: "novo",
				codigo: "10",
				nome: "Fornecedor",
				centrosCusto: ["rot", "rot"],
				centroCustoPadraoId: "adm",
			},
			{
				partners: [{ id: "antigo", codigo: "10", nome: "Fornecedor" }],
				centers: [{ id: "rot", fornecedores: ["antigo"] }],
			},
		);

		expect(result.partners[0].id).toBe("novo");
		expect(result.partners[0].centrosCusto).toEqual(["rot", "adm"]);
		expect(result.centers[0].fornecedores).toEqual(["novo"]);
	});

	it("removes partner references from cost centers", () => {
		const result = removePartner("fornecedor-1", {
			partners: [{ id: "fornecedor-1" }, { id: "fornecedor-2" }],
			centers: [{ id: "rot", fornecedores: ["fornecedor-1", "fornecedor-2"] }],
		});

		expect(result.partners).toEqual([{ id: "fornecedor-2" }]);
		expect(result.centers[0].fornecedores).toEqual(["fornecedor-2"]);
	});

	it("links a branch to its matrix without creating duplicate company ids", () => {
		const result = upsertCompanyOrBranch(
			{ codigo: "2", nome: "Filial", empresaId: "matriz-1" },
			"branch",
			{
				companies: [{ id: "matriz-1", nome: "Matriz", filiais: [] }],
				branches: [],
				centers: [],
			},
		);

		expect(result.branches[0].id).toBe("matriz-1-2");
		expect(result.branches[0].empresas).toEqual(["matriz-1"]);
		expect(result.companies[0].filiais).toEqual(["matriz-1-2"]);
	});

	it("updates matrix ids on branches and centers when a company is edited", () => {
		const result = upsertCompanyOrBranch(
			{ id: "matriz-nova", codigo: "13", nome: "Matriz nova" },
			"company",
			{
				companies: [{ id: "matriz-antiga", codigo: "13", filiais: ["filial"] }],
				branches: [{ id: "filial", empresas: ["matriz-antiga"] }],
				centers: [{ id: "rot", companies: ["matriz-antiga"] }],
			},
		);

		expect(result.companies[0].id).toBe("matriz-nova");
		expect(result.branches[0].empresas).toEqual(["matriz-nova"]);
		expect(result.centers[0].companies).toEqual(["matriz-nova"]);
	});

	it("removes matrix and branch links without deleting unrelated entities", () => {
		const withoutCompany = removeCompany("matriz-1", {
			companies: [{ id: "matriz-1" }],
			branches: [{ id: "filial-1", empresas: ["matriz-1", "matriz-2"] }],
			centers: [{ id: "rot", companies: ["matriz-1", "matriz-2"] }],
		});
		const withoutBranch = removeBranch("filial-1", {
			branches: [{ id: "filial-1" }],
			companies: [{ id: "matriz-2", filialId: "filial-1", filiais: ["filial-1"] }],
			centers: [{ id: "rot", branches: ["filial-1"] }],
		});

		expect(withoutCompany.companies).toEqual([]);
		expect(withoutCompany.branches[0].empresas).toEqual(["matriz-2"]);
		expect(withoutCompany.centers[0].companies).toEqual(["matriz-2"]);
		expect(withoutBranch.branches).toEqual([]);
		expect(withoutBranch.companies[0].filialId).toBe("");
		expect(withoutBranch.companies[0].filiais).toEqual([]);
		expect(withoutBranch.centers[0].branches).toEqual([]);
	});

	it("inherits directorate on analytic cost centers and propagates synthetic changes", () => {
		const config = {
			centers: [
				{
					id: "110700",
					codigo: "110700",
					nome: "Operações",
					tipoPlano: "S",
					diretoria: "Operacional",
				},
				{
					id: "110701",
					codigo: "110701",
					nome: "ROT",
					tipoPlano: "A",
					parentId: "110700",
				},
			],
		};

		const childResult = upsertCenter(
			{ id: "110701", codigo: "110701", nome: "ROT", tipoPlano: "A", parentId: "110700" },
			config,
			[],
		);
		const parentResult = upsertCenter(
			{ id: "110700", codigo: "110700", nome: "Operações", tipoPlano: "S", diretoria: "Financeira" },
			childResult,
			[{ nome: "Financeira", diretor: "Diretor", emailDiretor: "diretor@x.com" }],
		);

		expect(childResult.centers[1].diretoria).toBe("Operacional");
		expect(parentResult.centers[0].responsavel).toBe("Diretor");
		expect(parentResult.centers[1].diretoria).toBe("Financeira");
	});
});
