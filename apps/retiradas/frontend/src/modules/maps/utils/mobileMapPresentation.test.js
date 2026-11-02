import { describe, expect, it } from "vitest";
import {
	buildMapSearchSuggestions,
	nextSheetPosition,
	readStoredMapView,
	sortMapPoints,
} from "./mobileMapPresentation";

describe("mobileMapPresentation", () => {
	it("cria sugestoes unicas para cidade, bairro, cliente e OS", () => {
		const items = [{
			id: "1",
			city: "Betim",
			neighborhood: "Icaivera",
			clientCode: "586377",
			clientName: "Fabiana Cruz",
			orderNumber: "014326271153213805",
		}];
		expect(buildMapSearchSuggestions(items, "bet")).toContainEqual(
			expect.objectContaining({ type: "city", label: "Betim" }),
		);
		expect(buildMapSearchSuggestions(items, "586")[0]).toEqual(expect.objectContaining({ type: "client", query: "586377" }));
		expect(buildMapSearchSuggestions(items, "014326")[0]).toEqual(expect.objectContaining({ type: "order" }));
	});

	it("ordena por prioridade e distancia sem alterar a lista original", () => {
		const items = [
			{ id: "far", distanceMeters: 900, priority: "normal" },
			{ id: "priority", distanceMeters: 400, priority: "high" },
			{ id: "near", distanceMeters: 20, priority: "normal" },
		];
		expect(sortMapPoints(items, "nearest").map((item) => item.id)).toEqual(["near", "priority", "far"]);
		expect(sortMapPoints(items, "priority").map((item) => item.id)).toEqual(["priority", "near", "far"]);
		expect(items[0].id).toBe("far");
	});

	it("limita as transicoes do painel aos tres estados", () => {
		expect(nextSheetPosition("collapsed", 1)).toBe("peek");
		expect(nextSheetPosition("peek", 1)).toBe("expanded");
		expect(nextSheetPosition("expanded", 1)).toBe("expanded");
		expect(nextSheetPosition("peek", -1)).toBe("collapsed");
	});

	it("ignora uma visualizacao salva invalida", () => {
		const storage = { getItem: () => "{}" };
		expect(readStoredMapView(storage)).toBeNull();
	});
});
