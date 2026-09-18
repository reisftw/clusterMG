import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loginRot, requestRotApi, setRotToken } from "../../apps/rot/frontend/src/api/rotApi.js";

function jsonResponse(body, init = {}) {
	return new Response(JSON.stringify(body), {
		status: init.status || 200,
		headers: { "Content-Type": "application/json" },
	});
}

describe("rotApi session transport", () => {
	beforeEach(() => {
		window.localStorage.clear();
		global.fetch = vi.fn();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		window.localStorage.clear();
	});

	it("uses the HttpOnly session cookie instead of Authorization headers", async () => {
		global.fetch.mockResolvedValueOnce(jsonResponse({ ok: true, value: 1 }));

		await requestRotApi("/auth/me");

		expect(global.fetch).toHaveBeenCalledWith(
			"/api/auth/me",
			expect.objectContaining({
				credentials: "include",
				headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
			}),
		);
	});

	it("does not persist returned login tokens in localStorage", async () => {
		setRotToken("legacy-token");
		global.fetch.mockResolvedValueOnce(jsonResponse({
			ok: true,
			token: "server-token-should-not-be-stored",
			user: { id: "user-1", name: "Tecnico" },
		}));

		const result = await loginRot("tecnico", "senha");

		expect(result.user).toEqual({ id: "user-1", name: "Tecnico" });
		expect(window.localStorage.getItem("rot-auth-token")).toBeNull();
		expect(global.fetch).toHaveBeenCalledWith(
			"/api/auth/login",
			expect.objectContaining({
				credentials: "include",
				headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
			}),
		);
	});
});
