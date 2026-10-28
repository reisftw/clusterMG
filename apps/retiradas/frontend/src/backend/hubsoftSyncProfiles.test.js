import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

process.env.PGPASSWORD ||= "test";

const require = createRequire(import.meta.url);
const { classifyOrder } = require("../../../backend/api/src/hubsoftClassification");
const { __testables } = require("../../../backend/api/src/hubsoftSyncProfiles");

function maps() {
	return {
		techById: new Map([
			[
				4078,
				{
					hubsoft_technician_id: 4078,
					nome_hubsoft: "PAULO XAVIER - TÉCNICO RETIRADA",
					nome_exibicao: "Paulo Xavier",
				},
			],
		]),
		agentsByCity: new Map([
			["BOM DESPACHO", { ownerId: "aa-1", cidade: "Bom Despacho" }],
			["AGUANIL", { ownerId: "aa-2", cidade: "Aguanil" }],
		]),
		regionalsByCity: new Map([
			["BOM DESPACHO", { regionalId: "central", regional: "CENTRAL MINEIRA" }],
			["OLIVEIRA", { regionalId: "centro", regional: "CENTRO OESTE" }],
			["BELO HORIZONTE", { regionalId: "sub1", regional: "METROPOLITANA SUB1" }],
		]),
		duplicateRegionalCities: new Map([
			[
				"BELO HORIZONTE",
				[
					{ regionalId: "sub1", regional: "METROPOLITANA SUB1" },
					{ regionalId: "bh", regional: "REGIONAL CLUSTER BH" },
				],
			],
		]),
	};
}

function row({ city, technicians = [] }) {
	return {
		tecnicos: technicians,
		cliente_servico: {
			endereco_instalacao: {
				endereco_numero: {
					cidade: { nome: city },
				},
			},
		},
	};
}

describe("hubsoft classification", () => {
	it("prioriza tecnico de retirada mesmo em cidade de agente", () => {
		const result = classifyOrder(
			row({
				city: "Bom Despacho",
				technicians: [{ id: 4078, name: "PAULO XAVIER - TÉCNICO RETIRADA" }],
			}),
			maps(),
		);
		expect(result.production_channel).toBe("RETIRADA");
		expect(result.classification_rule).toBe("WITHDRAWAL_TECHNICIAN_ID");
	});

	it("classifica cidade AA antes de regional", () => {
		const result = classifyOrder(row({ city: "Bom Despacho" }), maps());
		expect(result.production_channel).toBe("AA");
		expect(result.classification_rule).toBe("AUTHORIZED_AGENT_CITY");
	});

	it("classifica cidade regional quando nao e tecnico nem AA", () => {
		const result = classifyOrder(row({ city: "Oliveira" }), maps());
		expect(result.production_channel).toBe("REGIONAL");
		expect(result.classification_rule).toBe("REGIONAL_CITY");
	});

	it("nao escolhe Belo Horizonte silenciosamente quando ha regional duplicada", () => {
		const result = classifyOrder(row({ city: "Belo Horizonte" }), maps());
		expect(result.production_channel).toBe("UNCLASSIFIED");
		expect(result.classification_reason).toBe("REGIONAL_AMBIGUOUS");
	});

	it("marca cidade sem cadastro como nao classificada", () => {
		const result = classifyOrder(row({ city: "Cidade Sem Cadastro" }), maps());
		expect(result.production_channel).toBe("UNCLASSIFIED");
		expect(result.classification_reason).toBe("CITY_NOT_FOUND");
	});
});

describe("hubsoft fines automation", () => {
	it("consulta multa por data de cadastro sem limitar status", () => {
		const payload = __testables.finesPayload({ date: "2026-10-27" });
		expect(payload).toMatchObject({
			data_inicio: "2026-10-27",
			data_fim: "2026-10-27",
			tipo_data: "data_cadastro",
			order_by: "data_cadastro",
			tipo_endereco: { valor: "instalacao" },
		});
		expect(payload.tipo_atendimento).toEqual([
			{
				id_tipo_atendimento: 944,
				descricao: "MULTA - EQUIPAMENTO",
			},
		]);
		expect(payload).not.toHaveProperty("status_atendimento");
		expect(payload).not.toHaveProperty("status_fechamento");
	});

	it("usa intervalo horario por padrao", () => {
		expect(__testables.normalizeAutomationConfig({})).toMatchObject({
			autoFinesEnabled: true,
			autoFinesIntervalMinutes: 60,
		});
	});

	it("limita a rotina horaria de multas ao dia atual", () => {
		const options = __testables.finesSchedulerOptions("2026-10-28");
		expect(options).toEqual({
			date: "2026-10-28",
			skipFineFinanceEnrichment: true,
		});
		expect(options).not.toHaveProperty("startDate");
		expect(options).not.toHaveProperty("endDate");
	});

	it("prioriza a data de cadastro da multa", () => {
		expect(
			__testables.extractFineRegistrationDate({
				data_cadastro: "27/10/2026 08:22",
				data_fechamento: "28/10/2026 09:00",
			}),
		).toBe("27/10/2026 08:22");
	});
});
