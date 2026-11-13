import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
	process.cwd(),
	"apps/retiradas/backend/sql/089_tentativas_central_recuperacao.sql",
);
const managementMigrationPath = path.join(
	process.cwd(),
	"apps/retiradas/backend/sql/091_tentativas_gestao_metricas.sql",
);
const cityWalletMigrationPath = path.join(
	process.cwd(),
	"apps/retiradas/backend/sql/092_tentativas_carteiras_por_cidade.sql",
);
const neighborhoodLockMigrationPath = path.join(
	process.cwd(),
	"apps/retiradas/backend/sql/094_tentativas_bairro_locks.sql",
);
const orderReferenceIndexMigrationPath = path.join(
	process.cwd(),
	"apps/retiradas/backend/sql/093_ordens_servico_fk_indexes.sql",
);
const alertsPushMigrationPath = path.join(
	process.cwd(),
	"apps/retiradas/backend/sql/095_tentativas_alertas_push_adocao.sql",
);
const neighborhoodClaimMigrationPath = path.join(
	process.cwd(),
	"apps/retiradas/backend/sql/124_tentativas_bairro_solicitacoes.sql",
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

describe("migration 091 - métricas gerenciais de Tentativas", () => {
	const sql = fs.readFileSync(managementMigrationPath, "utf8");

	it("normaliza contatos históricos sem remover dados", () => {
		expect(sql).toContain("update tentativas_contacts");
		expect(sql).toContain("effective_contact = true");
		expect(sql).toContain("create index if not exists");
		expect(sql).not.toMatch(/\bdelete\s+from\b/i);
		expect(sql).not.toMatch(/\btruncate\b/i);
		expect(sql).not.toMatch(/\bdrop\s+(table|column|schema)\b/i);
	});
});

describe("migration 092 - carteiras por cidade", () => {
	const sql = fs.readFileSync(cityWalletMigrationPath, "utf8");

	it("encerra vínculos não técnicos preservando o histórico", () => {
		expect(sql).toContain("lower(coalesce(u.role, '')) <> 'tecnico'");
		expect(sql).toContain("set active = false");
		expect(sql).toContain("released_at = now()");
		expect(sql).toContain("PROPRIETARIO_NAO_TECNICO");
		expect(sql).not.toMatch(/\bdelete\s+from\b/i);
		expect(sql).not.toMatch(/\btruncate\b/i);
		expect(sql).not.toMatch(/\bdrop\s+(table|column|schema)\b/i);
	});
});

describe("migration 094 - exclusividade por bairro", () => {
	const sql = fs.readFileSync(neighborhoodLockMigrationPath, "utf8");

	it("impede dois tecnicos de reservar o mesmo bairro sem apagar historico", () => {
		expect(sql).toContain("primary key (cidade_normalizada, bairro_grupo)");
		expect(sql).toContain("technician_user_id text not null");
		expect(sql).not.toMatch(/\btruncate\b/i);
		expect(sql).not.toMatch(/\bdrop\s+(table|column|schema)\b/i);
	});
});

describe("migration 093 - indice da referencia de tentativas", () => {
	const sql = fs.readFileSync(orderReferenceIndexMigrationPath, "utf8");

	it("indexa somente a tabela pertencente ao schema do Retiradas", () => {
		expect(sql).toContain("tentativas_opportunities_ordem_id_idx");
		expect(sql).not.toContain("mercado_entregas");
	});
});

describe("migration 095 - alertas, push e adoção de Tentativas", () => {
	const sql = fs.readFileSync(alertsPushMigrationPath, "utf8");

	it("cria estruturas aditivas para assinaturas, eventos e acessos", () => {
		expect(sql).toContain("add column if not exists alert_settings");
		expect(sql).toContain("create table if not exists retiradas_push_subscriptions");
		expect(sql).toContain("create table if not exists retiradas_notification_events");
		expect(sql).toContain("create table if not exists tentativas_page_visits");
		expect(sql).not.toMatch(/\bdelete\s+from\b/i);
		expect(sql).not.toMatch(/\btruncate\b/i);
		expect(sql).not.toMatch(/\bdrop\s+(table|column|schema)\b/i);
	});
});

describe("migration 124 - solicitações temporárias de bairro", () => {
	const sql = fs.readFileSync(neighborhoodClaimMigrationPath, "utf8");

	it("mantém uma reserva exclusiva com prazo máximo de 24 horas", () => {
		expect(sql).toContain("create table if not exists tentativas_neighborhood_claims");
		expect(sql).toContain("primary key (cidade_normalizada, bairro_grupo)");
		expect(sql).toContain("expires_at <= requested_at + interval '24 hours'");
		expect(sql).not.toMatch(/\bdelete\s+from\b/i);
		expect(sql).not.toMatch(/\btruncate\b/i);
		expect(sql).not.toMatch(/\bdrop\s+(table|column|schema)\b/i);
	});
});
