// Testes de integracao reais para o mecanismo de idempotencia de import
// usado em financeiroReportsRepository.js: `upsertMany(client, table, rows,
// ["source_hash"])`, que faz
//   insert ... on conflict (source_hash) do update set ...
// (ver upsertMany em financeiroBudgetConfigRepository.js, reaproveitado
// pelos dois repositorios). Isso significa reimportar o mesmo arquivo
// ATUALIZA a linha existente em vez de duplicar OU falhar — confirma esse
// comportamento com o Postgres real, contra a tabela finan_tarifas_faturas.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
	closeFinanTestPool,
	getFinanTestPool,
	isTestDatabaseAvailable,
	truncateFinanTestTables,
} from "./pgTestEnv.js";

const dbAvailable = await isTestDatabaseAvailable();

async function upsertFatura(pool, { id, ano, mes, metric, quantidade, hash }) {
	return pool.query(
		`insert into finan_tarifas_faturas (id, ano, mes, metric, quantidade, source_hash)
		 values ($1, $2, $3, $4, $5, $6)
		 on conflict (source_hash) do update set
			quantidade = excluded.quantidade,
			updated_at = now()
		 returning id`,
		[id, ano, mes, metric, quantidade, hash],
	);
}

describe.skipIf(!dbAvailable)("integracao: idempotencia de import (source_hash unique)", () => {
	beforeEach(async () => {
		await truncateFinanTestTables();
	});

	afterAll(async () => {
		await closeFinanTestPool();
	});

	it("reimportar o mesmo arquivo (mesmo source_hash) atualiza em vez de duplicar", async () => {
		const pool = getFinanTestPool();
		const hash = "hash-arquivo-x-linha-1";

		await upsertFatura(pool, { id: "fat-1", ano: 2026, mes: 9, metric: "boleto", quantidade: 100, hash });
		// "reimportar" o mesmo arquivo: mesmo hash, quantidade diferente
		// (simula o arquivo tendo sido reprocessado)
		await upsertFatura(pool, { id: "fat-1-v2", ano: 2026, mes: 9, metric: "boleto", quantidade: 150, hash });

		const { rows } = await pool.query(
			"select count(*)::int as total, max(quantidade) as quantidade from finan_tarifas_faturas where source_hash = $1",
			[hash],
		);
		expect(rows[0].total).toBe(1); // nao duplicou
		expect(Number(rows[0].quantidade)).toBe(150); // dado mais recente venceu
	});

	it("insert direto (sem on conflict) com source_hash repetido falha com unique_violation", async () => {
		const pool = getFinanTestPool();
		await pool.query(
			"insert into finan_tarifas_faturas (id, ano, mes, metric, quantidade, source_hash) values ('fat-a', 2026, 9, 'boleto', 10, 'hash-repetido')",
		);
		await expect(
			pool.query(
				"insert into finan_tarifas_faturas (id, ano, mes, metric, quantidade, source_hash) values ('fat-b', 2026, 9, 'boleto', 20, 'hash-repetido')",
			),
		).rejects.toMatchObject({ code: "23505" });
	});

	it("falha parcial no meio de uma importacao em lote nao deixa dado parcial (rollback via transacao)", async () => {
		const pool = getFinanTestPool();
		const client = await pool.connect();
		let caughtError = null;
		try {
			await client.query("begin");
			await upsertFatura(client, { id: "lote-1", ano: 2026, mes: 9, metric: "boleto", quantidade: 10, hash: "lote-hash-1" });
			await upsertFatura(client, { id: "lote-2", ano: 2026, mes: 9, metric: "boleto", quantidade: 20, hash: "lote-hash-2" });
			// linha 3 do "arquivo" e invalida (metric obrigatorio, ausente) —
			// simula uma linha corrompida no meio do lote
			await client.query(
				"insert into finan_tarifas_faturas (id, ano, mes, metric, quantidade, source_hash) values ('lote-3', 2026, 9, null, 30, 'lote-hash-3')",
			);
			await client.query("commit");
		} catch (error) {
			caughtError = error;
			await client.query("rollback");
		} finally {
			client.release();
		}

		expect(caughtError).not.toBeNull();
		const { rows } = await pool.query(
			"select count(*)::int as total from finan_tarifas_faturas where source_hash in ('lote-hash-1', 'lote-hash-2', 'lote-hash-3')",
		);
		// nenhuma das 3 linhas do lote ficou meio-importada — o repositorio
		// real (financeiroReportsRepository.js) faz begin/commit por lote
		// inteiro, entao esse e o comportamento real, nao so o do teste.
		expect(rows[0].total).toBe(0);
	});
});
