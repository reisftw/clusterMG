const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const dbPath = require.resolve("./db");
const dualWritePath = require.resolve("./normalizedDualWrite");
const storedRow = {
	id: "fila-existente",
	telefone: "(31) 99999-0000",
	telefone_digits: "31999990000",
	os: "014326000000000001",
	status: "novo",
	template_id: null,
	created_at: new Date("2026-10-25T10:00:00.000Z"),
	updated_at: new Date("2026-10-25T10:00:00.000Z"),
	source_payload: { id: "id-antigo" },
};

let duplicateLookups = 0;
let duplicateRows = [];
let upsertCalls = [];
let failFirstUpsert = false;

require.cache[dbPath] = {
	id: dbPath,
	filename: dbPath,
	loaded: true,
	exports: {
		query: async (sql) => {
			if (String(sql).includes("telefone_digits = $1")) {
				duplicateLookups += 1;
				return { rows: duplicateRows };
			}
			return { rows: [storedRow] };
		},
	},
};

require.cache[dualWritePath] = {
	id: dualWritePath,
	filename: dualWritePath,
	loaded: true,
	exports: {
		upsert: async (record) => {
			upsertCalls.push(record);
			if (failFirstUpsert && upsertCalls.length === 1) {
				const error = new Error("duplicate queue item");
				error.code = "23505";
				error.constraint = "mensageria_fila_open_dedup_idx";
				throw error;
			}
		},
	},
};

const repository = require("./mensageriaRepository");

beforeEach(() => {
	duplicateLookups = 0;
	duplicateRows = [];
	upsertCalls = [];
	failFirstUpsert = false;
});

const payload = {
	telefone: "(31) 99999-0000",
	os: "014326000000000001",
	status: "novo",
	templateId: "cancelamento",
	cliente: "Cliente atualizado",
};

test("enqueue reutiliza a entrada ativa existente", async () => {
	duplicateRows = [storedRow];

	const result = await repository.enqueueMessage(payload, { id: "fila-nova" });

	assert.equal(duplicateLookups, 1);
	assert.equal(upsertCalls.length, 1);
	assert.equal(upsertCalls[0].documentId, storedRow.id);
	assert.equal(upsertCalls[0].data.id, storedRow.id);
	assert.equal(result.id, storedRow.id);
});

test("enqueue recupera corrida concorrente no indice de deduplicacao", async () => {
	failFirstUpsert = true;
	duplicateRows = [];

	const originalQuery = require("./db").query;
	require("./db").query = async (sql) => {
		if (String(sql).includes("telefone_digits = $1")) {
			duplicateLookups += 1;
			return { rows: duplicateLookups === 1 ? [] : [storedRow] };
		}
		return { rows: [storedRow] };
	};

	try {
		const result = await repository.enqueueMessage(payload, { id: "fila-concorrente" });

		assert.equal(duplicateLookups, 2);
		assert.equal(upsertCalls.length, 2);
		assert.equal(upsertCalls[1].documentId, storedRow.id);
		assert.equal(result.id, storedRow.id);
	} finally {
		require("./db").query = originalQuery;
	}
});
