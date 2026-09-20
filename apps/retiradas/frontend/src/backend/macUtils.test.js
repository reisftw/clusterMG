// Testes do normalizador canônico de MAC (Fase E — docs/TECHNICAL-AUDIT.md,
// achado #2). vps/api/src/macUtils.js.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));
const { normalizeMac, isValidMac, formatMac } = require(
	path.join(process.cwd(), "apps/retiradas/backend/api/src/macUtils.js"),
);

describe("macUtils", () => {
	describe("normalizeMac", () => {
		it("mesmo MAC em formatos diferentes normaliza pro mesmo valor canônico", () => {
			const canonical = "AABBCCDDEEFF";
			expect(normalizeMac("AA:BB:CC:DD:EE:FF")).toBe(canonical);
			expect(normalizeMac("aa:bb:cc:dd:ee:ff")).toBe(canonical);
			expect(normalizeMac("aabbccddeeff")).toBe(canonical);
			expect(normalizeMac("AA-BB-CC-DD-EE-FF")).toBe(canonical);
		});

		it("valor vazio/nulo/indefinido normaliza pra string vazia", () => {
			expect(normalizeMac("")).toBe("");
			expect(normalizeMac(null)).toBe("");
			expect(normalizeMac(undefined)).toBe("");
		});

		it("descarta separadores e espaços, mantendo só os hex", () => {
			expect(normalizeMac("  AA:BB:CC:DD:EE:FF  ")).toBe("AABBCCDDEEFF");
			expect(normalizeMac("AA BB CC DD EE FF")).toBe("AABBCCDDEEFF");
		});
	});

	describe("isValidMac", () => {
		it("aceita MAC com 12 hex válidos", () => {
			expect(isValidMac("AABBCCDDEEFF")).toBe(true);
			expect(isValidMac("aa:bb:cc:dd:ee:ff")).toBe(true);
		});

		it("rejeita string curta/longa demais", () => {
			expect(isValidMac("AA")).toBe(false);
			expect(isValidMac("AABBCCDDEEFF00")).toBe(false);
		});

		it("rejeita o placeholder FFFFFFFFFFFF (nao e um MAC real de equipamento)", () => {
			expect(isValidMac("FF:FF:FF:FF:FF:FF")).toBe(false);
		});

		it("rejeita texto que não é MAC", () => {
			expect(isValidMac("nao e um mac")).toBe(false);
			expect(isValidMac("")).toBe(false);
		});
	});

	describe("formatMac", () => {
		it("formata com separador ':' a partir de qualquer formato de entrada", () => {
			expect(formatMac("aabbccddeeff")).toBe("AA:BB:CC:DD:EE:FF");
		});

		it("devolve vazio para MAC inválido", () => {
			expect(formatMac("abc")).toBe("");
		});
	});
});
