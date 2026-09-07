// Gerenciamento do PIN de bloqueio de OUTROS usuarios (desbloquear conta
// travada ou forcar reconfiguracao). Diferente de auth/routes.js (onde cada
// usuario mexe so no proprio PIN), aqui exige a permissao RBAC
// "finan.pin.manage" e, alem disso, que o alvo esteja hierarquicamente
// ABAIXO de quem esta agindo (nunca cargo igual ou superior, nunca contra
// si mesmo) — a permissao sozinha nao basta porque depende do alvo, entao a
// checagem de hierarquia e feita por requisicao, nao so no middleware do
// router.
//
// Nunca revela PIN nem palavra secreta em si — so hashes argon2 existem no
// banco. "Resetar" limpa o PIN/palavra secreta e forca o usuario a
// configurar um PIN novo no proximo acesso; "desbloquear" mantem o PIN
// atual e so libera a conta.
const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("./middleware");

const router = express.Router();

router.use(requireFinanPermission("finan.pin.manage"));

async function assertCanManageTarget(req, targetId) {
	if (!targetId || targetId === req.finanUser.id) {
		const error = new Error(
			"Use a tela de configurações para alterar seu próprio PIN.",
		);
		error.status = 400;
		throw error;
	}
	const { rows } = await db.query(
		`select
			u.id, u.name, u.email, u.pin_hash, u.pin_locked_at,
			coalesce(r.hierarchy_level, 999) as hierarchy_level
		from finan_users u
		left join finan_roles r on r.id = u.role_id
		where u.id = $1`,
		[targetId],
	);
	const target = rows[0];
	const actorLevel = Number(req.finanUser.hierarchy_level ?? 999);
	const targetLevel = Number(target?.hierarchy_level ?? 999);
	if (!target || targetLevel <= actorLevel) {
		const error = new Error(
			"Você só pode gerenciar o PIN de usuários abaixo do seu cargo na hierarquia.",
		);
		error.status = 403;
		throw error;
	}
	return target;
}

router.get("/users", async (req, res, next) => {
	try {
		const actorLevel = Number(req.finanUser.hierarchy_level ?? 999);
		const { rows } = await db.query(
			`select
				u.id, u.name, u.email, u.role_id,
				(u.pin_hash is not null) as pin_configured,
				(u.pin_locked_at is not null) as pin_locked,
				coalesce(r.hierarchy_level, 999) as hierarchy_level,
				r.name as role_name
			from finan_users u
			left join finan_roles r on r.id = u.role_id
			where u.id != $1
				and coalesce(r.hierarchy_level, 999) > $2
			order by u.name, u.email`,
			[req.finanUser.id, actorLevel],
		);
		res.json({ ok: true, users: rows });
	} catch (error) {
		next(error);
	}
});

router.post("/:userId/unlock", async (req, res, next) => {
	try {
		const target = await assertCanManageTarget(req, String(req.params.userId || ""));
		await db.query(
			"update finan_users set pin_locked_at = null, pin_failed_attempts = 0 where id = $1",
			[target.id],
		);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.post("/:userId/reset", async (req, res, next) => {
	try {
		const target = await assertCanManageTarget(req, String(req.params.userId || ""));
		await db.query(
			`update finan_users
			set pin_hash = null, pin_secret_word_hash = null, pin_configured_at = null,
				pin_failed_attempts = 0, pin_locked_at = null, updated_at = now()
			where id = $1`,
			[target.id],
		);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
