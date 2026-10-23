import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";

const require = createRequire(import.meta.url);
const {
	ALLOWED_ORDER_TYPES,
	__testables: {
		dedupeEquipment,
		equipmentTypeLabel,
		mapFallbackEquipment,
		normalize,
		parseTechnician,
	},
} = require(
	"../../../backend/api/src/serviceOrders/returnReceipts/returnReceiptsService",
);
const { generateReturnReceiptPdf, isOnnet, safeFilename } = require(
	"../../../backend/api/src/serviceOrders/returnReceipts/returnReceiptPdf",
);

describe("returnReceiptsService", () => {
	it("restringe comprovantes aos tipos de retirada aceitos", () => {
		expect(ALLOWED_ORDER_TYPES).toContain("RETIRADA FTTH");
		expect(ALLOWED_ORDER_TYPES).toContain("CANCELAMENTO LOJA");
		expect(ALLOWED_ORDER_TYPES).not.toContain("INSTALAÇÃO");
		expect(ALLOWED_ORDER_TYPES).not.toContain("SUPORTE");
	});

	it("normaliza nomes e identifica o tecnico responsavel", () => {
		expect(normalize("João Eziquiel - Técnico Retirada")).toBe(
			"JOAOEZIQUIELTECNICORETIRADA",
		);
		expect(
			parseTechnician({
				tecnicos: [{ id: 10, name: "JOSEVAL CAMPOS - TÉCNICO RETIRADA" }],
			}),
		).toBe("JOSEVAL CAMPOS - TÉCNICO RETIRADA");
	});

	it("mantem equipamentos distintos no mesmo movimento", () => {
		const rows = [
			{ id: "1", produto_nome: "ONT", serie: "AAA" },
			{ id: "2", produto_nome: "Roteador", serie: "BBB" },
		];
		expect(dedupeEquipment(rows)).toEqual([
			expect.objectContaining({ id: "1", productName: "ONT", serial: "AAA" }),
			expect.objectContaining({ id: "2", productName: "Roteador", serial: "BBB" }),
		]);
	});

	it("identifica o equipamento pela O.S quando nao ha movimentacao", () => {
		expect(equipmentTypeLabel("AX")).toBe("Equipamento AX");
		expect(
			mapFallbackEquipment({
				id: "service-order-1",
				type: "AC",
				source: "ORDEM_SERVICO",
				sourceLabel: "Dados da O.S",
			}),
		).toEqual(
			expect.objectContaining({
				productName: "Equipamento AC",
				serial: "",
				source: "ORDEM_SERVICO",
			}),
		);
	});

	it("gera PDF A4 de uma pagina com identificacao imutavel", async () => {
		const pdf = await generateReturnReceiptPdf({
			receiptId: "receipt-test",
			clientCode: "336813",
			clientName: "MARIA APARECIDA DA SILVA",
			serviceOrderNumber: "014326296124722856",
			serviceOrderType: "RETIRADA FTTH",
			company: "SEMPRE",
			technicianName: "JOSEVAL CAMPOS - TÉCNICO RETIRADA",
			completedAt: "2026-10-23T15:00:00.000Z",
			generatedAt: "2026-10-23T16:00:00.000Z",
			equipment: [
				{ productName: "ONT AX3000", serial: "F4E84F934AAC" },
			],
		});
		const source = pdf.toString("latin1");
		expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
		expect(source.match(/\/Type \/Page\b/g)).toHaveLength(1);
		expect(pdf.length).toBeGreaterThan(5_000);
	});

	it("seleciona marca Onnet e cria nome de arquivo seguro", () => {
		expect(isOnnet("ONNET TELECOMUNICAÇÕES LTDA")).toBe(true);
		expect(safeFilename("João da Silva / teste")).toBe(
			"Comprovante-de-devolucao-Joao-da-Silva-teste.pdf",
		);
	});
});
