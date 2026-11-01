import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
	process.cwd(),
	"apps/retiradas/backend/sql/109_push_admin_campaigns.sql",
);

describe("migration 109 - campanhas push administrativas", () => {
	const sql = fs.readFileSync(migrationPath, "utf8");

	it("cria permissoes granulares e historico persistente", () => {
		expect(sql).toContain("configuracao.push.view");
		expect(sql).toContain("configuracao.push.manage");
		expect(sql).toContain("create table if not exists retiradas_push_campaigns");
		expect(sql).toContain("target_mode in ('ALL', 'USERS', 'ROLES')");
	});

	it("e aditiva e nao remove dados existentes", () => {
		expect(sql).not.toMatch(/\bdelete\s+from\b/i);
		expect(sql).not.toMatch(/\btruncate\b/i);
		expect(sql).not.toMatch(/\bdrop\s+(table|column|schema)\b/i);
	});
});
