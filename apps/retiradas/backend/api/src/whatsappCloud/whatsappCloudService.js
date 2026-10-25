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
const TEST_FLOW_COLLECTION = "whatsapp_cloud_test_flows";
const DEFAULT_TEST_FLOW_TEMPLATE = "retiradas_recolhimento_teste_v2";
const TEST_FLOW_TEMPLATES = Object.freeze({
	retiradas_agendamento_teste_v2: {
		variables: ({ firstName, contract, city }) => [firstName, contract, city],
		buttons: [
			{ id: "flow:schedule", title: "Agendar" },
			{ id: "flow:delivered", title: "Já entregue" },
			{ id: "flow:support", title: "Falar com suporte" },
		],
	},
	retiradas_recolhimento_teste_v2: {
		variables: ({ firstName, city, cancellationDate }) => [firstName, city, cancellationDate],
		buttons: [
			{ id: "flow:schedule", title: "AGENDAR RETIRADA" },
			{ id: "flow:delivered", title: "JÁ ENTREGUE" },
			{ id: "flow:support", title: "FALAR COM ATENDENTE" },
		],
	},
});
const TEST_FLOW_LANGUAGE = "pt_BR";
const MAX_TEST_FLOW_AUTO_REPLIES = 2;
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

function messageInteraction(message = {}) {
	const interactive = message.interactive?.button_reply || {};
	const templateButton = message.button || {};
	return {
		buttonId: cleanText(interactive.id || templateButton.payload),
		buttonTitle: cleanText(interactive.title || templateButton.text),
		inputAction: parseTypedFlowAction(message.text?.body),
	};
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
				const interaction = messageInteraction(message);
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
						senderHash: hashValue(cleanText(message.from).replace(/\D/g, "")),
						buttonId: interaction.buttonId,
						buttonTitle: interaction.buttonTitle,
						inputAction: interaction.inputAction,
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

function saoPauloDateKey(date = new Date()) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${values.year}-${values.month}-${values.day}`;
}

function addDays(dateKey, days) {
	const [year, month, day] = String(dateKey).split("-").map(Number);
	const value = new Date(Date.UTC(year, month - 1, day + days, 12));
	return value.toISOString().slice(0, 10);
}

function formatDateButton(dateKey) {
	const [year, month, day] = String(dateKey).split("-");
	return `${day}/${month}/${year}`;
}

function getTestFlowDateOptions(now = new Date()) {
	const today = saoPauloDateKey(now);
	return [1, 2, 3].map((offset) => {
		const date = addDays(today, offset);
		return {
			id: `flow:date:${date}`,
			title: formatDateButton(date),
			date,
		};
	});
}

function renderTestFlowDateOptions(options = []) {
	return options.map((option, index) => `${index + 1} - ${option.title}`).join("\n");
}

function testFlowDateMessage(options = [], { invalid = false } = {}) {
	const choices = renderTestFlowDateOptions(options);
	if (invalid) {
		return `Ops, não consegui identificar a data. 😅\n\nPor favor, selecione uma das opções abaixo ou envie o dia no formato *DD/MM*:\n\n${choices}\n\nExemplo: 25/08`;
	}
	return `Perfeito! Escolha uma das datas abaixo para a sua retirada:\n\n${choices}\n\nSe preferir outro dia, basta digitar a data desejada (exemplo: *25/08*).`;
}

function testFlowTimeMessage(dateKey, { invalid = false, other = false } = {}) {
	if (invalid) {
		return "Ops, não consegui identificar o horário. 😅\n\nPor favor, digite o número de uma das opções ou envie a hora no formato 00:00:\n\n1 - 09h\n2 - 12h\n3 - 16h\n4 - Outro horário\n\nExemplo: *14:30*";
	}
	if (other) {
		return "Perfeito! Envie o horário desejado no formato 00:00.\n\nExemplo: *14:30*";
	}
	return `Perfeito. Agora selecione o horário ideal para o dia ${formatDateButton(dateKey)}:\n\n1 - 09h\n2 - 12h\n3 - 16h\n4 - Outro horário\n\nDigite o número correspondente ou o horário exato que prefere (exemplo: 14:30).`;
}

function parseTypedFlowAction(value, now = new Date()) {
	const text = cleanText(value).toLowerCase();
	if (!text) return "";
	if (["1", "2", "3"].includes(text)) return `flow:choice:${text}`;
	if (text === "4" || text.includes("outro horario") || text.includes("outro horário")) {
		return "flow:other-time";
	}
	const time = text.match(/^(?:horario\s+|horário\s+)?([01]?\d|2[0-3])\s*[:h]\s*([0-5]\d)$/i);
	if (time) {
		return `flow:time:${String(Number(time[1])).padStart(2, "0")}:${time[2]}`;
	}
	const date = text.match(/^(?:dia\s+)?(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])(?:[/-](\d{4}))?$/i);
	if (!date) return "";
	const today = saoPauloDateKey(now);
	let year = Number(date[3] || today.slice(0, 4));
	const month = Number(date[2]);
	const day = Number(date[1]);
	let candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	const parsed = new Date(`${candidate}T12:00:00Z`);
	if (
		Number.isNaN(parsed.getTime()) ||
		parsed.getUTCFullYear() !== year ||
		parsed.getUTCMonth() + 1 !== month ||
		parsed.getUTCDate() !== day
	) return "";
	if (!date[3] && candidate <= today) {
		year += 1;
		candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	}
	return `flow:date:${candidate}`;
}

function normalizeFlowAction(payload = {}) {
	const id = cleanText(payload.buttonId).toLowerCase();
	const inputAction = cleanText(payload.inputAction).toLowerCase();
	const title = cleanText(payload.buttonTitle || id)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
	if (id.startsWith("flow:")) return id;
	if (inputAction) return inputAction;
	if (title === "sim" || title.includes("agendar")) return "flow:schedule";
	if (title.includes("ja entregue") || title.includes("entregue")) return "flow:delivered";
	if (title.includes("falar") && (title.includes("atendente") || title.includes("suporte"))) return "flow:support";
	return title;
}

function canSendTestFlowAutoReply(replyCount) {
	return Number(replyCount || 0) < MAX_TEST_FLOW_AUTO_REPLIES;
}

function testFlowTemplateConfig(templateName) {
	return TEST_FLOW_TEMPLATES[cleanText(templateName)] || null;
}

function flowDto(row = {}) {
	const data = row.data || row;
	return {
		id: row.document_id || data.id || "",
		recipientId: data.recipientId || "",
		recipientName: data.recipientName || "",
		recipient: data.recipientMasked || "",
		state: data.state || "UNKNOWN",
		outcome: data.outcome || "",
		selectedDate: data.selectedDate || "",
		selectedTime: data.selectedTime || "",
		simulatedAppointment: data.simulatedAppointment || null,
		transcript: Array.isArray(data.transcript) ? data.transcript : [],
		startedAt: data.startedAt || null,
		completedAt: data.completedAt || null,
		updatedAt: row.updated_at || data.updatedAt || null,
	};
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

	async function getTestFlow(recipientId) {
		const path = `${TEST_FLOW_COLLECTION}/${cleanText(recipientId)}`;
		const result = await dbClient.query(
			`select document_id, data, updated_at
			   from app_documents
			  where path = $1`,
			[path],
		);
		return result.rows[0] || null;
	}

	async function saveTestFlow(recipientId, data = {}) {
		const id = cleanText(recipientId);
		const path = `${TEST_FLOW_COLLECTION}/${id}`;
		const payload = { ...data, id, recipientId: id, updatedAt: new Date().toISOString() };
		const result = await dbClient.query(
			`insert into app_documents (path, collection_path, document_id, parent_path, data)
			 values ($1, $2, $3, null, $4::jsonb)
			 on conflict (path) do update set data = excluded.data
			 returning document_id, data, updated_at`,
			[path, TEST_FLOW_COLLECTION, id, JSON.stringify(payload)],
		);
		return result.rows[0];
	}

	function appendTranscript(flow = {}, entry = {}) {
		return [
			...(Array.isArray(flow.transcript) ? flow.transcript : []),
			{ ...entry, at: entry.at || new Date().toISOString() },
		].slice(-30);
	}

	async function findFlowRecipient(senderHash) {
		if (!senderHash) return null;
		const result = await dbClient.query(
			`select * from whatsapp_cloud_test_recipients
			  where authorization_status = 'AUTHORIZED' and meta_registered = true`,
		);
		return result.rows.find(
			(row) => hashValue(cleanText(row.phone_e164).replace(/\D/g, "")) === senderHash,
		) || null;
	}

	async function recordFlowOutbound({ recipient, config, response, label }) {
		const messageId = cleanText(response.data?.messages?.[0]?.id);
		await dbClient.query(
			`insert into whatsapp_cloud_test_messages
			 (recipient_id, phone_number_id, recipient_masked, template_name,
			  template_language, variables, status, message_id, http_status,
			  response_payload, operator_name, sent_at)
			 values ($1, $2, $3, $4, $5, '[]'::jsonb, 'ACCEPTED', nullif($6, ''),
			         $7, $8, 'Retorninho - fluxo de teste', now())`,
			[
				recipient.id,
				config.phone_number_id,
				maskPhone(recipient.phone_e164),
				label,
				TEST_FLOW_LANGUAGE,
				messageId,
				response.httpStatus,
				response.data,
			],
		);
		return messageId;
	}

	async function sendFlowButtons({ recipient, config, body, buttons, label }) {
		const provider = await providerFor(config);
		const response = await provider.sendInteractiveButtons({
			phoneNumberId: config.phone_number_id,
			to: recipient.phone_e164,
			body,
			buttons,
		});
		const messageId = await recordFlowOutbound({ recipient, config, response, label });
		return { messageId, body };
	}

	async function sendFlowText({ recipient, config, text, label }) {
		const provider = await providerFor(config);
		const response = await provider.sendText({
			phoneNumberId: config.phone_number_id,
			to: recipient.phone_e164,
			text,
		});
		const messageId = await recordFlowOutbound({ recipient, config, response, label });
		return { messageId, body: text };
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
						JSON.stringify(item.components || []),
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
				JSON.stringify(variables),
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

	async function startTestFlow(payload = {}, user = {}) {
		const recipientId = cleanText(payload.recipientId);
		const recipientResult = await dbClient.query(
			`select * from whatsapp_cloud_test_recipients where id = $1`,
			[recipientId],
		);
		const recipient = recipientResult.rows[0];
		if (!recipient) throw apiError("Destinatário de teste não encontrado.", 404);
		const firstName = cleanText(payload.firstName || recipient.name).split(/\s+/)[0];
		const contract = cleanText(payload.contract);
		const city = cleanText(payload.city);
		const cancellationDate = cleanText(payload.cancellationDate);
		const cancellationDateLabel = /^\d{4}-\d{2}-\d{2}$/.test(cancellationDate)
			? formatDateButton(cancellationDate)
			: cancellationDate;
		const templateName = cleanText(payload.templateName) || DEFAULT_TEST_FLOW_TEMPLATE;
		const templateConfig = testFlowTemplateConfig(templateName);
		if (!templateConfig) {
			throw apiError("Selecione um template válido para iniciar o fluxo.");
		}
		if (!firstName || !city) {
			throw apiError("Informe primeiro nome e cidade para iniciar o fluxo.");
		}
		if (templateName === "retiradas_agendamento_teste_v2" && !contract) {
			throw apiError("Informe o contrato para usar o template atual.");
		}
		if (templateName === "retiradas_recolhimento_teste_v2" && !cancellationDate) {
			throw apiError("Informe a data de cancelamento para usar o novo template.");
		}
		await syncTemplates(user);
		const sent = await sendTestMessage(
			{
				recipientId,
				template: templateName,
				language: TEST_FLOW_LANGUAGE,
				variables: templateConfig.variables({ firstName, contract, city, cancellationDate: cancellationDateLabel }),
			},
			user,
		);
		const startedAt = new Date().toISOString();
		const flow = await saveTestFlow(recipientId, {
			recipientName: recipient?.name || "",
			recipientMasked: maskPhone(recipient?.phone_e164),
			state: "AWAITING_ACTION",
			outcome: "",
			selectedDate: "",
			selectedTime: "",
			dateOptions: [],
			invalidReplyCount: 0,
			postFlowReplyCount: 0,
			simulatedAppointment: null,
			startedAt,
			completedAt: null,
			startedBy: userName(user),
			templateName,
			testContext: { firstName, contract, city, cancellationDate: cancellationDateLabel },
			transcript: [
				{
					direction: "OUT",
					kind: "TEMPLATE_BUTTONS",
					text: `${templateName} para ${firstName}, ${city} · ${templateConfig.buttons.map((button) => button.title).join(" | ")}`,
					messageId: sent.messageId,
					at: startedAt,
				},
			],
		});
		await recordAudit("test_flow_start", recipientId, user, {
			template: templateName,
			messageId: sent.messageId,
		});
		return flowDto(flow);
	}

	async function listTestFlows(query = {}) {
		const limit = normalizeLimit(query.limit, 30);
		const result = await dbClient.query(
			`select document_id, data, updated_at
			   from app_documents
			  where collection_path = $1
			  order by updated_at desc
			  limit $2`,
			[TEST_FLOW_COLLECTION, limit],
		);
		return { items: result.rows.map(flowDto), total: result.rows.length };
	}

	async function resendCurrentFlowStep({ flow, recipient, config, invalid = false, other = false }) {
		if (flow.state === "AWAITING_DATE") {
			const options = Array.isArray(flow.dateOptions) && flow.dateOptions.length
				? flow.dateOptions
				: getTestFlowDateOptions();
			return sendFlowButtons({
				recipient,
				config,
				body: testFlowDateMessage(options, { invalid }),
				buttons: options,
				label: "interactive_dates",
			});
		}
		if (flow.state === "AWAITING_TIME") {
			return sendFlowButtons({
				recipient,
				config,
				body: testFlowTimeMessage(flow.selectedDate, { invalid, other }),
				buttons: [
					{ id: "flow:time:09:00", title: "09h" },
					{ id: "flow:time:12:00", title: "12h" },
					{ id: "flow:time:16:00", title: "16h" },
				],
				label: "interactive_times",
			});
		}
		const templateConfig = testFlowTemplateConfig(flow.templateName)
			|| testFlowTemplateConfig(DEFAULT_TEST_FLOW_TEMPLATE);
		return sendFlowButtons({
			recipient,
			config,
			body: "Escolha uma opção para continuarmos:",
			buttons: templateConfig.buttons,
			label: "interactive_actions",
		});
	}

	async function processTestFlowInbound(event = {}) {
		const senderHash = cleanText(event.normalized_payload?.senderHash);
		const recipient = await findFlowRecipient(senderHash);
		if (!recipient) return { ignored: true, reason: "TEST_RECIPIENT_NOT_FOUND" };
		const flowRow = await getTestFlow(recipient.id);
		if (!flowRow) return { ignored: true, reason: "TEST_FLOW_NOT_STARTED" };
		const flow = flowRow.data || {};
		if (["CANCELLED", "FAILED"].includes(flow.state)) {
			return { ignored: true, reason: "TEST_FLOW_CLOSED" };
		}
		if (flow.state === "COMPLETED") {
			if (!canSendTestFlowAutoReply(flow.postFlowReplyCount)) {
				return { ignored: true, reason: "TEST_FLOW_REPLY_LIMIT_REACHED" };
			}
			const config = await ensureConfig();
			const sent = await sendFlowText({
				recipient,
				config,
				text: "Olá! Este número envia apenas mensagens automáticas do sistema e não recebe respostas.\n\nPara falar com nosso time ou tirar dúvidas, por favor, entre em contato com a Central de Retiradas pelo número *(31) 3987-0880.*",
				label: "flow_after_completion",
			});
			await saveTestFlow(recipient.id, {
				...flow,
				postFlowReplyCount: Number(flow.postFlowReplyCount || 0) + 1,
				transcript: appendTranscript(flow, {
					direction: "OUT",
					kind: "AFTER_COMPLETION",
					text: sent.body,
					messageId: sent.messageId,
				}),
			});
			return { processed: true, reason: "TEST_FLOW_FINISHED_AUTO_REPLY" };
		}
		const config = await ensureConfig();
		let action = normalizeFlowAction(event.normalized_payload || {});
		if (flow.state === "AWAITING_DATE" && action.startsWith("flow:choice:")) {
			const selected = (flow.dateOptions || [])[Number(action.slice(-1)) - 1];
			action = selected?.id || action;
		}
		if (flow.state === "AWAITING_TIME" && action.startsWith("flow:choice:")) {
			action = {
				"1": "flow:time:09:00",
				"2": "flow:time:12:00",
				"3": "flow:time:16:00",
			}[action.slice(-1)] || action;
		}
		const inboundText = cleanText(event.normalized_payload?.buttonTitle || action);
		let next = {
			...flow,
			transcript: appendTranscript(flow, {
				direction: "IN",
				kind: "BUTTON_REPLY",
				text: inboundText,
				messageId: event.message_id,
			}),
		};

		if (flow.state === "AWAITING_ACTION" && action === "flow:schedule") {
			const dateOptions = getTestFlowDateOptions();
			const sent = await sendFlowButtons({
				recipient,
				config,
				body: testFlowDateMessage(dateOptions),
				buttons: dateOptions,
				label: "interactive_dates",
			});
			next = {
				...next,
				state: "AWAITING_DATE",
				dateOptions,
				transcript: appendTranscript(next, {
					direction: "OUT",
					kind: "DATE_BUTTONS",
					text: sent.body,
					messageId: sent.messageId,
				}),
			};
		} else if (flow.state === "AWAITING_ACTION" && action === "flow:delivered") {
			const sent = await sendFlowText({
				recipient,
				config,
				text: "Informação anotada com sucesso!\n\nPara receber suporte direto do nosso time, acione a central de retiradas pelo número *(31) 3987-0880*.",
				label: "flow_delivered_confirmation",
			});
			next = {
				...next,
				state: "COMPLETED",
				outcome: "DELIVERED",
				completedAt: new Date().toISOString(),
				transcript: appendTranscript(next, { direction: "OUT", kind: "TEXT", text: sent.body, messageId: sent.messageId }),
			};
		} else if (flow.state === "AWAITING_ACTION" && action === "flow:support") {
			const sent = await sendFlowText({
				recipient,
				config,
				text: "Certo! Fale com a Central de Retiradas pelo número +55 31 3987-0880:\nhttps://wa.me/553139870880",
				label: "flow_support",
			});
			next = {
				...next,
				state: "COMPLETED",
				outcome: "SUPPORT",
				completedAt: new Date().toISOString(),
				transcript: appendTranscript(next, { direction: "OUT", kind: "TEXT", text: sent.body, messageId: sent.messageId }),
			};
		} else if (flow.state === "AWAITING_DATE") {
			const selectedOption = (flow.dateOptions || []).find((option) => option.id === action);
			const selectedDate = selectedOption?.date || (action.startsWith("flow:date:") ? action.slice("flow:date:".length) : "");
			if (/^\d{4}-\d{2}-\d{2}$/.test(selectedDate) && selectedDate > saoPauloDateKey()) {
				const sent = await sendFlowButtons({
					recipient,
					config,
					body: testFlowTimeMessage(selectedDate),
					buttons: [
						{ id: "flow:time:09:00", title: "09h" },
						{ id: "flow:time:12:00", title: "12h" },
						{ id: "flow:time:16:00", title: "16h" },
					],
					label: "interactive_times",
				});
				next = {
					...next,
					state: "AWAITING_TIME",
					selectedDate,
					transcript: appendTranscript(next, { direction: "OUT", kind: "TIME_BUTTONS", text: sent.body, messageId: sent.messageId }),
				};
			} else {
				const invalidReplyCount = Number(flow.invalidReplyCount || 0) + 1;
				const sent = await resendCurrentFlowStep({ flow, recipient, config, invalid: true });
				next.invalidReplyCount = invalidReplyCount;
				if (!canSendTestFlowAutoReply(invalidReplyCount)) {
					next.state = "CANCELLED";
					next.outcome = "REPLY_LIMIT_REACHED";
					next.completedAt = new Date().toISOString();
				}
				next.transcript = appendTranscript(next, { direction: "OUT", kind: "DATE_BUTTONS", text: sent.body, messageId: sent.messageId });
			}
		} else if (flow.state === "AWAITING_TIME" && action === "flow:other-time") {
			const sent = await resendCurrentFlowStep({ flow, recipient, config, other: true });
			next.transcript = appendTranscript(next, { direction: "OUT", kind: "TIME_INPUT", text: sent.body, messageId: sent.messageId });
		} else if (flow.state === "AWAITING_TIME" && action.startsWith("flow:time:")) {
			const selectedTime = action.slice("flow:time:".length);
			if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(selectedTime)) {
				const appointment = {
					id: crypto.randomUUID(),
					date: flow.selectedDate,
					time: selectedTime,
					status: "SIMULATED",
					createdAt: new Date().toISOString(),
				};
				const sent = await sendFlowText({
					recipient,
					config,
					text: "Tudo certo! Seu agendamento foi registrado com sucesso.\n\nSe surgir qualquer dúvida, nossa central de retiradas está à disposição pelo WhatsApp: *(31) 3987-0880*.",
					label: "flow_schedule_confirmation",
				});
				next = {
					...next,
					state: "COMPLETED",
					outcome: "SCHEDULED",
					selectedTime,
					simulatedAppointment: appointment,
					completedAt: new Date().toISOString(),
					transcript: appendTranscript(next, { direction: "OUT", kind: "CONFIRMATION", text: sent.body, messageId: sent.messageId }),
				};
			}
		} else {
			const invalidReplyCount = Number(flow.invalidReplyCount || 0) + 1;
			const sent = await resendCurrentFlowStep({ flow, recipient, config, invalid: flow.state === "AWAITING_TIME" });
			next.invalidReplyCount = invalidReplyCount;
			if (!canSendTestFlowAutoReply(invalidReplyCount)) {
				next.state = "CANCELLED";
				next.outcome = "REPLY_LIMIT_REACHED";
				next.completedAt = new Date().toISOString();
			}
			next.transcript = appendTranscript(next, { direction: "OUT", kind: "BUTTONS", text: sent.body, messageId: sent.messageId });
		}

		await saveTestFlow(recipient.id, next);
		return { processed: true, state: next.state, outcome: next.outcome || "" };
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
				if (event.event_type === "INCOMING_MESSAGE") {
					await processTestFlowInbound(event);
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
		listTestFlows,
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
		startTestFlow,
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
		messageInteraction,
		normalizeE164,
		normalizeFlowAction,
		normalizeWebhookEvents,
		getTestFlowDateOptions,
		canSendTestFlowAutoReply,
		testFlowTemplateConfig,
		safeEqual,
	},
	createWhatsappCloudService,
};
