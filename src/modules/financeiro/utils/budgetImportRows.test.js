import { describe, expect, it } from "vitest";
import {
	normalizeAccountField,
	normalizeBudgetImportRows,
	normalizeCostCenterField,
	normalizeCurrencyField,
	normalizeDateField,
	normalizeMonthField,
} from "./budgetImportRows";

describe("budgetImportRows", () => {
	it("normaliza campos especiais e campos diretos da planilha orcamentaria", () => {
		const result = normalizeBudgetImportRows([
			{
				Quebra: "CP",
				Data: "8/3/2026",
				Fornecedor: "260131- CEMIG DISTRIBUICAO SA",
				CF: "1211 - Energia Elétrica (Torres, POPs, Cessão de Energia)",
				CC: "110701 - ROT",
				Orçado: "R$ 250.000,00",
				Realizado: "R$ 1.234,56",
				Empresa: "13",
				Filial: "2",
				Conta: "Banco teste",
				SeqMov: "123",
				Titulo: "Conta de luz",
				Tipo: "OPEX",
				Observações: "Importado",
				Categoria: "Energia",
				Gestor: "TIAGO",
				Quebra2: "Q2",
				Entidade: "Sempre",
				Diretoria: "Operações",
				Diretor: "Diretor Operacional",
				Status_Projetos: "Ativo",
				Grupo: "Utilidades",
			},
		]);

		expect(result.rows).toEqual([
			{
				quebra: "CP",
				data: "2026-08-03",
				ano: 2026,
				numMes: 8,
				mes: "Agosto",
				fornecedor: "260131- CEMIG DISTRIBUICAO SA",
				codConta: "1211",
				nomeConta: "Energia Elétrica (Torres, POPs, Cessão de Energia)",
				cf: "1211 - Energia Elétrica (Torres, POPs, Cessão de Energia)",
				codCc: "110701",
				nomeCc: "ROT",
				cc: "110701 - ROT",
				orcado: 250000,
				realizado: 1234.56,
				empresa: "13",
				filial: "2",
				conta: "Banco teste",
				seqMov: "123",
				titulo: "Conta de luz",
				tipo: "OPEX",
				observacoes: "Importado",
				categoria: "Energia",
				gestor: "TIAGO",
				quebra2: "Q2",
				entidade: "Sempre",
				diretoria: "Operações",
				diretor: "Diretor Operacional",
				statusProjetos: "Ativo",
				grupo: "Utilidades",
			},
		]);
		expect(result.detectedFields).toEqual([
			"quebra",
			"data",
			"ano",
			"numMes",
			"mes",
			"fornecedor",
			"codConta",
			"nomeConta",
			"codCc",
			"nomeCc",
			"orcado",
			"realizado",
			"empresa",
			"filial",
			"conta",
			"seqMov",
			"titulo",
			"tipo",
			"observacoes",
			"categoria",
			"gestor",
			"quebra2",
			"entidade",
			"diretoria",
			"diretor",
			"statusProjetos",
			"grupo",
		]);
	});

	it("ignora linhas vazias e mes numerico invalido", () => {
		const result = normalizeBudgetImportRows([
			{},
			{ Num_Mes: 24, Fornecedor: "" },
			{ Num_Mes: 12, Fornecedor: "Fornecedor teste" },
		]);

		expect(result.rows).toEqual([
			{ numMes: 12, fornecedor: "Fornecedor teste" },
		]);
		expect(result.detectedFields).toEqual(["fornecedor", "numMes"]);
	});

	it("expoe handlers isolados para os campos especiais", () => {
		const detectedFields = new Set();
		const normalized = {};
		normalizeAccountField({
			detectedFields,
			formattedValue: "1211 - Energia",
			normalized,
		});
		normalizeCostCenterField({
			detectedFields,
			formattedValue: "110701 - ROT",
			normalized,
		});
		normalizeDateField({
			detectedFields,
			formattedValue: "25/08/2026",
			normalized,
			value: "25/08/2026",
		});
		normalizeCurrencyField({
			detectedFields,
			formattedValue: "R$ 9.876,54",
			mappedKey: "realizado",
			normalized,
		});
		normalizeMonthField({
			detectedFields,
			formattedValue: "7",
			mappedKey: "numMes",
			normalized,
		});

		expect(normalized).toMatchObject({
			codConta: "1211",
			nomeConta: "Energia",
			codCc: "110701",
			nomeCc: "ROT",
			data: "2026-08-25",
			ano: 2026,
			numMes: 8,
			mes: "Agosto",
			realizado: 9876.54,
		});
		expect([...detectedFields]).toContain("realizado");
	});
});
