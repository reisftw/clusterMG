import { describe, expect, it } from "vitest";
import { technicianPreviewContent } from "./technicianPreview";

describe("technicianPreviewContent", () => {
	it("renders the technician identity and operational summary without interaction", () => {
		const preview = technicianPreviewContent({
			displayName: "Joseval Alves",
			technicianName: "JOSEVAL CAMPOS - TECNICO RETIRADA",
			regional: "Metropolitana",
			status: "active",
			completedToday: 8,
			openOrders: 21,
			routeStops: 5,
			accuracyMeters: 12.4,
		});

		expect(preview.classList.contains("is-active")).toBe(true);
		expect(preview.textContent).toContain("Joseval Alves");
		expect(preview.textContent).toContain("Ao vivo");
		expect(preview.textContent).toContain("Metropolitana");
		expect(preview.textContent).toContain("8hoje");
		expect(preview.textContent).toContain("21abertas");
		expect(preview.textContent).toContain("5na rota");
		expect(preview.textContent).toContain("GPS 12 m");
	});
});
