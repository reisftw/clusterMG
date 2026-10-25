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

	it("trata divisões por zero sem fabricar conversão", () => {
		expect(__testables.safeRate(10, 0)).toBe(0);
		expect(__testables.safeRate(3, 4)).toBe(75);
	});

	it("mantém o funil sequencial com a mesma unidade-base", () => {
		const funnel = __testables.buildSequentialFunnel({
			population: 100,
			worked: 80,
			effective: 90,
			scheduled: 40,
			completed: 50,
		});

		expect(funnel.map((stage) => stage.value)).toEqual([100, 80, 80, 40, 40]);
		expect(funnel[1]).toMatchObject({ fromPreviousRate: 80, fromPopulationRate: 80 });
		expect(funnel[4]).toMatchObject({ fromPreviousRate: 100, fromPopulationRate: 40 });
	});

	it("retorna funil zerado em períodos sem dados", () => {
		const funnel = __testables.buildSequentialFunnel({});
		expect(funnel.every((stage) => stage.value === 0)).toBe(true);
		expect(funnel.slice(1).every((stage) => stage.fromPreviousRate === 0)).toBe(true);
	});

	it("declara somente os parâmetros usados no escopo de recuperações", () => {
		expect(__testables.recoveryListScopeParams({ id: "tecnico-1", roles: ["tecnico"] })).toEqual([
			false,
			"tecnico-1",
		]);
	});
});
