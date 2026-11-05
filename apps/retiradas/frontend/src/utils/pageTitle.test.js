import { describe, expect, it } from "vitest";
import { DEFAULT_TITLE, resolvePageTitle } from "./pageTitle";

describe("resolvePageTitle", () => {
	it("usa os títulos principais da marca REVO", () => {
		expect(resolvePageTitle("/")).toBe("Visão Geral | REVO");
		expect(resolvePageTitle("/maps")).toBe("Maps | REVO");
		expect(resolvePageTitle("/tentativas")).toBe("Gestão de Tentativas | REVO");
	});

	it("preserva a identidade independente do Mercado", () => {
		expect(resolvePageTitle("/mercado/lotes/123")).toBe("Mercado de Retiradas");
	});

	it("usa a identidade principal para rotas desconhecidas", () => {
		expect(resolvePageTitle("/rota-nova")).toBe(DEFAULT_TITLE);
	});
});
