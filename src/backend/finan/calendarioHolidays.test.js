// Testes das funcoes puras de calculo de dia util do Calendario Financeiro
// (holidaysService.js): fim de semana, feriado e "N-esimo dia util do mes".
// Nenhuma chamada de rede/banco aqui — so datas.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const finanRequire = createRequire(
	path.join(process.cwd(), "apps/finan/backend/package.json"),
);
const dbPath = finanRequire.resolve("./src/db.js");

// db.js le env vars de conexao logo no require() — mocka pra so carregar
// as funcoes puras do holidaysService sem precisar de Postgres real.
finanRequire.cache[dbPath] = {
	id: dbPath,
	filename: dbPath,
	loaded: true,
	exports: { query: async () => ({ rows: [] }) },
};

const { isBusinessDay, nthBusinessDayOfMonth } = finanRequire("./src/calendario/holidaysService.js");

describe("Calendário Financeiro: cálculo de dia útil", () => {
	it("fim de semana nunca é dia útil", () => {
		const saturday = new Date(2026, 0, 3); // 03/01/2026 = sabado
		const sunday = new Date(2026, 0, 4);
		expect(isBusinessDay(saturday, new Set())).toBe(false);
		expect(isBusinessDay(sunday, new Set())).toBe(false);
	});

	it("feriado no conjunto não é dia útil, mesmo em dia de semana", () => {
		const holiday = new Date(2026, 0, 1); // 01/01/2026 = quinta-feira
		expect(isBusinessDay(holiday, new Set(["2026-01-01"]))).toBe(false);
		expect(isBusinessDay(holiday, new Set())).toBe(true);
	});

	it("nthBusinessDayOfMonth calcula o 5º dia útil de janeiro/2026 pulando fim de semana e feriado", () => {
		// Janeiro/2026: dia 1 (qui) = feriado nacional, 2 (sex) util,
		// 3-4 fim de semana, 5 (seg) util, 6 (ter) util, 7 (qua) util,
		// 8 (qui) util -> 5o dia util = 08/01/2026.
		const holidaySet = new Set(["2026-01-01"]);
		const result = nthBusinessDayOfMonth(2026, 0, 5, holidaySet);
		expect(result).toBe("2026-01-08");
	});

	it("retorna null quando N excede a quantidade de dias úteis do mês", () => {
		const result = nthBusinessDayOfMonth(2026, 1, 100, new Set());
		expect(result).toBeNull();
	});
});
