const assert = require("node:assert/strict");
const test = require("node:test");

const { parseCodes, stats, __testables } = require("./portReleaseService");
const db = require("../../db");
const hubsoft = require("../../hubsoftSyncProfiles");

test("parseCodes preserva zeros, separadores e remove duplicados", () => {
	assert.deepEqual(parseCodes("00123, 456;00123\n789"), {
		valid: ["00123", "456", "789"], invalid: [], duplicates: 1,
	});
});

test("parseCodes separa inválidos sem bloquear válidos", () => {
	assert.deepEqual(parseCodes("123 ABC 456-7"), {
		valid: ["123"], invalid: ["ABC", "456-7"], duplicates: 0,
	});
});

test("parseCodes aplica limite configurável", () => {
	assert.throws(() => parseCodes("1 2 3", 2), /limite configurado/);
});

test("normaliza status do contrato HubSoft", () => {
	assert.equal(__testables.normalizeStatus({ descricao: "Aguardando Agendamento" }), "aguardando_agendamento");
});

test("evidência mantém apenas campos necessários para auditoria", () => {
	const result = __testables.evidence({
		id_ordem_servico: 7,
		numero_ordem_servico: "OS-99",
		codigo_cliente: "001",
		id_tipo_ordem_servico: 12,
		tipo_ordem_servico: { id_tipo_ordem_servico: 12, descricao: "Retirada" },
		status: "pendente",
		token: "não deve sair",
	});
	assert.deepEqual(result, {
		serviceOrderId: "7", serviceOrderNumber: "99", clientCode: "001",
		typeId: 12, typeName: "Retirada", status: "pendente",
	});
});

const config = {
	source_types: [{ id: 12, name: "Retirada" }],
	target_type: { id: 99, name: "Liberação de Portas" },
	open_statuses: ["pendente", "aguardando_agendamento"],
};

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
		await __testables.processOperation(
			{ id: "op-1", client_code: "001", service_order_id: "7", target_type_id: 99 }, {},
			[{ company_key: "DEFAULT", ...configOverride }],
			{ tipos_ordem_servico: [{ id_tipo_ordem_servico: 99, descricao: "Liberação de Portas" }] },
		);
		return updates.at(-1)?.params?.[1];
	} finally {
		db.query = originalQuery;
		hubsoft.automationRequest = originalRequest;
	}
}

const openOrder = { id_ordem_servico: 7, codigo_cliente: "001", id_tipo_ordem_servico: 12, tipo_ordem_servico: { id_tipo_ordem_servico: 12, descricao: "Retirada" }, status: "pendente" };
const changedOrder = { ...openOrder, id_tipo_ordem_servico: 99, tipo_ordem_servico: { id_tipo_ordem_servico: 99, descricao: "Liberação de Portas" } };

test("confirma sucesso somente após nova leitura do HubSoft", async () => {
	assert.equal(await operationResult([openOrder, {}, changedOrder]), "SUCCESS");
});

test("resposta PUT sem confirmação é registrada como erro", async () => {
	assert.equal(await operationResult([openOrder, {}, openOrder]), "ERROR");
});

test("timeout seguido de confirmação não repete a alteração", async () => {
	assert.equal(await operationResult([openOrder, new Error("timeout"), changedOrder]), "SUCCESS");
});

test("timeout sem leitura de confirmação fica indeterminado", async () => {
	assert.equal(await operationResult([openOrder, new Error("timeout"), new Error("timeout")]), "INDETERMINATE");
});

test("mudança de status entre pesquisa e execução ignora a ordem", async () => {
	assert.equal(await operationResult([{ ...openOrder, status: "finalizada" }]), "SKIPPED");
});

test("estatísticas retornam zeros e tipos sem falhar quando não há operações", async () => {
	const originalQuery = db.query;
	const queries = [];
	db.query = async (sql, params = []) => {
		queries.push({ sql, params });
		if (queries.length === 1) return { rows: [{ total: 0, clients: 0, today: 0, month: 0, failures: 0 }] };
		return { rows: [] };
	};
	try {
		assert.deepEqual(await stats({ company: "3" }), {
			total: 0, clients: 0, today: 0, month: 0, failures: 0, topSourceTypes: [],
		});
		assert.match(queries[0].sql, /o\.status='SUCCESS'/);
		assert.match(queries[1].sql, /o\.source_type_name/);
		assert.deepEqual(queries[0].params, ["3"]);
	} finally {
		db.query = originalQuery;
	}
});
