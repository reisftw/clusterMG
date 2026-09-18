// Regressao: a gravacao best-effort de feriados nacionais no banco
// (holidaysService.js#ensureNationalHolidaysForRange) era disparada
// "fire-and-forget" (sem aguardar) em dois lugares — GET /feriados
// (calendario/routes.js) e expandRuleOccurrences (eventsService.js). Isso
// era inofensivo no servidor web (o pool nunca fecha), mas o job de
// alertas (scripts/sendCalendarAlerts.js) fecha o pool assim que a funcao
// principal termina, e a escrita em segundo plano — ainda em voo — tentava
// rodar depois, gerando "Cannot use a pool after calling end on the pool"
// em producao (observado via journalctl no primeiro dia do timer no ar).
//
// Corrigido para AGUARDAR a gravacao antes de responder/retornar. Estes
// testes provam isso: fazem o INSERT do feriado demorar um pouco (timer) e
// confirmam que, no momento em que a rota responde, o INSERT ja terminou —
// se o codigo regredir pra fire-and-forget, esses testes ficam instaveis/
// falham porque a resposta chegaria antes do INSERT terminar.
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

function withDelayedHolidayInsert(dbMock) {
	let insertSettled = false;
	const fallback = dbMock.query.getMockImplementation();
	dbMock.query.mockImplementation(async (text, params) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");
		if (/insert into finan_calendar_holidays/i.test(sql)) {
			await new Promise((resolve) => setTimeout(resolve, 15));
			insertSettled = true;
			return { rows: [] };
		}
		if (/from finan_calendar_event_rules/i.test(sql)) {
			return { rows: [] };
		}
		if (/from finan_financial_events/i.test(sql)) {
			return { rows: [] };
		}
		if (/from finan_calendar_holidays/i.test(sql)) {
			return { rows: [] };
		}
		return fallback(text, params);
	});
	return { dbMock, isInsertSettled: () => insertSettled };
}

describe("regressão: gravação de feriados aguardada (não fire-and-forget)", () => {
	let dbMock;
	let app;
	let isInsertSettled;

	beforeEach(() => {
		const base = createFinanDbMock({ session: adminSession() });
		({ dbMock, isInsertSettled } = withDelayedHolidayInsert(base));
		app = loadFinanApp(dbMock);
	}, 30000);

	it("GET /calendario-financeiro/feriados só responde depois que a gravação em background termina", async () => {
		const response = await request(app)
			.get("/api/finan/calendario-financeiro/feriados?from=2026-09-01&to=2026-09-30")
			.set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(isInsertSettled()).toBe(true);
	});

	it("GET /calendario-financeiro (eventos, expande regras) só responde depois que a gravação em background termina", async () => {
		const response = await request(app)
			.get("/api/finan/calendario-financeiro?from=2026-09-01&to=2026-09-30")
			.set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(isInsertSettled()).toBe(true);
	});
});
