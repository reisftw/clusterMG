import { act, renderHook, waitFor } from "@testing-library/react";

const dashboardMocks = vi.hoisted(() => ({
	error: vi.fn(),
}));

vi.mock("../../../utils/logger", () => ({
	logger: {
		log: vi.fn(),
		warn: vi.fn(),
		error: dashboardMocks.error,
	},
}));

async function loadModule() {
	vi.resetModules();
	return import("./useDashboardData");
}

// Teste intermitente (Etapa 5, Fase 10): a cada montagem, useDashboardData.js
// agenda com window.setTimeout(..., 750) um refresh silencioso em segundo
// plano que ignora o cache (force: true) e chama fetch de novo. Com timers
// reais (nenhum fake timer configurado aqui nem no setup global), esse
// temporizador corre contra o relógio da própria suite: isolado (20/20
// execuções) nunca deu tempo dele disparar, mas ao rodar a suite inteira em
// paralelo (contenção de CPU entre os workers do Vitest) o teste ocasionalmente
// levava tempo real suficiente para os 750ms passarem antes das asserções,
// disparando um fetch extra e quebrando `toHaveBeenCalledTimes(1)`. A causa
// raiz não é falta de tempo (não adianta só aumentar um timeout) — é esse
// setTimeout de produção disparando durante o teste. Intercepta só essa
// chamada específica (delay === 750), repassando qualquer outro delay pra
// implementação real — waitFor continua funcionando normalmente porque seu
// polling interno usa outros delays.
const realSetTimeout = window.setTimeout.bind(window);

describe("useDashboardData", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		window.localStorage.clear();
		vi.stubGlobal("fetch", vi.fn());
		vi.spyOn(window, "setTimeout").mockImplementation((handler, delay, ...args) => {
			if (delay === 750) return 0;
			return realSetTimeout(handler, delay, ...args);
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("carrega o data.json com sucesso e popula o estado", async () => {
		const payload = { mapa: { total: 10 } };
		global.fetch.mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue(payload),
		});

		const module = await loadModule();
		const { result } = renderHook(() => module.useDashboardData());

		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.error).toBeNull();
		expect(result.current.data).toEqual(payload);
		expect(global.fetch).toHaveBeenCalledTimes(1);
		expect(global.fetch.mock.calls[0][0]).toContain("/api/public/dashboard");
	});

	it("expoe erro quando a carga falha por rede ou status HTTP", async () => {
		global.fetch.mockResolvedValue({
			ok: false,
			status: 503,
			json: vi.fn(),
		});

		const module = await loadModule();
		const { result } = renderHook(() => module.useDashboardData());

		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBe("HTTP 503");
		expect(dashboardMocks.error).toHaveBeenCalled();
	});

	it("ignora invalidacao cross-tab por storage event para nao recarregar o painel sozinho", async () => {
		global.fetch.mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue({ meta: { version: 1 } }),
		});

		const module = await loadModule();
		const { result } = renderHook(() => module.useDashboardData());

		await waitFor(() =>
			expect(result.current.data).toEqual({ meta: { version: 1 } }),
		);

		act(() => {
			window.localStorage.setItem("static-data-version", "sync-2");
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: "static-data-version",
					newValue: "sync-2",
				}),
			);
		});

		expect(global.fetch).toHaveBeenCalledTimes(1);
		expect(result.current.data).toEqual({ meta: { version: 1 } });
	});

	it("ignora eventos de storage de outras chaves", async () => {
		global.fetch.mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue({ meta: { version: 1 } }),
		});

		const module = await loadModule();
		const { result } = renderHook(() => module.useDashboardData());

		await waitFor(() =>
			expect(result.current.data).toEqual({ meta: { version: 1 } }),
		);

		act(() => {
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: "outra-chave",
					newValue: "ignored",
				}),
			);
		});

		expect(global.fetch).toHaveBeenCalledTimes(1);
		expect(result.current.data).toEqual({ meta: { version: 1 } });
	});

	it("reaproveita o cache entre montagens sem nova requisicao", async () => {
		const payload = { meta: { version: 1 } };
		global.fetch.mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue(payload),
		});

		const module = await loadModule();
		const firstRender = renderHook(() => module.useDashboardData());

		await waitFor(() =>
			expect(firstRender.result.current.data).toEqual(payload),
		);
		firstRender.unmount();

		const secondRender = renderHook(() => module.useDashboardData());

		expect(secondRender.result.current.loading).toBe(false);
		expect(secondRender.result.current.data).toEqual(payload);
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it("refaz a leitura quando a invalidacao local dispara o evento customizado", async () => {
		global.fetch
			.mockResolvedValueOnce({
				ok: true,
				json: vi.fn().mockResolvedValue({ meta: { version: 1 } }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: vi.fn().mockResolvedValue({ meta: { version: 3 } }),
			});

		const module = await loadModule();
		const { result } = renderHook(() => module.useDashboardData());

		await waitFor(() =>
			expect(result.current.data).toEqual({ meta: { version: 1 } }),
		);

		act(() => {
			module.invalidateDashboardDataCache("manual-v3");
		});

		await waitFor(() =>
			expect(result.current.data).toEqual({ meta: { version: 3 } }),
		);

		expect(global.fetch).toHaveBeenCalledTimes(2);
		expect(global.fetch.mock.calls[1][0]).toContain("v=manual-v3");
	});

	it("compartilha a mesma requisicao pendente entre hooks montados em paralelo", async () => {
		let resolveResponse;
		global.fetch.mockReturnValue(
			new Promise((resolve) => {
				resolveResponse = resolve;
			}),
		);

		const module = await loadModule();
		const firstRender = renderHook(() => module.useDashboardData());
		const secondRender = renderHook(() => module.useDashboardData());

		act(() => {
			resolveResponse({
				ok: true,
				json: vi.fn().mockResolvedValue({ meta: { version: 9 } }),
			});
		});

		await waitFor(() =>
			expect(firstRender.result.current.data).toEqual({ meta: { version: 9 } }),
		);
		await waitFor(() =>
			expect(secondRender.result.current.data).toEqual({
				meta: { version: 9 },
			}),
		);

		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it("ignora a resposta quando o hook desmonta antes do fetch concluir", async () => {
		let resolveResponse;
		global.fetch.mockReturnValue(
			new Promise((resolve) => {
				resolveResponse = resolve;
			}),
		);

		const module = await loadModule();
		const { unmount } = renderHook(() => module.useDashboardData());

		unmount();

		await act(async () => {
			resolveResponse({
				ok: true,
				json: vi.fn().mockResolvedValue({ meta: { version: 11 } }),
			});
			await Promise.resolve();
		});

		expect(dashboardMocks.error).not.toHaveBeenCalled();
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});
});
