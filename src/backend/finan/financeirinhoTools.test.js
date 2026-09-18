// Financeirinho — tools.js (function calling). Cobre especificamente o
// parametro "busca" adicionado apos o usuario reportar que "Quanto
// pagamos para a Cemig neste mes?" falhava (a tool nao tinha como filtrar
// por fornecedor/descricao, so por status).
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { beforeEach, describe, expect, it, vi } from "vitest";

const finanRequire = createRequire(path.join(process.cwd(), "apps/finan/backend/package.json"));
const dbPath = finanRequire.resolve("./src/db.js");

function mockDb(queryImpl) {
	finanRequire.cache[dbPath] = {
		id: dbPath,
		filename: dbPath,
		loaded: true,
		exports: { query: queryImpl },
	};
}

function clearToolsCache() {
	const toolsPath = finanRequire.resolve("./src/financeirinho/tools.js");
	delete finanRequire.cache[toolsPath];
}

describe("apps/finan/backend/src/financeirinho/tools.js", () => {
	beforeEach(() => {
		clearToolsCache();
	});

	it("consultarContasAPagar filtra por descricao OU nome do fornecedor quando 'busca' e informado", async () => {
		const query = vi.fn(async (sql) => {
			if (/from finan_contas_pagar cp/i.test(sql)) return { rows: [{ descricao: "Energia elétrica", fornecedor_nome: "Cemig", valor: 500 }] };
			return { rows: [{ total_pendente: 500 }] };
		});
		mockDb(query);
		const { findTool } = finanRequire("./src/financeirinho/tools.js");
		const tool = findTool("consultarContasAPagar");
		const result = await tool.handler(null, { busca: "Cemig" });

		expect(result.itens).toHaveLength(1);
		const [sql, params] = query.mock.calls[0];
		expect(sql).toMatch(/left join finan_fornecedores/i);
		expect(sql).toMatch(/descricao ilike|f\.nome ilike/i);
		expect(params).toContain("%Cemig%");
	});

	it("consultarNotasFiscais filtra por descricao, fornecedor_nome ou cnpj_emissor quando 'busca' e informado", async () => {
		const query = vi.fn(async () => ({ rows: [] }));
		mockDb(query);
		const { findTool } = finanRequire("./src/financeirinho/tools.js");
		const tool = findTool("consultarNotasFiscais");
		await tool.handler(null, { busca: "Vivo" });

		const [sql, params] = query.mock.calls[0];
		expect(sql).toMatch(/fornecedor_nome ilike/i);
		expect(sql).toMatch(/cnpj_emissor ilike/i);
		expect(params).toContain("%Vivo%");
	});

	it("consultarContasAReceber filtra por descricao ou cliente_nome quando 'busca' e informado", async () => {
		const query = vi.fn(async () => ({ rows: [] }));
		mockDb(query);
		const { findTool } = finanRequire("./src/financeirinho/tools.js");
		const tool = findTool("consultarContasAReceber");
		await tool.handler(null, { busca: "Acme" });

		const [sql, params] = query.mock.calls[0];
		expect(sql).toMatch(/cliente_nome ilike/i);
		expect(params).toContain("%Acme%");
	});

	it("sem 'busca', nenhuma das 3 tools quebra (comportamento antigo preservado)", async () => {
		const query = vi.fn(async () => ({ rows: [] }));
		mockDb(query);
		const { findTool } = finanRequire("./src/financeirinho/tools.js");
		await findTool("consultarContasAPagar").handler(null, { status: "pendente" });
		await findTool("consultarContasAReceber").handler(null, {});
		await findTool("consultarNotasFiscais").handler(null, {});
		expect(query).toHaveBeenCalled();
	});
});
