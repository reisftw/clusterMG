// Engenharia reversa do Access (BD.accdb, 2026-09-10): a query
// `Cria_APagar` aplica uma regra de sinal que o parser do Finan nao
// replicava — IIf(Valor<0 And Tipo="DEV", Valor, IIf(Valor<0, -Valor,
// Valor)): valor negativo vira positivo, EXCETO quando o tipo e "DEV"
// (devolucao). Confirmado com a planilha real que o usuario enviou
// (FPCP302 (1).xlsx): 105 linhas negativas nao-DEV somando
// R$ 1.359.951,78 — sem a correcao, o total de Contas a Pagar do Finan
// divergia do Access no dobro desse valor.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { parseFpcp302Rows } = require("../../../apps/finan/backend/src/financeiroBudgetXlsxImport");

function fpcp302Header() {
	return [
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
	];
}

// Dt. Prev. Pgto precisa estar no futuro (ou hoje): shouldKeepAccessImportedRow
// replica o WHERE F15 >= Now() do Access (query Cria_APagar) e descarta
// titulos ja vencidos — usar uma data fixa aqui deixaria o teste quebrando
// sozinho conforme o tempo passa.
const FUTURE_DATA_BASE = new Date();
FUTURE_DATA_BASE.setDate(FUTURE_DATA_BASE.getDate() + 30);
const FUTURE_DATA_PREV_PGTO = new Date();
FUTURE_DATA_PREV_PGTO.setDate(FUTURE_DATA_PREV_PGTO.getDate() + 33);

function fpcp302Row({ titulo, tipo, valor, dataPrevPgto = FUTURE_DATA_PREV_PGTO }) {
	return [
		titulo,
		tipo,
		"1321",
		"Ações de venda",
		"",
		"",
		"",
		"2020607", // centro de custo que existe em Projetos (ver financeiroBudgetAccessReference.js) — sem isso a linha e descartada por shouldKeepAccessImportedRow.
		"Ativação Telcable POP BH",
		"",
		"",
		"",
		FUTURE_DATA_BASE,
		"",
		dataPrevPgto,
		valor,
	];
}

function buildRows(entries) {
	return [
		["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Pág:"],
		["0001", "SEMPRE TELECOMUNICACOES LTDA", "", "", "Contas a Pagar Aberto"],
		fpcp302Header(),
		...entries.map(fpcp302Row),
	];
}

describe("financeiroBudgetXlsxImport (Finan) — regra de sinal do Access (Cria_APagar)", () => {
	it("valor negativo com tipo diferente de DEV vira positivo (mesma regra do Access)", () => {
		const rows = buildRows([{ titulo: "010926.02", tipo: "OUT", valor: -550 }]);
		const parsed = parseFpcp302Rows(rows, { fileName: "FPCP302.xlsx", sheetName: "Plan1" });
		expect(parsed).toHaveLength(1);
		expect(parsed[0].realizado).toBe(550);
	});

	it("valor negativo com tipo DEV continua negativo", () => {
		const rows = buildRows([{ titulo: "010926.03", tipo: "DEV", valor: -300 }]);
		const parsed = parseFpcp302Rows(rows, { fileName: "FPCP302.xlsx", sheetName: "Plan1" });
		expect(parsed).toHaveLength(1);
		expect(parsed[0].realizado).toBe(-300);
	});

	it("valor positivo nunca e alterado, independente do tipo", () => {
		const rows = buildRows([{ titulo: "010926.04", tipo: "OUT", valor: 550 }]);
		const parsed = parseFpcp302Rows(rows, { fileName: "FPCP302.xlsx", sheetName: "Plan1" });
		expect(parsed[0].realizado).toBe(550);
	});

	it("tipo com minusculas/espacos ainda reconhece DEV (comparacao normalizada)", () => {
		const rows = buildRows([{ titulo: "010926.05", tipo: " dev ", valor: -120 }]);
		const parsed = parseFpcp302Rows(rows, { fileName: "FPCP302.xlsx", sheetName: "Plan1" });
		expect(parsed[0].realizado).toBe(-120);
	});
});

describe("financeiroBudgetXlsxImport (Finan) — corte de data do Access (Cria_APagar: WHERE F15 >= Now())", () => {
	it("titulo com Dt. Prev. Pgto no passado e descartado, mesmo com centro de custo de projeto valido", () => {
		const ontem = new Date();
		ontem.setDate(ontem.getDate() - 1);
		const rows = buildRows([
			{ titulo: "010926.06", tipo: "OUT", valor: 100, dataPrevPgto: ontem },
		]);
		const parsed = parseFpcp302Rows(rows, { fileName: "FPCP302.xlsx", sheetName: "Plan1" });
		expect(parsed).toHaveLength(0);
	});

	it("titulo com Dt. Prev. Pgto no futuro e mantido", () => {
		const rows = buildRows([
			{ titulo: "010926.07", tipo: "OUT", valor: 100, dataPrevPgto: FUTURE_DATA_PREV_PGTO },
		]);
		const parsed = parseFpcp302Rows(rows, { fileName: "FPCP302.xlsx", sheetName: "Plan1" });
		expect(parsed).toHaveLength(1);
	});
});
