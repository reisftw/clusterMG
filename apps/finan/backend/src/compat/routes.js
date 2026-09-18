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
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { IdParamDTO, AdminUserUpdateDTO } = require("../dtos/userDto");
const { LegacyRoleUpsertDTO } = require("../dtos/roleDto");
const { ProviderParamDTO, RawIntegrationConfigDTO } = require("../dtos/integrationDto");
const notificationsService = require("../notifications/notificationsService");
const { decorateFinanAuditLog } = require("../audit/auditSummary");
const { PERMISSION_CATALOG } = require("../rbac/permissionCatalog");

const router = express.Router();
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 700 * 1024 },
	fileFilter: (_req, file, callback) => {
		if (/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype || "")) {
			callback(null, true);
			return;
		}
		const error = new Error("Envie apenas imagens PNG, JPEG, WEBP ou GIF.");
		error.statusCode = 400;
		callback(error);
	},
});
const FINAN_BACKUP_DIR = process.env.FINAN_BACKUP_DIR || "/opt/retiradas/backups/finan";
const MAX_BACKUP_BYTES = Number(process.env.FINAN_BACKUP_MAX_BYTES || 10 * 1024 * 1024 * 1024);
const MAX_BACKUPS = Number(process.env.FINAN_BACKUP_RETENTION || 30);

// PERMISSION_CATALOG vem do canônico (rbac/permissionCatalog.js) — antes
// esse array vivia duplicado aqui, com uma lista de permissões diferente
// do canônico (que é a WHITELIST usada pelo DTO de cargo, roleDto.js).
// Isso causava um bug real: a tela de Cargos e Permissões oferecia
// opções (Notas > Gerenciar, Central de Pendências, Contratos) que o
// canônico não conhecia — marcar essas opções e salvar um cargo falhava
// com "Dados inválidos." (400), porque o `enumField` do DTO rejeitava
// qualquer permissão fora da whitelist. Importar do canônico em vez de
// duplicar elimina essa classe de bug pra sempre.
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
		// Diferente da edicao (PUT /admin/users/:id, onde preservar o cargo
		// atual e mais seguro que resetar), aqui e um usuario NOVO — sem
		// cargo anterior pra preservar, entao mantem o fallback explicito
		// pra analista_financeiro se o id pedido nao for valido.
		const role = (await resolveFinanRoleId(req.body?.role || req.body?.cargo || "analista_financeiro")) || "analista_financeiro";
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

router.put(
	"/admin/users/:id",
	requireFinanPermission("finan.usuarios.manage"),
	validate({ params: IdParamDTO, body: AdminUserUpdateDTO }),
	async (req, res, next) => {
		try {
			const payload = req.validated.body;
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
					req.validated.params.id,
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
	},
);

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

router.post("/admin/avatars", requireFinanPermission("finan.usuarios.manage"), upload.single("avatar"), async (req, res, next) => {
	try {
		const dataUrl = req.file
			? `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
			: "";
		res.json({ ok: true, avatarUrl: dataUrl });
	} catch (error) {
		next(error);
	}
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
					or permissions::text like '%relatorios_financeiros:%'
					or id in ('admin', 'coordenador_financeiro', 'analista_financeiro')
				)
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

router.put(
	"/admin/roles/:id",
	requireFinanPermission("finan.usuarios.manage"),
	validate({ params: IdParamDTO, body: LegacyRoleUpsertDTO }),
	async (req, res, next) => {
		try {
			const id = req.validated.params.id.toLowerCase();
			const dto = req.validated.body;

			// Mesma checagem de `users/routes.js#POST /roles`: `is_admin` (acesso
			// total) so pode ser concedido por quem ja e admin.
			if (dto.is_admin && !req.finanUser?.is_admin) {
				res.status(403).json({
					ok: false,
					error: "Somente um administrador pode conceder acesso total (is_admin) a um cargo.",
				});
				return;
			}

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
					dto.name || id,
					dto.description || "",
					JSON.stringify(dto.permissions || []),
					Boolean(dto.is_admin),
					dto.active !== false,
				],
			);
			res.json({ ok: true, role: publicRole(rows[0]) });
		} catch (error) {
			next(error);
		}
	},
);

router.delete("/admin/roles/:id", requireFinanPermission("finan.usuarios.manage"), async (req, res, next) => {
	try {
		await db.query("update finan_roles set active = false, updated_at = now() where id = $1", [req.params.id]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.get("/admin/regionais", async (_req, res, next) => {
	try {
		res.json({ ok: true, regionais: [] });
	} catch (error) {
		next(error);
	}
});

router.get(
	"/admin/oauth/:provider",
	requireFinanPermission("finan.configuracoes.view"),
	noStore,
	async (req, res, next) => {
		try {
			const config = await readSetting(`oauth_${req.params.provider}`);
			res.json({ ok: true, config: sanitizeOAuthConfig(config || {}) });
		} catch (error) {
			next(error);
		}
	},
);

router.put(
	"/admin/oauth/:provider",
	requireFinanPermission("finan.configuracoes.manage"),
	validate({ params: ProviderParamDTO, body: RawIntegrationConfigDTO }),
	async (req, res, next) => {
		try {
			const config = req.validated.body;
			await writeSetting(`oauth_${req.validated.params.provider}`, config);
			// Achado de seguranca do mapeamento de DTOs: esta rota devolvia o
			// `req.body` cru (incluindo `clientSecret` em texto puro) na resposta
			// do PUT, mesmo a rota GET equivalente ja mascarando (ver
			// `sanitizeOAuthConfig`, poucas linhas acima). Corrigido para usar a
			// mesma sanitizacao dos dois lados.
			res.json({ ok: true, config: sanitizeOAuthConfig(config) });
		} catch (error) {
			next(error);
		}
	},
);

router.get("/notifications/preferences", requireFinanPermission("finan.configuracoes.view"), async (_req, res, next) => {
	try {
		res.json(await readSetting("notificacoes") || {});
	} catch (error) {
		next(error);
	}
});

router.put(
	"/notifications/preferences",
	requireFinanPermission("finan.configuracoes.manage"),
	validate({ body: RawIntegrationConfigDTO }),
	async (req, res, next) => {
		try {
			const preferences = req.validated.body;
			await writeSetting("notificacoes", preferences);
			const avatarAppliedToUsers = await applyDefaultAvatarToUsers(preferences);
			res.json({ ...preferences, avatarAppliedToUsers });
		} catch (error) {
			next(error);
		}
	},
);

router.get("/notifications", async (req, res, next) => {
	try {
		const { limit, offset, type, severity, unread } = req.query;
		const result = await notificationsService.listNotifications({
			user: req.finanUser,
			limit,
			offset,
			type,
			severity,
			unread,
		});
		res.json({ ok: true, items: result.items, total: result.items.length, unreadCount: result.unreadCount });
	} catch (error) {
		next(error);
	}
});

router.get("/notifications/stats", async (req, res, next) => {
	try {
		res.json(await notificationsService.getNotificationStats({ user: req.finanUser }));
	} catch (error) {
		next(error);
	}
});

router.get("/notifications/counters", async (req, res, next) => {
	try {
		res.json(await notificationsService.getCounters({ user: req.finanUser }));
	} catch (error) {
		next(error);
	}
});

router.post("/notifications/read", async (req, res, next) => {
	try {
		const { ids, all } = req.body || {};
		res.json(
			await notificationsService.markNotificationsRead({
				user: req.finanUser,
				ids,
				all: all === true,
			}),
		);
	} catch (error) {
		next(error);
	}
});

router.post(
	"/notifications/check-critical",
	requireFinanPermission("finan.configuracoes.manage"),
	async (req, res, next) => {
		try {
			res.json(
				await notificationsService.createCriticalServiceAlerts({ user: req.finanUser }),
			);
		} catch (error) {
			next(error);
		}
	},
);

// Preferencias PESSOAIS de notificacao (som, tipos habilitados, horario
// silencioso) — uma linha por usuario em finan_notification_preferences.
// Path diferente de "/notifications/preferences" acima de proposito: essa
// rota mais antiga guarda configuracao GLOBAL do sistema (inclusive o
// avatar padrao aplicado a todos os usuarios via applyDefaultAvatarToUsers)
// e nao deve ser confundida com preferencia individual.
router.get("/notifications/personal-preferences", async (req, res, next) => {
	try {
		res.json(await notificationsService.getPreferences({ user: req.finanUser }));
	} catch (error) {
		next(error);
	}
});

router.put("/notifications/personal-preferences", async (req, res, next) => {
	try {
		res.json(
			await notificationsService.savePreferences({
				user: req.finanUser,
				preferences: req.body || {},
			}),
		);
	} catch (error) {
		next(error);
	}
});

router.get("/admin/api-status", requireFinanPermission("finan.configuracoes.view"), noStore, async (_req, res, next) => {
	try {
		const { rows } = await db.query("select id, provider, name, status, updated_at from finan_integration_configs order by name");
		res.json({ ok: true, services: rows, items: rows });
	} catch (error) {
		next(error);
	}
});

["hubsoft", "cvortex", "senior"].forEach((provider) => {
	router.get(
		`/admin/${provider}/config`,
		requireFinanPermission("finan.integracoes.view"),
		noStore,
		async (_req, res, next) => {
			try {
				res.json({ ok: true, config: sanitizeIntegrationConfig(await readIntegration(provider)) });
			} catch (error) {
				next(error);
			}
		},
	);
	router.put(
		`/admin/${provider}/config`,
		requireFinanPermission("finan.integracoes.manage"),
		validate({ body: RawIntegrationConfigDTO }),
		async (req, res, next) => {
			try {
				const config = req.validated.body;
				await writeIntegration(provider, config);
				// Mesmo achado/correcao do PUT /admin/oauth/:provider acima: nao
				// devolver o config cru (token/secret/password em texto puro).
				res.json({ ok: true, config: sanitizeIntegrationConfig(config) });
			} catch (error) {
				next(error);
			}
		},
	);
	router.post(`/admin/${provider}/test`, requireFinanPermission("finan.integracoes.manage"), async (_req, res, next) => {
		try {
			res.json({ ok: true, status: "pendente", message: "Configuração dedicada salva no Finan." });
		} catch (error) {
			next(error);
		}
	});
	router.post(`/admin/${provider}/associate`, requireFinanPermission("finan.integracoes.manage"), async (_req, res, next) => {
		try {
			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	});
});

router.get("/admin/database/backups", requireFinanPermission("finan.configuracoes.view"), noStore, async (_req, res, next) => {
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

router.post("/admin/database/backups/:fileName/restore", requireFinanPermission("finan.configuracoes.manage"), async (req, res, next) => {
	try {
		if (String(req.body?.confirmation || "") !== "RESTAURAR BANCO") {
			res.status(400).json({ ok: false, error: "Digite RESTAURAR BANCO para confirmar." });
			return;
		}
		const fileName = path.basename(String(req.params.fileName || ""));
		if (!fileName || !/^finan-.*\.(dump|sql|gz)$/.test(fileName)) {
			res.status(400).json({ ok: false, error: "Backup inválido." });
			return;
		}
		const filePath = path.resolve(FINAN_BACKUP_DIR, fileName);
		if (!filePath.startsWith(`${path.resolve(FINAN_BACKUP_DIR)}${path.sep}`)) {
			res.status(400).json({ ok: false, error: "Backup inválido." });
			return;
		}
		await fs.access(filePath).catch(() => {
			throw Object.assign(new Error("Backup não encontrado."), { statusCode: 404 });
		});

		// Backup de seguranca antes de restaurar, mesmo padrao do Retiradas
		// (vps/api/src/databaseBackups.js:restoreBackup) — se o restore falhar
		// ou for o arquivo errado, o estado anterior ainda pode ser recuperado.
		await fs.mkdir(FINAN_BACKUP_DIR, { recursive: true });
		const safetyFileName = `finan-${new Date().toISOString().replace(/[:.]/g, "-")}-pre-restore.dump`;
		await runPgDump(path.join(FINAN_BACKUP_DIR, safetyFileName));

		await runPgRestore(filePath);
		await logAudit(req, "restore", "database_backup", fileName, { fileName });

		res.json({
			ok: true,
			restoredFileName: fileName,
			safetyBackup: safetyFileName,
			status: await buildBackupStatus(),
		});
	} catch (error) {
		next(error);
	}
});

router.get("/admin/email/config", requireFinanPermission("finan.configuracoes.view"), noStore, async (_req, res, next) => {
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

router.get("/admin/email/logs", requireFinanPermission("finan.configuracoes.view"), noStore, async (req, res, next) => {
	try {
		const limit = clamp(Number(req.query.limit || 20), 1, 200);
		const offset = Math.max(0, Number(req.query.offset || 0));
		const filters = [];
		const params = [];
		const status = textOrNull(req.query.status);
		if (status === "enviado" || status === "erro") {
			params.push(status);
			filters.push(`status = $${params.length}`);
		}
		if (textOrNull(req.query.type)) {
			params.push(req.query.type);
			filters.push(`type = $${params.length}`);
		}
		if (textOrNull(req.query.q)) {
			params.push(`%${req.query.q}%`);
			filters.push(
				`(to_email ilike $${params.length} or subject ilike $${params.length} or error_message ilike $${params.length})`,
			);
		}
		const where = filters.length ? `where ${filters.join(" and ")}` : "";
		const { rows } = await db.query(
			`select id, type, to_email as "to", subject, status, error_message as error, provider_message_id, meta, created_at
			from finan_email_logs
			${where}
			order by created_at desc
			limit $${params.length + 1} offset $${params.length + 2}`,
			[...params, limit, offset],
		);
		const count = await db.query(`select count(*)::int as total from finan_email_logs ${where}`, params);
		res.json({ ok: true, items: rows, total: count.rows[0]?.total || rows.length });
	} catch (error) {
		next(error);
	}
});

router.get("/admin/audit-logs", requireFinanPermission("finan.configuracoes.view"), noStore, async (req, res, next) => {
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
		// Busca livre (roteiro Finan #11): cobre fornecedor/registro/valor sem
		// depender de uma coluna fixa, ja que finan_audit_logs registra
		// entidades bem diferentes (usuario, cargo, integracao, orcamento...)
		// e o dado relevante de cada uma mora dentro de before_data/after_data.
		addLikeFilter(
			filters,
			params,
			"coalesce(record_id, entity_id, '') || ' ' || coalesce(before_data::text, '') || ' ' || coalesce(after_data::text, '')",
			req.query.q,
		);
		const minValue = textOrNull(req.query.minValue);
		if (minValue !== null && Number.isFinite(Number(minValue))) {
			params.push(Number(minValue));
			filters.push(
				`greatest(coalesce((after_data->>'realizado')::numeric, 0), abs(coalesce((after_data->>'realizado')::numeric, 0))) >= $${params.length}`,
			);
		}
		const maxValue = textOrNull(req.query.maxValue);
		if (maxValue !== null && Number.isFinite(Number(maxValue))) {
			params.push(Number(maxValue));
			filters.push(
				`greatest(coalesce((after_data->>'realizado')::numeric, 0), abs(coalesce((after_data->>'realizado')::numeric, 0))) <= $${params.length}`,
			);
		}
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

router.get("/admin/audit-logs/options", requireFinanPermission("finan.configuracoes.view"), noStore, async (_req, res, next) => {
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

// Roteiro Finan #10 (Timeline do lançamento): historico cronologico de
// todos os eventos de auditoria de UM registro especifico (mesma
// entity+record_id), usado pra montar a linha do tempo dentro do modal de
// detalhe do log (FinanAuditLogsSection.jsx).
router.get("/admin/audit-logs/by-record", requireFinanPermission("finan.configuracoes.view"), noStore, async (req, res, next) => {
	try {
		const entity = textOrNull(req.query.entity);
		const recordId = textOrNull(req.query.recordId);
		if (!entity || !recordId) {
			res.json({ ok: true, items: [] });
			return;
		}
		const { rows } = await db.query(
			`select id, user_id, user_name, user_email, setor_id, department_id, module, entity, action,
				coalesce(record_id, entity_id) as record_id, ip_address, user_agent,
				before_data, after_data, changed_fields, created_at
			from finan_audit_logs
			where entity = $1 and coalesce(record_id, entity_id) = $2
			order by created_at asc
			limit 100`,
			[entity, recordId],
		);
		res.json({ ok: true, items: rows.map(publicAuditLog) });
	} catch (error) {
		next(error);
	}
});

router.get("/admin/audit-logs/:id", requireFinanPermission("finan.configuracoes.view"), noStore, async (req, res, next) => {
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

router.get("/documents", async (_req, res, next) => {
	try {
		res.json({ ok: true, items: [] });
	} catch (error) {
		next(error);
	}
});

router.get("/documents/*", async (_req, res, next) => {
	try {
		res.json({ ok: true, data: null });
	} catch (error) {
		next(error);
	}
});

// Estes 3 endpoints ainda sao stubs (nao gravam nada de verdade — sem
// tabela/arquivo por tras). Mesmo assim, ganham a mesma permissao exigida
// pelos outros endpoints de escrita "/admin/*", para nao virarem uma
// pegadinha de autorizacao no dia em que alguem implementar a logica real
// aqui sem lembrar de adicionar o gate.
router.post("/admin/documents", requireFinanPermission("finan.configuracoes.manage"), async (_req, res, next) => {
	try {
		res.json({ ok: true, documentId: crypto.randomUUID() });
	} catch (error) {
		next(error);
	}
});

router.put("/admin/documents/*", requireFinanPermission("finan.configuracoes.manage"), async (_req, res, next) => {
	try {
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.delete("/admin/documents/*", requireFinanPermission("finan.configuracoes.manage"), async (_req, res, next) => {
	try {
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

// Status do Roteiro Finan (checklist de evolucao do produto, ver
// FinanRoadmapPage.jsx) — aberto pra leitura a qualquer usuario Finan
// autenticado (requireFinanAuth global em app.js ja cobre isso), escrita
// restrita a quem pode mexer em configuracoes. O catalogo de itens/fases em
// si mora no frontend (FinanRoadmapPage.jsx); aqui so persiste o status
// {itemId: "planejado"|"andamento"|"concluido"} por item.
router.get("/roteiro-status", async (_req, res, next) => {
	try {
		res.json({ ok: true, status: (await readSetting("roteiro_status")) || {} });
	} catch (error) {
		next(error);
	}
});

router.put("/roteiro-status", requireFinanPermission("finan.configuracoes.manage"), async (req, res, next) => {
	try {
		const status = req.body?.status && typeof req.body.status === "object" ? req.body.status : {};
		await writeSetting("roteiro_status", status);
		await logAudit(req, "update", "roteiro_status", "roteiro_status", { status });
		res.json({ ok: true, status });
	} catch (error) {
		next(error);
	}
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

// SonarQube S4036: garante que `pg_dump`/`pg_restore` sejam resolvidos
// so em diretorios fixos e nao-graviaveis, em vez de herdar o PATH do
// processo sem restricao. So aplicado em Linux (onde producao roda de
// fato, ver CLAUDE.md secao 11) — o formato de PATH do Windows e
// incompativel (`;` + caminhos `C:\...`), entao no Windows (dev local
// via `npm run api:dev`/`npm run backup:database`) o PATH herdado
// continua igual, senao `pg_dump`/`pg_restore` deixariam de ser
// encontrados nesse ambiente.
const TRUSTED_BIN_PATH =
	process.platform === "win32"
		? process.env.PATH
		: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

function runPgDump(filePath) {
	return new Promise((resolve, reject) => {
		const env = { ...process.env, PATH: TRUSTED_BIN_PATH };
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

function runPgRestore(filePath) {
	return new Promise((resolve, reject) => {
		const env = { ...process.env, PATH: TRUSTED_BIN_PATH };
		if (process.env.FINAN_DATABASE_URL) {
			env.DATABASE_URL = process.env.FINAN_DATABASE_URL;
		} else {
			env.PGHOST = process.env.FINAN_PGHOST || process.env.PGHOST || "";
			env.PGPORT = process.env.FINAN_PGPORT || process.env.PGPORT || "5432";
			env.PGUSER = process.env.FINAN_PGUSER || process.env.PGUSER || "";
			env.PGPASSWORD = process.env.FINAN_PGPASSWORD || process.env.PGPASSWORD || "";
			env.PGDATABASE = process.env.FINAN_PGDATABASE || process.env.PGDATABASE || "";
		}
		const target = process.env.FINAN_DATABASE_URL || env.PGDATABASE;
		const args = [
			"--clean",
			"--if-exists",
			"--no-owner",
			"--no-acl",
			"--single-transaction",
			"--dbname",
			target,
			filePath,
		];
		execFile("pg_restore", args, { env, timeout: 10 * 60 * 1000 }, (error) => {
			if (error) reject(error);
			else resolve();
		});
	});
}

// (`normalizeEmailConfig`/`normalizeFinanFromEmail`/`normalizeFinanEmailTemplates`
// removidos: eram codigo morto de antes de email/service.js existir — nada
// neste arquivo ou em outro modulo os chamava. A normalizacao de config de
// e-mail de verdade, em uso, mora em email/service.js.)

async function readIntegration(provider) {
	const { rows } = await db.query("select config from finan_integration_configs where provider = $1 or id = $1 limit 1", [provider]);
	return rows[0]?.config || {};
}

// Mesmo criterio de mascaramento usado em integrations/routes.js (publicIntegration):
// token/secret/password nunca devem sair do backend em texto puro por esta rota de leitura.
function sanitizeIntegrationConfig(config = {}) {
	return {
		...config,
		token: config.token ? "********" : "",
		secret: config.secret ? "********" : "",
		password: config.password ? "********" : "",
	};
}

function sanitizeOAuthConfig(config = {}) {
	return {
		...config,
		clientSecret: config.clientSecret ? "********" : "",
		secret: config.secret ? "********" : "",
	};
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
	const decorated = decorateFinanAuditLog(row);
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
		changeDescriptions: decorated.changeDescriptions,
		createdAt: row.created_at,
		summary: decorated.summary,
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
			and (
				is_admin = true
				or permissions::text like '%finan.%'
				or permissions::text like '%financeiro.%'
				or permissions::text like '%relatorios_financeiros:%'
				or id in ('admin', 'coordenador_financeiro', 'analista_financeiro')
			)
		limit 1`,
		[requested],
	);
	// Nenhum cargo valido encontrado com esse id -> mantem o atual (nao
	// existe "cargo atual" aqui, so o id pedido) em vez de forcar
	// silenciosamente pra analista_financeiro. Quem chama decide: se
	// resolveFinanRoleId devolver null, o UPDATE usa coalesce e preserva o
	// role_id que o usuario ja tinha, em vez de trocar pra outro cargo sem
	// o admin ter pedido isso.
	return rows[0]?.id || null;
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
