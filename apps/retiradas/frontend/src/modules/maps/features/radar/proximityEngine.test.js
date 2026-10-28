import { describe, expect, it } from "vitest";
import { distanceMeters, shouldEvaluatePosition } from "./proximityEngine";

describe("proximityEngine", () => {
	it("ignora pequenas oscilacoes do GPS antes de 20 segundos", () => {
		const previous = { latitude: -19.9167, longitude: -43.9345, timestamp: 1_000 };
		const next = { latitude: -19.91671, longitude: -43.93451, timestamp: 5_000 };
		expect(distanceMeters(previous, next)).toBeLessThan(25);
		expect(shouldEvaluatePosition(previous, next)).toBe(false);
	});

	it("reavalia por distancia ou por tempo maximo", () => {
		const previous = { latitude: -19.9167, longitude: -43.9345, timestamp: 1_000 };
		expect(shouldEvaluatePosition(previous, { ...previous, latitude: -19.916, timestamp: 5_000 })).toBe(true);
		expect(shouldEvaluatePosition(previous, { ...previous, timestamp: 22_000 })).toBe(true);
	});
});
