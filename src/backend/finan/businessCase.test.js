// Business Case dentro do Finan (Roteiro Finan #46, Fase 4E). Cobre a
// matemática pura (ROI/payback/VPL/TIR) — item independente, sem banco.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const finanRequire = createRequire(path.join(process.cwd(), "apps/finan/backend/package.json"));
const { calcularRoi, calcularPaybackMeses, calcularVpl, calcularTir, calcularBusinessCase } = finanRequire(
	"./src/businessCase/calculo.js",
);

describe("calcularRoi", () => {
	it("investimento de 10 mil, economia de 1 mil/mes por 12 meses = ROI 20%", () => {
		expect(calcularRoi({ investimentoInicial: 10000, economiaMensal: 1000, prazoMeses: 12 })).toBeCloseTo(20, 5);
	});
	it("investimento zero devolve 0 (nunca divide por zero)", () => {
		expect(calcularRoi({ investimentoInicial: 0, economiaMensal: 1000, prazoMeses: 12 })).toBe(0);
	});
});

describe("calcularPaybackMeses", () => {
	it("10 mil investidos, 2 mil/mes de economia = payback em 5 meses", () => {
		expect(calcularPaybackMeses({ investimentoInicial: 10000, economiaMensal: 2000 })).toBe(5);
	});
	it("economia mensal zero ou negativa = payback null (nunca se paga)", () => {
		expect(calcularPaybackMeses({ investimentoInicial: 10000, economiaMensal: 0 })).toBeNull();
		expect(calcularPaybackMeses({ investimentoInicial: 10000, economiaMensal: -500 })).toBeNull();
	});
});

describe("calcularVpl", () => {
	it("taxa de desconto 0%: VPL = economia total - investimento (sem desconto)", () => {
		const vpl = calcularVpl({ investimentoInicial: 10000, economiaMensal: 1000, prazoMeses: 12, taxaDescontoMensal: 0 });
		expect(vpl).toBeCloseTo(2000, 5); // 12000 - 10000
	});
	it("taxa de desconto positiva reduz o VPL em relacao a taxa 0%", () => {
		const vplSemDesconto = calcularVpl({ investimentoInicial: 10000, economiaMensal: 1000, prazoMeses: 12, taxaDescontoMensal: 0 });
		const vplComDesconto = calcularVpl({ investimentoInicial: 10000, economiaMensal: 1000, prazoMeses: 12, taxaDescontoMensal: 0.02 });
		expect(vplComDesconto).toBeLessThan(vplSemDesconto);
	});
});

describe("calcularTir", () => {
	it("acha a taxa que zera o VPL (VPL na TIR calculada deve ser ~0)", () => {
		const params = { investimentoInicial: 10000, economiaMensal: 1000, prazoMeses: 12 };
		const tir = calcularTir(params);
		expect(tir).not.toBeNull();
		const vplNaTir = calcularVpl({ ...params, taxaDescontoMensal: tir });
		expect(Math.abs(vplNaTir)).toBeLessThan(1);
	});
	it("economia insuficiente pra pagar o investimento mesmo a taxa 0%: TIR null (sem raiz)", () => {
		const tir = calcularTir({ investimentoInicial: 100000, economiaMensal: 100, prazoMeses: 12 });
		expect(tir).toBeNull();
	});
});

describe("calcularBusinessCase — resumo executivo", () => {
	it("caso viavel: viavel=true, resumo menciona 'viavel'", () => {
		const resultado = calcularBusinessCase({ investimentoInicial: 10000, economiaMensal: 2000, prazoMeses: 12, taxaDescontoMensal: 0.01 });
		expect(resultado.viavel).toBe(true);
		expect(resultado.resumoExecutivo).toMatch(/viável/i);
		expect(resultado.paybackMeses).toBeCloseTo(5, 1);
	});
	it("caso inviavel (investimento nao se paga no prazo): viavel=false, resumo recomenda revisar", () => {
		const resultado = calcularBusinessCase({ investimentoInicial: 100000, economiaMensal: 100, prazoMeses: 12, taxaDescontoMensal: 0.01 });
		expect(resultado.viavel).toBe(false);
		expect(resultado.resumoExecutivo).toMatch(/revisar/i);
	});
});
