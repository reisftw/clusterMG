const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const express = require("express");
const fs = require("node:fs/promises");
const multer = require("multer");
const path = require("node:path");
const argon2 = require("argon2");
const db = require("../db");
const { requireFinanPermission, tokenHash } = require("../auth/middleware");
const emailService = require("../email/service");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 700 * 1024 } });
const FINAN_BACKUP_DIR = process.env.FINAN_BACKUP_DIR || "/opt/retiradas/backups/finan";
const MAX_BACKUP_BYTES = Number(process.env.FINAN_BACKUP_MAX_BYTES || 10 * 1024 * 1024 * 1024);
const MAX_BACKUPS = Number(process.env.FINAN_BACKUP_RETENTION || 30);

const PERMISSION_CATALOG = [
	["finan.dashboard.view", "visao_geral", "Visão geral", "dashboard", "Dashboard", "view"],
	["finan.gestao_orcamentaria.view", "planejamento", "Planejamento", "orcamento", "Gestão Orçamentária", "view"],
	["finan.gestao_orcamentaria.manage", "planejamento", "Planejamento", "orcamento", "Gestão Orçamentária", "manage"],
	["finan.contas_pagar.view", "operacao", "Operação", "contas_pagar", "Contas a pagar", "view"],
	["finan.contas_pagar.manage", "operacao", "Operação", "contas_pagar", "Contas a pagar", "manage"],
	["finan.contas_receber.view", "operacao", "Operação", "contas_receber", "Contas a receber", "view"],
	["finan.contas_receber.manage", "operacao", "Operação", "contas_receber", "Contas a receber", "manage"],
	["finan.faturamento.view", "operacao", "Operação", "faturamento", "Faturamento", "view"],
	["finan.notas.view", "operacao", "Operação", "notas", "Notas fiscais", "view"],
	["finan.reports.view", "analises", "Análises", "reports", "Reports", "view"],
	["finan.reports.manage", "analises", "Análises", "reports", "Reports", "manage"],
	["finan.equipe.view", "sistema", "Sistema", "equipe", "Equipe", "view"],
	["finan.equipe.manage", "sistema", "Sistema", "equipe", "Equipe", "manage"],
	["finan.integracoes.view", "sistema", "Sistema", "integracoes", "Integrações APIs", "view"],
	["finan.integracoes.manage", "sistema", "Sistema", "integracoes", "Integrações APIs", "manage"],
	["finan.configuracoes.view", "sistema", "Sistema", "configuracoes", "Configurações gerais", "view"],
	["finan.configuracoes.manage", "sistema", "Sistema", "configuracoes", "Configurações gerais", "manage"],
	["finan.usuarios.manage", "sistema", "Sistema", "usuarios", "Usuários, cargos e permissões", "manage"],
].map(([id, sectionId, sectionLabel, featureId, featureLabel, action], sortOrder) => ({
	id,
	sectionId,
	sectionLabel,
	featureId,
	featureLabel,
	action,
	description: "",
	sortOrder,
}));

router.get("/admin/users", requireFinanPermission("finan.usuarios.manage"), async (_req, res, next) => {
	try {
		const { rows } = await db.query(
			`select id, name, email, role_id, status, mfa_enabled, avatar_url, source_role, created_at, updated_at, last_login_at
			from finan_users
			order by name, email`,
		);
		const items = rows.map(publicAdminUser);
		res.json({
			ok: true,
			items,
			total: items.length,
			stats: {
				total: items.length,
				active: items.filter((item) => item.status !== "inativo").length,
				inactive: items.filter((item) => item.status === "inativo").length,
			},
		});
	} catch (error) {
		next(error);
	}
});

router.post("/admin/users", requireFinanPermission("finan.usuarios.manage"), async (req, res, next) => {
	try {
		const id = crypto.randomUUID();
		const name = String(req.body?.nome || req.body?.name || "").trim();
		const email = String(req.body?.email || "").trim().toLowerCase();
		const role = await resolveFinanRoleId(req.body?.role || req.body?.cargo || "analista_financeiro");
		const temporaryPassword = String(
			req.body?.temporaryPassword ||
				req.body?.password ||
				req.body?.senha ||
				crypto.randomBytes(9).toString("base64url"),
		);
		if (!name || !email) {
			res.status(400).json({ ok: false, error: "Informe nome e e-mail." });
			return;
		}
		if (temporaryPassword.length < 8) {
			res.status(400).json({ ok: false, error: "A senha temporária deve ter pelo menos 8 caracteres." });
			return;
		}
		const passwordHash = await argon2.hash(temporaryPassword);
		const { rows } = await db.query(
			`insert into finan_users (id, name, email, password_hash, role_id, status, mfa_enabled, must_change_password, source_system)
			values ($1, $2, $3, $4, $5, 'ativo', true, true, 'finan')
			returning id, name, email, role_id, status, mfa_enabled, avatar_url, source_role, created_at, updated_at, last_login_at`,
			[id, name, email, passwordHash, role],
		);
		const welcomeEmail = await emailService
			.sendWelcomeFirstAccessEmail({
				to: email,
				name,
				temporaryPassword,
			})
			.catch((error) => ({
				sent: false,
				error: String(error?.message || error),
			}));
		res.json({
			ok: true,
			user: publicAdminUser(rows[0]),
			item: publicAdminUser(rows[0]),
			temporaryPassword,
			welcomeEmail,
			emailWarning: welcomeEmail.sent ? "" : "Usuário criado, mas o e-mail de boas-vindas não foi enviado.",
		});
	} catch (error) {
		next(error);
	}
});

router.put("/admin/users/:id", requireFinanPermission("finan.usuarios.manage"), async (req, res, next) => {
	try {
		const payload = req.body || {};
		const { rows } = await db.query(
			`update finan_users
			set name = coalesce($2, name),
				email = coalesce($3, email),
				role_id = coalesce($4, role_id),
				status = coalesce($5, status),
				mfa_enabled = coalesce($6, mfa_enabled),
				avatar_url = coalesce($7, avatar_url),
				updated_at = now()
			where id = $1
			returning id, name, email, role_id, status, mfa_enabled, avatar_url, source_role, created_at, updated_at, last_login_at`,
			[
				req.params.id,
				textOrNull(payload.nome || payload.name),
				textOrNull(payload.email)?.toLowerCase() || null,
				payload.role || payload.role_id || payload.cargo
					? await resolveFinanRoleId(payload.role || payload.role_id || payload.cargo)
					: null,
				textOrNull(payload.status),
				payload.mfa_enabled === undefined ? null : Boolean(payload.mfa_enabled),
				textOrNull(payload.avatarUrl || payload.avatar_url),
			],
		);
		if (!rows[0]) {
			res.status(404).json({ ok: false, error: "Usuário não encontrado." });
			return;
		}
		res.json({ ok: true, user: publicAdminUser(rows[0]), item: publicAdminUser(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.delete("/admin/users/:id", requireFinanPermission("finan.usuarios.manage"), async (req, res, next) => {
	try {
		await db.query("update finan_users set status = 'inativo', updated_at = now() where id = $1", [req.params.id]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.post("/admin/users/:id/first-access", requireFinanPermission("finan.usuarios.manage"), async (req, res, next) => {
	try {
		const temporaryPassword = crypto.randomBytes(9).toString("base64url");
		const passwordHash = await argon2.hash(temporaryPassword);
		const { rows } = await db.query(
			`update finan_users
			set password_hash = $2,
				must_change_password = true,
				status = 'ativo',
				updated_at = now()
			where id = $1
			returning id, name, email`,
			[req.params.id, passwordHash],
		);
		if (!rows[0]) {
			res.status(404).json({ ok: false, error: "Usuário não encontrado." });
			return;
		}
		await db.query(
			"update finan_sessions set revoked_at = now() where user_id = $1 and revoked_at is null",
			[req.params.id],
		);
		const token = crypto.randomBytes(32).toString("base64url");
		await db.query(
			`insert into finan_password_resets (id, user_id, token_hash, expires_at)
			values ($1, $2, $3, now() + interval '7 days')`,
			[crypto.randomUUID(), req.params.id, tokenHash(token)],
		);
		const resetUrl = `https://finan.retiradas.tech/login?reset=${encodeURIComponent(token)}`;
		const welcomeEmail = await emailService
			.sendWelcomeFirstAccessEmail({
				to: rows[0].email,
				name: rows[0].name || rows[0].email,
				temporaryPassword,
			})
			.catch((error) => ({
				sent: false,
				error: String(error?.message || error),
			}));
		res.json({
			ok: true,
			url: resetUrl,
			passwordResetLink: resetUrl,
			token,
			temporaryPassword,
			welcomeEmail,
			emailWarning: welcomeEmail.sent ? "" : "Senha gerada, mas o e-mail de boas-vindas não foi enviado.",
		});
	} catch (error) {
		next(error);
	}
});

router.post("/admin/avatars", requireFinanPermission("finan.usuarios.manage"), upload.single("avatar"), async (req, res) => {
	const dataUrl = req.file
		? `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
		: "";
	res.json({ ok: true, avatarUrl: dataUrl });
});

router.get("/admin/roles", requireFinanPermission("finan.usuarios.manage"), async (_req, res, next) => {
	try {
		const { rows } = await db.query(
			`select id, name, description, permissions, is_admin, system_role, active
			from finan_roles
			where active is not false
				and (
					is_admin = true
					or permissions::text like '%finan.%'
					or permissions::text like '%financeiro.%'
					or id in ('admin', 'coordenador_financeiro', 'analista_financeiro')
				)
				and id not in ('analistafinanceiro', 'coordenadorfinanceiro')
			order by is_admin desc, active desc, name`,
		);
		res.json({
			ok: true,
			roles: rows.map(publicRole),
			permissions: PERMISSION_CATALOG,
		});
	} catch (error) {
		next(error);
	}
});

router.put("/admin/roles/:id", requireFinanPermission("finan.usuarios.manage"), async (req, res, next) => {
	try {
		const id = String(req.params.id || "").trim().toLowerCase();
		const permissions = normalizeFinanPermissions(req.body?.permissions);
		const { rows } = await db.query(
			`insert into finan_roles (id, name, description, permissions, is_admin, system_role, active)
			values ($1, $2, $3, $4::jsonb, $5, false, $6)
			on conflict (id) do update set
				name = excluded.name,
				description = excluded.description,
				permissions = excluded.permissions,
				is_admin = excluded.is_admin,
				active = excluded.active,
				updated_at = now()
			returning id, name, description, permissions, is_admin, system_role, active`,
			[
				id,
				String(req.body?.name || id),
				String(req.body?.description || ""),
				JSON.stringify(permissions),
				Boolean(req.body?.is_admin),
				req.body?.active !== false,
			],
		);
		res.json({ ok: true, role: publicRole(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.delete("/admin/roles/:id", requireFinanPermission("finan.usuarios.manage"), async (req, res, next) => {
	try {
		await db.query("update finan_roles set active = false, updated_at = now() where id = $1", [req.params.id]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.get("/admin/regionais", async (_req, res) => {
	res.json({ ok: true, regionais: [] });
});

router.get("/admin/oauth/:provider", async (req, res, next) => {
	try {
		const config = await readSetting(`oauth_${req.params.provider}`);
		res.json({ ok: true, config: config || {} });
	} catch (error) {
		next(error);
	}
});

router.put("/admin/oauth/:provider", requireFinanPermission("finan.configuracoes.manage"), async (req, res, next) => {
	try {
		const config = req.body || {};
		await writeSetting(`oauth_${req.params.provider}`, config);
		res.json({ ok: true, config });
	} catch (error) {
		next(error);
	}
});

router.get("/notifications/preferences", async (_req, res, next) => {
	try {
		res.json(await readSetting("notificacoes") || {});
	} catch (error) {
		next(error);
	}
});

router.put("/notifications/preferences", requireFinanPermission("finan.configuracoes.manage"), async (req, res, next) => {
	try {
		const preferences = req.body || {};
		await writeSetting("notificacoes", preferences);
		const avatarAppliedToUsers = await applyDefaultAvatarToUsers(preferences);
		res.json({ ...preferences, avatarAppliedToUsers });
	} catch (error) {
		next(error);
	}
});

router.get("/notifications", async (_req, res) => {
	res.json({ ok: true, items: [], total: 0 });
});

router.get("/notifications/stats", async (_req, res) => {
	res.json({ ok: true, total: 0, unread: 0, byType: [] });
});

router.get("/notifications/counters", async (_req, res) => {
	res.json({ documentosPendentes: 0, atendimentoAbertos: 0 });
});

router.post("/notifications/read", async (_req, res) => {
	res.json({ ok: true });
});

router.post("/notifications/check-critical", async (_req, res) => {
	res.json({ ok: true, alerts: [] });
});

router.get("/admin/api-status", async (_req, res, next) => {
	try {
		const { rows } = await db.query("select id, provider, name, status, updated_at from finan_integration_configs order by name");
		res.json({ ok: true, services: rows, items: rows });
	} catch (error) {
		next(error);
	}
});

["hubsoft", "cvortex", "senior"].forEach((provider) => {
	router.get(`/admin/${provider}/config`, async (_req, res, next) => {
		try {
			res.json({ ok: true, config: await readIntegration(provider) });
		} catch (error) {
			next(error);
		}
	});
	router.put(`/admin/${provider}/config`, requireFinanPermission("finan.integracoes.manage"), async (req, res, next) => {
		try {
			const config = req.body || {};
			await writeIntegration(provider, config);
			res.json({ ok: true, config });
		} catch (error) {
			next(error);
		}
	});
	router.post(`/admin/${provider}/test`, requireFinanPermission("finan.integracoes.manage"), async (_req, res) => {
		res.json({ ok: true, status: "pendente", message: "Configuração dedicada salva no Finan." });
	});
	router.post(`/admin/${provider}/associate`, requireFinanPermission("finan.integracoes.manage"), async (_req, res) => {
		res.json({ ok: true });
	});
});

router.get("/admin/database/backups", async (_req, res, next) => {
	try {
		res.json(await buildBackupStatus());
	} catch (error) {
		next(error);
	}
});

router.post("/admin/database/backups", requireFinanPermission("finan.configuracoes.manage"), async (req, res, next) => {
	try {
		await fs.mkdir(FINAN_BACKUP_DIR, { recursive: true });
		const fileName = `finan-${new Date().toISOString().replace(/[:.]/g, "-")}-manual.dump`;
		const filePath = path.join(FINAN_BACKUP_DIR, fileName);
		await runPgDump(filePath);
		await logAudit(req, "create", "database_backup", fileName, { fileName });
		res.json({
			ok: true,
			message: "Backup do Finan criado com sucesso.",
			status: await buildBackupStatus(),
		});
	} catch (error) {
		next(error);
	}
});

router.get("/admin/email/config", async (_req, res, next) => {
	try {
		res.json({ ok: true, config: emailService.sanitizeConfig(await emailService.getConfig()) });
	} catch (error) {
		next(error);
	}
});

router.put("/admin/email/config", requireFinanPermission("finan.configuracoes.manage"), async (req, res, next) => {
	try {
		res.json({ ok: true, config: await emailService.saveConfig(req.body || {}) });
	} catch (error) {
		next(error);
	}
});

router.post("/admin/email/test", requireFinanPermission("finan.configuracoes.manage"), async (req, res, next) => {
	try {
		const to = textOrNull(req.body?.to) || req.finanUser?.email || "";
		res.json(await emailService.sendTestEmail(to));
	} catch (error) {
		next(error);
	}
});

router.get("/admin/email/logs", async (req, res, next) => {
	try {
		const limit = clamp(Number(req.query.limit || 20), 1, 200);
		const offset = Math.max(0, Number(req.query.offset || 0));
		const { rows } = await db.query(
			`select id, type, to_email, subject, status, error_message, provider_message_id, meta, created_at
			from finan_email_logs
			order by created_at desc
			limit $1 offset $2`,
			[limit, offset],
		);
		const count = await db.query("select count(*)::int as total from finan_email_logs");
		res.json({ ok: true, items: rows, total: count.rows[0]?.total || rows.length });
	} catch (error) {
		next(error);
	}
});

router.get("/admin/audit-logs", async (req, res, next) => {
	try {
		const limit = clamp(Number(req.query.limit || 50), 1, 200);
		const offset = Math.max(0, Number(req.query.offset || 0));
		const filters = [];
		const params = [];
		addLikeFilter(filters, params, "coalesce(user_id, '') || ' ' || coalesce(user_name, '') || ' ' || coalesce(user_email, '')", req.query.userId);
		addTextFilter(filters, params, "module", req.query.module);
		addTextFilter(filters, params, "entity", req.query.entity);
		addTextFilter(filters, params, "action", req.query.action);
		addTextFilter(filters, params, "setor_id", req.query.setorId);
		if (req.query.startDate) {
			params.push(`${req.query.startDate} 00:00:00`);
			filters.push(`created_at >= $${params.length}::timestamptz`);
		}
		if (req.query.endDate) {
			params.push(`${req.query.endDate} 23:59:59`);
			filters.push(`created_at <= $${params.length}::timestamptz`);
		}
		const where = filters.length ? `where ${filters.join(" and ")}` : "";
		const { rows } = await db.query(
			`select id, user_id, user_name, user_email, setor_id, department_id, module, entity, action,
				coalesce(record_id, entity_id) as record_id, ip_address, user_agent,
				before_data, after_data, changed_fields, created_at
			from finan_audit_logs
			${where}
			order by created_at desc
			limit $${params.length + 1} offset $${params.length + 2}`,
			[...params, limit, offset],
		);
		const total = await db.query(`select count(*)::int as total from finan_audit_logs ${where}`, params);
		res.json({ ok: true, items: rows.map(publicAuditLog), total: total.rows[0]?.total || rows.length });
	} catch (error) {
		next(error);
	}
});

router.get("/admin/audit-logs/options", async (_req, res, next) => {
	try {
		const [modules, setores] = await Promise.all([
			db.query("select distinct module from finan_audit_logs where module is not null order by module"),
			db.query("select distinct setor_id from finan_audit_logs where setor_id is not null order by setor_id"),
		]);
		res.json({
			ok: true,
			modules: modules.rows.map((row) => row.module),
			setores: setores.rows.map((row) => row.setor_id),
		});
	} catch (error) {
		next(error);
	}
});

router.get("/admin/audit-logs/:id", async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select id, user_id, user_name, user_email, setor_id, department_id, module, entity, action,
				coalesce(record_id, entity_id) as record_id, ip_address, user_agent,
				before_data, after_data, changed_fields, created_at
			from finan_audit_logs
			where id::text = $1
			limit 1`,
			[String(req.params.id)],
		);
		if (!rows[0]) {
			res.status(404).json({ ok: false, error: "Log não encontrado." });
			return;
		}
		res.json({ ok: true, item: publicAuditLog(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.get("/documents", async (_req, res) => {
	res.json({ ok: true, items: [] });
});

router.get("/documents/*", async (_req, res) => {
	res.json({ ok: true, data: null });
});

router.post("/admin/documents", async (_req, res) => {
	res.json({ ok: true, documentId: crypto.randomUUID() });
});

router.put("/admin/documents/*", async (_req, res) => {
	res.json({ ok: true });
});

router.delete("/admin/documents/*", async (_req, res) => {
	res.json({ ok: true });
});

async function readSetting(key) {
	const { rows } = await db.query("select value from finan_settings where key = $1 limit 1", [key]);
	return rows[0]?.value || null;
}

async function writeSetting(key, value) {
	await db.query(
		`insert into finan_settings (key, value, updated_at)
		values ($1, $2::jsonb, now())
		on conflict (key) do update set value = excluded.value, updated_at = now()`,
		[key, JSON.stringify(value || {})],
	);
}

async function applyDefaultAvatarToUsers(preferences = {}) {
	const avatarUrl = getDefaultAvatarUrl(preferences);
	if (!avatarUrl) return { updated: 0, skipped: true };
	const { rowCount } = await db.query(
		"update finan_users set avatar_url = $1, updated_at = now()",
		[avatarUrl],
	);
	return { updated: rowCount || 0, skipped: false };
}

function getDefaultAvatarUrl(preferences = {}) {
	return textOrNull(
		preferences.defaultAvatarUrl ||
			preferences.defaultAvatarDataUrl ||
			preferences.defaultAvatar ||
			preferences.avatarUrl ||
			preferences.avatar_url,
	);
}

async function buildBackupStatus() {
	await fs.mkdir(FINAN_BACKUP_DIR, { recursive: true });
	const fileNames = await fs.readdir(FINAN_BACKUP_DIR).catch(() => []);
	const backups = (
		await Promise.all(
			fileNames
				.filter((fileName) => /^finan-.*\.(dump|sql|gz)$/.test(fileName))
				.map(async (fileName) => {
					const stat = await fs.stat(path.join(FINAN_BACKUP_DIR, fileName));
					return {
						fileName,
						createdAt: stat.mtime.toISOString(),
						sizeBytes: stat.size,
						reason: fileName.includes("-manual") ? "manual" : "scheduled",
						encrypted: false,
					};
				}),
		)
	).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
	const usedBytes = backups.reduce((sum, backup) => sum + Number(backup.sizeBytes || 0), 0);
	const dbSize = await db.query(
		`select current_database() as name,
			pg_database_size(current_database())::bigint as size_bytes,
			pg_size_pretty(pg_database_size(current_database())) as pretty`,
	);
	return {
		ok: true,
		database: {
			name: dbSize.rows[0]?.name || "",
			sizeBytes: Number(dbSize.rows[0]?.size_bytes || 0),
			pretty: dbSize.rows[0]?.pretty || "",
		},
		storage: {
			backupDir: FINAN_BACKUP_DIR,
			usedBytes,
			maxBytes: MAX_BACKUP_BYTES,
			encryptionEnabled: false,
		},
		retention: {
			currentBackups: backups.length,
			maxBackups: MAX_BACKUPS,
		},
		backups,
		items: backups,
		latest: backups[0] || null,
	};
}

function runPgDump(filePath) {
	return new Promise((resolve, reject) => {
		const env = { ...process.env };
		if (process.env.FINAN_DATABASE_URL) {
			env.DATABASE_URL = process.env.FINAN_DATABASE_URL;
		} else {
			env.PGHOST = process.env.FINAN_PGHOST || process.env.PGHOST || "";
			env.PGPORT = process.env.FINAN_PGPORT || process.env.PGPORT || "5432";
			env.PGUSER = process.env.FINAN_PGUSER || process.env.PGUSER || "";
			env.PGPASSWORD = process.env.FINAN_PGPASSWORD || process.env.PGPASSWORD || "";
			env.PGDATABASE = process.env.FINAN_PGDATABASE || process.env.PGDATABASE || "";
		}
		const args = process.env.FINAN_DATABASE_URL
			? ["--format=custom", "--no-owner", "--no-privileges", "--file", filePath, process.env.FINAN_DATABASE_URL]
			: ["--format=custom", "--no-owner", "--no-privileges", "--file", filePath];
		execFile("pg_dump", args, { env, timeout: 10 * 60 * 1000 }, (error) => {
			if (error) reject(error);
			else resolve();
		});
	});
}

function normalizeEmailConfig(config = {}) {
	const value = config || {};
	return {
		enabled: value.enabled !== false,
		smtpHost: value.smtpHost || process.env.FINAN_SMTP_HOST || "smtp.hostinger.com",
		smtpPort: Number(value.smtpPort || process.env.FINAN_SMTP_PORT || 465),
		smtpSecure: value.smtpSecure !== false,
		smtpUser: value.smtpUser || process.env.FINAN_SMTP_USER || "",
		smtpPassword: "",
		fromName: value.fromName || process.env.FINAN_EMAIL_FROM_NAME || "Finan",
		fromEmail: normalizeFinanFromEmail(value.fromEmail || process.env.FINAN_EMAIL_FROM),
		replyTo: value.replyTo || process.env.FINAN_EMAIL_REPLY_TO || value.smtpUser || "",
		appUrl: value.appUrl || process.env.FINAN_PUBLIC_URL || "https://finan.retiradas.tech",
		mfaEmailEnabled: value.mfaEmailEnabled !== false,
		mfaEmailTtlMinutes: Number(value.mfaEmailTtlMinutes || process.env.FINAN_MFA_EMAIL_TTL_MINUTES || 10),
		hasPassword: Boolean(value.smtpPassword || process.env.FINAN_SMTP_PASSWORD),
		templates: normalizeFinanEmailTemplates(value.templates),
	};
}

function normalizeFinanFromEmail(value) {
	const email = String(value || "").trim();
	if (!email || email === "naoresponda@retiradas.tech") {
		return "naoresponda@finan.retiradas.tech";
	}
	return email;
}

function normalizeFinanEmailTemplates(templates = {}) {
	return Object.fromEntries(
		Object.entries(templates || {}).map(([key, template]) => [
			key,
			Object.fromEntries(
				Object.entries(template || {}).map(([field, value]) => [
					field,
					typeof value === "string" ? value.replace(/Retiradas/g, "Finan") : value,
				]),
			),
		]),
	);
}

async function readIntegration(provider) {
	const { rows } = await db.query("select config from finan_integration_configs where provider = $1 or id = $1 limit 1", [provider]);
	return rows[0]?.config || {};
}

async function writeIntegration(provider, config) {
	await db.query(
		`insert into finan_integration_configs (id, provider, name, status, config, updated_at)
		values ($1, $1, $2, 'ativo', $3::jsonb, now())
		on conflict (id) do update set config = excluded.config, status = excluded.status, updated_at = now()`,
		[provider, providerLabel(provider), JSON.stringify(config || {})],
	);
}

function publicAdminUser(row) {
	return {
		id: row.id,
		uid: row.id,
		nome: row.name,
		name: row.name,
		email: row.email,
		role: row.role_id,
		role_id: row.role_id,
		cargo: row.role_id,
		status: row.status,
		mfa_enabled: row.mfa_enabled,
		avatarUrl: row.avatar_url || "",
		avatar_url: row.avatar_url || "",
		source_role: row.source_role,
		source_system: "finan",
		created_at: row.created_at,
		updated_at: row.updated_at,
		last_login_at: row.last_login_at,
	};
}

function publicRole(row) {
	const roleName = row.name || row.id;
	return {
		id: row.id,
		value: row.id,
		key: row.id,
		name: roleName,
		label: roleName,
		description: row.description || "",
		active: row.active !== false,
		systemRole: row.system_role !== false,
		system_role: row.system_role !== false,
		isAdmin: Boolean(row.is_admin),
		is_admin: Boolean(row.is_admin),
		permissions: row.permissions || [],
		source: "finan",
		scope: "finan",
	};
}

function publicAuditLog(row) {
	return {
		id: String(row.id),
		userId: row.user_id || "",
		userName: row.user_name || "",
		userEmail: row.user_email || "",
		setorId: row.setor_id || "",
		departmentId: row.department_id || "",
		module: row.module || "finan",
		entity: row.entity || "",
		action: row.action || "",
		recordId: row.record_id || "",
		ipAddress: row.ip_address || "",
		userAgent: row.user_agent || "",
		beforeData: row.before_data || {},
		afterData: row.after_data || {},
		changedFields: Array.isArray(row.changed_fields) ? row.changed_fields : [],
		changeDescriptions: [],
		createdAt: row.created_at,
		summary: `${row.action || "alteração"} em ${row.entity || row.module || "Finan"}`,
	};
}

async function logAudit(req, action, entity, entityId, metadata = {}) {
	await db.query(
		`insert into finan_audit_logs (
			user_id, user_name, user_email, action, module, entity, entity_id,
			record_id, ip_address, user_agent, after_data, changed_fields
		)
		values ($1, $2, $3, $4, 'configuracao', $5, $6, $6, $7, $8, $9::jsonb, '[]'::jsonb)`,
		[
			req.finanUser?.id || null,
			req.finanUser?.name || req.finanUser?.email || null,
			req.finanUser?.email || null,
			action,
			entity,
			entityId,
			req.ip || "",
			req.get("user-agent") || "",
			JSON.stringify(metadata),
		],
	);
}

async function resolveFinanRoleId(value) {
	const requested = String(value || "analista_financeiro").trim().toLowerCase();
	const { rows } = await db.query(
		`select id
		from finan_roles
		where active is not false
			and id = $1
			and id not in ('analistafinanceiro', 'coordenadorfinanceiro')
			and (
				is_admin = true
				or permissions::text like '%finan.%'
				or permissions::text like '%financeiro.%'
				or id in ('admin', 'coordenador_financeiro', 'analista_financeiro')
			)
		limit 1`,
		[requested],
	);
	return rows[0]?.id || "analista_financeiro";
}

function normalizeFinanPermissions(permissions = []) {
	const mapped = (Array.isArray(permissions) ? permissions : [])
		.map((permission) =>
			String(permission || "")
				.replace(/^financeiro\.visao_geral\.view$/, "finan.dashboard.view")
				.replace(/^financeiro\.visao_geral\.manage$/, "finan.dashboard.view")
				.replace(/^financeiro\.gestao_orcamento\./, "finan.gestao_orcamentaria.")
				.replace(/^financeiro\./, "finan."),
		)
		.filter((permission) => permission === "*" || permission.startsWith("finan."));
	if (!mapped.length) mapped.push("finan.dashboard.view");
	return [...new Set(mapped)];
}

function addTextFilter(filters, params, column, value) {
	const text = textOrNull(value);
	if (!text) return;
	params.push(text);
	filters.push(`${column} = $${params.length}`);
}

function addLikeFilter(filters, params, expression, value) {
	const text = textOrNull(value);
	if (!text) return;
	params.push(`%${text}%`);
	filters.push(`${expression} ilike $${params.length}`);
}

function clamp(value, min, max) {
	if (!Number.isFinite(value)) return min;
	return Math.max(min, Math.min(max, value));
}

function providerLabel(provider) {
	return { hubsoft: "Hubsoft", cvortex: "Cvortex", senior: "Sênior" }[provider] || provider;
}

function textOrNull(value) {
	const text = String(value || "").trim();
	return text || null;
}

module.exports = router;
