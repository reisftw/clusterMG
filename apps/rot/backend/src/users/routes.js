const express = require("express");
const crypto = require("node:crypto");
const argon2 = require("argon2");
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, requireRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { sendWelcomeFirstAccessEmail } = require("../email/service");
const { validateBody } = require("../security/bodyValidation");

const router = express.Router();
router.use(requireRotAuth);

const FIRST_ACCESS_TTL_MINUTES = Number(process.env.ROT_FIRST_ACCESS_TTL_MINUTES || process.env.ROT_PASSWORD_RESET_TTL_MINUTES || 30);

function randomToken() {
	return crypto.randomBytes(32).toString("base64url");
}

function tokenHash(token) {
	return crypto.createHash("sha256").update(token).digest("hex");
}

async function createFirstAccessLink(client, userId) {
	const token = randomToken();
	await client.query(
		`insert into rot_password_resets (id, user_id, token_hash, expires_at)
		values ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
		[randomId("first_access"), userId, tokenHash(token), FIRST_ACCESS_TTL_MINUTES],
	);
	const appUrl = String(process.env.ROT_PUBLIC_URL || "https://operacao.retiradas.tech").replace(/\/$/, "");
	return `${appUrl}/login?reset=${encodeURIComponent(token)}`;
}

function publicAdminUser(row) {
	return {
		id: row.id,
		name: row.name,
		username: row.username,
		email: row.email,
		role: row.role_id,
		roleName: row.role_name,
		isGlobal: Boolean(row.is_global),
		regionalId: row.regional_id,
		cityId: row.city_id,
		phone: row.phone,
		avatarUrl: row.avatar_url || "",
		status: row.status,
		mustChangePassword: row.must_change_password,
		operationScopes: Array.isArray(row.operation_scopes) ? row.operation_scopes : ["ROT"],
		lastLoginAt: row.last_login_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

async function auditLog(req, { action, entity, entityId, before, after }) {
	await db.query(
		`insert into rot_audit_logs (user_id, user_name, action, entity, entity_id, before_data, after_data, ip_address, user_agent)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		[
			req.rotUser?.id || null,
			req.rotUser?.name || null,
			action,
			entity,
			entityId,
			before ? JSON.stringify(before) : null,
			after ? JSON.stringify(after) : null,
			String(req.ip || ""),
			String(req.get?.("user-agent") || "").slice(0, 500),
		],
	);
}

const VALID_OPERATION_SCOPES = new Set(["ROT", "FIELD", "DELIVERY"]);

function normalizeOperationScopes(input, fallback = ["ROT"]) {
	const values = (Array.isArray(input) ? input : fallback)
		.map((item) => String(item || "").trim().toUpperCase())
		.filter((item) => VALID_OPERATION_SCOPES.has(item));
	return [...new Set(values)].length ? [...new Set(values)] : [...fallback];
}

function normalizeRegionalNameKey(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toUpperCase()
		.replace(/^REGIONAL\s*\|?\s*/g, "")
		.replace(/[^A-Z0-9]+/g, "");
}

async function replaceUserOperationScopes(client, userId, scopes, actorId = null) {
	const normalized = normalizeOperationScopes(scopes);
	await client.query(`delete from rot_user_operation_scopes where user_id = $1`, [userId]);
	await client.query(
		`insert into rot_user_operation_scopes (user_id, operation_type, is_primary, created_by)
		select $1, operation_type, row_number() over () = 1, $3
		from unnest($2::text[]) as operation_type
		on conflict (user_id, operation_type) do update set is_primary = excluded.is_primary`,
		[userId, normalized, actorId],
	);
	return normalized;
}

async function resolveLegacyRegionalId(client, regionalId) {
	if (!regionalId) return null;
	const id = String(regionalId);
	const { rows: legacyRows } = await client.query(`select id from rot_regionals where id = $1 limit 1`, [id]);
	if (legacyRows[0]) return legacyRows[0].id;
	const { rows } = await client.query(
		`select id, nome, legacy_document_id, legacy_path, source_payload
		   from regionais
		  where id::text = $1
		     or legacy_document_id = $1
		     or source_payload->>'legacyDocumentId' = $1
		     or source_payload->>'legacyId' = $1
		  limit 1`,
		[id],
	);
	const regional = rows[0];
	if (!regional) return id;
	const candidates = [
		regional.legacy_document_id,
		String(regional.legacy_path || "").match(/rot_regionals\/([^/]+)/)?.[1],
		regional.source_payload?.legacyDocumentId,
		regional.source_payload?.legacyId,
		regional.source_payload?.legacy_id,
		regional.source_payload?.id,
	].filter(Boolean).map(String);
	for (const candidate of candidates) {
		const { rows: candidateRows } = await client.query(`select id from rot_regionals where id = $1 limit 1`, [candidate]);
		if (candidateRows[0]) return candidateRows[0].id;
	}
	const { rows: allLegacyRows } = await client.query(`select id, name from rot_regionals`);
	const targetName = normalizeRegionalNameKey(regional.nome);
	const byName = allLegacyRows.find((row) => normalizeRegionalNameKey(row.name) === targetName);
	return byName?.id;
}

const ADMIN_USER_SELECT = `
	select
		u.*,
		r.name as role_name,
		r.is_global,
		coalesce(
			(
				select array_agg(uos.operation_type order by case when uos.is_primary then 0 else 1 end, uos.operation_type)
				from rot_user_operation_scopes uos
				join rot_operation_types ot on ot.id = uos.operation_type and ot.active = true
				where uos.user_id = u.id
			),
			array['ROT']::text[]
		) as operation_scopes
	from rot_users u
	join rot_roles r on r.id = u.role_id
`;

// Lista usuarios: cargo regional (is_global=false) so ve gente da propria
// regional — mesmo escopo que shouldFilterByRegional aplicava so no
// cliente hoje, agora garantido pelo backend.
router.get("/", requireRotPermission("rot.users.manage"), noStore, async (req, res, next) => {
	try {
		const params = [];
		let where = "1=1";
		if (!req.rotUser.is_global) {
			params.push(req.rotUser.regional_id);
			where = `u.regional_id = $${params.length}`;
		}
		const { rows } = await db.query(
			`${ADMIN_USER_SELECT}
			where ${where}
			order by u.name`,
			params,
		);
		res.json({ ok: true, items: rows.map(publicAdminUser), total: rows.length });
	} catch (error) {
		next(error);
	}
});

router.post("/", requireRotPermission("rot.users.manage"), validateBody(["name", "username", "email", "role", "regionalId", "cityId", "phone", "operationScopes"], { allowEmpty: false }), async (req, res, next) => {
	let client;
	try {
		const name = String(req.body?.name || "").trim();
		const username = String(req.body?.username || "").trim().toLowerCase();
		const email = req.body?.email ? String(req.body.email).trim().toLowerCase() : null;
		const roleId = String(req.body?.role || "").trim();
		const rawRegionalId = req.body?.regionalId || null;
		const regionalId = await resolveLegacyRegionalId(db, rawRegionalId);
		const cityId = req.body?.cityId || null;
		const phone = req.body?.phone || null;
		const operationScopes = normalizeOperationScopes(req.body?.operationScopes);

		if (!name || !username || !roleId) {
			res.status(400).json({ ok: false, error: "Informe nome, usuário e cargo." });
			return;
		}
		if (!email) {
			res.status(400).json({ ok: false, error: "Informe um e-mail para enviar o link seguro de primeiro acesso." });
			return;
		}

		// CAN_CREATE_ROLE do roles.ts atual: so cria/atribui cargo de nivel
		// estritamente menor que o proprio. Preserva a regra de negocio
		// exata que ja existia (nao e melhoria nem regressao, e paridade).
		const { rows: roleRows } = await db.query(
			`select id, level, is_global from rot_roles where id = $1 and active = true`,
			[roleId],
		);
		const targetRole = roleRows[0];
		if (!targetRole) {
			res.status(400).json({ ok: false, error: "Cargo inválido." });
			return;
		}
		if (req.rotUser.role_id !== "site_admin" && targetRole.level >= req.rotUser.role_level) {
			res.status(403).json({
				ok: false,
				error: "Você não pode criar um usuário com cargo igual ou superior ao seu.",
			});
			return;
		}
		// Tecnicos, auxiliares, supervisores, lideres e coordenadores sao
		// cargos regionais (is_global=false) — precisam estar vinculados a
		// uma regional, senao o escopo de dados/filtro por regional (RBAC)
		// nao tem o que aplicar.
		if (!targetRole.is_global && !regionalId) {
			res.status(400).json({ ok: false, error: rawRegionalId ? "Regional inválida ou sem vínculo legado." : "Cargos regionais precisam de uma regional vinculada." });
			return;
		}
		if (!req.rotUser.is_global && regionalId && regionalId !== req.rotUser.regional_id) {
			res.status(403).json({ ok: false, error: "Você só pode criar usuários da sua regional." });
			return;
		}

		const passwordHash = await argon2.hash(randomToken());
		const id = randomId("rotuser");

		client = await db.connect();
		await client.query("begin");
		const { rows } = await client.query(
			`insert into rot_users (id, name, username, email, password_hash, role_id, regional_id, city_id, phone, status, must_change_password, created_by)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ativo', true, $10)
			returning *`,
			[id, name, username, email, passwordHash, roleId, regionalId, cityId, phone, req.rotUser.id],
		);
		await replaceUserOperationScopes(client, id, operationScopes, req.rotUser.id);
		const firstAccessUrl = await createFirstAccessLink(client, id);
		await client.query("commit");

		const { rows: withRole } = await db.query(
			`${ADMIN_USER_SELECT} where u.id = $1`,
			[id],
		);
		await auditLog(req, { action: "create", entity: "rot_users", entityId: id, after: publicAdminUser(withRole[0]) });

		let welcomeEmailSent = false;
		if (email) {
			await sendWelcomeFirstAccessEmail({
				to: email,
				name,
				username,
				firstAccessUrl,
				ttlMinutes: FIRST_ACCESS_TTL_MINUTES,
			})
				.then(() => {
					welcomeEmailSent = true;
				})
				.catch((error) => {
					console.error("[rot-users] falha ao enviar e-mail de boas-vindas:", error?.message || error);
				});
		}

		res.json({
			ok: true,
			user: publicAdminUser(withRole[0]),
			welcomeEmailSent,
		});
		void rows;
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		if (error?.constraint === "rot_users_username_key") {
			res.status(409).json({ ok: false, error: "Já existe um usuário com esse nome de usuário." });
			return;
		}
		next(error);
	} finally {
		client?.release();
	}
});

// Gera um novo link seguro de primeiro acesso/redefinição. Não retorna
// senha em texto puro; o token é aleatório, armazenado somente como hash
// e consumido pelo fluxo /auth/reset-password.
router.post("/:id/reset-password", requireRotPermission("rot.users.manage"), validateBody([]), async (req, res, next) => {
	let client;
	try {
		const { rows: beforeRows } = await db.query(`select * from rot_users where id = $1`, [req.params.id]);
		if (!beforeRows[0]) {
			res.status(404).json({ ok: false, error: "Usuário não encontrado." });
			return;
		}
		if (!beforeRows[0].email) {
			res.status(400).json({ ok: false, error: "Este usuário não possui e-mail cadastrado para receber o link seguro." });
			return;
		}
		client = await db.connect();
		await client.query("begin");
		await client.query(
			`update rot_password_resets
			    set consumed_at = now()
			  where user_id = $1 and consumed_at is null and expires_at > now()`,
			[req.params.id],
		);
		const firstAccessUrl = await createFirstAccessLink(client, req.params.id);
		await client.query("commit");
		await auditLog(req, { action: "first_access_link", entity: "rot_users", entityId: req.params.id, before: { action: "first_access_link" } });

		let welcomeEmailSent = false;
		await sendWelcomeFirstAccessEmail({
			to: beforeRows[0].email,
			name: beforeRows[0].name,
			username: beforeRows[0].username,
			firstAccessUrl,
			ttlMinutes: FIRST_ACCESS_TTL_MINUTES,
		})
			.then(() => {
				welcomeEmailSent = true;
			})
			.catch((error) => {
				console.error("[rot-users] falha ao enviar e-mail de redefinição:", error?.message || error);
			});

		res.json({ ok: true, welcomeEmailSent });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.put("/:id", requireRotPermission("rot.users.manage"), validateBody(["name", "email", "role", "regionalId", "cityId", "phone", "status", "operationScopes"], { allowEmpty: false }), async (req, res, next) => {
	try {
		const { rows: beforeRows } = await db.query(`select * from rot_users where id = $1`, [req.params.id]);
		if (!beforeRows[0]) {
			res.status(404).json({ ok: false, error: "Usuário não encontrado." });
			return;
		}
		const payload = req.body || {};
		let roleId = null;
		const { rows: currentRoleRows } = await db.query(`select is_global from rot_roles where id = $1`, [
			beforeRows[0].role_id,
		]);
		let targetIsGlobal = Boolean(currentRoleRows[0]?.is_global);
		let regionalId = beforeRows[0].regional_id;
		if (payload.regionalId !== undefined) {
			regionalId = await resolveLegacyRegionalId(db, payload.regionalId);
			if (payload.regionalId && !regionalId) {
				res.status(400).json({ ok: false, error: "Regional inválida ou sem vínculo legado." });
				return;
			}
		}
		if (payload.role) {
			const { rows: roleRows } = await db.query(
				`select id, level, is_global from rot_roles where id = $1 and active = true`,
				[payload.role],
			);
			if (!roleRows[0]) {
				res.status(400).json({ ok: false, error: "Cargo inválido." });
				return;
			}
			if (req.rotUser.role_id !== "site_admin" && roleRows[0].level >= req.rotUser.role_level) {
				res.status(403).json({ ok: false, error: "Você não pode atribuir esse cargo." });
				return;
			}
			roleId = payload.role;
			targetIsGlobal = roleRows[0].is_global;
		}
		if (!targetIsGlobal && !regionalId) {
			res.status(400).json({ ok: false, error: "Cargos regionais precisam de uma regional vinculada." });
			return;
		}
		const { rows } = await db.query(
			`update rot_users set
				name = coalesce($2, name),
				email = coalesce($3, email),
				role_id = coalesce($4, role_id),
				regional_id = coalesce($5, regional_id),
				city_id = coalesce($6, city_id),
				phone = coalesce($7, phone),
				status = coalesce($8, status),
				updated_at = now()
			where id = $1
			returning *`,
			[
				req.params.id,
				payload.name || null,
				payload.email ? String(payload.email).toLowerCase() : null,
				roleId,
				payload.regionalId !== undefined ? regionalId : null,
				payload.cityId ?? null,
				payload.phone ?? null,
				payload.status || null,
			],
		);
		if (payload.operationScopes !== undefined) {
			await replaceUserOperationScopes(db, req.params.id, payload.operationScopes, req.rotUser.id);
		}
		const { rows: withRole } = await db.query(
			`${ADMIN_USER_SELECT} where u.id = $1`,
			[req.params.id],
		);
		await auditLog(req, {
			action: "update",
			entity: "rot_users",
			entityId: req.params.id,
			before: publicAdminUser(beforeRows[0]),
			after: publicAdminUser(withRole[0]),
		});
		res.json({ ok: true, user: publicAdminUser(withRole[0]) });
		void rows;
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", requireRotPermission("rot.users.manage"), async (req, res, next) => {
	try {
		if (req.params.id === req.rotUser.id) {
			res.status(400).json({ ok: false, error: "Você não pode desativar o próprio usuário." });
			return;
		}
		await db.query(`update rot_users set status = 'inativo', updated_at = now() where id = $1`, [req.params.id]);
		await auditLog(req, { action: "delete", entity: "rot_users", entityId: req.params.id });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

// Cargos disponiveis — usado pelo formulario de criacao/edicao. So mostra
// cargos de nivel menor que o do usuario logado (mesma regra
// CAN_CREATE_ROLE do frontend, agora tambem espelhada aqui pra nao
// oferecer opcao que a criacao real vai rejeitar).
router.get("/roles", noStore, async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select id, name, description, level, is_global from rot_roles where active = true order by level desc`,
		);
		const visible = req.rotUser.role_id === "site_admin"
			? rows
			: rows.filter((role) => role.level < req.rotUser.role_level);
		res.json({ ok: true, items: visible });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
