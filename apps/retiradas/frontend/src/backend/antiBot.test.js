import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));
const antiBot = require("./api/src/antiBot.js");

const originalEnv = { ...process.env };

afterEach(() => {
	process.env = { ...originalEnv };
	vi.unstubAllGlobals();
});

describe("antiBot Turnstile validation", () => {
	it("skips validation when Turnstile secret is not configured", async () => {
		delete process.env.TURNSTILE_SECRET_KEY;

		await expect(antiBot.verifyTurnstileToken("", {})).resolves.toMatchObject({
			ok: true,
			skipped: true,
		});
	});

	it("rejects requests without token when Turnstile is enabled", async () => {
		process.env.TURNSTILE_SECRET_KEY = "secret-key";

		await expect(antiBot.verifyTurnstileToken("", {})).resolves.toMatchObject({
			ok: false,
			statusCode: 400,
			error: "Verificacao anti-bot obrigatoria.",
		});
	});

	it("accepts a token confirmed by Cloudflare", async () => {
		process.env.TURNSTILE_SECRET_KEY = "secret-key";
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ success: true }),
			})),
		);

		await expect(
			antiBot.verifyTurnstileToken("valid-token", {}),
		).resolves.toMatchObject({
			ok: true,
		});
	});

	it("rejects a token denied by Cloudflare", async () => {
		process.env.TURNSTILE_SECRET_KEY = "secret-key";
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ success: false }),
			})),
		);

		await expect(
			antiBot.verifyTurnstileToken("invalid-token", {}),
		).resolves.toMatchObject({
			ok: false,
			statusCode: 400,
			error: "Verificacao anti-bot invalida.",
		});
	});
});
