import { describe, expect, it, vi } from "vitest";
import { splitPdfTextToTwoLines } from "./financeiroPdfText";

describe("financeiroPdfText", () => {
	it("quebra texto para o PDF mantendo no maximo duas linhas", () => {
		const pdf = {
			splitTextToSize: vi.fn(() => ["linha 1", "linha 2", "linha 3"]),
		};

		const result = splitPdfTextToTwoLines(pdf, "texto grande", 62);

		expect(pdf.splitTextToSize).toHaveBeenCalledWith("texto grande", 62);
		expect(result).toEqual(["linha 1", "linha 2"]);
	});

	it("usa hifen quando o texto vier vazio", () => {
		const pdf = {
			splitTextToSize: vi.fn(() => ["-"]),
		};

		expect(splitPdfTextToTwoLines(pdf, "", 20)).toEqual(["-"]);
		expect(pdf.splitTextToSize).toHaveBeenCalledWith("-", 20);
	});
});
