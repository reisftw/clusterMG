import { renderHook } from "@testing-library/react";
import { useRetiradas } from "./useRetiradas";

const retiradasMocks = vi.hoisted(() => ({
	useDashboardData: vi.fn(),
}));

vi.mock("./useDashboardData", () => ({
	useDashboardData: retiradasMocks.useDashboardData,
}));

describe("useRetiradas", () => {
	beforeEach(() => {
		retiradasMocks.useDashboardData.mockReset();
	});

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

	it("prioriza a ultima atualizacao oficial das metas sobre datas antigas dos meses", () => {
		retiradasMocks.useDashboardData.mockReturnValue({
			data: {
				metas: {
					lastUpdate: "2026-09-28T14:30:00.000Z",
				},
				painel: {
					retiradas: {
						result: {
							Setembro: {
								updatedAt: "2026-09-27T21:51:00.000Z",
							},
						},
					},
				},
			},
			loading: false,
			error: null,
		});

		const { result } = renderHook(() => useRetiradas());

		expect(result.current.lastUpdate).toContain("28/09/2026");
	});
});
