const { Pool } = require("pg");
const { buildPgSslConfig } = require("./security/pgSsl");

// Mesmo padrao de apps/finan/backend/src/db.js — banco Postgres dedicado
// da Operação, nao compartilhado com retiradas/finan. Suporta ROT_DATABASE_URL
// (uma unica variavel) ou o conjunto discreta ROT_PG*.
function buildConfig() {
	if (process.env.ROT_DATABASE_URL) {
		return {
			connectionString: process.env.ROT_DATABASE_URL,
			ssl: buildPgSslConfig({
				sslMode: process.env.ROT_PGSSLMODE,
				rejectUnauthorized: process.env.ROT_PG_SSL_REJECT_UNAUTHORIZED,
				ca: process.env.ROT_PG_SSL_CA,
			}),
		};
	}

	const required = ["ROT_PGHOST", "ROT_PGUSER", "ROT_PGDATABASE"];
	const missing = required.filter((key) => !process.env[key]);
	if (missing.length) {
		throw new Error(
			`Banco da Operação não configurado. Informe ROT_DATABASE_URL ou ${missing.join(", ")}.`,
		);
	}

	return {
		host: process.env.ROT_PGHOST,
		port: Number(process.env.ROT_PGPORT || 5432),
		user: process.env.ROT_PGUSER,
		password: process.env.ROT_PGPASSWORD,
		database: process.env.ROT_PGDATABASE,
		ssl: buildPgSslConfig({
			sslMode: process.env.ROT_PGSSLMODE,
			rejectUnauthorized: process.env.ROT_PG_SSL_REJECT_UNAUTHORIZED,
			ca: process.env.ROT_PG_SSL_CA,
		}),
	};
}

const pool = new Pool({
	...buildConfig(),
	max: Number(process.env.ROT_PG_POOL_MAX || 10),
	idleTimeoutMillis: Number(process.env.ROT_PG_IDLE_TIMEOUT_MS || 30000),
	connectionTimeoutMillis: Number(process.env.ROT_PG_CONNECTION_TIMEOUT_MS || 5000),
});

const SLOW_QUERY_MS = Number(process.env.ROT_SLOW_QUERY_MS || 500);

function queryLabel(text) {
	const raw = typeof text === "string" ? text : text?.text || "";
	// So o texto da query, nunca os parametros (podem conter dado sensivel).
	return raw.replace(/\s+/g, " ").trim().slice(0, 200);
}

async function query(text, params) {
	const startedAt = process.hrtime.bigint();
	try {
		return await pool.query(text, params);
	} finally {
		const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
		if (durationMs >= SLOW_QUERY_MS) {
			console.warn(
				`[rot-db] query lenta (${durationMs.toFixed(1)}ms >= ${SLOW_QUERY_MS}ms): ${queryLabel(text)}`,
			);
		}
	}
}

module.exports = {
	query,
	connect: () => pool.connect(),
	closePool: () => pool.end(),
};
