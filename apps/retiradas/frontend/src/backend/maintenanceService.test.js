import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));

process.env.PGHOST ||= "127.0.0.1";
process.env.PGUSER ||= "test";
process.env.PGPASSWORD ||= "test";
process.env.PGDATABASE ||= "test";

const maintenance = require(
	path.join(process.cwd(), "apps/retiradas/backend/api/src/maintenanceService.js"),
);

describe("Manutencao global", () => {
	it("normaliza a palavra obrigatoria sem depender de acento", () => {
		expect(maintenance.normalizeConfirmation(" manutenção ")).toBe("MANUTENCAO");
	});

	it("limita a pausa automatica a sete dias", () => {
		expect(maintenance.normalizeDuration("90")).toBe(90);
		expect(() => maintenance.normalizeDuration(0)).toThrow(/entre 1 e/);
		expect(() => maintenance.normalizeDuration(20_000)).toThrow(/entre 1 e/);
	});

	it("bloqueia redirecionamento circular para o proprio site", () => {
		expect(() =>
			maintenance.normalizeRedirectUrl("https://retiradas.tech/nova", true),
		).toThrow(/proprio site/);
		expect(
			maintenance.normalizeRedirectUrl("https://retiradas.sempre.net.br", true),
		).toBe("https://retiradas.sempre.net.br/");
	});

	it("mantem somente autenticacao, manutencao e health fora do bloqueio", () => {
		expect(maintenance.isExemptPath("/api/maintenance/status")).toBe(true);
		expect(maintenance.isExemptPath("/api/auth/login")).toBe(true);
		expect(maintenance.isExemptPath("/api/health")).toBe(true);
		expect(maintenance.isExemptPath("/api/documents")).toBe(false);
	});

	it("libera a aplicacao se a leitura do estado de manutencao falhar", async () => {
		const originalQuery = require(
			path.join(process.cwd(), "apps/retiradas/backend/api/src/db.js"),
		).query;
		const database = require(
			path.join(process.cwd(), "apps/retiradas/backend/api/src/db.js"),
		);
		database.query = async () => {
			throw new Error("banco indisponivel");
		};
		const next = vi.fn();
		try {
			await maintenance.maintenanceMiddleware(
				{ path: "/api/documents" },
				{},
				next,
			);
			expect(next).toHaveBeenCalledOnce();
		} finally {
			database.query = originalQuery;
		}
	});
});
