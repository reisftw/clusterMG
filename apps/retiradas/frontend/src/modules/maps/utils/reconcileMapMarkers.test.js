import { performance } from "node:perf_hooks";
import { describe, expect, it, vi } from "vitest";
import { reconcileMapMarkers } from "./reconcileMapMarkers";

function point(id, overrides = {}) {
	return {
		id: String(id),
		latitude: -19 + id / 1_000_000,
		longitude: -44,
		category: "opportunity",
		clientName: `Cliente ${id}`,
		clientCode: String(id),
		orderNumber: String(id),
		technician: "",
		assignedToCurrentUser: false,
		...overrides,
	};
}

describe("reconcileMapMarkers", () => {
	it("preserves unchanged markers and only applies the incremental delta", () => {
		const markersById = new Map();
		const cluster = { addLayers: vi.fn(), removeLayers: vi.fn() };
		const createMarker = vi.fn((item) => ({ id: item.id }));
		const updateMarker = vi.fn();
		const initial = [point(1), point(2), point(3)];

		reconcileMapMarkers({ points: initial, markersById, cluster, createMarker, updateMarker });
		const preservedMarker = markersById.get("1").marker;
		cluster.addLayers.mockClear();

		const result = reconcileMapMarkers({
			points: [initial[0], point(2, { technician: "Maria" }), point(4)],
			markersById,
			cluster,
			createMarker,
			updateMarker,
		});

		expect(result).toEqual({ added: 1, updated: 1, removed: 1 });
		expect(markersById.get("1").marker).toBe(preservedMarker);
		expect(updateMarker).toHaveBeenCalledTimes(1);
		expect(cluster.removeLayers).toHaveBeenLastCalledWith([{ id: "3" }]);
		expect(cluster.addLayers).toHaveBeenCalledWith([{ id: "4" }]);
	});

	it("benchmarks a one-point refresh without rebuilding 15000 markers", () => {
		const markersById = new Map();
		const cluster = { addLayers: vi.fn(), removeLayers: vi.fn() };
		const createMarker = (item) => ({ id: item.id });
		const updateMarker = vi.fn();
		const points = Array.from({ length: 15_000 }, (_, index) => point(index + 1));
		reconcileMapMarkers({ points, markersById, cluster, createMarker, updateMarker });
		cluster.addLayers.mockClear();

		const changed = points.slice();
		changed[7_499] = { ...changed[7_499], technician: "Tecnico atualizado" };
		const startedAt = performance.now();
		const result = reconcileMapMarkers({ points: changed, markersById, cluster, createMarker, updateMarker });
		const elapsedMs = performance.now() - startedAt;

		expect(result).toEqual({ added: 0, updated: 1, removed: 0 });
		expect(updateMarker).toHaveBeenCalledTimes(1);
		expect(cluster.addLayers).not.toHaveBeenCalled();
		expect(cluster.removeLayers).not.toHaveBeenCalled();
		expect(elapsedMs).toBeLessThan(1_000);
	});

	it("reindexes only a marker whose coordinates changed", () => {
		const marker = { id: "1" };
		const original = point(1);
		const markersById = new Map([["1", { marker, point: original, fingerprint: [Number(original.latitude), Number(original.longitude), original.category, original.clientName, original.clientCode, original.orderNumber, original.technician, false].join("|") }]]);
		const cluster = { addLayers: vi.fn(), removeLayers: vi.fn() };

		const result = reconcileMapMarkers({
			points: [point(1, { latitude: -20 })],
			markersById,
			cluster,
			createMarker: vi.fn(),
			updateMarker: vi.fn(),
		});

		expect(result).toEqual({ added: 0, updated: 1, removed: 0 });
		expect(cluster.removeLayers).toHaveBeenCalledWith([marker]);
		expect(cluster.addLayers).toHaveBeenCalledWith([marker]);
	});
});
