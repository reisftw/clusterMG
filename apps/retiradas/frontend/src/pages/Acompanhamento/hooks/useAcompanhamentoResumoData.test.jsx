import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../services/realtimeEvents", () => ({
	subscribeRealtimeTopics: vi.fn(() => () => {}),
}));
vi.mock("../../../services/vpsApiClient", () => ({
	getApiBaseUrl: vi.fn(() => "/api"),
}));
vi.mock("../../../utils/logger", () => ({
	logger: { error: vi.fn() },
}));

import { useAcompanhamentoResumoData } from "./useAcompanhamentoResumoData";

describe("useAcompanhamentoResumoData", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		window.localStorage.clear();
	});

	it("faz somente uma requisicao ao montar sem atualizacao solicitada", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => ({ generatedAt: "2026-11-03T12:00:00.000Z" }),
		}));
		vi.stubGlobal("fetch", fetchMock);

		const { result } = renderHook(() => useAcompanhamentoResumoData());
		await waitFor(() => expect(result.current.loading).toBe(false));
		await new Promise((resolve) => window.setTimeout(resolve, 850));

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
