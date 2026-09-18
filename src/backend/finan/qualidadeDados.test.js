// Qualidade de Dados (Roteiro Finan #29, Fase 4A). Cobre: cada checagem
// devolve total/comProblema/percentualOk corretos, o validador de
// CPF/CNPJ pega digito verificador invalido sem chamada externa, e a nota
// geral ignora checagens sem nenhum registro (tabela ainda vazia nao deve
// contar como "100% saudavel" nem derrubar a media).
import request from "supertest";
import { describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp, sessionWithPermissions } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

function buildDbMock() {
	const dbMock = createFinanDbMock({ session: adminSession() });
	const baseQuery = dbMock.query;
	dbMock.query = async (text, params = []) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");

		if (/select nome from finan_fornecedores/i.test(sql)) {
			return { rows: [{ nome: "Fornecedor Sem CNPJ" }] };
		}
		if (/select id, nome, cnpj from finan_fornecedores/i.test(sql)) {
			return {
				rows: [
					{ id: "f1", nome: "Fornecedor Válido", cnpj: "11222333000181" }, // CNPJ com digito valido
					{ id: "f2", nome: "Fornecedor Inválido", cnpj: "11111111000111" }, // digito invalido
				],
			};
		}
		if (/count\(\*\)::int as total[\s\S]*sem_cnpj[\s\S]*from finan_fornecedores/i.test(sql)) {
			return { rows: [{ total: 10, sem_cnpj: 3 }] };
		}
		if (/sem_classe[\s\S]*from finan_orcamento_lancamentos/i.test(sql)) {
			return { rows: [{ total: 100, sem_classe: 2 }] };
		}
		if (/join finan_orcamento_lancamentos b/i.test(sql)) {
			return { rows: [{ total: 4 }] };
		}
		if (/^select count\(\*\)::int as total\s+from finan_orcamento_lancamentos$/i.test(sql.trim())) {
			return { rows: [{ total: 100 }] };
		}
		if (/sem_fornecedor[\s\S]*from finan_notas_fiscais/i.test(sql)) {
			return { rows: [{ total: 0, sem_fornecedor: 0 }] };
		}
		return baseQuery(text, params);
	};
	return dbMock;
}

describe("GET /api/finan/qualidade-dados", { timeout: 15000 }, () => {
	it("devolve cada checagem com total/comProblema/percentualOk corretos", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app).get("/api/finan/qualidade-dados").set("Authorization", BEARER);

		expect(response.status).toBe(200);
		const { checks } = response.body;

		const semCnpj = checks.find((c) => c.id === "fornecedores_sem_cnpj");
		expect(semCnpj.total).toBe(10);
		expect(semCnpj.comProblema).toBe(3);
		expect(semCnpj.percentualOk).toBeCloseTo(70, 1);
		expect(semCnpj.link).toBe("/fornecedores");

		const semClasse = checks.find((c) => c.id === "lancamentos_sem_classe");
		expect(semClasse.total).toBe(100);
		expect(semClasse.comProblema).toBe(2);

		const duplicados = checks.find((c) => c.id === "lancamentos_duplicados");
		expect(duplicados.total).toBe(100);
		expect(duplicados.comProblema).toBe(4);
	});

	it("valida CPF/CNPJ por dígito verificador, sem chamada externa", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app).get("/api/finan/qualidade-dados").set("Authorization", BEARER);

		const cnpjInvalido = response.body.checks.find((c) => c.id === "fornecedores_cnpj_invalido");
		expect(cnpjInvalido.total).toBe(2);
		expect(cnpjInvalido.comProblema).toBe(1);
		expect(cnpjInvalido.amostra[0]).toContain("Fornecedor Inválido");
	});

	it("checagem sem nenhum registro (tabela vazia) não entra na média nem quebra a rota", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app).get("/api/finan/qualidade-dados").set("Authorization", BEARER);

		const notasCheck = response.body.checks.find((c) => c.id === "notas_sem_fornecedor");
		expect(notasCheck.total).toBe(0);
		expect(notasCheck.percentualOk).toBe(100);
		// score geral e number finito (nao NaN/Infinity mesmo com uma
		// checagem zerada no meio da media).
		expect(Number.isFinite(response.body.score)).toBe(true);
	});

	it("sem a permissão finan.qualidade_dados.view, a rota responde 403", async () => {
		const dbMock = buildDbMock();
		dbMock.setSession(sessionWithPermissions(["finan.dashboard.view"]));
		const app = loadFinanApp(dbMock);
		const response = await request(app).get("/api/finan/qualidade-dados").set("Authorization", BEARER);
		expect(response.status).toBe(403);
	});
});
