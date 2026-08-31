import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
	buildDreStatementViewModel,
	parseDreWorkbook,
	parseFinancialStatementCompetencia,
	parseFinancialStatementMoney,
} from "./financialStatement";

function workbookBuffer(rows) {
	const workbook = XLSX.utils.book_new();
	const sheet = XLSX.utils.json_to_sheet(rows);
	XLSX.utils.book_append_sheet(workbook, sheet, "DRE");
	return XLSX.write(workbook, { type: "array", bookType: "xlsx" });
}

describe("financialStatement", () => {
	it("normaliza dinheiro e competência mantendo o padrão da importação DRE", () => {
		expect(parseFinancialStatementMoney("R$ 1.234,56")).toBe(1234.56);
		expect(parseFinancialStatementCompetencia("08/2026")).toEqual({
			ano: 2026,
			mes: 8,
		});
		expect(parseFinancialStatementCompetencia("2026-09")).toEqual({
			ano: 2026,
			mes: 9,
		});
	});

	it("lê XLSX da DRE classificando linhas-base", () => {
		const parsed = parseDreWorkbook(
			{ name: "dre.xlsx" },
			workbookBuffer([
				{
					"Competência": "08/2026",
					"Categoria": "Receita Bruta",
					"Descrição": "Venda mensal",
					"Valor": "R$ 1.500,00",
				},
			]),
		);

		expect(parsed).toMatchObject({
			fileName: "dre.xlsx",
			sheetName: "DRE",
		});
		expect(parsed.rows[0]).toMatchObject({
			competenciaAno: 2026,
			competenciaMes: 8,
			linhaDre: "receita_bruta",
			categoriaOriginal: "Receita Bruta",
			descricao: "Venda mensal",
			valor: 1500,
			origemArquivo: "dre.xlsx",
		});
	});

	it("monta view model com KPIs e linhas calculadas por uma interface única", () => {
		const viewModel = buildDreStatementViewModel(
			{
				totalsByLine: {
					receita_bruta: 1000,
					deducoes_abatimentos: 100,
					cpv_cmv: 250,
					despesas_administrativas: 50,
					provisoes_irpj_csll: 25,
				},
			},
			{
				rows: [
					{ linhaDre: "receita_bruta" },
					{ linhaDre: "" },
				],
			},
		);

		expect(viewModel.kpis[0]).toEqual(["Receita Líquida", 900]);
		expect(viewModel.kpis.at(-1)).toEqual(["Resultado Líquido", 575]);
		expect(viewModel.classifiedRows).toHaveLength(1);
		expect(viewModel.unclassifiedRows).toHaveLength(1);
		expect(viewModel.statement.some((line) => line.id === "lucro_bruto")).toBe(
			true,
		);
	});
});
