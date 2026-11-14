const assert = require("node:assert/strict");
const test = require("node:test");
process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:5432/test";
const db = require("./db");
const {
	createProcessor,
	dedupeKey,
	requeueFailed,
	_test: { markFailed },
} = require("./evolutionWebhookQueue");

test("Evolution dedupe uses provider message id", () => {
	const first = dedupeKey({ instance: "retiradas", data: { key: { id: "wamid-1" } } }, "messages.upsert");
	const duplicate = dedupeKey({ instance: "retiradas", data: { key: { id: "wamid-1" }, extra: true } }, "messages.upsert");
	const other = dedupeKey({ instance: "retiradas", data: { key: { id: "wamid-2" } } }, "messages.upsert");
	assert.equal(first, duplicate);
	assert.notEqual(first, other);
});

function processorFixture({ confirmation, callback } = {}) {
	const events = [
		{ id: 1, attempts: 1, event_name: "messages.upsert", payload: { id: "message-1" } },
	];
	const processed = [];
	const failed = [];
	const processor = createProcessor({
		agendamentoConfirmacao: {
			registerIncomingResponse:
				confirmation || (async () => ({ confirmed: true })),
		},
		evolutionMessaging: {
			registerCallback: callback || (async () => ({ ok: true })),
		},
		queueStore: {
			claimNext: async () => events.shift() || null,
			markProcessed: async (id) => processed.push(id),
			markFailed: async (event, error) => failed.push({ event, error }),
		},
	});
	return { failed, processed, processor };
}

test("ACK definitivo ocorre somente depois da confirmacao bem-sucedida", async () => {
	const fixture = processorFixture();
	await fixture.processor.runBatch();
	assert.deepEqual(fixture.processed, [1]);
	assert.deepEqual(fixture.failed, []);
});

test("falha na confirmacao mantem evento recuperavel para retry", async () => {
	const fixture = processorFixture({
		confirmation: async () => {
			throw new Error("confirmacao indisponivel");
		},
	});
	await fixture.processor.runBatch();
	assert.deepEqual(fixture.processed, []);
	assert.equal(fixture.failed.length, 1);
	assert.match(fixture.failed[0].error.message, /indisponivel/);
});

test("falha no callback nao confirma o processamento", async () => {
	const fixture = processorFixture({
		confirmation: async () => ({ confirmed: false }),
		callback: async () => {
			throw new Error("callback indisponivel");
		},
	});
	await fixture.processor.runBatch();
	assert.deepEqual(fixture.processed, []);
	assert.equal(fixture.failed.length, 1);
});

test("retentativas usam backoff e terminam na DLQ apos o limite", async (t) => {
	const originalQuery = db.query;
	const calls = [];
	db.query = async (sql, params) => {
		calls.push({ sql, params });
		return { rowCount: 1, rows: [{ id: 1 }] };
	};
	t.after(() => {
		db.query = originalQuery;
	});

	await markFailed({ id: 1, attempts: 2 }, new Error("temporario"));
	await markFailed({ id: 2, attempts: 8 }, new Error("definitivo"));

	assert.equal(calls[0].params[1], "PENDING");
	assert.equal(calls[0].params[2], "10");
	assert.equal(calls[1].params[1], "FAILED");
	assert.equal(calls[1].params[2], "300");
});

test("evento na DLQ pode ser recolocado na fila explicitamente", async (t) => {
	const originalQuery = db.query;
	let query;
	db.query = async (sql, params) => {
		query = { sql, params };
		return { rowCount: 1, rows: [{ id: params[0] }] };
	};
	t.after(() => {
		db.query = originalQuery;
	});

	assert.equal(await requeueFailed(42), true);
	assert.match(query.sql, /status = 'PENDING'/);
	assert.match(query.sql, /status = 'FAILED'/);
	assert.deepEqual(query.params, [42]);
});
