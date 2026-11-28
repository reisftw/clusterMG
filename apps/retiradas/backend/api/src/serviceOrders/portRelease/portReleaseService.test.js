const assert = require("node:assert/strict");
const test = require("node:test");

const { parseCodes, stats, __testables } = require("./portReleaseService");
const db = require("../../db");
const hubsoft = require("../../hubsoftSyncProfiles");

test("parseCodes preserva zeros, separadores e remove duplicados", () => {
	assert.deepEqual(parseCodes("00123, 456;00123\n789"), { valid: ["00123", "456", "789"], invalid: [], duplicates: 1 });
});

test("parseCodes separa inválidos sem bloquear válidos", () => {
	assert.deepEqual(parseCodes("123 ABC 456-7"), { valid: ["123"], invalid: ["ABC", "456-7"], duplicates: 0 });
});

test("parseCodes aplica limite configurável", () => {
	assert.throws(() => parseCodes("1 2 3", 2), /limite configurado/);
});

test("normaliza status do contrato HubSoft", () => {
	assert.equal(__testables.normalizeStatus({ descricao: "Aguardando Agendamento" }), "aguardando_agendamento");
});

test("evidência mantém apenas campos necessários para auditoria", () => {
	const result = __testables.evidence({ id_ordem_servico: 7, numero_ordem_servico: "OS-99", codigo_cliente: "001", id_tipo_ordem_servico: 12, tipo_ordem_servico: { id_tipo_ordem_servico: 12, descricao: "Retirada" }, status: "pendente", token: "não deve sair" });
	assert.deepEqual(result, { serviceOrderId: "7", serviceOrderNumber: "99", clientCode: "001", typeId: 12, typeName: "Retirada", status: "pendente", technicians: [], startTime: "", endTime: "", duration: "", scheduled: false });
});

const config = { source_types: [{ id: 12, name: "Retirada" }], target_type: { id: 99, name: "Liberação de Portas" }, open_statuses: ["pendente", "aguardando_agendamento"] };

test("classifica uma O.S aberta de origem configurada como elegível", () => {
	assert.equal(__testables.classifyOrder({ id_tipo_ordem_servico: 12, status: "pendente" }, config), "ELIGIBLE");
});

test("não classifica O.S finalizada como elegível", () => {
	assert.equal(__testables.classifyOrder({ id_tipo_ordem_servico: 12, status: "finalizada" }, config), "REVIEW_REQUIRED");
});

test("reconhece O.S que já possui a classificação de destino", () => {
	assert.equal(__testables.classifyOrder({ id_tipo_ordem_servico: 99, status: "pendente" }, config), "ALREADY_CLASSIFIED");
});

test("exige análise quando a empresa não tem configuração", () => {
	assert.equal(__testables.classifyOrder({ id_tipo_ordem_servico: 12, status: "pendente" }, null), "REVIEW_REQUIRED");
});

test("mudança de tipo preserva os demais dados da O.S", () => {
	const original = { id_ordem_servico: 1, id_tipo_ordem_servico: 12, tipo_ordem_servico: { id_tipo_ordem_servico: 12 }, tecnico: { id: 7 }, agenda: { id: 8 }, observacao: "Manter", status: "pendente" };
	const target = { id_tipo_ordem_servico: 99, descricao: "Liberação de Portas" };
	const changed = __testables.applyTargetType(original, target);
	assert.equal(changed.id_tipo_ordem_servico, 99);
	assert.deepEqual(changed.tipo_ordem_servico, target);
	assert.deepEqual(changed.tecnico, original.tecnico);
	assert.deepEqual(changed.agenda, original.agenda);
	assert.equal(changed.observacao, "Manter");
	assert.equal(changed.status, "pendente");
	assert.equal(original.id_tipo_ordem_servico, 12);
});

test("normalização operacional define FILA, horários, duração e remove agenda", () => {
	const queueTechnician = { id: 694, name: "FILA" };
	const changed = __testables.applyOperationalTarget(
		{ id_ordem_servico: 1, tecnicos: [{ id: 7 }], agendamento_ordem_servico: { id_agendamento_ordem_servico: 8 } },
		{ id_tipo_ordem_servico: 99, descricao: "Liberação de Portas" },
		queueTechnician,
		"2026-11-26",
	);
	assert.deepEqual(changed.tecnicos, [queueTechnician]);
	assert.equal(changed.status, "aguardando_agendamento");
	assert.equal(changed.hora_inicio_programado, "00:00:00");
	assert.equal(changed.hora_termino_programado, "00:01:00");
	assert.equal(changed.duracao, "00:59:00");
	assert.equal(changed.agendamento_ordem_servico, null);
	assert.deepEqual(changed.disponibilidade.map((item) => item.id_periodo_dia), [4, 5]);
	assert.equal(changed.disponibilidade_str, "Manhã, Tarde");
});

test("normalização operacional preserva disponibilidade já informada", () => {
	const availability = [{ id_periodo_dia: 6, descricao: "Noite" }];
	const changed = __testables.applyOperationalTarget(
		{ disponibilidade: availability }, { id: 99 }, { id: 7 }, "2026-11-26",
	);
	assert.deepEqual(changed.disponibilidade, availability);
});

test("período automático aceita o mês atual e limita a 367 dias", () => {
	assert.deepEqual(__testables.parseScanRange({ startDate: "2026-11-01", endDate: "2026-11-26" }), { startDate: "2026-11-01", endDate: "2026-11-26" });
	assert.throws(() => __testables.parseScanRange({ startDate: "2025-01-01", endDate: "2026-11-26" }), /máximo/);
});

test("seleciona somente o tipo ENTREGA DE EQUIPAMENTO EM LOJA", () => {
	const metadata = { tipos_atendimento: [
		{ id_tipo_atendimento: 1, descricao: "SUPORTE" },
		{ id_tipo_atendimento: 826, descricao: " ENTREGA DE EQUIPAMENTO EM LOJA" },
	] };
	assert.equal(__testables.findStoreDeliveryAttendanceType(metadata).id_tipo_atendimento, 826);
	assert.equal(__testables.isResolvedStoreDeliveryAttendance({ id_tipo_atendimento: 826, status: { prefixo: "resolvido" } }, 826), true);
	assert.equal(__testables.isResolvedStoreDeliveryAttendance({ id_tipo_atendimento: 1, status: { prefixo: "resolvido" } }, 826), false);
	assert.equal(__testables.isResolvedStoreDeliveryAttendance({ id_tipo_atendimento: 826, status: { prefixo: "pendente" } }, 826), false);
});

test("cruza cliente por código ou ID mesmo em estruturas alternativas do HubSoft", () => {
	assert.deepEqual(__testables.customerKeys({ cliente_servico: { codigo_cliente: "00508", id_cliente: 77 } }), ["code:00508", "id:77"]);
	assert.deepEqual(__testables.customerKeys({ cliente_servico: { cliente: { codigo_cliente: 508, id_cliente: 77 } } }), ["code:508", "id:77"]);
});

test("consulta o período completo do dia no fuso de São Paulo", () => {
	assert.equal(__testables.hubsoftDayRange("2026-11-27T00:00:00.000Z"), "2026-11-27T00:00:00.000-03:00");
	assert.equal(__testables.hubsoftDayRange(new Date("2026-11-27T00:00:00.000Z")), "2026-11-27T00:00:00.000-03:00");
	assert.equal(__testables.hubsoftDayRange("2026-11-27T00:00:00.000Z", true), "2026-11-27T23:59:59.999-03:00");
});

test("aceita qualquer O.S de retirada aberta, não só IDs previamente configurados", () => {
	const order = { tipo_ordem_servico: { id_tipo_ordem_servico: 777, descricao: "RETIRADA ESPECIAL" }, status: "pendente" };
	assert.equal(__testables.isWithdrawalType(order), true);
	assert.equal(__testables.isWithdrawalType({ id_tipo_ordem_servico: 777, descricao: "RETIRADA ESPECIAL" }), true);
	assert.equal(__testables.classifyOrder(order, config), "ELIGIBLE");
});

async function operationResult(orderResponses, configOverride = config) {
	const originalQuery = db.query;
	const originalRequest = hubsoft.automationRequest;
	const updates = [];
	let call = 0;
	db.query = async (sql, params = []) => { updates.push({ sql, params }); return { rows: [] }; };
	hubsoft.automationRequest = async (_session, _path, options = {}) => {
		if (options.method === "PUT") {
			const response = orderResponses[call++];
			if (response instanceof Error) throw response;
			return response || {};
		}
		const response = orderResponses[call++];
		if (response instanceof Error) throw response;
		return { ordem_servico: response };
	};
	try {
		await __testables.processOperation({ id: "op-1", client_code: "001", service_order_id: "7", target_type_id: 99 }, {}, [{ company_key: "DEFAULT", ...configOverride }], { tipos_ordem_servico: [{ id_tipo_ordem_servico: 99, descricao: "Liberação de Portas" }], tecnicos: [{ id: 694, name: "FILA" }] });
		return updates.at(-1)?.params?.[1];
	} finally {
		db.query = originalQuery;
		hubsoft.automationRequest = originalRequest;
	}
}

const openOrder = { id_ordem_servico: 7, codigo_cliente: "001", id_tipo_ordem_servico: 12, tipo_ordem_servico: { id_tipo_ordem_servico: 12, descricao: "Retirada" }, status: "pendente" };
const changedOrder = { ...openOrder, id_tipo_ordem_servico: 99, tipo_ordem_servico: { id_tipo_ordem_servico: 99, descricao: "Liberação de Portas" }, status: "aguardando_agendamento", tecnicos: [{ id: 694, name: "FILA" }], hora_inicio_programado: "00:00:00", hora_termino_programado: "00:01:00", duracao: "00:59:00", agendamento_ordem_servico: null };

test("confirma sucesso somente após nova leitura do HubSoft", async () => { assert.equal(await operationResult([openOrder, {}, changedOrder]), "SUCCESS"); });
test("resposta PUT sem confirmação é registrada como erro", async () => { assert.equal(await operationResult([openOrder, {}, openOrder]), "ERROR"); });
test("timeout seguido de confirmação não repete a alteração", async () => { assert.equal(await operationResult([openOrder, new Error("timeout"), changedOrder]), "SUCCESS"); });
test("timeout sem leitura de confirmação fica indeterminado", async () => { assert.equal(await operationResult([openOrder, new Error("timeout"), new Error("timeout")]), "INDETERMINATE"); });
test("mudança de status entre pesquisa e execução ignora a ordem", async () => { assert.equal(await operationResult([{ ...openOrder, status: "finalizada" }]), "SKIPPED"); });

test("estatísticas retornam zeros e tipos sem falhar quando não há operações", async () => {
	const originalQuery = db.query;
	const queries = [];
	db.query = async (sql, params = []) => {
		queries.push({ sql, params });
		if (queries.length === 1) return { rows: [{ total: 0, clients: 0, today: 0, month: 0, failures: 0 }] };
		return { rows: [] };
	};
	try {
		assert.deepEqual(await stats({ company: "3" }), { total: 0, clients: 0, today: 0, month: 0, failures: 0, topSourceTypes: [] });
		assert.match(queries[0].sql, /o\.status='SUCCESS'/);
		assert.match(queries[0].sql, /::int "month"/);
		assert.match(queries[1].sql, /o\.source_type_name/);
		assert.deepEqual(queries[0].params, ["3"]);
	} finally { db.query = originalQuery; }
});

test("interpreta a paginacao retornada pelo HubSoft", () => {
	assert.deepEqual(
		__testables.paginationOf({ ordens_servico: { current_page: 1, last_page: 3, per_page: 1000, total: 2500 } }, new Array(1000)),
		{ currentPage: 1, lastPage: 3 },
	);
});
