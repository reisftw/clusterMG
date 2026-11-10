import { buildMonthProjection } from "../../../utils/metasProjection";
import { calcProjecao, calcSaldoDiario } from "./calcProjecao";
import { recalcularSaldoDiario } from "../../../modules/metas/utils/metasSaldo";

const dadosJulho = {
	mes: "Julho",
	ano: 2026,
	totalOS: 754,
	meta: 2586.6,
	cancelamentos: 2874,
	saldoDiario: [
		{ dia: 1, totalDia: 96 },
		{ dia: 2, totalDia: 104 },
		{ dia: 3, totalDia: 85 },
		{ dia: 4, totalDia: 26 },
		{ dia: 5, totalDia: 3 },
		{ dia: 6, totalDia: 71 },
		{ dia: 7, totalDia: 80 },
		{ dia: 8, totalDia: 95 },
		{ dia: 9, totalDia: 87 },
		{ dia: 10, totalDia: 72 },
		{ dia: 11, totalDia: 29 },
		{ dia: 12, totalDia: 6 },
	],
};

describe("calcProjecao", () => {
	it("usa o mesmo saldo da dashboard e metas", async () => {
		const dados = {
			mes: "Novembro",
			ano: 2026,
			meta: 420,
			saldoDiario: [
				{ dia: 2, totalDia: 20 },
				{ dia: 3, totalDia: 0 },
				{ dia: 4, totalDia: 30 },
			],
			rawDays: [
				{ dia: 2, totalDia: 999 },
				{ dia: 3, totalDia: 999 },
			],
		};

		const painel = await calcSaldoDiario(dados, "Novembro", new Set());
		const metas = recalcularSaldoDiario(dados, new Set(), 2026);

		expect(painel.lista.map(({ dia, totalDia }) => ({ dia, totalDia }))).toEqual([
			{ dia: 2, totalDia: 20 },
			{ dia: 4, totalDia: 30 },
		]);
		expect(painel.lista.at(-1)?.saldoMes).toBe(metas.saldoFinal);
	});

	it("usa a mesma projecao e o mesmo calendario exibidos em metas", async () => {
		const feriadosSet = new Set(["07-16"]);
		const metas = buildMonthProjection(dadosJulho, feriadosSet);
		const painel = await calcProjecao(dadosJulho, "Julho", feriadosSet);

		expect(painel.projecaoFinal).toBe(1962);
		expect(painel.projecaoFinal).toBe(metas.projecaoFinal);
		expect(painel.diasUteisRestantes).toBe(metas.diasRestantes);
		expect(painel.pctProjecaoCancelamentos).toBe(metas.pctProjetado);
	});
});
