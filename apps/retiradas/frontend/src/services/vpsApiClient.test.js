import { afterEach, describe, expect, it, vi } from "vitest";
import {
	listPublicVpsDocuments,
	usesSameOriginApi,
} from "./vpsApiClient";

afterEach(() => {
	vi.unstubAllGlobals();
});

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

describe("documentos operacionais legados", () => {
	it("usa a rota autenticada em vez da rota publica", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ items: [] }),
		});
		vi.stubGlobal("fetch", fetchMock);

		await listPublicVpsDocuments("ordens_abertas", { limit: 10, offset: 0 });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toContain(
			"/api/documents?collection=ordens_abertas&limit=10&offset=0",
		);
		expect(fetchMock.mock.calls[0][0]).not.toContain("/public/documents");
	});
});
