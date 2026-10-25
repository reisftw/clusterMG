import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(
	path.join(process.cwd(), "apps/retiradas/backend/package.json"),
);

process.env.PGHOST ||= "127.0.0.1";
process.env.PGUSER ||= "test";
process.env.PGPASSWORD ||= "test";
process.env.PGDATABASE ||= "test";

const { DEFAULT_SETTINGS, __testables } = require(
	path.join(
		process.cwd(),
		"apps/retiradas/backend/api/src/tentativas/tentativasAlertsService.js",
	),
);

describe("tentativasAlertsService schedule", () => {
	it("gera a faixa das 08h em uma segunda-feira no horário de São Paulo", () => {
		const slot = __testables.scheduleBucket(
			DEFAULT_SETTINGS,
			new Date("2026-10-26T11:00:00.000Z"),
		);
		expect(slot).toMatchObject({ date: "2026-10-26", time: "08:00", weekday: 1, bucket: 0 });
	});

	it("não agenda alerta no sábado", () => {
		expect(
			__testables.scheduleBucket(
				DEFAULT_SETTINGS,
				new Date("2026-10-24T14:00:00.000Z"),
			),
		).toBeNull();
	});

	it("respeita intervalo configurável durante o expediente", () => {
		const slot = __testables.scheduleBucket(
			{ ...DEFAULT_SETTINGS, intervalMinutes: 30 },
			new Date("2026-10-26T12:31:00.000Z"),
		);
		expect(slot).toMatchObject({ time: "09:31", interval: 30, bucket: 3 });
	});
});
