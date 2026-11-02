import { describe, expect, it } from "vitest";
import {
	buildPresentationPlan,
	nextPresentationIndex,
	phaseDurationMs,
	PRESENTATION_PHASES,
} from "./adminMapPresentation";

describe("adminMapPresentation", () => {
	it("monta o ciclo com regional, cidade, técnico, rota e retorno", () => {
		const plan = buildPresentationPlan({
			settings: { rankingLimit: 3, showDailyRoute: true, rotateRegionals: true },
			regionals: [{ name: "Metropolitana", openOrders: 30, locatedTechnicians: 1 }],
			cities: [{ regional: "Metropolitana", city: "Betim", latitude: -19.9, longitude: -44.2 }],
			rankings: {
				daily: [{ userId: "tech-1", status: "active", latitude: -19.9, longitude: -44.2, completedToday: 8, positionsToday: 12 }],
			},
			alerts: [{ type: "SIGNAL_LOSS" }],
		});
		expect(plan.map((step) => step.phase)).toEqual([
			PRESENTATION_PHASES.OVERVIEW_MG,
			PRESENTATION_PHASES.REGIONAL_FOCUS,
			PRESENTATION_PHASES.CITY_FOCUS,
			PRESENTATION_PHASES.TOP_TECHNICIAN,
			PRESENTATION_PHASES.TECHNICIAN_ROUTE,
			PRESENTATION_PHASES.OPERATION_ALERT,
			PRESENTATION_PHASES.RETURN_OVERVIEW,
		]);
	});

	it("não inventa rota quando não existe histórico suficiente", () => {
		const plan = buildPresentationPlan({
			settings: { rankingLimit: 1, showDailyRoute: true },
			rankings: {
				daily: [{ userId: "tech-1", status: "active", latitude: -19.9, longitude: -44.2, completedToday: 3, positionsToday: 1 }],
			},
		});
		expect(plan.some((step) => step.phase === PRESENTATION_PHASES.TECHNICIAN_ROUTE)).toBe(false);
	});

	it("respeita duração mínima e reinicia o ciclo", () => {
		expect(phaseDurationMs({ phase: PRESENTATION_PHASES.CITY_FOCUS }, { citySeconds: 2 })).toBe(5000);
		expect(nextPresentationIndex(4, 5)).toBe(0);
		expect(nextPresentationIndex(1, 5)).toBe(2);
	});
});
