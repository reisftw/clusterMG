import { describe, expect, it } from "vitest";
import { getDeliveredCancellationPercent } from "./metasMetrics";

describe("getDeliveredCancellationPercent", () => {
	it("calcula entregas sobre cancelamentos quando ha cancelamentos", () => {
		expect(
			getDeliveredCancellationPercent({ totalOS: 54, cancelamentos: 100 }),
		).toBe(54);
	});

	it("usa totalCancelamentos como fallback", () => {
		expect(
			getDeliveredCancellationPercent({ totalOS: 60, totalCancelamentos: 120 }),
		).toBe(50);
	});

	it("usa percentAchieved quando nao ha cancelamentos", () => {
		expect(getDeliveredCancellationPercent({ percentAchieved: "60,2%" })).toBe(
			60.2,
		);
	});

	it("retorna zero para entrada invalida", () => {
		expect(getDeliveredCancellationPercent(null)).toBe(0);
		expect(getDeliveredCancellationPercent({ percentAchieved: "abc" })).toBe(0);
	});
});
