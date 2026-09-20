// Bootstrap do primeiro usuario site_admin do ROT — nao existe seed
// automatico de usuario (senha nao devia nunca ir num seed versionado).
// Uso: node scripts/create-admin.js "Nome Completo" usuario senha@forte123
const argon2 = require("argon2");
const db = require("../src/db");
const { randomId } = require("../src/secureRandom");

async function main() {
	const [name, username, password] = process.argv.slice(2);
	if (!name || !username || !password) {
		console.error("Uso: node scripts/create-admin.js \"Nome Completo\" usuario senha");
		process.exitCode = 1;
		return;
	}
	if (password.length < 8) {
		console.error("A senha deve ter pelo menos 8 caracteres.");
		process.exitCode = 1;
		return;
	}
	const passwordHash = await argon2.hash(password);
	const id = randomId("rotuser");
	await db.query(
		`insert into rot_users (id, name, username, password_hash, role_id, status)
		values ($1, $2, $3, $4, 'site_admin', 'ativo')
		on conflict (username) do update set
			password_hash = excluded.password_hash,
			role_id = 'site_admin',
			status = 'ativo',
			updated_at = now()`,
		[id, name, username.toLowerCase(), passwordHash],
	);
	console.log(`[rot] Usuário admin "${username}" criado/atualizado com sucesso.`);
}

main()
	.catch((error) => {
		console.error("[rot] Falha ao criar admin:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.closePool().catch(() => {});
	});
