// Testes de integracao reais (Postgres de verdade) para o padrao de
// transacao ja usado em financeiroBudgetConfigRepository.js /
// financeiroReportsRepository.js: `client.query("begin")` ->
// varias operacoes -> `commit` ou `rollback`.
//
// Requer o Postgres de teste rodando:
//   docker compose -f apps/finan/docker-compose.test.yml up -d --wait
//   NODE_ENV=test FINAN_DATABASE_URL=... node apps/finan/backend/scripts/run-sql-migrations.js
// Se nao estiver disponivel, a suite inteira e pulada (nao falha o build).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
	closeFinanTestPool,
	getFinanTestPool,
	isTestDatabaseAvailable,
	truncateFinanTestTables,
} from "./pgTestEnv.js";

const dbAvailable = await isTestDatabaseAvailable();

describe.skipIf(!dbAvailable)("integracao: transacoes (begin/commit/rollback)", () => {
	beforeEach(async () => {
		await truncateFinanTestTables();
	});

	afterAll(async () => {
		await closeFinanTestPool();
	});

	it("commit: duas escritas relacionadas persistem juntas", async () => {
		const pool = getFinanTestPool();
		const client = await pool.connect();
		try {
			await client.query("begin");
			await client.query(
				"insert into finan_diretorias (id, nome) values ($1, $2)",
				["dir-commit", "Diretoria Commit"],
			);
			await client.query(
				"insert into finan_centros_custo (id, nome, diretoria_id) values ($1, $2, $3)",
				["cc-commit", "Centro Commit", "dir-commit"],
			);
			await client.query("commit");
		} finally {
			client.release();
		}

		const { rows: diretorias } = await getFinanTestPool().query(
			"select id from finan_diretorias where id = $1",
			["dir-commit"],
		);
		const { rows: centros } = await getFinanTestPool().query(
			"select id, diretoria_id from finan_centros_custo where id = $1",
			["cc-commit"],
		);
		expect(diretorias).toHaveLength(1);
		expect(centros).toHaveLength(1);
		expect(centros[0].diretoria_id).toBe("dir-commit");
	});

	it("rollback: erro na segunda operacao desfaz a primeira (nenhum dado parcial)", async () => {
		const pool = getFinanTestPool();
		const client = await pool.connect();
		let caughtError = null;
		try {
			await client.query("begin");
			// operacao 1: escrita valida
			await client.query(
				"insert into finan_diretorias (id, nome) values ($1, $2)",
				["dir-rollback", "Diretoria Rollback"],
			);
			// operacao 2: viola a FK adicionada na migration 010
			// (finan_centros_custo.diretoria_id -> finan_diretorias.id)
			await client.query(
				"insert into finan_centros_custo (id, nome, diretoria_id) values ($1, $2, $3)",
				["cc-rollback", "Centro Rollback", "diretoria-que-nao-existe"],
			);
			await client.query("commit");
		} catch (error) {
			caughtError = error;
			await client.query("rollback");
		} finally {
			client.release();
		}

		expect(caughtError).not.toBeNull();
		expect(caughtError.code).toBe("23503"); // foreign_key_violation

		const { rows: diretorias } = await getFinanTestPool().query(
			"select id from finan_diretorias where id = $1",
			["dir-rollback"],
		);
		const { rows: centros } = await getFinanTestPool().query(
			"select id from finan_centros_custo where id = $1",
			["cc-rollback"],
		);
		// nem a diretoria (operacao 1, que sozinha teria sucesso) nem o
		// centro (operacao 2, que falhou) podem ter sobrado.
		expect(diretorias).toHaveLength(0);
		expect(centros).toHaveLength(0);
	});

	it("rollback proposital (sem erro real): confirma que nada e persistido antes do commit", async () => {
		const pool = getFinanTestPool();
		const client = await pool.connect();
		try {
			await client.query("begin");
			await client.query(
				"insert into finan_diretorias (id, nome) values ($1, $2)",
				["dir-rollback-manual", "Nunca deve persistir"],
			);
			await client.query("rollback");
		} finally {
			client.release();
		}

		const { rows } = await getFinanTestPool().query(
			"select id from finan_diretorias where id = $1",
			["dir-rollback-manual"],
		);
		expect(rows).toHaveLength(0);
	});
});
