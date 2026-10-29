import { describe, expect, it } from "vitest";
import {
	getCancellationPerformance,
	getCancellationPercent,
	getConfiguredGoalPercent,
	getDeliveredCancellationPercent,
	getGoalPercent,
} from "./metasMetrics";

describe("metasMetrics", () => {
	it("calcula atingimento sobre a meta recalculada", () => {
		expect(getGoalPercent({ totalOS: 1150, meta: 1495 })).toBeCloseTo(76.92);
	});

	it("mantem percentual da base apenas como metrica auxiliar", () => {
		expect(getCancellationPercent({ totalOS: 54, cancelamentos: 100 })).toBe(
			54,
		);
	});

	it("mantem o alias legado apontando para cancelamentos", () => {
		expect(
			getDeliveredCancellationPercent({ totalOS: 60, totalCancelamentos: 120 }),
		).toBe(50);
	});

	it("usa fallback textual quando nao ha divisor", () => {
		expect(getGoalPercent({ percentAchieved: "60,2%" })).toBe(60.2);
		expect(getCancellationPercent({ percentCancelamentos: "41,6%" })).toBe(
			41.6,
		);
	});

	it("retorna zero para entradas invalidas", () => {
		expect(getGoalPercent(null)).toBe(0);
		expect(getGoalPercent({ percentAchieved: "abc" })).toBe(0);
		expect(getCancellationPercent({ percentCancelamentos: "abc" })).toBe(0);
	});

	it("usa a meta configurada no cadastrador como alvo da taxa real", () => {
		expect(getConfiguredGoalPercent({ metaSazonal: 65, meta: 999 })).toBe(65);
		expect(getConfiguredGoalPercent({ meta: 650, cancelamentos: 1000 })).toBe(65);
	});

	it("compara entregas com cancelamentos sem transformar a meta em 100%", () => {
		const performance = getCancellationPerformance({
				totalOS: 2615,
				cancelamentos: 5000,
				meta: 3250,
				metaSazonal: 65,
			});
		expect(performance).toMatchObject({
			targetPercent: 65,
			targetOS: 3250,
			missingOS: 635,
			achieved: false,
		});
		expect(performance.deliveredPercent).toBeCloseTo(52.3);
		expect(performance.missingPercentagePoints).toBeCloseTo(12.7);
	});
});
