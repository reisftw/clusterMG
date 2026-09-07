const crypto = require("node:crypto");
const agendamentosRepository = require("../agendamentosRepository");
const auditLog = require("../auditLog");
const documents = require("../documents");
const regionaisRepository = require("../regionaisRepository");
const evolutionMessaging = require("../evolutionMessaging");
const notificationsService = require("../notificationsService");
const sempreIntegration = require("../sempreIntegration");
const { broadcastRealtime } = require("../realtime");
const {
	getProvidedWebhookSecret,
} = require("../webhooks/utils/webhookSecrets");
const {
	assertRegionalRecordAccess,
	scopeWritePayload,
} = require("../security/regionalScope");

const CONFIG_PATH = "atendimento_config/global";
const CONFIG_COLLECTION = "atendimento_config";
const CASES_COLLECTION = "atendimento_casos";
const TECHNICIANS_COLLECTION = "atendimento_tecnicos";
const LOGS_COLLECTION = "atendimento_logs";
const MESSAGES_COLLECTION = "atendimento_mensagens";
const EMPRESAS_COLLECTION = "empresas_tecnicos";
const TEXT_STOP_WORDS = new Set([
	"da",
	"de",
	"di",
	"do",
	"das",
	"dos",
	"e",
	"a",
	"o",
]);

const DEFAULT_TEMPLATES = {
	saudacao:
		"Olá! Sou o assistente automático de Retiradas. Para começar, informe seu nome completo.",
	pedirCidade: "Perfeito. Agora informe sua cidade de atendimento.",
	pedirEmpresa: "Perfeito. Agora informe a empresa que você representa.",
	pedirEmail: "Agora informe seu e-mail Hubsoft para validar seu cadastro.",
	menu: "Cadastro validado.\n\nEscolha uma opção:\n1 - Consultar O.S aberta\n2 - Consultar equipamento por MAC\n3 - Solicitar retirada\n4 - Atualizar cadastro\n5 - Encerrar",
	boasVindasValidado: "Olá, {nome}! Seu cadastro já está validado.\n\n{menu}",
	naoEntendi:
		"Não entendi sua resposta. Por favor, responda conforme a última orientação enviada.",
	nomeInvalido:
		"Não consegui identificar seu nome. Por favor, envie seu nome completo.",
	cidadeNaoEncontrada:
		"Não encontrei essa cidade na base de regionais. Por favor, envie novamente a cidade de atendimento.",
	regionalEncontrada:
		"Perfeito. Localizei sua regional: {regional}.\n\n{pedir_empresa}",
	empresaConfirmacao:
		"Encontrei a empresa cadastrada:\n{empresa}{regional_linha}\n\nDigite 1 para confirmar ou 2 para tentar novamente.",
	empresaNaoEncontradaPrimeira:
		"Não encontrei essa empresa na sua regional. Por favor, envie o nome da empresa novamente.",
	empresaSemCadastroRegional:
		"Não encontrei empresas cadastradas para a regional {regional}. Encaminhe seu cadastro ao BackOffice.\n\nProtocolo: {protocolo}",
	empresaListaCabecalho:
		"Não encontrei pelo nome informado. Escolha a empresa da regional {regional}:",
	empresaTentarNovamente:
		"Certo. Informe novamente o nome da empresa que você representa.",
	emailEmpresaEncontrada:
		"Cadastro validado.\n\nLocalizei seu cadastro na empresa {empresa}{regional_linha}.",
	emailEmpresaNaoEncontrada:
		"E-mail validado no Hubsoft, mas não encontrei esse técnico nas empresas cadastradas. Informe a empresa que você representa.",
	empresaConfirmacaoInvalida:
		"Digite 1 para confirmar a empresa encontrada ou 2 para tentar novamente.",
	empresaListaInvalida:
		"Escolha uma das empresas da lista, digitando apenas o número correspondente.",
	consultaOsMenu:
		"Como deseja consultar O.S aberta?\n1 - Pesquisar por nome ou código\n2 - Buscar ordens abertas por cidade\n3 - Voltar ao menu anterior",
	consultaOsPergunta:
		"Informe o código da O.S, contrato, cliente ou outro dado da O.S aberta que deseja consultar.",
	consultaOsCidadePergunta: "Informe a cidade para buscar as ordens abertas.",
	consultaOsSemResultado:
		"Não encontrei O.S aberta com essas informações. Confira o código/contrato e tente novamente.",
	consultaOsResultadoCabecalho: "Encontrei {total} registro(s) de O.S aberta:",
	consultaOsResultadoItem:
		"{indice}. {codigo} - {cliente}\nTipo: {tipo}\nCidade: {cidade}\nStatus: {status}",
	consultaOsResultadoOpcoes:
		"Se quiser acionar o BackOffice para essas ordens, responda *solicitar ordens*.\nPara encerrar, responda *encerrar*.\nPara voltar ao menu, responda *menu*.",
	consultaOsMenuInvalido:
		"Escolha uma opção válida:\n1 - Pesquisar por nome ou código\n2 - Buscar ordens abertas por cidade\n3 - Voltar ao menu anterior",
	consultaMacPergunta: "Informe o MAC do equipamento que deseja consultar.",
	consultaMacSemResultado:
		"Não encontrei equipamento com esse MAC. Confira o número e tente novamente.",
	consultaMacResultadoCabecalho: "Equipamento encontrado:",
	consultaMacResultado:
		"Equipamento encontrado:\n\nMAC: {mac}\nModelo: {modelo}\nStatus: {status}\nCliente vinculado: {cliente_vinculado}{contrato_linha}",
	consultaMacMenu:
		"1 - Verificar se cliente possui retirada\n2 - Voltar ao menu anterior",
	consultaMacClienteRetiradaResultado:
		"O cliente possui {total} ordem(ns) de retirada {tipo} aberta(s).",
	consultaMacClienteRetiradaSemResultado:
		"Não encontrei ordem de retirada aberta para o cliente vinculado a esse equipamento.",
	consultaMacClienteRetiradaOpcoes:
		"1 - Solicitar o backoffice retirada.\n2 - Encerrar atendimento",
	consultaMacErro:
		"Não consegui consultar esse MAC. Envie novamente o MAC do equipamento.",
	atualizarCadastroInicio:
		"Vamos atualizar seu cadastro. Informe seu nome completo.",
	limiteTentativas:
		"Não consegui validar suas respostas dentro do limite de tentativas.",
	tentativaInvalida: "Tentativa {tentativa} de {limite}.",
	assumirCaso: "{nome} assumiu seu caso. Aguarde retorno!",
	encerrarCasoPainel:
		"{nome} encerrou seu chamado.\nProtocolo: {protocolo}\nObrigado pelo contato.",
	respostaManualPrefixo: "[{nome}] {mensagem}",
	solicitarAvaliacao:
		"Seu atendimento foi encerrado.\nProtocolo: {protocolo}\nEncerrado por: {nome}\nData: {data_encerramento}\n\nAvalie nosso atendimento de 1 a 5 estrelas respondendo apenas com um número.",
	avaliacaoInvalida:
		"Para finalizar, envie uma nota de 1 a 5 para avaliar o atendimento do protocolo {protocolo}.",
	avaliacaoRegistrada:
		"Obrigado! Sua avaliação {nota}/5 foi registrada.\nProtocolo: {protocolo}",
	foraHorario:
		"Recebemos sua mensagem fora do horário de atendimento.\nHorário: {horario_atendimento}\nProtocolo: {protocolo}",
	casoCriado:
		"Caso aberto com sucesso.\nProtocolo: {protocolo}\nO BackOffice vai tratar a solicitação.",
	encerrado:
		"Atendimento encerrado. Quando precisar, envie uma nova mensagem por aqui.",
	equipeMenu:
		"Olá, {nome}! Menu da equipe Retiradas:\n\n1 - Agendamentos\n2 - Metas\n3 - Ordens abertas\n4 - Entregas do dia\n\nResponda com o número da opção desejada.",
	equipeOpcaoInvalida:
		"Escolha uma opção válida:\n1 - Agendamentos\n2 - Metas\n3 - Ordens abertas\n4 - Entregas do dia",
};
const LEGACY_CITY_GREETING =
	"Olá! Sou o assistente automático de Retiradas. Para começar, informe sua cidade de atendimento.";

const DEFAULT_CONFIG = {
	enabled: false,
	provider: "evolution",
	webhookSecret: "",
	evolutionBaseUrl: "",
	evolutionApiKey: "",
	evolutionInstance: "",
	evolutionWebhookUrl:
		"https://retiradas.tech/api/webhooks/evolution-atendimento",
	evolutionSendTextPath: "/message/sendText/{instance}",
	businessHoursEnabled: true,
	businessHoursTimezone: "America/Sao_Paulo",
	businessHours: {
		monday: { enabled: true, start: "08:00", end: "18:00" },
		tuesday: { enabled: true, start: "08:00", end: "18:00" },
		wednesday: { enabled: true, start: "08:00", end: "18:00" },
		thursday: { enabled: true, start: "08:00", end: "18:00" },
		friday: { enabled: true, start: "08:00", end: "18:00" },
		saturday: { enabled: false, start: "08:00", end: "12:00" },
		sunday: { enabled: false, start: "08:00", end: "12:00" },
	},
	maxInvalidAttempts: 2,
	autoSyncEmpresaTecnico: true,
	teamMembers: [],
	templates: DEFAULT_TEMPLATES,
};

const nowIso = () => new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const onlyDigits = (value) => String(value || "").replace(/\D/g, "");
const isPlausibleBrazilPhone = (value) => {
	const digits = onlyDigits(value);
	return digits.length >= 10 && digits.length <= 13;
};
const normalizePhone = (value) => {
	const digits = onlyDigits(value);
	if (!digits) return "";
	if (digits.length > 13) return "";
	return digits.startsWith("55") || digits.length < 10 ? digits : `55${digits}`;
};
const normalizeText = (value) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
const cleanText = (value) => String(value || "").trim();
const MONTH_NAMES = [
	"Janeiro",
	"Fevereiro",
	"Marco",
	"Abril",
	"Maio",
	"Junho",
	"Julho",
	"Agosto",
	"Setembro",
	"Outubro",
	"Novembro",
	"Dezembro",
];
const DIARIO_HORARIOS = ["11h", "14h", "16h", "18h"];

function getSaoPauloDateParts(date = new Date()) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return {
		year: Number(map.year),
		month: Number(map.month),
		day: Number(map.day),
		key: `${map.year}-${map.month}-${map.day}`,
	};
}

function dateFromKey(dateKey) {
	const [year, month, day] = String(dateKey || "")
		.split("-")
		.map(Number);
	return new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1, 12));
}

function addDaysKey(dateKey, amount) {
	const date = dateFromKey(dateKey);
	date.setUTCDate(date.getUTCDate() + amount);
	return getSaoPauloDateParts(date).key;
}

function getCurrentRanges() {
	const today = getSaoPauloDateParts();
	const date = dateFromKey(today.key);
	const day = date.getUTCDay();
	const mondayOffset = day === 0 ? -6 : 1 - day;
	const weekStart = addDaysKey(today.key, mondayOffset);
	const weekEnd = addDaysKey(weekStart, 6);
	const monthStart = `${today.key.slice(0, 7)}-01`;
	const monthEndDate = new Date(Date.UTC(today.year, today.month, 0, 12));
	const monthEnd = getSaoPauloDateParts(monthEndDate).key;
	return {
		today: today.key,
		weekStart,
		weekEnd,
		monthStart,
		monthEnd,
		monthName: MONTH_NAMES[today.month - 1] || "Atual",
	};
}

const formatNumber = (value) =>
	Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function getTeamMember(config = {}, phone = "") {
	const normalized = normalizePhone(phone);
	return (
		(config.teamMembers || []).find(
			(member) =>
				normalizePhone(member.phone || member.telefone || member.numero) ===
				normalized,
		) || null
	);
}

function mergeConfig(data = {}) {
	const templates = { ...DEFAULT_TEMPLATES, ...(data.templates || {}) };
	if (templates.saudacao === LEGACY_CITY_GREETING)
		templates.saudacao = DEFAULT_TEMPLATES.saudacao;
	return {
		...DEFAULT_CONFIG,
		...(data || {}),
		businessHours: {
			...DEFAULT_CONFIG.businessHours,
			...(data.businessHours || {}),
		},
		teamMembers: Array.isArray(data.teamMembers) ? data.teamMembers : [],
		templates,
	};
}

function sanitizeConfig(config = {}) {
	return {
		...config,
		evolutionApiKey: config.evolutionApiKey ? "********" : "",
		webhookSecret: config.webhookSecret ? "********" : "",
	};
}

async function upsertDoc(path, collectionPath, documentId, data) {
	await documents.upsertDocument({
		path,
		collectionPath,
		documentId,
		parentPath: null,
		data,
	});
}

async function appendLog(type, message, data = {}) {
	const id = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
	await upsertDoc(`${LOGS_COLLECTION}/${id}`, LOGS_COLLECTION, id, {
		id,
		type,
		message,
		data,
		createdAt: nowIso(),
	});
}

function readPayloadEvent(payload = {}) {
	return cleanText(
		payload.webhookEvent ||
			payload.event ||
			payload.type ||
			payload.data?.event ||
			payload.data?.type ||
			"",
	);
}

function readPayloadMessageType(payload = {}) {
	const message = payload.data?.message || payload.message || {};
	if (!message || typeof message !== "object") return typeof message;
	return (
		Object.keys(message).find(
			(key) => message[key] !== undefined && message[key] !== null,
		) || ""
	);
}

function summarizeWebhookPayload(payload = {}) {
	return {
		event: readPayloadEvent(payload),
		instance:
			payload.instance ||
			payload.instanceName ||
			payload.data?.instance ||
			payload.data?.instanceName ||
			"",
		pushName:
			payload.data?.pushName ||
			payload.pushName ||
			payload.data?.key?.pushName ||
			"",
		messageType: readPayloadMessageType(payload),
		messageId:
			payload.data?.key?.id ||
			payload.key?.id ||
			payload.messageId ||
			payload.id ||
			"",
		entryFrom:
			payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from || "",
		remoteJid:
			payload.data?.key?.remoteJid ||
			payload.data?.remoteJid ||
			payload.key?.remoteJid ||
			payload.remoteJid ||
			"",
		remoteJidAlt: payload.data?.remoteJidAlt || payload.remoteJidAlt || "",
		participant:
			payload.data?.key?.participant ||
			payload.data?.participant ||
			payload.key?.participant ||
			payload.participant ||
			"",
		participantPhone:
			payload.data?.participantPhone || payload.participantPhone || "",
		sender: payload.data?.sender || payload.sender || "",
		from: payload.data?.from || payload.from || "",
		phone:
			payload.data?.phone ||
			payload.phone ||
			payload.number ||
			payload.telephone ||
			"",
		connectedPhone:
			payload.data?.connectedPhone || payload.connectedPhone || "",
		rawKeys: Object.keys(payload || {}).slice(0, 20),
		dataKeys: Object.keys(payload.data || {}).slice(0, 20),
	};
}

function summarizeProviderResponse(result = {}) {
	const response = result?.response || result || {};
	return {
		mode: result?.mode || "",
		status:
			result?.status ||
			response?.status ||
			response?.state ||
			response?.message?.status ||
			"",
		message: result?.message || response?.message || response?.error || "",
		messageId:
			response?.key?.id ||
			response?.messageId ||
			response?.id ||
			response?.data?.key?.id ||
			response?.data?.messageId ||
			"",
		remoteJid:
			response?.key?.remoteJid ||
			response?.data?.key?.remoteJid ||
			response?.remoteJid ||
			"",
		usedNumber: response?._usedNumber || result?._usedNumber || "",
		attempts: response?._attempts || result?._attempts || [],
		rawKeys: Object.keys(response || {}).slice(0, 20),
	};
}

async function recordMessage(entry = {}) {
	const id = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
	const data = {
		id,
		direction: entry.direction || "in",
		phone: normalizePhone(entry.phone),
		text: cleanText(entry.text),
		status: entry.status || "registrada",
		reason: entry.reason || "",
		caseId: entry.caseId || "",
		protocol: entry.protocol || "",
		provider: entry.provider || "evolution",
		providerStatus: entry.providerStatus || "",
		error: entry.error || "",
		context: entry.context || {},
		payload: entry.payload || null,
		createdAt: nowIso(),
		updatedAt: nowIso(),
	};
	await upsertDoc(
		`${MESSAGES_COLLECTION}/${id}`,
		MESSAGES_COLLECTION,
		id,
		data,
	);
	return data;
}

async function readConfig({ sanitized = false } = {}) {
	const record = await documents.getDocument(CONFIG_PATH);
	const config = mergeConfig(record?.data || {});
	return sanitized ? sanitizeConfig(config) : config;
}

async function saveConfig(patch = {}, user = null) {
	const current = await readConfig();
	const next = mergeConfig({
		...current,
		...(patch || {}),
		evolutionApiKey:
			patch.evolutionApiKey === "********"
				? current.evolutionApiKey
				: (patch.evolutionApiKey ?? current.evolutionApiKey),
		webhookSecret:
			patch.webhookSecret === "********"
				? current.webhookSecret
				: (patch.webhookSecret ?? current.webhookSecret),
		updatedAt: nowIso(),
		updatedBy: user?.email || user?.uid || "",
	});
	await upsertDoc(CONFIG_PATH, CONFIG_COLLECTION, "global", next);
	await appendLog("config", "Configuração atualizada.", {
		user: user?.email || user?.uid || "",
	});
	return sanitizeConfig(next);
}

async function readTemplates() {
	const config = await readConfig();
	return { templates: config.templates || DEFAULT_TEMPLATES };
}

async function saveTemplates(templates = {}, user = null) {
	const current = await readConfig();
	const nextTemplates = {
		...DEFAULT_TEMPLATES,
		...(current.templates || {}),
		...(templates || {}),
	};
	const next = await saveConfig({ ...current, templates: nextTemplates }, user);
	return { templates: next.templates || nextTemplates };
}

function buildEvolutionConfig(config = {}) {
	const webhookBase = String(
		config.evolutionWebhookUrl || DEFAULT_CONFIG.evolutionWebhookUrl,
	).split("?")[0];
	return {
		whatsappProvider: "evolution",
		evolutionEnabled: true,
		evolutionBaseUrl: config.evolutionBaseUrl,
		evolutionApiKey: config.evolutionApiKey,
		evolutionInstance: config.evolutionInstance,
		evolutionSendTextPath:
			config.evolutionSendTextPath || DEFAULT_CONFIG.evolutionSendTextPath,
		evolutionRetryPhoneVariants: false,
		evolutionRetryPendingVariants: false,
		evolutionFailOnPending: true,
		evolutionWebhookUrl: `${webhookBase}?secret=${encodeURIComponent(config.webhookSecret || "")}`,
	};
}

function timingSafeEqualText(left, right) {
	const leftBuffer = Buffer.from(String(left || ""));
	const rightBuffer = Buffer.from(String(right || ""));
	if (leftBuffer.length !== rightBuffer.length) return false;
	return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function verifyWebhookRequest(req) {
	const config = await readConfig();
	const expected = String(
		config.webhookSecret ||
			process.env.ATENDIMENTO_EVOLUTION_WEBHOOK_SECRET ||
			"",
	);
	if (!expected || expected.length < 24) {
		await appendLog(
			"webhook_rejected",
			"Evolution Atendimento sem segredo de webhook configurado.",
			{ reason: "missing_secret" },
		);
		return {
			ok: process.env.NODE_ENV !== "production",
			error: "Evolution Atendimento sem segredo de webhook configurado.",
		};
	}
	const ok = timingSafeEqualText(getProvidedWebhookSecret(req), expected);
	if (!ok)
		await appendLog(
			"webhook_rejected",
			"Webhook do atendimento nao autorizado.",
			{ reason: "invalid_secret" },
		);
	return ok ? { ok: true } : { ok: false, error: "Webhook nao autorizado." };
}

async function getStatus() {
	const config = await readConfig();
	const evolutionConfig = buildEvolutionConfig(config);
	const [connection, webhook] = await Promise.all([
		evolutionMessaging
			.getConnectionInfo(evolutionConfig)
			.catch((error) => ({
				ok: false,
				error: error?.message || String(error),
			})),
		evolutionMessaging
			.getWebhookInfo(evolutionConfig)
			.catch((error) => ({
				ok: false,
				error: error?.message || String(error),
			})),
	]);
	return {
		config: sanitizeConfig(config),
		connection,
		webhook,
		checkedAt: nowIso(),
	};
}

async function connect() {
	const config = await readConfig();
	return evolutionMessaging.createOrConnectInstance(
		buildEvolutionConfig(config),
		{ persist: false },
	);
}

async function disconnect() {
	const config = await readConfig();
	return evolutionMessaging.logoutInstance(buildEvolutionConfig(config));
}

async function resetInstance() {
	const config = await readConfig();
	const evolutionConfig = buildEvolutionConfig(config);
	const logout = await evolutionMessaging
		.logoutInstance(evolutionConfig)
		.catch((error) => ({ ok: false, error: error?.message || String(error) }));
	const deleted = await evolutionMessaging
		.deleteInstance(evolutionConfig)
		.catch((error) => ({ ok: false, error: error?.message || String(error) }));
	const attempts = [];
	let connectResult = null;
	let lastError = null;
	for (let attempt = 1; attempt <= 3; attempt += 1) {
		if (attempt > 1 || deleted?.ok !== false)
			await sleep(attempt === 1 ? 1200 : 1800);
		try {
			connectResult = await evolutionMessaging.createOrConnectInstance(
				evolutionConfig,
				{ persist: false },
			);
			attempts.push({ attempt, ok: true });
			break;
		} catch (error) {
			lastError = error;
			attempts.push({
				attempt,
				ok: false,
				error: error?.message || String(error),
			});
		}
	}
	if (!connectResult)
		throw (
			lastError ||
			new Error("Nao foi possivel gerar QR Code da Evolution Atendimento.")
		);
	await appendLog(
		"instance_reset",
		"Instancia Evolution Atendimento reiniciada para novo QR.",
		{
			instance: evolutionConfig.evolutionInstance,
			logout,
			deleted,
			attempts,
		},
	);
	return { ok: true, logout, deleted, attempts, connect: connectResult };
}

async function configureWebhook() {
	const config = await readConfig();
	return evolutionMessaging.configureWebhook(buildEvolutionConfig(config), {
		persist: false,
	});
}

async function sendMessage(config, phone, text, context = {}) {
	const normalizedPhone = normalizePhone(phone);
	try {
		const evolutionConfig = buildEvolutionConfig(config);
		const connection = await evolutionMessaging
			.getConnectionInfo(evolutionConfig)
			.catch((error) => ({
				ok: false,
				error: error?.message || String(error),
			}));
		if (connection?.ok === false || connection?.connected === false) {
			throw new Error(
				`Evolution Atendimento desconectada ou sem confirmação de conexão: ${connection?.error || connection?.state || "estado desconhecido"}`,
			);
		}
		const result = await evolutionMessaging.sendWhatsAppMessage(
			evolutionConfig,
			normalizedPhone,
			text,
			context,
		);
		await recordMessage({
			direction: "out",
			phone: normalizedPhone,
			text,
			status: "enviado",
			caseId: context.caseId || "",
			protocol: context.protocol || "",
			providerStatus:
				result?.status ||
				result?.message ||
				result?.response?.status ||
				result?.response?.message ||
				"",
			context: { ...context, connection },
			payload: summarizeProviderResponse(result),
		}).catch((error) =>
			appendLog("message_record_error", error?.message || String(error), {
				phone: normalizedPhone,
				direction: "out",
			}),
		);
		return result;
	} catch (error) {
		const providerPayload = error?.evolutionResponse
			? summarizeProviderResponse({
					mode: "evolution_text",
					response: error.evolutionResponse,
				})
			: {};
		await recordMessage({
			direction: "out",
			phone: normalizedPhone,
			text,
			status: "falha",
			error: error?.message || String(error),
			caseId: context.caseId || "",
			protocol: context.protocol || "",
			context,
			providerStatus: providerPayload.status || "",
			payload: {
				...providerPayload,
				attempts: error?.evolutionAttempts || providerPayload.attempts || [],
			},
		}).catch((recordError) =>
			appendLog(
				"message_record_error",
				recordError?.message || String(recordError),
				{ phone: normalizedPhone, direction: "out" },
			),
		);
		await appendLog("send_error", "Falha ao enviar mensagem do atendimento.", {
			phone: normalizedPhone,
			error: error?.message || String(error),
			context,
		});
		throw error;
	}
}

async function sendTestMessage(payload = {}, user = null) {
	const config = await readConfig();
	const number = normalizePhone(
		payload.number || payload.telefone || payload.phone,
	);
	const message = String(
		payload.message || payload.mensagem || "Teste do atendimento automático.",
	).trim();
	if (!number) throw new Error("Número obrigatório para teste.");
	const result = await sendMessage(config, number, message, {
		origem: "atendimento_teste",
	});
	await appendLog("test", `Mensagem de teste enviada para ${number}.`, {
		user: user?.email || user?.uid || "",
	});
	return result;
}

async function validateHubsoftEmail(email) {
	const normalizedEmail = String(email || "")
		.trim()
		.toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
		return { ok: false, error: "E-mail inválido." };
	const response = await sempreIntegration.requestSempreRaw(
		`/mesclar/usuario?page=1&limit=100&filter.email=$ilike:${encodeURIComponent(normalizedEmail)}`,
	);
	const items = Array.isArray(response?.data)
		? response.data
		: Array.isArray(response)
			? response
			: [];
	const match =
		items.find(
			(item) => String(item.email || "").toLowerCase() === normalizedEmail,
		) || items[0];
	if (!match)
		return { ok: false, error: "E-mail não encontrado no Playground." };
	return {
		ok: true,
		email: String(match.email || normalizedEmail).toLowerCase(),
		nome: match.nome || "",
		seniorId: match.senior_id || "",
		hubsoftId: match.hubsoft_id || "",
		raw: match,
	};
}

async function saveTechnician(phone, data = {}) {
	const normalized = normalizePhone(phone);
	const current =
		(await documents.getDocument(`${TECHNICIANS_COLLECTION}/${normalized}`))
			?.data || {};
	const next = {
		...current,
		...(data || {}),
		phone: normalized,
		updatedAt: nowIso(),
		createdAt: current.createdAt || nowIso(),
	};
	await upsertDoc(
		`${TECHNICIANS_COLLECTION}/${normalized}`,
		TECHNICIANS_COLLECTION,
		normalized,
		next,
	);
	return next;
}

async function syncEmpresaTecnico(technician = {}) {
	if (!technician.empresa) return null;
	const empresas = await documents
		.listAllDocuments(EMPRESAS_COLLECTION)
		.catch(() => []);
	const needle = normalizeText(technician.empresa);
	const empresa =
		empresas.find(
			(row) =>
				cleanText(technician.empresaId) &&
				row.documentId === cleanText(technician.empresaId),
		) ||
		empresas.find((row) =>
			[
				row.documentId,
				row.data?.nome,
				row.data?.nomeFantasia,
				row.data?.razaoSocial,
			].some((item) => normalizeText(item).includes(needle)),
		);
	if (!empresa) return null;
	const data = empresa.data || {};
	const tecnicos = Array.isArray(data.tecnicos) ? data.tecnicos : [];
	const email = String(technician.hubsoftEmail || "").toLowerCase();
	const phone = normalizePhone(technician.phone);
	const index = tecnicos.findIndex(
		(item) =>
			String(item.emailHubsoft || item.email || "").toLowerCase() === email ||
			normalizePhone(item.telefoneWhatsapp || item.telefone) === phone,
	);
	const record = {
		...(index >= 0 ? tecnicos[index] : {}),
		nome: technician.name || technician.hubsoftName || "",
		emailHubsoft: email,
		telefone: phone,
		telefoneWhatsapp: phone,
		cidade: technician.city || "",
		regional: technician.regional || "",
		origem: "atendimento_bot",
		atualizadoEm: nowIso(),
	};
	const nextTecnicos = [...tecnicos];
	if (index >= 0) nextTecnicos[index] = record;
	else nextTecnicos.push(record);
	await upsertDoc(empresa.path, EMPRESAS_COLLECTION, empresa.documentId, {
		...data,
		tecnicos: nextTecnicos,
		atualizadoEm: nowIso(),
	});
	return empresa.documentId;
}

async function unlinkTechnicianFromOtherCompanies(
	technician = {},
	targetEmpresaId = "",
) {
	const email = String(technician.hubsoftEmail || "").toLowerCase();
	const phone = normalizePhone(technician.phone);
	if (!email && !phone) return;
	const empresas = await documents
		.listAllDocuments(EMPRESAS_COLLECTION)
		.catch(() => []);
	await Promise.all(
		empresas.map(async (empresa) => {
			if (targetEmpresaId && empresa.documentId === targetEmpresaId) return;
			const data = empresa.data || {};
			const tecnicos = Array.isArray(data.tecnicos) ? data.tecnicos : [];
			const nextTecnicos = tecnicos.filter((item) => {
				const sameEmail =
					email &&
					String(item.emailHubsoft || item.email || "").toLowerCase() === email;
				const samePhone =
					phone &&
					normalizePhone(item.telefoneWhatsapp || item.telefone) === phone;
				return !sameEmail && !samePhone;
			});
			if (nextTecnicos.length !== tecnicos.length) {
				await upsertDoc(empresa.path, EMPRESAS_COLLECTION, empresa.documentId, {
					...data,
					tecnicos: nextTecnicos,
					atualizadoEm: nowIso(),
				});
			}
		}),
	);
}

function extractText(payload = {}) {
	const message = payload.data?.message || payload.message || {};
	if (typeof message === "string") return cleanText(message);
	return String(
		message.conversation ||
			message.extendedTextMessage?.text ||
			message.imageMessage?.caption ||
			message.videoMessage?.caption ||
			message.documentMessage?.caption ||
			message.buttonsResponseMessage?.selectedButtonId ||
			message.buttonsResponseMessage?.selectedDisplayText ||
			message.listResponseMessage?.singleSelectReply?.selectedRowId ||
			message.listResponseMessage?.title ||
			message.templateButtonReplyMessage?.selectedId ||
			message.templateButtonReplyMessage?.selectedDisplayText ||
			payload.data?.text ||
			payload.data?.body ||
			payload.text ||
			payload.body ||
			"",
	).trim();
}

function extractPhone(payload = {}) {
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
		payload.data?.remoteJidAlt,
		payload.remoteJidAlt,
		payload.data?.key?.participant,
		payload.data?.participant,
		payload.key?.participant,
		payload.participant,
		payload.data?.phone,
		payload.data?.number,
		payload.data?.telephone,
		payload.data?.fromMe ? "" : payload.data?.participantPhone,
		payload.participantPhone,
		payload.phone,
		payload.data?.sender,
		payload.sender,
		payload.connectedPhone,
	];
	for (const candidate of candidates) {
		const raw = String(candidate || "").split("@")[0];
		if (!isPlausibleBrazilPhone(raw)) continue;
		const normalized = normalizePhone(raw);
		if (normalized) return normalized;
	}
	return "";
}

function applyTemplate(template, values = {}) {
	return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) =>
		String(values[key] ?? ""),
	);
}

function getTemplate(config, key, values = {}) {
	return applyTemplate(
		config?.templates?.[key] || DEFAULT_TEMPLATES[key] || "",
		values,
	);
}

function getDocumentDateKey(item = {}) {
	return cleanText(
		item.data ||
			item.date ||
			item.data_agendamento ||
			item.dataAgendamento ||
			item.scheduleDate ||
			item.schedule_date ||
			item.createdAt,
	).slice(0, 10);
}

async function buildTeamAppointmentsSummary() {
	const ranges = getCurrentRanges();
	const rows = await agendamentosRepository
		.listAllAppointmentDocuments()
		.catch(() => []);
	const dates = rows
		.map((row) => getDocumentDateKey(row.data || {}))
		.filter(Boolean);
	const today = dates.filter((date) => date === ranges.today).length;
	const week = dates.filter(
		(date) => date >= ranges.weekStart && date <= ranges.weekEnd,
	).length;
	const month = dates.filter(
		(date) => date >= ranges.monthStart && date <= ranges.monthEnd,
	).length;
	return [
		"📅 Agendamentos",
		`Hoje (${ranges.today.split("-").reverse().join("/")}): ${formatNumber(today)}`,
		`Semana (${ranges.weekStart.split("-").reverse().join("/")} a ${ranges.weekEnd.split("-").reverse().join("/")}): ${formatNumber(week)}`,
		`Mês (${ranges.monthName}): ${formatNumber(month)}`,
	].join("\n");
}

function formatMetaBaseSummary(label, data = {}) {
	if (!data || typeof data !== "object")
		return `${label}: sem dados carregados.`;
	const total = Number(
		data.totalOS || data.totalRealizado || data.realizado || 0,
	);
	const meta = Number(data.meta || data.totalMeta || 0);
	const percent =
		meta > 0
			? Number(((total / meta) * 100).toFixed(1))
			: Number(data.percentAchieved || 0);
	const missing = Math.max(0, meta - total);
	const saldoRows = Array.isArray(data.saldoDiario) ? data.saldoDiario : [];
	const lastSaldo =
		[...saldoRows]
			.reverse()
			.find((row) => Number(row?.totalDia || row?.total || 0) > 0) ||
		saldoRows.at(-1) ||
		{};
	const lastDay = Number(lastSaldo.dia || 0);
	const pace = lastDay > 0 ? total / lastDay : 0;
	const monthDays = Number(data.dayCount || data.totalDias || 30) || 30;
	const projected =
		pace > 0 ? Math.round(pace * monthDays) : Number(data.projecao || 0);
	const projectedPercent =
		meta > 0 && projected > 0
			? Number(((projected / meta) * 100).toFixed(1))
			: 0;
	return [
		`${label}`,
		`Meta: ${formatNumber(meta)} | Entregue: ${formatNumber(total)} | ${formatNumber(percent)}%`,
		`Falta: ${formatNumber(missing)} | Projeção: ${formatNumber(projected)} (${formatNumber(projectedPercent)}%)`,
	].join("\n");
}

async function buildTeamMetasSummary() {
	const { monthName } = getCurrentRanges();
	const row = await documents
		.getDocument(`metas/${monthName}`)
		.catch(() => null);
	const data = row?.data || {};
	return [
		`🎯 Metas atuais - ${monthName}`,
		"",
		formatMetaBaseSummary("SEMPRE", data),
		"",
		formatMetaBaseSummary("ONNET", data.onnet),
		"",
		formatMetaBaseSummary("TODOS", data.onnetSempre),
	].join("\n");
}

function normalizeRegionalName(value) {
	return cleanText(value || "Sem regional");
}

async function buildTeamOpenOrdersSummary() {
	const snapshot =
		(await documents.getDocument("public_dashboard/mapa_os").catch(() => null))
			?.data || {};
	let regionais =
		snapshot.chartRegionais ||
		snapshot.data?.chartRegionais ||
		snapshot.summary?.chartRegionais ||
		[];
	if (!Array.isArray(regionais) || !regionais.length) {
		const rows = await documents
			.listAllDocuments("ordens_abertas")
			.catch(() => []);
		const grouped = new Map();
		rows.forEach((row) => {
			const data = row.data || {};
			const regional = normalizeRegionalName(
				data.regional || data.regional_nome || data.regiao,
			);
			grouped.set(regional, (grouped.get(regional) || 0) + 1);
		});
		regionais = [...grouped.entries()].map(([nome, total]) => ({
			nome,
			total,
		}));
	}
	const lines = [...regionais]
		.map((item) => ({
			nome: item.nome || item.regional || item.label || "Sem regional",
			total: Number(
				item.total || item.totalOrdens || item.value || item.quantidade || 0,
			),
		}))
		.filter((item) => item.total > 0)
		.sort((a, b) => b.total - a.total)
		.slice(0, 15)
		.map(
			(item, index) =>
				`${index + 1}. ${item.nome}: ${formatNumber(item.total)}`,
		);
	return [
		"🗺️ Ordens abertas por regional",
		"",
		lines.length ? lines.join("\n") : "Sem ordens abertas carregadas.",
	].join("\n");
}

async function buildTeamDeliveriesSummary() {
	const ranges = getCurrentRanges();
	const rows = await documents
		.listAllDocuments("acompanhamento_diario")
		.catch(() => []);
	const weekRows = rows
		.map((row) => ({ id: row.documentId, ...(row.data || {}) }))
		.filter(
			(item) =>
				cleanText(item.date || item.id) >= ranges.weekStart &&
				cleanText(item.date || item.id) <= ranges.weekEnd,
		)
		.sort((a, b) =>
			String(a.date || a.id).localeCompare(String(b.date || b.id)),
		);
	let weeklyTotal = 0;
	weekRows.forEach((item) => {
		DIARIO_HORARIOS.forEach((hour) => {
			const value = Number(item.horarios?.[hour] ?? item[hour] ?? 0);
			weeklyTotal += value;
		});
	});
	const todayRow =
		weekRows.find((item) => cleanText(item.date || item.id) === ranges.today) ||
		{};
	const todayTotals = DIARIO_HORARIOS.reduce(
		(acc, hour) => ({
			...acc,
			[hour]: Number(todayRow.horarios?.[hour] ?? todayRow[hour] ?? 0),
		}),
		{},
	);
	const todayTotal = DIARIO_HORARIOS.reduce(
		(sum, hour) =>
			sum + Number(todayRow.horarios?.[hour] ?? todayRow[hour] ?? 0),
		0,
	);
	return [
		"🚚 Entregas do dia e da semana",
		`Hoje: ${formatNumber(todayTotal)}`,
		`Semana: ${formatNumber(weeklyTotal)}`,
		"",
		...DIARIO_HORARIOS.map(
			(hour) => `${hour}: ${formatNumber(todayTotals[hour])}`,
		),
	].join("\n");
}

async function buildTeamMenuResponse(config, member, text) {
	if (text === "1") return buildTeamAppointmentsSummary();
	if (text === "2") return buildTeamMetasSummary();
	if (text === "3") return buildTeamOpenOrdersSummary();
	if (text === "4") return buildTeamDeliveriesSummary();
	return getTemplate(config, "equipeMenu", {
		nome: member.name || member.nome || "Equipe",
	});
}

async function handleTeamMemberMessage(config, member, phone, text) {
	const responseText = await buildTeamMenuResponse(
		config,
		member,
		cleanText(text),
	);
	await sendMessage(config, phone, responseText, {
		action: "equipe_menu",
		teamMember: member.name || member.nome || "",
	});
	await appendLog("team_menu", "Menu de equipe consultado.", {
		phone,
		member: member.name || member.nome || "",
		option: text,
	});
	return {
		ok: true,
		status: "equipe_menu",
		teamMember: member.name || member.nome || "",
	};
}

function formatSaoPauloDateTime(value = new Date()) {
	return new Intl.DateTimeFormat("pt-BR", {
		timeZone: "America/Sao_Paulo",
		dateStyle: "short",
		timeStyle: "short",
	}).format(value instanceof Date ? value : new Date(value));
}

async function notifyBackofficeNewCase(item = {}) {
	return notificationsService
		.createNotification({
			type: "atendimento_caso_novo",
			title: "Novo caso de atendimento",
			message: `Novo caso ${item.protocol || item.id} aguardando tratativa no Atendimento.`,
			severity: "warning",
			targetPath: "/atendimento/casos",
			targets: { roles: ["backoffice_retirada"] },
			meta: { caseId: item.id, protocol: item.protocol, phone: item.phone },
			dedupeKey: `atendimento-caso-novo-${item.id}`,
		})
		.catch((error) =>
			appendLog("notification_error", error?.message || String(error), {
				caseId: item.id,
			}),
		);
}

function buildClosureMessage(config, item, reason = "") {
	const base = applyTemplate(config.templates.encerrado, {
		protocolo: item.protocol,
	});
	const protocolLine = `Protocolo: ${item.protocol}`;
	const message = base.includes(item.protocol)
		? base
		: `${base}\n${protocolLine}`;
	return reason ? `${reason}\n\n${message}` : message;
}

function getUserName(user = {}) {
	return (
		user?.profile?.nome ||
		user?.profile?.displayName ||
		user?.displayName ||
		user?.nome ||
		user?.name ||
		user?.email ||
		user?.uid ||
		"Usuário"
	);
}

async function findRegionalByCity(city) {
	const target = normalizeText(city);
	if (!target) return null;

	const regionais = await regionaisRepository
		.listAllRegionalDocuments()
		.catch(() => []);
	for (const row of regionais) {
		const data = row.data || {};
		const cidades = Array.isArray(data.cidades) ? data.cidades : [];
		const match = cidades.find((item) => {
			const name =
				typeof item === "string"
					? item
					: item?.nome || item?.cidade || item?.name;
			return normalizeText(name) === target;
		});
		if (match) {
			const cityName =
				typeof match === "string"
					? match
					: match?.nome || match?.cidade || city;
			return {
				cidade: cleanText(cityName),
				regional: cleanText(data.nome || row.documentId),
			};
		}
	}

	const empresas = await documents
		.listAllDocuments(EMPRESAS_COLLECTION)
		.catch(() => []);
	for (const row of empresas) {
		const data = row.data || {};
		const cidades = Array.isArray(data.cidades) ? data.cidades : [];
		const match = cidades.find(
			(item) =>
				normalizeText(
					typeof item === "string" ? item : item?.nome || item?.cidade,
				) === target,
		);
		if (match) {
			const cityName =
				typeof match === "string"
					? match
					: match?.nome || match?.cidade || city;
			return {
				cidade: cleanText(cityName),
				regional: cleanText(data.regional || data.regionais?.[0] || ""),
			};
		}
	}

	return null;
}

function getEmpresaName(row = {}) {
	const data = row.data || row;
	return cleanText(
		data.nome ||
			data.nomeFantasia ||
			data.razaoSocial ||
			data.empresa ||
			row.documentId,
	);
}

function getEmpresaRegional(row = {}) {
	const data = row.data || row;
	return cleanText(data.regional || data.regionais?.[0] || "");
}

function empresaMatchesRegional(row = {}, regional = "") {
	const target = normalizeText(regional);
	if (!target) return true;
	const data = row.data || row;
	const values = [
		data.regional,
		data.regionais?.[0],
		...(Array.isArray(data.regionais) ? data.regionais : []),
	];
	return values.some((value) => normalizeText(value) === target);
}

async function listEmpresasByRegional(regional = "") {
	const empresas = await documents
		.listAllDocuments(EMPRESAS_COLLECTION)
		.catch(() => []);
	return empresas
		.filter((row) => empresaMatchesRegional(row, regional))
		.map((row) => ({
			id: row.documentId,
			nome: getEmpresaName(row),
			regional: getEmpresaRegional(row),
			raw: row,
		}))
		.filter((item) => item.nome)
		.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

async function findEmpresaByTextAndRegional(text, regional = "") {
	const target = normalizeText(text);
	if (!target) return null;
	const empresas = await listEmpresasByRegional(regional);
	return (
		empresas.find((empresa) => normalizeText(empresa.nome) === target) ||
		empresas.find(
			(empresa) =>
				normalizeText(empresa.nome).includes(target) ||
				target.includes(normalizeText(empresa.nome)),
		)
	);
}

async function findEmpresaTechnicianByEmail(email, regional = "") {
	const normalizedEmail = String(email || "")
		.trim()
		.toLowerCase();
	if (!normalizedEmail) return null;
	const empresas = await listEmpresasByRegional(regional);
	for (const empresa of empresas) {
		const tecnicos = Array.isArray(empresa.raw?.data?.tecnicos)
			? empresa.raw.data.tecnicos
			: [];
		const tecnico = tecnicos.find(
			(item) =>
				String(
					item.emailHubsoft ||
						item.email_hubsoft ||
						item.emailHubSoft ||
						item.hubsoftEmail ||
						item.email ||
						"",
				)
					.trim()
					.toLowerCase() === normalizedEmail,
		);
		if (tecnico) return { empresa, tecnico };
	}
	return null;
}

function buildEmpresaOptionsMessage(
	config,
	item,
	empresas = [],
	regional = "",
) {
	const options = empresas.slice(0, 20);
	const regionalLabel = regional || "informada";
	item.companyOptions = options.map((empresa, index) => ({
		...empresa,
		option: index + 1,
	}));
	if (!options.length) {
		return getTemplate(config, "empresaSemCadastroRegional", {
			regional: regionalLabel,
			protocolo: item.protocol,
		});
	}
	return [
		getTemplate(config, "empresaListaCabecalho", { regional: regionalLabel }),
		"",
		...options.map((empresa, index) => `${index + 1} - ${empresa.nome}`),
	].join("\n");
}

async function applyEmpresaToTechnician(phone, technician, empresa) {
	return saveTechnician(phone, {
		...(technician || {}),
		empresa: empresa.nome,
		empresaId: empresa.id,
		regional: empresa.regional || technician?.regional || "",
		status: "pendente_email",
	});
}

async function finalizeTechnicianRegistration(
	phone,
	technician,
	validation,
	empresa,
	item,
	config,
) {
	const name = cleanText(
		validation?.nome ||
			technician?.name ||
			technician?.hubsoftName ||
			item?.name ||
			"",
	);
	const saved = await saveTechnician(phone, {
		...(technician || {}),
		name: name || technician?.name || "",
		hubsoftName: validation?.nome || technician?.hubsoftName || "",
		hubsoftEmail: validation?.email || technician?.hubsoftEmail || "",
		seniorId: validation?.seniorId || technician?.seniorId || "",
		hubsoftId: validation?.hubsoftId || technician?.hubsoftId || "",
		empresa: empresa?.nome || technician?.empresa || "",
		empresaId: empresa?.id || technician?.empresaId || "",
		city: technician?.city || item?.city || "",
		regional: empresa?.regional || technician?.regional || item?.regional || "",
		status: "validado",
		validatedAt: nowIso(),
	});
	if (config.autoSyncEmpresaTecnico)
		await syncEmpresaTecnico(saved).catch((error) =>
			appendLog("sync_empresa_error", error?.message || String(error), {
				phone,
			}),
		);
	return saved;
}

function extractComparableText(data = {}) {
	return normalizeText(JSON.stringify(data || {}));
}

function tokenizeSearchText(value = "") {
	return normalizeText(value)
		.split(/[^a-z0-9]+/i)
		.map((token) => token.trim())
		.filter((token) => token.length >= 2 && !TEXT_STOP_WORDS.has(token));
}

function levenshteinDistance(a = "", b = "") {
	if (a === b) return 0;
	if (!a) return b.length;
	if (!b) return a.length;
	const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
	const current = Array.from({ length: b.length + 1 }, () => 0);
	for (let i = 1; i <= a.length; i += 1) {
		current[0] = i;
		for (let j = 1; j <= b.length; j += 1) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			current[j] = Math.min(
				previous[j] + 1,
				current[j - 1] + 1,
				previous[j - 1] + cost,
			);
		}
		for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
	}
	return previous[b.length];
}

function tokenMatchesQueryToken(sourceToken = "", queryToken = "") {
	if (!sourceToken || !queryToken) return false;
	if (sourceToken === queryToken) return true;
	if (sourceToken.includes(queryToken) || queryToken.includes(sourceToken))
		return true;
	if (queryToken.length >= 4 && sourceToken.length >= 4)
		return levenshteinDistance(sourceToken, queryToken) <= 1;
	return false;
}

function matchesSearchQuery(order = {}, query = "") {
	const target = normalizeText(query);
	if (!target) return false;
	const haystack = extractComparableText(order);
	if (haystack.includes(target)) return true;

	const queryDigits = onlyDigits(query);
	if (queryDigits && onlyDigits(JSON.stringify(order)).includes(queryDigits))
		return true;

	const queryTokens = tokenizeSearchText(query);
	if (!queryTokens.length) return false;
	const sourceTokens = tokenizeSearchText(haystack);
	const matched = queryTokens.filter((queryToken) =>
		sourceTokens.some((sourceToken) =>
			tokenMatchesQueryToken(sourceToken, queryToken),
		),
	).length;
	const required = Math.max(2, Math.ceil(queryTokens.length * 0.7));
	return matched >= Math.min(required, queryTokens.length);
}

function getOrderCustomerName(order = {}) {
	return cleanText(
		order.cliente ||
			order.nome_cliente ||
			order.nome_razaosocial ||
			order.assinante ||
			order.nome ||
			"",
	);
}

function matchesStrictCustomerName(order = {}, customerName = "") {
	const orderName = normalizeText(getOrderCustomerName(order));
	const targetName = normalizeText(customerName);
	if (!orderName || !targetName) return false;
	if (orderName === targetName) return true;
	if (
		targetName.length >= 8 &&
		(orderName.includes(targetName) || targetName.includes(orderName))
	)
		return true;

	const targetTokens = tokenizeSearchText(targetName).filter(
		(token) => token.length >= 3,
	);
	const orderTokens = tokenizeSearchText(orderName).filter(
		(token) => token.length >= 3,
	);
	if (!targetTokens.length || !orderTokens.length) return false;

	const firstTokenMatches = orderTokens.some((sourceToken) =>
		tokenMatchesQueryToken(sourceToken, targetTokens[0]),
	);
	if (!firstTokenMatches) return false;

	const matched = targetTokens.filter((queryToken) =>
		orderTokens.some((sourceToken) =>
			tokenMatchesQueryToken(sourceToken, queryToken),
		),
	).length;
	const required = Math.max(2, Math.ceil(targetTokens.length * 0.85));
	return matched >= Math.min(required, targetTokens.length);
}

function orderFieldDigitsMatch(order = {}, keys = [], value = "") {
	const targetDigits = onlyDigits(value);
	if (targetDigits.length < 3) return false;
	return keys.some((key) => onlyDigits(order?.[key]).includes(targetDigits));
}

function matchesCustomerOrder(order = {}, lookup = {}) {
	if (
		orderFieldDigitsMatch(
			order,
			["contrato", "codigo_contrato", "id_contrato"],
			lookup.contrato,
		)
	)
		return true;
	if (
		orderFieldDigitsMatch(
			order,
			["codigo_cliente", "codigo", "cod_cliente"],
			lookup.codigoCliente,
		)
	)
		return true;
	return matchesStrictCustomerName(order, lookup.cliente);
}

function readOrderField(data = {}, keys = []) {
	for (const key of keys) {
		const value = data?.[key];
		if (value !== undefined && value !== null && String(value).trim() !== "")
			return value;
	}
	return "";
}

function normalizeBacklogOrder(row = {}) {
	const data = row.data || row || {};
	const os =
		cleanText(
			readOrderField(data, [
				"num_os",
				"os",
				"numero_os",
				"numero_ordem_servico",
				"codigo_os",
				"id",
			]),
		) || cleanText(row.documentId);
	const cliente = cleanText(
		readOrderField(data, [
			"nome_cliente",
			"cliente",
			"nome_razaosocial",
			"assinante",
			"nome",
		]),
	);
	const codigoCliente = cleanText(
		readOrderField(data, ["codigo_cliente", "codigo", "cod_cliente"]),
	);
	const contrato = cleanText(
		readOrderField(data, ["contrato", "codigo_contrato", "id_contrato"]),
	);
	const cidade =
		cleanText(readOrderField(data, ["cidade", "city"])) ||
		"Cidade não informada";
	const regional =
		cleanText(
			readOrderField(data, ["regional", "regionalNome", "nomeRegional"]),
		) || "Sem Regional";
	const tipo =
		cleanText(
			readOrderField(data, [
				"tipo",
				"tipo_ordem_servico",
				"tipo_os",
				"servico_tipo",
				"servico",
			]),
		) || "Tipo não informado";
	const status =
		cleanText(
			readOrderField(data, ["status_os", "status", "situacao", "estado"]),
		) || "Aberta";
	return {
		id: cleanText(row.documentId) || os || crypto.randomUUID(),
		...data,
		os,
		codigo: os,
		codigo_cliente: codigoCliente,
		cliente: cliente || "Cliente não informado",
		contrato,
		cidade,
		regional,
		tipo,
		status_os: status,
		status,
		origem: "Backlog de O.S.",
	};
}

function isClosedOrder(order = {}) {
	const status = normalizeText(
		order.status_os || order.status || order.situacao || order.estado,
	);
	return ["concluido", "cancelado", "fechado", "finalizado"].includes(status);
}

function filterByTechnicianRegional(order = {}, technician = {}) {
	const regional = normalizeText(technician.regional);
	const orderRegional = normalizeText(
		order.regional || order.regionalNome || order.nomeRegional,
	);
	return !regional || !orderRegional || orderRegional === regional;
}

async function loadBacklogOpenOrders() {
	const rows = await documents
		.listAllDocuments("ordens_abertas")
		.catch(() => []);
	return rows
		.map(normalizeBacklogOrder)
		.filter((order) => order.os && !isClosedOrder(order));
}

async function searchOpenOrders(
	query,
	technician = {},
	{ limit = 5, mode = "text" } = {},
) {
	const target = normalizeText(
		mode === "customer"
			? query?.cliente || query?.contrato || query?.codigoCliente
			: query,
	);
	if (!target) return [];
	const orders = await loadBacklogOpenOrders();
	const matchesMode = (order) => {
		if (mode === "customer") return matchesCustomerOrder(order, query || {});
		if (mode === "city") return normalizeText(order.cidade).includes(target);
		return matchesSearchQuery(order, query);
	};
	const regionalMatches = orders
		.filter((order) => filterByTechnicianRegional(order, technician))
		.filter(matchesMode);
	const results = regionalMatches.length
		? regionalMatches
		: orders.filter(matchesMode);
	return results.slice(0, limit);
}

function formatOpenOrdersResult(
	config,
	items = [],
	{ includeOptions = false } = {},
) {
	if (!items.length) return getTemplate(config, "consultaOsSemResultado");
	const message = [
		getTemplate(config, "consultaOsResultadoCabecalho", {
			total: items.length,
		}),
		"",
		...items.map((item, index) => {
			return getTemplate(config, "consultaOsResultadoItem", {
				indice: index + 1,
				codigo: item.codigo || item.os || item.contrato || item.id || "-",
				cliente: item.cliente || "Cliente não informado",
				tipo: item.tipo || "Tipo não informado",
				cidade: item.cidade || "Cidade não informada",
				status: item.status_os || item.status || "Aberta",
			});
		}),
	].join("\n");
	return includeOptions
		? `${message}\n\n${getTemplate(config, "consultaOsResultadoOpcoes")}`
		: message;
}

function maskLgpdName(value = "") {
	const tokens = cleanText(value).split(/\s+/).filter(Boolean);
	if (!tokens.length) return "-";
	const [first, ...rest] = tokens;
	const firstMasked = `${first.slice(0, Math.min(3, first.length)).toUpperCase()}***`;
	const initials = rest
		.map((token) => `${token.charAt(0).toUpperCase()}.`)
		.join(" ");
	return [firstMasked, initials].filter(Boolean).join(" ");
}

function getEquipmentProductName(primary = {}) {
	return cleanText(
		primary.produtoNome ||
			primary.produto_nome ||
			primary.modelo ||
			primary.model ||
			primary.descricao ||
			"",
	);
}

function getEquipmentLinkedCustomer(primary = {}) {
	return cleanText(
		primary.vinculadoEm ||
			primary.vinculado_em ||
			primary.cliente?.nome ||
			primary.clienteNome ||
			primary.nomeCliente ||
			"",
	);
}

function isRetiradaOrder(item = {}) {
	const type = normalizeText(
		item.tipo || item.tipo_os || item.servico || item.servico_tipo || "",
	);
	return type.includes("retirada") || type.includes("cancelamento");
}

function getOrderTypeLabel(items = []) {
	const first = items.find((item) => isRetiradaOrder(item)) || items[0] || {};
	const type = cleanText(
		first.tipo ||
			first.tipo_os ||
			first.servico_tipo ||
			first.servico ||
			"retirada",
	);
	return type || "retirada";
}

function getOrderUniqueKey(order = {}) {
	return normalizeText(
		order.codigo ||
			order.os ||
			order.num_os ||
			order.numero_os ||
			order.contrato ||
			order.id ||
			JSON.stringify(order),
	);
}

function uniqueOrders(items = []) {
	const seen = new Set();
	return (Array.isArray(items) ? items : []).filter((order) => {
		const key = getOrderUniqueKey(order);
		if (!key || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function formatMacWithdrawalLookup(config, items = []) {
	const retiradaItems = uniqueOrders(
		items.filter((item) => isRetiradaOrder(item)),
	);
	if (!retiradaItems.length)
		return getTemplate(config, "consultaMacClienteRetiradaSemResultado");
	return [
		getTemplate(config, "consultaMacClienteRetiradaResultado", {
			total: retiradaItems.length,
			tipo: getOrderTypeLabel(retiradaItems),
		}),
		"",
		getTemplate(config, "consultaMacClienteRetiradaOpcoes"),
	].join("\n");
}

function formatEquipmentResult(config, result = {}) {
	if (!result?.found) return getTemplate(config, "consultaMacSemResultado");
	const primary = result.primary || result.equipment?.[0] || {};
	const linkedCustomer = getEquipmentLinkedCustomer(primary);
	const contract =
		primary.contrato || primary.contratoId || primary.contrato_id || "";
	return getTemplate(config, "consultaMacResultado", {
		mac: result.mac || primary.mac || primary.serie || "-",
		modelo: getEquipmentProductName(primary) || "-",
		status: primary.status || primary.situacao || "-",
		cliente_vinculado: linkedCustomer ? maskLgpdName(linkedCustomer) : "-",
		contrato: contract,
		contrato_linha: contract ? `\nContrato: ${contract}` : "",
	});
}

function registerInvalidAttempt(item, config, fallbackText) {
	const attempts = Number(item.invalidAttempts || 0) + 1;
	item.invalidAttempts = attempts;
	const limit = Math.max(
		Number(config.maxInvalidAttempts || DEFAULT_CONFIG.maxInvalidAttempts) || 2,
		1,
	);
	if (attempts >= limit) {
		item.status = "encerrado";
		item.step = "encerrado";
		item.timeline = [
			...(item.timeline || []),
			{
				at: nowIso(),
				type: "invalid_limit",
				message: `Atendimento encerrado apos ${attempts} tentativa(s) invalida(s).`,
			},
		].slice(-100);
		return buildClosureMessage(
			config,
			item,
			getTemplate(config, "limiteTentativas"),
		);
	}
	return `${fallbackText}\n\n${getTemplate(config, "tentativaInvalida", { tentativa: attempts, limite: limit })}`;
}

function isStartOverCommand(text) {
	const normalized = normalizeText(text);
	return [
		"oi",
		"ola",
		"olá",
		"menu",
		"iniciar",
		"inicio",
		"começar",
		"comecar",
	].includes(normalized);
}

function resetCaseConversation(item, technician) {
	item.invalidAttempts = 0;
	item.companySearchAttempts = 0;
	item.context = { ...(item.context || {}), reiniciadoEm: nowIso() };
	item.status = "em_atendimento";
	item.step = technician?.status === "validado" ? "menu" : "onboarding_name";
	item.timeline = [
		...(item.timeline || []),
		{
			at: nowIso(),
			type: "restart",
			message: "Fluxo reiniciado pelo técnico.",
		},
	].slice(-100);
}

function generateProtocol() {
	const date = new Intl.DateTimeFormat("pt-BR", {
		timeZone: "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	})
		.format(new Date())
		.split("/")
		.reverse()
		.join("");
	return `ATD-MG-${date}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

async function createCase(phone, patch = {}) {
	const id = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
	const item = {
		id,
		protocol: generateProtocol(),
		phone: normalizePhone(phone),
		status: "em_atendimento",
		step: "onboarding_name",
		type: "cadastro",
		messages: [],
		timeline: [],
		createdAt: nowIso(),
		updatedAt: nowIso(),
		...(patch || {}),
	};
	await saveCase(item);
	await notifyBackofficeNewCase(item);
	return item;
}

function getRatingTarget(item = {}, fallbackName = "Retorninho") {
	return {
		user: item.assignedTo || "",
		name: item.assignedToName || fallbackName || "Retorninho",
	};
}

function applyRatingTarget(item, target = {}) {
	item.ratingTargetUser = target.user || "";
	item.ratingTargetName = target.name || "Retorninho";
	item.avaliadoUser = item.ratingTargetUser;
	item.avaliadoNome = item.ratingTargetName;
}

function markCaseAwaitingRating(
	item,
	config,
	closedByName = "Técnico",
	{ closedBy = "", technician = null } = {},
) {
	const closedAt = nowIso();
	const target = getRatingTarget(item);
	const responseText = getTemplate(config, "solicitarAvaliacao", {
		nome: closedByName,
		protocolo: item.protocol,
		data_encerramento: formatSaoPauloDateTime(closedAt),
	});
	item.status = "aguardando_avaliacao";
	item.step = "awaiting_rating";
	item.closedAt = closedAt;
	item.closedBy = closedBy || item.closedBy || "";
	item.closedByName = closedByName;
	item.closedReason = "Encerrado pelo técnico no WhatsApp";
	if (technician) item.technician = technician;
	applyRatingTarget(item, target);
	item.timeline = [
		...(item.timeline || []),
		{
			at: closedAt,
			type: "encerrado",
			user: item.closedBy,
			userName: closedByName,
			ratingTargetName: item.ratingTargetName,
			message: item.closedReason,
		},
	].slice(-100);
	return responseText;
}

function openOrdersLookupMenu(config, flowType = "consulta_os") {
	return getTemplate(config, "consultaOsMenu", { tipo_fluxo: flowType });
}

function createOrdersBackofficeCase(
	item,
	technician,
	orders = [],
	origin = "consulta_os",
) {
	const selectedOrders = uniqueOrders(orders);
	item.status = "aguardando_backoffice";
	item.step = "manual_backoffice";
	item.type =
		origin === "solicitacao_retirada"
			? "solicitacao_retirada"
			: "solicitacao_os";
	item.technician = technician;
	item.context = {
		...(item.context || {}),
		origem: origin,
		ordensSelecionadas: selectedOrders,
	};
	item.timeline = [
		...(item.timeline || []),
		{
			at: nowIso(),
			type: "backoffice_requested",
			message: `Técnico solicitou tratativa de ${selectedOrders.length} ordem(ns).`,
		},
	].slice(-100);
}

async function saveCase(item = {}) {
	const next = { ...(item || {}), updatedAt: nowIso() };
	await upsertDoc(
		`${CASES_COLLECTION}/${next.id}`,
		CASES_COLLECTION,
		next.id,
		next,
	);
	broadcastRealtime("atendimento", {
		action: "case_upsert",
		id: next.id,
		status: next.status,
	});
	return next;
}

async function findActiveCase(phone) {
	const rows = await documents.listAllDocuments(CASES_COLLECTION);
	return (
		rows
			.map((row) => row.data)
			.filter((item) => normalizePhone(item.phone) === normalizePhone(phone))
			.filter(
				(item) =>
					!["encerrado", "resolvido", "cancelado"].includes(
						String(item.status || ""),
					),
			)
			.sort((a, b) =>
				String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
			)[0] || null
	);
}

// Extraido de handleEvolutionWebhook (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — comando de reiniciar a conversa, mesma logica
// de antes (mesmo `if` original, so que devolvendo null quando nao se
// aplica em vez de cair no restante do fluxo).
async function handleRestartCommand(config, phone, item, technician, text) {
	if (isStartOverCommand(text) && item.step !== "awaiting_rating") {
		resetCaseConversation(item, technician);
		const responseText =
			technician?.status === "validado"
				? getTemplate(config, "boasVindasValidado", {
						nome:
							technician.name ||
							technician.hubsoftName ||
							item.whatsappName ||
							"Técnico",
						menu: config.templates.menu,
						protocolo: item.protocol,
					})
				: config.templates.saudacao;
		item.messages.push({ at: nowIso(), direction: "out", text: responseText });
		await sendMessage(config, phone, responseText, {
			caseId: item.id,
			action: "restart",
		});
		await saveCase(item);
		return {
			ok: true,
			status: item.status,
			caseId: item.id,
			protocol: item.protocol,
			restarted: true,
		};
	}
	return null;
}

// Extraido de handleEvolutionWebhook (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — passo de avaliacao (1 a 5 estrelas), mesma
// logica de antes.
async function handleAwaitingRatingStep(config, phone, item, text) {
	if (item.step === "awaiting_rating") {
		const rating = Number.parseInt(text, 10);
		if (Number.isInteger(rating) && rating >= 1 && rating <= 5) {
			if (!item.ratingTargetName)
				applyRatingTarget(item, getRatingTarget(item));
			item.rating = rating;
			item.ratingAt = nowIso();
			item.status = "encerrado";
			item.step = "encerrado";
			item.timeline = [
				...(item.timeline || []),
				{
					at: nowIso(),
					type: "avaliacao",
					message: `Avaliação registrada: ${rating}/5.`,
				},
			].slice(-100);
			const responseText = getTemplate(config, "avaliacaoRegistrada", {
				nota: rating,
				protocolo: item.protocol,
			});
			item.messages.push({
				at: nowIso(),
				direction: "out",
				text: responseText,
			});
			await sendMessage(config, phone, responseText, {
				caseId: item.id,
				action: "rating",
			});
			await saveCase(item);
			return {
				ok: true,
				status: item.status,
				caseId: item.id,
				protocol: item.protocol,
				rating,
			};
		}
		const responseText = getTemplate(config, "avaliacaoInvalida", {
			protocolo: item.protocol,
		});
		item.messages.push({ at: nowIso(), direction: "out", text: responseText });
		await sendMessage(config, phone, responseText, {
			caseId: item.id,
			action: "rating_invalid",
		});
		await saveCase(item);
		return {
			ok: true,
			status: item.status,
			caseId: item.id,
			protocol: item.protocol,
		};
	}
	return null;
}

// Extraido de handleEvolutionWebhook (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — comando de encerrar atendimento, mesma logica
// de antes.
async function handleEncerrarCommand(config, phone, item, technician, text) {
	if (text === "5" || normalizeText(text).includes("encerrar")) {
		const technicianName =
			technician?.name || technician?.hubsoftName || item.name || "Técnico";
		const responseText = markCaseAwaitingRating(item, config, technicianName, {
			technician,
		});
		item.messages.push({ at: nowIso(), direction: "out", text: responseText });
		await sendMessage(config, phone, responseText, {
			caseId: item.id,
			action: "encerrar_whatsapp",
		});
		await saveCase(item);
		await appendLog(
			"webhook",
			"Atendimento encerrado pelo tecnico e enviado para avaliacao.",
			{ phone, caseId: item.id, protocol: item.protocol },
		);
		return {
			ok: true,
			status: item.status,
			caseId: item.id,
			protocol: item.protocol,
		};
	}
	return null;
}

// Extraido de handleEvolutionWebhook (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — saudacao inicial pra tecnico novo/nao
// validado, mesma logica de antes.
async function handleNewTechnicianGreeting(config, phone, item, technician, isNew) {
	if (isNew && (!technician || technician.status !== "validado")) {
		item.messages.push({
			at: nowIso(),
			direction: "out",
			text: config.templates.saudacao,
		});
		await sendMessage(config, phone, config.templates.saudacao, {
			caseId: item.id,
		});
		await saveCase(item);
		return {
			ok: true,
			status: item.status,
			caseId: item.id,
			protocol: item.protocol,
		};
	}
	return null;
}

// Extraido de handleEvolutionWebhook (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — boas-vindas pra tecnico ja validado, mesma
// logica de antes.
async function handleReturningValidatedGreeting(config, phone, item, technician, isNew) {
	if (isNew && technician?.status === "validado") {
		const responseText = getTemplate(config, "boasVindasValidado", {
			nome:
				technician.name ||
				technician.hubsoftName ||
				item.whatsappName ||
				"Técnico",
			menu: config.templates.menu,
			protocolo: item.protocol,
		});
		item.messages.push({ at: nowIso(), direction: "out", text: responseText });
		await sendMessage(config, phone, responseText, { caseId: item.id });
		await saveCase(item);
		return {
			ok: true,
			status: item.status,
			caseId: item.id,
			protocol: item.protocol,
		};
	}
	return null;
}

// Extraido de handleEvolutionWebhook (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — dispatch principal por `item.step`/comando de
// menu, mesma logica de antes (mesma cadeia if/else if, sem mudanca de
// comportamento). Muta `item` e devolve o texto de resposta.
async function computeStepResponse(item, technician, text, config, phone) {
	let responseText = "";
	if (item.step === "onboarding_name") {
		if (cleanText(text).length < 3) {
			responseText = registerInvalidAttempt(
				item,
				config,
				getTemplate(config, "nomeInvalido"),
			);
		} else {
			item.invalidAttempts = 0;
			item.name = cleanText(text);
			technician = await saveTechnician(phone, {
				...(technician || {}),
				name: item.name,
				whatsappName: item.whatsappName || "",
				status: "pendente_cidade",
			});
			item.step = "onboarding_city";
			responseText = config.templates.pedirCidade;
		}
	} else if (item.step === "onboarding_city") {
		const location = await findRegionalByCity(text);
		if (!location?.regional) {
			responseText = registerInvalidAttempt(
				item,
				config,
				getTemplate(config, "cidadeNaoEncontrada"),
			);
		} else {
			item.invalidAttempts = 0;
			technician = await saveTechnician(phone, {
				city: location.cidade,
				regional: location.regional,
				status: "pendente_email",
			});
			item.city = location.cidade;
			item.regional = location.regional;
			item.step = "onboarding_email";
			responseText = getTemplate(config, "regionalEncontrada", {
				regional: location.regional,
				pedir_empresa: config.templates.pedirEmail,
			});
		}
	} else if (item.step === "onboarding_company") {
		const empresa = await findEmpresaByTextAndRegional(
			text,
			technician?.regional || item.regional || "",
		);
		if (empresa) {
			item.invalidAttempts = 0;
			item.pendingEmpresa = empresa;
			item.step = "confirm_company";
			responseText = getTemplate(config, "empresaConfirmacao", {
				empresa: empresa.nome,
				regional_linha: empresa.regional ? ` - ${empresa.regional}` : "",
			});
		} else {
			const attempts = Number(item.companySearchAttempts || 0) + 1;
			item.companySearchAttempts = attempts;
			if (attempts >= 2) {
				item.invalidAttempts = 0;
				item.step = "select_company";
				const empresas = await listEmpresasByRegional(
					technician?.regional || item.regional || "",
				);
				responseText = buildEmpresaOptionsMessage(
					config,
					item,
					empresas,
					technician?.regional || item.regional || "",
				);
			} else {
				responseText = getTemplate(config, "empresaNaoEncontradaPrimeira");
			}
		}
	} else if (item.step === "confirm_company") {
		if (text === "1") {
			item.invalidAttempts = 0;
			if (item.pendingEmailValidation) {
				technician = await finalizeTechnicianRegistration(
					phone,
					technician,
					item.pendingEmailValidation,
					item.pendingEmpresa,
					item,
					config,
				);
				item.empresa = technician.empresa;
				item.empresaId = technician.empresaId;
				item.pendingEmailValidation = null;
				item.pendingEmpresa = null;
				item.step = "menu";
				responseText = config.templates.menu;
			} else {
				technician = await applyEmpresaToTechnician(
					phone,
					technician,
					item.pendingEmpresa,
				);
				item.empresa = technician.empresa;
				item.empresaId = technician.empresaId;
				item.step = "onboarding_email";
				responseText = config.templates.pedirEmail;
			}
		} else if (text === "2") {
			item.invalidAttempts = 0;
			item.pendingEmpresa = null;
			item.companySearchAttempts = Number(item.companySearchAttempts || 0);
			item.step = "onboarding_company";
			responseText = getTemplate(config, "empresaTentarNovamente");
		} else {
			responseText = registerInvalidAttempt(
				item,
				config,
				getTemplate(config, "empresaConfirmacaoInvalida"),
			);
		}
	} else if (item.step === "select_company") {
		const selected = item.companyOptions?.find(
			(option) => String(option.option) === text,
		);
		if (selected) {
			item.invalidAttempts = 0;
			if (item.pendingEmailValidation) {
				technician = await finalizeTechnicianRegistration(
					phone,
					technician,
					item.pendingEmailValidation,
					selected,
					item,
					config,
				);
				item.empresa = technician.empresa;
				item.empresaId = technician.empresaId;
				item.pendingEmailValidation = null;
				item.step = "menu";
				responseText = config.templates.menu;
			} else {
				technician = await applyEmpresaToTechnician(
					phone,
					technician,
					selected,
				);
				item.empresa = technician.empresa;
				item.empresaId = technician.empresaId;
				item.step = "onboarding_email";
				responseText = config.templates.pedirEmail;
			}
		} else {
			responseText = registerInvalidAttempt(
				item,
				config,
				getTemplate(config, "empresaListaInvalida"),
			);
		}
	} else if (item.step === "onboarding_email") {
		const validation = await validateHubsoftEmail(text);
		if (!validation.ok)
			responseText = registerInvalidAttempt(
				item,
				config,
				`${config.templates.naoEntendi}\n${validation.error || "E-mail não validado."}`,
			);
		else {
			item.invalidAttempts = 0;
			const companyTechnician = await findEmpresaTechnicianByEmail(
				validation.email,
				technician?.regional || item.regional || "",
			);
			if (companyTechnician?.empresa) {
				technician = await finalizeTechnicianRegistration(
					phone,
					technician,
					validation,
					companyTechnician.empresa,
					item,
					config,
				);
				item.name = technician.name || item.name;
				item.empresa = technician.empresa;
				item.empresaId = technician.empresaId;
				item.regional = technician.regional || item.regional;
				item.step = "menu";
				responseText = [
					getTemplate(config, "emailEmpresaEncontrada", {
						empresa: technician.empresa || companyTechnician.empresa.nome,
						regional_linha: technician.regional
							? ` - ${technician.regional}`
							: "",
					}),
					"",
					config.templates.menu,
				].join("\n");
			} else {
				item.pendingEmailValidation = validation;
				technician = await saveTechnician(phone, {
					...(technician || {}),
					hubsoftEmail: validation.email,
					hubsoftName: validation.nome,
					seniorId: validation.seniorId,
					hubsoftId: validation.hubsoftId,
					status: "pendente_empresa",
				});
				item.step = "onboarding_company";
				responseText = getTemplate(config, "emailEmpresaNaoEncontrada");
			}
		}
	} else if (item.step === "os_lookup_menu") {
		if (text === "1") {
			item.invalidAttempts = 0;
			item.step = "consulta_os";
			responseText = getTemplate(config, "consultaOsPergunta");
		} else if (text === "2") {
			item.invalidAttempts = 0;
			item.step = "consulta_os_cidade";
			responseText = getTemplate(config, "consultaOsCidadePergunta");
		} else if (text === "3") {
			item.invalidAttempts = 0;
			item.step = "menu";
			responseText = config.templates.menu;
		} else {
			responseText = registerInvalidAttempt(
				item,
				config,
				getTemplate(config, "consultaOsMenuInvalido"),
			);
		}
	} else if (item.step === "consulta_os") {
		item.invalidAttempts = 0;
		const orders = await searchOpenOrders(text, technician || {}, {
			limit: 10,
		});
		item.lastOpenOrders = orders;
		item.step = orders.length ? "os_results_menu" : "menu";
		responseText = orders.length
			? formatOpenOrdersResult(config, orders, { includeOptions: true })
			: `${formatOpenOrdersResult(config, orders)}\n\n${config.templates.menu}`;
	} else if (item.step === "consulta_os_cidade") {
		item.invalidAttempts = 0;
		const orders = await searchOpenOrders(text, technician || {}, {
			limit: 10,
			mode: "city",
		});
		item.lastOpenOrders = orders;
		item.lastOpenOrdersCity = cleanText(text);
		item.step = orders.length ? "os_results_menu" : "menu";
		responseText = orders.length
			? formatOpenOrdersResult(config, orders, { includeOptions: true })
			: `${formatOpenOrdersResult(config, orders)}\n\n${config.templates.menu}`;
	} else if (item.step === "os_results_menu") {
		const normalized = normalizeText(text);
		if (
			normalized.includes("solicitar ordens") ||
			normalized.includes("solicitar ordem") ||
			text === "1"
		) {
			item.invalidAttempts = 0;
			createOrdersBackofficeCase(
				item,
				technician,
				item.lastOpenOrders || [],
				item.osFlowType || "consulta_os",
			);
			responseText = applyTemplate(config.templates.casoCriado, {
				protocolo: item.protocol,
			});
		} else if (normalized.includes("menu") || text === "2") {
			item.invalidAttempts = 0;
			item.step = "menu";
			responseText = config.templates.menu;
		} else {
			responseText = registerInvalidAttempt(
				item,
				config,
				getTemplate(config, "consultaOsResultadoOpcoes"),
			);
		}
	} else if (item.step === "consulta_mac") {
		try {
			item.invalidAttempts = 0;
			const result = await sempreIntegration.consultEquipment(text);
			const primary = result.primary || result.equipment?.[0] || {};
			item.lastEquipmentLookup = {
				mac: result.mac,
				produto: getEquipmentProductName(primary),
				cliente: getEquipmentLinkedCustomer(primary),
				contrato: cleanText(
					primary.contrato || primary.contratoId || primary.contrato_id || "",
				),
				codigoCliente: cleanText(
					primary.codigoCliente ||
						primary.codigo_cliente ||
						primary.codCliente ||
						primary.cod_cliente ||
						"",
				),
				vinculadoId: primary.vinculadoId || primary.vinculado_id || "",
				status: primary.status || "",
			};
			item.step = result?.found ? "consulta_mac_menu" : "menu";
			responseText = result?.found
				? `${formatEquipmentResult(config, result)}\n\n${getTemplate(config, "consultaMacMenu")}`
				: `${formatEquipmentResult(config, result)}\n\n${config.templates.menu}`;
		} catch (error) {
			responseText = registerInvalidAttempt(
				item,
				config,
				error?.message || getTemplate(config, "consultaMacErro"),
			);
		}
	} else if (item.step === "consulta_mac_menu") {
		if (text === "1") {
			item.invalidAttempts = 0;
			const lookup = item.lastEquipmentLookup || {};
			const orders = lookup.cliente
				? await searchOpenOrders(lookup, technician || {}, {
						limit: 10,
						mode: "customer",
					})
				: [];
			const retiradaOrders = uniqueOrders(
				orders.filter((order) => isRetiradaOrder(order)),
			);
			item.lastEquipmentWithdrawalOrders = retiradaOrders;
			item.step = retiradaOrders.length ? "consulta_mac_retirada_menu" : "menu";
			responseText = retiradaOrders.length
				? formatMacWithdrawalLookup(config, retiradaOrders)
				: `${getTemplate(config, "consultaMacClienteRetiradaSemResultado")}\n\n${config.templates.menu}`;
		} else if (text === "2") {
			item.invalidAttempts = 0;
			item.step = "menu";
			responseText = config.templates.menu;
		} else {
			responseText = registerInvalidAttempt(
				item,
				config,
				getTemplate(config, "naoEntendi"),
			);
		}
	} else if (item.step === "consulta_mac_retirada_menu") {
		if (text === "1") {
			item.invalidAttempts = 0;
			createOrdersBackofficeCase(
				item,
				technician,
				item.lastEquipmentWithdrawalOrders || [],
				"consulta_mac",
			);
			item.context = {
				...(item.context || {}),
				origem: "consulta_mac",
				equipamento: item.lastEquipmentLookup || null,
				ordensRetirada: uniqueOrders(item.lastEquipmentWithdrawalOrders || []),
			};
			responseText = applyTemplate(config.templates.casoCriado, {
				protocolo: item.protocol,
			});
		} else if (text === "2") {
			responseText = markCaseAwaitingRating(
				item,
				config,
				technician?.name || technician?.hubsoftName || item.name || "Técnico",
				{ technician },
			);
		} else {
			responseText = registerInvalidAttempt(
				item,
				config,
				getTemplate(config, "naoEntendi"),
			);
		}
	} else if (text === "1") {
		item.invalidAttempts = 0;
		item.osFlowType = "consulta_os";
		item.step = "os_lookup_menu";
		responseText = openOrdersLookupMenu(config, item.osFlowType);
	} else if (text === "2") {
		item.invalidAttempts = 0;
		item.step = "consulta_mac";
		responseText = getTemplate(config, "consultaMacPergunta");
	} else if (
		text === "4" ||
		normalizeText(text).includes("atualizar cadastro")
	) {
		item.invalidAttempts = 0;
		item.companySearchAttempts = 0;
		item.step = "onboarding_name";
		responseText = getTemplate(config, "atualizarCadastroInicio");
	} else if (normalizeText(text).includes("retirada") || text === "3") {
		item.invalidAttempts = 0;
		item.osFlowType = "solicitacao_retirada";
		item.step = "os_lookup_menu";
		responseText = openOrdersLookupMenu(config, item.osFlowType);
	} else {
		item.step = "menu";
		responseText = config.templates.menu;
	}

	return responseText;
}

async function handleEvolutionWebhook(payload = {}) {
	const phone = extractPhone(payload);
	const text = extractText(payload);
	const payloadSummary = summarizeWebhookPayload(payload);
	if (payload.data?.key?.fromMe || payload.key?.fromMe) {
		await recordMessage({
			direction: "in",
			phone,
			text,
			status: "ignorado",
			reason: "from_me",
			payload: payloadSummary,
		});
		return { ok: true, ignored: true, reason: "from_me" };
	}
	const config = await readConfig();
	if (!config.enabled) {
		await recordMessage({
			direction: "in",
			phone,
			text,
			status: "ignorado",
			reason: "bot_disabled",
			payload: payloadSummary,
		});
		await appendLog(
			"webhook_ignored",
			"Mensagem recebida, mas o bot do atendimento esta desativado.",
			{ phone, textPreview: text.slice(0, 80) },
		);
		return { ok: true, ignored: true, reason: "disabled" };
	}
	if (!phone || !text) {
		await recordMessage({
			direction: "in",
			phone,
			text,
			status: "ignorado",
			reason: !phone ? "missing_phone" : "empty_text",
			payload: payloadSummary,
		});
		await appendLog(
			"webhook_ignored",
			"Mensagem do atendimento ignorada por telefone/texto vazio.",
			{ phone, textPreview: text.slice(0, 80), payload: payloadSummary },
		);
		return { ok: true, ignored: true, reason: "empty" };
	}
	const teamMember = getTeamMember(config, phone);
	await recordMessage({
		direction: "in",
		phone,
		text,
		status: "recebido",
		payload: payloadSummary,
	});
	if (teamMember)
		return handleTeamMemberMessage(config, teamMember, phone, text);
	const technicianRecord = await documents.getDocument(
		`${TECHNICIANS_COLLECTION}/${phone}`,
	);
	let technician = technicianRecord?.data || null;
	let item = await findActiveCase(phone);
	const isNew = !item;
	if (!item)
		item = await createCase(phone, {
			whatsappName: payload.data?.pushName || payload.pushName || "",
			step: technician?.status === "validado" ? "menu" : "onboarding_name",
		});
	item.messages = [
		...(item.messages || []),
		{ at: nowIso(), direction: "in", text },
	].slice(-100);

	const restartResult = await handleRestartCommand(
		config,
		phone,
		item,
		technician,
		text,
	);
	if (restartResult) return restartResult;

	const ratingResult = await handleAwaitingRatingStep(config, phone, item, text);
	if (ratingResult) return ratingResult;

	const encerrarResult = await handleEncerrarCommand(
		config,
		phone,
		item,
		technician,
		text,
	);
	if (encerrarResult) return encerrarResult;

	const newGreetingResult = await handleNewTechnicianGreeting(
		config,
		phone,
		item,
		technician,
		isNew,
	);
	if (newGreetingResult) return newGreetingResult;

	const returningGreetingResult = await handleReturningValidatedGreeting(
		config,
		phone,
		item,
		technician,
		isNew,
	);
	if (returningGreetingResult) return returningGreetingResult;

	const responseText = await computeStepResponse(item, technician, text, config, phone);

	item.messages.push({ at: nowIso(), direction: "out", text: responseText });
	await sendMessage(config, phone, responseText, { caseId: item.id });
	await saveCase(item);
	await appendLog("webhook", "Mensagem processada pelo atendimento.", {
		phone,
		caseId: item.id,
	});
	return {
		ok: true,
		status: item.status,
		caseId: item.id,
		protocol: item.protocol,
	};
}

async function listCollection(collectionPath, query = {}) {
	const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
	const offset = Math.max(Number(query.offset || 0), 0);
	const search = normalizeText(query.search || "");
	let items = (await documents.listAllDocuments(collectionPath)).map((row) => ({
		id: row.documentId,
		...(row.data || {}),
	}));
	if (search)
		items = items.filter((item) =>
			normalizeText(JSON.stringify(item)).includes(search),
		);
	items.sort((a, b) =>
		String(b.updatedAt || b.createdAt || "").localeCompare(
			String(a.updatedAt || a.createdAt || ""),
		),
	);
	return {
		items: items.slice(offset, offset + limit),
		total: items.length,
		limit,
		offset,
	};
}

function summarizeCaseListItem(item = {}) {
	const context =
		item.context && typeof item.context === "object" ? item.context : {};
	const orders = uniqueOrders([
		...(Array.isArray(context.ordensSelecionadas)
			? context.ordensSelecionadas
			: []),
		...(Array.isArray(context.ordensRetirada) ? context.ordensRetirada : []),
		...(Array.isArray(item.lastOpenOrders) ? item.lastOpenOrders : []),
		...(Array.isArray(item.lastEquipmentWithdrawalOrders)
			? item.lastEquipmentWithdrawalOrders
			: []),
	]);
	const messagesCount = Array.isArray(item.messages) ? item.messages.length : 0;
	const timelineCount = Array.isArray(item.timeline) ? item.timeline.length : 0;
	const summary = { ...item };
	delete summary.messages;
	delete summary.timeline;
	delete summary.lastOpenOrders;
	delete summary.lastEquipmentWithdrawalOrders;
	return {
		...summary,
		context: {
			...context,
			ordensSelecionadas: undefined,
			ordensRetirada: undefined,
			ordersCount: orders.length,
		},
		messagesCount,
		timelineCount,
		ordersCount: orders.length,
	};
}

async function listCases(query = {}) {
	const result = await listCollection(CASES_COLLECTION, query);
	return {
		...result,
		items: result.items.map(summarizeCaseListItem),
	};
}

async function listMessages(query = {}) {
	const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
	const offset = Math.max(Number(query.offset || 0), 0);
	const search = normalizeText(query.search || "");
	const direction = cleanText(query.direction || "");
	const status = cleanText(query.status || "");
	let items = (await documents.listAllDocuments(MESSAGES_COLLECTION)).map(
		(row) => ({ id: row.documentId, ...(row.data || {}) }),
	);
	if (direction)
		items = items.filter((item) => String(item.direction || "") === direction);
	if (status)
		items = items.filter((item) => String(item.status || "") === status);
	if (search)
		items = items.filter((item) =>
			normalizeText(JSON.stringify(item)).includes(search),
		);
	items.sort((a, b) =>
		String(b.createdAt || b.updatedAt || "").localeCompare(
			String(a.createdAt || a.updatedAt || ""),
		),
	);
	const summary = items.reduce(
		(acc, item) => {
			const key = `${item.direction || "sem_direcao"}_${item.status || "sem_status"}`;
			acc.total += 1;
			acc[key] = (acc[key] || 0) + 1;
			return acc;
		},
		{ total: 0 },
	);
	return {
		items: items.slice(offset, offset + limit),
		total: items.length,
		limit,
		offset,
		summary,
	};
}

async function listRatings(query = {}) {
	const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
	const offset = Math.max(Number(query.offset || 0), 0);
	const search = normalizeText(query.search || "");
	let items = (await documents.listAllDocuments(CASES_COLLECTION))
		.map((row) => ({ id: row.documentId, ...(row.data || {}) }))
		.filter(
			(item) =>
				Number(item.rating || 0) > 0 || item.status === "aguardando_avaliacao",
		);

	if (search)
		items = items.filter((item) =>
			normalizeText(JSON.stringify(item)).includes(search),
		);
	items.sort((a, b) =>
		String(b.ratingAt || b.closedAt || b.updatedAt || "").localeCompare(
			String(a.ratingAt || a.closedAt || a.updatedAt || ""),
		),
	);

	const rated = items.filter((item) => Number(item.rating || 0) > 0);
	const totalRatings = rated.length;
	const average = totalRatings
		? rated.reduce((sum, item) => sum + Number(item.rating || 0), 0) /
			totalRatings
		: 0;
	const byUser = new Map();
	const byMonth = new Map();

	rated.forEach((item) => {
		const user =
			item.ratingTargetName ||
			item.avaliadoNome ||
			item.assignedToName ||
			"Retorninho";
		const month =
			String(item.ratingAt || item.closedAt || "").slice(0, 7) || "Sem mês";
		const userStats = byUser.get(user) || {
			name: user,
			total: 0,
			sum: 0,
			average: 0,
		};
		userStats.total += 1;
		userStats.sum += Number(item.rating || 0);
		userStats.average = Number((userStats.sum / userStats.total).toFixed(2));
		byUser.set(user, userStats);

		const monthStats = byMonth.get(month) || {
			month,
			total: 0,
			sum: 0,
			average: 0,
		};
		monthStats.total += 1;
		monthStats.sum += Number(item.rating || 0);
		monthStats.average = Number((monthStats.sum / monthStats.total).toFixed(2));
		byMonth.set(month, monthStats);
	});

	return {
		items: items.slice(offset, offset + limit),
		total: items.length,
		limit,
		offset,
		summary: {
			totalRatings,
			pending: items.filter((item) => item.status === "aguardando_avaliacao")
				.length,
			average: Number(average.toFixed(2)),
			byUser: [...byUser.values()]
				.sort((a, b) => b.average - a.average || b.total - a.total)
				.slice(0, 10),
			byMonth: [...byMonth.values()]
				.sort((a, b) => b.month.localeCompare(a.month))
				.slice(0, 12),
		},
	};
}

async function getStats() {
	const rows = await documents
		.listAllDocuments(CASES_COLLECTION)
		.catch(() => []);
	const items = rows.map((row) => ({
		id: row.documentId,
		...(row.data || {}),
	}));
	const isOpen = (item = {}) =>
		String(item.status || "") === "aguardando_backoffice";
	return {
		totalCases: items.length,
		openCases: items.filter(isOpen).length,
		treatmentCases: items.filter(
			(item) => String(item.status || "") === "em_tratativa",
		).length,
		waitingBackofficeCases: items.filter(
			(item) => String(item.status || "") === "aguardando_backoffice",
		).length,
		pendingRatings: items.filter(
			(item) => String(item.status || "") === "aguardando_avaliacao",
		).length,
	};
}

async function getCase(id) {
	const record = await documents.getDocument(`${CASES_COLLECTION}/${id}`);
	if (!record?.data) {
		const error = new Error("Caso não encontrado.");
		error.statusCode = 404;
		throw error;
	}
	return record.data;
}

// Extraido de updateCase (achado javascript:S3776, docs/SONARQUBE-MAP.md)
// — acao "assumir" de um caso de atendimento, mesma logica de antes.
async function applyAssumirAction(action, item, next, userEmail, userName, id) {
	if (action === "assumir") {
		const config = await readConfig();
		const assignedMessage = getTemplate(config, "assumirCaso", {
			nome: `*${userName}*`,
			protocolo: item.protocol,
		});
		next.status = "em_tratativa";
		next.step = item.step === "encerrado" ? "encerrado" : "manual_backoffice";
		next.assignedTo = userEmail;
		next.assignedToName = userName;
		next.assignedAt = nowIso();
		next.messages = [
			...(item.messages || []),
			{
				at: nowIso(),
				direction: "out",
				text: assignedMessage,
				manual: true,
				user: userEmail,
				userName,
			},
		].slice(-100);
		next.timeline = [
			...(item.timeline || []),
			{
				at: nowIso(),
				type: "assumido",
				user: userEmail,
				userName,
				message: `Caso assumido por ${userName}.`,
			},
		].slice(-100);
		await sendMessage(config, item.phone, assignedMessage, {
			caseId: item.id,
			manual: true,
			action: "assumir",
		});
		await appendLog("case_assigned", "Caso assumido.", {
			caseId: id,
			protocol: item.protocol,
			user: userEmail,
			userName,
		});
	}
}

// Extraido de updateCase (achado javascript:S3776, docs/SONARQUBE-MAP.md)
// — acao "encerrar" de um caso de atendimento, mesma logica de antes.
async function applyEncerrarAction(action, item, next, patch, userEmail, userName, id) {
	if (action === "encerrar" || next.status === "encerrado") {
		const config = await readConfig();
		const closedAt = nowIso();
		const ratingTarget = getRatingTarget(item);
		const closureMessage = getTemplate(config, "solicitarAvaliacao", {
			nome: userName,
			protocolo: item.protocol,
			data_encerramento: formatSaoPauloDateTime(closedAt),
		});
		next.status = "aguardando_avaliacao";
		next.step = "awaiting_rating";
		next.closedAt = closedAt;
		next.closedBy = userEmail;
		next.closedByName = userName;
		next.closedReason =
			patch.closedReason || "Encerrado pelo painel de atendimento";
		applyRatingTarget(next, ratingTarget);
		next.messages = [
			...(next.messages || item.messages || []),
			{
				at: nowIso(),
				direction: "out",
				text: closureMessage,
				manual: true,
				user: userEmail,
				userName,
			},
		].slice(-100);
		next.timeline = [
			...(next.timeline || item.timeline || []),
			{
				at: nowIso(),
				type: "encerrado",
				user: userEmail,
				userName,
				message: next.closedReason,
			},
		].slice(-100);
		await sendMessage(config, item.phone, closureMessage, {
			caseId: item.id,
			manual: true,
			action: "encerrar",
		});
		await appendLog("case_closed", "Caso encerrado.", {
			caseId: id,
			protocol: item.protocol,
			user: userEmail,
			userName,
		});
	}
}

async function updateCase(id, patch = {}, user = null) {
	const item = await getCase(id);
	// Defesa contra IDOR (docs/TECHNICAL-AUDIT.md, achado #3): a regional do
	// caso vem do tecnico vinculado (item.technician.regional) — permissao
	// de atendimento.casos.manage sozinha nao basta pra agir sobre um caso
	// de outra regional (mesmo criterio ja usado em agendamentos).
	// `allowUnknownRegional: true` porque um caso pode legitimamente ainda
	// nao ter tecnico/regional vinculado (inicio do fluxo de atendimento) —
	// bloquear nesse caso seria regressao operacional sem ganho de
	// seguranca real.
	assertRegionalRecordAccess(
		user,
		{ regional: item.technician?.regional },
		{ allowUnknownRegional: true },
	);
	const action = String(patch.action || "").toLowerCase();
	const userName = getUserName(user);
	const userEmail = user?.email || user?.uid || "";
	const next = { ...item, ...(patch || {}) };
	delete next.action;

	await applyAssumirAction(action, item, next, userEmail, userName, id);
	await applyEncerrarAction(action, item, next, patch, userEmail, userName, id);

	const saved = await saveCase(next);
	// Auditoria (docs/TECHNICAL-AUDIT.md, achado #5): casos de atendimento
	// nao deixavam rastro nenhum de quem alterou o que. `messages`/
	// `timeline` ficam fora do before/after (sao historico proprio do caso,
	// ja registrado em appendLog/timeline do proprio caso — duplicar aqui
	// so infla audit_logs sem ganho real).
	const stripHistory = (value = {}) => {
		const { messages: _messages, timeline: _timeline, ...rest } = value;
		return rest;
	};
	const beforeAudit = stripHistory(item);
	const afterAudit = stripHistory(saved);
	const changedFields = auditLog.calculateChangedFields(beforeAudit, afterAudit);
	if (changedFields.length) {
		auditLog.recordAuditLog({
			action: action || "update",
			module: "atendimento",
			entity: "atendimento_casos",
			recordId: id,
			beforeData: beforeAudit,
			afterData: afterAudit,
			changedFields,
		});
	}
	return saved;
}

async function replyCase(id, payload = {}, user = null) {
	const config = await readConfig();
	const item = await getCase(id);
	const text = String(payload.message || payload.mensagem || "").trim();
	if (!text) throw new Error("Mensagem obrigatória.");
	const userName = getUserName(user);
	const finalText = getTemplate(config, "respostaManualPrefixo", {
		nome: userName,
		mensagem: text,
	});
	await sendMessage(config, item.phone, finalText, {
		caseId: item.id,
		manual: true,
	});
	item.messages = [
		...(item.messages || []),
		{
			at: nowIso(),
			direction: "out",
			text: finalText,
			manual: true,
			user: user?.email || user?.uid || "",
			userName,
		},
	].slice(-100);
	return saveCase(item);
}

async function updateTechnician(phone, patch = {}, user = null) {
	// Mesma defesa contra IDOR do resto desta fase: se o tecnico ja existe e
	// tem regional definida, permissao de atendimento.tecnicos.manage sozinha
	// nao basta pra alterar um tecnico de outra regional.
	const normalizedPhone = normalizePhone(phone);
	const existing = (
		await documents.getDocument(`${TECHNICIANS_COLLECTION}/${normalizedPhone}`)
	)?.data;
	if (existing) {
		assertRegionalRecordAccess(user, existing, { allowUnknownRegional: true });
	}
	const scopedPatch = scopeWritePayload(user, patch || {});
	const saved = await saveTechnician(phone, scopedPatch);
	const syncedEmpresaId = await syncEmpresaTecnico(saved).catch((error) => {
		appendLog("sync_empresa_error", error?.message || String(error), {
			phone: saved.phone,
		});
		return "";
	});
	await unlinkTechnicianFromOtherCompanies(
		saved,
		syncedEmpresaId || saved.empresaId || "",
	);
	await appendLog("technician_update", "Técnico atualizado.", {
		phone: saved.phone,
		user: user?.email || user?.uid || "",
	});
	// Auditoria (docs/TECHNICAL-AUDIT.md, achado #5).
	const changedFields = auditLog.calculateChangedFields(existing || {}, saved);
	if (changedFields.length) {
		auditLog.recordAuditLog({
			action: existing ? "update" : "create",
			module: "atendimento",
			entity: "atendimento_tecnicos",
			recordId: saved.phone,
			beforeData: existing || null,
			afterData: saved,
			changedFields,
		});
	}
	return saved;
}

async function deleteTechnician(phone, user = null) {
	const normalized = normalizePhone(phone);
	if (!normalized) {
		const error = new Error("Telefone obrigatório.");
		error.statusCode = 400;
		throw error;
	}
	const current = await documents.getDocument(
		`${TECHNICIANS_COLLECTION}/${normalized}`,
	);
	if (!current?.data) {
		const error = new Error("Técnico não encontrado.");
		error.statusCode = 404;
		throw error;
	}
	assertRegionalRecordAccess(user, current.data, { allowUnknownRegional: true });
	await documents.deleteDocument(`${TECHNICIANS_COLLECTION}/${normalized}`);
	await unlinkTechnicianFromOtherCompanies(current.data, "");
	await appendLog("technician_delete", "Técnico excluído.", {
		phone: normalized,
		name: current.data.name || current.data.hubsoftName || "",
		user: user?.email || user?.uid || "",
	});
	auditLog.recordAuditLog({
		action: "delete",
		module: "atendimento",
		entity: "atendimento_tecnicos",
		recordId: normalized,
		beforeData: current.data,
		afterData: null,
		changedFields: Object.keys(current.data || {}),
	});
	return { ok: true, phone: normalized };
}

async function clearOperationalData(user = null) {
	const collections = [
		CASES_COLLECTION,
		TECHNICIANS_COLLECTION,
		LOGS_COLLECTION,
		MESSAGES_COLLECTION,
	];
	const result = {};
	for (const collectionPath of collections) {
		const rows = await documents
			.listAllDocuments(collectionPath)
			.catch(() => []);
		let deleted = 0;
		for (const row of rows) {
			if (!row.path) continue;
			await documents.deleteDocument(row.path);
			deleted += 1;
		}
		result[collectionPath] = deleted;
	}
	return {
		ok: true,
		deleted: result,
		clearedBy: user?.email || user?.uid || "",
	};
}

module.exports = {
	clearOperationalData,
	configureWebhook,
	connect,
	disconnect,
	deleteTechnician,
	getCase,
	getStats,
	getStatus,
	handleEvolutionWebhook,
	listCases,
	listLogs: (query) => listCollection(LOGS_COLLECTION, query),
	listMessages,
	listRatings,
	listTechnicians: (query) => listCollection(TECHNICIANS_COLLECTION, query),
	readConfig,
	readTemplates,
	replyCase,
	resetInstance,
	saveConfig,
	saveTemplates,
	sendTestMessage,
	updateCase,
	updateTechnician,
	validateHubsoftEmail,
	verifyWebhookRequest,
};
