// Valida o calculo LOCAL de feriados nacionais (holidaysService.js) contra
// os dados reais da BrasilAPI pra 2026 (conferidos manualmente antes desta
// mudanca — ver historico do commit). Isso existe justamente porque a
// sincronizacao via rede se mostrou nao-confiavel em producao (a VPS pode
// nao ter saida de internet pra brasilapi.com.br) — o calculo local
// precisa estar certo por si so, sem depender de nenhuma chamada externa.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const finanRequire = createRequire(
	path.join(process.cwd(), "apps/finan/backend/package.json"),
);
const dbPath = finanRequire.resolve("./src/db.js");
finanRequire.cache[dbPath] = {
	id: dbPath,
	filename: dbPath,
	loaded: true,
	exports: { query: async () => ({ rows: [] }) },
};

const {
	computeNationalHolidaysForRange,
	computeNationalHolidaysForYear,
	getHolidaySet,
	nthBusinessDayOfMonth,
} = finanRequire("./src/calendario/holidaysService.js");

function dateOf(holidays, name) {
	return holidays.filter((item) => item.name === name).map((item) => item.date);
}

describe("Calendário Financeiro: feriados nacionais calculados localmente", () => {
	it("2026 bate exatamente com os dados reais da BrasilAPI", () => {
		const holidays = computeNationalHolidaysForYear(2026);
		const byDate = Object.fromEntries(holidays.map((item) => [item.date, item.name]));

		expect(byDate["2026-01-01"]).toBe("Confraternização Universal");
		expect(dateOf(holidays, "Carnaval")).toEqual(["2026-02-16", "2026-02-17"]);
		expect(byDate["2026-04-03"]).toBe("Sexta-feira Santa");
		expect(byDate["2026-04-05"]).toBe("Páscoa");
		expect(byDate["2026-04-21"]).toBe("Tiradentes");
		expect(byDate["2026-05-01"]).toBe("Dia do Trabalho");
		expect(byDate["2026-06-04"]).toBe("Corpus Christi");
		expect(byDate["2026-09-07"]).toBe("Independência do Brasil");
		expect(byDate["2026-10-12"]).toBe("Nossa Senhora Aparecida");
		expect(byDate["2026-11-02"]).toBe("Finados");
		expect(byDate["2026-11-15"]).toBe("Proclamação da República");
		expect(byDate["2026-11-20"]).toBe("Dia da Consciência Negra");
		expect(byDate["2026-12-25"]).toBe("Natal");
		expect(holidays).toHaveLength(14);
	});

	it("2027 também bate (Páscoa móvel calculada certa em outro ano)", () => {
		const holidays = computeNationalHolidaysForYear(2027);
		const byDate = Object.fromEntries(holidays.map((item) => [item.date, item.name]));
		expect(byDate["2027-03-28"]).toBe("Páscoa");
		expect(dateOf(holidays, "Carnaval")).toEqual(["2027-02-08", "2027-02-09"]);
		expect(byDate["2027-03-26"]).toBe("Sexta-feira Santa");
		expect(byDate["2027-05-27"]).toBe("Corpus Christi");
	});

	it("regressão: 5º dia útil de setembro/2026 é dia 8 (dia 7 é feriado de Independência)", () => {
		const holidays = computeNationalHolidaysForYear(2026);
		const holidaySet = new Set(holidays.map((item) => item.date));
		expect(nthBusinessDayOfMonth(2026, 8, 5, holidaySet)).toBe("2026-09-08");
	});

	it("computeNationalHolidaysForRange recorta só as datas dentro do intervalo pedido", () => {
		const holidays = computeNationalHolidaysForRange("2026-09-01", "2026-09-30");
		expect(holidays).toHaveLength(1);
		expect(holidays[0].holiday_date).toBe("2026-09-07");
		expect(holidays[0].scope).toBe("nacional");
	});

	it("getHolidaySet inclui feriado nacional MESMO com o banco vazio (sem sincronização prévia)", async () => {
		// O mock global deste arquivo (topo) faz db.query sempre devolver
		// rows: [] — ou seja, nenhum feriado foi gravado/lido do banco. Ainda
		// assim, setembro/2026 precisa trazer o dia 7 (Independência), porque
		// getHolidaySet calcula feriado nacional localmente, nunca dependendo
		// de leitura de banco pra isso — essa e a regressão real que este
		// teste existe pra prevenir.
		const holidaySet = await getHolidaySet({ from: "2026-09-01", to: "2026-09-30" });
		expect(holidaySet.has("2026-09-07")).toBe(true);
		expect(nthBusinessDayOfMonth(2026, 8, 5, holidaySet)).toBe("2026-09-08");
	});
});
