const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { SectionParamDTO, SectionUpdateDTO } = require("../dtos/settingsDto");

const router = express.Router();

router.use(requireFinanPermission("finan.configuracoes.view"));
router.use(noStore);

const DEFAULT_SETTINGS = {
	geral: {
		appName: "Finan",
		publicUrl: process.env.FINAN_PUBLIC_URL || "https://finan.retiradas.tech",
		timezone: "America/Sao_Paulo",
	},
	notificacoes: {
		criticalAlerts: true,
		importFinished: true,
		backupFailures: true,
		apiFailures: true,
	},
	email: {
		mode: "retiradas-email-temporario",
		from: process.env.FINAN_EMAIL_FROM || "",
		replyTo: process.env.FINAN_EMAIL_REPLY_TO || "",
	},
	banco: {
		backupProfile: "finan",
		database: process.env.PGDATABASE || "",
	},
	pin_lock: {
		idleTimeoutMinutes: Number(process.env.FINAN_PIN_IDLE_TIMEOUT_MINUTES || 20),
	},
};

router.get("/", async (_req, res, next) => {
	try {
		const { rows } = await db.query(
			`select key, value, updated_at from finan_settings order by key`,
		);
		const settings = { ...DEFAULT_SETTINGS };
		for (const row of rows) {
			settings[row.key] = {
				...(DEFAULT_SETTINGS[row.key] || {}),
				...(row.value || {}),
				updatedAt: row.updated_at,
			};
		}
		res.json({ ok: true, settings });
	} catch (error) {
		next(error);
	}
});

router.get("/summary", async (_req, res, next) => {
	try {
		const [
			users,
			roles,
			integrations,
			audits,
			snapshots,
			budgetRows,
			dbSize,
		] = await Promise.all([
			db.query("select count(*)::int as total from finan_users"),
			db.query("select count(*)::int as total from finan_roles"),
			db.query(
				`select count(*)::int as total,
					count(*) filter (where status = 'ativo')::int as ativos
				from finan_integration_configs`,
			),
			db.query("select count(*)::int as total from finan_audit_logs"),
			db.query(
				`select count(*)::int as total,
					count(*)::int as linhas,
					max(imported_at) as ultima_importacao
				from finan_migration_snapshots`,
			),
			db.query(
				`select count(*)::int as movimentos,
					coalesce(sum(realizado), 0)::numeric as realizado
				from finan_orcamento_lancamentos`,
			),
			db.query("select pg_database_size(current_database())::bigint as bytes"),
		]);
		res.json({
			ok: true,
			summary: {
				users: users.rows[0]?.total || 0,
				roles: roles.rows[0]?.total || 0,
				integrations: integrations.rows[0] || { total: 0, ativos: 0 },
				auditLogs: audits.rows[0]?.total || 0,
				migration: snapshots.rows[0] || {
					total: 0,
					linhas: 0,
					ultima_importacao: null,
				},
				budget: budgetRows.rows[0] || { movimentos: 0, realizado: 0 },
				database: dbSize.rows[0] || { bytes: 0 },
			},
		});
	} catch (error) {
		next(error);
	}
});

router.get("/section/:key", validate({ params: SectionParamDTO }), async (req, res, next) => {
	try {
		const key = normalizeKey(req.validated.params.key);
		const { rows } = await db.query(
			`select key, value, updated_at from finan_settings where key = $1 limit 1`,
			[key],
		);
		res.json({
			ok: true,
			key,
			value: { ...(DEFAULT_SETTINGS[key] || {}), ...(rows[0]?.value || {}) },
			updatedAt: rows[0]?.updated_at || null,
		});
	} catch (error) {
		next(error);
	}
});

router.put(
	"/section/:key",
	requireFinanPermission("finan.configuracoes.manage"),
	validate({ params: SectionParamDTO, body: SectionUpdateDTO }),
	async (req, res, next) => {
		try {
			const key = normalizeKey(req.validated.params.key);
			const { value } = req.validated.body;
			const { rows } = await db.query(
				`insert into finan_settings (key, value, updated_at)
				values ($1, $2::jsonb, now())
				on conflict (key) do update set value = excluded.value, updated_at = now()
				returning key, value, updated_at`,
				[key, JSON.stringify(value)],
			);
			await logAudit(req, "settings.update", "finan_settings", key, { key });
			res.json({ ok: true, setting: rows[0] });
		} catch (error) {
			next(error);
		}
	},
);

router.get("/database", async (_req, res, next) => {
	try {
		const { rows } = await db.query(
			`select relname as table_name, n_live_tup::bigint as estimated_rows
			from pg_stat_user_tables
			where schemaname = 'public' and relname like 'finan_%'
			order by relname`,
		);
		const size = await db.query(
			`select current_database() as database_name,
				pg_database_size(current_database())::bigint as bytes`,
		);
		res.json({
			ok: true,
			database: size.rows[0] || {},
			tables: rows,
		});
	} catch (error) {
		next(error);
	}
});

router.get("/audit-logs", async (_req, res, next) => {
	try {
	const { rows } = await db.query(
			`select id, user_id, action, entity, entity_id, before_data, after_data, created_at
			from finan_audit_logs
			order by created_at desc
			limit 200`,
		);
		res.json({ ok: true, logs: rows });
	} catch (error) {
		next(error);
	}
});

function normalizeKey(value) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, "");
}

async function logAudit(req, action, entity, entityId, metadata = {}) {
	await db.query(
		`insert into finan_audit_logs (user_id, action, entity, entity_id, after_data)
		values ($1, $2, $3, $4, $5::jsonb)`,
		[
			req.finanUser?.id || null,
			action,
			entity,
			entityId,
			JSON.stringify(metadata),
		],
	);
}

module.exports = router;
