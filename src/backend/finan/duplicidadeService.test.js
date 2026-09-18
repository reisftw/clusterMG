// Detecção avançada de duplicidade de Notas Fiscais (Roteiro Finan #34,
// Fase 4B, estende #14). Cobre a pontuação de confiança pura (sem
// banco): CNPJ+valor já garantidos pelo SQL somam 55 de cara, número
// igual soma mais 25, datas próximas somam proporcional à distância, e
// número/data muito diferentes não zeram o score todo (cada sinal é
// independente).
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const finanRequire = createRequire(path.join(process.cwd(), "apps/finan/backend/package.json"));
process.env.FINAN_PGHOST = process.env.FINAN_PGHOST || "localhost";
process.env.FINAN_PGUSER = process.env.FINAN_PGUSER || "test";
process.env.FINAN_PGDATABASE = process.env.FINAN_PGDATABASE || "test";
const { __testables, CONFIDENCE_THRESHOLD } = finanRequire("./src/documentos/duplicidadeService.js");
const { scorePair, normalizeNumero, textSimilarity } = __testables;

describe("duplicidadeService — scorePair", () => {
	it("mesmo numero e mesma data de emissao/vencimento: confiança máxima (100)", () => {
		const a = { numero: "12345", data_emissao: "2026-08-01", data_vencimento: "2026-08-10" };
		const b = { numero: "12345", data_emissao: "2026-08-01", data_vencimento: "2026-08-10" };
		const score = scorePair(a, b);
		expect(score.confidence).toBe(100);
		expect(score.numeroMatch).toBe(true);
	});

	it("so CNPJ+valor batendo (numero e datas diferentes): fica em 55, o piso garantido", () => {
		const a = { numero: "111", data_emissao: "2026-01-01", data_vencimento: "2026-01-10" };
		const b = { numero: "999", data_emissao: "2026-08-01", data_vencimento: "2026-08-10" };
		const score = scorePair(a, b);
		expect(score.confidence).toBe(55);
		expect(score.numeroMatch).toBe(false);
	});

	it("numero igual mas datas distantes: soma o numero, nao soma proximidade de data", () => {
		const a = { numero: "555", data_emissao: "2026-01-01", data_vencimento: null };
		const b = { numero: "555", data_emissao: "2026-06-01", data_vencimento: null };
		const score = scorePair(a, b);
		expect(score.confidence).toBe(55 + 25); // cnpj+valor+numero, sem pontos de data
	});

	it("data de emissao a 5 dias de distancia (metade da janela de 10 dias): pontuação parcial de proximidade", () => {
		const a = { numero: "1", data_emissao: "2026-08-01", data_vencimento: null };
		const b = { numero: "2", data_emissao: "2026-08-06", data_vencimento: null };
		const score = scorePair(a, b);
		expect(score.emissaoDiffDias).toBe(5);
		expect(score.confidence).toBe(55 + 6); // 12 * (1 - 5/10) = 6
	});

	it("numero normalizado ignora zeros a esquerda e pontuação — '000123' bate com '123-A'", () => {
		expect(normalizeNumero("000123")).toBe(normalizeNumero("123-A"));
	});

	it("threshold de confiança e 55 — o piso de CNPJ+valor sozinho já entra no resultado", () => {
		expect(CONFIDENCE_THRESHOLD).toBe(55);
	});
});

describe("duplicidadeService — textSimilarity (bigramas/Dice, informativo)", () => {
	it("textos identicos (ignorando acento/caixa) tem similaridade 1", () => {
		expect(textSimilarity("Energia Elétrica", "energia eletrica")).toBe(1);
	});

	it("textos sem nenhuma relação tem similaridade baixa", () => {
		expect(textSimilarity("Manutenção de link dedicado", "Compra de material de escritório")).toBeLessThan(0.3);
	});

	it("texto vazio de um dos lados devolve 0 (nunca divide por zero)", () => {
		expect(textSimilarity("", "qualquer coisa")).toBe(0);
		expect(textSimilarity(null, undefined)).toBe(0);
	});
});
