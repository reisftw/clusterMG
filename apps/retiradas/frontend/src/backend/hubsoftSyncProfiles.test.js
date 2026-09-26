import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

process.env.PGPASSWORD ||= "test";

const require = createRequire(import.meta.url);
const { classifyOrder } = require("../../../backend/api/src/hubsoftClassification");

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
