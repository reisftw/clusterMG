import { act, renderHook } from "@testing-library/react";
import { useClipboard } from "./useClipboard";

const clipboardMocks = vi.hoisted(() => ({
  gerarRelatorioHtml: vi.fn(),
  copiarRelatorioParaClipboard: vi.fn(),
}));

vi.mock("../services/clipboardService", () => ({
  gerarRelatorioHtml: clipboardMocks.gerarRelatorioHtml,
  copiarRelatorioParaClipboard: clipboardMocks.copiarRelatorioParaClipboard,
}));

describe("useClipboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    clipboardMocks.gerarRelatorioHtml.mockReturnValue("<p>relatorio</p>");
    clipboardMocks.copiarRelatorioParaClipboard.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("marca copiado como true quando a copia conclui com sucesso", async () => {
    const { result } = renderHook(() => useClipboard());

    await act(async () => {
      await result.current.copiar({ ferias: [] }, { ferias: true });
    });

    expect(result.current.copiado).toBe(true);
    expect(result.current.erro).toBeNull();
  });

  it("volta copiado para false apos 3 segundos", async () => {
    const { result } = renderHook(() => useClipboard());

    await act(async () => {
      await result.current.copiar({ ferias: [] }, { ferias: true });
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.copiado).toBe(false);
  });

  it("limpa o timer ao desmontar antes dos 3 segundos", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useClipboard());

    await act(async () => {
      await result.current.copiar({ ferias: [] }, { ferias: true });
    });

    unmount();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });
});

