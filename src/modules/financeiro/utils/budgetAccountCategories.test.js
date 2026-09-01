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
});
