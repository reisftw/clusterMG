import { describe, expect, it } from "vitest";
import {
	buildCostCenterMovementsByMonth,
	getSelectedCostCenterMovementMonth,
} from "./costCenterMovements";

describe("costCenterMovements", () => {
	it("groups imported movements by month and preserves related account/company/branch data", () => {
		const groups = buildCostCenterMovementsByMonth({
			realizedByCompanyBranch: [
				{
					year: 2026,
					month: 8,
					accountId: "1211",
					companyId: "1",
					branchId: "2",
					movements: [
						{ id: "mov-1", supplier: "CEMIG", value: 100 },
						{ id: "mov-2", supplier: "CEMIG", realizado: 25.5 },
					],
				},
				{
					year: 2026,
					month: 7,
					accountId: "1211",
					companyId: "1",
					branchId: "2",
					realized: 50,
					suppliers: ["Fornecedor fallback"],
				},
			],
		});

		expect(groups).toHaveLength(2);
		expect(groups[0]).toMatchObject({
			key: "2026-08",
			label: "2026 - Agosto",
			total: 125.5,
		});
		expect(groups[0].rows[0]).toMatchObject({
			id: "mov-1",
			accountId: "1211",
			companyId: "1",
			branchId: "2",
			value: 100,
		});
		expect(groups[1]).toMatchObject({
			key: "2026-07",
			label: "2026 - Julho",
			total: 50,
		});
		expect(groups[1].rows[0]).toMatchObject({
			supplier: "Fornecedor fallback",
			value: 50,
		});
	});

	it("returns the selected month or the first available group", () => {
		const groups = [
			{ key: "2026-08", label: "2026 - Agosto" },
			{ key: "2026-07", label: "2026 - Julho" },
		];

		expect(getSelectedCostCenterMovementMonth(groups, "2026-07")).toBe(
			groups[1],
		);
		expect(getSelectedCostCenterMovementMonth(groups, "2026-01")).toBe(
			groups[0],
		);
	});
});
