import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

const {
	detectLayout,
	parseFpcp106Rows,
	parseFpcp302Rows,
} = require("../../vps/api/src/financeiroBudgetXlsxImport");

describe("financeiroBudgetXlsxImport", () => {
	it("le FPCP106 por posicao fixa dos campos, ignorando titulo", () => {
		const rows = [
			[
				"ORIGEM",
				"DATA MOVIMENTO",
				"FORNECEDOR",
				"",
				"",
				"CONTA FINANCEIRA",
				"",
				"",
				"",
				"CENTRO DE CUSTO",
				"",
				"",
				"VALOR",
				"EMPRESA",
				"FILIAL",
				"CONTA BANCARIA",
			],
			[
				"CP",
				new Date(2026, 7, 3),
				"260131- CEMIG DISTRIBUICAO SA",
				"",
				"",
				"1211-Energia Eletrica",
				"",
				"",
				"",
				"110701-ROT",
				"",
				"",
				"111,98",
				"13",
				"1",
				"08249-9",
			],
		];

		expect(detectLayout(rows)).toBe("fpcp106");
		expect(parseFpcp106Rows(rows, { fileName: "FPCP106.xlsx", sheetName: "Plan1" })[0]).toMatchObject({
			origem: "CP",
			data: "2026-08-03",
			codConta: "1211",
			nomeConta: "Energia Eletrica",
			codCc: "110701",
			nomeCc: "ROT",
			realizado: 111.98,
			empresaId: "13",
			filialId: "1",
			conta: "08249-9",
			layoutOrigem: "FPCP106",
			linhaOrigem: 2,
		});
	});

	it("le FPCP302 em blocos por empresa e ignora cabecalhos internos", () => {
		const rows = [
			["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Pág:"],
			["0001", "SEMPRE TELECOMUNICACOES LTDA", "", "", "Contas a Pagar Aberto"],
			["0001", "SEMPRE TELECOMUNICACOES LTDA"],
			["", "", "", "", "por Plano Financeiro"],
			[
				"Nº Título",
				"Tipo",
				"Conta Financeira",
				"",
				"",
				"",
				"",
				"",
				"Centro de Custo",
				"",
				"",
				"",
				"Data Base",
				"",
				"Dt. Prev. Pgto",
				"Valor",
			],
			[
				"010926.02",
				"OUT",
				"1321",
				"Acoes de venda",
				"",
				"",
				"",
				"110101",
				"Marketing",
				"",
				"",
				"",
				new Date(2026, 8, 1),
				"",
				new Date(2026, 8, 4),
				550,
			],
			["0014", "ONNET LOCACOES LTDA", "", "", "Contas a Pagar Aberto"],
			[
				"020926.01",
				"ALU",
				"1327",
				"Propaganda",
				"",
				"",
				"",
				"110201",
				"Comercial",
				"",
				"",
				"",
				new Date(2026, 8, 2),
				"",
				new Date(2026, 8, 5),
				700,
			],
		];

		expect(detectLayout(rows)).toBe("fpcp302");
		const parsed = parseFpcp302Rows(rows, {
			fileName: "FPCP302.xlsx",
			sheetName: "Plan1",
		});

		expect(parsed).toHaveLength(2);
		expect(parsed[0]).toMatchObject({
			origem: "CP",
			data: "2026-09-04",
			codConta: "1321",
			nomeConta: "Acoes de venda",
			codCc: "110101",
			nomeCc: "Marketing",
			empresaId: "0001",
			empresa: "0001 - SEMPRE TELECOMUNICACOES LTDA",
			realizado: 550,
			layoutOrigem: "FPCP302",
			linhaOrigem: 6,
		});
		expect(parsed[1]).toMatchObject({
			empresaId: "0014",
			empresa: "0014 - ONNET LOCACOES LTDA",
			codCc: "110201",
			realizado: 700,
		});
	});
});
