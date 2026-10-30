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

	it("mostra cada oportunidade como cliente com coordenada exata no mapa interno", () => {
		const row = baseRow();
		const user = { role: "tecnico", permissions: [service.MAPS_PERMISSIONS.OPPORTUNITIES] };
		const point = __testables.mapPoint(row, user);
		expect(point.category).toBe("opportunity");
		expect(point.coordinatesApproximate).toBe(false);
		expect(point.latitude).toBe(row.latitude);
		expect(point).toMatchObject({
			clientName: "MARIA SILVA",
			address: "Rua A, 10 - Sao Jorge",
			requestable: true,
		});
	});

	it("mantem oportunidades sem coordenada visiveis na lista sem inventar uma posicao", () => {
		const point = __testables.mapPoint(baseRow({ latitude: null, longitude: null }), {
			role: "tecnico",
			permissions: [service.MAPS_PERMISSIONS.OPPORTUNITIES],
		});
		expect(point).toMatchObject({
			category: "opportunity",
			locationAvailable: false,
			latitude: null,
			longitude: null,
			coordinatesApproximate: false,
		});
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

	it("marca como atribuida a solicitacao efetivada para o proprio tecnico", () => {
		const point = __testables.mapPoint(baseRow({
			open_request_id: "request-1",
			open_request_status: "EFFECTED",
			open_requester_user_id: "tech-1",
		}), {
			uid: "tech-1",
			role: "tecnico",
		});
		expect(point).toMatchObject({
			category: "assigned",
			assignedToCurrentUser: true,
			requestable: false,
		});
	});

	it("aceita somente tipos de retirada e bloqueia ordens encerradas", () => {
		expect(__testables.validateOrderRow(baseRow({ tipo: "CANCELAMENTO LOJA" }))).toBe(true);
		expect(__testables.validateOrderRow(baseRow({ tipo: "INSTALACAO FTTH" }))).toBe(false);
		expect(__testables.validateOrderRow(baseRow({ status: "FINALIZADA" }))).toBe(false);
	});

	it("carrega todas as retiradas da area para o tecnico sem filtrar pelo responsavel", () => {
		const params = [];
		const filters = __testables.sourceFilters({
			params,
			query: {},
			user: { role: "tecnico", profile: { metasTecnicoNome: "JOAO TÉCNICO" } },
		});
		expect(filters.clauses.join(" ")).not.toContain("request.id is null");
		expect(filters.clauses.join(" ")).not.toContain("o.regional");
		expect(params).toHaveLength(1);
		const point = __testables.mapPoint(baseRow({ tecnico: "OUTRO TECNICO" }), {
			role: "tecnico",
			profile: { metasTecnicoNome: "JOAO TECNICO" },
		});
		expect(point).toMatchObject({
			category: "opportunity",
			technician: "OUTRO TECNICO",
			requestable: false,
		});
	});

	it("permite que a gestao visualize todas as retiradas sem habilitar solicitacao indevida", () => {
		const params = [];
		const filters = __testables.sourceFilters({
			params,
			query: {},
			user: { role: "admin" },
		});
		expect(filters.clauses.join(" ")).not.toContain("request.id is null");
		expect(params).toHaveLength(1);
		const point = __testables.mapPoint(baseRow({ tecnico: "OUTRO TECNICO" }), { role: "admin" });
		expect(point).toMatchObject({
			category: "opportunity",
			clientName: "MARIA SILVA",
			requestable: false,
			assignedToCurrentUser: false,
		});
	});

	it("otimiza roteiro pelo vizinho mais proximo de forma explicavel", () => {
		const result = __testables.optimizeNearestNeighbor([
			{ order_id: "far", latitude: -19.95, longitude: -43.95 },
			{ order_id: "near", latitude: -19.917, longitude: -43.935 },
		], { latitude: -19.9167, longitude: -43.9345 });
		expect(result.map((item) => item.order_id)).toEqual(["near", "far"]);
	});

	it("descarta coordenadas invalidas antes de otimizar o roteiro", () => {
		const rows = __testables.normalizeRouteRows([
			{ order_id: "valid", latitude: "-19.917", longitude: "-43.935" },
			{ order_id: "missing", latitude: null, longitude: null },
			{ order_id: "outside", latitude: 80, longitude: 120 },
		]);
		expect(rows).toEqual([{ order_id: "valid", latitude: -19.917, longitude: -43.935 }]);
	});

	it("classifica a presenca do tecnico por recencia", () => {
		const now = new Date("2026-10-29T12:00:00.000Z").getTime();
		expect(__testables.technicianPresenceStatus("2026-10-29T11:59:00.000Z", now)).toBe("active");
		expect(__testables.technicianPresenceStatus("2026-10-29T11:54:00.000Z", now)).toBe("recent");
		expect(__testables.technicianPresenceStatus("2026-10-29T11:40:00.000Z", now)).toBe("stale");
	});

	it("mantem todos os endpoints do contrato protegidos no router", () => {
		const source = fs.readFileSync(
			path.join(process.cwd(), "apps/retiradas/backend/api/src/mapsV2/routes/mapsV2Routes.js"),
			"utf8",
		);
		expect(source).toContain("router.use(requireAuthenticated, requireAccess)");
		for (const endpoint of ["/points", "/nearby", "/summary", "/radar/evaluate", "/requests", "/routes", "/technicians/presence", "/admin/technicians/live", "/health"]) {
			expect(source).toContain(`"${endpoint}"`);
		}
	});

	it("mantem o mapa da equipe restrito ao RBAC administrativo", () => {
		const migration = fs.readFileSync(
			path.join(process.cwd(), "apps/retiradas/backend/sql/106_maps_live_technicians.sql"),
			"utf8",
		);
		expect(migration).toContain("create table if not exists maps_technician_presence");
		expect(migration).toContain("'retiradas.maps.v2.live_technicians'");
		expect(migration).toContain("select 'admin', 'retiradas.maps.v2.live_technicians'");
		expect(migration).not.toContain("select 'tecnico', 'retiradas.maps.v2.live_technicians'");
	});

	it("enfileira todo o backlog sem limitar a geocodificacao a cem ordens", () => {
		const source = fs.readFileSync(
			path.join(process.cwd(), "apps/retiradas/backend/api/src/mapsV2/mapsV2Service.js"),
			"utf8",
		);
		expect(source).toContain("const GEOCODE_QUEUE_BATCH_LIMIT = 25000");
		expect(source).toContain("queueMissingGeocodes(GEOCODE_QUEUE_BATCH_LIMIT)");
		expect(source).not.toContain("queueMissingGeocodes(100)");
		expect(source).toContain("unnest($1::text[], $2::text[])");
		expect(source).toContain("search_variants");
		expect(source).toContain("job.status = 'REFRESH'");
	});

	it("gera variacoes de endereco para localizar ordens sem coordenadas", () => {
		const variants = __testables.addressSearchVariants(baseRow({
			endereco: "Rua Petrolina",
			numero: "167",
			bairro: "Sao Jorge",
			cidade: "Betim",
		}));
		expect(variants[0]).toMatchObject({ accuracyLevel: "ADDRESS" });
		expect(variants[0].query).toContain("Rua Petrolina, 167, Sao Jorge, Betim");
		expect(variants.some((item) => item.accuracyLevel === "STREET")).toBe(true);
		expect(variants.some((item) => item.accuracyLevel === "NEIGHBORHOOD")).toBe(true);
	});

	it("notifica imediatamente a gestao quando uma retirada e solicitada", () => {
		const source = fs.readFileSync(
			path.join(process.cwd(), "apps/retiradas/backend/api/src/mapsV2/mapsV2Service.js"),
			"utf8",
		);
		expect(source).toContain('type: "maps_solicitacao"');
		expect(source).toContain('roles: ["admin", "backoffice", "backoffice_retirada"]');
		expect(source).toContain('targetPath: "/maps?panel=requests"');
	});
});
