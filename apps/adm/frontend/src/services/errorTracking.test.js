import { describe, expect, it } from "vitest";
import { sanitizeSentryEvent } from "./errorTracking";

describe("errorTracking", () => {
	it("remove tokens, senhas e PII antes de enviar eventos", () => {
		const event = sanitizeSentryEvent({
			user: {
				email: "pessoa@example.com",
				role: "admin",
			},
			request: {
				headers: {
					Authorization: "Bearer token-real",
					"X-CSRF-Token": "csrf-real",
				},
				cookies: "retiradas_session=token",
			},
			extra: {
				password: "senha-real",
				nested: {
					telefone: "+55 31 99999-0000",
					payload: {
						ok: true,
					},
				},
			},
		});

		expect(event.user).toMatchObject({ role: "admin" });
		expect(event.user.email).toBeUndefined();
		expect(event.request.headers.Authorization).toBe("[Filtered]");
		expect(event.request.headers["X-CSRF-Token"]).toBe("[Filtered]");
		expect(event.request.cookies).toBe("[Filtered]");
		expect(event.extra.password).toBe("[Filtered]");
		expect(event.extra.nested.telefone).toBe("[Filtered]");
		expect(event.extra.nested.payload.ok).toBe(true);
	});
});
