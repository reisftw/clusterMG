import {
  NOMES_MESES,
  NOMES_MESES_CURTOS,
  obterIndiceMes,
  obterMesAtual,
  obterMesesAnteriores,
  obterNomeMes,
} from "./mes";

describe("mes utils", () => {
  it("retorna indice por nome e numero", () => {
    expect(obterIndiceMes("Janeiro")).toBe(0);
    expect(obterIndiceMes(1)).toBe(0);
    expect(obterIndiceMes(12)).toBe(11);
    expect(obterIndiceMes("Invalido")).toBe(-1);
  });

  it("retorna nomes longos e curtos", () => {
    expect(obterNomeMes(0)).toBe(NOMES_MESES[0]);
    expect(obterNomeMes(1, { curto: true })).toBe(NOMES_MESES_CURTOS[1]);
    expect(obterNomeMes(99)).toBe("");
  });

  it("retorna o mes atual a partir da data informada", () => {
    expect(obterMesAtual({ data: new Date(2026, 4, 2) })).toBe("Maio");
    expect(obterMesAtual({ data: new Date(2026, 4, 2), curto: true })).toBe("Mai");
  });

  it("retorna a janela de meses anteriores", () => {
    expect(obterMesesAnteriores("Maio", 3)).toEqual([
      "Fevereiro",
      "Março",
      "Abril",
    ]);
    expect(obterIndiceMes("Marco")).toBe(2);
    expect(obterMesesAnteriores("Janeiro", 3)).toEqual([]);
    expect(obterMesesAnteriores("Maio", 0)).toEqual([]);
  });
});

