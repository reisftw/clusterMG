import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
	process.cwd(),
	"apps/retiradas/backend/sql/089_tentativas_central_recuperacao.sql",
);

describe("migration 089 - Central de Tentativas", () => {
	const sql = fs.readFileSync(migrationPath, "utf8");

	it("é aditiva e não contém operações destrutivas", () => {
		expect(sql).toContain("add column if not exists");
		expect(sql).toContain("create table if not exists tentativas_callbacks");
		expect(sql).toContain("create table if not exists tentativas_events");
		expect(sql).not.toMatch(/\bdrop\s+(table|column|schema)\b/i);
		expect(sql).not.toMatch(/\btruncate\b/i);
	});

	it("cadastra as permissões granulares exigidas no backend", () => {
		for (const permission of [
			"tentativas.contatar",
			"tentativas.registrar",
			"tentativas.agendar",
			"tentativas.carteiras.gerenciar",
			"tentativas.gestao.visualizar",
			"tentativas.relatorios.exportar",
			"tentativas.auditoria.visualizar",
			"tentativas.registros.corrigir",
		]) {
			expect(sql).toContain(permission);
		}
	});

	it("indexa cliente, score, responsável, status e linha do tempo", () => {
		expect(sql).toContain("tentativas_opportunities_customer_idx");
		expect(sql).toContain("tentativas_opportunities_score_idx");
		expect(sql).toContain("tentativas_callbacks_owner_status_idx");
		expect(sql).toContain("tentativas_recoveries_status_idx");
		expect(sql).toContain("tentativas_events_opportunity_idx");
	});

	it("persiste bairro e coordenadas reais para o recorte territorial", () => {
		expect(sql).toContain("add column if not exists bairro text");
		expect(sql).toContain("add column if not exists latitude numeric(10,7)");
		expect(sql).toContain("add column if not exists longitude numeric(10,7)");
		expect(sql).toContain("tentativas_opportunities_neighborhood_idx");
	});

	it("protege equipamentos confirmados contra dupla contabilização", () => {
		expect(sql).toContain("tentativas_recovery_equipment_confirmed_serial_idx");
		expect(sql).toContain("where status = 'CONFIRMED'");
	});
});
