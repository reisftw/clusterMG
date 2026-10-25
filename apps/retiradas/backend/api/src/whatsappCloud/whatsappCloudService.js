const crypto = require("node:crypto");
const db = require("../db");
const auditLog = require("../auditLog");
const mensageriaRepository = require("../mensageriaRepository");
const {
	createMetaCloudProvider,
} = require("./providers/metaCloudProvider");

const DEFAULT_WABA_ID = "2099063160707050";
const DEFAULT_PHONE_NUMBER_ID = "1162045177001452";
const DEFAULT_APP_ID = "1962923281088011";
const DEFAULT_TEST_PHONE = "+15556716054";
const DEFAULT_GRAPH_VERSION = "v26.0";
const MASKED_SECRET = "********";
const WEBHOOK_PATH = "/api/integrations/whatsapp/meta/webhook";
const TEST_PROVIDER = "meta_cloud_test";
const MAX_LIMIT = 200;
const SECRET_NAMES = Object.freeze({
	accessToken: "META_ACCESS_TOKEN",
	appSecret: "META_APP_SECRET",
});
const SECRET_SALT_PREFIX = "retiradas:whatsapp-cloud:";

function cleanText(value) {
	return String(value ?? "").trim();
}

function apiError(message, statusCode = 400, details = null) {
	const error = new Error(message);
	error.statusCode = statusCode;
	if (details) error.details = details;
	return error;
}

function normalizeLimit(value, fallback = 50) {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed)
		? Math.min(Math.max(parsed, 1), MAX_LIMIT)
		: fallback;
}

function normalizeOffset(value) {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

function normalizeE164(value) {
	const digits = cleanText(value).replace(/\D/g, "");
	if (digits.length < 8 || digits.length > 15) {
		throw apiError("Informe um telefone válido no formato internacional.", 400);
	}
	return `+${digits}`;
}

function maskPhone(value) {
	const digits = cleanText(value).replace(/\D/g, "");
	if (!digits) return "-";
	if (digits.length <= 6) return `${digits.slice(0, 2)}***${digits.slice(-2)}`;
	return `+${digits.slice(0, 2)} ${digits.slice(2, 4)}*****${digits.slice(-4)}`;
}

function hashValue(value) {
	return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function safeEqual(left, right) {
	const a = Buffer.from(hashValue(left));
	const b = Buffer.from(hashValue(right));
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function userName(user = {}) {
	return cleanText(
		user.displayName ||
			user.display_name ||
			user.profile?.displayName ||
			user.profile?.nome ||
			user.email ||
			user.uid ||
			"Administrador",
	);
}

function getEnvironmentSecrets() {
	const accessToken = cleanText(
			process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_META_ACCESS_TOKEN,
		);
	const appSecret = cleanText(
			process.env.META_APP_SECRET || process.env.WHATSAPP_META_APP_SECRET,
		);
	return {
		accessToken,
		appSecret,
		verifyToken: cleanText(
			process.env.META_WEBHOOK_VERIFY_TOKEN ||
				process.env.WHATSAPP_OFFICIAL_VERIFY_TOKEN,
		),
		accessTokenSource: accessToken ? "environment" : "none",
		appSecretSource: appSecret ? "environment" : "none",
	};
}

function getEncryptionKeyring() {
	const currentKeyId = cleanText(process.env.APP_AUTH_SECRET_ID || "current") || "current";
	const currentSecret = cleanText(process.env.APP_AUTH_SECRET);
	if (currentSecret.length < 24) {
		throw apiError("Chave de criptografia do servidor indisponível.", 503);
	}
	const keyring = new Map([[currentKeyId, currentSecret]]);
	String(process.env.APP_AUTH_PREVIOUS_SECRETS || "")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean)
		.forEach((entry) => {
			const [keyId, ...secretParts] = entry.split(":");
			const secret = secretParts.join(":");
			if (keyId && secret.length >= 24) keyring.set(keyId, secret);
		});
	return { currentKeyId, keyring };
}

function deriveEncryptionKey(secret, keyId) {
	return crypto.scryptSync(
		secret,
		`${SECRET_SALT_PREFIX}${keyId}`,
		32,
	);
}

function encryptStoredSecret(secretName, value) {
	const { currentKeyId, keyring } = getEncryptionKeyring();
	const key = deriveEncryptionKey(keyring.get(currentKeyId), currentKeyId);
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
	cipher.setAAD(Buffer.from(secretName));
	const ciphertext = Buffer.concat([
		cipher.update(cleanText(value), "utf8"),
		cipher.final(),
	]);
	return {
		ciphertext: ciphertext.toString("base64"),
		iv: iv.toString("base64"),
		authTag: cipher.getAuthTag().toString("base64"),
		keyId: currentKeyId,
	};
}

function decryptStoredSecret(row = {}) {
	const secretName = cleanText(row.secret_name);
	const keyId = cleanText(row.key_id);
	const { keyring } = getEncryptionKeyring();
	const rootSecret = keyring.get(keyId);
	if (!rootSecret) throw apiError("Chave anterior do cofre não encontrada.", 503);
	try {
		const decipher = crypto.createDecipheriv(
			"aes-256-gcm",
			deriveEncryptionKey(rootSecret, keyId),
			Buffer.from(row.iv, "base64"),
		);
		decipher.setAAD(Buffer.from(secretName));
		decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
		return Buffer.concat([
			decipher.update(Buffer.from(row.ciphertext, "base64")),
			decipher.final(),
		]).toString("utf8");
	} catch {
		throw apiError("Não foi possível abrir o cofre de credenciais.", 503);
	}
}

function configDto(row = {}, { publicAppUrl, secrets = getEnvironmentSecrets() } = {}) {
	const baseUrl = cleanText(publicAppUrl || process.env.PUBLIC_APP_URL || "https://retiradas.tech")
		.replace(/\/+$/, "");
	return {
		appId: row.app_id || DEFAULT_APP_ID,
		wabaId: row.waba_id || DEFAULT_WABA_ID,
		phoneNumberId: row.phone_number_id || DEFAULT_PHONE_NUMBER_ID,
		testPhoneNumber: row.test_phone_number || DEFAULT_TEST_PHONE,
		graphApiVersion: row.graph_api_version || DEFAULT_GRAPH_VERSION,
		metaTestMode: row.meta_test_mode !== false,
		productionEnabled: row.production_enabled === true,
		consentPolicyConfirmed: row.consent_policy_confirmed === true,
		activeProvider: row.active_provider || "existing",
		rollbackProvider: row.rollback_provider || "",
		accessToken: secrets.accessToken ? MASKED_SECRET : "",
		appSecret: secrets.appSecret ? MASKED_SECRET : "",
		webhookVerifyToken:
			secrets.verifyToken || row.verify_token_hash ? MASKED_SECRET : "",
		secretStatus: {
			accessTokenConfigured: Boolean(secrets.accessToken),
			appSecretConfigured: Boolean(secrets.appSecret),
			verifyTokenConfigured: Boolean(secrets.verifyToken || row.verify_token_hash),
			accessTokenSource: secrets.accessTokenSource || "none",
			appSecretSource: secrets.appSecretSource || "none",
		},
		webhookUrl: `${baseUrl}${WEBHOOK_PATH}`,
		lastConnectionStatus: row.last_connection_status || "NOT_TESTED",
		lastConnectionHttpStatus: row.last_connection_http_status || null,
		lastConnectionPayload: row.last_connection_payload || {},
		lastConnectionError: row.last_connection_error || "",
		lastCheckedAt: row.last_checked_at || null,
		lastWebhookVerifiedAt: row.last_webhook_verified_at || null,
		lastWebhookEventAt: row.last_webhook_event_at || null,
		updatedAt: row.updated_at || null,
	};
}

function recipientDto(row = {}) {
	return {
		id: row.id,
		name: row.name,
		maskedPhone: maskPhone(row.phone_e164),
		authorizationStatus: row.authorization_status,
		metaRegistered: row.meta_registered === true,
		notes: row.notes || "",
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function templateDto(row = {}) {
	return {
		id: row.id,
		metaId: row.meta_id || "",
		name: row.name,
		language: row.language,
		category: row.category || "",
		status: row.status || "UNKNOWN",
		components: row.components || [],
		parameterCount: Number(row.parameter_count || 0),
		lastSyncedAt: row.last_synced_at,
	};
}

function messageDto(row = {}) {
	return {
		id: row.id,
		recipientId: row.recipient_id,
		recipientName: row.recipient_name || "",
		recipient: row.recipient_masked,
		phoneNumberId: row.phone_number_id,
		template: row.template_name,
		language: row.template_language,
		variables: row.variables || [],
		provider: row.provider,
		status: row.status,
		messageId: row.message_id || "",
		httpStatus: row.http_status,
		response: row.response_payload || {},
		errorCode: row.error_code || "",
		error: row.error_message || "",
		operator: row.operator_name || "",
		sentAt: row.sent_at,
		deliveredAt: row.delivered_at,
		readAt: row.read_at,
		failedAt: row.failed_at,
		createdAt: row.created_at,
		events: Array.isArray(row.related_events) ? row.related_events : [],
	};
}

function eventDto(row = {}) {
	return {
		id: row.id,
		eventType: row.event_type,
		messageId: row.message_id || "",
		phoneNumberId: row.phone_number_id || "",
		sender: row.sender_masked || "",
		status: row.status || "",
		eventAt: row.event_at,
		signatureValid: row.signature_valid === true,
		payload: row.normalized_payload || {},
		processingStatus: row.processing_status,
		processingError: row.processing_error || "",
		processedAt: row.processed_at,
		receivedAt: row.received_at,
	};
}

function countTemplateParameters(components = []) {
	return (Array.isArray(components) ? components : []).reduce((total, component) => {
		const text = cleanText(component?.text);
		const matches = text.match(/{{\d+}}/g) || [];
		return total + new Set(matches).size;
	}, 0);
}

function normalizeWebhookEvents(payload = {}) {
	const events = [];
	for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
		for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
			const value = change.value || {};
			const phoneNumberId = cleanText(value.metadata?.phone_number_id);
			for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
				const eventAt = status.timestamp
					? new Date(Number(status.timestamp) * 1000).toISOString()
					: new Date().toISOString();
				const normalized = {
					eventType: "MESSAGE_STATUS",
					messageId: cleanText(status.id),
					phoneNumberId,
					senderMasked: maskPhone(status.recipient_id),
					status: cleanText(status.status).toUpperCase(),
					eventAt,
					payload: {
						conversationId: cleanText(status.conversation?.id),
						pricingCategory: cleanText(status.pricing?.category),
						errors: Array.isArray(status.errors)
							? status.errors.map((item) => ({
								code: item.code,
								title: cleanText(item.title),
								message: cleanText(item.message),
							}))
							: [],
					},
				};
				normalized.dedupeKey = hashValue(
					`${normalized.eventType}|${normalized.messageId}|${normalized.status}|${eventAt}`,
				);
				events.push(normalized);
			}
			for (const message of Array.isArray(value.messages) ? value.messages : []) {
				const eventAt = message.timestamp
					? new Date(Number(message.timestamp) * 1000).toISOString()
					: new Date().toISOString();
				const normalized = {
					eventType: "INCOMING_MESSAGE",
					messageId: cleanText(message.id),
					phoneNumberId,
					senderMasked: maskPhone(message.from),
					status: "RECEIVED",
					eventAt,
					payload: {
						messageType: cleanText(message.type),
						contextMessageId: cleanText(message.context?.id),
					},
				};
				normalized.dedupeKey = hashValue(
					`${normalized.eventType}|${normalized.messageId}|${eventAt}`,
				);
				events.push(normalized);
			}
		}
	}
	return events;
}

function createWhatsappCloudService({
	dbClient = db,
	audit = auditLog,
	messagingRepository = mensageriaRepository,
	providerFactory = createMetaCloudProvider,
} = {}) {
	async function ensureConfig() {
		await dbClient.query(
			`insert into whatsapp_cloud_config (id) values (1) on conflict (id) do nothing`,
		);
		const result = await dbClient.query(
			`select * from whatsapp_cloud_config where id = 1`,
		);
		return result.rows[0] || {};
	}

	async function recordAudit(action, recordId, user, afterData = {}, beforeData = {}) {
		await audit.recordAuditLog({
			module: "whatsapp_cloud",
			entity: "whatsapp_cloud_config",
			action,
			recordId,
			user,
			beforeData,
			afterData,
			changedFields: audit.calculateChangedFields(beforeData, afterData),
		}).catch(() => {});
	}

	async function resolveSecrets() {
		const environment = getEnvironmentSecrets();
		if (environment.accessToken && environment.appSecret) return environment;
		const result = await dbClient.query(
			`select secret_name, ciphertext, iv, auth_tag, key_id
			   from whatsapp_cloud_secrets
			  where secret_name in ('META_ACCESS_TOKEN', 'META_APP_SECRET')`,
		);
		const stored = new Map(
			result.rows.map((row) => [row.secret_name, decryptStoredSecret(row)]),
		);
		return {
			...environment,
			accessToken:
				environment.accessToken || stored.get(SECRET_NAMES.accessToken) || "",
			appSecret:
				environment.appSecret || stored.get(SECRET_NAMES.appSecret) || "",
			accessTokenSource: environment.accessToken
				? "environment"
				: stored.has(SECRET_NAMES.accessToken) ? "database" : "none",
			appSecretSource: environment.appSecret
				? "environment"
				: stored.has(SECRET_NAMES.appSecret) ? "database" : "none",
		};
	}

	async function providerFor(row) {
		const secrets = await resolveSecrets();
		return providerFactory({
			accessToken: secrets.accessToken,
			graphApiVersion: row.graph_api_version || DEFAULT_GRAPH_VERSION,
		});
	}

	async function getConfig() {
		const [config, secrets] = await Promise.all([ensureConfig(), resolveSecrets()]);
		return configDto(config, { secrets });
	}

	async function saveConfig(payload = {}, user = {}) {
		const current = await ensureConfig();
		const version = cleanText(payload.graphApiVersion || current.graph_api_version);
		if (!/^v\d+\.\d+$/.test(version)) throw apiError("Versão da Graph API inválida.");
		const values = {
			appId: cleanText(payload.appId),
			wabaId: cleanText(payload.wabaId || current.waba_id || DEFAULT_WABA_ID),
			phoneNumberId: cleanText(
				payload.phoneNumberId || current.phone_number_id || DEFAULT_PHONE_NUMBER_ID,
			),
			testPhoneNumber: normalizeE164(
				payload.testPhoneNumber || current.test_phone_number || DEFAULT_TEST_PHONE,
			),
			graphApiVersion: version,
			metaTestMode: payload.metaTestMode !== false,
			productionEnabled:
				payload.productionEnabled === true &&
				String(process.env.META_CLOUD_PRODUCTION_ENABLED).toLowerCase() === "true",
			consentPolicyConfirmed: payload.consentPolicyConfirmed === true,
		};
		const result = await dbClient.query(
			`update whatsapp_cloud_config
			    set app_id = $1,
			        waba_id = $2,
			        phone_number_id = $3,
			        test_phone_number = $4,
			        graph_api_version = $5,
			        meta_test_mode = $6,
			        production_enabled = $7,
			        consent_policy_confirmed = $8,
			        updated_by_id = $9,
			        updated_by_name = $10,
			        updated_at = now()
			  where id = 1
			  returning *`,
			[
				values.appId,
				values.wabaId,
				values.phoneNumberId,
				values.testPhoneNumber,
				values.graphApiVersion,
				values.metaTestMode,
				values.productionEnabled,
				values.consentPolicyConfirmed,
				user.uid || null,
				userName(user),
			],
		);
		const secrets = await resolveSecrets();
		await recordAudit(
			"update",
			"global",
			user,
			values,
			configDto(current, { secrets }),
		);
		return configDto(result.rows[0], { secrets });
	}

	async function saveSecrets(payload = {}, user = {}) {
		const values = [
			[SECRET_NAMES.accessToken, cleanText(payload.accessToken)],
			[SECRET_NAMES.appSecret, cleanText(payload.appSecret)],
		].filter(([, value]) => value);
		if (!values.length) throw apiError("Informe ao menos uma credencial.");
		for (const [name, value] of values) {
			if (value.length < 16) throw apiError(`A credencial ${name} é inválida.`);
			const encrypted = encryptStoredSecret(name, value);
			await dbClient.query(
				`insert into whatsapp_cloud_secrets
				 (secret_name, ciphertext, iv, auth_tag, key_id,
				  updated_by_id, updated_by_name)
				 values ($1, $2, $3, $4, $5, $6, $7)
				 on conflict (secret_name) do update set
				   ciphertext = excluded.ciphertext,
				   iv = excluded.iv,
				   auth_tag = excluded.auth_tag,
				   key_id = excluded.key_id,
				   updated_by_id = excluded.updated_by_id,
				   updated_by_name = excluded.updated_by_name`,
				[
					name,
					encrypted.ciphertext,
					encrypted.iv,
					encrypted.authTag,
					encrypted.keyId,
					user.uid || null,
					userName(user),
				],
			);
		}
		await recordAudit("secrets_update", "global", user, {
			configured: values.map(([name]) => name),
		});
		return getConfig();
	}

	async function deleteSecret(name, user = {}) {
		const normalized = cleanText(name);
		if (!Object.values(SECRET_NAMES).includes(normalized)) {
			throw apiError("Credencial inválida.");
		}
		await dbClient.query(
			"delete from whatsapp_cloud_secrets where secret_name = $1",
			[normalized],
		);
		await recordAudit("secret_delete", "global", user, { removed: normalized });
		return getConfig();
	}

	async function generateVerifyToken(user = {}) {
		if (getEnvironmentSecrets().verifyToken) {
			throw apiError(
				"O verify token já está definido por META_WEBHOOK_VERIFY_TOKEN no servidor.",
				409,
			);
		}
		const token = crypto.randomBytes(32).toString("base64url");
		await dbClient.query(
			`update whatsapp_cloud_config
			    set verify_token_hash = $1, updated_by_id = $2, updated_by_name = $3
			  where id = 1`,
			[hashValue(token), user.uid || null, userName(user)],
		);
		await recordAudit("generate_verify_token", "global", user, {
			verifyTokenConfigured: true,
		});
		return { token };
	}

	async function verifyWebhookToken(receivedToken) {
		const envToken = getEnvironmentSecrets().verifyToken;
		if (envToken) return safeEqual(envToken, receivedToken);
		const row = await ensureConfig();
		return Boolean(row.verify_token_hash) && safeEqual(row.verify_token_hash, hashValue(receivedToken));
	}

	async function verifyWebhookSignature(rawBody, signatureHeader) {
		const environmentSecret = getEnvironmentSecrets().appSecret;
		const secret = environmentSecret || (await resolveSecrets()).appSecret;
		if (!secret) return { ok: false, reason: "META_APP_SECRET_NOT_CONFIGURED" };
		const signature = cleanText(signatureHeader).replace(/^sha256=/i, "");
		if (!/^[a-f0-9]{64}$/i.test(signature)) {
			return { ok: false, reason: "INVALID_SIGNATURE_FORMAT" };
		}
		const expected = crypto
			.createHmac("sha256", secret)
			.update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || ""))
			.digest("hex");
		return { ok: safeEqual(expected, signature), reason: "SIGNATURE_MISMATCH" };
	}

	async function validateConnection(user = {}) {
		const row = await ensureConfig();
		const provider = await providerFor(row);
		const checkedAt = new Date().toISOString();
		try {
			const [phone, waba] = await Promise.all([
				provider.validatePhoneNumber(row.phone_number_id),
				provider.validateWaba(row.waba_id),
			]);
			const payload = {
				phoneNumber: phone.data,
				waba: waba.data,
				graphApiVersion: provider.graphApiVersion,
			};
			await dbClient.query(
				`update whatsapp_cloud_config
				    set last_connection_status = 'CONNECTED',
				        last_connection_http_status = $1,
				        last_connection_payload = $2,
				        last_connection_error = null,
				        last_checked_at = $3
				  where id = 1`,
				[phone.httpStatus, payload, checkedAt],
			);
			await recordAudit("connection_test", "global", user, {
				status: "CONNECTED",
				httpStatus: phone.httpStatus,
			});
			return { ok: true, httpStatus: phone.httpStatus, checkedAt, ...payload };
		} catch (error) {
			await dbClient.query(
				`update whatsapp_cloud_config
				    set last_connection_status = 'FAILED',
				        last_connection_http_status = $1,
				        last_connection_error = $2,
				        last_checked_at = $3
				  where id = 1`,
				[error.httpStatus || error.statusCode || null, cleanText(error.message), checkedAt],
			);
			throw error;
		}
	}

	async function listRecipients() {
		const result = await dbClient.query(
			`select * from whatsapp_cloud_test_recipients order by created_at desc`,
		);
		return result.rows.map(recipientDto);
	}

	async function addRecipient(payload = {}, user = {}) {
		const name = cleanText(payload.name);
		if (!name) throw apiError("Informe o responsável pelo número.");
		const phone = normalizeE164(payload.phone);
		const status = cleanText(payload.authorizationStatus || "PENDING").toUpperCase();
		if (!["PENDING", "AUTHORIZED", "REVOKED"].includes(status)) {
			throw apiError("Situação de autorização inválida.");
		}
		const result = await dbClient.query(
			`insert into whatsapp_cloud_test_recipients
			 (name, phone_e164, authorization_status, meta_registered, notes,
			  created_by_id, created_by_name)
			 values ($1, $2, $3, $4, $5, $6, $7)
			 on conflict (phone_e164) do update set
			   name = excluded.name,
			   authorization_status = excluded.authorization_status,
			   meta_registered = excluded.meta_registered,
			   notes = excluded.notes
			 returning *`,
			[
				name,
				phone,
				status,
				payload.metaRegistered === true,
				cleanText(payload.notes),
				user.uid || null,
				userName(user),
			],
		);
		await recordAudit("recipient_upsert", result.rows[0].id, user, {
			name,
			phone: maskPhone(phone),
			status,
			metaRegistered: payload.metaRegistered === true,
		});
		return recipientDto(result.rows[0]);
	}

	async function revokeRecipient(id, user = {}) {
		const result = await dbClient.query(
			`update whatsapp_cloud_test_recipients
			    set authorization_status = 'REVOKED', meta_registered = false
			  where id = $1
			  returning *`,
			[id],
		);
		if (!result.rows[0]) throw apiError("Destinatário não encontrado.", 404);
		await recordAudit("recipient_revoke", id, user, { status: "REVOKED" });
		return recipientDto(result.rows[0]);
	}

	async function listTemplates() {
		const result = await dbClient.query(
			`select * from whatsapp_cloud_templates order by name, language`,
		);
		return result.rows.map(templateDto);
	}

	async function syncTemplates(user = {}) {
		const row = await ensureConfig();
		const provider = await providerFor(row);
		const response = await provider.listTemplates(row.waba_id);
		const client = await dbClient.connect();
		try {
			await client.query("begin");
			for (const item of response.items) {
				const language = cleanText(item.language || "unknown");
				const name = cleanText(item.name);
				if (!name) continue;
				const id = cleanText(item.id) || `${name}:${language}`;
				await client.query(
					`insert into whatsapp_cloud_templates
					 (id, meta_id, name, language, category, status, components,
					  parameter_count, last_synced_at)
					 values ($1, $2, $3, $4, $5, $6, $7, $8, now())
					 on conflict (name, language) do update set
					   meta_id = excluded.meta_id,
					   category = excluded.category,
					   status = excluded.status,
					   components = excluded.components,
					   parameter_count = excluded.parameter_count,
					   last_synced_at = now()`,
					[
						id,
						cleanText(item.id),
						name,
						language,
						cleanText(item.category),
						cleanText(item.status).toUpperCase() || "UNKNOWN",
						item.components || [],
						countTemplateParameters(item.components),
					],
				);
			}
			await client.query("commit");
		} catch (error) {
			await client.query("rollback").catch(() => {});
			throw error;
		} finally {
			client.release();
		}
		await recordAudit("templates_sync", "global", user, {
			total: response.items.length,
		});
		return { items: await listTemplates(), total: response.items.length };
	}

	async function enforceTestRateLimit(recipientId) {
		const result = await dbClient.query(
			`select
			   count(*) filter (where created_at >= now() - interval '1 minute')::int as global_minute,
			   count(*) filter (
			     where recipient_id = $1 and created_at >= now() - interval '10 seconds'
			   )::int as recipient_window
			 from whatsapp_cloud_test_messages`,
			[recipientId],
		);
		if (Number(result.rows[0]?.global_minute || 0) >= 5) {
			throw apiError("Limite de cinco testes por minuto atingido.", 429);
		}
		if (Number(result.rows[0]?.recipient_window || 0) > 0) {
			throw apiError("Aguarde 10 segundos antes de testar novamente este número.", 429);
		}
	}

	async function sendTestMessage(payload = {}, user = {}) {
		const config = await ensureConfig();
		if (config.meta_test_mode !== true || config.production_enabled === true) {
			throw apiError("O envio desta página é exclusivo do ambiente de testes.", 409);
		}
		const recipientResult = await dbClient.query(
			`select * from whatsapp_cloud_test_recipients where id = $1`,
			[payload.recipientId],
		);
		const recipient = recipientResult.rows[0];
		if (!recipient) throw apiError("Destinatário de teste não encontrado.", 404);
		if (recipient.authorization_status !== "AUTHORIZED" || recipient.meta_registered !== true) {
			throw apiError(
				"O destinatário precisa estar autorizado e cadastrado no painel de testes da Meta.",
				409,
			);
		}
		const templateName = cleanText(payload.template || "hello_world");
		const language = cleanText(payload.language || "en_US");
		const templateResult = await dbClient.query(
			`select * from whatsapp_cloud_templates
			  where name = $1 and language = $2 and upper(status) = 'APPROVED'
			  limit 1`,
			[templateName, language],
		);
		if (!templateResult.rows[0]) {
			throw apiError(
				"O template informado não foi encontrado como aprovado. Sincronize os templates primeiro.",
				409,
			);
		}
		const variables = (Array.isArray(payload.variables) ? payload.variables : [])
			.map(cleanText)
			.filter(Boolean);
		if (variables.length !== Number(templateResult.rows[0].parameter_count || 0)) {
			throw apiError(
				`O template exige ${Number(templateResult.rows[0].parameter_count || 0)} variável(is).`,
			);
		}
		await enforceTestRateLimit(recipient.id);
		const created = await dbClient.query(
			`insert into whatsapp_cloud_test_messages
			 (recipient_id, phone_number_id, recipient_masked, template_name,
			  template_language, variables, status, operator_id, operator_name)
			 values ($1, $2, $3, $4, $5, $6, 'SENDING', $7, $8)
			 returning *`,
			[
				recipient.id,
				config.phone_number_id,
				maskPhone(recipient.phone_e164),
				templateName,
				language,
				variables,
				user.uid || null,
				userName(user),
			],
		);
		try {
			const provider = await providerFor(config);
			const response = await provider.sendTemplate({
				phoneNumberId: config.phone_number_id,
				to: recipient.phone_e164,
				template: templateName,
				language,
				variables,
			});
			const messageId = cleanText(response.data?.messages?.[0]?.id);
			const updated = await dbClient.query(
				`update whatsapp_cloud_test_messages
				    set status = 'ACCEPTED', message_id = nullif($2, ''),
				        http_status = $3, response_payload = $4, sent_at = now()
				  where id = $1 returning *`,
				[created.rows[0].id, messageId, response.httpStatus, response.data],
			);
			await recordAudit("test_send", created.rows[0].id, user, {
				recipient: maskPhone(recipient.phone_e164),
				template: templateName,
				messageId,
			});
			return messageDto({ ...updated.rows[0], recipient_name: recipient.name });
		} catch (error) {
			await dbClient.query(
				`update whatsapp_cloud_test_messages
				    set status = 'FAILED', http_status = $2, error_code = $3,
				        error_message = $4, response_payload = $5, failed_at = now()
				  where id = $1`,
				[
					created.rows[0].id,
					error.httpStatus || error.statusCode || null,
					error.metaCode || "",
					cleanText(error.message),
					error.details || {},
				],
			);
			throw error;
		}
	}

	async function listTestMessages(query = {}) {
		const limit = normalizeLimit(query.limit);
		const offset = normalizeOffset(query.offset);
		const conditions = [];
		const values = [];
		function add(value, sql) {
			values.push(value);
			conditions.push(sql.replace("?", `$${values.length}`));
		}
		if (cleanText(query.status)) add(cleanText(query.status).toUpperCase(), "m.status = ?");
		if (cleanText(query.recipientId)) add(cleanText(query.recipientId), "m.recipient_id = ?");
		if (cleanText(query.template)) add(cleanText(query.template), "m.template_name = ?");
		if (cleanText(query.startDate)) add(cleanText(query.startDate), "m.created_at >= ?::date");
		if (cleanText(query.endDate)) add(cleanText(query.endDate), "m.created_at < (?::date + interval '1 day')");
		const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
		const result = await dbClient.query(
			`select m.*, r.name as recipient_name,
			        coalesce((
			          select jsonb_agg(jsonb_build_object(
			            'status', e.status,
			            'eventType', e.event_type,
			            'eventAt', e.event_at,
			            'processingStatus', e.processing_status
			          ) order by e.event_at)
			          from whatsapp_cloud_webhook_events e
			          where e.message_id = m.message_id
			        ), '[]'::jsonb) as related_events,
			        count(*) over()::int as total_count
			   from whatsapp_cloud_test_messages m
			   left join whatsapp_cloud_test_recipients r on r.id = m.recipient_id
			   ${where}
			  order by m.created_at desc
			  limit $${values.length + 1} offset $${values.length + 2}`,
			[...values, limit, offset],
		);
		return {
			items: result.rows.map(messageDto),
			total: Number(result.rows[0]?.total_count || 0),
			limit,
			offset,
		};
	}

	async function acceptWebhook(payload, { signatureValid = true } = {}) {
		const events = normalizeWebhookEvents(payload);
		const digest = hashValue(JSON.stringify(payload || {}));
		let accepted = 0;
		for (const event of events) {
			const result = await dbClient.query(
				`insert into whatsapp_cloud_webhook_events
				 (dedupe_key, object_type, event_type, message_id, phone_number_id,
				  sender_masked, status, event_at, signature_valid, payload_digest,
				  normalized_payload)
				 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
				 on conflict (dedupe_key) do nothing
				 returning id`,
				[
					event.dedupeKey,
					cleanText(payload.object),
					event.eventType,
					event.messageId || null,
					event.phoneNumberId || null,
					event.senderMasked || null,
					event.status || null,
					event.eventAt || null,
					signatureValid,
					digest,
					event.payload || {},
				],
			);
			if (result.rowCount) accepted += 1;
		}
		if (accepted) {
			await dbClient.query(
				`update whatsapp_cloud_config set last_webhook_event_at = now() where id = 1`,
			);
			setImmediate(() => processPendingWebhookEvents().catch((error) => {
				console.error("[whatsapp-cloud] Falha no worker de webhook:", error?.message || error);
			}));
		}
		return { ok: true, accepted, duplicates: events.length - accepted };
	}

	async function processPendingWebhookEvents() {
		const result = await dbClient.query(
			`select * from whatsapp_cloud_webhook_events
			  where processing_status = 'PENDING'
			  order by received_at
			  limit 100`,
		);
		for (const event of result.rows) {
			try {
				if (event.event_type === "MESSAGE_STATUS" && event.message_id) {
					const status = cleanText(event.status).toUpperCase();
					const columns = {
						DELIVERED: "delivered_at",
						READ: "read_at",
						FAILED: "failed_at",
					};
					const timestampColumn = columns[status];
					await dbClient.query(
						`update whatsapp_cloud_test_messages
						    set status = $2,
						        last_event_at = $3,
						        ${timestampColumn ? `${timestampColumn} = $3,` : ""}
						        error_message = case when $2 = 'FAILED'
						          then coalesce(nullif($4, ''), error_message) else error_message end
						  where message_id = $1
						    and (last_event_at is null or last_event_at <= $3)`,
						[
							event.message_id,
							status,
							event.event_at || event.received_at,
							cleanText(event.normalized_payload?.errors?.[0]?.message),
						],
					);
				}
				await dbClient.query(
					`update whatsapp_cloud_webhook_events
					    set processing_status = 'PROCESSED', processed_at = now(),
					        processing_error = null
					  where id = $1`,
					[event.id],
				);
			} catch (error) {
				await dbClient.query(
					`update whatsapp_cloud_webhook_events
					    set processing_status = 'FAILED', processing_error = $2
					  where id = $1`,
					[event.id, cleanText(error.message)],
				);
			}
		}
		return { processed: result.rows.length };
	}

	async function listWebhookEvents(query = {}) {
		const limit = normalizeLimit(query.limit);
		const offset = normalizeOffset(query.offset);
		const result = await dbClient.query(
			`select *, count(*) over()::int as total_count
			   from whatsapp_cloud_webhook_events
			  order by received_at desc
			  limit $1 offset $2`,
			[limit, offset],
		);
		return {
			items: result.rows.map(eventDto),
			total: Number(result.rows[0]?.total_count || 0),
			limit,
			offset,
		};
	}

	async function markWebhookVerified() {
		await dbClient.query(
			`update whatsapp_cloud_config set last_webhook_verified_at = now() where id = 1`,
		);
	}

	async function getActivationReadiness() {
		const row = await ensureConfig();
		const secrets = await resolveSecrets();
		const [templateCount, successfulTestCount, webhookCount, queueState, messagingConfig] =
			await Promise.all([
				dbClient.query(
					`select count(*)::int as total from whatsapp_cloud_templates where upper(status) = 'APPROVED'`,
				),
				dbClient.query(
					`select count(*)::int as total from whatsapp_cloud_test_messages where status in ('ACCEPTED', 'SENT', 'DELIVERED', 'READ')`,
				),
				dbClient.query(
					`select count(*)::int as total from whatsapp_cloud_webhook_events where signature_valid = true`,
				),
				dbClient.query(
					`select count(*) filter (
					   where status = 'enviando'
					      or (envio_lock_id is not null and envio_lock_id <> '')
					 )::int as processing
					 from mensageria_fila`,
				),
				messagingRepository.getMessagingConfig(),
			]);
		const isTestNumber =
			cleanText(row.phone_number_id) === DEFAULT_PHONE_NUMBER_ID ||
			cleanText(row.test_phone_number) === DEFAULT_TEST_PHONE;
		const checks = [
			{ id: "production_flag", label: "Ambiente produtivo liberado", ok: row.production_enabled === true },
			{ id: "not_test_mode", label: "Modo de testes desativado", ok: row.meta_test_mode === false },
			{ id: "production_number", label: "Número produtivo configurado", ok: !isTestNumber },
			{ id: "access_token", label: "Access Token configurado", ok: Boolean(secrets.accessToken) },
			{ id: "app_secret", label: "App Secret configurado", ok: Boolean(secrets.appSecret) },
			{ id: "connection", label: "Credenciais validadas", ok: row.last_connection_status === "CONNECTED" },
			{ id: "webhook", label: "Webhook assinado validado", ok: Number(webhookCount.rows[0]?.total || 0) > 0 },
			{ id: "templates", label: "Template aprovado disponível", ok: Number(templateCount.rows[0]?.total || 0) > 0 },
			{ id: "test", label: "Envio de integração executado", ok: Number(successfulTestCount.rows[0]?.total || 0) > 0 },
			{ id: "consent", label: "Política de consentimento confirmada", ok: row.consent_policy_confirmed === true },
			{
				id: "queue",
				label: "Nenhuma mensagem produtiva em processamento",
				ok: Boolean(messagingConfig) && Number(queueState.rows[0]?.processing || 0) === 0,
			},
		];
		return {
			ready: checks.every((item) => item.ok),
			checks,
			currentProvider: cleanText(messagingConfig?.whatsappProvider || "evolution"),
			targetProvider: "official_whatsapp",
			blockedBecauseTestEnvironment: isTestNumber || row.meta_test_mode !== false,
		};
	}

	async function activateProvider(payload = {}, user = {}) {
		const reason = cleanText(payload.reason);
		if (!reason) throw apiError("Informe o motivo da ativação.");
		const lockClient = await dbClient.connect();
		try {
			await lockClient.query(
				"select pg_advisory_lock(hashtext('whatsapp_cloud_provider_switch'))",
			);
			const readiness = await getActivationReadiness();
			if (readiness.currentProvider === "official_whatsapp") {
				return { ok: true, provider: "official_whatsapp", alreadyActive: true };
			}
			if (!readiness.ready) {
				await dbClient.query(
					`insert into whatsapp_cloud_provider_audit
					 (action, from_provider, to_provider, status, reason, readiness,
					  operator_id, operator_name)
					 values ('ACTIVATE', $1, 'official_whatsapp', 'BLOCKED', $2, $3, $4, $5)`,
					[
						readiness.currentProvider,
						reason,
						readiness,
						user.uid || null,
						userName(user),
					],
				);
				throw apiError(
					"A ativação está bloqueada até que todos os requisitos produtivos sejam atendidos.",
					409,
					readiness,
				);
			}
			const config = await ensureConfig();
			await messagingRepository.saveMessagingConfigPatch({
				whatsappProvider: "official_whatsapp",
				officialWhatsappEnabled: true,
				officialWhatsappBaseUrl: `https://graph.facebook.com/${config.graph_api_version}`,
				officialWhatsappPhoneNumberId: config.phone_number_id,
				officialWhatsappBusinessAccountId: config.waba_id,
			});
			await dbClient.query(
				`update whatsapp_cloud_config
				    set active_provider = 'official_whatsapp', rollback_provider = $1
				  where id = 1`,
				[readiness.currentProvider],
			);
			await dbClient.query(
				`insert into whatsapp_cloud_provider_audit
				 (action, from_provider, to_provider, status, reason, readiness,
				  operator_id, operator_name)
				 values ('ACTIVATE', $1, 'official_whatsapp', 'COMPLETE', $2, $3, $4, $5)`,
				[
					readiness.currentProvider,
					reason,
					readiness,
					user.uid || null,
					userName(user),
				],
			);
			return { ok: true, provider: "official_whatsapp" };
		} finally {
			await lockClient
				.query("select pg_advisory_unlock(hashtext('whatsapp_cloud_provider_switch'))")
				.catch(() => {});
			lockClient.release();
		}
	}

	async function rollbackProvider(payload = {}, user = {}) {
		const reason = cleanText(payload.reason);
		if (!reason) throw apiError("Informe o motivo da reversão.");
		const lockClient = await dbClient.connect();
		try {
			await lockClient.query(
				"select pg_advisory_lock(hashtext('whatsapp_cloud_provider_switch'))",
			);
			const config = await ensureConfig();
			const current = await messagingRepository.getMessagingConfig();
			const destination = cleanText(
				config.rollback_provider || payload.provider || "evolution",
			);
			if (!destination || destination === "official_whatsapp") {
				throw apiError("Gateway anterior inválido para reversão.", 409);
			}
			if (cleanText(current?.whatsappProvider) === destination) {
				return { ok: true, provider: destination, alreadyActive: true };
			}
			const queueState = await dbClient.query(
				`select count(*) filter (
				   where status = 'enviando'
				      or (envio_lock_id is not null and envio_lock_id <> '')
				 )::int as processing
				 from mensageria_fila`,
			);
			if (Number(queueState.rows[0]?.processing || 0) > 0) {
				throw apiError(
					"A reversão está bloqueada enquanto houver mensagens em processamento.",
					409,
				);
			}
			await messagingRepository.saveMessagingConfigPatch({
				whatsappProvider: destination,
			});
			await dbClient.query(
				`update whatsapp_cloud_config set active_provider = $1 where id = 1`,
				[destination],
			);
			await dbClient.query(
				`insert into whatsapp_cloud_provider_audit
				 (action, from_provider, to_provider, status, reason,
				  operator_id, operator_name)
				 values ('ROLLBACK', 'official_whatsapp', $1, 'COMPLETE', $2, $3, $4)`,
				[destination, reason, user.uid || null, userName(user)],
			);
			return { ok: true, provider: destination };
		} finally {
			await lockClient
				.query("select pg_advisory_unlock(hashtext('whatsapp_cloud_provider_switch'))")
				.catch(() => {});
			lockClient.release();
		}
	}

	async function getOverview() {
		const [row, secrets, recipients, templates, tests, events, messagingConfig] =
			await Promise.all([
				ensureConfig(),
				resolveSecrets(),
				dbClient.query(
					`select count(*)::int as total,
					        count(*) filter (where authorization_status = 'AUTHORIZED')::int as authorized
					   from whatsapp_cloud_test_recipients`,
				),
				dbClient.query(
					`select count(*)::int as total,
					        count(*) filter (where upper(status) = 'APPROVED')::int as approved,
					        count(*) filter (where upper(status) = 'PENDING')::int as pending,
					        count(*) filter (where upper(status) = 'REJECTED')::int as rejected
					   from whatsapp_cloud_templates`,
				),
				dbClient.query(
					`select count(*)::int as total,
					        count(*) filter (where status in ('ACCEPTED', 'SENT', 'DELIVERED', 'READ'))::int as successful
					   from whatsapp_cloud_test_messages`,
				),
				dbClient.query(
					`select count(*)::int as total,
					        max(received_at) as last_event_at,
					        count(*) filter (where processing_status = 'FAILED')::int as errors
					   from whatsapp_cloud_webhook_events`,
				),
				messagingRepository.getMessagingConfig(),
			]);
		return {
			config: configDto(row, { secrets }),
			gateway: {
				currentProvider: cleanText(messagingConfig?.whatsappProvider || "evolution"),
				currentEnabled:
					messagingConfig?.whatsappProvider === "cvortex"
						? messagingConfig?.cvortexEnabled === true
						: messagingConfig?.evolutionEnabled === true,
				migrationStatus: "TEST_ONLY",
			},
			recipients: recipients.rows[0] || { total: 0, authorized: 0 },
			templates: templates.rows[0] || { total: 0, approved: 0, pending: 0, rejected: 0 },
			tests: tests.rows[0] || { total: 0, successful: 0 },
			webhooks: events.rows[0] || { total: 0, errors: 0, last_event_at: null },
		};
	}

	return {
		acceptWebhook,
		activateProvider,
		addRecipient,
		deleteSecret,
		generateVerifyToken,
		getActivationReadiness,
		getConfig,
		getOverview,
		listRecipients,
		listTemplates,
		listTestMessages,
		listWebhookEvents,
		markWebhookVerified,
		processPendingWebhookEvents,
		revokeRecipient,
		rollbackProvider,
		saveConfig,
		saveSecrets,
		sendTestMessage,
		syncTemplates,
		validateConnection,
		verifyWebhookSignature,
		verifyWebhookToken,
	};
}

const service = createWhatsappCloudService();

module.exports = {
	...service,
	__testables: {
		configDto,
		decryptStoredSecret,
		encryptStoredSecret,
		hashValue,
		maskPhone,
		normalizeE164,
		normalizeWebhookEvents,
		safeEqual,
	},
	createWhatsappCloudService,
};
