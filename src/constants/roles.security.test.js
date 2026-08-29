import { describe, expect, it } from "vitest";
import { hasAnyPermission, hasPermission, ROLE_VALUES, ROLES } from "./roles";

describe("RBAC security rules", () => {
	it("blocks non-admin roles from admin-only permissions", () => {
		for (const role of ROLE_VALUES.filter((value) => value !== ROLES.ADMIN)) {
			expect(hasAnyPermission(role, ["manage_database_backups"])).toBe(false);
		}
		expect(hasAnyPermission(ROLES.ADMIN, ["manage_database_backups"])).toBe(
			true,
		);
	});

	it("allows manage permission to satisfy the matching view permission", () => {
		expect(
			hasPermission(
				{ role: ROLES.VISITANTE, permissions: ["mensageria.api.manage"] },
				"mensageria.api.view",
			),
		).toBe(true);
	});

	it("does not allow view permission to satisfy the matching manage permission", () => {
		expect(
			hasPermission(
				{ role: ROLES.VISITANTE, permissions: ["mensageria.api.view"] },
				"mensageria.api.manage",
			),
		).toBe(false);
	});
});
