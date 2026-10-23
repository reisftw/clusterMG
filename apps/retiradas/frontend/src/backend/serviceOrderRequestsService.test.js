import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";

const require = createRequire(import.meta.url);
const {
	__testables: {
		applyTargetState,
		canChooseTechnician,
		clientOrdersUrl,
		findTargetTechnician,
		isAllowedSourceOrderType,
		metadataOrderType,
		orderTypeName,
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
		expect(order.ordem_servico_tecnico).toEqual([
			expect.objectContaining({ id_usuario: 77, usuario: technician }),
		]);
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

	it("aceita resposta sem tipo textual quando o HubSoft omite o campo manual", () => {
		const order = {
			codigo_cliente: "336813",
			id_tipo_ordem_servico: 1487,
			tipo_ordem_servico: { id_tipo_ordem_servico: 1487 },
			status: "pendente",
			duracao: "00:59:00",
			tecnicos: [{ name: "JOSEVAL CAMPOS - TÉCNICO RETIRADA" }],
		};
		expect(() =>
			verifyFinalState(
				order,
				"336813",
				"JOSEVAL CAMPOS - TÉCNICO RETIRADA",
			),
		).not.toThrow();
	});

	it("monta o link da aba de ordens pelo id interno do cliente", () => {
		expect(
			clientOrdersUrl({
				cliente_servico: { cliente: { id_cliente: 607893 } },
			}),
		).toBe(
			"https://sempre.hubsoft.com.br/cliente/editar/607893/ordem_servico",
		);
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

	it.each([
		"Retirada FTTH",
		"Retirada - Outros",
		"Cancelamento FTTH",
		"Cancelamento - Outros",
		"Cancelamento & Retirada - Segunda tentativa",
		"Cancelamento Loja",
	])("permite somente o tipo de retirada %s", (type) => {
		expect(isAllowedSourceOrderType(type)).toBe(true);
	});

	it.each([
		"Instalacao FTTH",
		"Suporte FTTH",
		"Mudanca de endereco",
		"Liberacao de portas",
		"Retirada preventiva",
	])("bloqueia o tipo de O.S nao autorizado %s", (type) => {
		expect(isAllowedSourceOrderType(type)).toBe(false);
	});

	it("le o tipo tanto do objeto do HubSoft quanto do snapshot local", () => {
		expect(
			orderTypeName({
				tipo_ordem_servico: { descricao: "RETIRADA FTTH" },
			}),
		).toBe("RETIRADA FTTH");
		expect(orderTypeName({ tipo: "CANCELAMENTO LOJA" })).toBe(
			"CANCELAMENTO LOJA",
		);
	});
});
