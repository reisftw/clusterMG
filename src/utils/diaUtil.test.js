import {
	diasUteisDoMes,
	diasUteisRestantesNoMes,
	FERIADOS_NACIONAIS_FIXOS,
	formatarChaveFeriado,
	isDiaUtil,
	normalizarFeriados,
} from "./diaUtil";

describe("diaUtil", () => {
	it("normaliza feriados para Set", () => {
		const original = new Set(["01-01"]);
		const normalized = normalizarFeriados(original);

		expect(normalized).not.toBe(original);
		expect(normalized.has("01-01")).toBe(true);
		expect(normalized.has("05-01")).toBe(true);
		expect(normalizarFeriados(["01-01"]).has("01-01")).toBe(true);
		expect(normalizarFeriados().size).toBe(FERIADOS_NACIONAIS_FIXOS.length);
	});

	it("formata chave de feriado", () => {
		expect(formatarChaveFeriado(1, 2)).toBe("01-02");
	});

	it("detecta finais de semana e feriados", () => {
		expect(isDiaUtil("Janeiro", 1, ["01-01"], 2026)).toBe(false);
		expect(isDiaUtil("Janeiro", 2, ["01-01"], 2026)).toBe(true);
		expect(isDiaUtil("Janeiro", 3, [], 2026)).toBe(false);
	});

	it("conta dias uteis no mes", () => {
		expect(diasUteisDoMes("Janeiro", ["01-01"], 2026)).toBe(21);
		expect(diasUteisDoMes("Maio", [], 2026)).toBe(20);
		expect(diasUteisDoMes("MesInvalido", [], 2026)).toBe(22);
	});

	it("conta dias uteis restantes no mes", () => {
		expect(diasUteisRestantesNoMes("Janeiro", ["01-01"], 2, 2026)).toBe(20);
		expect(diasUteisRestantesNoMes("MesInvalido", [], 2, 2026)).toBe(0);
	});
});
