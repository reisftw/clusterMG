import { describe, expect, it } from "vitest";
import {
	extractCidadeFromEndereco,
	formatFerramentasMonth,
	normalizeKey,
	normalizeText,
	normalizeWorksheetRows,
	parseFerramentasDate,
	pickFirst,
} from "./ferramentasTabUtils";

describe("ferramentasTabUtils", () => {
	it("normaliza texto e chaves de planilha", () => {
		expect(normalizeText("  São João  ")).toBe("sao joao");
		expect(normalizeKey("Data Fechamento")).toBe("datafechamento");
		expect(normalizeWorksheetRows([{ "Código Cliente": 123 }])).toEqual([
			{ codigocliente: 123 },
		]);
	});

	it("extrai cidade de endereco com UF ou CEP", () => {
		expect(extractCidadeFromEndereco("Rua X, Patos de Minas/MG | CEP")).toBe(
			"Patos de Minas",
		);
		expect(extractCidadeFromEndereco("Rua X, Uberaba | CEP 00000")).toBe(
			"Uberaba",
		);
		expect(extractCidadeFromEndereco("", "N/A")).toBe("N/A");
	});

	it("parseia datas BR, ISO e Date nativo", () => {
		expect(parseFerramentasDate("27/08/2026")?.toISOString()).toContain(
			"2026-08-27",
		);
		expect(parseFerramentasDate("2026-08-27")?.toISOString()).toContain(
			"2026-08-27",
		);
		expect(parseFerramentasDate(new Date(2026, 7, 27))?.getMonth()).toBe(7);
		expect(parseFerramentasDate("")).toBeNull();
	});

	it("formata mes e escolhe primeiro campo preenchido", () => {
		expect(formatFerramentasMonth(new Date(2026, 7, 1))).toBe("08/2026");
		expect(pickFirst({ a: "", b: " OK " }, ["a", "b"])).toBe("OK");
	});
});
