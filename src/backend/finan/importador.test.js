// Importador universal com templates (Roteiro Finan #35, Fase 4B,
// estende #17). Cobre: applyMapping/validateMappedRecords puros (sem
// banco), e as rotas HTTP — preview de planilha, CRUD de templates, e
// aplicar um template upserta fornecedor por CNPJ (ou por nome quando
// não tem CNPJ).
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import request from "supertest";
import XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp, sessionWithPermissions } from "./testUtils.js";

const finanRequire = createRequire(path.join(process.cwd(), "apps/finan/backend/package.json"));
process.env.FINAN_PGHOST = process.env.FINAN_PGHOST || "localhost";
process.env.FINAN_PGUSER = process.env.FINAN_PGUSER || "test";
process.env.FINAN_PGDATABASE = process.env.FINAN_PGDATABASE || "test";
const { applyMapping, validateMappedRecords } = finanRequire("./src/importador/service.js");

const BEARER = "Bearer qualquer-token-de-teste";

describe("importador/service — applyMapping/validateMappedRecords (puro)", () => {
	it("mapeia colunas da planilha pros campos-alvo definidos no template", () => {
		const rows = [{ "Razão Social": "Cemig Distribuição", "CNPJ Fornecedor": "06.981.180/0001-16" }];
		const mapping = { nome: "Razão Social", cnpj: "CNPJ Fornecedor" };
		const records = applyMapping(rows, mapping, "fornecedores");
		expect(records).toEqual([{ nome: "Cemig Distribuição", codigo: "", cnpj: "06.981.180/0001-16" }]);
	});

	it("linha sem o campo obrigatorio (nome) vai pra 'invalid', nao trava as outras", () => {
		const records = [{ nome: "Fornecedor A", codigo: "", cnpj: "" }, { nome: "", codigo: "", cnpj: "" }];
		const { valid, invalid } = validateMappedRecords(records, "fornecedores");
		expect(valid).toHaveLength(1);
		expect(invalid).toHaveLength(1);
		expect(invalid[0].missing).toEqual(["nome"]);
	});
});

function buildXlsxBuffer(rows) {
	const worksheet = XLSX.utils.aoa_to_sheet(rows);
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, worksheet, "Plan1");
	return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildDbMock() {
	const dbMock = createFinanDbMock({ session: adminSession() });
	const baseQuery = dbMock.query;
	const templates = [];
	dbMock.query = async (text, params = []) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");
		if (/insert into finan_import_templates/i.test(sql)) {
			const row = {
				id: params[0],
				nome: params[1],
				descricao: params[2],
				entidade_alvo: params[3],
				mapeamento: JSON.parse(params[4]),
				created_by_id: params[5],
				created_by_nome: params[6],
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			};
			templates.push(row);
			return { rows: [row] };
		}
		if (/select \* from finan_import_templates where id/i.test(sql)) {
			return { rows: templates.filter((t) => t.id === params[0]) };
		}
		if (/select \* from finan_import_templates order by nome/i.test(sql)) {
			return { rows: templates };
		}
		if (/from finan_fornecedores where regexp_replace/i.test(sql)) return { rows: [] };
		if (/from finan_fornecedores where lower\(nome\)/i.test(sql)) return { rows: [] };
		if (/insert into finan_fornecedores/i.test(sql)) return { rows: [] };
		return baseQuery(text, params);
	};
	return dbMock;
}

describe("POST /api/finan/importador/preview", () => {
	it("le a planilha e devolve colunas + amostra de linhas", async () => {
		const app = loadFinanApp(buildDbMock());
		const buffer = buildXlsxBuffer([
			["Razão Social", "CNPJ Fornecedor"],
			["Cemig Distribuição", "06.981.180/0001-16"],
		]);
		const response = await request(app)
			.post("/api/finan/importador/preview")
			.set("Authorization", BEARER)
			.attach("arquivo", buffer, "fornecedores.xlsx");

		expect(response.status).toBe(200);
		expect(response.body.columns).toEqual(["Razão Social", "CNPJ Fornecedor"]);
		expect(response.body.sampleRows[0]["Razão Social"]).toBe("Cemig Distribuição");
	});
});

describe("Templates de importação — CRUD e aplicar", () => {
	it("cria um template, lista, e aplicar upserta fornecedor via mapeamento salvo", async () => {
		const dbMock = buildDbMock();
		const app = loadFinanApp(dbMock);

		const created = await request(app)
			.post("/api/finan/importador/templates")
			.set("Authorization", BEARER)
			.send({
				nome: "Fornecedores Sistema X",
				entidadeAlvo: "fornecedores",
				mapeamento: { nome: "Razão Social", cnpj: "CNPJ Fornecedor" },
			});
		expect(created.status).toBe(201);
		const templateId = created.body.template.id;

		const list = await request(app).get("/api/finan/importador/templates").set("Authorization", BEARER);
		expect(list.body.templates).toHaveLength(1);

		const buffer = buildXlsxBuffer([
			["Razão Social", "CNPJ Fornecedor"],
			["Cemig Distribuição", "06.981.180/0001-16"],
		]);
		const applied = await request(app)
			.post(`/api/finan/importador/templates/${templateId}/aplicar`)
			.set("Authorization", BEARER)
			.attach("arquivo", buffer, "fornecedores.xlsx");

		expect(applied.status).toBe(200);
		expect(applied.body.resultado.created).toBe(1);
		expect(applied.body.resultado.total).toBe(1);
	});

	it("sem finan.configuracoes.manage, criar template devolve 403", async () => {
		const dbMock = buildDbMock();
		dbMock.setSession(sessionWithPermissions(["finan.configuracoes.view"]));
		const app = loadFinanApp(dbMock);
		const response = await request(app)
			.post("/api/finan/importador/templates")
			.set("Authorization", BEARER)
			.send({ nome: "X", entidadeAlvo: "fornecedores", mapeamento: { nome: "Col A" } });
		expect(response.status).toBe(403);
	});
});
