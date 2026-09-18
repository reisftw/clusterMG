// Testes das funcoes puras do job de alertas do Calendario Financeiro
// (alertsService.js): quais eventos devem alertar "hoje" dada a
// antecedencia escolhida e os cargos marcados. Nenhuma chamada de
// rede/banco/e-mail aqui.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const finanRequire = createRequire(
	path.join(process.cwd(), "apps/finan/backend/package.json"),
);
const dbPath = finanRequire.resolve("./src/db.js");

// db.js e email/service.js tocam banco/rede no require() de outros
// modulos que alertsService.js importa transitivamente — mocka db.js pra
// so exercitar as funcoes puras (computeDueAlerts/addDaysToDateString).
finanRequire.cache[dbPath] = {
	id: dbPath,
	filename: dbPath,
	loaded: true,
	exports: { query: async () => ({ rows: [] }) },
};

const { addDaysToDateString, computeDueAlerts } = finanRequire(
	"./src/calendario/alertsService.js",
);

function baseEvent(overrides = {}) {
	return {
		id: "finan_event_1",
		title: "Fechamento de caixa",
		event_date: "2026-09-15",
		alert_days_before: [7],
		notify_role_ids: ["financeiro"],
		...overrides,
	};
}

describe("Calendário Financeiro: cálculo de alertas devidos", () => {
	it("addDaysToDateString soma/subtrai dias corretamente, inclusive virando mês", () => {
		expect(addDaysToDateString("2026-09-15", -7)).toBe("2026-09-08");
		expect(addDaysToDateString("2026-09-03", -7)).toBe("2026-08-27");
		expect(addDaysToDateString("2026-09-15", 0)).toBe("2026-09-15");
	});

	it("evento com antecedência de 7 dias alerta exatamente 7 dias antes", () => {
		const event = baseEvent({ event_date: "2026-09-15", alert_days_before: [7] });
		expect(computeDueAlerts([event], "2026-09-08")).toHaveLength(1);
		expect(computeDueAlerts([event], "2026-09-07")).toHaveLength(0);
		expect(computeDueAlerts([event], "2026-09-09")).toHaveLength(0);
	});

	it("evento sem nenhum cargo marcado (notify_role_ids vazio) nunca gera alerta", () => {
		const event = baseEvent({ notify_role_ids: [] });
		expect(computeDueAlerts([event], "2026-09-08")).toHaveLength(0);
	});

	it("evento com múltiplas antecedências pode gerar mais de um alerta (dias diferentes)", () => {
		const event = baseEvent({ event_date: "2026-09-15", alert_days_before: [2, 7, 15] });
		expect(computeDueAlerts([event], "2026-09-13")).toHaveLength(1); // 2 dias antes
		expect(computeDueAlerts([event], "2026-09-08")).toHaveLength(1); // 7 dias antes
		expect(computeDueAlerts([event], "2026-08-31")).toHaveLength(1); // 15 dias antes
		expect(computeDueAlerts([event], "2026-09-01")).toHaveLength(0);
	});

	it("cada alerta devido carrega os cargos certos pra buscar os destinatários", () => {
		const event = baseEvent({ notify_role_ids: ["financeiro", "diretoria"] });
		const due = computeDueAlerts([event], "2026-09-08");
		expect(due[0].roleIds).toEqual(["financeiro", "diretoria"]);
		expect(due[0].leadDays).toBe(7);
	});
});
