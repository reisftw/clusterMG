import { describe, expect, it } from "vitest";
import {
	hasAnyPermission,
	hasPermission,
	PERMISSION_GROUPS,
	PERMISSION_LABELS,
	ROLE_VALUES,
	ROLES,
} from "./roles";

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

	it("lists Reports as finance RBAC view and manage permissions", () => {
		const financeGroup = PERMISSION_GROUPS.find(
			(group) => group.label === "Financeiro",
		);

		expect(financeGroup?.permissions).toEqual(
			expect.arrayContaining([
				"financeiro.reports.view",
				"financeiro.reports.manage",
			]),
		);
		expect(PERMISSION_LABELS["financeiro.reports.view"]).toBe(
			"Financeiro - Reports",
		);
		expect(PERMISSION_LABELS["financeiro.reports.manage"]).toBe(
			"Gerenciar Reports Financeiros",
		);
	});

	it("lists Financeiro Equipe as finance RBAC view and manage permissions", () => {
		const financeGroup = PERMISSION_GROUPS.find(
			(group) => group.label === "Financeiro",
		);

		expect(financeGroup?.permissions).toEqual(
			expect.arrayContaining([
				"financeiro.equipe.view",
				"financeiro.equipe.manage",
			]),
		);
		expect(PERMISSION_LABELS["financeiro.equipe.view"]).toBe(
			"Financeiro - Equipe",
		);
		expect(PERMISSION_LABELS["financeiro.equipe.manage"]).toBe(
			"Gerenciar Equipe Financeira",
		);
	});

	it("keeps legacy finance reports permission valid for existing roles", () => {
		expect(
			hasPermission(
				{
					role: ROLES.VISITANTE,
					permissions: ["financeiro.chamados.view"],
				},
				"financeiro.reports.view",
			),
		).toBe(true);
	});
});
