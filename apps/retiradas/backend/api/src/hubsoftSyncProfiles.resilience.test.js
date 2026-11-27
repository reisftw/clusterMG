const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";

const db = require("./db");
const { __testables } = require("./hubsoftSyncProfiles");

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test("classifica apenas falhas transitórias para retry e aplica backoff exponencial", () => {
	assert.equal(__testables.isTransientHubsoftStatus(429), true);
	assert.equal(__testables.isTransientHubsoftStatus(503), true);
	assert.equal(__testables.isTransientHubsoftStatus(400), false);
	assert.equal(
		__testables.isTransientHubsoftError({ cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }),
		true,
	);
	assert.equal(__testables.hubsoftRetryDelay(1, () => 0), 750);
	assert.equal(__testables.hubsoftRetryDelay(2, () => 0), 1_500);
});

test("limita chamadas HubSoft concorrentes no processo", async () => {
	const originalFetch = global.fetch;
	const pending = [];
	global.fetch = () => new Promise((resolve) => pending.push(resolve));
	try {
		const requests = Array.from({ length: 7 }, (_, index) =>
			__testables.fetchWithTimeout(`https://hubsoft.test/${index}`),
		);
		await nextTurn();
		assert.equal(pending.length, 6);

		pending[0]({ ok: true });
		await nextTurn();
		assert.equal(pending.length, 7);
		for (const resolve of pending.slice(1)) resolve({ ok: true });
		await Promise.all(requests);
	} finally {
		global.fetch = originalFetch;
	}
});

test("repete GET após resposta transitória e encerra no primeiro sucesso", async () => {
	const originalFetch = global.fetch;
	let attempts = 0;
	global.fetch = async () => {
		attempts += 1;
		return attempts === 1
			? { status: 503, body: { cancel: async () => {} } }
			: { status: 200 };
	};
	try {
		const response = await __testables.fetchHubsoft("https://hubsoft.test/read");
		assert.equal(response.status, 200);
		assert.equal(attempts, 2);
	} finally {
		global.fetch = originalFetch;
	}
});

test("lock usa ownership exclusivo e só é liberado pelo mesmo owner", async () => {
	const originalQuery = db.query;
	const calls = [];
	db.query = async (sql, params = []) => {
		calls.push({ sql, params });
		if (/insert into hubsoft_sync_locks/i.test(sql)) return { rows: [{ profile: params[0] }] };
		return { rows: [] };
	};
	try {
		const firstOwner = await __testables.acquireLock("MAPA", "run-1", { uid: "system" });
		const secondOwner = await __testables.acquireLock("MATCH", "run-2", { uid: "system" });
		assert.notEqual(firstOwner, secondOwner);
		assert.match(firstOwner, /\|system\|/);

		await __testables.releaseLock("MAPA", "run-1", firstOwner);
		const release = calls.find(({ sql }) => /delete from hubsoft_sync_locks[\s\S]*locked_by = \$3/i.test(sql));
		assert.deepEqual(release.params, ["MAPA", "run-1", firstOwner]);
	} finally {
		db.query = originalQuery;
	}
});

test("auditoria de metas só aplica datasets completos e persistidos", () => {
	assert.equal(
		__testables.canApplyMetaAuditDataset({ status: "COMPLETE" }, [{ id: "1" }]),
		true,
	);
	for (const status of ["SUSPICIOUS", "INCOMPLETE", "VALID_EMPTY_RESULT", "FAILED"]) {
		assert.equal(
			__testables.canApplyMetaAuditDataset({ status }, [{ id: "1" }]),
			false,
		);
	}
	assert.equal(
		__testables.canApplyMetaAuditDataset({ status: "COMPLETE" }, []),
		false,
	);
});
