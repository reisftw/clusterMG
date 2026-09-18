// Testes do Calendario Financeiro: visualizar e aberto a qualquer usuario
// autenticado; criar/editar/excluir exige finan.calendario.manage.
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	adminSession,
	createFinanDbMock,
	loadFinanApp,
	sessionWithPermissions,
} from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

function extendMockForCalendario(dbMock) {
	// getMockImplementation() pega a funcao original — chamar dbMock.query
	// diretamente aqui recursaria na propria implementacao nova.
	const fallbackQuery = dbMock.query.getMockImplementation();
	dbMock.query.mockImplementation(async (text, params = []) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");
		if (/from finan_financial_events/i.test(sql)) {
			return { rows: [] };
		}
		if (/finan_calendar_event_types.*finan_calendar_priorities/is.test(sql)) {
			return { rows: [{ type_count: 1, priority_count: 1 }] };
		}
		if (/from finan_calendar_event_rules/i.test(sql)) {
			return { rows: [] };
		}
		if (/from finan_calendar_holidays/i.test(sql)) {
			return { rows: [] };
		}
		if (/insert into finan_financial_events/i.test(sql)) {
			return {
				rows: [
					{
						id: "finan_event_1",
						title: params[1],
						description: params[2],
						event_date: params[3],
						event_type: params[4],
						priority: params[5],
						created_by: params[6],
						responsible_user_id: params[7],
						created_at: new Date(),
						updated_at: new Date(),
					},
				],
			};
		}
		if (/update finan_financial_events/i.test(sql)) {
			return { rows: [{ id: "finan_event_1" }] };
		}
		if (/delete from finan_financial_events/i.test(sql)) {
			return { rows: [] };
		}
		return fallbackQuery(text, params);
	});
	return dbMock;
}

describe("Calendário Financeiro", () => {
	let dbMock;
	let app;

	beforeEach(() => {
		dbMock = extendMockForCalendario(createFinanDbMock({ session: null }));
		app = loadFinanApp(dbMock);
	}, 30000);

	afterEach(() => {
		dbMock = null;
		app = null;
	});

	it("GET /calendario-financeiro funciona pra qualquer usuário autenticado, sem permissão especial", async () => {
		dbMock.setSession(sessionWithPermissions([]));
		const response = await request(app)
			.get("/api/finan/calendario-financeiro")
			.set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.ok).toBe(true);
	});

	it("GET sem autenticação -> 401", async () => {
		const response = await request(app).get("/api/finan/calendario-financeiro");
		expect(response.status).toBe(401);
	});

	it("POST sem finan.calendario.manage -> 403", async () => {
		dbMock.setSession(sessionWithPermissions([]));
		const response = await request(app)
			.post("/api/finan/calendario-financeiro")
			.set("Authorization", BEARER)
			.send({ title: "Fechamento", eventDate: "2026-01-15" });
		expect(response.status).toBe(403);
	});

	it("POST com finan.calendario.manage cria o evento", async () => {
		dbMock.setSession(sessionWithPermissions(["finan.calendario.manage"]));
		const response = await request(app)
			.post("/api/finan/calendario-financeiro")
			.set("Authorization", BEARER)
			.send({ title: "Fechamento", eventDate: "2026-01-15", eventType: "fechamento", priority: "atencao" });
		expect(response.status).toBe(200);
		expect(response.body.ok).toBe(true);
		expect(response.body.event.title).toBe("Fechamento");
	});

	it("POST valida título e data obrigatórios", async () => {
		dbMock.setSession(sessionWithPermissions(["finan.calendario.manage"]));
		const response = await request(app)
			.post("/api/finan/calendario-financeiro")
			.set("Authorization", BEARER)
			.send({ title: "", eventDate: "data-invalida" });
		expect(response.status).toBe(400);
	});

	it("admin sempre pode gerenciar, mesmo sem a permissão específica na lista", async () => {
		dbMock.setSession(adminSession());
		const response = await request(app)
			.delete("/api/finan/calendario-financeiro/finan_event_1")
			.set("Authorization", BEARER);
		expect(response.status).toBe(200);
	});
});

// Teste de ponta a ponta (rota real + mock de banco) do cenario
// exatamente reportado em produção: regra "todo 5º dia útil do mês"
// cadastrada, mas a ocorrência não aparecia em GET /calendario-financeiro
// (usado pelo calendário e pela faixa da semana do dashboard), mesmo o
// preview de "próximas datas" (GET /regras) calculando certo — pra provar
// que as duas rotas realmente divergiam nesse cenário e que a correção
// (isolar a query de eventos avulsos da expansão de regra) resolve.
describe("Calendário Financeiro: regra recorrente aparece em GET /calendario-financeiro", () => {
	function ruleRow() {
		return {
			id: "finan_rule_1",
			title: "Salário",
			description: null,
			event_type: "vencimento",
			priority: "atencao",
			alert_days_before: [],
			notify_role_ids: [],
			nth_business_day: 5,
			business_day_city: null,
		};
	}

	it("GET /calendario-financeiro inclui a ocorrência da regra na data certa (08/09/2026, pulando o feriado de 07/09)", async () => {
		const dbMock = createFinanDbMock({ session: sessionWithPermissions([]) });
		const fallbackQuery = dbMock.query.getMockImplementation();
		dbMock.query.mockImplementation(async (text, params = []) => {
			const sql = String(typeof text === "string" ? text : text?.text || "");
			if (/from finan_financial_events/i.test(sql)) {
				return { rows: [] };
			}
			if (/from finan_calendar_event_rules/i.test(sql)) {
				return { rows: [ruleRow()] };
			}
			if (/from finan_calendar_holidays/i.test(sql)) {
				return { rows: [] };
			}
			return fallbackQuery(text, params);
		});
		const app = loadFinanApp(dbMock);

		const response = await request(app)
			.get("/api/finan/calendario-financeiro?from=2026-09-01&to=2026-09-30")
			.set("Authorization", BEARER);

		expect(response.status).toBe(200);
		expect(response.body.ok).toBe(true);
		const occurrence = response.body.events.find((event) => event.rule_id === "finan_rule_1");
		expect(occurrence).toBeTruthy();
		expect(occurrence.event_date).toBe("2026-09-08");
	});

	it("REGRESSÃO: mesmo se a query de eventos avulsos falhar (ex.: coluna faltando em produção), a ocorrência da regra ainda aparece", async () => {
		const dbMock = createFinanDbMock({ session: sessionWithPermissions([]) });
		const fallbackQuery = dbMock.query.getMockImplementation();
		dbMock.query.mockImplementation(async (text, params = []) => {
			const sql = String(typeof text === "string" ? text : text?.text || "");
			if (/from finan_financial_events/i.test(sql)) {
				throw new Error('column "notify_role_ids" does not exist');
			}
			if (/from finan_calendar_event_rules/i.test(sql)) {
				return { rows: [ruleRow()] };
			}
			if (/from finan_calendar_holidays/i.test(sql)) {
				return { rows: [] };
			}
			return fallbackQuery(text, params);
		});
		const app = loadFinanApp(dbMock);

		const response = await request(app)
			.get("/api/finan/calendario-financeiro?from=2026-09-01&to=2026-09-30")
			.set("Authorization", BEARER);

		expect(response.status).toBe(200);
		const occurrence = response.body.events.find((event) => event.rule_id === "finan_rule_1");
		expect(occurrence).toBeTruthy();
		expect(occurrence.event_date).toBe("2026-09-08");
	});
});

describe("Calendário Financeiro: GET /feriados devolve o feriado nacional mesmo com o banco vazio", () => {
	it("07/09/2026 aparece na lista de feriados de setembro/2026, sem nenhuma linha no banco", async () => {
		const dbMock = createFinanDbMock({ session: sessionWithPermissions([]) });
		const app = loadFinanApp(dbMock);
		const response = await request(app)
			.get("/api/finan/calendario-financeiro/feriados?from=2026-09-01&to=2026-09-30")
			.set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.ok).toBe(true);
		const holiday = response.body.holidays.find((item) => item.holiday_date === "2026-09-07");
		expect(holiday).toBeTruthy();
		expect(holiday.name).toBe("Independência do Brasil");
	});
});
