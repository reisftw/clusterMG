// Roteiro Finan #15 (OCR inteligente) — testa so a parte determinística
// (parseMoneyBr/extractCamposFromText), sem depender dos binarios
// tesseract/pdftoppm (instalados na VPS, nao neste ambiente de teste).
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const finanRequire = createRequire(
	path.join(process.cwd(), "apps/finan/backend/package.json"),
);
const { __testables } = finanRequire("./src/documentos/ocrExtraction.js");
const { extractCamposFromText, parseMoneyBr } = __testables;

describe("apps/finan/backend/src/documentos/ocrExtraction", () => {
	it("parseMoneyBr converte formato brasileiro (milhar com ponto, decimal com virgula)", () => {
		expect(parseMoneyBr("1.234,56")).toBe(1234.56);
		expect(parseMoneyBr("89,90")).toBe(89.9);
	});

	it("extractCamposFromText acha CNPJ, o maior valor em R$, datas e numero da nota", () => {
		const texto = `
			NOTA FISCAL ELETRONICA
			CNPJ: 12.345.678/0001-90
			N. 004521
			Data emissao: 05/09/2026
			Vencimento: 20/09/2026
			Item 1 ......... R$ 89,90
			Item 2 ......... R$ 150,00
			VALOR TOTAL ..... R$ 239,90
		`;
		const campos = extractCamposFromText(texto);
		expect(campos.cnpjEmissor).toBe("12.345.678/0001-90");
		expect(campos.valorEncontrado).toBe(239.9);
		expect(campos.numeroEncontrado).toBe("004521");
		expect(campos.datasEncontradas).toContain("2026-09-05");
		expect(campos.datasEncontradas).toContain("2026-09-20");
	});

	it("extractCamposFromText nao quebra com texto sem nenhum campo reconhecivel", () => {
		const campos = extractCamposFromText("texto ilegível sem nenhum dado estruturado");
		expect(campos.cnpjEmissor).toBeNull();
		expect(campos.fornecedorNome).toBeNull();
		expect(campos.valorEncontrado).toBeNull();
		expect(campos.numeroEncontrado).toBeNull();
		expect(campos.datasEncontradas).toEqual([]);
	});

	it("extractCamposFromText acha o nome do fornecedor pelo rotulo (Razão Social)", () => {
		const texto = `
			NOTA FISCAL ELETRONICA
			Razão Social: Distribuidora Sempre Internet Ltda
			CNPJ: 12.345.678/0001-90
			VALOR TOTAL ..... R$ 100,00
		`;
		const campos = extractCamposFromText(texto);
		expect(campos.fornecedorNome).toBe("Distribuidora Sempre Internet Ltda");
	});

	it("extractCamposFromText acha o nome do fornecedor pela linha antes do CNPJ (sem rotulo)", () => {
		const texto = `NOTA FISCAL ELETRONICA\nFORNECEDOR TELECOM LTDA\n12.345.678/0001-90\nVALOR TOTAL R$ 50,00`;
		const campos = extractCamposFromText(texto);
		expect(campos.fornecedorNome).toBe("FORNECEDOR TELECOM LTDA");
	});
});
