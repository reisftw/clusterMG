import { describe, expect, it } from "vitest";
import { buildGoogleMapsRouteLinks } from "./routeNavigation";

function routeWithStops(total) {
	return {
		items: Array.from({ length: total }, (_, index) => ({
			sequence: index + 1,
			latitude: -19.9 - (index * 0.001),
			longitude: -44.1 - (index * 0.001),
		})),
	};
}

describe("navegacao de roteiros no Google Maps", () => {
	it("gera uma navegacao unica para ate quatro paradas", () => {
		const links = buildGoogleMapsRouteLinks(routeWithStops(4), { latitude: -19.8, longitude: -44 });
		expect(links).toHaveLength(1);
		expect(links[0].url).toContain("https://www.google.com/maps/dir/");
		expect(links[0].url).toContain("origin=-19.8%2C-44");
		expect(links[0].url).toContain("waypoints=");
	});

	it("segmenta roteiros longos para respeitar o limite do Google Maps mobile", () => {
		const links = buildGoogleMapsRouteLinks(routeWithStops(9));
		expect(links).toHaveLength(3);
		expect(links.map(({ start, end }) => [start, end])).toEqual([[1, 4], [5, 8], [9, 9]]);
		expect(links[1].url).toContain("origin=");
	});

	it("ignora paradas sem coordenadas validas", () => {
		const links = buildGoogleMapsRouteLinks({
			items: [
				{ sequence: 1, latitude: null, longitude: null },
				{ sequence: 2, latitude: -19.9, longitude: -44.1 },
			],
		});
		expect(links).toHaveLength(1);
		expect(links[0].end).toBe(1);
	});
});
