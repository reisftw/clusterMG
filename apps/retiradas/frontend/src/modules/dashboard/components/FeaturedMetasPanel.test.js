import { describe, expect, it } from "vitest";
import { scopeMetaRecordToTechnician } from "../utils/technicianMetaScope";

describe("scopeMetaRecordToTechnician", () => {
	it("mantém somente a entrega e a meta do técnico vinculado", () => {
		const scoped = scopeMetaRecordToTechnician(
			{
				mes: "Outubro",
				totalOS: 100,
				meta: 120,
				technicians: [
					{ name: "Técnico Um", total: 18, meta: 24, daily: [2, 3, 0, 4] },
					{ name: "Técnico Dois", total: 30, meta: 24, daily: [5, 5] },
				],
			},
			"tecnico um",
		);

		expect(scoped.totalOS).toBe(18);
		expect(scoped.meta).toBe(24);
		expect(scoped.percentAchieved).toBe(75);
		expect(scoped.technicians).toHaveLength(1);
		expect(scoped.saldoDiario[1]).toMatchObject({ dia: 2, totalDia: 3 });
	});

	it("não expõe totais coletivos quando o vínculo não existe", () => {
		const scoped = scopeMetaRecordToTechnician(
			{ totalOS: 100, meta: 120, technicians: [] },
			"Nome ausente",
		);
		expect(scoped.totalOS).toBe(0);
		expect(scoped.meta).toBe(0);
	});
});
