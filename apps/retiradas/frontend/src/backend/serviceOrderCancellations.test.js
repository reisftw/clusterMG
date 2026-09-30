import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

process.env.PGPASSWORD ||= "test";

const require = createRequire(import.meta.url);
const service = require(
	"../../../backend/api/src/serviceOrders/cancellations/serviceOrderCancellationsService",
);

describe("serviceOrderCancellationsService", () => {
	it("classifica fibra e ftth como FTTH sem filtrar na origem", () => {
		expect(service._normalizeTechnology({ tecnologia: "FIBRA" })).toMatchObject({
			classification: "FTTH",
		});
		expect(service._normalizeTechnology({ tecnologia: "FIBRA ÓPTICA" })).toMatchObject({
			classification: "FTTH",
		});
		expect(service._normalizeTechnology({ servico: "Combo FTTH 600MB" })).toMatchObject({
			classification: "FTTH",
		});
		expect(service._normalizeTechnology({ tecnologia: "WIRELESS" })).toMatchObject({
			classification: "NAO_FTTH",
		});
	});

	it("normaliza empresa sem depender do nome do cliente", () => {
		expect(
			service._normalizeCompany({
				grupo_servico: "ONNET UDI, URA - ONNET UBERLANDIA",
				"RAZÃO SOCIAL": "Cliente qualquer",
			}),
		).toMatchObject({ normalized: "ONNET" });
		expect(
			service._normalizeCompany({
				forma_cobranca: "SEMPRE | SICOOB",
				"RAZÃO SOCIAL": "ONNET no nome do cliente nao deveria mandar",
			}),
		).toMatchObject({ normalized: "SEMPRE" });
	});

	it("mantem competencia mensal valida", () => {
		expect(service._parseCompetencia("2026-09")).toBe("2026-09");
		expect(service._parseCompetencia("2026-9")).toMatch(/^\d{4}-\d{2}$/);
	});

	it("interpreta campos do relatorio interno do HubSoft", () => {
		expect(service._parseDate("01/09/2026")).toBe("2026-09-01");
		expect(service._parseNumber("R$ 65,50")).toBe(65.5);
		expect(
			service._rowBelongsToCancellationScope(
				{
					data_cancelamento: "01/09/2026",
					servico_status: "Cancelado",
					gera_grafico: "TRUE",
					tipo: "VAREJO",
				},
				"2026-09",
			),
		).toBe(true);
		expect(
			service._rowBelongsToCancellationScope(
				{
					data_cancelamento: "01/09/2026",
					servico_status: "Cancelado",
					churn: "N",
					tipo: "V",
				},
				"2026-09",
			),
		).toBe(false);
	});
});
