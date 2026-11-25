import { describe, expect, it } from "vitest";
import {
	buildHourlyEvolution,
	calculateChange,
} from "./hourlyDeliveryEvolution";

describe("hourlyDeliveryEvolution", () => {
	it("calcula diferença absoluta e percentual entre hoje e ontem", () => {
		const model = buildHourlyEvolution(
			"2026-11-25",
			[
				{ date: "2026-11-24", horarios: { "11h": 10, "14h": 20 } },
				{ date: "2026-11-25", horarios: { "11h": 15, "14h": 15 } },
			],
		);

		expect(model.hours[0]).toMatchObject({
			hour: "11h",
			current: 15,
			previous: 10,
			difference: 5,
			percentage: 50,
		});
		expect(model.todayTotal).toBe(30);
		expect(model.yesterdayTotal).toBe(30);
	});

	it("não inventa percentual quando o período anterior é zero", () => {
		expect(calculateChange(8, 0)).toEqual({ difference: 8, percentage: null });
	});

	it("compara semana e mês pela média dos dias disponíveis", () => {
		const model = buildHourlyEvolution(
			"2026-11-25",
			[
				{ date: "2026-10-20", horarios: { "11h": 5 } },
				{ date: "2026-10-21", horarios: { "11h": 15 } },
				{ date: "2026-11-18", horarios: { "11h": 10 } },
				{ date: "2026-11-19", horarios: { "11h": 20 } },
				{ date: "2026-11-24", horarios: { "11h": 20 } },
				{ date: "2026-11-25", horarios: { "11h": 30 } },
			],
		);

		expect(model.week.currentTotalAverage).toBeCloseTo(70 / 3);
		expect(model.week.previousTotalAverage).toBe(10);
		expect(model.month.currentTotalAverage).toBe(20);
		expect(model.month.previousTotalAverage).toBe(10);
	});
});
