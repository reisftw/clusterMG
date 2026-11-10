const { test } = require("node:test");
const assert = require("node:assert/strict");

const dbPath = require.resolve("../../db");
const hubsoftPath = require.resolve("../../hubsoftSyncProfiles");
const realtimePath = require.resolve("../../realtime");
const semprePath = require.resolve("../../sempreIntegration");

require.cache[dbPath] = {
	id: dbPath,
	filename: dbPath,
	loaded: true,
	exports: {},
};
require.cache[hubsoftPath] = {
	id: hubsoftPath,
	filename: hubsoftPath,
	loaded: true,
	exports: {},
};
require.cache[realtimePath] = {
	id: realtimePath,
	filename: realtimePath,
	loaded: true,
	exports: { broadcastRealtime() {} },
};
require.cache[semprePath] = {
	id: semprePath,
	filename: semprePath,
	loaded: true,
	exports: {},
};

const { __testables } = require("./serviceOrderRequestsService");

const metadata = {
	tipos_ordem_servico: [
		{ id_tipo_ordem_servico: 100, descricao: "RETIRADA FTTH" },
		{ id_tipo_ordem_servico: 1487, descricao: "CANCELAMENTO FTTH" },
	],
};

test("busca considera o tipo original e o tipo final da efetivacao", () => {
	const types = __testables.candidateOrderTypes(metadata, "RETIRADA FTTH");
	assert.deepEqual(
		types.map((item) => item.id_tipo_ordem_servico),
		[100, 1487],
	);
});

test("busca nao duplica o tipo quando a OS ja foi efetivada", () => {
	const types = __testables.candidateOrderTypes(metadata, "CANCELAMENTO FTTH");
	assert.deepEqual(
		types.map((item) => item.id_tipo_ordem_servico),
		[1487],
	);
});
