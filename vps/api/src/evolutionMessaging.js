const documents = require("./documents");
const agendamentosRepository = require("./agendamentosRepository");
const mensageriaRepository = require("./mensageriaRepository");
const notificationsService = require("./notificationsService");
const cvortexIntegration = require("./cvortexIntegration");
const { broadcastRealtime } = require("./realtime");
const { randomFloat, randomId, randomIntInclusive } = require("./secureRandom");

const CALLBACK_COLLECTION = "mensageria_callbacks";
const DISCONNECT_LOG_COLLECTION = "mensageria_evolution_disconnect_logs";
const APPOINTMENT_COLLECTION = "agendamentos";
const SUPPORTED_WHATSAPP_PROVIDERS = new Set([
	"evolution",
	"official_whatsapp",
	"cvortex",
]);
const AUTOMATION_ATTENDANT_ID = "retorninho";
const AUTOMATION_ATTENDANT_NAME = "RETORNINHO";
const SEND_TIME_ZONE = "America/Sao_Paulo";
const CENTRAL_REDIRECT_MESSAGE =
	"Olá! Este número é utilizado apenas por um sistema automático de mensagens.\n\n" +
	"Não realizamos atendimento e não respondemos por este canal.\n\n" +
	"Para falar com a Central de Retiradas, entre em contato pelo telefone: 31 3987-0880.";

const DEFAULT_CONFIG = {
	whatsappProvider: "evolution",
	evolutionEnabled: false,
	evolutionBaseUrl: "",
	evolutionApiKey: "",
	evolutionInstance: "",
	evolutionAccounts: [],
	evolutionSelectedAccountId: "default",
	evolutionSendTextPath: "/message/sendText/{instance}",
	evolutionButtonPath: "/message/sendButtons/{instance}",
	evolutionWebhookUrl: "https://retiradas.tech/api/webhooks/evolution",
	officialWhatsappEnabled: false,
	officialWhatsappBaseUrl: "https://graph.facebook.com/v20.0",
	officialWhatsappAccessToken: "",
	officialWhatsappPhoneNumberId: "",
	officialWhatsappBusinessAccountId: "",
	officialWhatsappTemplateName: "",
	officialWhatsappTemplateLanguage: "pt_BR",
	officialWhatsappTemplateBodyUsesMessage: true,
	officialWebhookVerifyToken: "",
	cvortexEnabled: false,
	evolutionPaused: true,
	smartDelayEnabled: true,
	evolutionMinDelaySeconds: 45,
	evolutionMaxDelaySeconds: 120,
	evolutionBatchSize: 1,
	replyNoScheduleMessage:
		"Perfeito, vamos agendar sua retirada.\n\nResponda com a data e o horário desejados ou digite SIM para receber as opções disponíveis.",
	replyAfterScheduledMessage: CENTRAL_REDIRECT_MESSAGE,
	replyUnmatchedMessage:
		"Anotado a informação!\n\nNão encontrei sua O.S automaticamente por este telefone. Caso necessite de apoio, acione a central de retiradas: 31 3987-0880.",
	replyScheduledConfirmationMessage:
		"Agendamento registrado com sucesso para {data_agendamento} {hora_agendamento}.\n\nEm caso de d\u00favidas, fale com nossa central de retiradas.",
	replyPastScheduleDateMessage:
		"A data informada ({data_agendamento}) \u00e9 anterior ao dia atual.\n\nPor favor, informe uma nova data futura para agendarmos a retirada.",
	replySameDayAfterCutoffMessage:
		"N\u00e3o \u00e9 poss\u00edvel realizar o agendamento para hoje devido ao hor\u00e1rio.\n\nPor favor, informe uma nova data a partir de amanh\u00e3.",
	replyDeliveredMessage:
		"Caso j\u00e1 tenha feito a devolu\u00e7\u00e3o, favor entrar em contato com nossa central para tratativa e remo\u00e7\u00e3o da sua ordem de servi\u00e7o: 31 3987-0880",
	guidedScheduleEnabled: true,
	guidedScheduleDateMessage:
		"Perfeito! Escolha uma das datas abaixo para agendarmos a retirada:\n\n{opcoes_datas}\n\nSe preferir outra data, responda com a data desejada. Exemplo: 25/08.",
	guidedScheduleTimeMessage:
		"Ótimo. Agora escolha um horário para o dia {data_agendamento}:\n\n1 - 09h\n2 - 12h\n3 - 16h\n4 - Outro horário\n\nSe preferir, responda com o horário desejado. Exemplo: 14:30.",
	guidedScheduleInvalidDateMessage:
		"Não entendi a data escolhida. Por favor, escolha uma das opções abaixo ou informe outra data:\n\n{opcoes_datas}\n\nExemplo: 25/08.",
	guidedScheduleInvalidTimeMessage:
		"Não entendi o horário escolhido. Por favor, escolha uma das opções abaixo ou informe outro horário:\n\n1 - 09h\n2 - 12h\n3 - 16h\n4 - Outro horário\n\nExemplo: 14:30.",
	sendWindowStart: "08:00",
	sendWindowEnd: "18:00",
	sendDays: ["seg", "ter", "qua", "qui", "sex", "sab"],
	retryLimit: 3,
	retryAfterMinutes: 30,
	dailySendLimit: 100,
	activeTemplateId: "cancelamento",
};

const DEFAULT_TEMPLATES = {
	cancelamento:
		"Olá, {primeiro_nome}! Tudo bem?\n\nIdentificamos que há uma ordem de retirada de equipamento pendente referente ao contrato {contrato}, na cidade de *{cidade}*.\n\nGostaríamos de agendar a retirada. Por favor, responda esta mensagem informando uma data e um horário em que estará disponível para receber nossa equipe ou digite apenas *SIM* para receber opções de agendamento.\n\n⚠️ Importante: a não devolução do equipamento poderá gerar cobrança de multa, conforme previsto em contrato.\n\nAguardamos seu retorno para realizarmos o agendamento.\n\nEquipe de Retiradas - Sempre Internet",
	segunda_tentativa:
		"Olá, {primeiro_nome}! Tudo bem?\n\nEstamos retornando o contato sobre a ordem de retirada de equipamento pendente referente ao contrato {contrato}, na cidade de *{cidade}*.\n\nPara agendar a retirada, responda com uma data e um horário disponíveis ou digite apenas *SIM* para receber opções de agendamento.\n\n⚠️ Importante: a não devolução do equipamento poderá gerar cobrança de multa, conforme previsto em contrato.\n\nEquipe de Retiradas - Sempre Internet",
	confirmacao:
		"Olá, {primeiro_nome}! Sua coleta dos equipamentos do contrato {contrato} foi registrada.",
};

let workerTimer = null;
let workerRunning = false;
let lastRun = null;
let lastError = "";
let lastSkipped = "";
let nextRunAt = null;
let lastQueueExecutionItem = null;
let nextQueueExecutionItem = null;
let lastConnectionAlertKey = "";
const recentInboundCallbacks = new Map();
const RECENT_INBOUND_TTL_MS = 10 * 60 * 1000;
const QUEUE_SEND_LOCK_TTL_MS = 15 * 60 * 1000;
const DUPLICATE_SEND_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

function nowIso() {
	return new Date().toISOString();
}

function pruneRecentInboundCallbacks(now = Date.now()) {
	for (const [key, createdAt] of recentInboundCallbacks.entries()) {
		if (now - createdAt > RECENT_INBOUND_TTL_MS) {
			recentInboundCallbacks.delete(key);
		}
	}
}

function buildRecentInboundKey({ phone, mensagem, webhookMessageId }) {
	const eventId = String(webhookMessageId || "").trim();
	if (eventId) return `event:${eventId}`;
	const normalizedPhone = normalizePhone(phone);
	const normalizedText = normalizeText(mensagem);
	if (!normalizedPhone || !normalizedText) return "";
	return `text:${normalizedPhone}:${normalizedText}`;
}

function markRecentInboundCallback({ phone, mensagem, webhookMessageId }) {
	pruneRecentInboundCallbacks();
	const key = buildRecentInboundKey({ phone, mensagem, webhookMessageId });
	if (!key) return false;
	if (recentInboundCallbacks.has(key)) return true;
	recentInboundCallbacks.set(key, Date.now());
	return false;
}

function normalizeDigits(value) {
	return String(value || "").replace(/\D/g, "");
}

function normalizePhone(value) {
	let digits = normalizeDigits(value);
	if (!digits) return "";
	if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
	return digits;
}

function isStaleQueueSendLock(item = {}, now = new Date()) {
	const lockedAt = new Date(
		item.envioLockEm || item.enviandoEm || item.atualizadoEm || 0,
	);
	if (Number.isNaN(lockedAt.getTime())) return true;
	return now.getTime() - lockedAt.getTime() > QUEUE_SEND_LOCK_TTL_MS;
}

function withoutEvolutionAutoRetries(config = {}) {
	return {
		...config,
		evolutionRetryPhoneVariants: false,
		evolutionRetryPendingVariants: false,
	};
}

function getPhoneVariants(value) {
	const digits = normalizePhone(value);
	if (!digits) return [];
	const variants = new Set([digits]);
	if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
		variants.add(`${digits.slice(0, 4)}${digits.slice(5)}`);
	}
	if (digits.startsWith("55") && digits.length === 12) {
		variants.add(`${digits.slice(0, 4)}9${digits.slice(4)}`);
	}
	return [...variants];
}

function getOutboundPhoneVariants(value) {
	const digits = normalizePhone(value);
	const variants = getPhoneVariants(digits);
	if (digits.startsWith("55") && digits.length === 12) {
		const withNinthDigit = `${digits.slice(0, 4)}9${digits.slice(4)}`;
		return [
			withNinthDigit,
			...variants.filter((item) => item !== withNinthDigit),
		];
	}
	return variants;
}

function phonesMatch(left, right) {
	const leftVariants = getPhoneVariants(left);
	const rightVariants = new Set(getPhoneVariants(right));
	return leftVariants.some((item) => rightVariants.has(item));
}

function normalizeText(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

function safeKey(value) {
	return normalizeText(value).replace(/[^a-z0-9]+/g, "_") || "nao_informado";
}

function fixMojibakeText(value) {
	return String(value || "")
		.replace(/Ã¡/g, "á")
		.replace(/Ã /g, "à")
		.replace(/Ã¢/g, "â")
		.replace(/Ã£/g, "ã")
		.replace(/Ã©/g, "é")
		.replace(/Ãª/g, "ê")
		.replace(/Ã­/g, "í")
		.replace(/Ã³/g, "ó")
		.replace(/Ã´/g, "ô")
		.replace(/Ãµ/g, "õ")
		.replace(/Ãº/g, "ú")
		.replace(/Ã§/g, "ç")
		.replace(/Ã/g, "Á")
		.replace(/Ã€/g, "À")
		.replace(/Ã‚/g, "Â")
		.replace(/Ãƒ/g, "Ã")
		.replace(/Ã‰/g, "É")
		.replace(/ÃŠ/g, "Ê")
		.replace(/Ã/g, "Í")
		.replace(/Ã“/g, "Ó")
		.replace(/Ã”/g, "Ô")
		.replace(/Ã•/g, "Õ")
		.replace(/Ãš/g, "Ú")
		.replace(/Ã‡/g, "Ç");
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs(config) {
	const min = Math.max(5, Number(config.evolutionMinDelaySeconds || 45));
	const max = Math.max(min, Number(config.evolutionMaxDelaySeconds || 120));
	return randomIntInclusive(min, max) * 1000;
}

function getSendWindowRemainingMs(config, date = new Date()) {
	const start = timeToMinutes(
		config.sendWindowStart || DEFAULT_CONFIG.sendWindowStart,
	);
	const end = timeToMinutes(
		config.sendWindowEnd || DEFAULT_CONFIG.sendWindowEnd,
	);
	if (start === null || end === null) return 0;

	const parts = getZonedDateParts(date);
	let current = parts.hour * 60 + parts.minute + parts.second / 60;
	let effectiveEnd = end;

	if (end < start) {
		effectiveEnd += 24 * 60;
		if (current < start) current += 24 * 60;
	}

	return Math.max(0, Math.floor((effectiveEnd - current) * 60 * 1000));
}

function calculateQueueDelayMs(
	config,
	remainingMessagesAfterCurrent = 1,
	date = new Date(),
) {
	if (config.smartDelayEnabled === false) return randomDelayMs(config);

	const minMs =
		Math.max(5, Number(config.evolutionMinDelaySeconds || 45)) * 1000;
	const manualMaxMs = Math.max(
		minMs,
		Number(config.evolutionMaxDelaySeconds || 120) * 1000,
	);
	const remainingWindowMs = getSendWindowRemainingMs(config, date);
	const remainingMessages = Math.max(
		1,
		Number(remainingMessagesAfterCurrent || 1),
	);

	if (!remainingWindowMs) return randomDelayMs(config);

	const baseMs = remainingWindowMs / remainingMessages;
	const jitterFactor = randomFloat(0.85, 1.15);
	const dynamicMaxMs = Math.max(manualMaxMs, baseMs * 1.3);
	const delayMs = Math.round(baseMs * jitterFactor);

	return Math.max(minMs, Math.min(dynamicMaxMs, delayMs));
}

function summarizeQueueExecutionItem(item = {}) {
	if (!item) return null;
	return {
		id: item.id || "",
		codigoCliente: item.codigoCliente || item.codigo_cliente || "",
		cliente: item.cliente || item.cliente_nome || "",
		telefone: item.telefone || "",
		os: item.os || "",
		cidade: item.cidade || "",
	};
}

function getZonedDateParts(date = new Date()) {
	const values = {};
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: SEND_TIME_ZONE,
		weekday: "short",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).formatToParts(date);

	for (const part of parts) {
		if (part.type !== "literal") values[part.type] = part.value;
	}

	return {
		weekday: values.weekday,
		year: Number(values.year),
		month: Number(values.month),
		day: Number(values.day),
		hour: Number(values.hour) % 24,
		minute: Number(values.minute),
		second: Number(values.second),
	};
}

function getWeekDayKey(date = new Date()) {
	const weekday = getZonedDateParts(date).weekday;
	return (
		{
			Sun: "dom",
			Mon: "seg",
			Tue: "ter",
			Wed: "qua",
			Thu: "qui",
			Fri: "sex",
			Sat: "sab",
		}[weekday] || "seg"
	);
}

function zonedWallTimeToDate({ year, month, day, hour, minute, second = 0 }) {
	const targetWallTime = Date.UTC(year, month - 1, day, hour, minute, second);
	let instant = new Date(targetWallTime);

	for (let index = 0; index < 3; index += 1) {
		const parts = getZonedDateParts(instant);
		const currentWallTime = Date.UTC(
			parts.year,
			parts.month - 1,
			parts.day,
			parts.hour,
			parts.minute,
			parts.second,
		);
		const diff = targetWallTime - currentWallTime;
		if (diff === 0) break;
		instant = new Date(instant.getTime() + diff);
	}

	return instant;
}

function timeToMinutes(value) {
	const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
	if (!match) return null;
	return Number(match[1]) * 60 + Number(match[2]);
}

function isInsideSendWindow(config, date = new Date()) {
	const days =
		Array.isArray(config.sendDays) && config.sendDays.length
			? config.sendDays
			: DEFAULT_CONFIG.sendDays;
	if (!days.includes(getWeekDayKey(date))) return false;
	const start = timeToMinutes(
		config.sendWindowStart || DEFAULT_CONFIG.sendWindowStart,
	);
	const end = timeToMinutes(
		config.sendWindowEnd || DEFAULT_CONFIG.sendWindowEnd,
	);
	if (start === null || end === null) return true;
	const parts = getZonedDateParts(date);
	const current = parts.hour * 60 + parts.minute;
	if (end < start) return current >= start || current <= end;
	return current >= start && current <= end;
}

function getNextSendWindowStart(config, date = new Date()) {
	const days =
		Array.isArray(config.sendDays) && config.sendDays.length
			? config.sendDays
			: DEFAULT_CONFIG.sendDays;
	const start = timeToMinutes(
		config.sendWindowStart || DEFAULT_CONFIG.sendWindowStart,
	);
	if (start === null) return null;
	const currentParts = getZonedDateParts(date);
	const startHour = Math.floor(start / 60);
	const startMinute = start % 60;

	for (let offset = 0; offset < 8; offset += 1) {
		const calendarDay = new Date(
			Date.UTC(
				currentParts.year,
				currentParts.month - 1,
				currentParts.day + offset,
				12,
				0,
				0,
			),
		);
		const dayParts = getZonedDateParts(calendarDay);
		const dayKey = getWeekDayKey(calendarDay);
		if (!days.includes(dayKey)) continue;
		const next = zonedWallTimeToDate({
			year: dayParts.year,
			month: dayParts.month,
			day: dayParts.day,
			hour: startHour,
			minute: startMinute,
			second: 0,
		});
		if (next.getTime() > date.getTime()) return next;
	}

	return null;
}

function skippedQueue(message, extra = {}) {
	lastSkipped = message;
	return { ok: true, skipped: message, ...extra };
}

function getLocalDateKey(value = new Date()) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

async function getConfig() {
	const savedConfig = await mensageriaRepository.getMessagingConfig();
	const config = { ...DEFAULT_CONFIG, ...savedConfig };
	if (!SUPPORTED_WHATSAPP_PROVIDERS.has(config.whatsappProvider)) {
		config.whatsappProvider = "evolution";
	}
	config.evolutionAccounts = [];
	config.evolutionSelectedAccountId = "default";
	return config;
}

async function saveConfigPatch(patch = {}) {
	const current = await getConfig();
	await mensageriaRepository.saveMessagingConfigPatch({
		...current,
		...patch,
		atualizadoEm: nowIso(),
	});
}

async function getTemplate(templateId) {
	const id = String(templateId || "cancelamento");
	const template = (await mensageriaRepository.getMessageTemplate(id)) || {
		id,
		conteudo: DEFAULT_TEMPLATES[id] || DEFAULT_TEMPLATES.cancelamento,
	};
	return { ...template, conteudo: fixMojibakeText(template.conteudo) };
}

async function listQueue(limit = 20) {
	return (await mensageriaRepository.listAllQueueMessages())
		.sort((left, right) => {
			const leftIsMapDiff =
				left.origemTipo === "mapa_diff" ||
				normalizeText(left.origem).includes("diferenca automatica");
			const rightIsMapDiff =
				right.origemTipo === "mapa_diff" ||
				normalizeText(right.origem).includes("diferenca automatica");
			const leftPriority = left.prioridadeEm || leftIsMapDiff ? 0 : 1;
			const rightPriority = right.prioridadeEm || rightIsMapDiff ? 0 : 1;
			if (leftPriority !== rightPriority) return leftPriority - rightPriority;

			const leftDate =
				new Date(
					left.prioridadeEm ||
						left.diffMapaEm ||
						left.criadoEm ||
						left.proximaTentativaEm ||
						0,
				).getTime() || 0;
			const rightDate =
				new Date(
					right.prioridadeEm ||
						right.diffMapaEm ||
						right.criadoEm ||
						right.proximaTentativaEm ||
						0,
				).getTime() || 0;

			return leftPriority === 0 ? rightDate - leftDate : leftDate - rightDate;
		})
		.slice(0, Math.max(1, Number(limit || 20)));
}

async function upsertQueueItem(id, data) {
	await mensageriaRepository.saveQueueMessage(id, data);
}

async function createHistory(data) {
	const id = randomId("evo");
	await mensageriaRepository.createHistoryEntry(
		{ id, ...data, criadoEm: nowIso() },
		{ id },
	);
	return id;
}

async function getQueueItem(id) {
	return mensageriaRepository.getQueueMessage(id);
}

async function listHistory(limit = 1000) {
	return mensageriaRepository.listHistoryEntries({ limit, offset: 0 });
}

async function findRecentDuplicateSent({ filaId, telefone, mensagem }) {
	const phone = normalizePhone(telefone);
	const textKey = normalizeText(mensagem);
	if (!phone || !textKey) return null;
	const minTime = Date.now() - DUPLICATE_SEND_LOOKBACK_MS;
	const history = await listHistory(5000);
	return (
		history.find((item) => {
			if (String(item.status || "") !== "enviado") return false;
			if (filaId && item.filaId === filaId) return true;
			if (normalizePhone(item.telefone) !== phone) return false;
			if (normalizeText(item.mensagem) !== textKey) return false;
			const createdAt = new Date(
				item.criadoEm?.value ||
					item.criadoEm ||
					item.criado_em?.value ||
					item.criado_em ||
					0,
			).getTime();
			return !Number.isNaN(createdAt) && createdAt >= minTime;
		}) || null
	);
}

async function countQueueMessagesSentToday() {
	const todayKey = getLocalDateKey();
	const history = await listHistory(2000);
	return history.filter((item) => {
		if (String(item.status || "") !== "enviado") return false;
		if (!item.filaId) return false;
		const createdAt =
			item.criadoEm?.value ||
			item.criadoEm ||
			item.criado_em?.value ||
			item.criado_em ||
			"";
		return getLocalDateKey(createdAt) === todayKey;
	}).length;
}

async function listCallbacks(limit = 500) {
	return mensageriaRepository.listCallbacks({ limit, offset: 0 });
}

function getFirstName(name) {
	return (
		String(name || "Cliente")
			.trim()
			.split(/\s+/)[0] || "Cliente"
	);
}

function renderTemplate(text, item = {}, config = {}) {
	const centralPhone = normalizePhone(config.buttonPhone || "+55 31 3987-0880");
	const data = {
		...item,
		primeiro_nome: getFirstName(item.cliente || item.cliente_nome),
		central_whatsapp: config.buttonPhone || "+55 31 3987-0880",
		link_agendamento: centralPhone ? `https://wa.me/${centralPhone}` : "",
		data_cancelamento: item.data_cancelamento || item.data_abertura_os || "",
		protocolo: item.protocolo || item.os || "",
		data_agendamento: item.data_agendamento || "",
		hora_agendamento: item.hora_agendamento || "",
	};
	return String(text || "").replace(/\{(\w+)\}/g, (match, key) =>
		data[key] === undefined || data[key] === null || data[key] === ""
			? match
			: String(data[key]),
	);
}

function buildEvolutionUrl(config) {
	const baseUrl = String(config.evolutionBaseUrl || "").replace(/\/+$/, "");
	const instance = encodeURIComponent(
		String(config.evolutionInstance || "").trim(),
	);
	const path = String(
		config.evolutionSendTextPath || DEFAULT_CONFIG.evolutionSendTextPath,
	)
		.replace("{instance}", instance)
		.replace(/^\/?/, "/");
	return `${baseUrl}${path}`;
}

function buildEvolutionApiUrl(config, path) {
	const baseUrl = String(config.evolutionBaseUrl || "").replace(/\/+$/, "");
	if (!baseUrl || !config.evolutionApiKey) {
		throw new Error("Evolution API nao configurada.");
	}
	return `${baseUrl}${String(path || "").replace(/^\/?/, "/")}`;
}

async function requestEvolution(config, path, options = {}) {
	const response = await fetch(buildEvolutionApiUrl(config, path), {
		method: options.method || "GET",
		headers: {
			"Content-Type": "application/json",
			apikey: String(config.evolutionApiKey),
			Authorization: `Bearer ${config.evolutionApiKey}`,
			...(options.headers || {}),
		},
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});
	let data = null;
	try {
		data = await response.json();
	} catch {
		data = null;
	}
	if (!response.ok) {
		const error = new Error(
			data?.message || data?.error || `Evolution HTTP ${response.status}`,
		);
		error.statusCode = response.status;
		error.response = data;
		throw error;
	}
	const statusValue = Number(
		data?.status || data?.statusCode || data?.response?.status || 0,
	);
	if (statusValue >= 400 || data?.error === true || data?.success === false) {
		throw new Error(
			data?.message ||
				data?.errorMessage ||
				data?.error ||
				`Evolution rejeitou envio (${statusValue || "sem status"})`,
		);
	}
	return data || { ok: true };
}

function extractConnectionState(payload) {
	return (
		payload?.instance?.state ||
		payload?.data?.state ||
		payload?.state ||
		payload?.connectionState ||
		payload?.data?.connectionState ||
		payload?.data?.connection?.state ||
		payload?.connection?.state ||
		""
	);
}

function extractDisconnectReason(payload = {}, fallback = "") {
	const candidates = [
		payload.reason,
		payload.disconnectReason,
		payload.statusReason,
		payload.error,
		payload.message,
		payload.instance?.reason,
		payload.instance?.disconnectReason,
		payload.instance?.statusReason,
		payload.data?.reason,
		payload.data?.disconnectReason,
		payload.data?.statusReason,
		payload.data?.error,
		payload.data?.message,
		payload.data?.lastDisconnect?.error?.message,
		payload.data?.lastDisconnect?.reason,
		payload.connection?.reason,
	];
	return (
		candidates.map((item) => String(item || "").trim()).find(Boolean) ||
		fallback ||
		"Conexão Evolution fechada."
	);
}

function isDisconnectedConnectionState(state) {
	const value = normalizeText(state);
	if (!value) return false;
	return [
		"close",
		"closed",
		"disconnect",
		"disconnected",
		"connection.close",
		"connection_lost",
		"timeout",
		"banned",
		"ban",
	].some((item) => value.includes(item));
}

function isConfirmedDisconnectedConnection(connection = {}) {
	return Boolean(
		connection.configured !== false &&
			!connection.checkFailed &&
			isDisconnectedConnectionState(connection.state),
	);
}

function isEvolutionConnectionEvent(payload = {}) {
	const event = normalizeText(
		payload.webhookEvent ||
			payload.event ||
			payload.type ||
			payload.status ||
			"",
	);
	return Boolean(
		event.includes("connection") ||
			event.includes("status.instance") ||
			payload.instance?.state ||
			payload.data?.state ||
			payload.connectionState ||
			payload.data?.connectionState,
	);
}

async function appendDisconnectLog(data = {}) {
	const createdAt = data.createdAt || nowIso();
	const id =
		data.id || `evo-disc-${createdAt.replace(/\D/g, "")}-${randomId("log")}`;
	const log = {
		id,
		type: data.type || "disconnect",
		state: String(data.state || ""),
		reason: String(data.reason || ""),
		number: data.number || "",
		instance: data.instance || "",
		pausedQueue: Boolean(data.pausedQueue),
		source: data.source || "system",
		createdAt,
		payload: data.payload || null,
	};
	await documents.upsertDocument({
		path: `${DISCONNECT_LOG_COLLECTION}/${id}`,
		collectionPath: DISCONNECT_LOG_COLLECTION,
		documentId: id,
		parentPath: null,
		data: log,
	});
	broadcastRealtime("mensageria", {
		action: "evolution_disconnect",
		id,
		state: log.state,
		reason: log.reason,
	});
	return log;
}

async function createDisconnectNotification(log, { dedupe = true } = {}) {
	const hourKey = new Date().toISOString().slice(0, 13).replace(/\D/g, "");
	const key = `evolution_disconnect_${normalizeText(log.state || "offline")}_${hourKey}`;
	if (dedupe && lastConnectionAlertKey === key) return null;
	lastConnectionAlertKey = key;
	return notificationsService
		.createNotification({
			type: "mensageria_evolution_disconnect",
			title: "Número da Mensageria caiu",
			message: `A fila foi pausada automaticamente. Motivo: ${log.reason || log.state || "conexão fechada"}.`,
			targetPath: "/mensageria/api",
			severity: "critical",
			targets: { roles: ["admin"] },
			dedupeKey: key,
			meta: {
				state: log.state,
				reason: log.reason,
				number: log.number,
				instance: log.instance,
				pausedQueue: log.pausedQueue,
				source: log.source,
				createdAt: log.createdAt,
			},
		})
		.catch((error) => {
			console.warn(
				"[evolution] Falha ao criar notificacao de queda:",
				error?.message || error,
			);
			return null;
		});
}

async function pauseQueueForDisconnectedEvolution({
	config,
	connection = {},
	payload = null,
	source = "status",
	reason = "",
} = {}) {
	const currentConfig = config || (await getConfig());
	const state =
		extractConnectionState(payload || connection) ||
		connection.state ||
		"desconectado";
	if (!isDisconnectedConnectionState(state)) return null;

	const finalReason =
		reason ||
		connection.error ||
		extractDisconnectReason(
			payload || connection,
			"Número desconectado da Evolution.",
		);

	await saveConfigPatch({
		evolutionPaused: true,
		evolutionAutoPausedAt: nowIso(),
		evolutionAutoPausedReason: finalReason,
	});
	nextRunAt = null;
	lastSkipped = `Fila pausada automaticamente: ${finalReason}`;

	const log = await appendDisconnectLog({
		state,
		reason: finalReason,
		number: connection.number || extractConnectedNumber(payload) || "",
		instance: currentConfig.evolutionInstance || "",
		pausedQueue: true,
		source,
		payload,
	});
	await createDisconnectNotification(log);
	return log;
}

function extractConnectedNumber(...payloads) {
	const candidates = [];
	const walk = (value) => {
		if (!value || typeof value !== "object") return;
		if (Array.isArray(value)) {
			value.forEach(walk);
			return;
		}
		Object.entries(value).forEach(([key, inner]) => {
			const lowerKey = key.toLowerCase();
			if (
				typeof inner === "string" &&
				[
					"number",
					"phone",
					"owner",
					"ownerjid",
					"remotejid",
					"jid",
					"profileid",
				].some((part) => lowerKey.includes(part))
			) {
				candidates.push(inner);
			}
			if (inner && typeof inner === "object") walk(inner);
		});
	};
	payloads.forEach(walk);
	const raw = candidates.find((value) =>
		/@s\.whatsapp\.net|^\d{10,15}/.test(String(value)),
	);
	if (!raw) return "";
	const digits = normalizeDigits(String(raw).split("@")[0]);
	return digits ? `+${digits}` : String(raw);
}

async function getConnectionInfo(config = null) {
	const nextConfig = config || (await getConfig());
	const instanceName = String(nextConfig.evolutionInstance || "").trim();
	if (
		!nextConfig.evolutionBaseUrl ||
		!nextConfig.evolutionApiKey ||
		!instanceName
	) {
		return {
			configured: false,
			connected: false,
			state: "nao_configurada",
			number: "",
		};
	}

	let connection = null;
	let instances = null;
	try {
		connection = await requestEvolution(
			nextConfig,
			`/instance/connectionState/${encodeURIComponent(instanceName)}`,
		);
	} catch (error) {
		return {
			configured: true,
			connected: false,
			state: "erro",
			number: "",
			checkFailed: true,
			statusCode: error?.statusCode || 0,
			error: String(error?.message || error),
		};
	}

	try {
		instances = await requestEvolution(nextConfig, "/instance/fetchInstances");
	} catch {
		instances = null;
	}

	const state = extractConnectionState(connection) || "desconhecido";
	return {
		configured: true,
		connected: state === "open",
		state,
		number: extractConnectedNumber(connection, instances),
		connection,
	};
}

async function getAccountsConnectionInfo() {
	const config = await getConfig();
	const connection = await getConnectionInfo(config);
	const items = [
		{
			id: "default",
			name: "Conta principal",
			instance: config.evolutionInstance || "",
			selected: true,
			...connection,
		},
	];
	return {
		total: items.length,
		connected: items.filter((item) => item.connected).length,
		items,
	};
}

async function createOrConnectInstance(providedConfig = null, options = {}) {
	const config = providedConfig || (await getConfig());
	const instanceName = String(config.evolutionInstance || "").trim();
	if (!instanceName)
		throw new Error("Informe o nome da instancia da Evolution.");

	const connectPath = `/instance/connect/${encodeURIComponent(instanceName)}`;
	let firstConnectError = "";
	try {
		const connectResult = await requestEvolution(config, connectPath);
		let webhook = null;
		try {
			webhook = await configureWebhook(config, options);
		} catch (error) {
			webhook = { ok: false, error: String(error?.message || error) };
		}
		return {
			ok: true,
			instanceName,
			create: {
				skipped: true,
				reason: "Instancia ja existe ou connect respondeu primeiro.",
			},
			connect: connectResult,
			webhook,
		};
	} catch (error) {
		firstConnectError = String(error?.message || error);
	}

	let createResult = null;
	try {
		createResult = await requestEvolution(config, "/instance/create", {
			method: "POST",
			body: {
				instanceName,
				qrcode: true,
				integration: "WHATSAPP-BAILEYS",
			},
		});
	} catch (error) {
		const firstCreateMessage = String(error?.message || error);
		try {
			createResult = await requestEvolution(config, "/instance/create", {
				method: "POST",
				body: {
					instanceName,
					qrcode: true,
					integration: "BAILEYS",
				},
			});
		} catch (fallbackError) {
			createResult = {
				ok: false,
				ignored: true,
				message: `${firstCreateMessage} | ${String(fallbackError?.message || fallbackError)}`,
			};
		}
	}

	let connectResult = null;
	try {
		connectResult = await requestEvolution(config, connectPath);
	} catch (error) {
		throw new Error(
			`Nao foi possivel gerar QR Code. Connect inicial: ${firstConnectError}. Create: ${createResult?.message || "ok"}. Connect final: ${String(error?.message || error)}`,
		);
	}
	return {
		ok: true,
		instanceName,
		create: createResult,
		connect: connectResult,
		webhook: await configureWebhook(config, options).catch((error) => ({
			ok: false,
			error: String(error?.message || error),
		})),
	};
}

async function logoutInstance(providedConfig = null) {
	const config = providedConfig || (await getConfig());
	const instanceName = String(config.evolutionInstance || "").trim();
	if (!instanceName)
		throw new Error("Informe o nome da instancia da Evolution.");
	let logoutResult = null;
	let logoutError = "";
	try {
		logoutResult = await requestEvolution(
			config,
			`/instance/logout/${encodeURIComponent(instanceName)}`,
			{ method: "DELETE" },
		);
	} catch (error) {
		logoutError = String(error?.message || error);
	}
	const connection = await getConnectionInfo(config);
	if (logoutError && connection.connected) throw new Error(logoutError);
	return {
		ok: true,
		logout: logoutResult,
		ignoredError: logoutError,
		connection,
	};
}

async function deleteInstance(providedConfig = null) {
	const config = providedConfig || (await getConfig());
	const instanceName = String(config.evolutionInstance || "").trim();
	if (!instanceName)
		throw new Error("Informe o nome da instancia da Evolution.");
	const path = `/instance/delete/${encodeURIComponent(instanceName)}`;
	return {
		ok: true,
		instanceName,
		delete: await requestEvolution(config, path, { method: "DELETE" }),
	};
}

async function configureWebhook(providedConfig = null, options = {}) {
	const config = providedConfig || (await getConfig());
	const shouldPersist = options.persist !== false;
	const instanceName = String(config.evolutionInstance || "").trim();
	if (!instanceName)
		throw new Error("Informe o nome da instancia da Evolution.");
	const webhookUrl = String(
		config.evolutionWebhookUrl || DEFAULT_CONFIG.evolutionWebhookUrl || "",
	).trim();
	if (!webhookUrl) throw new Error("Informe a URL do webhook da Evolution.");
	const path = `/webhook/set/${encodeURIComponent(instanceName)}`;
	const webhook = {
		enabled: true,
		url: webhookUrl,
		headers: {},
		byEvents: false,
		base64: false,
		events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
	};

	try {
		const response = await requestEvolution(config, path, {
			method: "POST",
			body: { webhook },
		});
		if (shouldPersist) {
			await saveConfigPatch({
				evolutionWebhookUrl: webhookUrl,
				evolutionWebhookConfiguredAt: nowIso(),
			});
		}
		return { ok: true, webhook, response };
	} catch (firstError) {
		const fallbackBody = {
			enabled: true,
			url: webhookUrl,
			webhook_by_events: false,
			webhook_base64: false,
			events: webhook.events,
		};
		const response = await requestEvolution(config, path, {
			method: "POST",
			body: fallbackBody,
		});
		if (shouldPersist) {
			await saveConfigPatch({
				evolutionWebhookUrl: webhookUrl,
				evolutionWebhookConfiguredAt: nowIso(),
			});
		}
		return {
			ok: true,
			webhook: fallbackBody,
			response,
			fallback: true,
			firstError: String(firstError?.message || firstError),
		};
	}
}

async function getWebhookInfo(providedConfig = null) {
	const config = providedConfig || (await getConfig());
	const instanceName = String(config.evolutionInstance || "").trim();
	if (!instanceName)
		throw new Error("Informe o nome da instancia da Evolution.");
	const paths = [
		`/webhook/find/${encodeURIComponent(instanceName)}`,
		`/webhook/${encodeURIComponent(instanceName)}`,
	];
	let lastError = "";
	for (const path of paths) {
		try {
			return { ok: true, path, response: await requestEvolution(config, path) };
		} catch (error) {
			lastError = String(error?.message || error);
		}
	}
	return {
		ok: false,
		error: lastError || "Nao foi possivel consultar webhook.",
		configuredUrl:
			config.evolutionWebhookUrl || DEFAULT_CONFIG.evolutionWebhookUrl,
		configuredAt: config.evolutionWebhookConfiguredAt || "",
	};
}

function summarizeEvolutionSendResult(number, data = {}) {
	return {
		number,
		payloadMode: data?._payloadMode || "",
		status:
			data?.status ||
			data?.statusCode ||
			data?.message?.status ||
			data?.data?.status ||
			"",
		messageId:
			data?.key?.id ||
			data?.messageId ||
			data?.id ||
			data?.data?.key?.id ||
			data?.data?.messageId ||
			"",
		remoteJid:
			data?.key?.remoteJid ||
			data?.data?.key?.remoteJid ||
			data?.remoteJid ||
			"",
		message: data?.message || data?.error || "",
	};
}

function isPendingEvolutionSend(data = {}) {
	const status = String(
		data?.status || data?.message?.status || data?.data?.status || "",
	).toUpperCase();
	return status === "PENDING";
}

function buildEvolutionTextPayload(number, text, payloadMode = "default") {
	const options = { delay: 1200, presence: "composing" };
	if (payloadMode === "text_only") return { number, text, options };
	if (payloadMode === "text_message_only")
		return { number, textMessage: { text }, options };
	return { number, text, textMessage: { text }, options };
}

async function postEvolutionTextMessage(
	config,
	number,
	text,
	payloadMode = "default",
) {
	const url = buildEvolutionUrl(config);
	if (
		!config.evolutionBaseUrl ||
		!config.evolutionApiKey ||
		!config.evolutionInstance
	) {
		throw new Error("Evolution API nao configurada.");
	}
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			apikey: String(config.evolutionApiKey),
			Authorization: `Bearer ${config.evolutionApiKey}`,
		},
		body: JSON.stringify(buildEvolutionTextPayload(number, text, payloadMode)),
	});
	let data = null;
	try {
		data = await response.json();
	} catch {
		data = null;
	}
	if (!response.ok) {
		throw new Error(
			data?.message || data?.error || `Evolution HTTP ${response.status}`,
		);
	}
	const statusValue = Number(
		data?.status || data?.statusCode || data?.response?.status || 0,
	);
	if (statusValue >= 400 || data?.error === true || data?.success === false) {
		throw new Error(
			data?.message ||
				data?.errorMessage ||
				data?.error ||
				`Evolution rejeitou envio (${statusValue || "sem status"})`,
		);
	}
	return { ...(data || { ok: true }), _payloadMode: payloadMode };
}

async function sendTextMessage(config, number, text) {
	const normalizedNumber = normalizePhone(number);
	const variants =
		config.evolutionRetryPhoneVariants === true
			? getOutboundPhoneVariants(number)
			: [normalizedNumber];
	const payloadModes =
		config.evolutionRetryPendingVariants === true
			? ["default", "text_only", "text_message_only"]
			: ["default"];
	if (!variants.length)
		throw new Error("Informe um telefone valido para envio.");
	const attempts = [];
	let lastData = null;
	let lastError = "";
	for (const candidate of variants) {
		for (const payloadMode of payloadModes) {
			try {
				const data = await postEvolutionTextMessage(
					config,
					candidate,
					text,
					payloadMode,
				);
				lastData = data;
				attempts.push(summarizeEvolutionSendResult(candidate, data));
				if (!isPendingEvolutionSend(data)) {
					return {
						...(data || { ok: true }),
						_usedNumber: candidate,
						_attempts: attempts,
					};
				}
				lastError = "Evolution retornou PENDING.";
			} catch (error) {
				lastError = error?.message || String(error);
				attempts.push({ number: candidate, payloadMode, error: lastError });
			}
		}
	}
	if (lastData && config.evolutionFailOnPending === true) {
		const error = new Error(
			"Evolution retornou PENDING e nao confirmou a entrega da mensagem.",
		);
		error.evolutionResponse = {
			...(lastData || {}),
			_usedNumber: attempts.at(-1)?.number || variants.at(-1),
			_attempts: attempts,
		};
		error.evolutionAttempts = attempts;
		throw error;
	}
	if (lastData)
		return {
			...(lastData || { ok: true }),
			_usedNumber: attempts.at(-1)?.number || variants.at(-1),
			_attempts: attempts,
		};
	throw new Error(lastError || "Evolution nao confirmou o envio.");
}

async function sendOfficialWhatsAppMessage(config, number, text) {
	const baseUrl = String(
		config.officialWhatsappBaseUrl || DEFAULT_CONFIG.officialWhatsappBaseUrl,
	).replace(/\/+$/, "");
	const phoneNumberId = encodeURIComponent(
		String(config.officialWhatsappPhoneNumberId || "").trim(),
	);
	const token = String(config.officialWhatsappAccessToken || "").trim();
	if (!baseUrl || !phoneNumberId || !token) {
		throw new Error("WhatsApp oficial nao configurado.");
	}

	const body = {
		messaging_product: "whatsapp",
		recipient_type: "individual",
		to: normalizePhone(number),
	};
	const templateName = String(config.officialWhatsappTemplateName || "").trim();
	if (templateName) {
		const components = [];
		if (config.officialWhatsappTemplateBodyUsesMessage !== false) {
			components.push({
				type: "body",
				parameters: [{ type: "text", text: String(text || "").slice(0, 1024) }],
			});
		}
		body.type = "template";
		body.template = {
			name: templateName,
			language: { code: config.officialWhatsappTemplateLanguage || "pt_BR" },
			...(components.length ? { components } : {}),
		};
	} else {
		body.type = "text";
		body.text = { preview_url: false, body: String(text || "") };
	}

	const response = await fetch(`${baseUrl}/${phoneNumberId}/messages`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify(body),
	});
	let data = null;
	try {
		data = await response.json();
	} catch {
		data = null;
	}
	if (!response.ok) {
		throw new Error(
			data?.error?.message ||
				data?.message ||
				`WhatsApp oficial HTTP ${response.status}`,
		);
	}
	return data || { ok: true };
}

function getProviderName(config = {}) {
	const provider = String(config.whatsappProvider || "evolution");
	if (provider === "official_whatsapp") return "WhatsApp oficial";
	if (provider === "cvortex") return "Cvortex";
	return "Evolution API";
}

function isSelectedProviderEnabled(config = {}) {
	const provider = String(config.whatsappProvider || "evolution");
	if (provider === "official_whatsapp")
		return Boolean(config.officialWhatsappEnabled);
	if (provider === "cvortex") return Boolean(config.cvortexEnabled);
	return Boolean(config.evolutionEnabled);
}

async function sendWhatsAppMessage(config, number, text, item = {}) {
	const provider = String(config.whatsappProvider || "evolution");
	if (provider === "official_whatsapp") {
		return {
			mode: "official_whatsapp",
			response: await sendOfficialWhatsAppMessage(config, number, text),
		};
	}
	if (provider === "cvortex") {
		return {
			mode: "cvortex_text",
			response: await cvortexIntegration.sendTextMessage(number, text, item),
		};
	}
	return {
		mode: "evolution_text",
		response: await sendTextMessage(config, number, text),
	};
}

function canSendItem(item, config, now = new Date()) {
	const status = String(item.status || "novo");
	if (status === "enviando" && !isStaleQueueSendLock(item, now)) return false;
	if (!["aprovado", "novo", "aguardando_janela", "enviando"].includes(status))
		return false;
	if (!normalizePhone(item.telefone)) return false;
	const attempts = Number(item.tentativas || 0);
	if (attempts >= Number(config.retryLimit || 3)) return false;
	if (item.proximaTentativaEm) {
		const next = new Date(item.proximaTentativaEm);
		if (!Number.isNaN(next.getTime()) && next > now) return false;
	}
	return true;
}

async function acquireQueueSendLock(item, config, now = new Date()) {
	const current = await getQueueItem(item.id);
	if (!current || !canSendItem(current, config, now)) {
		return { locked: false, reason: "item_not_sendable", item: current };
	}
	if (
		String(current.status || "") === "enviando" &&
		!isStaleQueueSendLock(current, now)
	) {
		return { locked: false, reason: "already_locked", item: current };
	}

	const lockId = randomId("send-lock");
	const locked = await mensageriaRepository.acquireQueueItemLock(
		current.id,
		lockId,
		{ ttlSeconds: Math.ceil(QUEUE_SEND_LOCK_TTL_MS / 1000) },
	);
	const confirmed = locked?.data
		? { id: locked.documentId || current.id, ...(locked.data || {}) }
		: null;
	if (!confirmed) return { locked: false, reason: "already_locked", item: null };
	return { locked: true, lockId, item: confirmed };
}

// Extraido de processQueueOnce (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — processamento de um item da fila de envio
// (lock, checagem de duplicidade, tentativa de envio), mesma logica de
// antes. Devolve o desfecho em vez de mutar `sent`/`failed`/`lastSkipped`
// diretamente (quem chama decide o que fazer com o resultado).
async function processQueueCandidate(item, config) {
	const lock = await acquireQueueSendLock(item, config);
	if (!lock.locked) {
		return { locked: false, reason: lock.reason };
	}
	const lockedItem = lock.item;
	const phone = normalizePhone(lockedItem.telefone);
	const template = await getTemplate(
		lockedItem.templateId || config.activeTemplateId,
	);
	const message = renderTemplate(template.conteudo, lockedItem, config);
	const duplicate = await findRecentDuplicateSent({
		filaId: lockedItem.id,
		telefone: lockedItem.telefone,
		mensagem: message,
	});
	if (duplicate) {
		await upsertQueueItem(lockedItem.id, {
			...lockedItem,
			status: "duplicado",
			duplicadoDe: duplicate.filaId || duplicate.id,
			ultimoErro: "Envio ignorado para evitar mensagem duplicada.",
			envioLockId: "",
			envioLockEm: "",
			atualizadoEm: nowIso(),
		});
		await createHistory({
			cliente: lockedItem.cliente,
			telefone: lockedItem.telefone,
			os: lockedItem.os,
			cidade: lockedItem.cidade,
			templateId: template.id,
			mensagem: message,
			status: "duplicado",
			origem: getProviderName(config),
			filaId: lockedItem.id,
			erro: `Envio bloqueado por duplicidade com ${duplicate.filaId || duplicate.id}.`,
		});
		broadcastRealtime("mensageria", {
			action: "duplicate_blocked",
			id: lockedItem.id,
		});
		return {
			locked: true,
			outcome: "failed",
			id: lockedItem.id,
			error: "Duplicado bloqueado antes do envio.",
		};
	}
	const attempts = Number(lockedItem.tentativas || 0) + 1;
	try {
		const response = await sendWhatsAppMessage(
			withoutEvolutionAutoRetries(config),
			phone,
			message,
			lockedItem,
		);
		await upsertQueueItem(lockedItem.id, {
			...lockedItem,
			status: "enviado",
			tentativas: attempts,
			ultimoEnvioEm: nowIso(),
			envioLockId: "",
			envioLockEm: "",
			evolutionResponse: response.response,
			evolutionMode: response.mode,
			evolutionButtonError: response.buttonError || "",
			atualizadoEm: nowIso(),
		});
		await createHistory({
			cliente: lockedItem.cliente,
			telefone: lockedItem.telefone,
			os: lockedItem.os,
			cidade: lockedItem.cidade,
			templateId: template.id,
			mensagem: message,
			status: "enviado",
			origem: getProviderName(config),
			filaId: lockedItem.id,
			evolutionMode: response.mode,
			evolutionButtonError: response.buttonError || "",
		});
		lastQueueExecutionItem = summarizeQueueExecutionItem(lockedItem);
		broadcastRealtime("mensageria", { action: "sent", id: lockedItem.id });
		return { locked: true, outcome: "sent", id: lockedItem.id };
	} catch (error) {
		const retryAt = new Date(
			Date.now() + Number(config.retryAfterMinutes || 30) * 60 * 1000,
		).toISOString();
		lastQueueExecutionItem = summarizeQueueExecutionItem({
			...lockedItem,
			ultimoErro: error?.message || "Falha no envio.",
		});
		await upsertQueueItem(lockedItem.id, {
			...lockedItem,
			status:
				attempts >= Number(config.retryLimit || 3) ? "falhou" : "aprovado",
			tentativas: attempts,
			ultimoErro: error?.message || "Falha no envio.",
			proximaTentativaEm: retryAt,
			envioLockId: "",
			envioLockEm: "",
			atualizadoEm: nowIso(),
		});
		await createHistory({
			cliente: lockedItem.cliente,
			telefone: lockedItem.telefone,
			os: lockedItem.os,
			cidade: lockedItem.cidade,
			status: "falhou",
			erro: error?.message || "Falha no envio.",
			origem: getProviderName(config),
			filaId: lockedItem.id,
		});
		return { locked: true, outcome: "failed", id: lockedItem.id, error: error?.message };
	}
}

// Extraido de processQueueOnce (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — encapsula a checagem de conexao Evolution
// (so entra quando o provider selecionado e "evolution"), mesma logica
// de antes. Le/muta as variaveis de modulo (nextRunAt etc.) igual ao
// original, ja que sao closures do mesmo arquivo.
async function evaluateEvolutionConnectionGuard(config, manual) {
	const connection = await getConnectionInfo(config);
	if (connection.checkFailed) {
		return skippedQueue(
			`Falha ao consultar Evolution${connection.statusCode ? ` (${connection.statusCode})` : ""}: ${connection.error || "verifique a API key/base URL"}.`,
		);
	}
	if (!connection.connected) {
		const log = await pauseQueueForDisconnectedEvolution({
			config,
			connection,
			source: manual ? "manual_run" : "worker",
		});
		return skippedQueue(
			`Evolution desconectada: ${log?.reason || connection.error || connection.state || "sem conexão"}.`,
		);
	}
	return null;
}

// Guardas de entrada de processQueueOnce, na mesma ordem do if/else-if
// original: devolve o resultado de skip assim que a primeira guarda
// bloquear, ou null se pode prosseguir com o envio.
async function evaluateQueueDispatchGuards(config, manual) {
	if (!isSelectedProviderEnabled(config)) {
		return skippedQueue(`${getProviderName(config)} desativado.`);
	}
	if (config.evolutionPaused && !manual) return skippedQueue("Envio pausado.");
	if (!config.autoSend && !manual) {
		return skippedQueue("Envio automatico desativado.");
	}
	if (String(config.whatsappProvider || "evolution") === "evolution") {
		const connectionSkip = await evaluateEvolutionConnectionGuard(config, manual);
		if (connectionSkip) return connectionSkip;
	}
	if (!manual && !isInsideSendWindow(config)) {
		const nextWindow = getNextSendWindowStart(config);
		nextRunAt = nextWindow
			? nextWindow.toISOString()
			: new Date(Date.now() + 30000).toISOString();
		return skippedQueue("Fora da janela de envio.", { nextRunAt });
	}
	return null;
}

// Processa o lote de candidatos da fila, mesma logica do for original.
async function runQueueDispatchBatch(candidates, config, manual, remainingToday) {
	const sent = [];
	const failed = [];
	for (const item of candidates) {
		const result = await processQueueCandidate(item, config);
		if (!result.locked) {
			lastSkipped = `Item ${item.id} ignorado: ${result.reason}.`;
			continue;
		}
		if (result.outcome === "sent") {
			sent.push(result.id);
		} else if (result.outcome === "failed") {
			failed.push({ id: result.id, error: result.error });
		}
		if (!manual && sent.length < candidates.length) {
			const remainingAfterCurrent = Math.max(1, remainingToday - sent.length);
			await sleep(calculateQueueDelayMs(config, remainingAfterCurrent));
		}
	}
	return { sent, failed };
}

async function processQueueOnce({ manual = false } = {}) {
	const config = await getConfig();
	lastRun = nowIso();
	lastError = "";
	lastSkipped = "";

	const guardSkip = await evaluateQueueDispatchGuards(config, manual);
	if (guardSkip) return guardSkip;

	const dailyLimit = Math.max(
		1,
		Number(config.dailySendLimit || DEFAULT_CONFIG.dailySendLimit),
	);
	const sentToday = await countQueueMessagesSentToday();
	const remainingToday = Math.max(0, dailyLimit - sentToday);
	if (remainingToday <= 0) {
		const nextWindow = getNextSendWindowStart(config);
		nextRunAt = nextWindow
			? nextWindow.toISOString()
			: new Date(Date.now() + 30000).toISOString();
		return skippedQueue(`Limite diario de ${dailyLimit} mensagens atingido.`, {
			dailyLimit,
			sentToday,
			remainingToday,
			nextRunAt,
		});
	}

	const items = await listQueue(2000);
	const batchSize = 1;
	const candidates = items
		.filter((item) => canSendItem(item, config))
		.slice(0, batchSize);
	nextQueueExecutionItem = summarizeQueueExecutionItem(candidates[0]);

	const { sent, failed } = await runQueueDispatchBatch(
		candidates,
		config,
		manual,
		remainingToday,
	);

	if (sent.length) {
		const remainingAfterBatch = Math.max(1, remainingToday - sent.length);
		nextRunAt = new Date(
			Date.now() + calculateQueueDelayMs(config, remainingAfterBatch),
		).toISOString();
	} else if (!manual) {
		nextRunAt = new Date(Date.now() + 30000).toISOString();
	}
	const handledIds = new Set([
		...sent,
		...failed.map((item) => item.id).filter(Boolean),
	]);
	nextQueueExecutionItem = summarizeQueueExecutionItem(
		items.find((item) => !handledIds.has(item.id) && canSendItem(item, config)),
	);

	return {
		ok: true,
		sent: sent.length,
		failed: failed.length,
		sentIds: sent,
		failedItems: failed,
		dailyLimit,
		sentToday: sentToday + sent.length,
		remainingToday: Math.max(0, remainingToday - sent.length),
	};
}

async function sendTestMessage(payload = {}, user = {}) {
	const config = await getConfig();
	const number = normalizePhone(payload.number || payload.telefone);
	if (!number) throw new Error("Informe um telefone valido para teste.");
	const template = await getTemplate(
		payload.templateId || config.activeTemplateId,
	);
	const sample = {
		cliente: payload.cliente || "Cliente Teste",
		codigo_cliente: payload.codigo_cliente || "0000",
		contrato: payload.contrato || "TESTE",
		os: payload.os || "OS-TESTE",
		cidade: payload.cidade || "Cidade Teste",
		regional: payload.regional || "Regional Teste",
		endereco: payload.endereco || "Endereco teste",
		telefone: number,
	};
	const message = renderTemplate(template.conteudo, sample, config);
	const response = await sendWhatsAppMessage(
		withoutEvolutionAutoRetries(config),
		number,
		message,
		sample,
	);
	await createHistory({
		cliente: sample.cliente,
		telefone: number,
		os: sample.os,
		cidade: sample.cidade,
		templateId: template.id,
		mensagem: message,
		status: "enviado",
		origem: `Teste ${getProviderName(config)}`,
		enviadoPor: user?.uid || null,
		evolutionResponse: response.response,
		evolutionMode: response.mode,
		evolutionButtonError: response.buttonError || "",
	});
	broadcastRealtime("mensageria", { action: "test_sent" });
	return { ok: true, number, templateId: template.id, message, response };
}

function startWorker() {
	if (workerTimer) return;
	workerTimer = setInterval(async () => {
		if (workerRunning) return;
		if (nextRunAt && new Date(nextRunAt).getTime() > Date.now()) return;
		workerRunning = true;
		try {
			await processQueueOnce();
		} catch (error) {
			lastError = error?.message || "Falha no worker.";
			console.error("[evolutionMessaging] worker:", error);
		} finally {
			workerRunning = false;
		}
	}, 30000);
}

function wakeQueueWorker() {
	nextRunAt = new Date(Date.now() + 1000).toISOString();
	startWorker();
	setImmediate(async () => {
		if (workerRunning) return;
		workerRunning = true;
		try {
			await processQueueOnce();
		} catch (error) {
			lastError = error?.message || "Falha no worker.";
			console.error("[evolutionMessaging] worker:", error);
		} finally {
			workerRunning = false;
		}
	});
}

function stopWorker() {
	if (!workerTimer) return;
	clearInterval(workerTimer);
	workerTimer = null;
}

function resetNextRunAt() {
	nextRunAt = null;
}

function getStatus() {
	const localParts = getZonedDateParts();
	return {
		workerActive: Boolean(workerTimer),
		workerRunning,
		lastRun,
		lastError,
		lastSkipped,
		nextRunAt,
		lastItem: lastQueueExecutionItem,
		nextItem: nextQueueExecutionItem,
		sendTimeZone: SEND_TIME_ZONE,
		sendLocalTime: `${String(localParts.hour).padStart(2, "0")}:${String(localParts.minute).padStart(2, "0")}:${String(localParts.second).padStart(2, "0")}`,
	};
}

const WEBHOOK_TEXT_KEY_SUFFIXES = [
	"message",
	"body",
	"text",
	"caption",
	"selecteddisplaytext",
	"displaytext",
	"title",
	"description",
];

// Extraido de extractTextFromWebhook (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — antes era uma closure recursiva `visit`
// declarada dentro da funcao (a aninhamento de closure que pesa no score
// de complexidade cognitiva do Sonar); mesma logica de antes, so que
// como funcao de topo-nivel recebendo o array `out` pra empurrar os
// candidatos encontrados.
function collectWebhookTextCandidates(value, key = "", depth = 0, out = []) {
	if (depth > 5 || value === null || value === undefined) return out;
	if (typeof value === "string" || typeof value === "number") {
		const lowerKey = String(key || "").toLowerCase();
		if (
			WEBHOOK_TEXT_KEY_SUFFIXES.some(
				(part) => lowerKey === part || lowerKey.endsWith(part),
			)
		) {
			out.push(String(value));
		}
		return out;
	}
	if (Array.isArray(value)) {
		value.forEach((item) => collectWebhookTextCandidates(item, key, depth + 1, out));
		return out;
	}
	if (typeof value === "object") {
		Object.entries(value).forEach(([innerKey, innerValue]) =>
			collectWebhookTextCandidates(innerValue, innerKey, depth + 1, out),
		);
	}
	return out;
}

function extractTextFromWebhook(payload = {}) {
	const deepCandidates = collectWebhookTextCandidates(payload);
	const candidates = [
		payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body,
		payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.button?.text,
		payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.interactive
			?.button_reply?.title,
		payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.interactive
			?.list_reply?.title,
		payload.text?.message,
		payload.text?.body,
		payload.text?.description,
		payload.text?.title,
		payload.hydratedTemplate?.message,
		payload.hydratedTemplate?.title,
		payload.hydratedTemplate?.footer,
		payload.buttonReply?.message,
		payload.buttonReply?.selectedDisplayText,
		payload.buttonsResponseMessage?.selectedDisplayText,
		payload.listResponseMessage?.title,
		payload.listResponseMessage?.description,
		payload.message?.text,
		payload.message?.body,
		payload.text,
		typeof payload.message === "string" ? payload.message : "",
		payload.message?.conversation,
		payload.message?.extendedTextMessage?.text,
		payload.message?.ephemeralMessage?.message?.conversation,
		payload.message?.ephemeralMessage?.message?.extendedTextMessage?.text,
		payload.body,
		typeof payload.data?.message === "string" ? payload.data.message : "",
		payload.data?.text,
		typeof payload.data?.message?.message === "string"
			? payload.data.message.message
			: "",
		payload.data?.message?.conversation,
		payload.data?.message?.extendedTextMessage?.text,
		payload.data?.message?.ephemeralMessage?.message?.conversation,
		payload.data?.message?.ephemeralMessage?.message?.extendedTextMessage?.text,
		payload.data?.message?.text,
		payload.data?.text?.message,
		payload.data?.message?.text?.message,
		payload.data?.body,
		payload.notification?.message,
		payload.chat?.message,
		payload.data?.pushName && payload.data?.messageText,
		payload.body?.text,
		payload.body?.message,
		...deepCandidates,
	];
	return (
		candidates
			.map((item) =>
				typeof item === "string" || typeof item === "number"
					? String(item).trim()
					: "",
			)
			.find(Boolean) || ""
	);
}

function extractPhoneFromWebhook(payload = {}) {
	const candidates = [
		payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from,
		payload.phone,
		payload.number,
		payload.telephone,
		payload.remoteJid,
		payload.from,
		payload.key?.remoteJid,
		payload.data?.key?.remoteJid,
		payload.data?.remoteJid,
		payload.data?.phone,
		payload.data?.sender,
		payload.data?.fromMe ? "" : payload.data?.participantPhone,
		payload.data?.from,
		payload.sender,
		payload.participantPhone,
		payload.connectedPhone,
	];
	const raw = candidates.map((item) => String(item || "")).find(Boolean) || "";
	return normalizePhone(raw.split("@")[0]);
}

function extractTimestampFromWebhook(payload = {}) {
	const value =
		payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.timestamp ||
		payload.messageTimestamp ||
		payload.timestamp ||
		payload.momment ||
		payload.moment ||
		payload.data?.messageTimestamp ||
		payload.data?.timestamp ||
		payload.data?.momment ||
		payload.data?.moment ||
		payload.data?.message?.messageTimestamp ||
		null;
	const numeric = Number(value);
	if (!numeric || Number.isNaN(numeric)) return nowIso();
	const milliseconds = numeric > 100000000000 ? numeric : numeric * 1000;
	return new Date(milliseconds).toISOString();
}

function extractWebhookMessageId(payload = {}) {
	const candidates = [
		payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id,
		payload.messageId,
		payload.message_id,
		payload.id,
		payload.data?.key?.id,
		payload.key?.id,
		payload.data?.messageId,
		payload.data?.message?.key?.id,
		payload.data?.message?.id,
		payload.data?.id,
	];
	return (
		candidates.map((item) => String(item || "").trim()).find(Boolean) || ""
	);
}

function isOutboundWebhook(payload = {}) {
	return Boolean(
		payload.entry?.[0]?.changes?.[0]?.value?.statuses?.length ||
			payload.fromMe ||
			payload.key?.fromMe ||
			payload.data?.key?.fromMe ||
			payload.data?.fromMe ||
			payload.message?.fromMe ||
			payload.fromApi,
	);
}

function isNonMessageWebhook(payload = {}) {
	const event = String(
		payload.webhookEvent || payload.event || payload.type || "",
	).toLowerCase();
	if (
		event.includes("connection") ||
		event.includes("qrcode") ||
		event.includes("status.instance") ||
		event.includes("deliverycallback") ||
		event.includes("delivery")
	) {
		return true;
	}
	if (
		payload.data?.state &&
		payload.data?.instance &&
		!extractTextFromWebhook(payload)
	)
		return true;
	if (
		payload.status &&
		String(payload.status).toUpperCase() !== "RECEIVED" &&
		!extractTextFromWebhook(payload)
	)
		return true;
	return false;
}

function isAutomationText(text) {
	const value = normalizeText(text);
	return (
		value.startsWith("anotado a informacao") ||
		value.startsWith("agendamento registrado") ||
		value.startsWith("caso ja tenha feito a devolucao") ||
		value.includes("porem eu sou apenas uma automacao") ||
		value.includes("falar com a central")
	);
}

function isDeliveredIntent(text) {
	const value = normalizeText(text);
	if (
		value.includes("nao entreguei") ||
		value.includes("nao devolvi") ||
		value.includes("nao fiz a devolucao")
	) {
		return false;
	}
	return [
		"ja entreguei",
		"ja entregou",
		"entreguei",
		"entreguei ontem",
		"entreguei em loja",
		"devolvi",
		"ja devolvi",
		"devolucao feita",
		"ja fiz a devolucao",
		"entrega em loja",
	].some((term) => value.includes(term));
}

function isYesTypoIntent(value) {
	const compact = normalizeText(value).replace(/[^a-z0-9]/g, "");
	if (!compact || compact.length > 4) return false;
	if (
		["s", "si", "sim", "simm", "sii", "sm", "ss", "sik", "sin"].includes(
			compact,
		)
	)
		return true;
	if (!compact.startsWith("si")) return false;
	return compact.length <= 4;
}

function isPositiveScheduleIntent(text) {
	const value = normalizeText(text);
	if (
		value.includes("nao") ||
		value.includes("sem interesse") ||
		value.includes("nao quero") ||
		value.includes("nao posso")
	) {
		return false;
	}
	if (isYesTypoIntent(value)) return true;
	return [
		"sim",
		"pode",
		"quero",
		"vamos",
		"agendar",
		"pode agendar",
		"ok",
		"confirmo",
		"confirmado",
	].some((term) => value === term || value.includes(term));
}

async function findDuplicateCallback({
	phone,
	mensagem,
	webhookMessageId,
	recebidoEm,
	allowTextMatch = true,
}) {
	const phoneDigits = normalizePhone(phone);
	const text = normalizeText(mensagem);
	const eventId = String(webhookMessageId || "").trim();
	if (!phoneDigits && !eventId) return null;
	const callbacks = await listCallbacks(500);
	return (
		callbacks.find((callback) => {
			if (eventId && String(callback.webhook_message_id || "") === eventId)
				return true;
			if (!allowTextMatch) return false;
			if (!phoneDigits || !text) return false;
			if (!phonesMatch(callback.telefone, phoneDigits)) return false;
			if (normalizeText(callback.mensagem) !== text) return false;
			const callbackDate = new Date(
				callback.recebido_em || callback.criado_em || callback.criadoEm || "",
			);
			const eventDate = new Date(recebidoEm || "");
			if (
				Number.isNaN(callbackDate.getTime()) ||
				Number.isNaN(eventDate.getTime())
			)
				return true;
			return (
				Math.abs(callbackDate.getTime() - eventDate.getTime()) <= 10 * 60 * 1000
			);
		}) || null
	);
}

function isGroupWebhook(payload = {}) {
	const remoteJid = String(
		payload.key?.remoteJid ||
			payload.data?.key?.remoteJid ||
			payload.remoteJid ||
			payload.data?.remoteJid ||
			payload.chatId ||
			payload.data?.chatId ||
			"",
	);
	return remoteJid.includes("@g.us") || remoteJid.startsWith("120363");
}

// Extraido de parseScheduleFromText (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — so agrupa os 3 regex.match (data completa,
// so-o-dia, horario), mesma logica/ordem de antes.
function matchScheduleDateAndTime(value) {
	const dateMatch = value.match(/(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/);
	const dayOnlyMatch = dateMatch
		? null
		: value.match(/\b(?:dia|data|para\s+dia|no\s+dia)\s+(\d{1,2})\b/i);
	const valueWithoutDate = value.replace(
		dateMatch?.[0] || dayOnlyMatch?.[0] || "",
		" ",
	);
	const timeMatch =
		valueWithoutDate.match(
			/(?:\b(?:às|as|a|para|por volta de)\s*)?(\d{1,2})\s*[:h]\s*(\d{2})\b/i,
		) ||
		valueWithoutDate.match(
			/\b(?:às|as|a|para|por volta de)\s*(\d{1,2})(?:\s*(?:h|horas?))?\b/i,
		) ||
		valueWithoutDate.match(/\b(\d{1,2})\s*h(?:oras?)?\b/i);
	return { dateMatch, dayOnlyMatch, timeMatch };
}

function resolveTodayParts(baseDate) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: SEND_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	})
		.formatToParts(baseDate)
		.reduce((acc, part) => {
			if (part.type !== "literal") acc[part.type] = part.value;
			return acc;
		}, {});
}

// So entra quando o texto trouxe so o dia (sem mes/ano, ex.: "dia 5") e a
// data resultante nesse mes ja passou: joga pro mesmo dia do proximo mes,
// mesma logica de antes. Fora desse caso devolve year/month/day intactos;
// devolve null so quando o dia nao existir no mes seguinte (ex.: dia 31
// num mes de 30 dias), igual ao original.
function rollDayOnlyMatchToNextMonthIfPast(date, { year, month, day, requestedDay, baseDate }) {
	const today = getSaoPauloDate(baseDate);
	if (dateKeyFromDate(date) >= dateKeyFromDate(today)) return { date, year, month, day };
	const rolled = new Date(year, month, day);
	if (rolled.getDate() !== requestedDay) return null;
	return {
		date: rolled,
		day: rolled.getDate(),
		month: rolled.getMonth() + 1,
		year: rolled.getFullYear(),
	};
}

function parseScheduleFromText(text, baseDate = new Date()) {
	const value = String(text || "");
	const { dateMatch, dayOnlyMatch, timeMatch } = matchScheduleDateAndTime(value);
	if (!dateMatch && !dayOnlyMatch) return null;

	const todayParts = resolveTodayParts(baseDate);
	const requestedDay = Number(dateMatch?.[1] || dayOnlyMatch?.[1]);
	let day = requestedDay;
	let month = dateMatch ? Number(dateMatch[2]) : Number(todayParts.month);
	const rawYear = dateMatch?.[3] ? Number(dateMatch[3]) : Number(todayParts.year);
	let year = rawYear < 100 ? 2000 + rawYear : rawYear;
	const hourNumber = timeMatch ? Number(timeMatch[1]) : null;
	const minuteNumber = timeMatch ? Number(timeMatch[2] || 0) : null;
	if (
		hourNumber !== null &&
		(hourNumber < 0 || hourNumber > 23 || minuteNumber < 0 || minuteNumber > 59)
	)
		return null;

	let date = new Date(year, month - 1, day);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	)
		return null;

	if (dayOnlyMatch) {
		const rolled = rollDayOnlyMatchToNextMonthIfPast(date, {
			year,
			month,
			day,
			requestedDay,
			baseDate,
		});
		if (!rolled) return null;
		({ date, year, month, day } = rolled);
	}

	const hour = timeMatch ? String(hourNumber).padStart(2, "0") : "";
	const minute = timeMatch ? String(minuteNumber).padStart(2, "0") : "";
	return {
		date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
		time: hour && minute ? `${hour}:${minute}` : "",
	};
}

function parseShortDateKey(value, baseDate = new Date()) {
	const normalized = String(value || "").trim();
	const match = normalized.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
	if (!match) return "";
	const day = Number(match[1]);
	const month = Number(match[2]);
	const todayParts = new Intl.DateTimeFormat("en-CA", {
		timeZone: SEND_TIME_ZONE,
		year: "numeric",
	})
		.formatToParts(baseDate)
		.reduce((acc, part) => {
			if (part.type !== "literal") acc[part.type] = part.value;
			return acc;
		}, {});
	const rawYear = match[3] ? Number(match[3]) : Number(todayParts.year);
	const year = rawYear < 100 ? 2000 + rawYear : rawYear;
	const date = new Date(year, month - 1, day);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return "";
	}
	return dateKeyFromDate(date);
}

function getSaoPauloDate(value = new Date()) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: SEND_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	})
		.formatToParts(value)
		.reduce((acc, part) => {
			if (part.type !== "literal") acc[part.type] = part.value;
			return acc;
		}, {});
	return new Date(
		Number(parts.year),
		Number(parts.month) - 1,
		Number(parts.day),
	);
}

function getSaoPauloDateKey(value = new Date()) {
	return dateKeyFromDate(getSaoPauloDate(value));
}

function getSaoPauloMinutes(value = new Date()) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: SEND_TIME_ZONE,
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	})
		.formatToParts(value)
		.reduce((acc, part) => {
			if (part.type !== "literal") acc[part.type] = part.value;
			return acc;
		}, {});
	return Number(parts.hour || 0) * 60 + Number(parts.minute || 0);
}

function dateKeyFromDate(date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateKeyFromValue(value) {
	if (!value) return "";
	if (value instanceof Date) return dateKeyFromDate(getSaoPauloDate(value));
	if (typeof value === "object") {
		return dateKeyFromValue(value.value || value.date || value.data || value.key);
	}
	const normalized = String(value || "").trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
	const shortDateKey = parseShortDateKey(normalized);
	if (shortDateKey) return shortDateKey;
	const date = new Date(normalized);
	return Number.isNaN(date.getTime()) ? "" : dateKeyFromDate(getSaoPauloDate(date));
}

function formatDateLabel(dateKey, { withWeekday = false } = {}) {
	const normalizedDateKey = dateKeyFromValue(dateKey);
	const [year, month, day] = String(normalizedDateKey || "")
		.split("-")
		.map(Number);
	const date = new Date(Date.UTC(year, month - 1, day, 12));
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleDateString("pt-BR", {
		timeZone: SEND_TIME_ZONE,
		...(withWeekday ? { weekday: "long" } : {}),
		day: "2-digit",
		month: "2-digit",
	});
}

async function incrementAutomaticScheduleMetrics(schedule = {}, item = {}) {
	const dateKey = dateKeyFromValue(schedule.date);
	if (!dateKey) return;
	const month = dateKey.slice(0, 7);
	const metricData =
		(await agendamentosRepository.getPipelineMetrics(month)) || { mes: month };
	const userKey = safeKey(AUTOMATION_ATTENDANT_ID);
	const cityKey = safeKey(item?.cidade);
	await agendamentosRepository.savePipelineMetrics(month, {
			...metricData,
			mes: month,
			agendamentos: Number(metricData.agendamentos || 0) + 1,
			agendamentos_por_usuario: {
				...(metricData.agendamentos_por_usuario || {}),
				[userKey]:
					Number(metricData.agendamentos_por_usuario?.[userKey] || 0) + 1,
			},
			agendamentos_por_cidade: {
				...(metricData.agendamentos_por_cidade || {}),
				[cityKey]:
					Number(metricData.agendamentos_por_cidade?.[cityKey] || 0) + 1,
			},
			usuarios: {
				...(metricData.usuarios || {}),
				[userKey]: AUTOMATION_ATTENDANT_NAME,
			},
			cidades: {
				...(metricData.cidades || {}),
				[cityKey]: item?.cidade || "",
			},
			atualizado_em: nowIso(),
	});
}

function getGuidedDateOptions(baseDate = new Date()) {
	const localDate = getSaoPauloDate(baseDate);
	const first = new Date(localDate);
	if (getSaoPauloMinutes(baseDate) >= 15 * 60) {
		first.setDate(first.getDate() + 1);
	}
	const second = new Date(first);
	second.setDate(second.getDate() + 1);
	const saturday = new Date(localDate);
	const daysUntilSaturday = (6 - saturday.getDay() + 7) % 7 || 7;
	saturday.setDate(saturday.getDate() + daysUntilSaturday);
	while (dateKeyFromDate(saturday) <= dateKeyFromDate(second)) {
		saturday.setDate(saturday.getDate() + 7);
	}
	return [
		{
			key: "1",
			date: dateKeyFromDate(first),
			label: formatDateLabel(dateKeyFromDate(first)),
		},
		{
			key: "2",
			date: dateKeyFromDate(second),
			label: formatDateLabel(dateKeyFromDate(second)),
		},
		{
			key: "3",
			date: dateKeyFromDate(saturday),
			label: formatDateLabel(dateKeyFromDate(saturday), { withWeekday: true }),
		},
	];
}

function hasCurrentGuidedDateOptions(options = [], baseDate = new Date()) {
	if (!Array.isArray(options) || !options.length) return false;
	const current = getGuidedDateOptions(baseDate);
	return current.every((expected) => {
		const received = options.find((option) => String(option.key) === expected.key);
		return dateKeyFromValue(received?.date) === expected.date;
	});
}

function getReusableGuidedDateOptions(conversation = {}, baseDate = new Date()) {
	return hasCurrentGuidedDateOptions(conversation.dateOptions, baseDate)
		? conversation.dateOptions
		: getGuidedDateOptions(baseDate);
}

function renderGuidedDateOptions(options = []) {
	return [
		...options.map((option) => `${option.key} - ${option.label}`),
		"4 - Outra data",
	].join("\n");
}

function parseGuidedDateChoice(text, conversation = {}) {
	const value = normalizeText(text);
	const options = getReusableGuidedDateOptions(conversation);
	const schedule = parseScheduleFromText(text);
	if (schedule?.date) return schedule.date;
	const dayOnly = String(text || "").trim();
	if (/^0\d$/.test(dayOnly)) {
		const daySchedule = parseScheduleFromText(`dia ${dayOnly}`);
		if (daySchedule?.date) return daySchedule.date;
	}
	const selected = options.find(
		(option) => value === option.key || value.includes(`opcao ${option.key}`),
	);
	if (selected?.date) return selected.date;
	if (value === "4" || value.includes("outra")) return "other";
	return null;
}

function parseGuidedTimeChoice(text) {
	const value = normalizeText(text);
	if (value === "1" || value.includes("09") || value.includes("9h"))
		return "09:00";
	if (value === "2" || value.includes("12") || value.includes("meio dia"))
		return "12:00";
	if (value === "3" || value.includes("16") || value.includes("4 da tarde"))
		return "16:00";
	if (value === "4" || value.includes("outro")) return "other";
	const timeMatch =
		String(text || "").match(/\b(\d{1,2})\s*[:h]\s*(\d{2})\b/i) ||
		String(text || "").match(/\b(\d{1,2})\s*h(?:oras?)?\b/i) ||
		String(text || "").match(/\b(\d{1,2})\b/);
	if (!timeMatch) return null;
	const hour = Number(timeMatch[1]);
	const minute = Number(timeMatch[2] || 0);
	if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
	return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getConversationId(phone) {
	return normalizePhone(phone) || "";
}

async function getScheduleConversation(phone) {
	const id = getConversationId(phone);
	if (!id) return null;
	return mensageriaRepository.getScheduleConversation(id);
}

async function saveScheduleConversation(phone, data = {}) {
	const id = getConversationId(phone);
	if (!id) return null;
	const current = await getScheduleConversation(phone);
	const next = {
		...(current || {}),
		...data,
		id,
		telefone: id,
		atualizado_em: nowIso(),
	};
	return mensageriaRepository.upsertScheduleConversation(id, next);
}

async function clearScheduleConversation(phone, patch = {}) {
	const current = await getScheduleConversation(phone);
	if (!current) return null;
	return saveScheduleConversation(phone, {
		...patch,
		stage: "completed",
		completedAt: nowIso(),
	});
}

async function findQueueItemForCallback({ phone, codigoCliente, cliente }) {
	const queue = await listQueue(500);
	const phoneDigits = normalizePhone(phone);
	const code = String(codigoCliente || "").trim();
	const name = normalizeText(cliente);
	return (
		queue.find((item) => {
			if (code && String(item.codigo_cliente || "") === code) return true;
			if (phoneDigits && phonesMatch(item.telefone, phoneDigits)) return true;
			if (name && normalizeText(item.cliente).includes(name)) return true;
			return false;
		}) || null
	);
}

async function findHistoryItemForCallback({ phone, codigoCliente, cliente }) {
	const history = await listHistory(1000);
	const phoneDigits = normalizePhone(phone);
	const code = String(codigoCliente || "").trim();
	const name = normalizeText(cliente);
	return (
		history
			.filter(
				(item) =>
					String(item.status || "") === "enviado" &&
					!isAutomaticReplyHistoryItem(item),
			)
			.sort((a, b) =>
				String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")),
			)
			.find((item) => {
				if (code && String(item.codigo_cliente || "") === code) return true;
				if (phoneDigits && phonesMatch(item.telefone, phoneDigits)) return true;
				if (name && normalizeText(item.cliente).includes(name)) return true;
				return false;
			}) || null
	);
}

function isAutomaticReplyHistoryItem(item = {}) {
	const origem = normalizeText(item.origem);
	return origem.startsWith("resposta automatica");
}

function getMessageTimestamp(item = {}) {
	const value =
		item.criadoEm?.value ||
		item.criadoEm ||
		item.criado_em?.value ||
		item.criado_em ||
		item.ultimoEnvioEm?.value ||
		item.ultimoEnvioEm ||
		item.atualizadoEm?.value ||
		item.atualizadoEm ||
		"";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isRecentTestHistoryItem(item = {}, maxAgeMs = 6 * 60 * 60 * 1000) {
	if (!item) return false;
	const origem = normalizeText(item.origem);
	if (!origem.startsWith("teste ")) return false;
	const timestamp = getMessageTimestamp(item);
	return Boolean(timestamp && Date.now() - timestamp <= maxAgeMs);
}

function toCallbackHistoryItem(item = {}) {
	const { id, ...data } = item;
	return {
		...data,
		historicoId: id || item.historicoId || "",
	};
}

function chooseCallbackItem(queueItem, historyItem) {
	if (isRecentTestHistoryItem(historyItem))
		return toCallbackHistoryItem(historyItem);
	return queueItem || historyItem || null;
}

async function createAppointmentFromCallback(item, schedule, callbackId) {
	const id = randomId("wa");
	const createdAt = nowIso();
	const scheduleDate = dateKeyFromValue(schedule.date);
	const appointmentData = {
		tecnico_nome: item?.tecnico || "A definir",
		codigo_cliente: String(item?.codigo_cliente || ""),
		cliente_nome: item?.cliente || "",
		cidade: item?.cidade || "",
		data: scheduleDate,
		turno:
			schedule.time && Number(schedule.time.slice(0, 2)) >= 12
				? "Tarde"
				: "Manha",
		hora: schedule.time || "",
		status: "Aguardando dia",
		observacao: `Agendado automaticamente via WhatsApp. O.S: ${item?.os || "-"}. Callback: ${callbackId}.`,
		origem: "evolution_whatsapp",
		os: item?.os || "",
		telefone: item?.telefone || "",
		atendente_id: AUTOMATION_ATTENDANT_ID,
		atendente_nome: AUTOMATION_ATTENDANT_NAME,
		agendado_por_id: AUTOMATION_ATTENDANT_ID,
		agendado_por_nome: AUTOMATION_ATTENDANT_NAME,
		criado_por_id: AUTOMATION_ATTENDANT_ID,
		criado_por_nome: AUTOMATION_ATTENDANT_NAME,
		usuario_id: AUTOMATION_ATTENDANT_ID,
		usuario_nome: AUTOMATION_ATTENDANT_NAME,
		criado_em: createdAt,
		atualizado_em: createdAt,
	};

	await agendamentosRepository.createAppointment(appointmentData, { id });
	broadcastRealtime("acompanhamento", {
		action: "upsert",
		collectionPath: APPOINTMENT_COLLECTION,
		documentId: id,
		data: appointmentData,
		eventType: "agendamento_upsert",
	});
	notificationsService
		.createNotification({
			type: "whatsapp_agendamento_auto",
			title: "Agendamento automático",
			message: `${AUTOMATION_ATTENDANT_NAME} agendou ${item?.cliente || "cliente"} para ${formatDateLabel(
				scheduleDate,
			)} ${schedule.time || ""}.`,
			targetPath: "/agendamentos",
			severity: "success",
			user: {
				uid: AUTOMATION_ATTENDANT_ID,
				nome: AUTOMATION_ATTENDANT_NAME,
			},
			targets: {
				roles: ["admin", "backoffice_retirada", "supervisor"],
			},
			meta: {
				agendamentoId: id,
				callbackId,
				telefone: item?.telefone || "",
				os: item?.os || "",
				cliente: item?.cliente || "",
				cidade: item?.cidade || "",
				data: scheduleDate,
				hora: schedule.time || "",
			},
		})
		.catch((error) => {
			console.warn(
				"[evolution] Falha ao criar notificacao de agendamento:",
				error?.message || error,
			);
		});
	await incrementAutomaticScheduleMetrics({ ...schedule, date: scheduleDate }, item).catch(
		(error) => {
			console.warn(
				"[evolution] Falha ao contabilizar agendamento automatico:",
				error?.message || error,
			);
		},
	);
	return id;
}

async function sendConfiguredAutoReply(
	config,
	phone,
	item = {},
	messageTemplate = "",
) {
	const number = normalizePhone(phone || item?.telefone);
	if (!number) return null;
	const message = renderTemplate(messageTemplate, item, config);
	const response = await sendWhatsAppMessage(
		withoutEvolutionAutoRetries(config),
		number,
		message,
		{
			...item,
			telefone: number,
		},
	);
	await createHistory({
		cliente: item?.cliente || "",
		telefone: number,
		os: item?.os || "",
		cidade: item?.cidade || "",
		mensagem: message,
		status: "enviado",
		origem: "Resposta automatica",
		filaId: item?.id || "",
		evolutionMode: response.mode,
		evolutionButtonError: response.buttonError || "",
		evolutionResponse: response.response,
	});
	return response;
}

async function startGuidedScheduleFlow(config, phone, item = {}) {
	const options = getGuidedDateOptions();
	const message = renderTemplate(
		config.guidedScheduleDateMessage ||
			DEFAULT_CONFIG.guidedScheduleDateMessage,
		{
			...item,
			opcoes_datas: renderGuidedDateOptions(options),
		},
		config,
	);
	await saveScheduleConversation(phone, {
		stage: "awaiting_date",
		item,
		dateOptions: options,
		startedAt: nowIso(),
		lastMessageAt: nowIso(),
	});
	return sendConfiguredAutoReply(config, phone, item, message);
}

async function resendGuidedDateOptions(
	config,
	phone,
	item = {},
	conversation = {},
) {
	const options = getReusableGuidedDateOptions(conversation);
	const message = renderTemplate(
		config.guidedScheduleDateMessage ||
			DEFAULT_CONFIG.guidedScheduleDateMessage,
		{
			...item,
			opcoes_datas: renderGuidedDateOptions(options),
		},
		config,
	);
	await saveScheduleConversation(phone, {
		stage: "awaiting_date",
		item,
		dateOptions: options,
		lastMessageAt: nowIso(),
	});
	return sendConfiguredAutoReply(config, phone, item, message);
}

function renderInvalidDateMessage(config, conversation = {}) {
	const options = getReusableGuidedDateOptions(conversation);
	const template =
		config.guidedScheduleInvalidDateMessage ||
		DEFAULT_CONFIG.guidedScheduleInvalidDateMessage;
	const message = renderTemplate(
		template,
		{
			opcoes_datas: renderGuidedDateOptions(options),
		},
		config,
	);
	if (String(template).includes("{opcoes_datas}")) return message;
	return `${message}\n\n${renderGuidedDateOptions(options)}`;
}

function renderInvalidTimeMessage(config, conversation = {}) {
	const template =
		config.guidedScheduleInvalidTimeMessage ||
		DEFAULT_CONFIG.guidedScheduleInvalidTimeMessage;
	const fallbackOptions = "1 - 09h\n2 - 12h\n3 - 16h\n4 - Outro horário";
	const message = renderTemplate(
		template,
		{
			data_agendamento: formatDateLabel(conversation.selectedDate),
		},
		config,
	);
	if (
		String(template).includes("1 - 09h") ||
		String(template).includes("1 - 9h")
	)
		return message;
	return `${message}\n\n${fallbackOptions}`;
}

function validateScheduleDateWindow(schedule, now = new Date()) {
	const dateKey = String(schedule?.date || "");
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return { ok: true };
	const todayKey = getSaoPauloDateKey(now);
	if (dateKey < todayKey) {
		return {
			ok: false,
			status: "data_anterior",
			motivo: "Cliente informou data anterior ao dia atual.",
			templateKey: "replyPastScheduleDateMessage",
		};
	}
	if (dateKey === todayKey && getSaoPauloMinutes(now) >= 15 * 60) {
		return {
			ok: false,
			status: "mesmo_dia_apos_limite",
			motivo: "Cliente tentou agendar para o mesmo dia apos 15h.",
			templateKey: "replySameDayAfterCutoffMessage",
		};
	}
	return { ok: true };
}

async function rejectScheduleDate(
	config,
	phone,
	item = {},
	schedule = {},
	validation = {},
) {
	const activeConversation = await getScheduleConversation(phone);
	if (activeConversation) {
		await saveScheduleConversation(phone, {
			stage: "awaiting_date",
			selectedDate: "",
			lastMessageAt: nowIso(),
		});
	}
	const template =
		config[validation.templateKey] || DEFAULT_CONFIG[validation.templateKey];
	const response = await sendConfiguredAutoReply(
		config,
		phone,
		{
			...item,
			data_agendamento:
				formatDateLabel(schedule.date) || String(schedule.date || ""),
			hora_agendamento: schedule.time || "",
		},
		template,
	);
	return {
		scheduleRejected: true,
		status: validation.status || "data_invalida",
		motivo: validation.motivo || "Data de agendamento invalida.",
		schedule,
		respostaAutomatica: response,
	};
}

// Extraido de continueGuidedScheduleFlow (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — passo "aguardando data" do fluxo guiado de
// agendamento, mesma logica de antes (mesmo `if` original, devolvendo
// null quando o estagio nao e esse).
async function handleGuidedDateStage(config, phone, conversationItem, conversation, mensagem) {
	if (conversation.stage === "awaiting_date") {
		if (isPositiveScheduleIntent(mensagem)) {
			return resendGuidedDateOptions(
				config,
				phone,
				conversationItem,
				conversation,
			);
		}
		const selectedDate = parseGuidedDateChoice(mensagem, conversation);
		if (selectedDate === "other") {
			return sendConfiguredAutoReply(
				config,
				phone,
				conversationItem,
				"Sem problema. Responda com a data desejada. Exemplo: 25/08.",
			);
		}
		if (!selectedDate) {
			return sendConfiguredAutoReply(
				config,
				phone,
				conversationItem,
				renderInvalidDateMessage(config, conversation),
			);
		}
		const dateValidation = validateScheduleDateWindow({ date: selectedDate });
		if (!dateValidation.ok) {
			return rejectScheduleDate(
				config,
				phone,
				conversationItem,
				{ date: selectedDate, time: "" },
				dateValidation,
			);
		}
		await saveScheduleConversation(phone, {
			stage: "awaiting_time",
			item: conversationItem,
			selectedDate,
			lastMessageAt: nowIso(),
		});
		return sendConfiguredAutoReply(
			config,
			phone,
			{
				...conversationItem,
				data_agendamento: formatDateLabel(selectedDate),
			},
			config.guidedScheduleTimeMessage ||
				DEFAULT_CONFIG.guidedScheduleTimeMessage,
		);
	}
	return null;
}

// Extraido de continueGuidedScheduleFlow (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — passo "aguardando horario" do fluxo guiado de
// agendamento, mesma logica de antes.
async function handleGuidedTimeStage(config, phone, conversationItem, conversation, mensagem, callbackId) {
	const selectedTime = parseGuidedTimeChoice(mensagem);
	if (!selectedTime && isPositiveScheduleIntent(mensagem)) {
		return sendConfiguredAutoReply(
			config,
			phone,
			{
				...conversationItem,
				data_agendamento: formatDateLabel(conversation.selectedDate),
			},
			config.guidedScheduleTimeMessage ||
				DEFAULT_CONFIG.guidedScheduleTimeMessage,
		);
	}
	if (selectedTime === "other") {
		return sendConfiguredAutoReply(
			config,
			phone,
			conversationItem,
			"Claro. Responda com o horário desejado. Exemplo: 14:30.",
		);
	}
	if (!selectedTime) {
		return sendConfiguredAutoReply(
			config,
			phone,
			conversationItem,
			renderInvalidTimeMessage(config, conversation),
		);
	}
	const schedule = {
		date: conversation.selectedDate,
		time: selectedTime,
	};
	const dateValidation = validateScheduleDateWindow(schedule);
	if (!dateValidation.ok) {
		return rejectScheduleDate(
			config,
			phone,
			conversationItem,
			schedule,
			dateValidation,
		);
	}
	const agendamentoId = await createAppointmentFromCallback(
		conversationItem,
		schedule,
		callbackId,
	);
	if (conversationItem?.id) {
		await upsertQueueItem(conversationItem.id, {
			...conversationItem,
			status: "agendado",
			agendamento_id: agendamentoId,
			respostaCliente: mensagem,
			ultimaRespostaCliente: mensagem,
			ultimaRespostaClienteEm: nowIso(),
			atualizadoEm: nowIso(),
		});
	}
	await clearScheduleConversation(phone, { agendamentoId, schedule });
	let confirmation = null;
	let confirmationError = "";
	try {
		confirmation = await sendConfiguredAutoReply(
			config,
			phone,
			{
				...conversationItem,
				data_agendamento: formatDateLabel(schedule.date),
				hora_agendamento: schedule.time || "",
			},
			config.replyScheduledConfirmationMessage ||
				DEFAULT_CONFIG.replyScheduledConfirmationMessage,
		);
	} catch (error) {
		confirmationError = String(error?.message || error);
	}
	return {
		agendamentoId,
		schedule,
		respostaAutomatica: confirmation,
		respostaAutomaticaErro: confirmationError,
	};

}

async function continueGuidedScheduleFlow(
	config,
	phone,
	item = {},
	mensagem = "",
	callbackId = "",
) {
	const conversation = await getScheduleConversation(phone);
	if (
		!conversation ||
		!["awaiting_date", "awaiting_time"].includes(
			String(conversation.stage || ""),
		)
	) {
		return null;
	}
	const conversationItem = conversation.item || item || {};
	const dateStageResult = await handleGuidedDateStage(
		config,
		phone,
		conversationItem,
		conversation,
		mensagem,
	);
	if (dateStageResult) return dateStageResult;
	return handleGuidedTimeStage(
		config,
		phone,
		conversationItem,
		conversation,
		mensagem,
		callbackId,
	);
}


async function sendHumanSupportAutoReply(config, phone, item = {}) {
	const number = normalizePhone(phone || item?.telefone);
	if (!number) return null;
	const message =
		config.replyAfterScheduledMessage ||
		DEFAULT_CONFIG.replyAfterScheduledMessage;
	const response = await sendWhatsAppMessage(
		withoutEvolutionAutoRetries(config),
		number,
		message,
		{
			...item,
			telefone: number,
		},
	);
	await createHistory({
		cliente: item?.cliente || "",
		telefone: number,
		os: item?.os || "",
		cidade: item?.cidade || "",
		mensagem: message,
		status: "enviado",
		origem: "Resposta automática",
		filaId: item?.id || "",
		evolutionMode: response.mode,
		evolutionButtonError: response.buttonError || "",
		evolutionResponse: response.response,
	});
	return response;
}

// Extraido de registerCallback (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — evento de conexao/desconexao da Evolution,
// mesma logica de antes (mesmo `if` original, devolvendo null quando nao
// se aplica em vez de cair no restante do fluxo de callback).
async function handleConnectionEventCallback(payload) {
	if (isEvolutionConnectionEvent(payload)) {
		const state = extractConnectionState(payload);
		if (isDisconnectedConnectionState(state)) {
			const config = await getConfig();
			const log = await pauseQueueForDisconnectedEvolution({
				config,
				payload,
				source: "webhook",
				reason: extractDisconnectReason(
					payload,
					"Número desconectado pela Evolution.",
				),
			});
			return {
				ok: true,
				ignored: true,
				paused: true,
				status: "evolution_disconnected",
				logId: log?.id || "",
				reason: log?.reason || "",
			};
		}
		return {
			ok: true,
			ignored: true,
			reason: "Evento de conexão sem queda.",
			status: "connection_update",
			state,
		};
	}
	return null;
}

// Extraido de registerCallback (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — classificacao da resposta do cliente (fluxo
// guiado, "ja devolvi", sem match, pos-agendamento, sem data, data
// invalida ou agendamento confirmado), mesma cadeia if/else if de antes,
// sem mudanca de comportamento.
// Extraido de classifyCallbackResponse (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — cada ramo da cadeia if/else-if original virou
// um classificador dedicado, mesma logica e mesma ordem de avaliacao
// (curto-circuito if/return em vez de if/else-if, comportamento
// identico), todos devolvendo o mesmo shape { status, agendamentoId,
// motivo, respostaAutomatica }.

function classifyGuidedResult(guidedResult) {
	const status =
		guidedResult.status ||
		(guidedResult.agendamentoId ? "agendado" : "fluxo_agendamento");
	let motivo =
		guidedResult.motivo ||
		(guidedResult.agendamentoId
			? "Agendamento criado pelo fluxo guiado."
			: "Fluxo guiado de agendamento em andamento.");
	if (guidedResult.respostaAutomaticaErro) {
		motivo = `${motivo} Confirmacao automatica falhou: ${guidedResult.respostaAutomaticaErro}`;
	}
	return {
		status,
		agendamentoId: guidedResult.agendamentoId || null,
		motivo,
		respostaAutomatica: guidedResult.respostaAutomatica || guidedResult,
	};
}

function classifyGuidedError(guidedError, hasActiveGuidedConversation) {
	return {
		status: hasActiveGuidedConversation ? "fluxo_agendamento_erro" : "erro",
		agendamentoId: null,
		motivo: `Falha no fluxo guiado: ${guidedError}`,
		respostaAutomatica: null,
	};
}

async function classifyDeliveredIntent(config, telefone, item) {
	let motivo = "Cliente informou que ja realizou a devolucao.";
	let respostaAutomatica = null;
	try {
		respostaAutomatica = await sendConfiguredAutoReply(
			config,
			telefone,
			item || { telefone },
			config.replyDeliveredMessage || DEFAULT_CONFIG.replyDeliveredMessage,
		);
	} catch (error) {
		motivo = `${motivo} Resposta automatica falhou: ${String(error?.message || error)}`;
	}
	return { status: "devolucao_informada", agendamentoId: null, motivo, respostaAutomatica };
}

async function classifyMissingItem(config, telefone) {
	let motivo = "Nao foi encontrada O.S/fila pelo telefone, codigo ou nome.";
	let respostaAutomatica = null;
	try {
		respostaAutomatica = await sendConfiguredAutoReply(
			config,
			telefone,
			{ telefone },
			config.replyUnmatchedMessage || DEFAULT_CONFIG.replyUnmatchedMessage,
		);
	} catch (error) {
		motivo = `${motivo} Resposta automatica falhou: ${String(error?.message || error)}`;
	}
	return { status: "cliente_nao_localizado", agendamentoId: null, motivo, respostaAutomatica };
}

async function classifyPostScheduleReply(config, telefone, item) {
	let motivo =
		"Cliente respondeu novamente apos agendamento. Encaminhado para a central.";
	let respostaAutomatica = null;
	try {
		respostaAutomatica = await sendHumanSupportAutoReply(config, telefone, item);
	} catch (error) {
		motivo = `${motivo} Resposta automatica falhou: ${String(error?.message || error)}`;
	}
	return { status: "resposta_pos_agendamento", agendamentoId: null, motivo, respostaAutomatica };
}

async function classifyGuidedScheduleAccepted(config, telefone, item) {
	let motivo = "Cliente aceitou agendar. Opcoes de data enviadas.";
	let respostaAutomatica = null;
	try {
		respostaAutomatica = await startGuidedScheduleFlow(config, telefone, item);
	} catch (error) {
		motivo = `${motivo} Resposta automatica falhou: ${String(error?.message || error)}`;
	}
	return { status: "fluxo_agendamento", agendamentoId: null, motivo, respostaAutomatica };
}

async function classifyMissingScheduleReply(config, telefone, item) {
	let motivo = "Resposta recebida sem data valida.";
	let respostaAutomatica = null;
	try {
		respostaAutomatica = await sendConfiguredAutoReply(
			config,
			telefone,
			item,
			config.replyNoScheduleMessage || DEFAULT_CONFIG.replyNoScheduleMessage,
		);
	} catch (error) {
		motivo = `${motivo} Resposta automatica falhou: ${String(error?.message || error)}`;
	}
	return { status: "sem_data_horario", agendamentoId: null, motivo, respostaAutomatica };
}

async function classifyNoSchedule(config, telefone, item, mensagem) {
	if (config.guidedScheduleEnabled !== false && isPositiveScheduleIntent(mensagem)) {
		return classifyGuidedScheduleAccepted(config, telefone, item);
	}
	return classifyMissingScheduleReply(config, telefone, item);
}

async function classifyScheduleRejected(config, telefone, item, schedule, dateValidation) {
	let motivo = dateValidation.motivo;
	let respostaAutomatica = null;
	try {
		const rejected = await rejectScheduleDate(
			config,
			telefone,
			item,
			schedule,
			dateValidation,
		);
		respostaAutomatica = rejected.respostaAutomatica;
	} catch (error) {
		motivo = `${motivo} Resposta automatica falhou: ${String(error?.message || error)}`;
	}
	return { status: dateValidation.status, agendamentoId: null, motivo, respostaAutomatica };
}

async function classifyScheduleAccepted(config, telefone, item, schedule, callbackId, queueItem, mensagem) {
	const agendamentoId = await createAppointmentFromCallback(item, schedule, callbackId);
	if (queueItem?.id) {
		await upsertQueueItem(queueItem.id, {
			...queueItem,
			status: "agendado",
			agendamento_id: agendamentoId,
			respostaCliente: mensagem,
			ultimaRespostaCliente: mensagem,
			ultimaRespostaClienteEm: nowIso(),
			atualizadoEm: nowIso(),
		});
	}
	let motivo = "";
	let respostaAutomatica = null;
	try {
		respostaAutomatica = await sendConfiguredAutoReply(
			config,
			telefone,
			{
				...item,
				data_agendamento: formatDateLabel(schedule.date),
				hora_agendamento: schedule.time || "",
			},
			config.replyScheduledConfirmationMessage ||
				DEFAULT_CONFIG.replyScheduledConfirmationMessage,
		);
	} catch (error) {
		motivo = `Agendamento criado, mas confirmacao automatica falhou: ${String(error?.message || error)}`;
	}
	return { status: "agendado", agendamentoId, motivo, respostaAutomatica };
}

async function classifyWithSchedule(config, telefone, item, schedule, callbackId, queueItem, mensagem) {
	const dateValidation = validateScheduleDateWindow(schedule);
	if (!dateValidation.ok) {
		return classifyScheduleRejected(config, telefone, item, schedule, dateValidation);
	}
	return classifyScheduleAccepted(config, telefone, item, schedule, callbackId, queueItem, mensagem);
}

async function classifyCallbackResponse({
	guidedResult,
	guidedError,
	hasActiveGuidedConversation,
	mensagem,
	config,
	telefone,
	item,
	schedule,
	queueItem,
	callbackId,
}) {
	if (guidedResult) return classifyGuidedResult(guidedResult);
	if (guidedError) return classifyGuidedError(guidedError, hasActiveGuidedConversation);
	if (isDeliveredIntent(mensagem)) return classifyDeliveredIntent(config, telefone, item);
	if (!item) return classifyMissingItem(config, telefone);
	if (String(item.status || "").toLowerCase() === "agendado") {
		return classifyPostScheduleReply(config, telefone, item);
	}
	if (!schedule) return classifyNoSchedule(config, telefone, item, mensagem);
	return classifyWithSchedule(config, telefone, item, schedule, callbackId, queueItem, mensagem);
}

async function registerCallback(payload = {}) {
	const connectionResult = await handleConnectionEventCallback(payload);
	if (connectionResult) return connectionResult;
	if (isNonMessageWebhook(payload)) {
		return { ok: true, ignored: true, reason: "Evento sem mensagem ignorado." };
	}
	if (isOutboundWebhook(payload)) {
		return {
			ok: true,
			ignored: true,
			reason: "Mensagem enviada pela propria instancia.",
		};
	}
	if (isGroupWebhook(payload)) {
		return { ok: true, ignored: true, reason: "Mensagem de grupo ignorada." };
	}
	const mensagem = String(
		payload.mensagem || extractTextFromWebhook(payload) || "",
	).trim();
	if (isAutomationText(mensagem)) {
		return { ok: true, ignored: true, reason: "Mensagem automatica ignorada." };
	}
	const telefone =
		payload.telefone || payload.phone || extractPhoneFromWebhook(payload);
	const codigoCliente = payload.codigo_cliente || payload.codigoCliente || "";
	const cliente = payload.cliente || "";
	const recebidoEm = extractTimestampFromWebhook(payload);
	const webhookMessageId = extractWebhookMessageId(payload);
	if (
		markRecentInboundCallback({ phone: telefone, mensagem, webhookMessageId })
	) {
		return {
			ok: true,
			ignored: true,
			reason: "Resposta repetida em processamento ignorada.",
			status: "duplicado_em_processamento",
		};
	}
	const schedule = parseScheduleFromText(mensagem);
	const activeConversation = await getScheduleConversation(telefone);
	const hasActiveGuidedConversation = [
		"awaiting_date",
		"awaiting_time",
	].includes(String(activeConversation?.stage || ""));
	const duplicate = await findDuplicateCallback({
		phone: telefone,
		mensagem,
		webhookMessageId,
		recebidoEm,
		allowTextMatch: !hasActiveGuidedConversation,
	});
	if (duplicate) {
		return {
			ok: true,
			ignored: true,
			reason: "Resposta duplicada ignorada.",
			callbackId: duplicate.id,
			status: duplicate.status,
			agendamento_id: duplicate.agendamento_id || null,
		};
	}
	const queueItem = await findQueueItemForCallback({
		phone: telefone,
		codigoCliente,
		cliente,
	});
	const historyItem = await findHistoryItemForCallback({
		phone: telefone,
		codigoCliente,
		cliente,
	});
	const item = chooseCallbackItem(queueItem, historyItem);
	const callbackId = randomId("cb");
	const config = await getConfig();
	let guidedResult = null;
	let guidedError = "";
	if (
		(item || hasActiveGuidedConversation) &&
		config.guidedScheduleEnabled !== false
	) {
		try {
			guidedResult = await continueGuidedScheduleFlow(
				config,
				telefone,
				item || activeConversation?.item || { telefone },
				mensagem,
				callbackId,
			);
		} catch (error) {
			guidedError = String(error?.message || error);
		}
	}

	const classified = await classifyCallbackResponse({
		guidedResult,
		guidedError,
		hasActiveGuidedConversation,
		mensagem,
		config,
		telefone,
		item,
		schedule,
		queueItem,
		callbackId,
	});
	const { status, agendamentoId, motivo, respostaAutomatica } = classified;

	await mensageriaRepository.recordCallback(
		{
			id: callbackId,
			telefone,
			codigo_cliente: codigoCliente || item?.codigo_cliente || "",
			cliente: cliente || item?.cliente || "",
			os: item?.os || "",
			filaId: queueItem?.id || item?.filaId || "",
			historicoId: historyItem?.id || "",
			webhook_message_id: webhookMessageId,
			mensagem,
			payload,
			schedule,
			status,
			motivo,
			resposta_automatica: respostaAutomatica,
			agendado: Boolean(agendamentoId),
			agendamento_id: agendamentoId,
			criado_em: nowIso(),
			recebido_em: recebidoEm,
		},
		{ id: callbackId },
	);

	broadcastRealtime("mensageria", { action: "callback", status });
	broadcastRealtime("acompanhamento", { collectionPath: CALLBACK_COLLECTION });
	return {
		ok: true,
		status,
		agendado: Boolean(agendamentoId),
		agendamento_id: agendamentoId,
		schedule,
		motivo,
	};
}

async function listDisconnectLogs(limit = 50) {
	const safeLimit = Math.min(Math.max(Number(limit || 50), 1), 200);
	const rows = await documents.listDocuments({
		collectionPath: DISCONNECT_LOG_COLLECTION,
		limit: safeLimit,
		offset: 0,
	});
	const items = rows
		.map((row) => ({ id: row.documentId, ...(row.data || {}) }))
		.sort(
			(left, right) =>
				new Date(right.createdAt || 0).getTime() -
				new Date(left.createdAt || 0).getTime(),
		);
	return { ok: true, items };
}

module.exports = {
	getConfig,
	getStatus,
	getConnectionInfo,
	isConfirmedDisconnectedConnection,
	getAccountsConnectionInfo,
	createOrConnectInstance,
	logoutInstance,
	deleteInstance,
	configureWebhook,
	getWebhookInfo,
	listDisconnectLogs,
	processQueueOnce,
	pauseQueueForDisconnectedEvolution,
	registerCallback,
	sendTestMessage,
	saveConfigPatch,
	startWorker,
	wakeQueueWorker,
	stopWorker,
	resetNextRunAt,
	normalizePhone,
	sendWhatsAppMessage,
	_test: {
		dateKeyFromValue,
		formatDateLabel,
		getGuidedDateOptions,
		getReusableGuidedDateOptions,
		parseGuidedDateChoice,
		parseScheduleFromText,
		isConfirmedDisconnectedConnection,
	},
};
