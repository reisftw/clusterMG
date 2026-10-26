const { test } = require("node:test");
const assert = require("node:assert/strict");

const dbPath = require.resolve("../../db");
const hubsoftPath = require.resolve("../../hubsoftSyncProfiles");
const pdfPath = require.resolve("./returnReceiptPdf");
const servicePath = require.resolve("./returnReceiptsService");
const calls = [];
let trackedOrders = [];
let liveOrders = new Map();

require.cache[dbPath] = {
	id: dbPath,
	filename: dbPath,
	loaded: true,
	exports: {
		query: async (sql, params) => {
			calls.push({ sql, params });
			if (sql.includes("limit 10") && sql.includes("raw_excerpt")) {
				return { rows: trackedOrders };
			}
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
require.cache[hubsoftPath] = {
	id: hubsoftPath,
	filename: hubsoftPath,
	loaded: true,
	exports: {
		createAutomationSession: async () => ({ token: "test-token" }),
		automationRequest: async (_session, path) => {
			const id = path.split("/").pop();
			if (!liveOrders.has(id)) throw new Error(`O.S ${id} nao configurada no teste.`);
			return { ordem_servico: liveOrders.get(id) };
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
	trackedOrders = [];
	liveOrders = new Map();
	const result = await service.lookup("32929", { role: "admin", uid: "admin-1" });

	assert.match(calls[0].sql, /with latest_orders/);
	assert.match(calls[0].sql, /state_rank = 1/);
	assert.equal(result.item.serviceOrderNumber, "014326295113213325");
	assert.equal(result.item.clientName, "CLIENTE TESTE");
});

test("comprovante usa o estado finalizado consultado ao vivo no HubSoft", async () => {
	calls.length = 0;
	trackedOrders = [{
		hubsoft_id: "3366396",
		hubsoft_number: "014326295113213325",
		source_type: "CANCELAMENTO FTTH",
		source_status: "pendente",
		source_date: "2026-10-26T12:00:00.000Z",
		updated_at: "2026-10-26T12:00:00.000Z",
		raw_excerpt: { codigo_cliente: "55131", cliente_nome: "CAMILA ALVES DE LIMA FUMEGA" },
	}];
	liveOrders = new Map([["3366396", {
		id_ordem_servico: "3366396",
		numero_ordem_servico: "014326295113213325",
		codigo_cliente: "55131",
		nome_razaosocial: "CAMILA ALVES DE LIMA FUMEGA",
		status: { valor: "finalizado" },
		tipo_ordem_servico: { descricao: "CANCELAMENTO FTTH" },
		data_termino_executado: "2026-10-26T15:00:00.000Z",
		tecnicos: [{ name: "TECNICO TESTE" }],
	}]]);

	const result = await service.lookup("55131", { role: "admin", uid: "admin-1" });

	assert.equal(result.item.clientCode, "55131");
	assert.equal(result.item.clientName, "CAMILA ALVES DE LIMA FUMEGA");
	assert.equal(result.item.completedAt, "2026-10-26T15:00:00.000Z");
});

test("comprovante continua bloqueado quando o HubSoft confirma a OS aberta", async () => {
	trackedOrders = [{
		hubsoft_id: "3366396",
		hubsoft_number: "014326295113213325",
		source_type: "CANCELAMENTO FTTH",
		source_status: "pendente",
		raw_excerpt: { codigo_cliente: "55131" },
	}];
	liveOrders = new Map([["3366396", {
		id_ordem_servico: "3366396",
		numero_ordem_servico: "014326295113213325",
		codigo_cliente: "55131",
		status: { valor: "pendente" },
		tipo_ordem_servico: { descricao: "CANCELAMENTO FTTH" },
	}]]);

	await assert.rejects(
		service.lookup("55131", { role: "admin", uid: "admin-1" }),
		(error) => error.statusCode === 409 && /ainda esta aberta/.test(error.message),
	);
});
