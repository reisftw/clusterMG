import { describe, expect, it } from "vitest";
import {
	calculateDreStatement,
	classifyDreCategory,
	DRE_LINE_IDS,
} from "./dreStatement";

describe("dreStatement", () => {
	it("classifica categorias conhecidas da DRE", () => {
		expect(classifyDreCategory("Receita Bruta")).toBe(
			DRE_LINE_IDS.RECEITA_BRUTA,
		);
		expect(classifyDreCategory("(-) Deduções e Abatimentos")).toBe(
			DRE_LINE_IDS.DEDUCOES_ABATIMENTOS,
		);
		expect(classifyDreCategory("Despesas Administrativas")).toBe(
			DRE_LINE_IDS.DESPESAS_ADMINISTRATIVAS,
		);
		expect(classifyDreCategory("Provisões IRPJ e CSLL")).toBe(
			DRE_LINE_IDS.PROVISOES_IRPJ_CSLL,
		);
	});

	it("nao classifica subtotal importado como linha base", () => {
		expect(classifyDreCategory("Resultado Líquido do Exercício")).toBe("");
		expect(classifyDreCategory("Lucro Bruto")).toBe("");
	});

	it("calcula subtotais e resultados no frontend a partir das linhas base", () => {
		const rows = calculateDreStatement({
			[DRE_LINE_IDS.RECEITA_BRUTA]: 1000,
			[DRE_LINE_IDS.DEDUCOES_ABATIMENTOS]: 100,
			[DRE_LINE_IDS.CPV_CMV]: 250,
			[DRE_LINE_IDS.DESPESAS_VENDAS]: 50,
			[DRE_LINE_IDS.DESPESAS_ADMINISTRATIVAS]: 75,
			[DRE_LINE_IDS.DESPESAS_FINANCEIRAS]: 25,
			[DRE_LINE_IDS.PROVISOES_IRPJ_CSLL]: 80,
		});
		const byId = new Map(rows.map((row) => [row.id, row.value]));

		expect(byId.get(DRE_LINE_IDS.RECEITA_LIQUIDA)).toBe(900);
		expect(byId.get(DRE_LINE_IDS.LUCRO_BRUTO)).toBe(650);
		expect(byId.get(DRE_LINE_IDS.RESULTADO_ANTES_IRPJ_CSLL)).toBe(500);
		expect(byId.get(DRE_LINE_IDS.RESULTADO_LIQUIDO)).toBe(420);
	});
});
