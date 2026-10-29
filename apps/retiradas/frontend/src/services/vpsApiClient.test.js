import { describe, expect, it } from "vitest";
import { usesSameOriginApi } from "./vpsApiClient";

describe("usesSameOriginApi", () => {
	it("usa a API da propria VM no dominio corporativo", () => {
		expect(usesSameOriginApi("retiradas.sempre.net.br")).toBe(true);
	});

	it("preserva o fluxo do dominio publico de producao", () => {
		expect(usesSameOriginApi("retiradas.tech")).toBe(false);
	});

	it("mantem homologacao como mesma origem", () => {
		expect(usesSameOriginApi("homolog.retiradas.tech")).toBe(true);
	});
});
