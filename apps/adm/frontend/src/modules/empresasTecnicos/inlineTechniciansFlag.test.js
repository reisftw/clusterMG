import { parseInlineCompanyTechniciansFlag } from "./inlineTechniciansFlag";

describe("parseInlineCompanyTechniciansFlag", () => {
	it("retorna false quando a flag esta ausente (undefined)", () => {
		expect(parseInlineCompanyTechniciansFlag(undefined)).toBe(false);
	});

	it('retorna false quando a flag e explicitamente "false"', () => {
		expect(parseInlineCompanyTechniciansFlag("false")).toBe(false);
	});

	it('retorna true quando a flag e "true"', () => {
		expect(parseInlineCompanyTechniciansFlag("true")).toBe(true);
	});

	it('aceita "TRUE"/"True" (case-insensitive) e espacos extras', () => {
		expect(parseInlineCompanyTechniciansFlag("TRUE")).toBe(true);
		expect(parseInlineCompanyTechniciansFlag("  true  ")).toBe(true);
	});

	it("retorna false para qualquer valor invalido/inesperado", () => {
		expect(parseInlineCompanyTechniciansFlag("1")).toBe(false);
		expect(parseInlineCompanyTechniciansFlag("yes")).toBe(false);
		expect(parseInlineCompanyTechniciansFlag("")).toBe(false);
		expect(parseInlineCompanyTechniciansFlag(null)).toBe(false);
	});
});
