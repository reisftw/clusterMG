const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { ProviderParamDTO, IntegrationConfigUpdateDTO } = require("../dtos/integrationDto");

const router = express.Router();

router.use(requireFinanPermission("finan.integracoes.view"));
router.use(noStore);

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

router.get("/:provider", validate({ params: ProviderParamDTO }), async (req, res, next) => {
	try {
		const provider = normalizeProvider(req.validated.params.provider);
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
	validate({ params: ProviderParamDTO, body: IntegrationConfigUpdateDTO }),
	async (req, res, next) => {
		try {
			const provider = normalizeProvider(req.validated.params.provider);
			const { config: incomingConfig, status: rawStatus, name: rawName } = req.validated.body;
			const status = normalizeStatus(rawStatus);
			const name = String(rawName || providerLabel(provider)).trim();
			const current = await readIntegrationRow(provider);
			// Mesmo padrao de mergeSecretField do Retiradas (vps/api/src/
			// cvortexIntegration.js): campo sensivel vazio no payload mantem o
			// valor atual em vez de apagar a credencial ja salva.
			const config = mergeSecretFields(incomingConfig, current?.config || {});
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
			await writeIntegrationAudit(req, "integration.update", provider, {
				provider,
				status,
				changedFields: diffConfigFields(current?.config || {}, config),
			});
			res.json({ ok: true, integracao: publicIntegration(rows[0]) });
		} catch (error) {
			next(error);
		}
	},
);

router.post(
	"/:provider/test",
	requireFinanPermission("finan.integracoes.manage"),
	validate({ params: ProviderParamDTO }),
	async (req, res, next) => {
		try {
			const provider = normalizeProvider(req.validated.params.provider);
			const row = await readIntegrationRow(provider);
			if (!row) {
				res.status(404).json({ ok: false, error: "Integração não encontrada." });
				return;
			}
			const tester = PROVIDER_TESTERS[provider];
			if (!tester) {
				res.status(400).json({ ok: false, error: `Sem teste de conexão real para "${provider}".` });
				return;
			}

			try {
				const result = await tester(row.config || {});
				await db.query(
					`update finan_integration_configs
					set config = $2::jsonb, status = 'ativo', updated_at = now()
					where id = $1`,
					[provider, JSON.stringify({ ...(row.config || {}), ...result.configPatch, lastError: "" })],
				);
				await writeIntegrationAudit(req, "integration.test", provider, {
					provider,
					result: "ok",
					checkedAt: result.checkedAt,
				});
				res.json({ ok: true, result: { status: "ok", ...result.public } });
			} catch (testError) {
				const message = testError?.message || "Falha ao testar conexão.";
				await db.query(
					`update finan_integration_configs
					set config = jsonb_set(coalesce(config, '{}'::jsonb), '{lastError}', to_jsonb($2::text)), status = 'erro', updated_at = now()
					where id = $1`,
					[provider, message],
				);
				await writeIntegrationAudit(req, "integration.test", provider, {
					provider,
					result: "erro",
					error: message,
				});
				res.status(testError?.statusCode || 400).json({ ok: false, error: message });
			}
		} catch (error) {
			next(error);
		}
	},
);

async function readIntegrationRow(provider) {
	const { rows } = await db.query(
		"select id, provider, name, status, config, updated_at from finan_integration_configs where provider = $1 or id = $1 limit 1",
		[provider],
	);
	return rows[0] || null;
}

function mergeSecretFields(incoming = {}, current = {}) {
	const merged = { ...current, ...incoming };
	["token", "secret", "password", "clientSecret", "apiToken"].forEach((field) => {
		if (Object.hasOwn(incoming, field) && !String(incoming[field] || "").trim()) {
			merged[field] = current[field] || "";
		}
	});
	return merged;
}

function diffConfigFields(before = {}, after = {}) {
	const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
	return [...keys].filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));
}

async function writeIntegrationAudit(req, action, entityId, afterData = {}) {
	await db.query(
		`insert into finan_audit_logs (
			user_id, user_name, user_email, action, module, entity, entity_id,
			record_id, ip_address, user_agent, after_data, changed_fields
		)
		values ($1, $2, $3, $4, 'integracoes', 'finan_integration_configs', $5, $5, $6, $7, $8::jsonb, $9::jsonb)`,
		[
			req.finanUser?.id || null,
			req.finanUser?.name || req.finanUser?.email || null,
			req.finanUser?.email || null,
			action,
			entityId,
			req.ip || "",
			req.get("user-agent") || "",
			JSON.stringify(afterData),
			JSON.stringify(afterData.changedFields || []),
		],
	);
}

async function parseResponse(response) {
	const text = await response.text();
	try {
		return text ? JSON.parse(text) : null;
	} catch {
		return { raw: text };
	}
}

function buildErrorMessage(response, payload) {
	return payload?.message || payload?.error || payload?.raw || `HTTP ${response.status}`;
}

// Mesma logica de vps/api/src/hubsoftIntegration.js:authenticate — gera um
// Bearer token real via OAuth password grant e guarda no config jsonb.
async function testHubsoft(config = {}) {
	const missing = [];
	if (!config.baseUrl) missing.push("Base URL");
	if (!config.clientId || !config.clientSecret) missing.push("Client ID/secret");
	if (!config.username || !config.password) missing.push("usuário/senha");
	if (missing.length) {
		const error = new Error(`Configure Hubsoft antes de testar: ${missing.join(", ")}.`);
		error.statusCode = 400;
		throw error;
	}
	const response = await fetch(`${String(config.baseUrl).replace(/\/+$/, "")}/oauth/token`, {
		method: "POST",
		headers: { Accept: "application/json", "Content-Type": "application/json" },
		body: JSON.stringify({
			client_id: config.clientId,
			client_secret: config.clientSecret,
			username: config.username,
			password: config.password,
			grant_type: config.grantType || "password",
		}),
	});
	const payload = await parseResponse(response);
	if (!response.ok || !payload?.access_token) {
		const error = new Error(`Falha ao autenticar no Hubsoft: ${buildErrorMessage(response, payload)}`);
		error.statusCode = response.status >= 500 ? 502 : 400;
		throw error;
	}
	const now = new Date();
	const expiresInSeconds = Number(payload.expires_in || 0);
	const tokenExpiresAt = expiresInSeconds > 0 ? new Date(now.getTime() + expiresInSeconds * 1000).toISOString() : "";
	return {
		checkedAt: now.toISOString(),
		configPatch: {
			accessToken: payload.access_token,
			tokenType: payload.token_type || "Bearer",
			tokenExpiresAt,
			tokenUpdatedAt: now.toISOString(),
			lastValidatedAt: now.toISOString(),
		},
		public: { checkedAt: now.toISOString(), tokenExpiresAt, message: "Token Hubsoft gerado e armazenado." },
	};
}

function buildHeaderUrl(baseUrl, endpoint) {
	const path = String(endpoint || "").trim();
	if (/^https?:\/\//i.test(path)) return path;
	const normalizedBase = String(baseUrl || "").replace(/\/+$/, "");
	const normalizedPath = path ? (path.startsWith("/") ? path : `/${path}`) : "";
	return `${normalizedBase}${normalizedPath}`;
}

// Mesma logica de vps/api/src/cvortexIntegration.js:testConnection.
async function testCvortex(config = {}) {
	if (!config.baseUrl || !config.apiToken) {
		const error = new Error("Configure Cvortex antes de testar: Base URL e Token/API Key.");
		error.statusCode = 400;
		throw error;
	}
	const endpoint = buildHeaderUrl(config.baseUrl, config.statusEndpoint || "/health");
	const response = await fetch(endpoint, {
		method: "GET",
		headers: {
			Accept: "application/json",
			Authorization: `Bearer ${config.apiToken}`,
			"X-API-Key": config.apiToken,
			...(config.accountId ? { "X-Account-Id": config.accountId } : {}),
			...(config.inboxId ? { "X-Inbox-Id": config.inboxId } : {}),
		},
	});
	const payload = await parseResponse(response);
	const checkedAt = new Date().toISOString();
	if (!response.ok) {
		const error = new Error(`Falha ao validar Cvortex: ${buildErrorMessage(response, payload)}`);
		error.statusCode = response.status >= 500 ? 502 : 400;
		throw error;
	}
	return {
		checkedAt,
		configPatch: { lastValidatedAt: checkedAt },
		public: { checkedAt, status: response.status, endpoint },
	};
}

// Mesma logica de vps/api/src/seniorIntegration.js:testConnection.
async function testSenior(config = {}) {
	if (!config.baseUrl) {
		const error = new Error("Configure Sênior antes de testar: Base URL.");
		error.statusCode = 400;
		throw error;
	}
	if (config.authType !== "none" && !config.apiToken && !config.username) {
		const error = new Error("Configure Sênior antes de testar: Token/API key ou usuário.");
		error.statusCode = 400;
		throw error;
	}
	const endpoint = buildHeaderUrl(config.baseUrl, config.statusEndpoint || "/health");
	const headers = { Accept: "application/json" };
	if (config.apiToken) {
		headers.Authorization = config.authType === "api-key" ? config.apiToken : `Bearer ${config.apiToken}`;
		headers["X-API-Key"] = config.apiToken;
	}
	if (config.tenant) headers["X-Tenant"] = config.tenant;
	if (config.companyCode) headers["X-Company-Code"] = config.companyCode;
	const response = await fetch(endpoint, { method: "GET", headers });
	const payload = await parseResponse(response);
	const checkedAt = new Date().toISOString();
	if (!response.ok) {
		const error = new Error(`Falha ao validar Sênior/Sapiens: ${buildErrorMessage(response, payload)}`);
		error.statusCode = response.status >= 500 ? 502 : 400;
		throw error;
	}
	return {
		checkedAt,
		configPatch: { lastValidatedAt: checkedAt },
		public: { checkedAt, status: response.status, endpoint },
	};
}

// BrasilAPI e publica, sem credencial nenhuma — o "teste de conexao" e so
// um healthcheck real (GET no endpoint configurado) pra saber se ela esta
// online, mesmo padrao visual das outras integracoes na tela.
async function testBrasilapi(config = {}) {
	const baseUrl = config.baseUrl || "https://brasilapi.com.br/api";
	const endpoint = buildHeaderUrl(baseUrl, config.statusEndpoint || "/taxas/v1");
	const response = await fetch(endpoint, { method: "GET", headers: { Accept: "application/json" } });
	const checkedAt = new Date().toISOString();
	if (!response.ok) {
		const error = new Error(`BrasilAPI respondeu HTTP ${response.status}.`);
		error.statusCode = response.status >= 500 ? 502 : 400;
		throw error;
	}
	return {
		checkedAt,
		configPatch: { lastValidatedAt: checkedAt },
		public: { checkedAt, status: response.status, endpoint },
	};
}

const PROVIDER_TESTERS = {
	hubsoft: testHubsoft,
	cvortex: testCvortex,
	senior: testSenior,
	brasilapi: testBrasilapi,
};

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
		brasilapi: "BrasilAPI",
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
			clientSecret: config.clientSecret ? "********" : "",
			apiToken: config.apiToken ? "********" : "",
			accessToken: config.accessToken ? "********" : "",
			tokenConfigured: Boolean(config.token),
			passwordConfigured: Boolean(config.password),
			secretConfigured: Boolean(config.secret),
			clientSecretConfigured: Boolean(config.clientSecret),
			apiTokenConfigured: Boolean(config.apiToken),
		},
	};
}

module.exports = router;
