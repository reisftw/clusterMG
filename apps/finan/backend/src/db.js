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

const pool = new Pool(buildConfig());

module.exports = {
	query: (text, params) => pool.query(text, params),
	connect: () => pool.connect(),
	closePool: () => pool.end(),
};
