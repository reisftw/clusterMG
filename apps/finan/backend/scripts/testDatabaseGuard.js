// Guarda contra rodar operacao destrutiva (reset de schema, etc.) num banco
// que nao seja explicitamente de teste. Usado pelo setup dos testes de
// integracao ANTES de qualquer `drop schema`/`truncate`.
//
// So passa se AMBAS as condicoes forem verdadeiras:
//   1. NODE_ENV === "test";
//   2. o nome do banco (ou a connection string) contem "test".
//
// Isso nao substitui ter credenciais de teste corretas — e uma ultima
// linha de defesa contra rodar isso sem querer com um FINAN_DATABASE_URL
// de producao esquecido no ambiente.
function resolveDatabaseName(config = {}) {
	if (config.database) return config.database;
	const url = config.connectionString || "";
	const match = url.match(/\/([^/?]+)(\?.*)?$/);
	return match ? match[1] : "";
}

function resolveHost(config = {}) {
	if (config.host) return config.host;
	const url = config.connectionString || "";
	const match = url.match(/@([^:/]+)/);
	return match ? match[1] : "";
}

function assertIsTestDatabase(config = {}) {
	const nodeEnv = process.env.NODE_ENV || "";
	const database = resolveDatabaseName(config);
	const host = resolveHost(config);
	const looksLikeTestDb = /test/i.test(database);
	const looksLikeLocalHost = /^(localhost|127\.0\.0\.1|::1)$/i.test(host) || !host;

	if (nodeEnv !== "test" || !looksLikeTestDb || !looksLikeLocalHost) {
		throw new Error(
			"Recusando operar: isto nao parece um banco de teste do Finan. " +
				`NODE_ENV="${nodeEnv}" (precisa ser "test"), database="${database}" ` +
				`(precisa conter "test"), host="${host}" (precisa ser local). ` +
				"Nunca aponte FINAN_DATABASE_URL de producao para os scripts de teste.",
		);
	}
}

module.exports = { assertIsTestDatabase, resolveDatabaseName, resolveHost };
