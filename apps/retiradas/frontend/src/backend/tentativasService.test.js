import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(
	path.join(process.cwd(), "apps/retiradas/backend/package.json"),
);

process.env.PGHOST ||= "127.0.0.1";
process.env.PGUSER ||= "test";
process.env.PGPASSWORD ||= "test";
process.env.PGDATABASE ||= "test";

const { __testables } = require(
	path.join(
		process.cwd(),
		"apps/retiradas/backend/api/src/tentativas/tentativasService.js",
	),
);

describe("tentativasService helpers", () => {
	it("normaliza telefones brasileiros para link do WhatsApp", () => {
		expect(__testables.normalizePhone("(37) 99826-7983")).toMatchObject({
			digits: "5537998267983",
			display: "5537998267983",
			valid: true,
		});
	});

	it("mantem telefone invalido identificado antes de abrir WhatsApp", () => {
		expect(__testables.normalizePhone("123").valid).toBe(false);
	});

	it("seleciona o primeiro telefone válido entre mapa e histórico", () => {
		expect(
			__testables.firstValidPhone(["", "123", "(31) 99999-8877"]),
		).toMatchObject({ digits: "5531999998877", valid: true });
	});

	it("renderiza template sem acoplar com mensageria", () => {
		const message = __testables.renderTemplate(
			"Olá, {{primeiro_nome}}. OS {{os}} em {{cidade}} com {{tecnico}}.",
			{
				primeiro_nome: "ALINE",
				os: "014326236000742341",
				cidade: "Martinho Campos",
				tecnico: "Rodrigo Reis",
			},
		);

		expect(message).toContain("Olá, ALINE.");
		expect(message).toContain("014326236000742341");
		expect(message).toContain("Martinho Campos");
		expect(message).toContain("Rodrigo Reis");
	});

	it("identifica o cliente pelo código antes do nome", () => {
		expect(
			__testables.formatCustomerIdentification("3333", "Rodrigo Reis Divino"),
		).toBe("(3333) Rodrigo Reis Divino");
	});

	it("gera links separados para WhatsApp comum e Business", () => {
		const links = __testables.buildWhatsappUrls(
			"5531999998877",
			"Cliente: (3333) Rodrigo Reis Divino",
		);

		expect(links.whatsappUrl).toContain("wa.me/5531999998877");
		expect(links.whatsappNormalUrl).toContain("package=com.whatsapp;");
		expect(links.whatsappBusinessUrl).toContain("package=com.whatsapp.w4b;");
	});

	it("mantem os parametros da classificacao alinhados com a consulta SQL", () => {
		const update = __testables.buildOpportunityResultUpdate({
			opportunityId: "tent_123",
			status: "RESPONDED",
			result: "RESPONDED",
			nextAttemptAt: null,
			attemptDelta: 1,
		});
		const references = [...update.sql.matchAll(/\$(\d+)/g)].map((match) =>
			Number(match[1]),
		);

		expect([...new Set(references)].sort((left, right) => left - right)).toEqual([
			1, 2, 3, 4, 5,
		]);
		expect(Math.max(...references)).toBe(update.params.length);
		expect(update.params).toEqual([
			"tent_123",
			"RESPONDED",
			"RESPONDED",
			null,
			1,
		]);
	});
});

