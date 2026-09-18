// Cobre os DTOs do Calendário Financeiro (`dtos/calendarioDto.js`) aplicados
// em `calendario/routes.js`: evento, regra, feriado, cor de prioridade e
// validação de formato de `:id`. O módulo já tinha validação manual boa
// antes (ver `calendario.test.js` para os testes de comportamento
// end-to-end); aqui o foco é o contrato do DTO em si.
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

function extendMock(dbMock) {
	const fallback = dbMock.query.getMockImplementation();
	dbMock.query.mockImplementation(async (text, params = []) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");
		if (/finan_calendar_event_types.*finan_calendar_priorities/is.test(sql)) {
			return { rows: [{ type_count: 1, priority_count: 1 }] };
		}
		if (/insert into finan_calendar_priorities/i.test(sql)) {
			return { rows: [{ id: params[0], label: params[1], active: true, color: params[2] }] };
		}
		if (/insert into finan_financial_events/i.test(sql)) {
			return { rows: [{ id: "finan_event_1" }] };
		}
		if (/insert into finan_calendar_event_rules/i.test(sql)) {
			return { rows: [{ id: "finan_rule_1" }] };
		}
		if (/insert into finan_calendar_holidays/i.test(sql)) {
			return { rows: [{ id: "finan_holiday_1" }] };
		}
		return fallback(text, params);
	});
	return dbMock;
}

describe("DTOs do Calendário Financeiro", () => {
	let dbMock;
	let app;

	beforeEach(() => {
		dbMock = extendMock(createFinanDbMock({ session: adminSession() }));
		app = loadFinanApp(dbMock);
	}, 30000);

	describe("POST /calendario-financeiro (evento)", () => {
		it("payload válido é aceito", async () => {
			const response = await request(app)
				.post("/api/finan/calendario-financeiro")
				.set("Authorization", BEARER)
				.send({ title: "Pagar boleto", eventDate: "2026-09-10", eventType: "pagamento", priority: "alta" });
			expect(response.status).toBe(200);
		});

		it("eventDate ausente -> 400 VALIDATION_ERROR", async () => {
			const response = await request(app)
				.post("/api/finan/calendario-financeiro")
				.set("Authorization", BEARER)
				.send({ title: "Pagar boleto", eventType: "pagamento", priority: "alta" });
			expect(response.status).toBe(400);
			expect(response.body.code).toBe("VALIDATION_ERROR");
			expect(response.body.fields.eventDate).toBeTruthy();
		});

		it("eventDate em formato errado (Date.toString(), não YYYY-MM-DD) -> 400", async () => {
			const response = await request(app)
				.post("/api/finan/calendario-financeiro")
				.set("Authorization", BEARER)
				.send({
					title: "Pagar boleto",
					eventDate: "Sun Aug 30 2026",
					eventType: "pagamento",
					priority: "alta",
				});
			expect(response.status).toBe(400);
			expect(response.body.fields.eventDate).toBeTruthy();
		});

		it("alertDaysBefore com item inválido (string) -> 400, não é mais silenciosamente descartado", async () => {
			const response = await request(app)
				.post("/api/finan/calendario-financeiro")
				.set("Authorization", BEARER)
				.send({
					title: "Pagar boleto",
					eventDate: "2026-09-10",
					eventType: "pagamento",
					priority: "alta",
					alertDaysBefore: ["abc"],
				});
			expect(response.status).toBe(400);
			expect(response.body.fields.alertDaysBefore).toBeTruthy();
		});

		it("aceita aliases snake_case (event_date, event_type)", async () => {
			const response = await request(app)
				.post("/api/finan/calendario-financeiro")
				.set("Authorization", BEARER)
				.send({ title: "Pagar boleto", event_date: "2026-09-10", event_type: "pagamento", priority: "alta" });
			expect(response.status).toBe(200);
		});
	});

	describe("POST /calendario-financeiro/regras", () => {
		it("nthBusinessDay fora do intervalo (0 e 24) -> 400", async () => {
			const tooLow = await request(app)
				.post("/api/finan/calendario-financeiro/regras")
				.set("Authorization", BEARER)
				.send({ title: "Regra", eventType: "pagamento", priority: "alta", nthBusinessDay: 0 });
			expect(tooLow.status).toBe(400);

			const tooHigh = await request(app)
				.post("/api/finan/calendario-financeiro/regras")
				.set("Authorization", BEARER)
				.send({ title: "Regra", eventType: "pagamento", priority: "alta", nthBusinessDay: 24 });
			expect(tooHigh.status).toBe(400);
		});

		it("payload válido é aceito", async () => {
			const response = await request(app)
				.post("/api/finan/calendario-financeiro/regras")
				.set("Authorization", BEARER)
				.send({ title: "Regra", eventType: "pagamento", priority: "alta", nthBusinessDay: 5 });
			expect(response.status).toBe(200);
		});
	});

	describe("POST /calendario-financeiro/feriados", () => {
		it("payload válido é aceito", async () => {
			const response = await request(app)
				.post("/api/finan/calendario-financeiro/feriados")
				.set("Authorization", BEARER)
				.send({ date: "2026-09-07", name: "Feriado Municipal", city: "Uberlândia" });
			expect(response.status).toBe(200);
		});

		it("cidade ausente -> 400", async () => {
			const response = await request(app)
				.post("/api/finan/calendario-financeiro/feriados")
				.set("Authorization", BEARER)
				.send({ date: "2026-09-07", name: "Feriado Municipal" });
			expect(response.status).toBe(400);
			expect(response.body.fields.city).toBeTruthy();
		});
	});

	describe("POST /calendario-financeiro/config/prioridades (cor)", () => {
		it("cor válida (uma das PRIORITY_COLORS) é aceita", async () => {
			const response = await request(app)
				.post("/api/finan/calendario-financeiro/config/prioridades")
				.set("Authorization", BEARER)
				.send({ label: "Alta", color: "vermelho" });
			expect(response.status).toBe(200);
		});

		it("cor fora do catálogo -> 400 VALIDATION_ERROR", async () => {
			const response = await request(app)
				.post("/api/finan/calendario-financeiro/config/prioridades")
				.set("Authorization", BEARER)
				.send({ label: "Alta", color: "roxo-neon" });
			expect(response.status).toBe(400);
			expect(response.body.code).toBe("VALIDATION_ERROR");
			expect(response.body.fields.color).toBeTruthy();
		});
	});

	describe("Formato de :id inválido", () => {
		it("DELETE /calendario-financeiro/:id com id contendo espaço/caractere especial -> 400", async () => {
			const response = await request(app)
				.delete("/api/finan/calendario-financeiro/" + encodeURIComponent("id; drop table x;"))
				.set("Authorization", BEARER);
			expect(response.status).toBe(400);
		});

		it("DELETE /calendario-financeiro/regras/:id com id inválido -> 400", async () => {
			const response = await request(app)
				.delete("/api/finan/calendario-financeiro/regras/" + encodeURIComponent("id com espaço"))
				.set("Authorization", BEARER);
			expect(response.status).toBe(400);
		});
	});
});
