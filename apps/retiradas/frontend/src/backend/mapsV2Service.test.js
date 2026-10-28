import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));
process.env.PGHOST ||= "127.0.0.1";
process.env.PGUSER ||= "test";
process.env.PGPASSWORD ||= "test";
process.env.PGDATABASE ||= "test";
process.env.MAPS_PRIVACY_SECRET = "maps-v2-test-secret";

const service = require(path.join(process.cwd(), "apps/retiradas/backend/api/src/mapsV2/mapsV2Service.js"));
const { __testables } = service;

function baseRow(overrides = {}) {
	return {
		id: "order-1",
		num_os: "014326001",
		nome_cliente: "MARIA APARECIDA DA SILVA",
		tipo: "RETIRADA FTTH",
		status: "PENDENTE",
		tecnico: "FILA",
		cidade: "Betim",
		bairro: "Sao Jorge",
		endereco: "Rua A, 10",
		endereco_resumo: "Rua A, 10 - Sao Jorge",
		latitude: -19.967,
		longitude: -44.198,
		open_request_id: null,
		...overrides,
	};
}

describe("Retiradas Maps 2.0 service", () => {
	it("calcula distancia geografica sem depender do HubSoft", () => {
		expect(__testables.haversineMeters(
			{ latitude: -19.9167, longitude: -43.9345 },
			{ latitude: -19.9167, longitude: -43.9345 },
		)).toBe(0);
		expect(__testables.haversineMeters(
			{ latitude: -19.9167, longitude: -43.9345 },
			{ latitude: -19.925, longitude: -43.935 },
		)).toBeGreaterThan(800);
	});

	it("anonimiza oportunidade no backend e nunca devolve PII ou coordenada exata", () => {
		const row = baseRow();
		const user = { role: "tecnico", permissions: [service.MAPS_PERMISSIONS.OPPORTUNITIES] };
		const point = __testables.mapPoint(row, user);
		expect(point.category).toBe("opportunity");
		expect(point.coordinatesApproximate).toBe(true);
		expect(point.latitude).not.toBe(row.latitude);
		expect(point).not.toHaveProperty("clientName");
		expect(point).not.toHaveProperty("address");
		expect(JSON.stringify(point)).not.toContain("MARIA APARECIDA");
		expect(JSON.stringify(point)).not.toContain("Rua A");
	});

	it("mantem aproximacao deterministica para evitar deslocamento visual a cada consulta", () => {
		const first = __testables.deterministicApproximation("order-1", -19.967, -44.198);
		const second = __testables.deterministicApproximation("order-1", -19.967, -44.198);
		expect(first).toEqual(second);
		expect(__testables.haversineMeters(first, { latitude: -19.967, longitude: -44.198 })).toBeGreaterThanOrEqual(150);
	});

	it("exibe coordenada e dados operacionais somente para ordem atribuida", () => {
		const row = baseRow({ tecnico: "JOAO TECNICO" });
		const point = __testables.mapPoint(row, {
			role: "tecnico",
			profile: { metasTecnicoNome: "JOAO TECNICO" },
		});
		expect(point).toMatchObject({
			category: "assigned",
			coordinatesApproximate: false,
			clientName: "MARIA SILVA",
			address: "Rua A, 10 - Sao Jorge",
		});
		expect(point.latitude).toBe(row.latitude);
	});

	it("aceita somente tipos de retirada e bloqueia ordens encerradas", () => {
		expect(__testables.validateOrderRow(baseRow({ tipo: "CANCELAMENTO LOJA" }))).toBe(true);
		expect(__testables.validateOrderRow(baseRow({ tipo: "INSTALACAO FTTH" }))).toBe(false);
		expect(__testables.validateOrderRow(baseRow({ status: "FINALIZADA" }))).toBe(false);
	});

	it("filtra no PostgreSQL somente OS proprias ou oportunidades livres antes do limite", () => {
		const params = [];
		const filters = __testables.sourceFilters({
			params,
			query: {},
			user: { role: "tecnico", profile: { metasTecnicoNome: "JOAO TÉCNICO" } },
		});
		expect(filters.clauses.join(" ")).toContain("request.id is null");
		expect(params[1]).toContain("JOAO TÉCNICO");
		expect(params[2]).toContain("FILA");
	});

	it("otimiza roteiro pelo vizinho mais proximo de forma explicavel", () => {
		const result = __testables.optimizeNearestNeighbor([
			{ order_id: "far", latitude: -19.95, longitude: -43.95 },
			{ order_id: "near", latitude: -19.917, longitude: -43.935 },
		], { latitude: -19.9167, longitude: -43.9345 });
		expect(result.map((item) => item.order_id)).toEqual(["near", "far"]);
	});

	it("mantem todos os endpoints do contrato protegidos no router", () => {
		const source = fs.readFileSync(
			path.join(process.cwd(), "apps/retiradas/backend/api/src/mapsV2/routes/mapsV2Routes.js"),
			"utf8",
		);
		expect(source).toContain("router.use(requireAuthenticated, requireAccess)");
		for (const endpoint of ["/points", "/nearby", "/summary", "/radar/evaluate", "/requests", "/routes", "/health"]) {
			expect(source).toContain(`"${endpoint}"`);
		}
	});
});
