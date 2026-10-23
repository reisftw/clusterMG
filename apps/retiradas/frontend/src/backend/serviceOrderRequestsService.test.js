import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";

const require = createRequire(import.meta.url);
const {
	__testables: {
		applyTargetState,
		canChooseTechnician,
		findTargetTechnician,
		metadataOrderType,
		saoPauloDateParts,
		verifyFinalState,
	},
} = require(
	"../../../backend/api/src/serviceOrders/requests/serviceOrderRequestsService",
);

describe("serviceOrderRequestsService", () => {
	it("configura a O.S no estado manual solicitado", () => {
		const order = {
			id_ordem_servico: 123,
			codigo_cliente: "336813",
			agenda: { id: 8, descricao: "Agenda antiga" },
			agendamento_ordem_servico: { id_agendamento_ordem_servico: 99 },
		};
		const type = {
			id_tipo_ordem_servico: 1487,
			descricao: "CANCELAMENTO FTTH",
		};
		const technician = { id: 77, name: "JOSEVAL CAMPOS - TÉCNICO RETIRADA" };

		applyTargetState(order, type, technician, new Date("2026-10-22T15:00:00.000Z"));

		expect(order.id_tipo_ordem_servico).toBe(1487);
		expect(order.status).toBe("pendente");
		expect(order.tipo_agendamento).toBe("manual");
		expect(order.agenda).toBeNull();
		expect(order.agendamento_ordem_servico).toBeNull();
		expect(order.data_inicio_programado).toBe("2026-10-22 01:00:00");
		expect(order.data_termino_programado).toBe("2026-10-22 01:59:00");
		expect(order.duracao).toBe("00:59:00");
		expect(order.disponibilidade).toEqual([
			expect.objectContaining({ id_periodo_dia: 5, descricao: "Tarde" }),
		]);
		expect(order.tecnicos).toEqual([technician]);
	});

	it("usa o dia civil de Sao Paulo", () => {
		expect(saoPauloDateParts(new Date("2026-10-23T01:30:00.000Z"))).toEqual({
			iso: "2026-10-22",
			br: "22/10/2026",
		});
	});

	it("exige correspondencia exata e unica do tecnico", () => {
		const joseval = { id: 17, name: "JOSEVAL CAMPOS - TÉCNICO RETIRADA" };
		const metadata = {
			tecnicos: [joseval, { id: 18, name: "JOSEVAL CAMPOS - INSTALAÇÃO" }],
			usuarios: [joseval],
		};
		expect(
			findTargetTechnician(metadata, "Joseval Campos - Técnico Retirada"),
		).toBe(joseval);
		expect(() => findTargetTechnician(metadata, "Joseval Campos")).toThrow(
			"nao encontrado",
		);
	});

	it("rejeita uma confirmacao que ainda possua agenda", () => {
		const order = {
			codigo_cliente: "336813",
			id_tipo_ordem_servico: 1487,
			tipo_ordem_servico: { id_tipo_ordem_servico: 1487 },
			status: "pendente",
			tipo_agendamento: "manual",
			duracao: "00:59:00",
			tecnicos: [{ name: "JOSEVAL CAMPOS - TÉCNICO RETIRADA" }],
			agenda: { descricao: "Agenda real" },
		};
		expect(() =>
			verifyFinalState(
				order,
				"336813",
				"JOSEVAL CAMPOS - TÉCNICO RETIRADA",
			),
		).toThrow("agenda NENHUM");
	});

	it("permite seletor somente para admin e backoffice", () => {
		expect(canChooseTechnician({ role: "admin" })).toBe(true);
		expect(canChooseTechnician({ role: "backoffice" })).toBe(true);
		expect(canChooseTechnician({ role: "backoffice_retirada" })).toBe(true);
		expect(canChooseTechnician({ role: "tecnico" })).toBe(false);
	});

	it("localiza o tipo da O.S ignorando acentos e caixa", () => {
		const type = { id_tipo_ordem_servico: 1487, descricao: "CANCELAMENTO FTTH" };
		expect(
			metadataOrderType({ tipos_ordem_servico: [type] }, "cancelamento ftth"),
		).toBe(type);
	});
});
