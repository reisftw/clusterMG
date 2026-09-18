// Testes de integracao reais para as constraints adicionadas na migration
// 010_finan_data_integrity_constraints.sql. Confirma que o PROPRIO
// Postgres rejeita dado estruturalmente invalido, independente do que o
// codigo da aplicacao faz (ou deixa de fazer).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
	closeFinanTestPool,
	getFinanTestPool,
	isTestDatabaseAvailable,
	truncateFinanTestTables,
} from "./pgTestEnv.js";

const dbAvailable = await isTestDatabaseAvailable();

describe.skipIf(!dbAvailable)("integracao: constraints da migration 010", () => {
	beforeEach(async () => {
		await truncateFinanTestTables();
		await getFinanTestPool().query(
			"insert into finan_contas (id, nome) values ('conta-valida', 'Conta Valida')",
		);
		await getFinanTestPool().query(
			"insert into finan_centros_custo (id, nome) values ('centro-valido', 'Centro Valido')",
		);
	});

	afterAll(async () => {
		await closeFinanTestPool();
	});

	it("CHECK: mes = 13 em finan_orcamento_matriz e rejeitado", async () => {
		await expect(
			getFinanTestPool().query(
				`insert into finan_orcamento_matriz (id, ano, mes, conta_id, centro_custo_id)
				 values (gen_random_uuid(), 2026, 13, 'conta-valida', 'centro-valido')`,
			),
		).rejects.toMatchObject({ code: "23514" }); // check_violation
	});

	it("CHECK: mes = 0 em finan_orcamento_matriz e rejeitado", async () => {
		await expect(
			getFinanTestPool().query(
				`insert into finan_orcamento_matriz (id, ano, mes, conta_id, centro_custo_id)
				 values (gen_random_uuid(), 2026, 0, 'conta-valida', 'centro-valido')`,
			),
		).rejects.toMatchObject({ code: "23514" });
	});

	it("FK: conta_id inexistente em finan_orcamento_matriz e rejeitado", async () => {
		await expect(
			getFinanTestPool().query(
				`insert into finan_orcamento_matriz (id, ano, mes, conta_id, centro_custo_id)
				 values (gen_random_uuid(), 2026, 9, 'conta-que-nao-existe', 'centro-valido')`,
			),
		).rejects.toMatchObject({ code: "23503" }); // foreign_key_violation
	});

	it("FK: centro_custo_id inexistente em finan_orcamento_matriz e rejeitado", async () => {
		await expect(
			getFinanTestPool().query(
				`insert into finan_orcamento_matriz (id, ano, mes, conta_id, centro_custo_id)
				 values (gen_random_uuid(), 2026, 9, 'conta-valida', 'centro-que-nao-existe')`,
			),
		).rejects.toMatchObject({ code: "23503" });
	});

	it("relacao valida (conta e centro existentes) e aceita normalmente", async () => {
		const { rows } = await getFinanTestPool().query(
			`insert into finan_orcamento_matriz (id, ano, mes, conta_id, centro_custo_id, orcado)
			 values (gen_random_uuid(), 2026, 9, 'conta-valida', 'centro-valido', 1000)
			 returning id`,
		);
		expect(rows).toHaveLength(1);
	});

	it("NOT NULL: ano/mes nulos em finan_orcamento_lancamentos sao rejeitados", async () => {
		await expect(
			getFinanTestPool().query(
				"insert into finan_orcamento_lancamentos (id, ano, mes, source_hash) values ('lanc-null', null, 9, 'hash-1')",
			),
		).rejects.toMatchObject({ code: "23502" }); // not_null_violation
	});

	it("ON DELETE RESTRICT: apagar uma conta referenciada pelo orcamento e bloqueado", async () => {
		await getFinanTestPool().query(
			`insert into finan_orcamento_matriz (id, ano, mes, conta_id, centro_custo_id)
			 values (gen_random_uuid(), 2026, 9, 'conta-valida', 'centro-valido')`,
		);
		await expect(
			getFinanTestPool().query("delete from finan_contas where id = 'conta-valida'"),
		).rejects.toMatchObject({ code: "23503" });
	});

	it("ON DELETE SET NULL: apagar uma diretoria referenciada por um centro de custo so desvincula", async () => {
		await getFinanTestPool().query(
			"insert into finan_diretorias (id, nome) values ('dir-set-null', 'Diretoria')",
		);
		await getFinanTestPool().query(
			"update finan_centros_custo set diretoria_id = 'dir-set-null' where id = 'centro-valido'",
		);
		await getFinanTestPool().query("delete from finan_diretorias where id = 'dir-set-null'");

		const { rows } = await getFinanTestPool().query(
			"select diretoria_id from finan_centros_custo where id = 'centro-valido'",
		);
		expect(rows[0].diretoria_id).toBeNull();
	});

	it("UNIQUE: provider duplicado em finan_integration_configs e rejeitado", async () => {
		await expect(
			getFinanTestPool().query(
				`insert into finan_integration_configs (id, provider, name)
				 values ('hubsoft-duplicado', 'hubsoft', 'Hubsoft Duplicado')`,
			),
		).rejects.toMatchObject({ code: "23505" }); // unique_violation (provider ja existe: seed da migration 001)
	});
});
