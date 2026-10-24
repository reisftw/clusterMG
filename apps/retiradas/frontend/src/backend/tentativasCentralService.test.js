import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));

process.env.PGHOST ||= "127.0.0.1";
process.env.PGUSER ||= "test";
process.env.PGPASSWORD ||= "test";
process.env.PGDATABASE ||= "test";

const { __testables } = require(
	path.join(process.cwd(), "apps/retiradas/backend/api/src/tentativas/tentativasCentralService.js"),
);

describe("Central inteligente de Tentativas", () => {
	it("prioriza ordens novas e explica cada contribuicao", () => {
		const recent = __testables.calculatePriorityScore(
			{
				os_age_days: 2,
				equipment_count: 3,
				attempt_count: 0,
				last_attempt_at: null,
				callback_due: false,
			},
			{ osAge: 25, equipment: 20, attemptHistory: 15, responseHistory: 15, pendingCallback: 15, timeWithoutContact: 10 },
		);
		const old = __testables.calculatePriorityScore({
			os_age_days: 75,
			equipment_count: 3,
			attempt_count: 0,
			last_attempt_at: null,
			callback_due: false,
		});

		expect(recent.score).toBeGreaterThan(old.score);
		expect(recent.factors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "osAge", label: "Recencia da O.S." }),
				expect.objectContaining({ key: "equipment" }),
			]),
		);
		expect(recent.recommendedAction).toContain("primeiro contato");
	});

	it("prioriza retorno vencido sem inventar probabilidade", () => {
		const result = __testables.calculatePriorityScore({
			os_age_days: 2,
			equipment_count: 1,
			attempt_count: 1,
			callback_due: true,
		});

		expect(result.priority).toBe("RETORNO_AGENDADO");
		expect(result.recommendedAction).toBe("Realizar o retorno combinado");
		expect(result).not.toHaveProperty("probability");
	});

	it("aceita somente transições previstas da recuperação", () => {
		expect(
			__testables.assertRecoveryTransition("AWAITING_CONFIRMATION", "RECOVERY_CONFIRMED"),
		).toBe(true);
		expect(() =>
			__testables.assertRecoveryTransition("RECOVERY_CONFIRMED", "AWAITING_EXECUTION"),
		).toThrow(/Transicao de recuperacao invalida/);
	});

	it("mantém estados finais sem transições silenciosas", () => {
		expect(__testables.RECOVERY_TRANSITIONS.RECOVERY_CONFIRMED).toEqual([]);
		expect(__testables.RECOVERY_TRANSITIONS.AWAITING_EXECUTION).toContain("AWAITING_CONFIRMATION");
	});

	it("normaliza MAC e serial antes da proteção global contra duplicidade", () => {
		expect(__testables.normalizeEquipmentIdentifier("54:4b:54-36.61 d8")).toBe("544B543661D8");
		expect(__testables.normalizeEquipmentIdentifier("  sn 001/abc ")).toBe("SN001ABC");
	});
});
