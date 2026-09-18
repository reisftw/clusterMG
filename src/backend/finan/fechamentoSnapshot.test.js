// Snapshots financeiros de fechamento (Roteiro Finan #36, Fase 4C).
// Cobre: fechar um período captura o resumo (orçado/realizado/linhas)
// num snapshot congelado, e GET /orcamento/resumo devolve esse snapshot
// (não recalcula ao vivo) quando o período está fechado.
import request from "supertest";
import { describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

function buildDbMock({ fechamentoRow = null } = {}) {
	const dbMock = createFinanDbMock({ session: adminSession() });
	const baseQuery = dbMock.query;
	let insertedSnapshot = null;
	dbMock.query = async (text, params = []) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");

		if (/select status, snapshot, fechado_em from finan_fechamentos_mensais/i.test(sql)) {
			return { rows: fechamentoRow ? [fechamentoRow] : [] };
		}
		if (/from finan_orcamento_matriz[\s\S]*cross join lancamentos/i.test(sql)) {
			return { rows: [{ orcado: 100000, realizado: 87500, linhas: 42 }] };
		}
		if (/insert into finan_fechamentos_mensais/i.test(sql)) {
			insertedSnapshot = params[4] ? JSON.parse(params[4]) : null;
			return {
				rows: [
					{
						ano: params[0],
						mes: params[1],
						status: "fechado",
						fechado_por_id: params[2],
						fechado_por_nome: params[3],
						snapshot: insertedSnapshot,
					},
				],
			};
		}
		if (/insert into finan_audit_logs/i.test(sql)) return { rows: [] };
		return baseQuery(text, params);
	};
	return dbMock;
}

describe("POST /api/finan/fechamento/fechar — captura snapshot", () => {
	it("fecha o período e grava o resumo orçado/realizado/linhas no snapshot", async () => {
		const dbMock = buildDbMock();
		const app = loadFinanApp(dbMock);
		const response = await request(app)
			.post("/api/finan/fechamento/fechar")
			.set("Authorization", BEARER)
			.send({ ano: 2026, mes: 8 });

		expect(response.status).toBe(200);
		expect(response.body.fechamento.snapshot.resumo).toEqual({ orcado: 100000, realizado: 87500, linhas: 42 });
		expect(response.body.fechamento.snapshot.geradoEm).toBeTruthy();
	});
});

describe("GET /api/finan/fechamento — Score de Fechamento (Roteiro #42)", () => {
	it("checklist 3/3 em dia = score 100", async () => {
		const dbMock = buildDbMock();
		const baseQuery = dbMock.query;
		dbMock.query = async (text, params = []) => {
			const sql = String(typeof text === "string" ? text : text?.text || "");
			if (/from finan_orcamento_lancamentos[\s\S]*conta_id is null/i.test(sql)) return { rows: [{ total: 0 }] };
			if (/from finan_orcamento_matriz where ano/i.test(sql)) return { rows: [{ total: 5 }] };
			if (/join finan_orcamento_lancamentos b/i.test(sql)) return { rows: [{ total: 0 }] };
			if (/select \* from finan_fechamentos_mensais where ano = \$1 and mes = \$2$/i.test(sql.trim())) return { rows: [] };
			return baseQuery(text, params);
		};
		const app = loadFinanApp(dbMock);
		const response = await request(app).get("/api/finan/fechamento?ano=2026&mes=8").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.scoreFechamento).toBe(100);
	});

	it("checklist 1/3 em dia = score 33.3", async () => {
		const dbMock = buildDbMock();
		const baseQuery = dbMock.query;
		dbMock.query = async (text, params = []) => {
			const sql = String(typeof text === "string" ? text : text?.text || "");
			if (/from finan_orcamento_lancamentos[\s\S]*conta_id is null/i.test(sql)) return { rows: [{ total: 4 }] }; // pendente
			if (/from finan_orcamento_matriz where ano/i.test(sql)) return { rows: [{ total: 5 }] }; // ok
			if (/join finan_orcamento_lancamentos b/i.test(sql)) return { rows: [{ total: 2 }] }; // pendente
			if (/select \* from finan_fechamentos_mensais where ano = \$1 and mes = \$2$/i.test(sql.trim())) return { rows: [] };
			return baseQuery(text, params);
		};
		const app = loadFinanApp(dbMock);
		const response = await request(app).get("/api/finan/fechamento?ano=2026&mes=8").set("Authorization", BEARER);
		expect(response.body.scoreFechamento).toBeCloseTo(33.3, 1);
	});
});

describe("GET /api/finan/orcamento/resumo — congelado quando fechado", () => {
	it("período aberto: devolve resumo ao vivo (congelado:false)", async () => {
		const dbMock = buildDbMock({ fechamentoRow: null });
		const app = loadFinanApp(dbMock);
		const response = await request(app)
			.get("/api/finan/orcamento/resumo?ano=2026&mes=8")
			.set("Authorization", BEARER);

		expect(response.status).toBe(200);
		expect(response.body.congelado).toBe(false);
		expect(response.body.resumo).toEqual({ orcado: 100000, realizado: 87500, linhas: 42 });
	});

	it("período fechado com snapshot: devolve o resumo CONGELADO, não recalcula", async () => {
		const dbMock = buildDbMock({
			fechamentoRow: {
				status: "fechado",
				fechado_em: "2026-09-05T12:00:00Z",
				snapshot: { resumo: { orcado: 100000, realizado: 87500, linhas: 42 }, geradoEm: "2026-09-05T12:00:00Z" },
			},
		});
		const app = loadFinanApp(dbMock);
		const response = await request(app)
			.get("/api/finan/orcamento/resumo?ano=2026&mes=8")
			.set("Authorization", BEARER);

		expect(response.status).toBe(200);
		expect(response.body.congelado).toBe(true);
		expect(response.body.resumo).toEqual({ orcado: 100000, realizado: 87500, linhas: 42 });
		expect(response.body.fechadoEm).toBe("2026-09-05T12:00:00Z");
	});
});
