import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));
const { buildDateWindows } = require("./api/src/movimentacoesDateWindows.js");

describe("movimentacoesDateWindows", () => {
	it("quebra um periodo de 45 dias em janelas de 15 dias (3 janelas)", () => {
		const start = new Date("2026-01-01T00:00:00.000Z");
		const end = new Date("2026-02-14T00:00:00.000Z");

		const janelas = buildDateWindows(start, end, 15);

		expect(janelas).toHaveLength(3);
		expect(janelas[0].start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
		expect(janelas[0].end.toISOString()).toBe("2026-01-15T23:59:59.999Z");
		expect(janelas[1].start.toISOString()).toBe("2026-01-16T00:00:00.000Z");
		expect(janelas[2].end.toISOString()).toBe("2026-02-14T00:00:00.000Z");
	});

	it("um periodo menor que a janela vira uma janela so", () => {
		const start = new Date("2026-03-01T00:00:00.000Z");
		const end = new Date("2026-03-05T00:00:00.000Z");

		const janelas = buildDateWindows(start, end, 15);

		expect(janelas).toHaveLength(1);
		expect(janelas[0].start).toEqual(start);
		expect(janelas[0].end).toEqual(end);
	});

	it("as janelas nunca se sobrepoem", () => {
		const start = new Date("2026-01-01T00:00:00.000Z");
		const end = new Date("2026-06-30T00:00:00.000Z");

		const janelas = buildDateWindows(start, end, 15);

		for (let i = 1; i < janelas.length; i += 1) {
			expect(janelas[i].start.getTime()).toBe(janelas[i - 1].end.getTime() + 1);
		}
	});
});
