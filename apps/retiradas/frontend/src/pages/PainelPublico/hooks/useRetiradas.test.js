import { renderHook } from "@testing-library/react";
import { useRetiradas } from "./useRetiradas";

const retiradasMocks = vi.hoisted(() => ({
	useDashboardData: vi.fn(),
}));

vi.mock("./useDashboardData", () => ({
	useDashboardData: retiradasMocks.useDashboardData,
}));

describe("useRetiradas", () => {
	it("expoe o calendario publicado junto com os dados do painel", () => {
		retiradasMocks.useDashboardData.mockReturnValue({
			data: {
				painel: {
					retiradas: {
						result: {},
						feriados: ["01-01", "07-16"],
					},
				},
			},
			loading: false,
			error: null,
		});

		const { result } = renderHook(() => useRetiradas());

		expect(result.current.feriadosSet).toEqual(new Set(["01-01", "07-16"]));
	});

	it("mantem o fallback para snapshots antigos sem calendario", () => {
		retiradasMocks.useDashboardData.mockReturnValue({
			data: { painel: { retiradas: { result: {} } } },
			loading: false,
			error: null,
		});

		const { result } = renderHook(() => useRetiradas());

		expect(result.current.feriadosSet).toBeNull();
	});

	it("mantem o fallback quando o calendario publicado esta vazio", () => {
		retiradasMocks.useDashboardData.mockReturnValue({
			data: {
				painel: { retiradas: { result: {}, feriados: [] } },
			},
			loading: false,
			error: null,
		});

		const { result } = renderHook(() => useRetiradas());

		expect(result.current.feriadosSet).toBeNull();
	});
});
