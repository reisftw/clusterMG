const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");

const router = express.Router();

router.use(requireFinanPermission("finan.integracoes.view"));

router.get("/", async (_req, res, next) => {
	try {
		const { rows } = await db.query(
			`select id, provider, name, status, config, updated_at
			from finan_integration_configs
			order by name`,
		);
		res.json({ ok: true, integracoes: rows.map(publicIntegration) });
	} catch (error) {
		next(error);
	}
});

router.get("/:provider", async (req, res, next) => {
	try {
		const provider = normalizeProvider(req.params.provider);
		const { rows } = await db.query(
			`select id, provider, name, status, config, updated_at
			from finan_integration_configs
			where provider = $1 or id = $1
			limit 1`,
			[provider],
		);
		if (!rows[0]) {
			res.status(404).json({ ok: false, error: "Integração não encontrada." });
			return;
		}
		res.json({ ok: true, integracao: publicIntegration(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.put(
	"/:provider",
	requireFinanPermission("finan.integracoes.manage"),
	async (req, res, next) => {
		try {
			const provider = normalizeProvider(req.params.provider);
			const config =
				req.body && typeof req.body.config === "object" && req.body.config !== null
					? req.body.config
					: {};
			const status = normalizeStatus(req.body?.status);
			const name = String(req.body?.name || providerLabel(provider)).trim();
			const { rows } = await db.query(
				`insert into finan_integration_configs (id, provider, name, status, config, updated_at)
				values ($1, $1, $2, $3, $4::jsonb, now())
				on conflict (id) do update set
					name = excluded.name,
					status = excluded.status,
					config = excluded.config,
					updated_at = now()
				returning id, provider, name, status, config, updated_at`,
				[provider, name, status, JSON.stringify(config)],
			);
			await db.query(
				`insert into finan_audit_logs (user_id, action, entity, entity_id, after_data)
				values ($1, 'integration.update', 'finan_integration_configs', $2, $3::jsonb)`,
				[req.finanUser?.id || null, provider, JSON.stringify({ provider, status })],
			);
			res.json({ ok: true, integracao: publicIntegration(rows[0]) });
		} catch (error) {
			next(error);
		}
	},
);

router.post(
	"/:provider/test",
	requireFinanPermission("finan.integracoes.manage"),
	async (req, res, next) => {
		try {
			const provider = normalizeProvider(req.params.provider);
			await db.query(
				`insert into finan_audit_logs (user_id, action, entity, entity_id, after_data)
				values ($1, 'integration.test', 'finan_integration_configs', $2, $3::jsonb)`,
				[
					req.finanUser?.id || null,
					provider,
					JSON.stringify({ provider, result: "pending_real_adapter" }),
				],
			);
			res.json({
				ok: true,
				result: {
					status: "pendente",
					message: "Configuração salva. Conector real será ligado ao adapter dedicado.",
				},
			});
		} catch (error) {
			next(error);
		}
	},
);

function normalizeProvider(value) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, "");
}

function normalizeStatus(value) {
	const status = String(value || "planejado").toLowerCase();
	return ["ativo", "planejado", "pausado", "erro"].includes(status)
		? status
		: "planejado";
}

function providerLabel(provider) {
	const labels = {
		hubsoft: "Hubsoft",
		cvortex: "Cvortex",
		senior: "Sênior",
		playground: "Playground",
	};
	return labels[provider] || provider;
}

function publicIntegration(row) {
	const config = row.config || {};
	return {
		id: row.id,
		provider: row.provider,
		name: row.name,
		status: row.status,
		updatedAt: row.updated_at,
		config: {
			...config,
			token: config.token ? "********" : "",
			password: config.password ? "********" : "",
			secret: config.secret ? "********" : "",
		},
	};
}

module.exports = router;
