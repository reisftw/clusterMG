const documents = require("./documents");
const notificationsService = require("./notificationsService");
const evolutionMessaging = require("./evolutionMessaging");
const { broadcastRealtime } = require("./realtime");
const { randomId } = require("./secureRandom");

const CONFIG_PATH = "confirmacao_agendamentos_config/global";
const TRACK_COLLECTION = "confirmacao_agendamentos_envios";
const LOG_COLLECTION = "confirmacao_agendamentos_logs";
const APPOINTMENT_COLLECTION = "agendamentos";
const REGIONAL_COLLECTION = "regionais";
const TZ = "America/Sao_Paulo";
const MONTHS_PT = {
	jan: "01",
	janeiro: "01",
	fev: "02",
	fevereiro: "02",
	mar: "03",
	marco: "03",
	março: "03",
	abr: "04",
	abril: "04",
	mai: "05",
	maio: "05",
	jun: "06",
	junho: "06",
	jul: "07",
	julho: "07",
	ago: "08",
	agosto: "08",
	set: "09",
	setembro: "09",
	out: "10",
	outubro: "10",
	nov: "11",
	novembro: "11",
	dez: "12",
	dezembro: "12",
};

const DEFAULT_CONFIG = {
	enabled: false,
	dailySendTime: "08:00",
	escalationMinutes: 60,
	sendSameDayNewAppointments: true,
	acceptedReplies: ["SIM", "AGENDADO"],
	evolutionEnabled: false,
	evolutionBaseUrl: "",
	evolutionApiKey: "",
	evolutionInstance: "",
	evolutionSendTextPath: "/message/sendText/{instance}",
	evolutionWebhookUrl:
		"https://retiradas.tech/api/webhooks/evolution-confirmacao",
	morningTemplate:
		"Bom dia, {responsavel_nome}!\n\nTemos {total} agendamento(s) para acompanhamento hoje ({data}).\n\n{lista_clientes}\n\nResponda SIM ou AGENDADO para confirmar ciência.",
	sameDayTemplate:
		"Novo agendamento para hoje:\n\nCliente: {cliente_nome}\nCódigo: {codigo_cliente}\nHorário: {hora}\nCidade: {cidade}\nAgendado por: {agendado_por}\n\nResponda SIM ou AGENDADO para confirmar ciência.",
	escalationTemplate:
		"{responsavel_anterior} foi acionado(a) e não confirmou em {minutos} minuto(s).\n\nSegue a lista para acompanhamento:\n\n{lista_clientes}\n\nResponda SIM ou AGENDADO para confirmar ciência.",
};

let workerTimer = null;
let workerRunning = false;
let lastRun = null;
let lastError = "";

function nowIso() {
	return new Date().toISOString();
}

function getLocalDateKey(value = new Date()) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleDateString("en-CA", { timeZone: TZ });
}

function getLocalDateTimeParts(value = new Date()) {
	const parts = getZonedParts(value);
	return {
		year: Number(parts.year || 0),
		month: Number(parts.month || 0),
		day: Number(parts.day || 0),
		hour: Number(parts.hour || 0),
		minute: Number(parts.minute || 0),
		second: Number(parts.second || 0),
	};
}

function zonedTimeToUtcIso(dateKey, timeValue) {
	const dateMatch = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
	const timeMatch = String(timeValue || "").match(/^(\d{1,2}):(\d{2})$/);
	if (!dateMatch || !timeMatch) return null;
	const utcGuess = new Date(
		Date.UTC(
			Number(dateMatch[1]),
			Number(dateMatch[2]) - 1,
			Number(dateMatch[3]),
			Number(timeMatch[1]),
			Number(timeMatch[2]),
			0,
		),
	);
	const zoned = getLocalDateTimeParts(utcGuess);
	const diffMinutes =
		(Number(dateMatch[1]) - zoned.year) * 525600 +
		(Number(dateMatch[2]) - zoned.month) * 43200 +
		(Number(dateMatch[3]) - zoned.day) * 1440 +
		(Number(timeMatch[1]) - zoned.hour) * 60 +
		(Number(timeMatch[2]) - zoned.minute);
	return new Date(utcGuess.getTime() + diffMinutes * 60 * 1000).toISOString();
}

function addDaysToDateKey(dateKey, days = 1) {
	const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return "";
	const date = new Date(
		Date.UTC(
			Number(match[1]),
			Number(match[2]) - 1,
			Number(match[3]) + Number(days || 0),
			12,
			0,
			0,
		),
	);
	return date.toISOString().slice(0, 10);
}

function getZonedParts(value = new Date()) {
	const date = value instanceof Date ? value : new Date(value);
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: TZ,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).formatToParts(date);
	return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function localMinutes(value = new Date()) {
	const parts = getZonedParts(value);
	return Number(parts.hour || 0) * 60 + Number(parts.minute || 0);
}

function timeToMinutes(value) {
	const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return null;
	return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeText(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

function normalizePhone(value) {
	return evolutionMessaging.normalizePhone(value);
}

function render(template, params = {}) {
	return String(template || "").replace(/\{(\w+)\}/g, (_, key) =>
		String(params[key] ?? ""),
	);
}

function normalizeAppointmentObjectDateKey(value = {}) {
	if (value.value) return normalizeAppointmentDateKey(value.value);
	if (value.seconds || value._seconds) {
		return getLocalDateKey(
			new Date(Number(value.seconds || value._seconds) * 1000),
		);
	}
	return "";
}

function validAppointmentDateKey(key) {
	return key && !Number.isNaN(new Date(`${key}T12:00:00`).getTime()) ? key : "";
}

function normalizeIsoAppointmentDateKey(raw) {
	const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!isoMatch) return "";
	return validAppointmentDateKey(
		`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`,
	);
}

function normalizeBrAppointmentDateKey(raw) {
	const brMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
	if (!brMatch) return "";
	const key = `${brMatch[3]}-${String(brMatch[2]).padStart(2, "0")}-${String(brMatch[1]).padStart(2, "0")}`;
	return validAppointmentDateKey(key);
}

function normalizeLongPtAppointmentDateKey(raw) {
	const longPtMatch = normalizeText(raw).match(
		/^(\d{1,2})\s+de\s+([a-z]+)\.?\s+de\s+(\d{4})/,
	);
	if (!longPtMatch) return "";
	const month = MONTHS_PT[longPtMatch[2]];
	if (!month) return "";
	const key = `${longPtMatch[3]}-${month}-${String(longPtMatch[1]).padStart(2, "0")}`;
	return validAppointmentDateKey(key);
}

function normalizeAppointmentDateKey(value) {
	if (!value) return "";
	if (value instanceof Date) return getLocalDateKey(value);
	if (typeof value === "object") {
		return normalizeAppointmentObjectDateKey(value);
	}

	const raw = String(value).trim();
	if (!raw) return "";

	return (
		normalizeIsoAppointmentDateKey(raw) ||
		normalizeBrAppointmentDateKey(raw) ||
		normalizeLongPtAppointmentDateKey(raw)
	);
}

function appointmentDate(data = {}) {
	const candidates = [
		data.data,
		data.data_agendamento,
		data.agendamento_data,
		data.dataAgendamento,
		data.date,
		data.schedule?.date,
		data.schedule?.data,
	];
	for (const candidate of candidates) {
		const dateKey = normalizeAppointmentDateKey(candidate);
		if (dateKey) return dateKey;
	}
	return "";
}

function appointmentStatus(data = {}) {
	return normalizeText(data.status || "");
}

function isOpenAppointment(data = {}) {
	const status = appointmentStatus(data);
	return ![
		"concluido",
		"entregue",
		"cancelado",
		"nao recolhido",
		"não recolhido",
	].includes(status);
}

function getAppointmentClient(data = {}) {
	return String(
		data.cliente_nome || data.nome_cliente || data.cliente || data.nome || "",
	).trim();
}

function getAppointmentCode(data = {}) {
	return String(
		data.codigo_cliente ||
			data.codigo ||
			data.cod_cliente ||
			data.contrato ||
			"",
	).trim();
}

function getAppointmentRegional(data = {}) {
	return String(data.regional || data.regional_nome || "").trim();
}

function getAppointmentCity(data = {}) {
	return String(data.cidade || data.municipio || "").trim();
}

function getAppointmentTime(data = {}) {
	return String(data.hora || data.hora_agendamento || data.turno || "").trim();
}

function getAppointmentAgent(data = {}) {
	return String(
		data.agendado_por_nome ||
			data.agendado_por ||
			data.usuario_nome ||
			data.criado_por_nome ||
			"",
	).trim();
}

function buildClientLine(item, index) {
	const data = item.data || item;
	const name = getAppointmentClient(data) || "Cliente sem nome";
	const code = getAppointmentCode(data) || "-";
	const date = formatDatePt(appointmentDate(data));
	const time = getAppointmentTime(data) || "-";
	const city = getAppointmentCity(data) || "-";
	return `${index + 1}. ${name} | Código ${code} | ${date || "-"} ${time} | ${city}`;
}

function buildAppointmentPayload(record) {
	const data = record.data || record;
	return {
		id: record.documentId || record.id,
		cliente_nome: getAppointmentClient(data),
		codigo_cliente: getAppointmentCode(data),
		cidade: getAppointmentCity(data),
		regional: getAppointmentRegional(data),
		hora: getAppointmentTime(data),
		agendado_por: getAppointmentAgent(data),
		data: appointmentDate(data),
		status: data.status || "",
	};
}

async function getConfig() {
	const doc = await documents.getDocument(CONFIG_PATH).catch(() => null);
	return { ...DEFAULT_CONFIG, ...(doc?.data || {}) };
}

async function saveConfig(patch = {}) {
	const current = await getConfig();
	const next = { ...current, ...patch, atualizadoEm: nowIso() };
	await documents.upsertDocument({
		path: CONFIG_PATH,
		collectionPath: "confirmacao_agendamentos_config",
		documentId: "global",
		parentPath: null,
		data: next,
	});
	return next;
}

function buildEvolutionConfig(config = {}) {
	return {
		whatsappProvider: "evolution",
		evolutionEnabled: true,
		evolutionBaseUrl: config.evolutionBaseUrl || "",
		evolutionApiKey: config.evolutionApiKey || "",
		evolutionInstance: config.evolutionInstance || "",
		evolutionSendTextPath:
			config.evolutionSendTextPath || DEFAULT_CONFIG.evolutionSendTextPath,
		evolutionWebhookUrl:
			config.evolutionWebhookUrl || DEFAULT_CONFIG.evolutionWebhookUrl,
	};
}

function assertEvolutionConfigured(config = {}) {
	const missing = [];
	if (!config.evolutionBaseUrl) missing.push("URL da Evolution");
	if (!config.evolutionApiKey) missing.push("Apikey da Evolution");
	if (!config.evolutionInstance) missing.push("Instância da Evolution");
	if (missing.length) {
		const error = new Error(
			`Configure ${missing.join(", ")} da confirmação antes de enviar.`,
		);
		error.statusCode = 400;
		throw error;
	}
}

async function getEvolutionStatus() {
	const config = await getConfig();
	const evolutionConfig = buildEvolutionConfig(config);
	return {
		ok: true,
		configured: Boolean(
			evolutionConfig.evolutionBaseUrl &&
				evolutionConfig.evolutionApiKey &&
				evolutionConfig.evolutionInstance,
		),
		connection: await evolutionMessaging.getConnectionInfo(evolutionConfig),
	};
}

async function connectEvolutionInstance() {
	const config = await getConfig();
	const evolutionConfig = buildEvolutionConfig(config);
	assertEvolutionConfigured(evolutionConfig);
	const result = await evolutionMessaging.createOrConnectInstance(
		evolutionConfig,
		{ persist: false },
	);
	await saveConfig({
		evolutionEnabled: true,
		evolutionWebhookConfiguredAt: nowIso(),
	});
	return result;
}

async function disconnectEvolutionInstance() {
	const config = await getConfig();
	return evolutionMessaging.logoutInstance(buildEvolutionConfig(config));
}

async function configureEvolutionWebhook(webhookUrl = "") {
	const config = await getConfig();
	const nextConfig = webhookUrl
		? await saveConfig({ evolutionWebhookUrl: webhookUrl })
		: config;
	assertEvolutionConfigured(buildEvolutionConfig(nextConfig));
	const result = await evolutionMessaging.configureWebhook(
		buildEvolutionConfig(nextConfig),
		{ persist: false },
	);
	await saveConfig({ evolutionWebhookConfiguredAt: nowIso() });
	return result;
}

async function listAll(collectionPath) {
	return documents.listAllDocuments(collectionPath);
}

async function listTodayAppointments(dateKey = getLocalDateKey()) {
	const rows = await listAll(APPOINTMENT_COLLECTION);
	return rows.filter((row) => {
		const data = row.data || {};
		return appointmentDate(data) === dateKey && isOpenAppointment(data);
	});
}

async function listRegionais() {
	const rows = await listAll(REGIONAL_COLLECTION);
	return rows.map((row) => ({ id: row.documentId, ...(row.data || {}) }));
}

async function getPreview({ dateKey = "", daysAhead = 1 } = {}) {
	const targetDateKey =
		normalizeAppointmentDateKey(dateKey) ||
		getLocalDateKey(
			new Date(Date.now() + Number(daysAhead || 1) * 24 * 60 * 60 * 1000),
		);
	const [appointments, regionais] = await Promise.all([
		listTodayAppointments(targetDateKey),
		listRegionais(),
	]);
	const grouped = new Map();
	appointments.forEach((row) => {
		const regional = findRegional(regionais, row);
		const regionalName =
			regional?.nome || getAppointmentRegional(row.data) || "Sem regional";
		const key = normalizeText(regionalName) || "sem_regional";
		if (!grouped.has(key)) {
			grouped.set(key, {
				regional: regionalName,
				responsaveis: buildEscalationSteps(regional || {}),
				appointments: [],
			});
		}
		grouped.get(key).appointments.push(buildAppointmentPayload(row));
	});

	const groups = [...grouped.values()]
		.map((group) => ({
			...group,
			total: group.appointments.length,
			responsavelInicial: group.responsaveis[0] || null,
			semResponsavel: !group.responsaveis.length,
		}))
		.sort((a, b) =>
			String(a.regional || "").localeCompare(String(b.regional || "")),
		);

	return {
		ok: true,
		dateKey: targetDateKey,
		total: appointments.length,
		groups,
	};
}

function findRegional(regionais = [], appointment = {}) {
	const regionalName = normalizeText(
		getAppointmentRegional(appointment.data || appointment),
	);
	const cityName = normalizeText(
		getAppointmentCity(appointment.data || appointment),
	);
	return (
		regionais.find(
			(regional) => normalizeText(regional.nome) === regionalName,
		) ||
		regionais.find((regional) =>
			(Array.isArray(regional.cidades) ? regional.cidades : []).some(
				(city) => normalizeText(city.nome || city) === cityName,
			),
		) ||
		null
	);
}

function normalizePessoa(pessoa = {}) {
	return {
		nome: String(pessoa?.nome || "").trim(),
		telefone: normalizePhone(pessoa?.telefone || ""),
		email: String(pessoa?.email || "").trim(),
	};
}

function getDeliveryGroup(regional = {}) {
	const groups =
		regional.gruposOperacionais || regional.grupos_operacionais || {};
	const delivery = groups.delivery || {};
	const legacyBackoffices =
		Array.isArray(regional.backoffices) && regional.backoffices.length
			? regional.backoffices
			: regional.backoffice?.nome
				? [regional.backoffice]
				: [];
	const deliveryBackoffices =
		Array.isArray(delivery.backoffices) && delivery.backoffices.length
			? delivery.backoffices
			: delivery.backoffice?.nome
				? [delivery.backoffice]
				: legacyBackoffices;
	return {
		lider: normalizePessoa(delivery.lider || regional.lider || {}),
		backoffices: deliveryBackoffices.map(normalizePessoa),
		supervisor: normalizePessoa(
			delivery.supervisor || regional.supervisor || {},
		),
	};
}

function buildEscalationSteps(regional = {}) {
	const deliveryGroup = getDeliveryGroup(regional);
	return [
		...deliveryGroup.backoffices.map((pessoa, index) => ({
			key: `backoffice_delivery_${String(index + 1).padStart(2, "0")}`,
			label: `BackOffice Delivery ${String(index + 1).padStart(2, "0")}`,
			pessoa,
		})),
		{
			key: "lider_delivery",
			label: "Líder Delivery",
			pessoa: deliveryGroup.lider || {},
		},
		{
			key: "supervisor_delivery",
			label: "Supervisor Delivery",
			pessoa: deliveryGroup.supervisor || {},
		},
	]
		.map((step) => ({
			...step,
			nome: String(step.pessoa?.nome || "").trim(),
			telefone: normalizePhone(step.pessoa?.telefone || ""),
			email: String(step.pessoa?.email || "").trim(),
		}))
		.filter((step) => step.nome && step.telefone);
}

async function createLog(data = {}) {
	const id = randomId("conf");
	await documents.upsertDocument({
		path: `${LOG_COLLECTION}/${id}`,
		collectionPath: LOG_COLLECTION,
		documentId: id,
		parentPath: null,
		data: { id, ...data, criadoEm: nowIso() },
	});
	broadcastRealtime("mensageria", { collectionPath: LOG_COLLECTION });
	return id;
}

async function upsertTrack(id, data = {}) {
	await documents.upsertDocument({
		path: `${TRACK_COLLECTION}/${id}`,
		collectionPath: TRACK_COLLECTION,
		documentId: id,
		parentPath: null,
		data,
	});
	broadcastRealtime("mensageria", {
		collectionPath: TRACK_COLLECTION,
		documentId: id,
	});
}

async function getTrack(id) {
	const row = await documents
		.getDocument(`${TRACK_COLLECTION}/${id}`)
		.catch(() => null);
	return row ? { id: row.documentId, ...(row.data || {}) } : null;
}

async function saveRegionalBackoffice(regionalName = "", pessoa = {}) {
	const regionais = await listRegionais();
	const regional = regionais.find(
		(item) => normalizeText(item.nome) === normalizeText(regionalName),
	);
	if (!regional) return { updated: false, reason: "Regional não localizada." };

	const backoffices = Array.isArray(regional.backoffices)
		? [...regional.backoffices]
		: [];
	if (!backoffices.length && regional.backoffice?.nome)
		backoffices.push(regional.backoffice);
	const normalizedPhone = normalizePhone(pessoa.telefone);
	const existingIndex = backoffices.findIndex(
		(item) =>
			normalizePhone(item?.telefone) === normalizedPhone ||
			normalizeText(item?.nome) === normalizeText(pessoa.nome),
	);
	const nextPessoa = {
		nome: String(pessoa.nome || "").trim(),
		telefone: normalizedPhone,
		email: String(pessoa.email || "").trim(),
	};

	if (existingIndex >= 0) {
		backoffices[existingIndex] = {
			...backoffices[existingIndex],
			...nextPessoa,
		};
	} else if (
		!backoffices[0]?.nome ||
		!normalizePhone(backoffices[0]?.telefone)
	) {
		backoffices[0] = nextPessoa;
	} else {
		backoffices.push(nextPessoa);
	}

	const data = {
		...regional,
		backoffices,
		backoffice: backoffices[0] || nextPessoa,
		gruposOperacionais: {
			...(regional.gruposOperacionais || {}),
			delivery: {
				...((regional.gruposOperacionais || {}).delivery || {}),
				backoffices,
				backoffice: backoffices[0] || nextPessoa,
			},
		},
		atualizadoEm: nowIso(),
	};
	delete data.id;
	await documents.upsertDocument({
		path: `${REGIONAL_COLLECTION}/${regional.id}`,
		collectionPath: REGIONAL_COLLECTION,
		documentId: regional.id,
		parentPath: null,
		data,
	});
	return { updated: true, regional: data };
}

async function assignManualResponsible(trackId, payload = {}, user = {}) {
	const track = await getTrack(trackId);
	if (!track) {
		const error = new Error("Envio não encontrado.");
		error.statusCode = 404;
		throw error;
	}
	const nome = String(payload.nome || payload.name || "").trim();
	const telefone = normalizePhone(payload.telefone || payload.phone || "");
	const email = String(payload.email || "").trim();
	if (!nome || !telefone) {
		const error = new Error("Informe nome e telefone do responsável.");
		error.statusCode = 400;
		throw error;
	}

	const regionalUpdate = await saveRegionalBackoffice(track.regional, {
		nome,
		telefone,
		email,
	});
	const regional = regionalUpdate.regional || {};
	const steps = buildEscalationSteps(regional);
	const manualStep = {
		key: "backoffice_01",
		label: "BackOffice 01",
		nome,
		telefone,
		email,
	};
	const nextSteps = steps.length ? steps : [manualStep];
	if (!nextSteps.some((step) => normalizePhone(step.telefone) === telefone)) {
		nextSteps.unshift(manualStep);
	}

	const nextTrack = {
		...track,
		status: "novo",
		currentStepIndex: 0,
		steps: nextSteps,
		manualResponsible: manualStep,
		manualResponsibleSavedAt: nowIso(),
		manualResponsibleSavedBy: {
			uid: user?.uid || user?.id || "",
			nome: user?.nome || user?.displayName || user?.email || "",
		},
		regionalUpdated: Boolean(regionalUpdate.updated),
		regionalUpdateReason: regionalUpdate.reason || "",
		updatedAt: nowIso(),
	};
	await upsertTrack(track.id, nextTrack);
	await createLog({
		trackId: track.id,
		type: "manual_responsible_saved",
		origin: track.origin,
		regional: track.regional,
		step: manualStep,
		regionalUpdated: Boolean(regionalUpdate.updated),
		regionalUpdateReason: regionalUpdate.reason || "",
	});
	return sendTrackStep(nextTrack, 0, await getConfig());
}

async function sendTrackStep(track, stepIndex = 0, config = null) {
	const currentConfig = config || (await getConfig());
	const step = (track.steps || [])[stepIndex];
	if (!step) return null;

	const expectedDateKey = normalizeAppointmentDateKey(track.dateKey);
	const appointments = (
		Array.isArray(track.appointments) ? track.appointments : []
	).filter((item) => appointmentDate(item.data || item) === expectedDateKey);
	if (!expectedDateKey || !appointments.length) {
		const nextTrack = {
			...track,
			status: "sem_data_valida",
			appointments,
			updatedAt: nowIso(),
			invalidReason:
				"Nenhum agendamento do envio possui data válida igual ao dia da rotina.",
		};
		await upsertTrack(track.id, nextTrack);
		await createLog({
			trackId: track.id,
			type: "invalid_appointment_date",
			origin: track.origin,
			regional: track.regional,
			dateKey: track.dateKey,
			reason: nextTrack.invalidReason,
		});
		return nextTrack;
	}

	const listaClientes = appointments
		.map((item, index) => buildClientLine(item, index))
		.join("\n");
	const first = appointments[0] || {};
	const previousStep = stepIndex > 0 ? track.steps[stepIndex - 1] : null;
	const template =
		stepIndex > 0
			? currentConfig.escalationTemplate
			: track.origin === "agendamento_dia"
				? currentConfig.sameDayTemplate
				: currentConfig.morningTemplate;
	const message = render(template, {
		responsavel_nome: step.nome,
		responsavel_cargo: step.label,
		responsavel_anterior: previousStep
			? `${previousStep.label} ${previousStep.nome}`
			: "",
		minutos: currentConfig.escalationMinutes,
		total: appointments.length,
		data: formatDatePt(track.dateKey),
		lista_clientes: listaClientes,
		cliente_nome: first.cliente_nome || "",
		codigo_cliente: first.codigo_cliente || "",
		hora: first.hora || "",
		cidade: first.cidade || "",
		agendado_por: first.agendado_por || "",
	});

	const messagingConfig = buildEvolutionConfig(currentConfig);
	assertEvolutionConfigured(messagingConfig);
	const response = await evolutionMessaging.sendWhatsAppMessage(
		messagingConfig,
		step.telefone,
		message,
		{
			telefone: step.telefone,
			cliente: step.nome,
		},
	);
	const nextCheckAt = new Date(
		Date.now() +
			Math.max(1, Number(currentConfig.escalationMinutes || 60)) * 60 * 1000,
	).toISOString();
	const nextTrack = {
		...track,
		appointments,
		status: "aguardando_resposta",
		currentStepIndex: stepIndex,
		nextCheckAt,
		updatedAt: nowIso(),
		sentSteps: [
			...(Array.isArray(track.sentSteps) ? track.sentSteps : []),
			{ ...step, sentAt: nowIso(), message },
		],
	};
	await upsertTrack(track.id, nextTrack);
	await createLog({
		trackId: track.id,
		type: stepIndex > 0 ? "escalation_sent" : "message_sent",
		origin: track.origin,
		regional: track.regional,
		dateKey: track.dateKey,
		step,
		appointments,
		message,
		response,
	});
	return nextTrack;
}

function formatDatePt(dateKey) {
	const [year, month, day] = String(dateKey || "").split("-");
	if (!year || !month || !day) return dateKey || "";
	return `${day}/${month}/${year}`;
}

async function ensureMorningTracks({ force = false } = {}) {
	const config = await getConfig();
	const dateKey = getLocalDateKey();
	if (!config.enabled && !force)
		return { ok: true, skipped: "Automação desativada." };
	if (
		!force &&
		localMinutes() < timeToMinutes(config.dailySendTime || "08:00")
	) {
		return { ok: true, skipped: "Antes do horário da rotina." };
	}

	const [appointments, regionais] = await Promise.all([
		listTodayAppointments(dateKey),
		listRegionais(),
	]);
	const grouped = new Map();
	appointments.forEach((row) => {
		const regional = findRegional(regionais, row);
		const regionalName =
			regional?.nome || getAppointmentRegional(row.data) || "Sem regional";
		const key = normalizeText(regionalName) || "sem_regional";
		if (!grouped.has(key))
			grouped.set(key, { regional, regionalName, rows: [] });
		grouped.get(key).rows.push(row);
	});

	let created = 0;
	let sent = 0;
	for (const group of grouped.values()) {
		const trackId = `daily_${dateKey}_${normalizeText(group.regionalName).replace(/[^a-z0-9]+/g, "_")}`;
		const existing = await getTrack(trackId);
		if (existing && !force) continue;
		const steps = buildEscalationSteps(group.regional || {});
		const track = {
			id: trackId,
			origin: "rotina_08h",
			status: steps.length ? "novo" : "sem_responsavel",
			dateKey,
			regional: group.regionalName,
			appointments: group.rows.map(buildAppointmentPayload),
			appointmentIds: group.rows.map((row) => row.documentId),
			steps,
			createdAt: nowIso(),
			updatedAt: nowIso(),
		};
		await upsertTrack(trackId, track);
		created += 1;
		if (steps.length) {
			await sendTrackStep(track, 0, config);
			sent += 1;
		} else {
			await createLog({
				trackId,
				type: "no_responsible",
				origin: "rotina_08h",
				regional: group.regionalName,
			});
		}
	}
	return { ok: true, created, sent, appointments: appointments.length };
}

async function ensureSameDayTracks() {
	const config = await getConfig();
	if (!config.enabled || !config.sendSameDayNewAppointments)
		return { ok: true, skipped: "Automação desativada." };
	const dateKey = getLocalDateKey();
	const [appointments, regionais] = await Promise.all([
		listTodayAppointments(dateKey),
		listRegionais(),
	]);
	let created = 0;
	let sent = 0;
	for (const row of appointments) {
		const trackId = `same_day_${dateKey}_${row.documentId}`;
		if (await getTrack(trackId)) continue;
		const regional = findRegional(regionais, row);
		const regionalName =
			regional?.nome || getAppointmentRegional(row.data) || "Sem regional";
		const steps = buildEscalationSteps(regional || {});
		const track = {
			id: trackId,
			origin: "agendamento_dia",
			status: steps.length ? "novo" : "sem_responsavel",
			dateKey,
			regional: regionalName,
			appointments: [buildAppointmentPayload(row)],
			appointmentIds: [row.documentId],
			steps,
			createdAt: nowIso(),
			updatedAt: nowIso(),
		};
		await upsertTrack(trackId, track);
		created += 1;
		if (steps.length) {
			await sendTrackStep(track, 0, config);
			sent += 1;
		}
	}
	return { ok: true, created, sent };
}

async function processEscalations() {
	const config = await getConfig();
	if (!config.enabled) return { ok: true, skipped: "Automação desativada." };
	const todayKey = getLocalDateKey();
	const rows = await listAll(TRACK_COLLECTION);
	let escalated = 0;
	let expired = 0;
	for (const row of rows) {
		const track = { id: row.documentId, ...(row.data || {}) };
		if (track.status !== "aguardando_resposta") continue;
		if (normalizeAppointmentDateKey(track.dateKey) !== todayKey) continue;
		if (
			!track.nextCheckAt ||
			new Date(track.nextCheckAt).getTime() > Date.now()
		)
			continue;
		const nextStep = Number(track.currentStepIndex || 0) + 1;
		if ((track.steps || [])[nextStep]) {
			await sendTrackStep(track, nextStep, config);
			escalated += 1;
		} else {
			const nextTrack = {
				...track,
				status: "sem_resposta_final",
				updatedAt: nowIso(),
			};
			await upsertTrack(track.id, nextTrack);
			await createLog({
				trackId: track.id,
				type: "no_final_response",
				origin: track.origin,
				regional: track.regional,
			});
			await notificationsService
				.createNotification({
					type: "confirmacao_agendamento_sem_resposta",
					title: "Confirmação de agendamento sem resposta",
					message: `${track.regional || "Regional"} escalou até supervisor sem confirmação.`,
					targetPath: "/mensageria/confirmacao-agendamentos",
					severity: "warning",
					targets: { roles: ["admin", "backoffice_retirada"] },
					meta: { trackId: track.id },
				})
				.catch(() => {});
			expired += 1;
		}
	}
	return { ok: true, escalated, expired };
}

async function processOnce({ forceMorning = false } = {}) {
	lastRun = nowIso();
	lastError = "";
	try {
		const morning = await ensureMorningTracks({ force: forceMorning });
		const sameDay = await ensureSameDayTracks();
		const escalations = await processEscalations();
		return { ok: true, morning, sameDay, escalations };
	} catch (error) {
		lastError = error?.message || "Falha na confirmação de agendamentos.";
		throw error;
	}
}

async function listTracks({ limit = 50, offset = 0 } = {}) {
	const rows = await documents.listDocuments({
		collectionPath: TRACK_COLLECTION,
		limit,
		offset,
	});
	const items = rows
		.map((row) => ({ id: row.documentId, ...(row.data || {}) }))
		.sort((a, b) =>
			String(b.updatedAt || b.createdAt || "").localeCompare(
				String(a.updatedAt || a.createdAt || ""),
			),
		);
	return { items };
}

async function listLogs({ limit = 50, offset = 0 } = {}) {
	const rows = await documents.listDocuments({
		collectionPath: LOG_COLLECTION,
		limit,
		offset,
	});
	const items = rows
		.map((row) => ({ id: row.documentId, ...(row.data || {}) }))
		.sort((a, b) =>
			String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")),
		);
	return { items };
}

async function getLastMessageSentAt() {
	const rows = await listAll(LOG_COLLECTION);
	return (
		rows
			.map((row) => ({ id: row.documentId, ...(row.data || {}) }))
			.filter((log) =>
				["message_sent", "escalation_sent", "test_sent"].includes(log.type),
			)
			.map((log) => log.criadoEm || "")
			.filter(Boolean)
			.sort((a, b) => String(b).localeCompare(String(a)))[0] || null
	);
}

function getNextDailyRunAt(config = {}) {
	if (!config.enabled) return null;
	const dailySendTime = config.dailySendTime || DEFAULT_CONFIG.dailySendTime;
	const todayKey = getLocalDateKey();
	const todayRunAt = zonedTimeToUtcIso(todayKey, dailySendTime);
	if (todayRunAt && new Date(todayRunAt).getTime() > Date.now())
		return todayRunAt;
	return zonedTimeToUtcIso(addDaysToDateKey(todayKey, 1), dailySendTime);
}

async function getReport() {
	const rows = await listAll(LOG_COLLECTION);
	const logs = rows.map((row) => ({ id: row.documentId, ...(row.data || {}) }));
	const sent = logs.filter((log) =>
		["message_sent", "escalation_sent"].includes(log.type),
	);
	const replied = logs.filter((log) => log.type === "responsible_confirmed");
	const byResponsible = {};
	[...sent, ...replied].forEach((log) => {
		const name = log.step?.nome || log.responder?.nome || "Sem responsável";
		byResponsible[name] ||= { nome: name, enviados: 0, confirmados: 0 };
		if (["message_sent", "escalation_sent"].includes(log.type))
			byResponsible[name].enviados += 1;
		if (log.type === "responsible_confirmed")
			byResponsible[name].confirmados += 1;
	});
	return {
		ok: true,
		totals: {
			mensagens: sent.length,
			confirmacoes: replied.length,
			escalonamentos: logs.filter((log) => log.type === "escalation_sent")
				.length,
			semRespostaFinal: logs.filter((log) => log.type === "no_final_response")
				.length,
		},
		responsaveis: Object.values(byResponsible).sort(
			(a, b) => b.enviados - a.enviados,
		),
	};
}

async function sendTestMessage(payload = {}, user = {}) {
	const config = await getConfig();
	const phone = normalizePhone(
		payload.telefone || payload.phone || payload.number,
	);
	if (!phone) {
		const error = new Error("Informe um telefone válido para teste.");
		error.statusCode = 400;
		throw error;
	}

	const testType = String(payload.type || "morning");
	const sampleAppointments = [
		{
			cliente_nome: "Cliente Teste 01",
			codigo_cliente: "1001",
			cidade: "Cidade Teste",
			regional: "Regional Teste",
			hora: "09:00",
			agendado_por: "RETORNINHO",
			data: getLocalDateKey(),
		},
		{
			cliente_nome: "Cliente Teste 02",
			codigo_cliente: "1002",
			cidade: "Cidade Teste",
			regional: "Regional Teste",
			hora: "14:30",
			agendado_por: "RETORNINHO",
			data: getLocalDateKey(),
		},
	];
	const listaClientes = sampleAppointments
		.map((item, index) => buildClientLine(item, index))
		.join("\n");
	const first = sampleAppointments[0];
	const template =
		testType === "same_day"
			? config.sameDayTemplate
			: testType === "escalation"
				? config.escalationTemplate
				: config.morningTemplate;
	const message = render(template, {
		responsavel_nome: payload.nome || "Responsável Teste",
		responsavel_cargo: "Teste",
		responsavel_anterior: "BackOffice 01 Teste",
		minutos: config.escalationMinutes || 60,
		total: sampleAppointments.length,
		data: formatDatePt(getLocalDateKey()),
		lista_clientes: listaClientes,
		cliente_nome: first.cliente_nome,
		codigo_cliente: first.codigo_cliente,
		hora: first.hora,
		cidade: first.cidade,
		agendado_por: first.agendado_por,
	});

	const messagingConfig = buildEvolutionConfig(config);
	assertEvolutionConfigured(messagingConfig);
	const response = await evolutionMessaging.sendWhatsAppMessage(
		messagingConfig,
		phone,
		message,
		{
			telefone: phone,
			cliente: payload.nome || "Responsável Teste",
		},
	);
	await createLog({
		type: "test_sent",
		origin: testType,
		regional: "Teste",
		step: {
			label: "Teste",
			nome: payload.nome || "Responsável Teste",
			telefone: phone,
		},
		appointments: sampleAppointments,
		message,
		response,
		user: {
			uid: user?.uid || user?.id || "",
			nome: user?.nome || user?.displayName || user?.email || "",
		},
	});
	return { ok: true, type: testType, telefone: phone, message, response };
}

function extractIncomingText(payload = {}) {
	return String(
		payload?.data?.message?.conversation ||
			payload?.data?.message?.extendedTextMessage?.text ||
			payload?.message?.conversation ||
			payload?.text?.message ||
			payload?.mensagem ||
			payload?.message ||
			"",
	).trim();
}

function extractIncomingPhone(payload = {}) {
	const raw =
		payload?.data?.key?.remoteJid ||
		payload?.sender ||
		payload?.phone ||
		payload?.telefone ||
		payload?.from ||
		"";
	return normalizePhone(String(raw).split("@")[0]);
}

async function registerIncomingResponse(payload = {}) {
	const config = await getConfig();
	if (!config.enabled)
		return { ok: true, ignored: true, reason: "Automação desativada." };
	const text = extractIncomingText(payload);
	const phone = extractIncomingPhone(payload);
	if (!text || !phone)
		return { ok: true, ignored: true, reason: "Sem texto ou telefone." };
	const accepted = (
		Array.isArray(config.acceptedReplies)
			? config.acceptedReplies
			: DEFAULT_CONFIG.acceptedReplies
	).map(normalizeText);
	if (!accepted.includes(normalizeText(text)))
		return { ok: true, ignored: true, reason: "Resposta não confirmadora." };

	const rows = await listAll(TRACK_COLLECTION);
	const trackRow = rows
		.map((row) => ({ id: row.documentId, ...(row.data || {}) }))
		.filter((track) => track.status === "aguardando_resposta")
		.find((track) =>
			(track.steps || []).some(
				(step) => normalizePhone(step.telefone) === phone,
			),
		);
	if (!trackRow)
		return {
			ok: true,
			ignored: true,
			reason: "Nenhuma trilha ativa para o telefone.",
		};
	const step =
		(trackRow.steps || []).find(
			(item) => normalizePhone(item.telefone) === phone,
		) || {};
	const nextTrack = {
		...trackRow,
		status: "confirmado",
		confirmedAt: nowIso(),
		confirmedBy: step,
		confirmedMessage: text,
		updatedAt: nowIso(),
	};
	await upsertTrack(trackRow.id, nextTrack);
	await createLog({
		trackId: trackRow.id,
		type: "responsible_confirmed",
		origin: trackRow.origin,
		regional: trackRow.regional,
		responder: step,
		message: text,
		payload,
	});
	return { ok: true, confirmed: true, trackId: trackRow.id };
}

async function getStatus() {
	const config = await getConfig();
	const lastMessageSentAt = await getLastMessageSentAt().catch(() => null);
	const nextDailyRunAt = getNextDailyRunAt(config);
	return {
		workerActive: Boolean(workerTimer),
		workerRunning,
		lastRun,
		lastMessageSentAt,
		nextDailyRunAt,
		enabled: Boolean(config.enabled),
		statusText: config.enabled
			? `Rotina ativa. Próxima rotina: ${nextDailyRunAt || "-"}`
			: "Rotina desativada ou pausada.",
		lastError,
	};
}

function startWorker() {
	if (workerTimer) return;
	workerTimer = setInterval(async () => {
		if (workerRunning) return;
		workerRunning = true;
		try {
			await processOnce();
		} catch (error) {
			lastError = error?.message || "Falha no worker.";
			console.error("[agendamentoConfirmacao] worker:", error);
		} finally {
			workerRunning = false;
		}
	}, 60000);
}

function stopWorker() {
	if (workerTimer) clearInterval(workerTimer);
	workerTimer = null;
	workerRunning = false;
}

module.exports = {
	getConfig,
	saveConfig,
	getEvolutionStatus,
	connectEvolutionInstance,
	disconnectEvolutionInstance,
	configureEvolutionWebhook,
	processOnce,
	listTracks,
	listLogs,
	getPreview,
	getReport,
	sendTestMessage,
	assignManualResponsible,
	registerIncomingResponse,
	getStatus,
	startWorker,
	stopWorker,
};
