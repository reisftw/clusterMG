import { PassThrough } from "node:stream";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(
	path.join(process.cwd(), "apps/retiradas/backend/package.json"),
);
const apiDir = path.join(process.cwd(), "apps/retiradas/backend/api/src");

function requireBackend(relativePath) {
	const resolved = require.resolve(path.join(apiDir, relativePath));
	delete require.cache[resolved];
	return require(resolved);
}

describe("Google OAuth state", () => {
	afterEach(() => vi.restoreAllMocks());

	it("aceita somente o state vinculado ao cookie e limpa o cookie", () => {
		const oauthState = requireBackend(
			"documentos/security/googleOAuthState.js",
		);
		const headers = new Map();
		const res = { setHeader: (name, value) => headers.set(name, value) };
		const state = oauthState.createState(res);
		const setCookie = headers.get("Set-Cookie");
		const cookie = setCookie.split(";")[0];
		const req = { get: (name) => (name === "cookie" ? cookie : "") };

		expect(oauthState.consumeState(req, res, state)).toBe(true);
		expect(headers.get("Set-Cookie")).toContain("Max-Age=0");
	});

	it("rejeita state divergente", () => {
		const oauthState = requireBackend(
			"documentos/security/googleOAuthState.js",
		);
		const res = { setHeader: vi.fn() };
		const req = {
			get: () => `${oauthState.COOKIE_NAME}=estado-esperado`,
		};
		expect(oauthState.consumeState(req, res, "estado-invasor")).toBe(false);
	});
});

describe("Mercado auth attempt tracker", () => {
	it("expira chaves e limita a cardinalidade total", () => {
		let timestamp = 1_000;
		const { createAttemptTracker } = requireBackend("security/attemptTracker.js");
		const tracker = createAttemptTracker({
			ttlMs: 1_000,
			maxEntries: 100,
			now: () => timestamp,
		});

		for (let index = 0; index < 150; index += 1) {
			tracker.increment(`ip:usuario-${index}@teste.local`);
		}
		expect(tracker.size()).toBe(100);
		timestamp += 1_001;
		expect(tracker.get("ip:usuario-149@teste.local")).toBe(0);
	});
});

describe("Documentos bounded memory upload", () => {
	function loadStorageFactory() {
		const controllerPath = require.resolve(
			path.join(apiDir, "documentos/controllers/documentosController.js"),
		);
		const routePath = require.resolve(
			path.join(apiDir, "documentos/routes/documentosRoutes.js"),
		);
		delete require.cache[routePath];
		require.cache[controllerPath] = {
			id: controllerPath,
			filename: controllerPath,
			loaded: true,
			exports: {},
		};
		return require(routePath).createBoundedMemoryStorage;
	}

	it("mantem arquivo dentro do limite agregado", async () => {
		const createStorage = loadStorageFactory();
		const storage = createStorage(10);
		const stream = new PassThrough();
		const resultPromise = new Promise((resolve, reject) => {
			storage._handleFile(
				{},
				{ fieldname: "files", stream },
				(error, result) => (error ? reject(error) : resolve(result)),
			);
		});
		stream.end(Buffer.from("1234567890"));
		const result = await resultPromise;
		expect(result.size).toBe(10);
		expect(result.buffer.toString()).toBe("1234567890");
	});

	it("interrompe o conjunto ao ultrapassar o limite agregado", async () => {
		const createStorage = loadStorageFactory();
		const storage = createStorage(10);
		const stream = new PassThrough();
		const resultPromise = new Promise((resolve) => {
			storage._handleFile(
				{},
				{ fieldname: "files", stream },
				(error) => resolve(error),
			);
		});
		stream.end(Buffer.from("12345678901"));
		const error = await resultPromise;
		expect(error?.code).toBe("LIMIT_TOTAL_FILE_SIZE");
	});
});

describe("VPN forwarded IP trust", () => {
	it("ignora cabecalhos de IP em conexao direta", () => {
		process.env.PGHOST ||= "127.0.0.1";
		process.env.PGUSER ||= "test";
		process.env.PGPASSWORD ||= "test";
		process.env.PGDATABASE ||= "test";
		const { getClientIp } = requireBackend("vpnAccess.js");
		expect(
			getClientIp({
				headers: { "x-real-ip": "10.0.0.10" },
				socket: { remoteAddress: "198.51.100.50" },
			}),
		).toBe("198.51.100.50");
	});

	it("aceita IP encaminhado somente do proxy loopback", () => {
		process.env.PGHOST ||= "127.0.0.1";
		process.env.PGUSER ||= "test";
		process.env.PGPASSWORD ||= "test";
		process.env.PGDATABASE ||= "test";
		const { getClientIp } = requireBackend("vpnAccess.js");
		expect(
			getClientIp({
				headers: { "x-real-ip": "10.159.245.131" },
				socket: { remoteAddress: "127.0.0.1" },
			}),
		).toBe("10.159.245.131");
	});
});
