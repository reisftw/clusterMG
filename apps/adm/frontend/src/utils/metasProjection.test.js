import { buildMetasProjection, buildMonthProjection } from "./metasProjection";

describe("metasProjection", () => {
	it("retorna null sem dados suficientes", () => {
		expect(buildMetasProjection({ month: "", saldoDiario: [] })).toBeNull();
	});

	it("projeta o fechamento com base nos dias uteis restantes", () => {
		const projection = buildMetasProjection({
			month: "Janeiro",
			saldoDiario: [
				{ dia: 2, totalDia: 10 },
				{ dia: 5, totalDia: 20 },
				{ dia: 6, totalDia: 30 },
				{ dia: 7, totalDia: 40 },
				{ dia: 8, totalDia: 50 },
			],
			totalOS: 150,
			meta: 300,
			cancelamentos: 400,
			feriadosSet: new Set(["01-01"]),
			minSampleDays: 3,
			sampleSize: 3,
		});

		expect(projection).not.toBeNull();
		expect(projection.ritmoAtual).toBe(40);
		expect(projection.ultimoDiaComDados).toBe(8);
		expect(projection.projecaoFinal).toBeGreaterThan(150);
		expect(projection.pctProjecaoMeta).toMatch(/\d+\.\d/);
		expect(projection.projecaoPorDia.length).toBeGreaterThan(0);
	});

	it("ignora dias posteriores ao corte na projecao do mes atual", () => {
		const projection = buildMetasProjection({
			month: "Julho",
			saldoDiario: [
				{ dia: 1, totalDia: 10 },
				{ dia: 2, totalDia: 20 },
				{ dia: 3, totalDia: 30 },
				{ dia: 20, totalDia: 999 },
			],
			totalOS: 1059,
			meta: 600,
			feriadosSet: new Set(),
			year: 2026,
			projectionUntilDay: 10,
			minSampleDays: 2,
			sampleSize: 2,
		});

		expect(projection).not.toBeNull();
		expect(projection.ultimoDiaComDados).toBe(3);
		expect(projection.projecaoFinal).toBeLessThan(1059);
		expect(projection.projecaoPorDia[0].dia).toBe(4);
	});

	it("aplica o calendario informado na projecao canonica do mes", () => {
		const dados = {
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

		const projection = buildMonthProjection(dados, new Set(["07-16"]));

		expect(projection.projecaoFinal).toBe(1962);
		expect(projection.diasRestantes).toBe(14);
	});
});
