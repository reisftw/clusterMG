const assert = require("node:assert/strict");
const test = require("node:test");
const { dashboard, detail, kanban, listActivations } = require("./activationApiService");

const rows = [
	{
		id: "snap-1",
		hubsoft_order_id: 1,
		order_number: "OS-1",
		order_type_id: 4,
		order_type_name: "INSTALAÇÃO",
		status: "pendente",
		executando: false,
		created_at_hubsoft: "2026-09-30T10:00:00Z",
		scheduled_start_at: "2026-09-30T12:00:00Z",
		first_seen_at: "2026-09-30T10:01:00Z",
		last_seen_at: "2026-09-30T10:01:00Z",
		synced_at: "2026-09-30T10:01:00Z",
		version: 1,
		service_description: "Plano desconhecido",
		brand: "UNKNOWN",
		technician_match_status: "not_found",
	},
	{
		id: "snap-2",
		hubsoft_order_id: 2,
		order_number: "OS-2",
		order_type_id: 760,
		order_type_name: "INSTALAÇÃO PME",
		status: "finalizado",
		executando: false,
		created_at_hubsoft: "2026-09-30T09:00:00Z",
		executed_end_at: "2026-09-30T13:00:00Z",
		closure_reason_name: "CONCLUÍDA",
		activation_closure_status: "CONCLUIDA",
		first_seen_at: "2026-09-30T13:01:00Z",
		last_seen_at: "2026-09-30T13:01:00Z",
		synced_at: "2026-09-30T13:01:00Z",
		version: 1,
		service_description: "SEMPRE 600MB",
		brand: "SEMPRE",
		technician_name: "Tecnico Teste",
		company_name: "Empresa Teste",
		city_name: "Cidade Teste",
		connection_connected: true,
		pppoe_username: "pppoe-test",
		technician_match_status: "matched",
	},
	{
		id: "snap-3",
		hubsoft_order_id: 3,
		order_number: "OS-3",
		order_type_id: 7,
		order_type_name: "SUPORTE",
		status: "pendente",
		executando: false,
		created_at_hubsoft: "2026-09-30T08:00:00Z",
		first_seen_at: "2026-09-30T08:01:00Z",
		last_seen_at: "2026-09-30T08:01:00Z",
		synced_at: "2026-09-30T08:01:00Z",
		version: 1,
		service_description: "SEMPRE 600MB",
		brand: "SEMPRE",
		technician_match_status: "not_found",
	},
];

function fakeDb(resultRows = rows) {
	return {
		async query(sql, params) {
			if (sql.includes("where os.id =")) return { rows: resultRows.filter((row) => row.id === params[0]) };
			if (Array.isArray(params?.[0])) return { rows: resultRows.filter((row) => params[0].includes(row.order_type_id)) };
			if (Array.isArray(params?.[2])) return { rows: resultRows.filter((row) => params[2].includes(row.order_type_id)) };
			return { rows: resultRows };
		},
	};
}

test("listActivations pagina e preserva dados sem tecnico/conexao", async () => {
	const data = await listActivations(fakeDb(), { period: "custom", from: "2026-09-30", to: "2026-09-30", page: 1, limit: 1 });
	assert.equal(data.total, 2);
	assert.equal(data.items.length, 1);
	const full = await listActivations(fakeDb(), { period: "custom", from: "2026-09-30", to: "2026-09-30", page: 1, limit: 10 });
	const pending = full.items.find((item) => item.id === "snap-1");
	assert.equal(pending.technician.name, "Não identificado");
	assert.equal(pending.service.brand, "UNKNOWN");
	assert.equal(pending.connection.connected, undefined);
});

test("dashboard consolida status e dimensoes", async () => {
	const data = await dashboard(fakeDb(), { period: "custom", from: "2026-09-30", to: "2026-09-30" });
	assert.equal(data.summary.pending, 1);
	assert.equal(data.distributions.byType.length, 2);
	assert.ok(data.distributions.topTechnicians.some((item) => item.label === "Tecnico Teste"));
});

test("dashboard contabiliza ativacoes apenas com a familia permitida", async () => {
	const data = await dashboard(fakeDb(), { period: "custom", from: "2026-09-30", to: "2026-09-30" });
	assert.equal(data.summary.created, 2);
	assert.equal(data.distributions.byType.some((item) => item.label === "SUPORTE"), false);
});

test("kanban separa abertas atuais de encerradas sem conclusao", async () => {
	const kanbanRows = [
		...rows,
		{
			id: "snap-4",
			hubsoft_order_id: 4,
			order_number: "OS-4",
			order_type_id: 4,
			order_type_name: "INSTALAÇÃO",
			status: "finalizado",
			executando: false,
			created_at_hubsoft: "2026-09-01T08:00:00Z",
			executed_end_at: "2026-09-30T13:00:00Z",
			closure_reason_name: "CLIENTE AUSENTE",
			activation_closure_status: "ENCERRADA_SEM_CONCLUSAO",
			first_seen_at: "2026-09-30T13:01:00Z",
			last_seen_at: "2026-09-30T13:01:00Z",
			synced_at: "2026-09-30T13:01:00Z",
			version: 1,
			service_description: "SEMPRE 600MB",
			brand: "SEMPRE",
			technician_match_status: "matched",
		},
	];
	const data = await kanban({
		async query(sql) {
			const activationRows = kanbanRows.filter((row) => [4, 760].includes(row.order_type_id));
			if (sql.includes("activation_closure_status = 'ENCERRADA_SEM_CONCLUSAO'")) return { rows: activationRows.filter((row) => row.activation_closure_status === "ENCERRADA_SEM_CONCLUSAO") };
			if (sql.includes("activation_closure_status = 'CONCLUIDA'")) return { rows: activationRows.filter((row) => row.activation_closure_status === "CONCLUIDA") };
			return { rows: activationRows.filter((row) => row.status === "pendente") };
		},
	}, { period: "custom", from: "2026-09-30", to: "2026-09-30", limit: 10 });
	const toSchedule = data.columns.find((column) => column.id === "to_schedule");
	const toValidate = data.columns.find((column) => column.id === "to_validate");
	const completed = data.columns.find((column) => column.id === "completed");
	assert.deepEqual(toSchedule.items.map((item) => item.id), ["snap-1"]);
	assert.deepEqual(toValidate.items.map((item) => item.id), ["snap-4"]);
	assert.deepEqual(completed.items.map((item) => item.id), ["snap-2"]);
});

test("detail retorna item publico", async () => {
	const item = await detail(fakeDb(), "snap-2");
	assert.equal(item.orderNumber, "OS-2");
	assert.equal(item.derivedStatus.id, "completed");
	assert.equal(item.connection.connected, true);
});
