import { describe, expect, it } from "vitest";
import { normalizeMetasBaseConfig } from "../constants/metasBaseConfig";
import {
	buildManualMetasRecord,
	combineMetasRecords,
	MANUAL_META_SOURCES,
	parseDailyMetaValues,
} from "./manualMetasBuilder";

describe("manualMetasBuilder", () => {
	it("converte lancamentos diarios digitados em numeros do mes", () => {
		expect(parseDailyMetaValues("1 2;3|4", 5)).toEqual([1, 2, 3, 4, 0]);
	});

	it("monta payload manual da Sempre no mesmo shape das metas importadas", () => {
		const record = buildManualMetasRecord({
			month: "Agosto",
			source: MANUAL_META_SOURCES.SEMPRE,
			year: 2026,
			baseConfig: normalizeMetasBaseConfig(),
			cancelamentos: 100,
			tecnicos: [{ name: "Tecnico A", dailyText: "2 3" }],
			regionais: [{ name: "Regional A", dailyText: "4 1" }],
			agentes: [{ cidade: "Cidade A", cancelamentos: 10, dailyText: "1 1" }],
			loja: { dailyText: "5 0" },
			feriadosSet: new Set(),
		});

		expect(record.meta).toBe(90);
		expect(record.totalOS).toBe(17);
		expect(record.technicians[0].total).toBe(5);
		expect(record.regionais[0].total).toBe(5);
		expect(record.agenteTotal).toBe(2);
		expect(record.lojaTotal).toBe(5);
		expect(record.rawDays).toEqual([
			expect.objectContaining({ dia: 1, totalDia: 12 }),
			expect.objectContaining({ dia: 2, totalDia: 5 }),
		]);
		expect(record.agentesData[0]).toEqual(
			expect.objectContaining({ cidade: "Cidade A", total: 2 }),
		);
	});

	it("combina Sempre e Onnet para alimentar o consolidado dos paineis", () => {
		const baseConfig = normalizeMetasBaseConfig();
		const sempre = buildManualMetasRecord({
			month: "Agosto",
			source: MANUAL_META_SOURCES.SEMPRE,
			year: 2026,
			baseConfig,
			cancelamentos: 100,
			tecnicos: [{ name: "Sempre A", dailyText: "2" }],
			regionais: [],
			agentes: [],
			loja: {},
			feriadosSet: new Set(),
		});
		const onnet = buildManualMetasRecord({
			month: "Agosto",
			source: MANUAL_META_SOURCES.ONNET,
			year: 2026,
			baseConfig,
			cancelamentos: 50,
			tecnicos: [{ name: "Onnet A", dailyText: "3" }],
			regionais: [],
			agentes: [],
			loja: {},
			feriadosSet: new Set(),
		});

		const combined = combineMetasRecords(sempre, onnet, "Agosto", {
			year: 2026,
			feriadosSet: new Set(),
		});

		expect(combined.origem).toBe("ONNET + SEMPRE");
		expect(combined.meta).toBe(sempre.meta + onnet.meta);
		expect(combined.totalOS).toBe(5);
		expect(combined.rawDays[0]).toEqual(
			expect.objectContaining({ dia: 1, equipe: 5, totalDia: 5 }),
		);
		expect(combined.technicians.map((item) => item.name)).toEqual([
			"Onnet A",
			"Sempre A",
		]);
	});

	it("salva entrega em loja de agente sem somar na meta operacional", () => {
		const record = buildManualMetasRecord({
			month: "Setembro",
			source: MANUAL_META_SOURCES.SEMPRE,
			year: 2026,
			baseConfig: normalizeMetasBaseConfig(),
			cancelamentos: 100,
			tecnicos: [],
			regionais: [],
			agentes: [{ cidade: "Cidade A", cancelamentos: 20, meta: 16, daily: [2] }],
			agentesLoja: [{ cidade: "Cidade A", daily: [5, 3] }],
			loja: {},
			feriadosSet: new Set(),
		});

		expect(record.totalOS).toBe(2);
		expect(record.agenteTotal).toBe(2);
		expect(record.rawDays).toEqual([
			expect.objectContaining({ dia: 1, agente: 2, totalDia: 2 }),
		]);
		expect(record.agentesData[0]).toEqual(
			expect.objectContaining({
				cidade: "Cidade A",
				total: 2,
				lojaAgentesTotal: 8,
				lojaAgentesDaily: expect.arrayContaining([5, 3]),
			}),
		);
	});
});
