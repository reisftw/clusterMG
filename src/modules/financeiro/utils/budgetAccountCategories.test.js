import { describe, expect, it } from "vitest";
import {
	BUDGET_CATEGORY_CLASSES,
	enrichFinancialAccountWithCategory,
	resolveFinancialAccountCategory,
} from "./budgetAccountCategories";

describe("budgetAccountCategories", () => {
	it("classifica contas BASAL pelo nome cadastrado", () => {
		expect(resolveFinancialAccountCategory({ nome: "Energia" })).toMatchObject({
			categoriaMae: "Ocupação",
			categoriaClasse: BUDGET_CATEGORY_CLASSES.BASAL,
			categoriaClasseLabel: "BASAL",
		});
	});

	it("classifica contas NÃO BASAL pelo catálogo", () => {
		expect(
			enrichFinancialAccountWithCategory({ nome: "Empréstimos bancários" }),
		).toMatchObject({
			categoriaMae: "Financeiro",
			categoriaClasse: BUDGET_CATEGORY_CLASSES.NAO_BASAL,
			categoriaClasseLabel: "NÃO BASAL",
			isBasal: false,
		});
	});

	it("preserva categorias com mesmo nome em tipos diferentes", () => {
		const categories = [
			{ name: "Financeiro", classType: BUDGET_CATEGORY_CLASSES.BASAL },
			{ name: "Financeiro", classType: BUDGET_CATEGORY_CLASSES.NAO_BASAL },
			{ name: "Projetos especiais", classType: BUDGET_CATEGORY_CLASSES.PROJETOS },
		];

		expect(
			resolveFinancialAccountCategory(
				{
					nome: "Conta manual",
					categoriaMae: "Financeiro",
					categoriaClasse: BUDGET_CATEGORY_CLASSES.BASAL,
				},
				categories,
			),
		).toMatchObject({
			categoriaMae: "Financeiro",
			categoriaClasse: BUDGET_CATEGORY_CLASSES.BASAL,
		});
		expect(
			resolveFinancialAccountCategory(
				{
					nome: "Conta manual",
					categoriaMae: "Financeiro",
					categoriaClasse: BUDGET_CATEGORY_CLASSES.NAO_BASAL,
				},
				categories,
			),
		).toMatchObject({
			categoriaMae: "Financeiro",
			categoriaClasse: BUDGET_CATEGORY_CLASSES.NAO_BASAL,
		});
		expect(
			resolveFinancialAccountCategory(
				{
					nome: "Conta manual",
					categoriaMae: "Projetos especiais",
					categoriaClasse: BUDGET_CATEGORY_CLASSES.PROJETOS,
				},
				categories,
			),
		).toMatchObject({
			categoriaMae: "Projetos especiais",
			categoriaClasse: BUDGET_CATEGORY_CLASSES.PROJETOS,
			categoriaClasseLabel: "PROJETOS",
			isBasal: false,
		});
	});
});
