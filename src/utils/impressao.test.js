import { formatarDataGeracao, imprimirHtml } from "./impressao";

describe("impressao", () => {
  it("formata a data de geracao", () => {
    const data = new Date(2026, 4, 2, 9, 7);
    expect(formatarDataGeracao(data)).toBe("02/05/2026 09:07");
    expect(formatarDataGeracao(data, { incluirPreposicao: true })).toBe(
      "02/05/2026 as 09:07",
    );
  });

  it("renderiza html e dispara impressao", () => {
    vi.useFakeTimers();
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    imprimirHtml("<strong>teste</strong>", {
      areaId: "custom-area",
      styleId: "custom-style",
    });

    expect(document.getElementById("custom-area")).toBeInTheDocument();
    expect(document.getElementById("custom-style")).toBeInTheDocument();
    expect(document.getElementById("custom-area")).toContainHTML(
      "<strong>teste</strong>",
    );
    expect(printSpy).toHaveBeenCalledTimes(1);

    vi.runAllTimers();

    expect(document.getElementById("custom-area")).not.toBeInTheDocument();
    expect(document.getElementById("custom-style")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});

