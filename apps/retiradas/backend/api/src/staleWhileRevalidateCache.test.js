const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readStaleWhileRevalidate } = require("./staleWhileRevalidateCache");

test("returns stale data immediately and consolidates the background refresh", async () => {
	const cache = { data: { value: "old" }, cachedAt: 1, pending: null };
	let resolveRefresh;
	let calls = 0;
	const load = () => {
		calls += 1;
		return new Promise((resolve) => { resolveRefresh = resolve; });
	};

	const first = await readStaleWhileRevalidate(cache, load, 10);
	const concurrent = await readStaleWhileRevalidate(cache, load, 10);

	assert.equal(first.cacheStatus, "STALE_REFRESH");
	assert.equal(concurrent.cacheStatus, "STALE_JOIN");
	assert.deepEqual(first.data, { value: "old" });
	assert.equal(calls, 1);

	resolveRefresh({ value: "new" });
	await cache.pending;
	assert.deepEqual(cache.data, { value: "new" });
});

test("awaits one shared refresh on a cold cache", async () => {
	const cache = { data: null, cachedAt: 0, pending: null };
	let calls = 0;
	const load = async () => {
		calls += 1;
		return { value: "loaded" };
	};

	const [first, concurrent] = await Promise.all([
		readStaleWhileRevalidate(cache, load, 1000),
		readStaleWhileRevalidate(cache, load, 1000),
	]);

	assert.equal(calls, 1);
	assert.deepEqual(first.data, { value: "loaded" });
	assert.deepEqual(concurrent.data, { value: "loaded" });
});

test("can restore blocking refresh through configuration", async () => {
	const cache = { data: { value: "old" }, cachedAt: 1, pending: null };
	const result = await readStaleWhileRevalidate(
		cache,
		async () => ({ value: "new" }),
		10,
		{ backgroundRefresh: false },
	);

	assert.equal(result.cacheStatus, "REFRESH");
	assert.deepEqual(result.data, { value: "new" });
});

test("keeps the last complete snapshot when a background refresh fails", async () => {
	const original = { value: "valid" };
	const cache = { data: original, cachedAt: 1, pending: null };
	const result = await readStaleWhileRevalidate(
		cache,
		async () => { throw new Error("database unavailable"); },
		10,
	);

	assert.equal(result.cacheStatus, "STALE_REFRESH");
	assert.equal(result.data, original);
	await assert.rejects(cache.pending, /database unavailable/);
	assert.equal(cache.data, original);
});
