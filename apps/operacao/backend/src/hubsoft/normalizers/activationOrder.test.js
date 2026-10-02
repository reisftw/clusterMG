const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeActivationOrder } = require("./activationOrder");

test("normalizeActivationOrder normaliza tipo, datas, tecnico e fechamento", () => {
	const normalized = normalizeActivationOrder({
		id_ordem_servico: 123,
		numero_ordem_servico: "OS-123",
		id_tipo_ordem_servico: 4,
		id_cliente_servico: 456,
		status: "finalizado",
		executando: false,
		data_cadastro: "2026-09-01T10:00:00-03:00",
		data_termino_executado: "01/09/2026 11:30:00",
		tecnicos: [{ id: 99, nome: "Tecnico Teste" }],
		motivo_fechamento: { id: 135, descricao: "CONCLUÍDA" },
		cidade: { id: 10, nome: "Betim" },
		cliente_servico: {
			id_cliente_servico: 456,
			id_cliente: 777,
			id_servico: 888,
			numero_plano: "ABC",
			servico: { descricao: "SEMPRE PLAY 600MB" },
			servico_status: { descricao: "Ativo" },
		},
	}, "run-1");
	assert.equal(normalized.hubsoft_order_id, 123);
	assert.equal(normalized.order_type_id, 4);
	assert.equal(normalized.health_monitoring_mode, "FULL");
	assert.equal(normalized.hubsoft_technician_id, 99);
	assert.equal(normalized.hubsoft_technician_name, "Tecnico Teste");
	assert.equal(normalized.technician_assignment_status, "ASSIGNED");
	assert.equal(normalized.closure_reason_name, "CONCLUÍDA");
	assert.equal(normalized.activation_closure_status, "CONCLUIDA");
	assert.equal(normalized.activation_city_name, "Betim");
	assert.equal(normalized.cliente_servico_snapshot.brand, "SEMPRE");
	assert.equal(normalized.cliente_servico_snapshot.speed_mbps_derived, 600);
	assert.ok(normalized.source_hash);
});

test("normalizeActivationOrder trata FILA como sem tecnico definido", () => {
	const normalized = normalizeActivationOrder({
		id_ordem_servico: 124,
		numero_ordem_servico: "OS-124",
		id_tipo_ordem_servico: 4,
		status: "pendente",
		tecnicos: [{ nome: "FILA" }],
	});
	assert.equal(normalized.hubsoft_technician_id, null);
	assert.equal(normalized.hubsoft_technician_name, "");
	assert.equal(normalized.technician_assignment_status, "UNASSIGNED");
});
