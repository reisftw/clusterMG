const express = require("express");
const db = require("../db");
const { requireRotAuth, requireRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");

// Central de integracoes da Operação — mesmo padrao visual/funcional da Central
// de Integracoes do Finan (apps/finan/backend/src/integrations/routes.js),
// mas com o catalogo do proprio Operação: hoje so o assistente Gemini (herdado
// do app legado) usa uma API externa com chave propria. Guardado em
// rot_settings (key='integrations'), mesmo padrao de storage do e-mail.
// Novas integracoes (conforme cada modulo de negocio for migrado) entram
// aqui como uma nova entrada no catalogo, sem precisar de migration nova.
const router = express.Router();
router.use(requireRotAuth);

const INTEGRATIONS_CATALOG = [
	{
		provider: "gemini",
		label: "Gemini AI (Assistente)",
		description: "Chave da API do Google Gemini, usada pelo assistente de IA da Operação.",
		fields: [{ key: "apiKey", label: "API Key", secret: true }],
	},
	{
		provider: "sempre-playground-api",
		label: "Sempre / Playground",
		description: "API usada para consultar bolsa técnico, movimentações, notas e estoque.",
		fields: [
			{ key: "baseUrl", label: "URL base", required: true },
			{ key: "secretValue", label: "Token Bearer", secret: true, required: true },
			{ key: "refreshToken", label: "Refresh token", secret: true },
			{ key: "loginEmail", label: "E-mail de login" },
			{ key: "loginPassword", label: "Senha de login", secret: true },
			{ key: "sistemaId", label: "Sistema ID" },
			{ key: "timeoutMs", label: "Timeout em ms" },
		],
	},
];

function maskSecret(value) {
	const str = String(value || "");
	if (!str) return "";
	if (str.length <= 6) return "••••••";
	return `${str.slice(0, 3)}${"•".repeat(Math.min(10, str.length - 6))}${str.slice(-3)}`;
}

async function readSettings() {
	const { rows } = await db
		.query("select value from rot_settings where key = 'integrations' limit 1")
		.catch(() => ({ rows: [] }));
	return rows[0]?.value || {};
}

router.get("/", requireRotPermission("rot.settings.manage"), noStore, async (req, res, next) => {
	try {
		const saved = await readSettings();
		const items = INTEGRATIONS_CATALOG.map((entry) => {
			const values = saved[entry.provider] || {};
			const requiredFields = entry.fields.filter((field) => field.required || entry.fields.length === 1);
			const configured = requiredFields.every((field) => Boolean(values[field.key]));
			return {
				provider: entry.provider,
				label: entry.label,
				description: entry.description,
				configured,
				fields: entry.fields.map((field) => ({
					key: field.key,
					label: field.label,
					secret: Boolean(field.secret),
					value: field.secret ? maskSecret(values[field.key]) : values[field.key] || "",
					hasValue: Boolean(values[field.key]),
				})),
			};
		});
		res.json({ ok: true, items });
	} catch (error) {
		next(error);
	}
});

router.put("/:provider", requireRotPermission("rot.settings.manage"), async (req, res, next) => {
	try {
		const entry = INTEGRATIONS_CATALOG.find((item) => item.provider === req.params.provider);
		if (!entry) {
			res.status(404).json({ ok: false, error: "Integração desconhecida." });
			return;
		}
		const saved = await readSettings();
		const current = saved[entry.provider] || {};
		const patch = req.body || {};
		const next_ = { ...current };
		for (const field of entry.fields) {
			const incoming = patch[field.key];
			// Campo secreto vazio no PUT mantem o valor atual salvo (nunca
			// apaga sem intencao) — mesmo padrao mergeSecretField do Retiradas.
			if (field.secret) {
				if (incoming) next_[field.key] = String(incoming);
			} else if (incoming !== undefined) {
				next_[field.key] = String(incoming);
			}
		}
		const nextSaved = { ...saved, [entry.provider]: next_ };
		await db.query(
			`insert into rot_settings (key, value, updated_at)
			values ('integrations', $1::jsonb, now())
			on conflict (key) do update set value = excluded.value, updated_at = now()`,
			[JSON.stringify(nextSaved)],
		);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
