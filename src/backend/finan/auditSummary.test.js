import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const finanRequire = createRequire(
	path.join(process.cwd(), "apps/finan/backend/package.json"),
);
const { decorateFinanAuditLog, calculateChangedFields, __testables } = finanRequire(
	"./src/audit/auditSummary.js",
);
const { buildAuditSummary, buildChangeDescriptions } = __testables;

describe("apps/finan/backend/src/audit/auditSummary", () => {
	it("resume criacao/exclusao com o nome do registro", () => {
		const created = buildAuditSummary({
			action: "create",
			entity: "finan_roles",
			user_name: "Ana",
			after_data: { name: "Financeiro" },
		});
		expect(created).toBe("Ana criou cargo/perfil Financeiro.");

		const deleted = buildAuditSummary({
			action: "delete",
			entity: "finan_users",
			user_email: "ana@sempre.net.br",
			before_data: { name: "Bruno" },
		});
		expect(deleted).toBe("ana@sempre.net.br removeu usuário Bruno.");
	});

	it("descreve alteracao de cargo/status de um usuario do Finan", () => {
		const descriptions = buildChangeDescriptions({
			entity: "finan_users",
			action: "update",
			changed_fields: ["role_id"],
			before_data: { name: "Carla", role_id: "analista" },
			after_data: { name: "Carla", role_id: "admin" },
		});
		expect(descriptions[0]).toMatch(/alterou cargo de Carla/);
	});

	it("descreve teste de integracao com o resumo padrao", () => {
		const summary = buildAuditSummary({
			action: "integration.test",
			entity: "finan_integration_configs",
			user_name: "Diego",
			record_id: "hubsoft",
		});
		expect(summary).toBe("Diego testou a conexão de integração hubsoft.");
	});

	it("cai para diff generico de campos quando nao ha regra especifica", () => {
		const descriptions = buildChangeDescriptions({
			entity: "finan_settings",
			action: "update",
			before_data: { status: "planejado" },
			after_data: { status: "ativo" },
		});
		expect(descriptions).toEqual(["alterou status de planejado para ativo"]);
	});

	it("calculateChangedFields ignora campos de sistema e mascara segredos (nao os expoe no diff)", () => {
		const fields = calculateChangedFields(
			{ status: "planejado", updated_at: "2026-01-01", clientSecret: "old" },
			{ status: "ativo", updated_at: "2026-02-02", clientSecret: "new" },
		);
		// clientSecret vira "[REDACTED]" dos dois lados (sanitizeAuditValue), entao
		// nao aparece como campo alterado — o valor real nunca eh comparado/exposto.
		expect(fields).toEqual(["status"]);
	});

	it("decorateFinanAuditLog preenche changeDescriptions e summary", () => {
		const decorated = decorateFinanAuditLog({
			id: "1",
			action: "update",
			entity: "finan_roles",
			user_name: "Ana",
			changed_fields: ["active"],
			before_data: { name: "Financeiro", active: true },
			after_data: { name: "Financeiro", active: false },
		});
		expect(decorated.changeDescriptions).toEqual(["desativou o cargo Financeiro"]);
		expect(decorated.summary).toBe("Ana desativou o cargo Financeiro.");
	});

	// Roteiro Finan #33 (Fase 4B — Linha do tempo financeira, estados
	// completos, estende #10): estados de documento (anexado, baixado,
	// fechado/reaberto) alem do create/update/delete generico.
	it("resume baixa de conta a pagar/receber (acao 'baixar', nao 'create')", () => {
		const summary = buildAuditSummary({
			action: "baixar",
			entity: "finan/contas-pagar",
			user_name: "Fabio",
		});
		expect(summary).toBe("Fabio baixou conta a pagar.");
	});

	it("resume fechamento e reabertura de periodo", () => {
		expect(
			buildAuditSummary({ action: "fechar", entity: "finan/fechamento", user_name: "Gabi" }),
		).toBe("Gabi fechou o período (fechamento do período).");
		expect(
			buildAuditSummary({ action: "reabrir", entity: "finan/fechamento", user_name: "Gabi" }),
		).toBe("Gabi reabriu o período (fechamento do período).");
	});

	it("resume anexo de documento com texto proprio ('anexou', nao 'criou')", () => {
		const summary = buildAuditSummary({
			action: "create",
			entity: "finan/anexos",
			user_name: "Helena",
			after_data: { name: "contrato-assinado.pdf" },
		});
		expect(summary).toBe("Helena anexou um documento (contrato-assinado.pdf).");
	});

	it("getEntityLabel casa por prefixo quando a entity tem o id do registro no final", () => {
		// Sub-acoes como POST /finan/contas-pagar/:id/pagar ficam com entity
		// "finan/contas-pagar" (2 segmentos, ver resolveAuditEntity em
		// app.js) — mas o teste tambem cobre o formato antigo com id
		// embutido, pra garantir que o fallback por prefixo funciona caso
		// apareca em dado historico gravado antes da correcao.
		const summary = buildAuditSummary({
			action: "baixar",
			entity: "finan/contas-pagar/cpagar_123",
			user_name: "Ivo",
		});
		expect(summary).toBe("Ivo baixou conta a pagar.");
	});
});
