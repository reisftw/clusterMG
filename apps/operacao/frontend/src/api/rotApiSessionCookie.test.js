import assert from "node:assert/strict";
import test from "node:test";

// Este arquivo roda sob Node puro (node:test), sem jsdom — o frontend da
// Operacao nao tem vitest/jsdom como devDependency ainda (fora do escopo
// desta etapa adicionar dependencia nova). rotApi.js so usa window pra
// localStorage/dispatchEvent, entao um stub minimo é suficiente.
function makeWindowStub() {
	const store = new Map();
	return {
		localStorage: {
			getItem: (key) => (store.has(key) ? store.get(key) : null),
			setItem: (key, value) => store.set(key, String(value)),
			removeItem: (key) => store.delete(key),
			clear: () => store.clear(),
		},
		dispatchEvent: () => {},
	};
}

function jsonResponse(body, init = {}) {
	return new Response(JSON.stringify(body), {
		status: init.status || 200,
		headers: { "Content-Type": "application/json" },
	});
}

async function withStubbedGlobals(run) {
	const originalWindow = globalThis.window;
	const originalFetch = globalThis.fetch;
	globalThis.window = makeWindowStub();
	const fetchCalls = [];
	let nextResponse = null;
	globalThis.fetch = async (...args) => {
		fetchCalls.push(args);
		return nextResponse;
	};
	try {
		await run({
			setNextResponse: (response) => {
				nextResponse = response;
			},
			fetchCalls,
		});
	} finally {
		globalThis.window = originalWindow;
		globalThis.fetch = originalFetch;
	}
}

test("uses the HttpOnly session cookie instead of Authorization headers", async () => {
	const { requestRotApi } = await import("./rotApi.js");
	await withStubbedGlobals(async ({ setNextResponse, fetchCalls }) => {
		setNextResponse(jsonResponse({ ok: true, value: 1 }));

		await requestRotApi("/auth/me");

		assert.equal(fetchCalls.length, 1);
		const [url, options] = fetchCalls[0];
		assert.equal(url, "/api/auth/me");
		assert.equal(options.credentials, "include");
		assert.equal("Authorization" in (options.headers || {}), false);
	});
});

test("does not persist returned login tokens in localStorage", async () => {
	const { loginRot, setRotToken } = await import("./rotApi.js");
	await withStubbedGlobals(async ({ setNextResponse, fetchCalls }) => {
		setRotToken("legacy-token");
		setNextResponse(
			jsonResponse({
				ok: true,
				token: "server-token-should-not-be-stored",
				user: { id: "user-1", name: "Tecnico" },
			}),
		);

		const result = await loginRot("tecnico", "senha");

		assert.deepEqual(result.user, { id: "user-1", name: "Tecnico" });
		assert.equal(globalThis.window.localStorage.getItem("rot-auth-token"), null);
		assert.equal(fetchCalls.length, 1);
		const [url, options] = fetchCalls[0];
		assert.equal(url, "/api/auth/login");
		assert.equal(options.credentials, "include");
		assert.equal("Authorization" in (options.headers || {}), false);
	});
});
