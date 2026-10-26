const { test } = require("node:test");
const assert = require("node:assert/strict");

const dbPath = require.resolve("../../db");
const pdfPath = require.resolve("./returnReceiptPdf");
const servicePath = require.resolve("./returnReceiptsService");
const calls = [];

require.cache[dbPath] = {
	id: dbPath,
	filename: dbPath,
	loaded: true,
	exports: {
		query: async (sql, params) => {
			calls.push({ sql, params });
			if (sql.includes("with latest_orders")) return { rows: [] };
			if (sql.includes("= 'finalizado'")) {
				return {
					rows: [{
						hubsoft_id: "3366396",
						hubsoft_number: "014326295113213325",
						source_type: "CANCELAMENTO FTTH",
						source_date: "2026-10-26T12:51:55.000Z",
						updated_at: "2026-10-26T13:20:04.000Z",
						raw_excerpt: { cliente_nome: "CLIENTE TESTE", usuario_fechamento: "TECNICO TESTE" },
					}],
				};
			}
			if (sql.includes("from movimentacoes_estoque")) {
				return {
					rows: [{
						id: "mov-1",
						produto_nome: "ONU",
						serie: "AA:BB:CC:DD",
						registrado_por: "TECNICO TESTE",
						empresa_nome: "SEMPRE",
					}],
				};
			}
			if (sql.includes("service_order_return_receipts")) return { rows: [] };
			throw new Error(`Consulta inesperada no teste: ${sql}`);
		},
	},
};
require.cache[pdfPath] = {
	id: pdfPath,
	filename: pdfPath,
	loaded: true,
	exports: {
		generateReturnReceiptPdf: async () => Buffer.from("pdf"),
		isOnnet: () => false,
		safeFilename: () => "cliente.pdf",
	},
};
delete require.cache[servicePath];
const service = require("./returnReceiptsService");

test("comprovante ignora snapshot aberto antigo quando o estado mais recente esta finalizado", async () => {
	calls.length = 0;
	const result = await service.lookup("32929", { role: "admin", uid: "admin-1" });

	assert.match(calls[0].sql, /with latest_orders/);
	assert.match(calls[0].sql, /state_rank = 1/);
	assert.equal(result.item.serviceOrderNumber, "014326295113213325");
	assert.equal(result.item.clientName, "CLIENTE TESTE");
});
