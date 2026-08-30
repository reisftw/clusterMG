import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const dbPath = require.resolve(path.join(process.cwd(), "vps/api/src/db.js"));
require.cache[dbPath] = {
	id: dbPath,
	filename: dbPath,
	loaded: true,
	exports: {
		getRequestContext: vi.fn(() => null),
		query: vi.fn(),
	},
};
const auditLog = require(path.join(process.cwd(), "vps/api/src/auditLog.js"));

describe("auditLog helpers", () => {
	const {
		buildAuditSummary,
		buildChangeDescriptions,
		calculateChangedFields,
		getClientIpFromRequest,
		sanitizeAuditValue,
		shouldIgnoreAuditEntity,
		shouldAuditDocument,
	} = auditLog.__testables;

	it("mascara campos sensiveis em objetos aninhados", () => {
		expect(
			sanitizeAuditValue({
				nome: "Maria",
				password: "123456",
				perfil: {
					apiToken: "abc",
					email: "maria@example.com",
				},
			}),
		).toEqual({
			nome: "Maria",
			password: "[REDACTED]",
			perfil: {
				apiToken: "[REDACTED]",
				email: "maria@example.com",
			},
		});
	});

	it("calcula somente os campos alterados depois da sanitizacao", () => {
		expect(
			calculateChangedFields(
				{ nome: "Centro", token: "antigo", valor: 10 },
				{ nome: "Centro atualizado", token: "novo", valor: 10 },
			),
		).toEqual(["nome"]);
	});

	it("ignora campos tecnicos de atualizacao no calculo de mudancas", () => {
		expect(
			calculateChangedFields(
				{ atualizado_em: "2026-08-30T01:24:39.717Z", nome: "Cargo" },
				{ atualizado_em: "2026-08-30T01:24:39.722Z", nome: "Cargo" },
			),
		).toEqual([]);
	});

	it("resume mudancas em listas grandes por item alterado", () => {
		const changes = buildChangeDescriptions({
			beforeData: {
				accounts: [{ id: "11", nome: "Receitas", status: "ativo" }],
			},
			afterData: {
				accounts: [{ id: "11", nome: "Receitas", status: "inativo" }],
			},
			changedFields: ["accounts"],
		});

		expect(changes).toEqual([
			"alterou Receitas: status de ativo para inativo",
		]);
	});

	it("gera resumo humano da acao feita pelo usuario", () => {
		expect(
			buildAuditSummary({
				action: "create",
				entity: "app_roles",
				userName: "Rodrigo",
				afterData: { name: "Financeiro" },
			}),
		).toBe("Rodrigo criou cargo Financeiro.");
	});

	it("resume limpeza de relatorio financeiro como acao humana", () => {
		const row = {
			action: "update",
			entity: "financeiro_reports",
			recordId: "serasa",
			userName: "Rodrigo",
			beforeData: { clientes: 6825 },
			afterData: { clientes: 0, importInfo: { cleared: true } },
			changedFields: ["clientes", "importInfo"],
		};

		expect(buildAuditSummary(row)).toBe("Rodrigo apagou dados do Serasa.");
		expect(buildChangeDescriptions(row)).toEqual(["apagou dados do Serasa"]);
	});

	it("resume alteracao de cargo de usuario sem expor campo tecnico", () => {
		const row = {
			action: "update",
			entity: "app_users",
			userName: "Rodrigo",
			beforeData: { nome: "Maria", role: "atendimento" },
			afterData: { nome: "Maria", role: "financeiro" },
			changedFields: ["role", "empresaId"],
		};

		expect(buildAuditSummary(row)).toBe(
			"Rodrigo alterou cargo de Maria de atendimento para financeiro.",
		);
		expect(buildChangeDescriptions(row)).toEqual([
			"alterou cargo de Maria de atendimento para financeiro",
		]);
	});

	it("resume troca de nome de usuario como acao legivel", () => {
		const row = {
			action: "update",
			entity: "app_users",
			userName: "Rodrigo",
			beforeData: { nome: "Maria Souza", role: "atendimento" },
			afterData: { nome: "Maria Silva", role: "atendimento" },
			changedFields: ["nome"],
		};

		expect(buildAuditSummary(row)).toBe(
			"Rodrigo alterou nome do usuário de Maria Souza para Maria Silva.",
		);
	});

	it("resume alteracao de permissoes de cargo sem listar json tecnico", () => {
		const row = {
			action: "update",
			entity: "app_roles",
			userName: "Rodrigo",
			beforeData: { name: "Financeiro", permissions: ["financeiro.read"] },
			afterData: {
				name: "Financeiro",
				permissions: ["financeiro.read", "financeiro.manage"],
			},
			changedFields: ["permissions"],
		};

		expect(buildAuditSummary(row)).toBe(
			"Rodrigo alterou permissões do cargo Financeiro.",
		);
		expect(buildChangeDescriptions(row)).toEqual([
			"alterou permissões do cargo Financeiro",
		]);
	});

	it("usa o primeiro IP do x-forwarded-for", () => {
		const req = {
			get: (header) =>
				header === "x-forwarded-for" ? "10.0.0.1, 10.0.0.2" : "",
			ip: "127.0.0.1",
		};

		expect(getClientIpFromRequest(req)).toBe("10.0.0.1");
	});

	it("ignora colecoes internas e audita colecoes de negocio", () => {
		expect(shouldAuditDocument("audit_logs")).toBe(false);
		expect(shouldAuditDocument("password_reset_tokens")).toBe(false);
		expect(shouldAuditDocument("email_logs")).toBe(false);
		expect(shouldAuditDocument("integracoes_api")).toBe(false);
		expect(shouldAuditDocument("api_runtime_events")).toBe(false);
		expect(shouldAuditDocument("system_notifications")).toBe(false);
		expect(shouldAuditDocument("tecnicos_bolsa_auditoria_config")).toBe(false);
		expect(shouldAuditDocument("tecnicos_bolsa_auditoria_jobs")).toBe(false);
		expect(shouldAuditDocument("tecnicos_bolsa_auditoria_movements")).toBe(false);
		expect(shouldAuditDocument("tecnicos_bolsa_auditoria_snapshots")).toBe(false);
		expect(shouldAuditDocument("financeiro_config")).toBe(true);
	});

	it("identifica entidades internas que nao devem aparecer na listagem", () => {
		expect(shouldIgnoreAuditEntity("tecnicos_bolsa_auditoria_movements")).toBe(
			true,
		);
		expect(shouldIgnoreAuditEntity("system_email_logs")).toBe(true);
		expect(shouldIgnoreAuditEntity("app_users")).toBe(false);
		expect(shouldIgnoreAuditEntity("financeiro_config")).toBe(false);
	});
});
