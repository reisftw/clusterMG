const crypto = require("node:crypto");
const argon2 = require("argon2");
const { Pool } = require("pg");

const PASSWORD_ALGORITHM = "argon2id";

function parseArgs(argv) {
	const args = {
		password: "",
		resetExisting: false,
		onlyEmail: "",
	};

	for (let index = 0; index < argv.length; index += 1) {
		const item = argv[index];
		if (item === "--password") {
			args.password = argv[index + 1] || "";
			index += 1;
		} else if (item === "--reset-existing") {
			args.resetExisting = true;
		} else if (item === "--only-email") {
			args.onlyEmail = String(argv[index + 1] || "")
				.trim()
				.toLowerCase();
			index += 1;
		}
	}

	return args;
}

function makeTemporaryPassword() {
	return `Retira@${crypto.randomBytes(5).toString("hex")}`;
}

function normalizeEmail(email) {
	return String(email || "")
		.trim()
		.toLowerCase();
}

function normalizeRole(role) {
	return String(role || "tecnico")
		.trim()
		.toLowerCase();
}

async function hashPassword(password) {
	const passwordHash = await argon2.hash(String(password || ""), {
		type: argon2.argon2id,
		memoryCost: Number(process.env.ARGON2_MEMORY_COST || 19456),
		timeCost: Number(process.env.ARGON2_TIME_COST || 2),
		parallelism: Number(process.env.ARGON2_PARALLELISM || 1),
	});
	return {
		passwordHash,
		passwordSalt: "",
		passwordAlgorithm: PASSWORD_ALGORITHM,
	};
}

function buildDatabaseConfig() {
	if (process.env.DATABASE_URL) {
		return { connectionString: process.env.DATABASE_URL };
	}

	return {
		host: process.env.PGHOST || "127.0.0.1",
		port: Number(process.env.PGPORT || 5432),
		user: process.env.PGUSER || "retorninho",
		password: process.env.PGPASSWORD,
		database: process.env.PGDATABASE || "retiradas",
	};
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const temporaryPassword = args.password || makeTemporaryPassword();
	const passwordData = await hashPassword(temporaryPassword);
	const pool = new Pool(buildDatabaseConfig());
	const client = await pool.connect();

	try {
		await client.query("begin");

		const usersResult = await client.query(
			`select document_id as uid, data
         from app_documents
        where collection_path = 'usuarios'
        order by coalesce(data->>'nome', data->>'email', document_id)`,
		);

		let created = 0;
		let updated = 0;
		let skipped = 0;

		for (const row of usersResult.rows) {
			const data = row.data || {};
			const email = normalizeEmail(data.email);
			if (!email) {
				skipped += 1;
				continue;
			}
			if (args.onlyEmail && email !== args.onlyEmail) {
				skipped += 1;
				continue;
			}

			const values = [
				row.uid,
				email,
				String(data.nome || "").trim(),
				normalizeRole(data.role),
				String(data.regional || "").trim(),
				passwordData.passwordHash,
				passwordData.passwordSalt,
				passwordData.passwordAlgorithm,
			];

			const result = await client.query(
				`insert into app_users (
           uid, email, display_name, role, regional,
           password_hash, password_salt, password_algorithm, must_change_password
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, true)
         on conflict (uid) do update set
           email = excluded.email,
           display_name = excluded.display_name,
           role = excluded.role,
           regional = excluded.regional,
           password_hash = case when $9::boolean then excluded.password_hash else app_users.password_hash end,
           password_salt = case when $9::boolean then excluded.password_salt else app_users.password_salt end,
           password_algorithm = case when $9::boolean then excluded.password_algorithm else app_users.password_algorithm end,
           must_change_password = case when $9::boolean then true else app_users.must_change_password end,
           session_version = case when $9::boolean then app_users.session_version + 1 else app_users.session_version end
         returning (xmax = 0) as inserted`,
				[...values, args.resetExisting],
			);

			const wasInserted = Boolean(result.rows[0]?.inserted);
			if (wasInserted) created += 1;
			else updated += 1;

			if (wasInserted || args.resetExisting) {
				await client.query(
					`update app_documents
              set data = jsonb_set(data, '{trocar_senha}', 'true'::jsonb, true)
            where path = $1`,
					[`usuarios/${row.uid}`],
				);
			}
		}

		await client.query("commit");

		console.log(`[seed-local-auth] Usuarios criados: ${created}`);
		console.log(`[seed-local-auth] Usuarios atualizados: ${updated}`);
		console.log(`[seed-local-auth] Usuarios ignorados: ${skipped}`);
		console.log(`[seed-local-auth] Senha temporaria: ${temporaryPassword}`);
		if (!args.resetExisting) {
			console.log(
				"[seed-local-auth] Senhas existentes foram preservadas. Use --reset-existing para redefinir todos.",
			);
		}
	} catch (error) {
		await client.query("rollback");
		throw error;
	} finally {
		client.release();
		await pool.end();
	}
}

main().catch((error) => {
	console.error("[seed-local-auth] Falha:", error);
	process.exitCode = 1;
});
