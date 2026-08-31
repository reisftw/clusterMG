import { describe, expect, it } from "vitest";
import {
	buildDiarioBoardData,
	buildDiarioMonthlyGoalsSnapshot,
	compareDiarioMonthlyGoals,
	normalizeDiarioEntry,
} from "./diarioService";

describe("diarioService monthly goals history", () => {
	it("cria snapshot mensal com totais e semanas do diario", () => {
		const boardData = buildDiarioBoardData(
			[
				normalizeDiarioEntry({
					date: "2026-08-03",
					horarios: { "11h": 100, "14h": 50 },
					fines: 2,
				}),
				normalizeDiarioEntry({
					date: "2026-08-10",
					horarios: { "16h": 200, "23:59": 25 },
					fines: 1,
				}),
			],
			"2026-08-10",
		);

		const snapshot = buildDiarioMonthlyGoalsSnapshot(boardData, {
			savedBy: "u1",
			savedByName: "Admin",
		});

		expect(snapshot).toMatchObject({
			monthKey: "2026-08",
			totals: {
				monthDelivered: 375,
				monthFines: 3,
			},
			savedBy: "u1",
			savedByName: "Admin",
		});
		expect(snapshot.weeks).toHaveLength(4);
		expect(snapshot.weeks[0]).toMatchObject({ week: 1, delivered: 150 });
		expect(snapshot.weeks[1]).toMatchObject({ week: 2, delivered: 225 });
	});

	it("compara snapshot atual com mes historico salvo", () => {
		const current = {
			weeks: [
				{ week: 1, delivered: 120, fines: 1 },
				{ week: 2, delivered: 180, fines: 0 },
			],
			totals: { monthDelivered: 300, monthFines: 1 },
		};
		const previous = {
			weeks: [
				{ week: 1, delivered: 100, fines: 0 },
				{ week: 2, delivered: 150, fines: 2 },
			],
			totals: { monthDelivered: 250, monthFines: 2 },
		};

		expect(compareDiarioMonthlyGoals(current, previous)).toMatchObject({
			deliveredDiff: 50,
			finesDiff: -1,
			deliveredPercent: 20,
			weeks: [
				{ week: 1, deliveredDiff: 20, finesDiff: 1 },
				{ week: 2, deliveredDiff: 30, finesDiff: -2 },
				{ week: 3, deliveredDiff: 0, finesDiff: 0 },
				{ week: 4, deliveredDiff: 0, finesDiff: 0 },
			],
		});
	});
});
