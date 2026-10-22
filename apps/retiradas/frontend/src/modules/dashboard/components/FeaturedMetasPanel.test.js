import { describe, expect, it } from "vitest";
import { scopeMetaRecordToTechnician } from "../utils/technicianMetaScope";

describe("scopeMetaRecordToTechnician", () => {
	it("mantém somente a entrega do técnico e aplica a meta fixa mensal", () => {
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
		expect(scoped.meta).toBe(110);
		expect(scoped.percentAchieved).toBe(16.4);
		expect(scoped.metaModeLabel).toBe("Meta fixa");
		expect(scoped.metaSazonal).toBeNull();
		expect(scoped.technicians).toHaveLength(1);
		expect(scoped.saldoDiario[1]).toMatchObject({ dia: 2, totalDia: 3 });
	});

	it("não expõe totais coletivos quando o vínculo não existe", () => {
		const scoped = scopeMetaRecordToTechnician(
			{ totalOS: 100, meta: 120, technicians: [] },
			"Nome ausente",
		);
		expect(scoped.totalOS).toBe(0);
		expect(scoped.meta).toBe(110);
	});
});
