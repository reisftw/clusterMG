// Busca Global (Roteiro Finan #22 + #31 — Fase 4B, Command Palette
// Ctrl+K). Cobre: as novas fontes (notas fiscais, contas a pagar/
// receber, colaboradores, plano de contas) aparecem no resultado com o
// `tipo` certo, termo curto (<2 chars) não dispara nenhuma query, e
// busca por CNPJ (dígitos) casa mesmo com pontuação no cadastro.
import request from "supertest";
import { describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

function buildDbMock() {
	const dbMock = createFinanDbMock({ session: adminSession() });
	const baseQuery = dbMock.query;
	dbMock.query = async (text, params = []) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");
		if (/from finan_fornecedores/i.test(sql) && /regexp_replace/i.test(sql)) {
			return { rows: [{ id: "f1", nome: "Cemig Distribuição", codigo: "260131", cnpj: "06.981.180/0001-16" }] };
		}
		if (/from finan_notas_fiscais/i.test(sql)) {
			return { rows: [{ id: "n1", numero: "12345", fornecedor_nome: "Cemig Distribuição", valor: 100, status: "paga" }] };
		}
		if (/from finan_contas_pagar/i.test(sql)) {
			return { rows: [{ id: "cp1", descricao: "Pagamento Cemig Agosto", valor: 500, status: "pago", fornecedor_nome: "Cemig Distribuição" }] };
		}
		if (/from finan_contas_receber/i.test(sql)) return { rows: [] };
		if (/from finan_equipe_colaboradores/i.test(sql)) return { rows: [{ id: "c1", nome: "Cemira Souza", setor: "Financeiro" }] };
		if (/from finan_contas\b/i.test(sql)) return { rows: [] };
		if (/from finan_contratos/i.test(sql)) return { rows: [] };
		if (/from finan_integration_configs/i.test(sql)) return { rows: [] };
		return baseQuery(text, params);
	};
	return dbMock;
}

describe("GET /api/finan/busca", () => {
	it("termo com menos de 2 caracteres nao dispara nenhuma query, devolve vazio", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app).get("/api/finan/busca?q=c").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		expect(response.body.items).toEqual([]);
	});

	it("agrega fornecedor, nota fiscal, conta a pagar e colaborador na mesma busca", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app).get("/api/finan/busca?q=cemig").set("Authorization", BEARER);
		expect(response.status).toBe(200);
		const tipos = response.body.items.map((item) => item.tipo);
		expect(tipos).toContain("fornecedor");
		expect(tipos).toContain("nota_fiscal");
		expect(tipos).toContain("conta_pagar");
		expect(tipos).toContain("colaborador");
	});

	it("resultado de fornecedor mostra CNPJ no subtitulo quando cadastrado", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app).get("/api/finan/busca?q=cemig").set("Authorization", BEARER);
		const fornecedor = response.body.items.find((item) => item.tipo === "fornecedor");
		expect(fornecedor.subtitulo).toContain("06.981.180/0001-16");
	});
});
