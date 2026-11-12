import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";

const require = createRequire(import.meta.url);
const {
	_private: {
		findMovementMatch,
		mapWarehouseMovement,
		movementDestinationTechnician,
		movementQuantity,
		normalizeClientName,
		saoPauloClock,
		shiftIsoDate,
		snapshotFromRecord,
		technicianPagination,
	},
} = require("../../../backend/api/src/equipmentRecovery/equipmentRecoveryService");

function movement({ id, category = "AC", orderNumber = "", quantity = 1, technicianId = "101", technicianName = "Joao Silva" }) {
	return {
		row: {
			id,
			equipment_type: category,
			os_numero: orderNumber,
			emitido_em: "2026-09-10T12:00:00.000Z",
			registrado_por: technicianName,
			raw_payload: {
				quantidade: quantity,
				tecnicoId: technicianId,
				tecnicoNome: technicianName,
			},
		},
		quantity,
		used: 0,
		remaining() {
			return this.quantity - this.used;
		},
		consume() {
			this.used += 1;
		},
	};
}

describe("equipmentRecoveryService", () => {
	it("gera snapshot com valor vindo da configuracao de movimentacoes", () => {
		const values = new Map([
			["AX", { value: 350, productName: "ONU AX", source: "movimentacoes_produtos_config" }],
		]);
		const snapshot = snapshotFromRecord(
			{
				id: "record-1",
				hubsoft_id: "os-1",
				hubsoft_number: "123",
				source_type: "RETIRADA - OUTROS",
				source_date: "2026-09-10T12:00:00.000Z",
				source_city: "Betim",
				raw_excerpt: {
					id_tipo_ordem_servico: 1493,
					servico: "Internet 600 Mbps",
					tecnicos: [{ id: 101, name: "Joao Silva" }],
				},
			},
			values,
		);
		expect(snapshot.equipmentType).toBe("AX");
		expect(snapshot.equipmentUnitValue).toBe(350);
		expect(snapshot.equipmentValueSource).toBe("movimentacoes_produtos_config");
	});

	it("classifica usando candidatos alternativos do cliente_servico", () => {
		const values = new Map([
			["AC", { value: 240, productName: "ONU AC", source: "movimentacoes_produtos_config" }],
		]);
		const snapshot = snapshotFromRecord(
			{
				id: "record-2",
				hubsoft_id: "os-2",
				hubsoft_number: "124",
				source_type: "RETIRADA FTTH",
				source_date: "2026-09-10T12:00:00.000Z",
				source_city: "Betim",
				raw_excerpt: {
					id_tipo_ordem_servico: 1487,
					servico: "",
					numero_plano: "",
					cliente_servico: {
						plano: { descricao: "Internet Fibra 300 Mega" },
					},
					tecnicos: [{ id: 101, name: "Joao Silva" }],
				},
			},
			values,
		);
		expect(snapshot.equipmentType).toBe("AC");
		expect(snapshot.serviceSpeedMbps).toBe(300);
		expect(snapshot.serviceName).toBe("Internet Fibra 300 Mega");
	});

	it("nao reutiliza movimento alem da quantidade disponivel", () => {
		const stock = [movement({ id: "mov-1", quantity: 1 })];
		const first = findMovementMatch(
			{
				equipment_type: "AC",
				technician_id: "101",
				technician_name: "Joao Silva",
				closed_at: "2026-09-10T12:00:00.000Z",
			},
			stock,
		);
		expect(first?.confidence).toBe("CONFIRMED");
		first.item.consume();

		const second = findMovementMatch(
			{
				equipment_type: "AC",
				technician_id: "101",
				technician_name: "Joao Silva",
				closed_at: "2026-09-10T12:00:00.000Z",
			},
			stock,
		);
		expect(second).toBeNull();
	});

	it("respeita quantidade maior que 1 no movimento", () => {
		const row = { raw_payload: { quantidade: 5 } };
		expect(movementQuantity(row)).toBe(5);
	});

	it("identifica o tecnico que recebeu o equipamento pela movimentacao", () => {
		expect(movementDestinationTechnician(
			"Origem: Cliente: ANA | Destino: Técnico: JOSEVAL CAMPOS - TÉCNICO RETIRADA | Usuario: 578",
		)).toBe("JOSEVAL CAMPOS - TÉCNICO RETIRADA");
		expect(movementDestinationTechnician(
			"Origem: Cliente: ANA\nDestino: Tecnico: EDNEI CARDOSO\nUsuario: 579",
		)).toBe("EDNEI CARDOSO");
	});

	it("mapeia devolucao rejeitada e prioriza os dados da OS conciliada", () => {
		const item = mapWarehouseMovement({
			id: "mov-1",
			nota_id: "3166610",
			numero: "2461062",
			movimento_estoque_id: "2461062",
			parceiro_nome: "RENATA FERNANDES MATIAS DIAS",
			produto_nome: "ONT AX",
			serie: "ABC123",
			emitido_em: "2026-10-27T19:32:58.000Z",
			configured_value: 260,
			equipment_type: "AX",
			recovery_os_number: "014326300000123456",
			recovery_client_name: "RENATA FERNANDES",
			recovery_closed_at: "2026-10-28T12:00:00.000Z",
			raw_payload: { clientId: 353721 },
			observacao_raw: "Operacao: Retorno ao Estoque | Destino: Local de Estoque: PATROCINIO",
			status_match: "sem_match",
		});
		expect(item.custodyStatus).toBe("WAREHOUSE");
		expect(item.osNumber).toBe("014326300000123456");
		expect(item.clientName).toBe("RENATA FERNANDES");
		expect(item.custodyAt).toBe("2026-10-28T12:00:00.000Z");
		expect(item.equipmentUnitValue).toBe(260);
		expect(item.hubsoftUrl).toContain("/cliente/editar/353721/ordem_servico");
	});

	it("prioriza a conciliacao exata pelo numero da OS", () => {
		const stock = [
			movement({
				id: "mov-os-1",
				category: null,
				orderNumber: "014326300000123456",
				technicianId: "999",
				technicianName: "Outro Tecnico",
			}),
		];
		const match = findMovementMatch(
			{
				os_number: "OS 014326300000123456",
				equipment_type: "UNKNOWN",
				technician_id: "101",
				technician_name: "Joao Silva",
				closed_at: "2026-09-10T12:00:00.000Z",
			},
			stock,
		);
		expect(match?.confidence).toBe("CONFIRMED");
		expect(match?.type).toBe("ORDER_NUMBER");
		expect(match?.item.row.id).toBe("mov-os-1");
	});

	it("concilia a devolucao pelo nome do cliente quando a movimentacao nao possui OS", () => {
		const stock = [movement({ id: "mov-client-1", technicianName: "registro@sempre.net.br" })];
		stock[0].row.emitido_em = "2026-04-01T12:00:00.000Z";
		stock[0].row.parceiro_nome = "(55131) Camila Alves de Lima Fumega";
		const match = findMovementMatch(
			{
				os_number: "014326300000999999",
				equipment_type: "AC",
				technician_id: "101",
				technician_name: "Tecnico Diferente",
				closed_at: "2026-11-10T12:00:00.000Z",
				raw_snapshot: { rawExcerpt: { cliente_nome: "CAMILA ALVES DE LIMA FUMEGA" } },
			},
			stock,
		);
		expect(match?.confidence).toBe("CONFIRMED");
		expect(match?.type).toBe("CLIENT_NAME_WINDOW");
		expect(match?.item.row.id).toBe("mov-client-1");
	});

	it("normaliza prefixo de codigo e pontuacao no nome do cliente", () => {
		expect(normalizeClientName("(55131) Camila Alves de Lima Fúmega"))
			.toBe("CAMILAALVESDELIMAFUMEGA");
		expect(normalizeClientName("37834088 DEISE MARA DO NASCIMENTO MONTEIRO"))
			.toBe("DEISEMARADONASCIMENTOMONTEIRO");
	});

	it("calcula a janela diaria no calendario de Sao Paulo", () => {
		expect(shiftIsoDate("2026-10-30", -21)).toBe("2026-10-09");
		expect(saoPauloClock(new Date("2026-10-30T07:15:00.000Z"))).toEqual({
			date: "2026-10-30",
			time: "04:15",
		});
	});

	it("pagina tecnicos no backend apenas em lotes de 25, 50 ou 100", () => {
		expect(technicianPagination({})).toEqual({ page: 1, limit: 25, offset: 0 });
		expect(technicianPagination({ page: "3", limit: "50" })).toEqual({
			page: 3,
			limit: 50,
			offset: 100,
		});
		expect(technicianPagination({ page: 0, limit: 75 })).toEqual({
			page: 1,
			limit: 25,
			offset: 0,
		});
	});
});
