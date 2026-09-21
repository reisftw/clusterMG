import { describe, expect, it } from "vitest";
import {
	getCancellationPercent,
	getDeliveredCancellationPercent,
	getGoalPercent,
} from "./metasMetrics";

describe("metasMetrics", () => {
	it("calcula atingimento sobre a meta recalculada", () => {
		expect(getGoalPercent({ totalOS: 1150, meta: 1495 })).toBeCloseTo(76.92);
	});

	it("calcula entregas sobre cancelamentos em campo separado", () => {
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
});
