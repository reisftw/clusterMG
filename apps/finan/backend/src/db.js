const { Pool } = require("pg");

function buildConfig() {
	if (process.env.FINAN_DATABASE_URL) {
		return {
			connectionString: process.env.FINAN_DATABASE_URL,
			ssl:
				String(process.env.FINAN_PGSSLMODE || "").toLowerCase() === "require"
					? { rejectUnauthorized: false }
					: undefined,
		};
	}

	const required = ["FINAN_PGHOST", "FINAN_PGUSER", "FINAN_PGDATABASE"];
	const missing = required.filter((key) => !process.env[key]);
	if (missing.length) {
		throw new Error(
			`Banco do Finan não configurado. Informe FINAN_DATABASE_URL ou ${missing.join(", ")}.`,
		);
	}

	return {
		host: process.env.FINAN_PGHOST,
		port: Number(process.env.FINAN_PGPORT || 5432),
		user: process.env.FINAN_PGUSER,
		password: process.env.FINAN_PGPASSWORD,
		database: process.env.FINAN_PGDATABASE,
		ssl:
			String(process.env.FINAN_PGSSLMODE || "").toLowerCase() === "require"
				? { rejectUnauthorized: false }
				: undefined,
	};
}

const pool = new Pool({
	...buildConfig(),
	// Sem estes limites o driver `pg` usa os defaults da lib (max: 10,
	// idleTimeoutMillis: 10000, connectionTimeoutMillis: 0 = sem timeout de
	// espera por conexao). Deixamos explicito e configuravel por env porque
	// o backend do Finan roda como processo unico (systemd), entao o pool
	// e por instancia; se no futuro rodar mais de uma instancia, o valor de
	// FINAN_PG_POOL_MAX precisa considerar max_connections do Postgres
	// dividido pelo numero de instancias.
	max: Number(process.env.FINAN_PG_POOL_MAX || 10),
	idleTimeoutMillis: Number(process.env.FINAN_PG_IDLE_TIMEOUT_MS || 30000),
	connectionTimeoutMillis: Number(process.env.FINAN_PG_CONNECTION_TIMEOUT_MS || 5000),
});

const SLOW_QUERY_MS = Number(process.env.FINAN_SLOW_QUERY_MS || 500);

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
				`[finan-db] query lenta (${durationMs.toFixed(1)}ms >= ${SLOW_QUERY_MS}ms): ${queryLabel(text)}`,
			);
		}
	}
}

module.exports = {
	query,
	connect: () => pool.connect(),
	closePool: () => pool.end(),
};
