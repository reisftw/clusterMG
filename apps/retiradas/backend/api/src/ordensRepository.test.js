const { test } = require("node:test");
const assert = require("node:assert/strict");

const dbPath = require.resolve("./db");
const queries = [];
let released = false;
const client = {
	query: async (sql, params = []) => {
		queries.push({ sql, params });
		return { rows: [], rowCount: String(sql).startsWith("delete") ? 2 : 0 };
	},
	release: () => {
		released = true;
	},
};
require.cache[dbPath] = {
	id: dbPath,
	filename: dbPath,
	loaded: true,
	exports: {
		connect: async () => client,
		query: async () => ({ rows: [] }),
	},
};

const repository = require("./ordensRepository");

test("sincroniza somente alteracoes e remove ausentes em uma transacao", async () => {
	queries.length = 0;
	released = false;
	const changed = {
		onnet_2: {
			num_os: "2",
			fonte: "onnet",
			tipo: "RETIRADA FTTH",
			status: "Pendente",
		},
	};
	const active = {
		1: {
			num_os: "1",
			fonte: "sempre",
			tipo: "RETIRADA FTTH",
			status: "Pendente",
		},
		...changed,
	};

	const result = await repository.replaceOrderDocumentsByCollectionAndSources(
		"ordens_abertas",
		changed,
		active,
		["sempre", "onnet"],
	);

	assert.deepEqual(result, { deleted: 2, upserted: 1 });
	assert.equal(queries[0].sql, "begin");
	assert.match(queries[1].sql, /insert into ordens_servico/);
	assert.match(queries[1].sql, /on conflict \(id\) do update/);
	assert.equal(queries[1].params[19], null);
	assert.equal(queries[1].params[20], null);
	assert.match(queries[2].sql, /delete from ordens_servico/);
	assert.deepEqual(queries[2].params[4], [
		"ordens_abertas:sempre:1",
		"ordens_abertas:onnet:2",
	]);
	assert.equal(queries[3].sql, "commit");
	assert.equal(released, true);
});

test("nao regrava ordens quando o snapshot permanece igual", async () => {
	queries.length = 0;
	released = false;
	const active = {
		1: {
			num_os: "1",
			fonte: "sempre",
			tipo: "RETIRADA FTTH",
			status: "Pendente",
		},
	};

	const result = await repository.replaceOrderDocumentsByCollectionAndSources(
		"ordens_abertas",
		{},
		active,
		["sempre"],
	);

	assert.deepEqual(result, { deleted: 2, upserted: 0 });
	assert.deepEqual(queries.map(({ sql }) => sql), [
		"begin",
		queries[1].sql,
		"commit",
	]);
	assert.match(queries[1].sql, /delete from ordens_servico/);
	assert.doesNotMatch(queries[1].sql, /insert into ordens_servico/);
	assert.deepEqual(queries[1].params[4], ["ordens_abertas:sempre:1"]);
	assert.equal(released, true);
});
