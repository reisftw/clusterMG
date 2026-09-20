import { describe, expect, it } from "vitest";
import { hasPermission, ROLES } from "./roles";

describe("RBAC de imoveis administrativos", () => {
	it("permite acesso para supervisor e analista administrativo", () => {
		expect(
			hasPermission(
				ROLES.SUPERVISOR_ADMINISTRATIVO,
				"view_imoveis_administrativos",
			),
		).toBe(true);
		expect(
			hasPermission(
				ROLES.ANALISTA_ADMINISTRATIVO,
				"view_imoveis_administrativos",
			),
		).toBe(true);
		expect(
			hasPermission(
				ROLES.SUPERVISOR_ADMINISTRATIVO,
				"manage_imoveis_administrativos",
			),
		).toBe(true);
		expect(
			hasPermission(
				ROLES.ANALISTA_ADMINISTRATIVO,
				"manage_imoveis_administrativos",
			),
		).toBe(true);
	});

	it("bloqueia cargos operacionais", () => {
		expect(
			hasPermission(ROLES.SUPERVISOR, "view_imoveis_administrativos"),
		).toBe(false);
		expect(
			hasPermission(ROLES.BACKOFFICE_RETIRADA, "view_imoveis_administrativos"),
		).toBe(false);
		expect(
			hasPermission(ROLES.LIDER_EMPRESA, "view_imoveis_administrativos"),
		).toBe(false);
	});
});
