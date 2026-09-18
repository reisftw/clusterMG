// Helper compartilhado pelos testes de integracao reais do Finan (Postgres
// de verdade, subido via `docker compose -f apps/finan/docker-compose.test.yml up -d --wait`).
//
// Estes testes sao esqueleto/skip automatico se o banco de teste nao
// estiver disponivel (ex.: CI sem o servico Postgres, ou dev sem Docker
// rodando) — nunca tentam usar produção como fallback.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const finanRequire = createRequire(
	path.join(process.cwd(), "apps/finan/backend/package.json"),
);
const { Pool } = finanRequire("pg");
const { assertIsTestDatabase } = finanRequire("./scripts/testDatabaseGuard.js");

export const FINAN_TEST_DATABASE_URL =
	process.env.FINAN_TEST_DATABASE_URL ||
	"postgres://finan_test:finan_test_only_local@127.0.0.1:55432/finan_test";

let pool = null;
let availabilityChecked = false;
let isAvailable = false;

/**
 * Verifica (uma vez por processo de teste) se o Postgres de teste esta
 * acessivel. Retorna false em vez de lancar — quem chama decide se pula o
 * describe/it.
 */
export async function isTestDatabaseAvailable() {
	if (availabilityChecked) return isAvailable;
	availabilityChecked = true;
	try {
		process.env.NODE_ENV = "test";
		assertIsTestDatabase({ connectionString: FINAN_TEST_DATABASE_URL });
		const probe = new Pool({ connectionString: FINAN_TEST_DATABASE_URL, connectionTimeoutMillis: 2000 });
		await probe.query("select 1");
		await probe.end();
		isAvailable = true;
	} catch (error) {
		console.warn(
			`[finan-integration-tests] Postgres de teste indisponivel em ${FINAN_TEST_DATABASE_URL} — pulando testes de integracao. ` +
				"Suba com: docker compose -f apps/finan/docker-compose.test.yml up -d --wait. Detalhe:",
			error.message,
		);
		isAvailable = false;
	}
	return isAvailable;
}

export function getFinanTestPool() {
	assertIsTestDatabase({ connectionString: FINAN_TEST_DATABASE_URL });
	if (!pool) {
		pool = new Pool({ connectionString: FINAN_TEST_DATABASE_URL });
	}
	return pool;
}

export async function closeFinanTestPool() {
	if (pool) {
		await pool.end();
		pool = null;
	}
}

/**
 * Limpa so as tabelas que os testes de integracao usam, mantendo o schema
 * (constraints, indices) intacto — nao e um reset de schema, so de dados,
 * para cada teste comecar de um estado conhecido sem precisar recriar o
 * container inteiro a cada `it`.
 */
export async function truncateFinanTestTables() {
	const client = getFinanTestPool();
	await client.query(`
		truncate table
			finan_orcamento_lancamentos,
			finan_orcamento_matriz,
			finan_centros_custo,
			finan_contas,
			finan_diretorias,
			finan_matrizes,
			finan_equipe_setores,
			finan_equipe_cargos,
			finan_equipe_colaboradores,
			finan_serasa_movimentacoes,
			finan_tarifas_faturas
		restart identity cascade
	`);
}
