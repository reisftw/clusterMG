import { describe, expect, it } from "vitest";
import { calculateLocalReport, getMapsLinks, toCurrencyNumber } from "./imoveisReports";

describe("imoveisReports", () => {
  it("normaliza valores monetarios brasileiros", () => {
    expect(toCurrencyNumber("1.234,56")).toBe(1234.56);
    expect(toCurrencyNumber("752")).toBe(752);
    expect(toCurrencyNumber(null)).toBe(0);
  });

  it("calcula resumo local dos imoveis", () => {
    const report = calculateLocalReport({
      imoveis: [
        { id: "1", ativo: true, tipoContrato: "alugado" },
        { id: "2", ativo: true, tipoContrato: "proprio" },
        { id: "3", ativo: false, tipoContrato: "alugado" },
      ],
      iptus: [{ valor: "100,50" }, { valor: 200 }],
      alugueis: [{ valor: "1.000,00" }],
      reajustes: [{ id: "r1" }],
    });

    expect(report).toMatchObject({
      totalImoveis: 3,
      ativos: 2,
      alugados: 1,
      proprios: 1,
      finalizados: 1,
      gastosIptu: 300.5,
      gastosAluguel: 1000,
      reajustes: 1,
    });
  });

  it("usa o valor mensal cadastrado quando nao existem lancamentos de aluguel", () => {
    const report = calculateLocalReport({
      imoveis: [
        { id: "1", ativo: true, tipoContrato: "alugado", valorAluguel: "1.200,00" },
        { id: "2", ativo: true, tipoContrato: "proprio", valorAluguel: "900,00" },
        { id: "3", ativo: false, tipoContrato: "alugado", valorAluguel: "500,00" },
      ],
      alugueis: [],
    });

    expect(report.gastosAluguel).toBe(1200);
  });

  it("gera links de mapa e street view a partir do endereco", () => {
    const links = getMapsLinks("Rua Teste, 10 - Belo Horizonte");
    expect(links.mapsUrl).toContain("google.com/maps/search");
    expect(links.streetViewUrl).toContain("google.com/maps/@");
    expect(links.embedUrl).toContain("output=embed");
    expect(links.mapsUrl).toContain("Rua%20Teste");
  });
});
