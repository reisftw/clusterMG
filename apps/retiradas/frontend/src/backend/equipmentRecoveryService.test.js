import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";

const require = createRequire(import.meta.url);
const {
	_private: { findMovementMatch, movementQuantity, snapshotFromRecord },
} = require("../../../backend/api/src/equipmentRecovery/equipmentRecoveryService");

function movement({ id, category = "AC", quantity = 1, technicianId = "101", technicianName = "Joao Silva" }) {
	return {
		row: {
			id,
			equipment_type: category,
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
});
