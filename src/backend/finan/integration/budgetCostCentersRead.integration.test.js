// Teste de regressao para o bug real encontrado em producao apos a
// migration 010: GET /api/financeiro/orcamento/centros-custo retornava 500
// com "update or delete on table finan_centros_custo violates foreign key
// constraint fk_finan_orcamento_lancamentos_centro" — porque
// financeiro.getBudgetCostCenters (uma rota GET) disparava, como efeito
// colateral silencioso, um DELETE+reinsert completo de
// finan_centros_custo/finan_contas (via saveBudgetCostCenters) sempre que
// detectava qualquer divergencia entre o plano de contas persistido e o
// plano padrao hardcoded. Esse DELETE nunca levava em conta linhas de
// finan_orcamento_lancamentos referenciando esses centros — e a FK RESTRICT
// adicionada pela migration 010 passou a bloquear justamente isso.
//
// A correcao remove o efeito colateral de escrita da rota GET. Este teste
// prova, contra Postgres real: (1) o DELETE que o bug disparava e de fato
// rejeitado pela FK quando ha um lancamento referenciando o centro (prova
// que o cenario e real); (2) chamar getBudgetCostCenters() hoje NAO tenta
// mais esse DELETE — resolve normalmente e o centro de custo continua
// existindo depois.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import {
	closeFinanTestPool,
	FINAN_TEST_DATABASE_URL,
	getFinanTestPool,
	isTestDatabaseAvailable,
	truncateFinanTestTables,
} from "./pgTestEnv.js";

const dbAvailable = await isTestDatabaseAvailable();

describe.skipIf(!dbAvailable)(
	"integracao: regressao GET centros-custo (efeito colateral de escrita removido)",
	() => {
		beforeEach(async () => {
			await truncateFinanTestTables();
			await getFinanTestPool().query(
				"insert into finan_centros_custo (id, nome) values ('centro-referenciado', 'Centro Referenciado')",
			);
			await getFinanTestPool().query(
				`insert into finan_orcamento_lancamentos (id, ano, mes, centro_custo_id, source_hash)
				 values ('lanc-1', 2026, 9, 'centro-referenciado', 'hash-regressao-centros-custo')`,
			);
		});

		afterAll(async () => {
			await closeFinanTestPool();
		});

		it("cenario real: apagar um centro de custo referenciado por um lancamento e rejeitado pela FK (23503)", async () => {
			// Documenta a causa raiz: e exatamente este DELETE que
			// saveBudgetCostCenters executava a partir de uma rota GET.
			await expect(
				getFinanTestPool().query(
					"delete from finan_centros_custo where id = 'centro-referenciado'",
				),
			).rejects.toMatchObject({ code: "23503" });
		});

		it("getBudgetCostCenters() nao tenta mais apagar/reescrever finan_centros_custo", async () => {
			const finanRequire = createRequire(
				path.join(process.cwd(), "apps/finan/backend/package.json"),
			);
			const previousUrl = process.env.FINAN_DATABASE_URL;
			process.env.FINAN_DATABASE_URL = FINAN_TEST_DATABASE_URL;
			// db.js cria o pool no require inicial do modulo — precisa ser
			// requerido (pela primeira vez neste processo de teste) so
			// depois de apontar FINAN_DATABASE_URL para o banco de teste.
			delete finanRequire.cache[finanRequire.resolve("./src/db.js")];
			delete finanRequire.cache[finanRequire.resolve("./src/financeiro.js")];
			const financeiro = finanRequire("./src/financeiro.js");

			try {
				await expect(financeiro.getBudgetCostCenters()).resolves.toMatchObject({
					ok: true,
				});
			} finally {
				if (previousUrl === undefined) delete process.env.FINAN_DATABASE_URL;
				else process.env.FINAN_DATABASE_URL = previousUrl;
			}

			const { rows } = await getFinanTestPool().query(
				"select id from finan_centros_custo where id = 'centro-referenciado'",
			);
			expect(rows).toHaveLength(1);
		});
	},
);
