import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recalcularSaldoDiario } from "./metasSaldo";

describe("recalcularSaldoDiario", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 10, 10, 12));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

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
		expect(resultado.saldoFinal).toBe(-37);
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
		expect(resultado.saldoFinal).toBe(-131);
	});

	it("calcula o saldo pelo total mensal mesmo sem serie diaria", () => {
		const resultado = recalcularSaldoDiario(
			{
				mes: "Novembro",
				meta: 1903,
				totalOS: 521,
				saldoDiario: [],
			},
			new Set(),
			2026,
		);

		expect(resultado.saldoFinal).toBe(-82);
	});

	it("mantem o saldo acumulado coerente com a meta diaria da Sempre", () => {
		vi.setSystemTime(new Date(2026, 10, 14, 12));
		const resultado = recalcularSaldoDiario(
			{
				mes: "Novembro",
				meta: 1903,
				totalOS: 806,
				saldoDiario: [
					{ dia: 1, totalDia: 15 },
					{ dia: 2, totalDia: 12 },
					{ dia: 3, totalDia: 95 },
					{ dia: 4, totalDia: 77 },
					{ dia: 5, totalDia: 93 },
					{ dia: 6, totalDia: 77 },
					{ dia: 7, totalDia: 25 },
					{ dia: 8, totalDia: 13 },
					{ dia: 9, totalDia: 69 },
					{ dia: 10, totalDia: 67 },
					{ dia: 11, totalDia: 61 },
					{ dia: 12, totalDia: 110 },
					{ dia: 13, totalDia: 75 },
					{ dia: 14, totalDia: 17 },
				],
			},
			new Set(),
			2026,
		);

		expect(resultado.saldoDiario.reduce((sum, row) => sum + row.metaDia, 0)).toBe(903);
		expect(resultado.saldoDiario.at(-1)?.saldoMes).toBe(-97);
		expect(resultado.saldoFinal).toBe(-97);
	});
});
