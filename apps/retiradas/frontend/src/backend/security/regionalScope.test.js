// Testes unitarios do helper reutilizavel de escopo regional
// (vps/api/src/security/regionalScope.js) — defesa contra IDOR
// introduzida na Fase A da otimizacao tecnica (docs/TECHNICAL-AUDIT.md,
// achado #3). Sem HTTP/DB, so os validadores puros.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));
const {
	canAccessRegionalRecord,
	assertRegionalRecordAccess,
	scopeWritePayload,
	getUserRegional,
	getRecordRegional,
} = require(path.join(process.cwd(), "apps/retiradas/backend/api/src/security/regionalScope.js"));

function supervisor(regional) {
	return { role: "supervisor", regional };
}

function backofficeRetirada(regional) {
	return { role: "backoffice_retirada", regional };
}

function admin(regional) {
	return { role: "admin", regional };
}

describe("security/regionalScope", () => {
	describe("canAccessRegionalRecord", () => {
		it("usuário autorizado + registro da própria regional → true (OK)", () => {
			expect(
				canAccessRegionalRecord(supervisor("Metropolitana SUB2"), {
					regional: "Metropolitana SUB2",
				}),
			).toBe(true);
		});

		it("usuário autorizado + registro de outra regional → false (bloqueado)", () => {
			expect(
				canAccessRegionalRecord(supervisor("Metropolitana SUB2"), {
					regional: "Interior SUB1",
				}),
			).toBe(false);
		});

		it("admin sempre acessa, independente da regional", () => {
			expect(
				canAccessRegionalRecord(admin("Metropolitana SUB2"), {
					regional: "Interior SUB1",
				}),
			).toBe(true);
		});

		it("papel de gestão global (backoffice_retirada) não é escopado por padrão", () => {
			expect(
				canAccessRegionalRecord(backofficeRetirada("Metropolitana SUB2"), {
					regional: "Interior SUB1",
				}),
			).toBe(true);
		});

		it("supervisor sem regional própria configurada é bloqueado", () => {
			expect(
				canAccessRegionalRecord(supervisor(""), { regional: "Interior SUB1" }),
			).toBe(false);
		});

		it("registro sem regional definida é bloqueado por padrão (allowUnknownRegional=false)", () => {
			expect(canAccessRegionalRecord(supervisor("Metropolitana SUB2"), {})).toBe(
				false,
			);
		});

		it("registro sem regional definida é permitido com allowUnknownRegional=true", () => {
			expect(
				canAccessRegionalRecord(
					supervisor("Metropolitana SUB2"),
					{},
					{ allowUnknownRegional: true },
				),
			).toBe(true);
		});

		it("comparação ignora maiúsculas/acentos (normalizeComparableText)", () => {
			expect(
				canAccessRegionalRecord(supervisor("são paulo"), {
					regional: "SÃO PAULO",
				}),
			).toBe(true);
		});

		it("scopedRoles customizado restringe outro papel em vez de supervisor", () => {
			expect(
				canAccessRegionalRecord(
					backofficeRetirada("Metropolitana SUB2"),
					{ regional: "Interior SUB1" },
					{ scopedRoles: ["backoffice_retirada"] },
				),
			).toBe(false);
		});
	});

	describe("assertRegionalRecordAccess", () => {
		it("não lança para registro permitido", () => {
			expect(() =>
				assertRegionalRecordAccess(supervisor("Metropolitana SUB2"), {
					regional: "Metropolitana SUB2",
				}),
			).not.toThrow();
		});

		it("lança erro com statusCode 403 para registro de outra regional", () => {
			try {
				assertRegionalRecordAccess(supervisor("Metropolitana SUB2"), {
					regional: "Interior SUB1",
				});
				throw new Error("deveria ter lançado");
			} catch (error) {
				expect(error.statusCode).toBe(403);
			}
		});
	});

	describe("scopeWritePayload", () => {
		it("força regional do payload para a do usuário quando escopado", () => {
			const payload = scopeWritePayload(supervisor("Metropolitana SUB2"), {
				regional: "Interior SUB1",
				nome: "Teste",
			});
			expect(payload.regional).toBe("Metropolitana SUB2");
			expect(payload.nome).toBe("Teste");
		});

		it("não altera payload de usuário não escopado (admin/backoffice_retirada)", () => {
			const payload = scopeWritePayload(backofficeRetirada("Metropolitana SUB2"), {
				regional: "Interior SUB1",
			});
			expect(payload.regional).toBe("Interior SUB1");
		});

		it("mantém payload original quando o usuário escopado não tem regional própria", () => {
			const payload = scopeWritePayload(supervisor(""), { regional: "Interior SUB1" });
			expect(payload.regional).toBe("Interior SUB1");
		});
	});

	describe("getUserRegional / getRecordRegional", () => {
		it("lê regional de user.profile.regional como fallback", () => {
			expect(getUserRegional({ profile: { regional: "X" } })).toBe("X");
		});

		it("lê regional de vários nomes de campo possíveis do registro", () => {
			expect(getRecordRegional({ regional_nome: "Y" })).toBe("Y");
			expect(getRecordRegional({ filial: "Z" })).toBe("Z");
		});
	});
});
