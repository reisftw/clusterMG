import { describe, expect, it } from "vitest";
import {
	BUDGET_DASHBOARD_DETAIL_RENDERERS,
	getBudgetDashboardDetailRenderer,
} from "./index";

describe("budget dashboard detail registry", () => {
	it("maps every dashboard detail key to a renderer", () => {
		expect(Object.keys(BUDGET_DASHBOARD_DETAIL_RENDERERS).sort()).toEqual([
			"cascata",
			"centros",
			"contas",
			"diretorias",
			"forecast",
			"fornecedores",
			"mensal",
			"movimentacoes",
			"ritmo",
			"treemap",
			"viloes",
		]);
	});

	it("returns null for an unknown dashboard detail", () => {
		expect(getBudgetDashboardDetailRenderer("desconhecido")).toBeNull();
	});
});
