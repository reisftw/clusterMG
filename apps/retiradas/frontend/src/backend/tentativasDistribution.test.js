import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(
	path.join(process.cwd(), "apps/retiradas/backend/package.json"),
);
const servicePath = require.resolve("./api/src/tentativas/tentativasService.js");
const dbPath = require.resolve("./api/src/db.js");
const auditLogPath = require.resolve("./api/src/auditLog.js");
const hubsoftSyncProfilesPath = require.resolve(
	"./api/src/hubsoftSyncProfiles.js",
);

function loadService(query, connect) {
	require.cache[dbPath] = {
		id: dbPath,
		filename: dbPath,
		loaded: true,
		exports: { query, ...(connect ? { connect } : {}) },
	};
	require.cache[auditLogPath] = {
		id: auditLogPath,
		filename: auditLogPath,
		loaded: true,
		exports: { recordAuditLog: vi.fn() },
	};
	require.cache[hubsoftSyncProfilesPath] = {
		id: hubsoftSyncProfilesPath,
		filename: hubsoftSyncProfilesPath,
		loaded: true,
		exports: {},
	};
	delete require.cache[servicePath];
	return require("./api/src/tentativas/tentativasService.js");
}

afterEach(() => {
	delete require.cache[servicePath];
	delete require.cache[dbPath];
	delete require.cache[auditLogPath];
	delete require.cache[hubsoftSyncProfilesPath];
	vi.restoreAllMocks();
});

describe("tentativas - distribuicao por tecnico", () => {
	it("divide todas as oportunidades da cidade de forma equilibrada", () => {
		const service = loadService(vi.fn());
		const technicians = [
			{ user_id: "tec-1", user_email: "tec1@example.com", user_name: "Tecnico 1" },
			{ user_id: "tec-2", user_email: "tec2@example.com", user_name: "Tecnico 2" },
		];
		const candidates = Array.from({ length: 101 }, (_, index) => ({
			opportunity_id: `os-${index + 1}`,
			cidade: "Uberlandia",
		}));
		const plan = service.__testables.buildBalancedAssignmentPlan(candidates, technicians, []);
		const totals = plan.reduce((counts, item) => ({
			...counts,
			[item.user_id]: (counts[item.user_id] || 0) + 1,
		}), {});

		expect(plan).toHaveLength(101);
		expect(Math.abs(totals["tec-1"] - totals["tec-2"])).toBeLessThanOrEqual(1);
		expect(new Set(plan.map((item) => item.opportunity_id)).size).toBe(101);
		expect(plan[0]).toEqual(expect.objectContaining({
			opportunity_id: "os-1",
			user_id: expect.any(String),
		}));
		expect(plan[0]).not.toHaveProperty("opportunityId");
		expect(plan[0]).not.toHaveProperty("userId");
	});

	it("considera a carga existente antes de distribuir novas oportunidades", () => {
		const service = loadService(vi.fn());
		const technicians = [
			{ user_id: "tec-1", user_email: "tec1@example.com", user_name: "Tecnico 1" },
			{ user_id: "tec-2", user_email: "tec2@example.com", user_name: "Tecnico 2" },
		];
		const plan = service.__testables.buildBalancedAssignmentPlan(
			[{ opportunity_id: "os-1", cidade: "Betim" }, { opportunity_id: "os-2", cidade: "Betim" }],
			technicians,
			[{ technician_user_id: "tec-1", technician_email: "tec1@example.com", total: 3 }],
		);

		expect(plan.every((item) => item.user_id === "tec-2")).toBe(true);
	});

	it("inclui tecnicos vinculados a cidade mesmo antes da primeira atribuicao", async () => {
		const query = vi.fn(async () => ({
			rows: [
				{
					technician_user_id: "ednei-1",
					technician_name: "Ednei",
					cidade: "Patrocínio",
					opportunities: "0",
					worked: "0",
					pending: "0",
				},
			],
		}));
		const service = loadService(query);

		const result = await service.listDistribution();
		const sql = String(query.mock.calls[0][0]);

		expect(sql).toContain("from tentativas_technician_cities");
		expect(result.items).toEqual([
			expect.objectContaining({
				technician_user_id: "ednei-1",
				cidade: "Patrocínio",
				opportunities: 0,
				coverage: 0,
			}),
		]);
	});

	it("inclui tecnicos vinculados no ranking geral com indicadores zerados", async () => {
		const query = vi.fn(async () => ({
			rows: [
				{
					technician_id: "ednei-1",
					technician_name: "Ednei",
					opportunities: "0",
					worked: "0",
					attempts: "0",
					responded: "0",
					scheduled: "0",
					completed: "0",
				},
			],
		}));
		const service = loadService(query);

		const result = await service.getRanking();
		const sql = String(query.mock.calls[0][0]);

		expect(sql).toContain("from tentativas_technician_cities");
		expect(result.items).toEqual([
			expect.objectContaining({
				technician_id: "ednei-1",
				attempts: 0,
				coverage: 0,
			}),
		]);
	});
});
