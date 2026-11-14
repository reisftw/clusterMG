import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../services/vpsApiClient", () => ({
	requestVpsApi: vi.fn(),
}));

import { requestVpsApi } from "../../../services/vpsApiClient";
import { mapsService } from "./mapsService";

describe("mapsService", () => {
	beforeEach(() => vi.clearAllMocks());

	it("propaga o cancelamento para o calculo de navegacao", async () => {
		requestVpsApi.mockResolvedValue({});
		const controller = new AbortController();

		await mapsService.navigation(
			"os-1",
			{ latitude: -19.9, longitude: -44.1 },
			controller.signal,
		);

		expect(requestVpsApi).toHaveBeenCalledWith(
			"/maps/orders/os-1/navigation?latitude=-19.9&longitude=-44.1",
			{ signal: controller.signal },
		);
	});
});
