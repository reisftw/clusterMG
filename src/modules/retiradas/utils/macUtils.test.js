import { describe, expect, it } from "vitest";
import { extractMacsFromText, formatMac, normalizeMac } from "./macUtils";

describe("macUtils", () => {
  it("normaliza um MAC removendo separadores", () => {
    expect(normalizeMac("a1:b2:c3:d4:e5:f6")).toBe("A1B2C3D4E5F6");
  });

  it("formata MAC em pares separados por dois-pontos", () => {
    expect(formatMac("a1-b2-c3-d4-e5-f6")).toBe("A1:B2:C3:D4:E5:F6");
  });

  it("extrai candidatos de MAC de um texto OCR", () => {
    expect(
      extractMacsFromText("MAC WiFi A1 B2 C3 D4 E5 F6 e serial 123"),
    ).toEqual(["A1:B2:C3:D4:E5:F6"]);
  });

  it("prioriza um valor logo depois da label MAC", () => {
    expect(
      extractMacsFromText("PON SN TK1254 MAC 544B54366280 ANATEL"),
    ).toContain("54:4B:54:36:62:80");
  });

  it("aceita erros comuns de OCR em texto de etiqueta", () => {
    expect(
      extractMacsFromText("MAC: 448329E16EOC"),
    ).toContain("44:83:29:E1:6E:0C");
  });
});

