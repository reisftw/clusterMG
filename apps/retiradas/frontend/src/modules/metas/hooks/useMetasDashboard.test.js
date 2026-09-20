import { renderHook, waitFor } from "@testing-library/react";
import { useMetasDashboard } from "./useMetasDashboard";

const metasDashboardMocks = vi.hoisted(() => ({
	buscarTodasMetas: vi.fn(),
	buscarFeriados: vi.fn(),
	buscarMetasBaseConfig: vi.fn(),
}));

vi.mock("../services/metasService", () => ({
	buscarTodasMetas: metasDashboardMocks.buscarTodasMetas,
	buscarFeriados: metasDashboardMocks.buscarFeriados,
	buscarMetasBaseConfig: metasDashboardMocks.buscarMetasBaseConfig,
}));

describe("useMetasDashboard", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"));
		metasDashboardMocks.buscarFeriados.mockResolvedValue(new Set());
		metasDashboardMocks.buscarMetasBaseConfig.mockResolvedValue(null);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it("nao volta para o ultimo mes com dados quando o mes atual esta vazio", async () => {
		metasDashboardMocks.buscarTodasMetas.mockResolvedValue({
			Agosto: {
				mes: "Agosto",
				totalOS: 120,
				meta: 200,
				saldoDiario: [{ dia: 1, totalDia: 10 }],
			},
		});

		const { result } = renderHook(() => useMetasDashboard());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.metaMes).toBeNull();
		expect(result.current.allData.Agosto?.totalOS).toBe(120);
	});

	it("usa somente os dados do mes atual quando eles existem", async () => {
		metasDashboardMocks.buscarTodasMetas.mockResolvedValue({
			Agosto: { mes: "Agosto", totalOS: 120, meta: 200 },
			Setembro: { mes: "Setembro", totalOS: 15, meta: 100 },
		});

		const { result } = renderHook(() => useMetasDashboard());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.metaMes).toMatchObject({
			mes: "Setembro",
			totalOS: 15,
			meta: 100,
		});
	});
});
