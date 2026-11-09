const crypto = require("node:crypto");
const db = require("../db");
const evolutionMessaging = require("../evolutionMessaging");
const whatsappCloudService = require("../whatsappCloud/whatsappCloudService");
const mapsService = require("../mapsV2/mapsV2Service");
const rolePermissions = require("../rolePermissions");
const usersRepository = require("../usersRepository");
const ai = require("./retorninhoAi");
const security = require("./retorninhoSecurity");
const { LIST_PROTOCOLS_SQL, LIST_QUEUE_SQL } = require("./retorninhoSql");

const INSTANCE_NAME = "retorninho-ia";
const MAX_ATTEMPTS = 6;
const BATCH_SIZE = 8;
const TOOL_FEATURES = Object.freeze({
	consultar_os: "serviceOrderLookup",
	buscar_oportunidades: "mapsSearch",
	solicitar_os: "selfAssignment",
	consultar_protocolo: "protocols",
	consultar_produtividade: "productivity",
	consultar_equipamento: "equipment",
	consultar_conhecimento: "knowledge",
});
const ALL_TOOLS = Object.freeze([
	"consultar_os",
	"buscar_oportunidades",
	"solicitar_os",
	"consultar_protocolo",
	"consultar_produtividade",
	"consultar_equipamento",
	"consultar_conhecimento",
]);
let workerTimer = null;
let workerBusy = false;

function text(value) {
	return String(value ?? "").trim();
}

function welcomeMessage(displayName, hour = Number(new Intl.DateTimeFormat("pt-BR", {
	timeZone: "America/Sao_Paulo",
	hour: "2-digit",
	hour12: false,
}).format(new Date()))) {
	const firstName = text(displayName).split(/\s+/)[0] || "técnico";
	const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
	return `${greeting}, ${firstName}! 👋

Eu sou o Retorninho, assistente virtual do REVO. Posso ajudar com:

1. Consultar O.S. ou cliente
2. Buscar oportunidades próximas
3. Solicitar uma O.S. para o seu nome
4. Consultar protocolo
5. Ver sua produtividade
6. Consultar equipamento ou procedimento

Envie o número da opção ou escreva o que você precisa.`;
}

function normalize(value) {
	return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toUpperCase();
}

function digits(value) {
	return text(value).replace(/\D/g, "");
}

function apiError(message, statusCode = 400, code = "RETORNINHO_ERROR") {
	const error = new Error(message);
	error.statusCode = statusCode;
	error.code = code;
	return error;
}

function pageOf(query = {}) {
	const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
	const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 25, 1), 100);
	return { page, limit, offset: (page - 1) * limit };
}

function pagination(rows, page, limit) {
	const total = Number(rows[0]?.total_count || 0);
	return { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}

function userIdentity(user = {}) {
	const profile = user.profile || user;
	return {
		uid: text(user.uid || profile.uid || profile.id || user.email || profile.email),
		name: text(profile.nome || profile.displayName || profile.display_name || user.nome || user.email || profile.email),
		email: text(user.email || profile.email).toLowerCase(),
		role: text(user.role || profile.role).toLowerCase(),
		regional: text(profile.regional || user.regional),
	};
}

function allowedTools(row = {}) {
	const configured = Array.isArray(row.tool_permissions) ? row.tool_permissions : [];
	return configured.length ? configured.filter((item) => ALL_TOOLS.includes(item)) : [...ALL_TOOLS];
}

function featureEnabled(config, tool) {
	const feature = TOOL_FEATURES[tool];
	return !feature || config.features?.[feature] !== false;
}

function maskConfig(row = {}) {
	return {
		id: row.id || "global",
		enabled: Boolean(row.enabled),
		automaticReplies: Boolean(row.automatic_replies),
		provider: row.provider || "evolution",
		metaPhoneNumberId: row.meta_phone_number_id || "",
		instanceName: INSTANCE_NAME,
		evolutionUrl: row.evolution_url || "",
		evolutionApiKeyConfigured: Boolean(row.evolution_api_key_ciphertext),
		aiProvider: row.ai_provider || "gemini",
		aiModel: row.ai_model || "gemini-2.5-flash",
		aiApiKeyConfigured: Boolean(row.ai_api_key_ciphertext || process.env.GEMINI_API_KEY),
		temperature: Number(row.temperature || 0.2),
		maxTokens: Number(row.max_tokens || 1024),
		timeoutMs: Number(row.timeout_ms || 15000),
		maxToolsPerMessage: Number(row.max_tools_per_message || 3),
		historyMessages: Number(row.history_messages || 12),
		sessionMinutes: Number(row.session_minutes || 60),
		rateLimitPerMinute: Number(row.rate_limit_per_minute || 10),
		dailyMessageLimit: Number(row.daily_message_limit || 200),
		transferPolicy: row.transfer_policy || "DENY",
		transferAcceptanceMinutes: Number(row.transfer_acceptance_minutes || 30),
		features: row.features || {},
		systemPrompt: row.system_prompt || "",
		promptVersion: Number(row.prompt_version || 1),
		retentionDays: Number(row.retention_days || 180),
		lastInstanceEventAt: row.last_instance_event_at || null,
		lastInstanceEvent: row.last_instance_event || "",
		updatedAt: row.updated_at || null,
	};
}

async function configRow() {
	const result = await db.query("select * from retorninho_config where id='global'");
	if (result.rows[0]) return result.rows[0];
	const inserted = await db.query("insert into retorninho_config (id) values ('global') returning *");
	return inserted.rows[0];
}

async function getConfig() {
	const row = await configRow();
	const config = maskConfig(row);
	if (config.provider !== "evolution") return config;
	try {
		const resolved = await resolveEvolutionConfig(row);
		return {
			...config,
			evolutionUrl: resolved.evolutionBaseUrl,
			evolutionApiKeyConfigured: Boolean(resolved.evolutionApiKey),
			evolutionConfigSource: resolved.configurationSource,
		};
	} catch {
		return config;
	}
}

async function recordEvent(category, eventName, status, data = {}) {
	const safeDetails = { ...(data.details || {}) };
	for (const key of ["apiKey", "secret", "token", "password", "authorization"]) delete safeDetails[key];
	await db.query(
		`insert into retorninho_events
		 (category,event_name,status,correlation_id,provider,service,conversation_id,message_id,protocol_id,
		  user_uid,user_name,regional,service_order_number,rule_applied,error_code,http_status,duration_ms,attempt,app_version,details)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb)`,
		[
			category, eventName, status, data.correlationId || null, data.provider || null,
			data.service || null, data.conversationId || null, data.messageId || null,
			data.protocolId || null, data.userUid || null, data.userName || null,
			data.regional || null, data.serviceOrderNumber || null, data.ruleApplied || null,
			data.errorCode || null, data.httpStatus || null, data.durationMs || null,
			Number(data.attempt || 1), text(process.env.APP_VERSION || process.env.RELEASE_VERSION) || null, JSON.stringify(safeDetails),
		],
	);
}

async function saveConfig(payload = {}, user = {}) {
	const current = await configRow();
	const actor = userIdentity(user);
	const provider = ["evolution", "meta"].includes(payload.provider) ? payload.provider : current.provider;
	const transferPolicy = ["DENY", "AUTO", "TECHNICIAN_ACCEPTANCE"].includes(payload.transferPolicy)
		? payload.transferPolicy
		: current.transfer_policy;
	const evolutionSecret = payload.evolutionApiKey ? security.encrypt("RETORNINHO_EVOLUTION_API_KEY", payload.evolutionApiKey) : null;
	const aiSecret = payload.aiApiKey ? security.encrypt("RETORNINHO_AI_API_KEY", payload.aiApiKey) : null;
	await db.query(
		`update retorninho_config set
		 enabled=$1, automatic_replies=$2, provider=$3, evolution_url=$4,
		 evolution_api_key_ciphertext=coalesce($5,evolution_api_key_ciphertext),
		 evolution_api_key_iv=coalesce($6,evolution_api_key_iv),
		 evolution_api_key_auth_tag=coalesce($7,evolution_api_key_auth_tag),
		 ai_provider='gemini', ai_model=$8,
		 ai_api_key_ciphertext=coalesce($9,ai_api_key_ciphertext),
		 ai_api_key_iv=coalesce($10,ai_api_key_iv),
		 ai_api_key_auth_tag=coalesce($11,ai_api_key_auth_tag),
		 secret_key_id=coalesce($12,secret_key_id), temperature=$13, max_tokens=$14,
		 timeout_ms=$15, max_tools_per_message=$16, history_messages=$17,
		 session_minutes=$18, rate_limit_per_minute=$19, daily_message_limit=$20,
		 transfer_policy=$21, transfer_acceptance_minutes=$22, features=$23::jsonb,
		 system_prompt=$24, prompt_version=case when system_prompt is distinct from $24 then prompt_version+1 else prompt_version end,
		 retention_days=$25, updated_by_uid=$26, updated_by_name=$27, meta_phone_number_id=$28
		 where id='global' returning *`,
		[
			payload.enabled === true, payload.automaticReplies === true, provider,
			text(payload.evolutionUrl || current.evolution_url) || null,
			evolutionSecret?.ciphertext || null, evolutionSecret?.iv || null, evolutionSecret?.authTag || null,
			text(payload.aiModel || current.ai_model || "gemini-2.5-flash"),
			aiSecret?.ciphertext || null, aiSecret?.iv || null, aiSecret?.authTag || null,
			evolutionSecret?.keyId || aiSecret?.keyId || null,
			Math.min(Math.max(Number(payload.temperature ?? current.temperature), 0), 1),
			Math.min(Math.max(Number(payload.maxTokens ?? current.max_tokens), 128), 8192),
			Math.min(Math.max(Number(payload.timeoutMs ?? current.timeout_ms), 1000), 60000),
			Math.min(Math.max(Number(payload.maxToolsPerMessage ?? current.max_tools_per_message), 1), 8),
			Math.min(Math.max(Number(payload.historyMessages ?? current.history_messages), 0), 30),
			Math.min(Math.max(Number(payload.sessionMinutes ?? current.session_minutes), 5), 1440),
			Math.min(Math.max(Number(payload.rateLimitPerMinute ?? current.rate_limit_per_minute), 1), 60),
			Math.min(Math.max(Number(payload.dailyMessageLimit ?? current.daily_message_limit), 1), 2000),
			transferPolicy,
			Math.min(Math.max(Number(payload.transferAcceptanceMinutes ?? current.transfer_acceptance_minutes), 5), 1440),
			JSON.stringify(payload.features && typeof payload.features === "object" ? payload.features : current.features),
			text(payload.systemPrompt || current.system_prompt),
			Math.min(Math.max(Number(payload.retentionDays ?? current.retention_days), 30), 730),
			actor.uid || null, actor.name || null, text(payload.metaPhoneNumberId ?? current.meta_phone_number_id) || null,
		],
	);
	await recordEvent("AUDIT", "CONFIG_UPDATED", "SUCCESS", { userUid: actor.uid, userName: actor.name, details: { provider, transferPolicy, enabled: payload.enabled === true } });
	return getConfig();
}

async function clearSecret(name, user = {}) {
	const columns = name === "aiApiKey"
		? ["ai_api_key_ciphertext", "ai_api_key_iv", "ai_api_key_auth_tag"]
		: name === "evolutionApiKey"
			? ["evolution_api_key_ciphertext", "evolution_api_key_iv", "evolution_api_key_auth_tag"]
			: [];
	if (!columns.length) throw apiError("Segredo inválido.");
	await db.query(`update retorninho_config set ${columns.map((column) => `${column}=null`).join(",")} where id='global'`);
	const actor = userIdentity(user);
	await recordEvent("AUDIT", "SECRET_REMOVED", "SUCCESS", { userUid: actor.uid, userName: actor.name, details: { name } });
	return getConfig();
}

async function resolveEvolutionConfig(row) {
	let apiKey = "";
	if (row.evolution_api_key_ciphertext) {
		apiKey = security.decrypt("RETORNINHO_EVOLUTION_API_KEY", {
			ciphertext: row.evolution_api_key_ciphertext,
			iv: row.evolution_api_key_iv,
			authTag: row.evolution_api_key_auth_tag,
			keyId: row.secret_key_id,
		});
	}
	let webhookSecret = "";
	if (row.webhook_secret_ciphertext) {
		webhookSecret = security.decrypt("RETORNINHO_WEBHOOK_SECRET", {
			ciphertext: row.webhook_secret_ciphertext,
			iv: row.webhook_secret_iv,
			authTag: row.webhook_secret_auth_tag,
			keyId: row.secret_key_id,
		});
	}
	let baseUrl = text(row.evolution_url);
	let configurationSource = baseUrl && apiKey ? "retorninho" : "mensageria";
	if (!baseUrl || !apiKey) {
		const shared = await evolutionMessaging.getConfig();
		baseUrl ||= text(shared.evolutionBaseUrl);
		apiKey ||= text(shared.evolutionApiKey);
	}
	return {
		whatsappProvider: "evolution",
		evolutionEnabled: true,
		evolutionUrl: baseUrl,
		evolutionBaseUrl: baseUrl,
		evolutionApiKey: apiKey,
		evolutionInstance: INSTANCE_NAME,
		evolutionWebhookUrl: `${text(process.env.PUBLIC_APP_URL || process.env.APP_URL).replace(/\/$/, "")}/api/retorninho/webhook/evolution?secret=${encodeURIComponent(webhookSecret)}`,
		configurationSource,
	};
}

async function ensureWebhookSecret() {
	let row = await configRow();
	if (row.webhook_secret_ciphertext) return row;
	const encrypted = security.encrypt("RETORNINHO_WEBHOOK_SECRET", crypto.randomBytes(32).toString("hex"));
	const result = await db.query(
		`update retorninho_config set webhook_secret_ciphertext=$1,webhook_secret_iv=$2,
		 webhook_secret_auth_tag=$3,secret_key_id=$4 where id='global' returning *`,
		[encrypted.ciphertext, encrypted.iv, encrypted.authTag, encrypted.keyId],
	);
	return result.rows[0];
}

async function verifyWebhookSecret(value) {
	const row = await configRow();
	if (!row.webhook_secret_ciphertext) return false;
	const expected = security.decrypt("RETORNINHO_WEBHOOK_SECRET", {
		ciphertext: row.webhook_secret_ciphertext,
		iv: row.webhook_secret_iv,
		authTag: row.webhook_secret_auth_tag,
		keyId: row.secret_key_id,
	});
	const left = Buffer.from(security.hash(value));
	const right = Buffer.from(security.hash(expected));
	return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function instanceStatus() {
	const row = await configRow();
	if (row.provider === "meta") {
		if (!row.meta_phone_number_id) return { provider: "meta", instanceName: INSTANCE_NAME, connected: false, configured: false };
		const cloud = await whatsappCloudService.getConfig();
		return { provider: "meta", instanceName: INSTANCE_NAME, connected: Boolean(cloud.secretStatus?.accessTokenConfigured), configured: true };
	}
	const config = await resolveEvolutionConfig(row);
	if (!config.evolutionBaseUrl || !config.evolutionApiKey) return { provider: "evolution", instanceName: INSTANCE_NAME, connected: false, configured: false };
	const status = await evolutionMessaging.getConnectionInfo(config);
	return { provider: "evolution", instanceName: INSTANCE_NAME, configured: true, configurationSource: config.configurationSource, ...status };
}

async function connectInstance(user = {}) {
	const row = await ensureWebhookSecret();
	if (row.provider !== "evolution") throw apiError("Conecte o número Meta pelo fluxo oficial.", 409);
	const config = await resolveEvolutionConfig(row);
	if (!config.evolutionBaseUrl || !config.evolutionApiKey) throw apiError("Configure a Evolution na Mensageria antes de conectar o Retorninho.", 409, "EVOLUTION_NOT_CONFIGURED");
	const result = await evolutionMessaging.createOrConnectInstance(config, { persist: false });
	const actor = userIdentity(user);
	await db.query("update retorninho_config set last_instance_event_at=now(),last_instance_event='CONNECT_REQUESTED' where id='global'");
	await recordEvent("AUDIT", "INSTANCE_CONNECT", "SUCCESS", { userUid: actor.uid, userName: actor.name, provider: "evolution" });
	return {
		ok: result.ok === true,
		instanceName: INSTANCE_NAME,
		create: result.create,
		connect: result.connect,
		webhook: { ok: result.webhook?.ok === true },
	};
}

async function disconnectInstance(user = {}) {
	const row = await configRow();
	if (row.provider !== "evolution") throw apiError("Desconexão Meta deve ser realizada pelo fluxo oficial.", 409);
	const result = await evolutionMessaging.logoutInstance(await resolveEvolutionConfig(row));
	const actor = userIdentity(user);
	await db.query("update retorninho_config set enabled=false,automatic_replies=false,last_instance_event_at=now(),last_instance_event='DISCONNECTED' where id='global'");
	await recordEvent("AUDIT", "INSTANCE_DISCONNECT", "SUCCESS", { userUid: actor.uid, userName: actor.name, provider: "evolution" });
	return result;
}

async function listUsers(query = {}) {
	const { page, limit, offset } = pageOf(query);
	const search = text(query.search);
	const params = [`%${search}%`, limit, offset];
	const result = await db.query(
		`select count(*) over() total_count, u.uid, u.email, u.display_name, u.role, u.regional,
		        u.imported_profile, a.id authorization_id, a.phone_e164, a.status authorization_status,
		        a.regional_scope, a.tool_permissions, a.last_authenticated_at, a.blocked_reason
		   from app_users u left join retorninho_authorized_users a on a.user_uid=u.uid and a.status<>'REVOKED'
		  where ($1='' or u.email ilike $1 or coalesce(u.display_name,'') ilike $1)
		  order by coalesce(u.display_name,u.email),u.uid limit $2 offset $3`,
		params,
	);
	return {
		items: result.rows.map((row) => ({
			uid: row.uid, email: row.email, name: row.display_name || row.email, role: row.role,
			regional: row.regional || "", technicianName: text(row.imported_profile?.metasTecnicoNome || row.imported_profile?.metas_tecnico_nome),
			authorizationId: row.authorization_id || null, phone: row.phone_e164 ? security.maskPhone(row.phone_e164) : "",
			status: row.authorization_status || "NOT_AUTHORIZED", regionalScope: row.regional_scope || [],
			toolPermissions: row.tool_permissions || [], lastAuthenticatedAt: row.last_authenticated_at || null,
			blockedReason: row.blocked_reason || "",
		})),
		pagination: pagination(result.rows, page, limit),
	};
}

async function authorizeUser(payload = {}, user = {}) {
	const uid = text(payload.userUid);
	if (!uid) throw apiError("Selecione um usuário.");
	const profile = await usersRepository.getUserProfile(uid);
	if (!profile) throw apiError("Usuário não encontrado.", 404);
	if (!text(profile.metasTecnicoNome || profile.metas_tecnico_nome)) {
		throw apiError("Vincule este usuário a um técnico do HubSoft antes de autorizar o Retorninho.", 422);
	}
	const phone = security.normalizePhone(payload.phone);
	const phoneHash = security.phoneHashes(phone)[0];
	const actor = userIdentity(user);
	const tools = Array.isArray(payload.toolPermissions) ? payload.toolPermissions.filter((item) => ALL_TOOLS.includes(item)) : [];
	const scopes = Array.isArray(payload.regionalScope) ? payload.regionalScope.map(text).filter(Boolean) : [];
	const result = await db.query(
		`insert into retorninho_authorized_users
		 (user_uid,phone_e164,phone_hash,status,regional_scope,tool_permissions,created_by_uid)
		 values ($1,$2,$3,'ACTIVE',$4,$5,$6)
		 on conflict (user_uid,phone_hash) do update set status='ACTIVE',phone_e164=excluded.phone_e164,
		 regional_scope=excluded.regional_scope,tool_permissions=excluded.tool_permissions,blocked_reason=null
		 returning id,user_uid,status,regional_scope,tool_permissions,created_at,updated_at`,
		[uid, phone, phoneHash, scopes, tools, actor.uid || null],
	);
	await recordEvent("AUDIT", "USER_AUTHORIZED", "SUCCESS", { userUid: actor.uid, userName: actor.name, details: { targetUid: uid, phone: security.maskPhone(phone) } });
	return { ...result.rows[0], phone: security.maskPhone(phone) };
}

async function updateAuthorization(id, payload = {}, user = {}) {
	const status = ["ACTIVE", "BLOCKED", "REVOKED"].includes(payload.status) ? payload.status : null;
	if (!status) throw apiError("Status de autorização inválido.");
	const actor = userIdentity(user);
	const result = await db.query(
		`update retorninho_authorized_users set status=$2,blocked_reason=$3,
		 regional_scope=coalesce($4,regional_scope),tool_permissions=coalesce($5,tool_permissions)
		 where id=$1 returning id,user_uid,phone_e164,status,regional_scope,tool_permissions,blocked_reason,updated_at`,
		[id, status, text(payload.reason) || null,
			Array.isArray(payload.regionalScope) ? payload.regionalScope.map(text).filter(Boolean) : null,
			Array.isArray(payload.toolPermissions) ? payload.toolPermissions.filter((item) => ALL_TOOLS.includes(item)) : null],
	);
	if (!result.rows[0]) throw apiError("Autorização não encontrada.", 404);
	await recordEvent("AUDIT", `USER_${status}`, "SUCCESS", { userUid: actor.uid, userName: actor.name, details: { targetUid: result.rows[0].user_uid, reason: text(payload.reason) } });
	return { ...result.rows[0], phone_e164: security.maskPhone(result.rows[0].phone_e164) };
}

async function listKnowledge(query = {}) {
	const { page, limit, offset } = pageOf(query);
	const search = text(query.search);
	const status = text(query.status).toUpperCase();
	const result = await db.query(
		`select count(*) over() total_count,id,title,category,content,status,version,permissions,
		 owner_uid,owner_name,reviewed_by_uid,reviewed_at,created_at,updated_at
		 from retorninho_knowledge_articles
		 where ($1='' or search_document @@ websearch_to_tsquery('portuguese',$1))
		   and ($2='' or status=$2)
		 order by updated_at desc,id desc limit $3 offset $4`,
		[search, status, limit, offset],
	);
	return { items: result.rows, pagination: pagination(result.rows, page, limit) };
}

async function saveKnowledge(id, payload = {}, user = {}) {
	const title = text(payload.title);
	const content = text(payload.content);
	if (!title || !content) throw apiError("Informe título e conteúdo.");
	const status = ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(payload.status) ? payload.status : "DRAFT";
	const actor = userIdentity(user);
	const params = [title, text(payload.category || "Geral"), content, status,
		Array.isArray(payload.permissions) ? payload.permissions.map(text).filter(Boolean) : [], actor.uid, actor.name];
	let result;
	if (id) {
		result = await db.query(
			`update retorninho_knowledge_articles set title=$1,category=$2,content=$3,status=$4,
			 permissions=$5,owner_uid=$6,owner_name=$7,version=case when content is distinct from $3 then version+1 else version end,
			 reviewed_by_uid=case when $4='PUBLISHED' then $6 else reviewed_by_uid end,
			 reviewed_at=case when $4='PUBLISHED' then now() else reviewed_at end where id=$8 returning *`,
			[...params, id],
		);
	} else {
		result = await db.query(
			`insert into retorninho_knowledge_articles (title,category,content,status,permissions,owner_uid,owner_name,reviewed_by_uid,reviewed_at)
			 values ($1,$2,$3,$4,$5,$6,$7,case when $4='PUBLISHED' then $6 end,case when $4='PUBLISHED' then now() end) returning *`,
			params,
		);
	}
	if (!result.rows[0]) throw apiError("Artigo não encontrado.", 404);
	await recordEvent("AUDIT", id ? "KNOWLEDGE_UPDATED" : "KNOWLEDGE_CREATED", "SUCCESS", { userUid: actor.uid, userName: actor.name, details: { articleId: result.rows[0].id, status } });
	return result.rows[0];
}

async function listConversations(query = {}) {
	const { page, limit, offset } = pageOf(query);
	const search = text(query.search);
	const status = text(query.status).toUpperCase();
	const result = await db.query(
		`select count(*) over() total_count,c.id,c.status,c.provider,c.instance_name,c.last_message_at,c.created_at,c.updated_at,
		 u.uid user_uid,u.display_name user_name,u.email,u.role,u.regional,a.phone_e164,
		 (select body from retorninho_messages m where m.conversation_id=c.id order by m.created_at desc limit 1) last_message
		 from retorninho_conversations c join retorninho_authorized_users a on a.id=c.authorized_user_id
		 join app_users u on u.uid=a.user_uid
		 where ($1='' or u.email ilike $1 or coalesce(u.display_name,'') ilike $1)
		 and ($2='' or c.status=$2)
		 order by c.last_message_at desc nulls last,c.id desc limit $3 offset $4`,
		[`%${search}%`, status, limit, offset],
	);
	return { items: result.rows.map((row) => ({ ...row, phone_e164: security.maskPhone(row.phone_e164) })), pagination: pagination(result.rows, page, limit) };
}

async function listMessages(conversationId, query = {}) {
	const { page, limit, offset } = pageOf(query);
	const result = await db.query(
		`select count(*) over() total_count,id,direction,message_type,body,status,correlation_id,tool_calls,token_usage,error_code,created_at,processed_at
		 from retorninho_messages where conversation_id=$1 order by created_at desc,id desc limit $2 offset $3`,
		[conversationId, limit, offset],
	);
	return { items: result.rows, pagination: pagination(result.rows, page, limit) };
}

async function setConversationStatus(id, status, user = {}) {
	if (!["ACTIVE", "PAUSED", "CLOSED"].includes(status)) throw apiError("Status de conversa inválido.");
	const result = await db.query("update retorninho_conversations set status=$2 where id=$1 returning *", [id, status]);
	if (!result.rows[0]) throw apiError("Conversa não encontrada.", 404);
	const actor = userIdentity(user);
	await recordEvent("AUDIT", "CONVERSATION_STATUS_UPDATED", "SUCCESS", { userUid: actor.uid, userName: actor.name, conversationId: id, details: { status } });
	return result.rows[0];
}

async function listProtocols(query = {}) {
	const { page, limit, offset } = pageOf(query);
	const status = text(query.status).toUpperCase();
	const type = text(query.type).toUpperCase();
	const search = text(query.search);
	const result = await db.query(
		LIST_PROTOCOLS_SQL,
		[status, type, search, `%${search}%`, limit, offset],
	);
	return { items: result.rows, pagination: pagination(result.rows, page, limit) };
}

async function listEvents(category, query = {}) {
	const { page, limit, offset } = pageOf(query);
	const search = text(query.search);
	const status = text(query.status);
	const result = await db.query(
		`select count(*) over() total_count,* from retorninho_events
		 where category=$1 and ($2='' or status=$2)
		 and ($3='' or event_name ilike $4 or coalesce(user_name,'') ilike $4 or coalesce(service_order_number,'') ilike $4)
		 order by created_at desc,id desc limit $5 offset $6`,
		[category, status, search, `%${search}%`, limit, offset],
	);
	return { items: result.rows, pagination: pagination(result.rows, page, limit) };
}

async function exportEvents(category, query = {}) {
	const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 500, 1), 1000);
	const beforeId = Number.parseInt(query.beforeId, 10) || Number.MAX_SAFE_INTEGER;
	const result = await db.query(
		`select id,category,event_name,status,correlation_id,provider,service,user_uid,user_name,regional,
		 service_order_number,rule_applied,error_code,http_status,duration_ms,attempt,app_version,details,created_at
		 from retorninho_events where category=$1 and id<$2 order by id desc limit $3`,
		[category, beforeId, limit],
	);
	return { items: result.rows, nextCursor: result.rows.length === limit ? result.rows.at(-1).id : null };
}

async function listQueue(query = {}) {
	const { page, limit, offset } = pageOf(query);
	const status = text(query.status).toUpperCase();
	const result = await db.query(LIST_QUEUE_SQL, [MAX_ATTEMPTS, status, limit, offset]);
	return { items: result.rows, pagination: pagination(result.rows, page, limit) };
}

async function dashboard(query = {}) {
	const hours = Math.min(Math.max(Number.parseInt(query.hours, 10) || 24, 1), 24 * 90);
	const result = await db.query(
		`select
		 (select count(*) from retorninho_messages where direction='INBOUND' and created_at>=now()-($1::text||' hours')::interval)::int received,
		 (select count(*) from retorninho_messages where direction='OUTBOUND' and created_at>=now()-($1::text||' hours')::interval)::int sent,
		 (select count(*) from retorninho_messages where status in ('FAILED','DEAD_LETTER') and created_at>=now()-($1::text||' hours')::interval)::int message_errors,
		 (select count(distinct conversation_id) from retorninho_messages where created_at>=now()-($1::text||' hours')::interval)::int active_conversations,
		 (select count(*) from retorninho_protocols where type='SELF_ASSIGNMENT' and status='COMPLETED' and created_at>=now()-($1::text||' hours')::interval)::int self_assignments,
		 (select count(*) from retorninho_protocols where type='TRANSFER' and created_at>=now()-($1::text||' hours')::interval)::int transfers,
		 (select count(*) from retorninho_protocols where status in ('CREATED','VALIDATING','WAITING_TECHNICIAN','AUTHORIZED','PROCESSING'))::int pending_protocols,
		 (select count(*) from retorninho_events where category='OPERATIONAL' and status='BLOCKED' and created_at>=now()-($1::text||' hours')::interval)::int blocked_operations,
		 (select count(*) from retorninho_queue where status in ('PENDING','PROCESSING','FAILED'))::int queue_depth,
		 (select count(*) from retorninho_queue where status='DEAD_LETTER')::int dead_letter,
		 (select count(*) from retorninho_authorized_users where status='ACTIVE')::int authorized_users,
		 (select count(*) from retorninho_events where event_name='AI_CALL' and created_at>=now()-($1::text||' hours')::interval)::int ai_calls,
		 (select count(*) from retorninho_events where event_name='AI_FAILURE' and created_at>=now()-($1::text||' hours')::interval)::int ai_failures,
		 (select coalesce(round(avg(duration_ms))::int,0) from retorninho_events where event_name='AI_CALL' and created_at>=now()-($1::text||' hours')::interval) ai_average_ms,
		 (select coalesce(round(percentile_cont(0.95) within group (order by duration_ms))::int,0) from retorninho_events where event_name='AI_CALL' and duration_ms is not null and created_at>=now()-($1::text||' hours')::interval) ai_p95_ms,
		 (select count(*) from retorninho_protocols where status='COMPLETED' and created_at>=now()-($1::text||' hours')::interval)::int completed_operations,
		 (select max(processed_at) from retorninho_messages) last_processed_at`,
		[String(hours)],
	);
	const config = await getConfig();
	const regional = await db.query(
		`select coalesce(regional,'Não informado') regional,count(*)::int total
		 from retorninho_events where category='OPERATIONAL' and created_at>=now()-($1::text||' hours')::interval
		 group by coalesce(regional,'Não informado') order by total desc limit 20`,
		[String(hours)],
	);
	return { periodHours: hours, config, metrics: result.rows[0] || {}, regional: regional.rows, instance: await instanceStatus().catch((error) => ({ connected: false, error: error.message })) };
}

function eventInstance(payload = {}) {
	return text(payload.instance || payload.instanceName || payload.data?.instance || payload.data?.instanceName);
}

function incomingMessage(payload = {}) {
	const data = payload.data || payload;
	const message = data.message || payload.message || {};
	const remoteJid = text(data.key?.remoteJid || payload.key?.remoteJid || data.remoteJid || payload.remoteJid);
	return {
		instance: eventInstance(payload),
		messageId: text(data.key?.id || payload.key?.id || data.id || payload.id),
		fromMe: Boolean(data.key?.fromMe || payload.key?.fromMe),
		phone: remoteJid.split("@")[0],
		body: text(message.conversation || message.extendedTextMessage?.text || message.ephemeralMessage?.message?.conversation || data.text || payload.text),
		location: message.locationMessage ? { latitude: Number(message.locationMessage.degreesLatitude), longitude: Number(message.locationMessage.degreesLongitude) } : null,
		provider: "evolution",
	};
}

function metaMessages(payload = {}) {
	const messages = [];
	for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
		for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
			const value = change.value || {};
			const phoneNumberId = text(value.metadata?.phone_number_id);
			for (const message of Array.isArray(value.messages) ? value.messages : []) {
				const interactive = message.interactive || {};
				messages.push({
					provider: "meta",
					instance: INSTANCE_NAME,
					phoneNumberId,
					messageId: text(message.id),
					fromMe: false,
					phone: text(message.from),
					body: text(message.text?.body || message.button?.text || interactive.button_reply?.title || interactive.list_reply?.title || message.location?.name || message.location?.address),
					location: message.location ? { latitude: Number(message.location.latitude), longitude: Number(message.location.longitude) } : null,
				});
			}
		}
	}
	return messages;
}

function webhookDedupe(payload, eventName) {
	const incoming = incomingMessage(payload);
	return security.hash(`${eventName}|${incoming.instance}|${incoming.messageId || JSON.stringify(payload)}`);
}

async function enqueueWebhook(payload = {}, eventName = "") {
	if (eventInstance(payload) !== INSTANCE_NAME) {
		await recordEvent("TECHNICAL", "WEBHOOK_WRONG_INSTANCE", "IGNORED", { provider: "evolution", details: { instance: eventInstance(payload) } });
		throw apiError("Instância não autorizada.", 403, "WRONG_INSTANCE");
	}
	const safe = JSON.parse(JSON.stringify(payload));
	delete safe.apikey;
	delete safe.apiKey;
	delete safe.secret;
	const result = await db.query(
		`insert into retorninho_queue (kind,dedupe_key,payload)
		 values ('INBOUND',$1,$2::jsonb) on conflict (dedupe_key) do nothing returning id`,
		[webhookDedupe(safe, eventName), JSON.stringify({ eventName, payload: safe })],
	);
	await recordEvent("TECHNICAL", result.rowCount ? "WEBHOOK_QUEUED" : "WEBHOOK_DUPLICATE", result.rowCount ? "SUCCESS" : "IGNORED", { provider: "evolution", details: { eventName } });
	return { queued: result.rowCount > 0, duplicate: result.rowCount === 0 };
}

async function enqueueMetaWebhook(payload = {}) {
	const config = await configRow();
	if (config.provider !== "meta" || !config.meta_phone_number_id) return { queued: 0 };
	let queued = 0;
	for (const message of metaMessages(payload).filter((item) => item.phoneNumberId === config.meta_phone_number_id)) {
		const result = await db.query(
			`insert into retorninho_queue (kind,dedupe_key,payload)
			 values ('INBOUND',$1,$2::jsonb) on conflict (dedupe_key) do nothing returning id`,
			[security.hash(`meta|${message.phoneNumberId}|${message.messageId}`), JSON.stringify({ normalized: message })],
		);
		queued += result.rowCount;
	}
	for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
		for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
			const value = change.value || {};
			if (text(value.metadata?.phone_number_id) !== config.meta_phone_number_id) continue;
			for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
				const normalized = { accepted: "SENT", sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" }[text(status.status).toLowerCase()];
				if (!normalized) continue;
				await db.query("update retorninho_messages set status=$2,processed_at=now(),error_code=$3 where provider='meta' and provider_message_id=$1", [text(status.id), normalized, normalized === "FAILED" ? text(status.errors?.[0]?.code || "META_FAILED") : null]);
			}
		}
	}
	if (queued) await recordEvent("TECHNICAL", "META_WEBHOOK_QUEUED", "SUCCESS", { provider: "meta", details: { queued } });
	return { queued };
}

async function findAuthorized(phone) {
	const hashes = security.phoneHashes(phone);
	if (!hashes.length) return null;
	const result = await db.query(
		`select a.*,u.email,u.display_name,u.role,u.regional,u.imported_profile
		 from retorninho_authorized_users a join app_users u on u.uid=a.user_uid
		 where a.phone_hash=any($1::text[]) order by a.updated_at desc limit 1`,
		[hashes],
	);
	return result.rows[0] || null;
}

async function authenticatedUser(authorization) {
	const profile = await usersRepository.getUserProfile(authorization.user_uid);
	if (!profile) throw apiError("Usuário vinculado não encontrado.", 401);
	return rolePermissions.enrichUserWithPermissions(profile);
}

async function ensureConversation(authorization, provider = "evolution") {
	const result = await db.query(
		`insert into retorninho_conversations (authorized_user_id,provider,instance_name,last_message_at)
		 values ($1,$2,$3,now())
		 on conflict (authorized_user_id,provider,instance_name) do update set
		 last_message_at=now(),status=case when retorninho_conversations.status='CLOSED' then 'ACTIVE' else retorninho_conversations.status end
		 returning *`,
		[authorization.id, provider, INSTANCE_NAME],
	);
	return result.rows[0];
}

async function saveMessage(conversationId, direction, body, options = {}) {
	const result = await db.query(
		`insert into retorninho_messages
		 (conversation_id,provider,provider_message_id,direction,body,status,correlation_id,tool_calls,token_usage,error_code,processed_at)
		 values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11) on conflict (provider,provider_message_id) do nothing returning *`,
		[conversationId, options.provider || "evolution", options.providerMessageId || null, direction, text(body), options.status || (direction === "INBOUND" ? "RECEIVED" : "QUEUED"),
			options.correlationId || crypto.randomUUID(), JSON.stringify(options.toolCalls || []), JSON.stringify(options.tokenUsage || {}), options.errorCode || null, options.processedAt || null],
	);
	return result.rows[0] || null;
}

async function queueOutbound({ conversation, phone, body, correlationId, protocolId = null }) {
	const provider = conversation.provider || "evolution";
	const message = await saveMessage(conversation.id, "OUTBOUND", body, { correlationId, status: "QUEUED", provider });
	if (!message) return null;
	await db.query(
		`insert into retorninho_queue (kind,dedupe_key,payload) values ('OUTBOUND',$1,$2::jsonb) on conflict (dedupe_key) do nothing`,
		[`outbound:${message.id}`, JSON.stringify({ messageId: message.id, conversationId: conversation.id, phone, body, correlationId, protocolId, provider })],
	);
	return message;
}

async function updateConversationSession(conversationId, patch = {}) {
	const result = await db.query(
		`update retorninho_conversations set session_data=coalesce(session_data,'{}'::jsonb)||$2::jsonb,last_message_at=now()
		 where id=$1 returning *`,
		[conversationId, JSON.stringify(patch)],
	);
	return result.rows[0];
}

async function findOrder(query, user) {
	const value = text(query);
	const identifier = value.match(/\d{4,20}/)?.[0] || digits(value);
	const role = userIdentity(user).role;
	if (!identifier && !["admin", "backoffice", "superadmin"].includes(role)) {
		throw apiError("Informe o número da O.S. ou o código do cliente.");
	}
	if (!identifier && value.length < 5) throw apiError("Informe ao menos cinco caracteres do nome do cliente.");
	const result = identifier
		? await db.query(
			`select id from ordens_servico where num_os=$1 or codigo_cliente=$1 order by updated_at desc limit 1`,
			[identifier],
		)
		: await db.query(
			`select id from ordens_servico where nome_cliente ilike $1
			 and upper(coalesce(status,'')) !~ '(CONCLUID|FINALIZ|FECHAD|CANCELAD|REALIZAD)'
			 order by updated_at desc limit 2`,
			[`%${value}%`],
		);
	if (result.rows.length > 1) throw apiError("Encontrei mais de um cliente com esse nome. Informe o código do cliente para continuar.", 409, "AMBIGUOUS_CUSTOMER");
	if (!result.rows[0]) throw apiError("Nenhuma retirada aberta foi encontrada.", 404, "ORDER_NOT_FOUND");
	return mapsService.getOrder(result.rows[0].id, user);
}

function minimalOrder(order = {}) {
	return {
		id: order.id,
		orderNumber: order.orderNumber,
		clientCode: order.clientCode,
		clientName: text(order.clientName).split(/\s+/).filter(Boolean).filter((_, index, array) => index === 0 || index === array.length - 1).join(" "),
		type: order.type, status: order.status, technician: order.technician,
		city: order.city, neighborhood: order.neighborhood, regional: order.regional,
		address: order.address, category: order.category, requestable: Boolean(order.requestable),
		distanceMeters: order.distanceMeters ?? null,
	};
}

function formatOrder(order) {
	return `O.S. ${order.orderNumber} · cliente ${order.clientCode}\n${order.clientName || "Cliente"}\n${order.city || "Cidade não informada"}${order.neighborhood ? ` · ${order.neighborhood}` : ""}\nStatus: ${order.status || "não informado"}\nResponsável: ${order.technician || "FILA"}`;
}

async function toolOrderQuery(args, context) {
	const order = minimalOrder(await findOrder(args.query, context.user));
	await recordEvent("OPERATIONAL", "ORDER_QUERY", "SUCCESS", { ...context.event, serviceOrderNumber: order.orderNumber, details: { orderId: order.id } });
	return { reply: formatOrder(order), data: order };
}

async function toolSearch(args, context) {
	const queryText = text(args.query);
	const page = Math.max(Number(args.page || 1), 1);
	const mapQuery = {
		categories: "opportunity",
		city: text(args.city), neighborhood: text(args.neighborhood), regional: text(args.regional),
		lat: args.latitude ?? context.conversation.session_data?.location?.latitude,
		lng: args.longitude ?? context.conversation.session_data?.location?.longitude,
		limit: 100,
	};
	if (!mapQuery.city && queryText) {
		const cityMatch = queryText.match(/(?:em|cidade de)\s+([\p{L}\s-]{3,40})/iu);
		if (cityMatch) mapQuery.city = cityMatch[1].trim();
	}
	const response = await mapsService.listPoints(mapQuery, context.user);
	const items = response.items.filter((item) => item.category === "opportunity").slice((page - 1) * 5, page * 5).map(minimalOrder);
	const reply = items.length
		? `${items.map((item, index) => `${index + 1}. O.S. ${item.orderNumber} · cliente ${item.clientCode} · ${item.city}${item.neighborhood ? `/${item.neighborhood}` : ""}`).join("\n")}\n\nPágina ${page}. Diga “mostrar mais” para continuar.`
		: "Não encontrei oportunidades permitidas para o seu escopo neste momento.";
	await updateConversationSession(context.conversation.id, { lastSearch: mapQuery, lastSearchPage: page, lastResults: items.map((item) => item.id) });
	await recordEvent("OPERATIONAL", "ORDER_SEARCH", "SUCCESS", { ...context.event, details: { count: items.length, city: mapQuery.city, page } });
	return { reply, data: { items, page, total: response.total } };
}

async function createProtocol({ type, order, context, policy, status = "CREATED", targetUserUid = null, currentUserUid = null, reason = null }) {
	const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).replaceAll("-", "");
	const sequence = await db.query("select nextval('retorninho_protocol_number_seq')::bigint value");
	const protocolNumber = `RET-${date}-${String(sequence.rows[0].value).padStart(6, "0")}`;
	const result = await db.query(
		`insert into retorninho_protocols
		 (protocol_number,conversation_id,type,status,service_order_id,service_order_number,requester_user_uid,current_user_uid,target_user_uid,policy,reason,expires_at,metadata)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,case when $4='WAITING_TECHNICIAN' then now()+($12::text||' minutes')::interval end,$13::jsonb)
		 returning *`,
		[protocolNumber, context.conversation.id, type, status, order.id, order.orderNumber, context.identity.uid,
			currentUserUid, targetUserUid, policy, reason, String(context.config.transfer_acceptance_minutes), JSON.stringify({ clientCode: order.clientCode, currentTechnician: order.technician })],
	);
	await db.query("insert into retorninho_protocol_events (protocol_id,to_status,actor_user_uid,reason) values ($1,$2,$3,$4)", [result.rows[0].id, status, context.identity.uid, reason]);
	return result.rows[0];
}

async function findCurrentTechnicianAuthorization(technicianName) {
	const result = await db.query(
		`select a.*,u.uid,u.display_name from retorninho_authorized_users a join app_users u on u.uid=a.user_uid
		 where a.status='ACTIVE' and upper(coalesce(u.imported_profile->>'metasTecnicoNome',u.imported_profile->>'metas_tecnico_nome',''))=$1 limit 1`,
		[normalize(technicianName)],
	);
	return result.rows[0] || null;
}

async function toolAssignment(args, context) {
	const order = minimalOrder(await findOrder(args.query, context.user));
	if (!order.requestable && order.category !== "assigned") {
		await recordEvent("OPERATIONAL", "ORDER_ASSIGNMENT", "BLOCKED", { ...context.event, serviceOrderNumber: order.orderNumber, ruleApplied: "ORDER_NOT_REQUESTABLE" });
		return { reply: "Essa O.S. não está disponível para atribuição. Posso buscar outra oportunidade próxima.", data: order };
	}
	const mappedTechnician = context.user.metasTecnicoNome || context.user.metas_tecnico_nome || context.user.profile?.metasTecnicoNome || context.identity.name;
	const isTransfer = order.category === "assigned" && normalize(order.technician) !== normalize(mappedTechnician);
	if (isTransfer && context.config.features?.transfer !== true) {
		return { reply: "A transferência entre técnicos está pausada pela configuração administrativa." };
	}
	if (isTransfer && context.config.transfer_policy === "DENY") {
		const protocol = await createProtocol({ type: "TRANSFER", order, context, policy: "DENY", status: "DENIED", reason: "Não existe política formal autorizando a transferência." });
		await recordEvent("OPERATIONAL", "TRANSFER_REQUEST", "BLOCKED", { ...context.event, protocolId: protocol.id, serviceOrderNumber: order.orderNumber, ruleApplied: "TRANSFER_DENY_DEFAULT" });
		return { reply: `Não posso transferir a O.S. ${order.orderNumber}: não existe política autorizada para esta situação. Protocolo ${protocol.protocol_number}. Posso buscar outra ordem disponível.` };
	}
	if (isTransfer && context.config.transfer_policy === "TECHNICIAN_ACCEPTANCE") {
		const current = await findCurrentTechnicianAuthorization(order.technician);
		if (!current) {
			const protocol = await createProtocol({ type: "TRANSFER", order, context, policy: "TECHNICIAN_ACCEPTANCE", status: "DENIED", reason: "Responsável atual não possui WhatsApp autorizado." });
			return { reply: `A transferência não pode seguir porque o responsável atual não está autorizado no Retorninho. Protocolo ${protocol.protocol_number}.` };
		}
		const protocol = await createProtocol({ type: "TRANSFER", order, context, policy: "TECHNICIAN_ACCEPTANCE", status: "WAITING_TECHNICIAN", targetUserUid: context.identity.uid, currentUserUid: current.uid });
		const currentConversation = await ensureConversation(current, context.config.provider);
		await updateConversationSession(currentConversation.id, { pendingTransferProtocol: protocol.protocol_number });
		await queueOutbound({ conversation: currentConversation, phone: current.phone_e164, correlationId: context.correlationId, protocolId: protocol.id,
			body: `${current.display_name || "Olá"}, ${context.identity.name} solicitou a O.S. ${order.orderNumber}. Responda “autorizo ${protocol.protocol_number}” ou “recuso ${protocol.protocol_number}”.` });
		return { reply: `Solicitação enviada ao responsável atual. Protocolo ${protocol.protocol_number}. Prazo de aceite: ${context.config.transfer_acceptance_minutes} minutos.` };
	}
	const protocol = await createProtocol({ type: isTransfer ? "TRANSFER" : "SELF_ASSIGNMENT", order, context, policy: isTransfer ? "AUTO" : "AVAILABLE", status: "CREATED", targetUserUid: context.identity.uid });
	await updateConversationSession(context.conversation.id, { pendingAction: { type: "ASSIGN", protocolId: protocol.id, orderId: order.id, expiresAt: Date.now() + 10 * 60 * 1000 } });
	return { reply: `${formatOrder(order)}\n\nConfirma que deseja ${isTransfer ? "transferir" : "assumir"} esta ordem? Responda “CONFIRMO” em até 10 minutos.\nProtocolo ${protocol.protocol_number}.` };
}

async function toolProtocol(args, context) {
	const protocol = text(args.protocol).toUpperCase();
	const params = [context.identity.uid];
	let filter = "requester_user_uid=$1";
	if (protocol) { params.push(protocol); filter += " and protocol_number=$2"; }
	const result = await db.query(`select * from retorninho_protocols where ${filter} order by created_at desc limit 5`, params);
	if (!result.rows.length) return { reply: "Você ainda não possui protocolos nesse escopo." };
	return { reply: result.rows.map((item) => `${item.protocol_number} · O.S. ${item.service_order_number || "-"} · ${item.status}${item.reason ? ` · ${item.reason}` : ""}`).join("\n") };
}

async function toolProductivity(_args, context) {
	const result = await db.query(
		`select count(distinct c.opportunity_id) filter (where c.sent_confirmed and c.created_at::date=(now() at time zone 'America/Sao_Paulo')::date)::int attempts_today,
		 count(distinct c.opportunity_id) filter (where c.result in ('SCHEDULED','RESPONDED_SCHEDULE') and c.created_at::date=(now() at time zone 'America/Sao_Paulo')::date)::int scheduled_today,
		 count(distinct r.id) filter (where r.status='RECOVERY_CONFIRMED' and r.updated_at::date=(now() at time zone 'America/Sao_Paulo')::date)::int recovered_today
		 from tentativas_contacts c left join tentativas_recoveries r on r.contact_id=c.id where c.technician_user_id=$1`,
		[context.identity.uid],
	);
	const pending = await db.query(
		`select count(*)::int total from ordens_servico where upper(coalesce(status,'')) !~ '(CONCLUID|FINALIZ|FECHAD|CANCELAD|REALIZAD)'
		 and upper(coalesce(tecnico,''))=$1`, [normalize(context.user.metasTecnicoNome || context.user.metas_tecnico_nome)],
	);
	const item = result.rows[0] || {};
	return { reply: `Hoje você possui ${Number(item.attempts_today || 0)} tratativa(s), ${Number(item.scheduled_today || 0)} agendamento(s), ${Number(item.recovered_today || 0)} recuperação(ões) confirmada(s) e ${Number(pending.rows[0]?.total || 0)} O.S. aberta(s) em seu nome.` };
}

async function toolEquipment(args, context) {
	const query = text(args.query);
	const result = await db.query(
		`select num_os,codigo_cliente,nome_cliente,tipo,status,mac_addr,phy_addr,macs_equipamento,tecnico,cidade
		 from ordens_servico where num_os=$1 or codigo_cliente=$1 or upper(coalesce(mac_addr,''))=$2 or upper(coalesce(phy_addr,''))=$2
		 order by updated_at desc limit 5`,
		[digits(query), normalize(query)],
	);
	const technician = normalize(context.user.metasTecnicoNome || context.user.metas_tecnico_nome);
	const visible = result.rows.filter((item) => !item.tecnico || normalize(item.tecnico) === technician || context.identity.role === "admin");
	if (!visible.length) return { reply: "Não encontrei equipamento permitido para a sua consulta." };
	return { reply: visible.map((item) => `O.S. ${item.num_os} · cliente ${item.codigo_cliente}\nMAC/serial: ${item.mac_addr || item.phy_addr || "não informado"}\nStatus: ${item.status || "não informado"}`).join("\n\n") };
}

async function toolKnowledge(args) {
	const result = await db.query(
		`select title,content,version from retorninho_knowledge_articles
		 where status='PUBLISHED' and search_document @@ websearch_to_tsquery('portuguese',$1)
		 order by ts_rank(search_document,websearch_to_tsquery('portuguese',$1)) desc,updated_at desc limit 3`,
		[text(args.query)],
	);
	if (!result.rows.length) return { reply: "Não encontrei um procedimento publicado e confiável para essa dúvida. Consulte a liderança antes de agir." };
	return { reply: result.rows.map((item) => `${item.title} (v${item.version})\n${text(item.content).slice(0, 1200)}`).join("\n\n") };
}

const TOOLS = {
	consultar_os: toolOrderQuery,
	buscar_oportunidades: toolSearch,
	solicitar_os: toolAssignment,
	consultar_protocolo: toolProtocol,
	consultar_produtividade: toolProductivity,
	consultar_equipamento: toolEquipment,
	consultar_conhecimento: toolKnowledge,
};

async function transitionProtocol(protocol, status, actorUid, reason = null, data = {}) {
	const client = await db.connect();
	try {
		await client.query("begin");
		const updated = await client.query(
			`update retorninho_protocols set status=$2,reason=$3,completed_at=case when $2 in ('COMPLETED','FAILED','DENIED','EXPIRED','CANCELLED') then now() else completed_at end,
			 metadata=coalesce(metadata,'{}'::jsonb)||$4::jsonb where id=$1 and status=$5 returning *`,
			[protocol.id, status, reason, JSON.stringify(data), protocol.status],
		);
		if (!updated.rows[0]) throw apiError("O protocolo foi atualizado por outra operação.", 409, "PROTOCOL_STATE_CHANGED");
		await client.query("insert into retorninho_protocol_events (protocol_id,from_status,to_status,actor_user_uid,reason,data) values ($1,$2,$3,$4,$5,$6::jsonb)",
			[protocol.id, protocol.status, status, actorUid || null, reason, JSON.stringify(data)]);
		await client.query("commit");
		return updated.rows[0];
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function confirmPending(context, accepted) {
	const pending = context.conversation.session_data?.pendingAction;
	if (!pending || pending.type !== "ASSIGN" || Number(pending.expiresAt || 0) < Date.now()) {
		return { reply: "Não há uma ação pendente válida. Envie novamente a O.S. que deseja assumir." };
	}
	const found = await db.query("select * from retorninho_protocols where id=$1 and requester_user_uid=$2", [pending.protocolId, context.identity.uid]);
	const protocol = found.rows[0];
	if (!protocol || protocol.status !== "CREATED") return { reply: "Esse protocolo não está mais aguardando confirmação." };
	await updateConversationSession(context.conversation.id, { pendingAction: null });
	if (!accepted) {
		await transitionProtocol(protocol, "CANCELLED", context.identity.uid, "Cancelado pelo técnico.");
		return { reply: `Solicitação ${protocol.protocol_number} cancelada.` };
	}
	await transitionProtocol(protocol, "AUTHORIZED", context.identity.uid, "Confirmação explícita recebida.");
	await db.query("insert into retorninho_queue (kind,dedupe_key,payload) values ('PROTOCOL',$1,$2::jsonb) on conflict (dedupe_key) do nothing",
		[`protocol:${protocol.id}:execute`, JSON.stringify({ protocolId: protocol.id, correlationId: context.correlationId })]);
	return { reply: `Confirmação recebida. Estou processando o protocolo ${protocol.protocol_number}. Você será avisado quando a alteração for confirmada.` };
}

async function handleTransferDecision(context, decision, protocolNumber) {
	const result = await db.query(
		`select * from retorninho_protocols where protocol_number=$1 and current_user_uid=$2 and status='WAITING_TECHNICIAN' for update`,
		[protocolNumber, context.identity.uid],
	);
	const protocol = result.rows[0];
	if (!protocol) return null;
	if (protocol.expires_at && new Date(protocol.expires_at) < new Date()) {
		await transitionProtocol(protocol, "EXPIRED", context.identity.uid, "Prazo de aceite expirado.");
		return { reply: `O protocolo ${protocol.protocol_number} já expirou.` };
	}
	if (decision === "deny") {
		await transitionProtocol(protocol, "DENIED", context.identity.uid, "Recusado pelo técnico responsável.");
		await updateConversationSession(context.conversation.id, { pendingTransferProtocol: null });
		return { reply: `Transferência ${protocol.protocol_number} recusada e registrada.` };
	}
	await transitionProtocol(protocol, "AUTHORIZED", context.identity.uid, "Aceite explícito do técnico responsável.");
	await updateConversationSession(context.conversation.id, { pendingTransferProtocol: null });
	await db.query("insert into retorninho_queue (kind,dedupe_key,payload) values ('PROTOCOL',$1,$2::jsonb) on conflict (dedupe_key) do nothing",
		[`protocol:${protocol.id}:execute`, JSON.stringify({ protocolId: protocol.id, correlationId: context.correlationId })]);
	return { reply: `Aceite registrado. A transferência ${protocol.protocol_number} será processada agora.` };
}

async function processInbound(payload) {
	const incoming = payload.normalized || incomingMessage(payload.payload || {});
	if (incoming.fromMe || (!incoming.body && !incoming.location) || incoming.instance !== INSTANCE_NAME) return;
	const config = await configRow();
	if (incoming.provider !== config.provider) return;
	const correlationId = crypto.randomUUID();
	const authorization = await findAuthorized(incoming.phone);
	if (!authorization || authorization.status !== "ACTIVE") {
		await recordEvent("OPERATIONAL", "UNAUTHORIZED_ACCESS", "BLOCKED", { correlationId, provider: "evolution", ruleApplied: authorization?.status || "NOT_WHITELISTED", details: { phone: security.maskPhone(incoming.phone) } });
		return;
	}
	const conversation = await ensureConversation(authorization, incoming.provider);
	const body = incoming.body || "[LOCALIZAÇÃO COMPARTILHADA]";
	const message = await saveMessage(conversation.id, "INBOUND", body, { provider: incoming.provider, providerMessageId: incoming.messageId || null, correlationId });
	if (!message) return;
	const user = await authenticatedUser(authorization);
	const identity = userIdentity(user);
	await db.query("update retorninho_authorized_users set last_authenticated_at=now(),failed_attempts=0 where id=$1", [authorization.id]);
	if (!config.enabled || !config.automatic_replies || conversation.status === "PAUSED") {
		await recordEvent("TECHNICAL", "AGENT_PAUSED", "IGNORED", { correlationId, conversationId: conversation.id, messageId: message.id, userUid: identity.uid });
		return;
	}
	const minuteCount = await db.query("select count(*)::int total from retorninho_messages where conversation_id=$1 and direction='INBOUND' and created_at>=now()-interval '1 minute'", [conversation.id]);
	const dayCount = await db.query("select count(*)::int total from retorninho_messages where conversation_id=$1 and direction='INBOUND' and created_at::date=(now() at time zone 'America/Sao_Paulo')::date", [conversation.id]);
	if (Number(minuteCount.rows[0].total) > Number(config.rate_limit_per_minute) || Number(dayCount.rows[0].total) > Number(config.daily_message_limit)) {
		await recordEvent("TECHNICAL", "RATE_LIMIT", "BLOCKED", { correlationId, conversationId: conversation.id, userUid: identity.uid });
		return;
	}
	if (incoming.location && Number.isFinite(incoming.location.latitude) && Number.isFinite(incoming.location.longitude)) {
		conversation.session_data = (await updateConversationSession(conversation.id, { location: incoming.location })).session_data;
	}
	const context = { authorization, config, conversation, correlationId, identity, user, event: { correlationId, conversationId: conversation.id, messageId: message.id, userUid: identity.uid, userName: identity.name, regional: identity.regional, provider: incoming.provider } };
	const transferMatch = body.match(/\b(autorizo|aceito|recuso|nego)\s+(RET-\d{8}-\d{6})\b/i);
	const pendingTransfer = text(conversation.session_data?.pendingTransferProtocol);
	const simpleTransferDecision = pendingTransfer && /\b(pode|autorizo|aceito|sim|recuso|nego|nao)\b/i.test(body);
	let result = transferMatch
		? await handleTransferDecision(context, /recuso|nego/i.test(transferMatch[1]) ? "deny" : "accept", transferMatch[2].toUpperCase())
		: simpleTransferDecision
			? await handleTransferDecision(context, /recuso|nego|nao/i.test(body) ? "deny" : "accept", pendingTransfer)
		: null;
	if (!result) {
		const localDecision = ai.fallbackDecision(body);
		if (localDecision.intent === "confirm") result = await confirmPending(context, true);
		else if (localDecision.intent === "cancel") result = await confirmPending(context, false);
		else if (localDecision.intent === "more" && conversation.session_data?.lastSearch) {
			result = await toolSearch({ ...conversation.session_data.lastSearch, page: Number(conversation.session_data.lastSearchPage || 1) + 1 }, context);
		}
		else if (incoming.location) result = { reply: "Localização recebida. Diga “oportunidades próximas” para buscar retiradas perto de você." };
		else {
			let apiKey = text(process.env.GEMINI_API_KEY);
			if (!apiKey && config.ai_api_key_ciphertext) apiKey = security.decrypt("RETORNINHO_AI_API_KEY", { ciphertext: config.ai_api_key_ciphertext, iv: config.ai_api_key_iv, authTag: config.ai_api_key_auth_tag, keyId: config.secret_key_id });
			const history = await db.query("select direction,body from retorninho_messages where conversation_id=$1 and id<>$2 order by created_at desc limit $3", [conversation.id, message.id, Number(config.history_messages || 12)]);
			const startedAt = Date.now();
			const decision = await ai.decide({ apiKey, config, message: body, history: history.rows.reverse() }).catch(async (error) => {
				await recordEvent("TECHNICAL", "AI_FAILURE", "FAILED", { ...context.event, errorCode: error.code || "AI_ERROR", details: { message: text(error.message).slice(0, 500) } });
				return localDecision;
			});
			await recordEvent("TECHNICAL", "AI_CALL", "SUCCESS", { ...context.event, durationMs: Date.now() - startedAt, details: { model: config.ai_model, tokens: decision.usage || {} } });
			if (!decision.tool) result = { reply: welcomeMessage(identity.name) };
			else if (!allowedTools(authorization).includes(decision.tool)) result = { reply: "Essa ferramenta não está liberada para o seu acesso." };
			else if (!featureEnabled(config, decision.tool)) result = { reply: "Essa funcionalidade está pausada pela configuração administrativa." };
			else result = await TOOLS[decision.tool](decision.args || {}, context);
			await db.query("update retorninho_messages set tool_calls=$2::jsonb,token_usage=$3::jsonb,processed_at=now(),status='PROCESSING' where id=$1", [message.id, JSON.stringify(decision.tool ? [{ name: decision.tool, args: decision.args || {} }] : []), JSON.stringify(decision.usage || {})]);
		}
	}
	if (result?.reply) await queueOutbound({ conversation, phone: authorization.phone_e164, body: result.reply, correlationId });
	await db.query("update retorninho_messages set status='DELIVERED',processed_at=now() where id=$1", [message.id]);
}

async function processOutbound(payload) {
	const config = await configRow();
	if (!config.enabled) throw apiError("Agente pausado.", 409, "AGENT_PAUSED");
	let response;
	if (config.provider === "meta") {
		if (!config.meta_phone_number_id) throw apiError("Phone Number ID do Retorninho não configurado.", 409, "META_PHONE_NOT_CONFIGURED");
		response = await whatsappCloudService.sendOperationalText({ phoneNumberId: config.meta_phone_number_id, to: payload.phone, text: payload.body });
	} else {
		response = await evolutionMessaging.sendWhatsAppMessage(await resolveEvolutionConfig(config), payload.phone, payload.body, { source: "retorninho_ia" });
	}
	await db.query("update retorninho_messages set status='SENT',provider_message_id=coalesce($2,provider_message_id),processed_at=now() where id=$1", [payload.messageId, response.messageId || null]);
	await recordEvent("TECHNICAL", "MESSAGE_SENT", "SUCCESS", { correlationId: payload.correlationId, conversationId: payload.conversationId, messageId: payload.messageId, protocolId: payload.protocolId, provider: config.provider, details: { mode: response.mode || "cloud_api", providerMessageId: response.messageId || null } });
}

async function processProtocolUnlocked(payload) {
	const found = await db.query("select * from retorninho_protocols where id=$1", [payload.protocolId]);
	let protocol = found.rows[0];
	if (!protocol || !["AUTHORIZED", "PROCESSING"].includes(protocol.status)) return;
	if (protocol.operation_request_id) {
		const operation = await db.query(
			"select status,error_message,result_message,service_order_number from service_order_requests where id=$1",
			[protocol.operation_request_id],
		);
		const request = operation.rows[0];
		if (!request) throw apiError("Solicitação operacional vinculada não foi encontrada.", 404);
		if (request.status === "FAILED") {
			await transitionProtocol(protocol, "FAILED", protocol.requester_user_uid, text(request.error_message || "Falha na atribuição.").slice(0, 500));
			await recordEvent("OPERATIONAL", "ASSIGNMENT_FAILED", "FAILED", { protocolId: protocol.id, userUid: protocol.requester_user_uid, serviceOrderNumber: protocol.service_order_number, errorCode: "ASSIGNMENT_FAILED", details: { message: text(request.error_message).slice(0, 500) } });
			return;
		}
		if (request.status !== "COMPLETED") {
			await db.query(
				`insert into retorninho_queue (kind,dedupe_key,payload,next_attempt_at)
				 values ('PROTOCOL',$1,$2::jsonb,now()+interval '3 seconds') on conflict (dedupe_key) do nothing`,
				[`protocol:${protocol.id}:check:${Date.now()}`, JSON.stringify({ protocolId: protocol.id, correlationId: payload.correlationId })],
			);
			return;
		}
		protocol = await transitionProtocol(protocol, "COMPLETED", protocol.requester_user_uid, "Atribuição confirmada no HubSoft.", { operationRequestId: protocol.operation_request_id });
		const authorization = await db.query("select * from retorninho_authorized_users where user_uid=$1 and status='ACTIVE' order by updated_at desc limit 1", [protocol.requester_user_uid]);
		if (authorization.rows[0]) {
			const conversation = await ensureConversation(authorization.rows[0], (await configRow()).provider);
			await queueOutbound({ conversation, phone: authorization.rows[0].phone_e164, correlationId: payload.correlationId, protocolId: protocol.id, body: `Sua solicitação ${protocol.protocol_number} foi concluída. A O.S. ${request.service_order_number || protocol.service_order_number} foi confirmada no seu nome.` });
		}
		await recordEvent("OPERATIONAL", protocol.type === "TRANSFER" ? "TRANSFER_COMPLETED" : "SELF_ASSIGNMENT_COMPLETED", "SUCCESS", { protocolId: protocol.id, userUid: protocol.requester_user_uid, serviceOrderNumber: request.service_order_number || protocol.service_order_number, details: { operationRequestId: protocol.operation_request_id } });
		return;
	}
	protocol = await transitionProtocol(protocol, "PROCESSING", protocol.requester_user_uid, "Execução iniciada.");
	const profile = await usersRepository.getUserProfile(protocol.target_user_uid || protocol.requester_user_uid);
	const user = await rolePermissions.enrichUserWithPermissions(profile);
	try {
		const result = await mapsService.assignOrderToTechnician(protocol.service_order_id, {}, user);
		await db.query("update retorninho_protocols set operation_request_id=$2 where id=$1", [protocol.id, result.item?.id || null]);
		await db.query(
			`insert into retorninho_queue (kind,dedupe_key,payload,next_attempt_at)
			 values ('PROTOCOL',$1,$2::jsonb,now()+interval '3 seconds') on conflict (dedupe_key) do nothing`,
			[`protocol:${protocol.id}:check:${Date.now()}`, JSON.stringify({ protocolId: protocol.id, correlationId: payload.correlationId })],
		);
	} catch (error) {
		await transitionProtocol(protocol, "FAILED", protocol.requester_user_uid, text(error.message).slice(0, 500));
		await recordEvent("OPERATIONAL", "ASSIGNMENT_FAILED", "FAILED", { protocolId: protocol.id, userUid: protocol.requester_user_uid, serviceOrderNumber: protocol.service_order_number, errorCode: error.code || "ASSIGNMENT_FAILED", details: { message: text(error.message).slice(0, 500) } });
		throw error;
	}
}

async function processProtocol(payload) {
	const client = await db.connect();
	const lockKey = `retorninho:${payload.protocolId}`;
	try {
		const lock = await client.query("select pg_try_advisory_lock(hashtext($1)) locked", [lockKey]);
		if (!lock.rows[0]?.locked) throw apiError("Protocolo já está sendo processado.", 409, "PROTOCOL_BUSY");
		return await processProtocolUnlocked(payload);
	} finally {
		await client.query("select pg_advisory_unlock(hashtext($1))", [lockKey]).catch(() => {});
		client.release();
	}
}

async function claimQueueItem() {
	const result = await db.query(
		`with candidate as (
		 select id from retorninho_queue
		 where (status in ('PENDING','FAILED') and next_attempt_at<=now())
		    or (status='PROCESSING' and locked_at<now()-interval '5 minutes')
		 order by id for update skip locked limit 1
		)
		 update retorninho_queue q set status='PROCESSING',attempts=attempts+1,locked_at=now()
		 from candidate where q.id=candidate.id returning q.*`,
	);
	return result.rows[0] || null;
}

async function completeQueueItem(id) {
	await db.query("update retorninho_queue set status='COMPLETED',completed_at=now(),locked_at=null,last_error=null where id=$1", [id]);
}

async function failQueueItem(item, error) {
	const exhausted = Number(item.attempts || 1) >= MAX_ATTEMPTS;
	const delay = Math.min(300, 5 * 2 ** Math.max(0, Number(item.attempts || 1) - 1));
	await db.query(
		`update retorninho_queue set status=$2,next_attempt_at=now()+($3::text||' seconds')::interval,locked_at=null,last_error=$4 where id=$1`,
		[item.id, exhausted ? "DEAD_LETTER" : "FAILED", String(delay), text(error.message || error).slice(0, 2000)],
	);
	await recordEvent("TECHNICAL", exhausted ? "DEAD_LETTER" : "QUEUE_RETRY", "FAILED", { attempt: item.attempts, errorCode: error.code || "QUEUE_ERROR", details: { queueId: item.id, kind: item.kind, message: text(error.message || error).slice(0, 500) } });
}

async function runQueueBatch() {
	if (workerBusy) return;
	workerBusy = true;
	try {
		for (let index = 0; index < BATCH_SIZE; index += 1) {
			const item = await claimQueueItem();
			if (!item) break;
			try {
				if (item.kind === "INBOUND") await processInbound(item.payload);
				else if (item.kind === "OUTBOUND") await processOutbound(item.payload);
				else await processProtocol(item.payload);
				await completeQueueItem(item.id);
			} catch (error) {
				await failQueueItem(item, error);
			}
		}
		await db.query(
			`update retorninho_protocols set status='EXPIRED',reason='Prazo de aceite expirado.',completed_at=now()
			 where status='WAITING_TECHNICIAN' and expires_at<now()`,
		);
	} finally {
		workerBusy = false;
	}
}

function startWorker() {
	if (workerTimer) return;
	workerTimer = setInterval(() => runQueueBatch().catch((error) => console.error("[retorninho] worker:", error.message)), 1000);
	workerTimer.unref?.();
}

function stopWorker() {
	if (workerTimer) clearInterval(workerTimer);
	workerTimer = null;
}

async function reprocessQueue(id, user = {}) {
	const result = await db.query("update retorninho_queue set status='PENDING',attempts=0,next_attempt_at=now(),locked_at=null,last_error=null where id=$1 and status in ('FAILED','DEAD_LETTER') returning *", [id]);
	if (!result.rows[0]) throw apiError("Evento não encontrado ou não elegível.", 404);
	const actor = userIdentity(user);
	await recordEvent("AUDIT", "QUEUE_REPROCESSED", "SUCCESS", { userUid: actor.uid, userName: actor.name, details: { queueId: id } });
	return result.rows[0];
}

module.exports = {
	ALL_TOOLS,
	INSTANCE_NAME,
	authorizeUser,
	clearSecret,
	connectInstance,
	dashboard,
	disconnectInstance,
	enqueueMetaWebhook,
	enqueueWebhook,
	exportEvents,
	getConfig,
	instanceStatus,
	listConversations,
	listEvents,
	listKnowledge,
	listMessages,
	listProtocols,
	listQueue,
	listUsers,
	reprocessQueue,
	runQueueBatch,
	saveConfig,
	saveKnowledge,
	setConversationStatus,
	startWorker,
	stopWorker,
	updateAuthorization,
	verifyWebhookSecret,
	_test: { incomingMessage, metaMessages, webhookDedupe, pageOf, minimalOrder, resolveEvolutionConfig, welcomeMessage },
};
