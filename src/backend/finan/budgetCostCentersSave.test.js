// Regressão de produção (2026-09-10): PUT /api/financeiro/orcamento/
// centros-custo dava 500 (Postgres 23503) pra QUALQUER salvamento,
// assim que existia pelo menos 1 lançamento real importado
// (finan_orcamento_lancamentos) referenciando um centro/conta —
// exatamente o caso normal de produção depois da primeira planilha
// subida. Causa: saveBudgetCostCenters fazia "delete from
// finan_centros_custo"/"delete from finan_contas" cegos antes de
// reinserir, e a migration 010 tem
// fk_finan_orcamento_lancamentos_centro/_conta com ON DELETE RESTRICT.
// Fix: essas duas tabelas passam por upsertMany (INSERT ... ON
// CONFLICT DO UPDATE) em vez de delete-then-reinsert.
import request from "supertest";
import { describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

function buildDbMock() {
	const dbMock = createFinanDbMock({ session: adminSession() });
	const baseQuery = dbMock.query;
	const queriesExecutadas = [];
	const mockQuery = async (text, params = []) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");
		queriesExecutadas.push(sql.trim());
		// Simula a FK real: um "delete from finan_centros_custo" ou "delete
		// from finan_contas" tem que estourar 23503, exatamente como o
		// Postgres real faria com lançamentos referenciando essas linhas —
		// assim o teste falha (e nao passa "por acidente") se alguem
		// reintroduzir o delete cego.
		if (/^delete from finan_centros_custo\b/i.test(sql) || /^delete from finan_contas\b/i.test(sql)) {
			const error = new Error(
				'update or delete on table "finan_centros_custo" violates foreign key constraint "fk_finan_orcamento_lancamentos_centro" on table "finan_orcamento_lancamentos"',
			);
			error.code = "23503";
			throw error;
		}
		if (/^(begin|commit|rollback|set constraints)/i.test(sql)) return { rows: [] };
		if (/^select data, source_payload from finan_config_meta/i.test(sql)) return { rows: [] };
		if (/^insert into finan_config_meta/i.test(sql)) return { rows: [] };
		if (/^insert into finan_/i.test(sql)) return { rows: [] };
		return baseQuery(text, params);
	};
	dbMock.query = mockQuery;
	dbMock.connect = async () => ({ query: mockQuery, release: () => {} });
	dbMock.__queriesExecutadas = queriesExecutadas;
	return dbMock;
}

describe("PUT /api/financeiro/orcamento/centros-custo — regressão FK 23503", { timeout: 15000 }, () => {
	it("salva com sucesso mesmo com lançamentos reais referenciando centros/contas (nunca faz delete cego nessas 2 tabelas)", async () => {
		const dbMock = buildDbMock();
		const app = loadFinanApp(dbMock);
		const response = await request(app)
			.put("/api/financeiro/orcamento/centros-custo")
			.set("Authorization", BEARER)
			.send({
				accounts: [{ id: "c1", codigo: "1", nome: "Conta 1" }],
				centers: [{ id: "cc1", codigo: "10", nome: "Centro 1" }],
			});

		expect(response.status).toBe(200);
		const queries = dbMock.__queriesExecutadas;
		expect(queries.some((q) => /^delete from finan_centros_custo\b/i.test(q))).toBe(false);
		expect(queries.some((q) => /^delete from finan_contas\b/i.test(q))).toBe(false);
		expect(queries.some((q) => /^insert into finan_centros_custo[\s\S]*on conflict/i.test(q))).toBe(true);
		expect(queries.some((q) => /^insert into finan_contas[\s\S]*on conflict/i.test(q))).toBe(true);
	});
});
