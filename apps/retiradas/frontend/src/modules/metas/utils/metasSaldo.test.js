import { describe, expect, it } from "vitest";
import { recalcularSaldoDiario } from "./metasSaldo";

describe("recalcularSaldoDiario", () => {
	it("reconcilia a serie diaria defasada com o total oficial", () => {
		const resultado = recalcularSaldoDiario(
			{
				mes: "Novembro",
				meta: 699,
				totalOS: 185,
				saldoDiario: [
					{ dia: 3, totalDia: 34 },
					{ dia: 4, totalDia: 34 },
					{ dia: 5, totalDia: 23 },
					{ dia: 6, totalDia: 21 },
					{ dia: 7, totalDia: 18 },
					{ dia: 9, totalDia: 38 },
					{ dia: 10, totalDia: 5 },
				],
			},
			new Set(),
			2026,
		);

		expect(
			resultado.saldoDiario.reduce((total, row) => total + row.totalDia, 0),
		).toBe(185);
		expect(resultado.saldoDiario.at(-1)?.totalDia).toBe(17);
		expect(resultado.saldoFinal).toBe(-25);
	});

	it("remove do dia mais recente uma correcao feita no total oficial", () => {
		const resultado = recalcularSaldoDiario(
			{
				mes: "Novembro",
				meta: 699,
				totalOS: 20,
				saldoDiario: [
					{ dia: 3, totalDia: 10 },
					{ dia: 4, totalDia: 20 },
				],
			},
			new Set(),
			2026,
		);

		expect(
			resultado.saldoDiario.reduce((total, row) => total + row.totalDia, 0),
		).toBe(20);
		expect(resultado.saldoDiario.at(-1)?.totalDia).toBe(10);
	});

	it("usa toda a entrega mensal e conta producao de fim de semana", () => {
		const resultado = recalcularSaldoDiario(
			{
				mes: "Novembro",
				meta: 2602,
				totalOS: 691,
				saldoDiario: [
					{ dia: 3, totalDia: 110 },
					{ dia: 4, totalDia: 105 },
					{ dia: 5, totalDia: 100 },
					{ dia: 6, totalDia: 95 },
					{ dia: 7, totalDia: 40 },
					{ dia: 9, totalDia: 100 },
					{ dia: 10, totalDia: 101 },
				],
			},
			new Set(),
			2026,
		);

		expect(resultado.saldoDiario.find((row) => row.dia === 7)?.metaDia).toBe(0);
		expect(
			resultado.saldoDiario.reduce((total, row) => total + row.totalDia, 0),
		).toBe(691);
		expect(resultado.saldoFinal).toBe(-91);
	});
});
