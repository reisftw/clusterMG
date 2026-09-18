import { describe, expect, it } from "vitest";
import {
	buildAcertoPreviewMessage,
	buildDashboardMetrics,
} from "./acertoEstoqueUtils";

describe("acertoEstoqueUtils", () => {
	it("monta a mensagem padrao do acerto", () => {
		const message = buildAcertoPreviewMessage({
			codigo: "ACE-20260511-ABC123",
			dataAcerto: "2026-05-11",
			cidade: "Sarzedo",
			tecnicoNome: "Joao",
			tecnicoEmail: "joao@example.com",
			empresaNome: "Brumas Telecom",
			responsavel: "Luan Alisson",
			itens: [{ nome: "ONT", quantidade: 2, unidade: "un" }],
		});

		expect(message).toContain("Codigo: ACE-20260511-ABC123");
		expect(message).toContain("Cidade: Sarzedo");
		expect(message).toContain("E-mail tecnico: joao@example.com");
		expect(message).toContain("- ONT: 2 un");
	});

	it("consolida os indicadores da dashboard", () => {
		const metrics = buildDashboardMetrics({
			empresas: [{ id: "emp-1", nome: "Brumas Telecom" }],
			tecnicos: [{ id: "tec-1", empresaId: "emp-1" }],
			produtos: [{ id: "prd-1", nome: "ONT" }],
			acertos: [
				{
					id: "act-1",
					empresaId: "emp-1",
					cidade: "Sarzedo",
					dataAcerto: new Date().toISOString().slice(0, 10),
				},
			],
		});

		expect(metrics.totals.empresas).toBe(1);
		expect(metrics.totals.tecnicos).toBe(1);
		expect(metrics.porEmpresa[0].totalAcertos).toBe(1);
		expect(metrics.porCidade[0]).toEqual({ cidade: "Sarzedo", total: 1 });
	});
});
