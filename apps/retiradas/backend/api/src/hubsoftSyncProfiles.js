const db = require("./db");
const documents = require("./documents");
const operationalImports = require("./operationalImports");
const regionaisRepository = require("./regionaisRepository");

const CONFIG_PATH = "hubsoft_config/global";
const DEFAULT_INTERNAL_BASE_URL = "https://api.sempre.hubsoft.com.br";
const LOCK_TTL_MS = 30 * 60 * 1000;
const PAGE_SIZE = 100;
const SCHEDULER_CHECK_INTERVAL_MS = 60 * 1000;
const SCHEDULER_USER = {
	uid: "system",
	email: "system@retiradas.local",
	nome: "Rotina automática HubSoft",
	role: "admin",
};
let schedulerTickRunning = false;

const PROFILE = Object.freeze({
	MAPA: "MAPA",
	MATCH: "MATCH",
	LOJA: "LOJA",
	META_D0: "META_D0",
	META_D_MINUS_ONE: "META_D_MINUS_ONE",
});

const RUN_STATUS = Object.freeze({
	RUNNING: "RUNNING",
	COMPLETE: "COMPLETE",
	INCOMPLETE: "INCOMPLETE",
	FAILED: "FAILED",
	FAILED_AUTH: "FAILED_AUTH",
	SUSPICIOUS: "SUSPICIOUS",
	SCHEMA_CHANGED: "SCHEMA_CHANGED",
	VALID_EMPTY_RESULT: "VALID_EMPTY_RESULT",
	DIVERGENT: "DIVERGENT",
});

const MAPA_TYPE_IDS = new Set([1487, 1488, 1495, 5]);
const MATCH_IGNORED_TYPE_IDS = new Set([
	1496, 522, 63, 449, 48, 1490, 571, 665, 1494, 1493, 67, 66,
]);
const MATCH_KNOWN_IGNORED = [
	[1496, "CANCELAMENTO - OUTROS"],
	[522, "DESMONTE DE POP"],
	[63, "EXPANSÃO DE REDE"],
	[449, "FALHA DE INFRAESTRUTURA"],
	[48, "INSERÇÃO DE EQUIPAMENTO"],
	[1490, "LIBERAÇÃO DE PORTAS"],
	[571, "LISTAGEM DE TA"],
	[665, "MIGRAÇÃO EPON / GPON"],
	[1494, "MULTA DE EQUIPAMENTO"],
	[1493, "RETIRADA - OUTROS"],
	[67, "TROCA EPON/GPON"],
	[66, "VIABILIDADE"],
];
const META_TYPE_IDS = MAPA_TYPE_IDS;
const LOJA_ATTENDANCE_TYPE_ID = 826;
const META_MOTIVO_CONCLUIDA_ID = 135;

function cleanText(value) {
	return String(value || "").trim();
}

function asPositiveNumber(value, fallback, { min = 1, max = 24 * 60 } = {}) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return fallback;
	return Math.min(Math.max(Math.round(numeric), min), max);
}

function normalizeTime(value, fallback = "03:00") {
	const match = cleanText(value || fallback).match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return fallback;
	const hour = Math.min(Math.max(Number(match[1]), 0), 23);
	const minute = Math.min(Math.max(Number(match[2]), 0), 59);
	return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeCheckpointHours(value) {
	const items = Array.isArray(value)
		? value
		: cleanText(value || "11,14,16,18,23").split(/[,;\s]+/);
	return [
		...new Set(
			items
				.map((item) => Number(item))
				.filter((item) => Number.isInteger(item) && item >= 0 && item <= 23),
		),
	].sort((a, b) => a - b);
}

function normalizeAutomationConfig(config = {}) {
	return {
		autoSyncEnabled: config.autoSyncEnabled !== false,
		autoDailyIntervalMinutes: asPositiveNumber(
			config.autoDailyIntervalMinutes,
			30,
			{ min: 5, max: 24 * 60 },
		),
		autoDailyCheckpointHours: normalizeCheckpointHours(
			config.autoDailyCheckpointHours,
		),
		autoMetaTime: normalizeTime(config.autoMetaTime, "03:00"),
		autoMapMatchIntervalMinutes: asPositiveNumber(
			config.autoMapMatchIntervalMinutes,
			60,
			{ min: 15, max: 24 * 60 },
		),
		autoMapMatchEnabled: config.autoMapMatchEnabled !== false,
		autoMetaEnabled: config.autoMetaEnabled !== false,
		autoDailyEnabled: config.autoDailyEnabled !== false,
	};
}

function normalizeText(value) {
	return cleanText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ")
		.toUpperCase();
}

function normalizeCityKey(value) {
	return normalizeText(value).replace(/[^A-Z0-9]+/g, " ").trim();
}

function todaySaoPaulo() {
	const text = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
	return text;
}

function parseDateOnly(value) {
	const match = cleanText(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return null;
	return new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`);
}

function addDays(dateText, days) {
	const date = parseDateOnly(dateText) || parseDateOnly(todaySaoPaulo());
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function toHubsoftDate(dateText) {
	const date = parseDateOnly(dateText);
	if (!date) return "";
	return date.toISOString();
}

function currentMapPeriod(referenceDate = todaySaoPaulo()) {
	const date = parseDateOnly(referenceDate) || new Date();
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth();
	const end = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0));
	return {
		inicio: `${year}-01-01`,
		fim: end.toISOString().slice(0, 10),
	};
}

function normalizeBaseUrl(value) {
	const url = cleanText(value || DEFAULT_INTERNAL_BASE_URL).replace(/\/+$/, "");
	if (!url) return DEFAULT_INTERNAL_BASE_URL;
	return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

async function readConfig() {
	const item = await documents.getDocument(CONFIG_PATH).catch(() => null);
	return item?.data || {};
}

async function saveSchedulerState(patch = {}) {
	const current = await readConfig();
	await documents.upsertDocument({
		path: CONFIG_PATH,
		collectionPath: "hubsoft_config",
		documentId: "global",
		parentPath: null,
		data: {
			...current,
			...patch,
			autoSyncLastSchedulerAt: new Date().toISOString(),
		},
	});
}

function sanitizeErrorMessage(error) {
	return cleanText(error?.message || error || "")
		.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
		.slice(0, 500);
}

async function parseResponse(response) {
	const text = await response.text();
	try {
		return text ? JSON.parse(text) : null;
	} catch {
		return { raw: text.slice(0, 500) };
	}
}

async function authenticateWithOAuth(config) {
	const baseUrl = normalizeBaseUrl(config.baseUrl || process.env.HUBSOFT_BASE_URL);
	const clientId = cleanText(config.clientId || process.env.HUBSOFT_CLIENT_ID);
	const clientSecret = cleanText(
		config.clientSecret || process.env.HUBSOFT_CLIENT_SECRET,
	);
	const username = cleanText(config.username || process.env.HUBSOFT_USERNAME);
	const password = cleanText(config.password || process.env.HUBSOFT_PASSWORD);
	const grantType = cleanText(config.grantType || "password");
	if (!clientId || !clientSecret || !username || !password) return null;

	const response = await fetch(`${baseUrl}/oauth/token`, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			client_id: clientId,
			client_secret: clientSecret,
			username,
			password,
			grant_type: grantType,
		}),
	});
	const payload = await parseResponse(response);
	if (!response.ok || !payload?.access_token) {
		const error = new Error(
			payload?.message || payload?.error || `HubSoft HTTP ${response.status}`,
		);
		error.code = "FAILED_AUTH";
		throw error;
	}
	return {
		baseUrl,
		token: payload.access_token,
		tokenType: payload.token_type || "Bearer",
	};
}

async function authenticateWithPlaywright(config) {
	const username = cleanText(
		process.env.HUBSOFT_WEB_USERNAME ||
			config.webUsername ||
			process.env.HUBSOFT_USERNAME ||
			config.username,
	);
	const password = cleanText(
		process.env.HUBSOFT_WEB_PASSWORD ||
			config.webPassword ||
			process.env.HUBSOFT_PASSWORD ||
			config.password,
	);
	if (!username || !password) return null;
	let chromium;
	try {
		({ chromium } = require("playwright"));
	} catch {
		const error = new Error(
			"Login HubSoft configurado, mas o Playwright nao esta instalado no backend.",
		);
		error.code = "FAILED_AUTH";
		error.statusCode = 400;
		throw error;
	}
	const webBase = normalizeBaseUrl(
		process.env.HUBSOFT_WEB_BASE_URL ||
			config.webBaseUrl ||
			"https://sempre.hubsoft.com.br",
	);
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		await page.goto(`${webBase}/login`, {
			waitUntil: "domcontentloaded",
			timeout: 60_000,
		});
		await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
		await page
			.locator('input[type="email"], input[name="email"], input[type="text"]')
			.first()
			.fill(username);
		await Promise.all([
			page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {}),
			page.getByText("VALIDAR", { exact: false }).last().click(),
		]);
		await page.waitForTimeout(1000);
		await page
			.locator('input[type="password"], input[name*="senha" i], input[name*="password" i]')
			.first()
			.fill(password);
		await Promise.all([
			page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {}),
			page.getByText("ENTRAR", { exact: false }).last().click(),
		]);
		await page.waitForTimeout(2500);
		const auth = await page.evaluate(() => {
			const raw = localStorage.getItem("auth");
			const parsed = raw ? JSON.parse(raw) : null;
			const login = parsed?.login || parsed || {};
			const token = login.access_token || login.token || parsed?.access_token;
			const tokenType = login.token_type || parsed?.token_type || "Bearer";
			return token ? { token, tokenType } : null;
		});
		if (!auth?.token) {
			const error = new Error("HubSoft web auth nao retornou token.");
			error.code = "FAILED_AUTH";
			throw error;
		}
		return {
			baseUrl: normalizeBaseUrl(
				config.internalBaseUrl ||
					process.env.HUBSOFT_INTERNAL_BASE_URL ||
					DEFAULT_INTERNAL_BASE_URL,
			),
			token: auth.token,
			tokenType: auth.tokenType,
		};
	} finally {
		await browser.close().catch(() => {});
	}
}

async function getSession() {
	const config = await readConfig();
	const configuredToken = cleanText(
		config.accessToken || process.env.HUBSOFT_ACCESS_TOKEN,
	);
	if (configuredToken) {
		return {
			baseUrl: normalizeBaseUrl(
				config.internalBaseUrl ||
					process.env.HUBSOFT_INTERNAL_BASE_URL ||
					config.baseUrl ||
					DEFAULT_INTERNAL_BASE_URL,
			),
			token: configuredToken,
			tokenType: cleanText(config.tokenType || "Bearer"),
		};
	}
	const session =
		(await authenticateWithOAuth(config)) ||
		(await authenticateWithPlaywright(config));
	if (!session?.token) {
		const error = new Error(
			"Configure as credenciais do HubSoft antes de sincronizar: informe token, OAuth ou login/senha de acesso.",
		);
		error.code = "FAILED_AUTH";
		error.statusCode = 400;
		throw error;
	}
	return session;
}

async function hubsoftRequest(session, path, { method = "GET", body } = {}) {
	if (!session?.token) {
		const error = new Error("Sessao HubSoft indisponivel.");
		error.code = "FAILED_AUTH";
		error.statusCode = 400;
		throw error;
	}
	const response = await fetch(`${session.baseUrl}${path}`, {
		method,
		headers: {
			Accept: "application/json",
			Authorization: `${session.tokenType || "Bearer"} ${session.token}`,
			...(body ? { "Content-Type": "application/json;charset=UTF-8" } : {}),
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});
	const payload = await parseResponse(response);
	if (!response.ok) {
		const error = new Error(
			payload?.message || payload?.error || `HubSoft HTTP ${response.status}`,
		);
		error.code = response.status === 401 || response.status === 403 ? "FAILED_AUTH" : "FAILED";
		error.statusCode = response.status;
		throw error;
	}
	return payload;
}

function rowsOf(payload) {
	return (
		payload?.ordens_servico?.data ||
		payload?.paginador?.data ||
		payload?.data?.data ||
		payload?.data ||
		payload?.dados ||
		[]
	);
}

function paginationOf(payload, rows) {
	const page = payload?.ordens_servico || payload?.paginador || payload || {};
	const total = Number(page.total ?? payload?.total ?? rows.length);
	const perPage = Number(page.per_page ?? page.itens_por_pagina ?? PAGE_SIZE);
	const lastPage = Number(
		page.last_page ?? page.total_paginas ?? Math.max(1, Math.ceil(total / perPage)),
	);
	return {
		total,
		perPage,
		currentPage: Number(page.current_page ?? page.pagina ?? 1),
		lastPage,
	};
}

function assertEnvelope(payload, rows) {
	if (!payload || typeof payload !== "object" || !Array.isArray(rows)) {
		const error = new Error("Envelope HubSoft inesperado.");
		error.code = "SCHEMA_CHANGED";
		throw error;
	}
}

async function fetchCreateMetadata(session) {
	return hubsoftRequest(session, "/api/v1/ordem_servico/create");
}

function findTypes(createPayload, ids) {
	const set = new Set([...ids].map(Number));
	return (createPayload?.tipos_ordem_servico || [])
		.filter((type) => set.has(Number(type.id_tipo_ordem_servico)))
		.map((type) => ({
			id_tipo_ordem_servico: Number(type.id_tipo_ordem_servico),
			descricao: type.descricao,
			display: type.display || type.descricao,
			tempo_alocacao_agenda: type.tempo_alocacao_agenda,
			prioridade: type.prioridade,
		}));
}

function findMotivoConcluida(createPayload) {
	return (
		(createPayload?.motivo_fechamento || []).find(
			(item) => Number(item.id_motivo_fechamento) === META_MOTIVO_CONCLUIDA_ID,
		) || { id_motivo_fechamento: META_MOTIVO_CONCLUIDA_ID, descricao: "CONCLUÍDA" }
	);
}

function baseReportPayload({ period, types }) {
	return {
		data_inicio: toHubsoftDate(period.inicio),
		data_fim: toHubsoftDate(period.fim),
		tipo_data: "data_cadastro",
		status_ordem_servico: ["aguardando_agendamento", "pendente"],
		tipo_ordem_servicos: types,
		pagina: 1,
		itens_por_pagina: PAGE_SIZE,
	};
}

function metaPayload({ date, createPayload }) {
	return {
		tipo_data: "data_termino_executado",
		order_by: "data_termino_executado",
		order_by_key: "ASC",
		status_ordem_servico: ["finalizado"],
		prioridade: [],
		reservada: null,
		assinatura_cliente: null,
		motivo_fechamento: [findMotivoConcluida(createPayload)],
		pop: [],
		periodos: [],
		tipo_ordem_servicos: findTypes(createPayload, META_TYPE_IDS),
		usuario_abertura: [],
		tecnicos: [],
		participantes: [],
		agendas: [],
		fluxo_aprovacao_configuracao: [],
		cidades: [],
		servico: [],
		servico_status: [],
		grupos_clientes: [],
		grupos_clientes_servicos: [],
		bairros: null,
		condominios: null,
		data_inicio: toHubsoftDate(date),
		data_fim: toHubsoftDate(date),
	};
}

async function collectPaginated(
	session,
	{ path, payload, pageMode = "query", onProgress },
) {
	const all = [];
	let expectedTotal = 0;
	let expectedPages = 1;
	let receivedPages = 0;
	for (let page = 1; page <= expectedPages; page += 1) {
		await onProgress?.({
			stage: `Consultando HubSoft pagina ${page}/${expectedPages}`,
			percent: Math.min(45, 15 + page),
		});
		const body =
			pageMode === "body" ? { ...payload, pagina: page, page } : payload;
		const targetPath = pageMode === "query" ? `${path}?page=${page}` : path;
		const json = await hubsoftRequest(session, targetPath, {
			method: "POST",
			body,
		});
		const rows = rowsOf(json);
		assertEnvelope(json, rows);
		const pagination = paginationOf(json, rows);
		expectedTotal = pagination.total;
		expectedPages = pagination.lastPage;
		receivedPages += 1;
		all.push(...rows);
		if (expectedPages > 500) {
			const error = new Error("Paginacao HubSoft suspeita.");
			error.code = "SUSPICIOUS";
			throw error;
		}
	}
	return {
		rows: all,
		expectedTotal,
		expectedPages,
		receivedPages,
	};
}

async function collectFirstNonEmpty(session, attempts, onProgress) {
	let last = null;
	for (const attempt of attempts) {
		await onProgress?.({
			stage: `Consultando HubSoft (${attempt.label})`,
			percent: attempt.percent || 20,
		});
		const collected = await collectPaginated(session, {
			path: attempt.path,
			payload: attempt.payload,
			pageMode: attempt.pageMode || "body",
			onProgress,
		});
		last = { ...collected, attemptLabel: attempt.label };
		if (collected.rows.length > 0 || Number(collected.expectedTotal || 0) > 0) {
			return last;
		}
	}
	return last;
}

async function collectProfile(profile, options = {}) {
	const session = await getSession();
	await options.onProgress?.({ stage: "Sessao HubSoft autenticada", percent: 8 });
	const createPayload = await fetchCreateMetadata(session);
	await options.onProgress?.({ stage: "Metadados HubSoft carregados", percent: 12 });
	if (profile === PROFILE.META_D0 || profile === PROFILE.META_D_MINUS_ONE) {
		const date =
			options.date ||
			(profile === PROFILE.META_D_MINUS_ONE
				? addDays(todaySaoPaulo(), -1)
				: todaySaoPaulo());
		const payload = metaPayload({ date, createPayload });
		const collected = await collectPaginated(session, {
			path: "/api/v1/ordem_servico/consultar/paginado/100",
			payload,
			pageMode: "query",
			onProgress: options.onProgress,
		});
		return {
			...collected,
			requestSummary: {
				date,
				tipo_data: payload.tipo_data,
				status_ordem_servico: payload.status_ordem_servico,
				motivo_fechamento: payload.motivo_fechamento.map((item) => ({
					id_motivo_fechamento: item.id_motivo_fechamento,
					descricao: item.descricao,
				})),
				tipo_ordem_servicos: payload.tipo_ordem_servicos.map((item) => ({
					id_tipo_ordem_servico: item.id_tipo_ordem_servico,
					descricao: item.descricao,
				})),
			},
		};
	}

	if (profile === PROFILE.LOJA) {
		const date = options.date || addDays(todaySaoPaulo(), -1);
		const basePayload = {
			data_inicio: toHubsoftDate(date),
			data_fim: toHubsoftDate(date),
			tipo_data: "data_cadastro",
			tipo_atendimento: [
				{
					id_tipo_atendimento: LOJA_ATTENDANCE_TYPE_ID,
					descricao: " ENTREGA DE EQUIPAMENTO EM LOJA",
				},
			],
			status_fechamento: [{ descricao: "Concluído", valor: "concluido" }],
			pagina: 1,
			itens_por_pagina: PAGE_SIZE,
		};
		const collected = await collectFirstNonEmpty(
			session,
			[
				{
					label: "relatorio/atendimento objeto",
					path: "/api/v1/relatorio/atendimento",
					payload: basePayload,
					pageMode: "body",
					percent: 20,
				},
				{
					label: "relatorio/atendimento valor",
					path: "/api/v1/relatorio/atendimento",
					payload: {
						...basePayload,
						status_fechamento: ["concluido"],
					},
					pageMode: "body",
					percent: 28,
				},
				{
					label: "relatorio/atendimento plural",
					path: "/api/v1/relatorio/atendimento",
					payload: {
						...basePayload,
						tipo_atendimentos: basePayload.tipo_atendimento,
						status_fechamento: ["concluido"],
					},
					pageMode: "body",
					percent: 36,
				},
			],
			options.onProgress,
		);
		return {
			...collected,
			requestSummary: {
				date,
				attempt: collected?.attemptLabel || null,
				tipo_data: basePayload.tipo_data,
				tipo_atendimento: basePayload.tipo_atendimento,
				status_fechamento: basePayload.status_fechamento,
			},
		};
	}

	const period = options.period || currentMapPeriod(options.date);
	const allTypes = createPayload?.tipos_ordem_servico || [];
	const types =
		profile === PROFILE.MAPA
			? findTypes(createPayload, MAPA_TYPE_IDS)
			: allTypes
					.filter(
						(type) =>
							!MATCH_IGNORED_TYPE_IDS.has(Number(type.id_tipo_ordem_servico)),
					)
					.map((type) => ({
						id_tipo_ordem_servico: Number(type.id_tipo_ordem_servico),
						descricao: type.descricao,
						display: type.display || type.descricao,
					}));
	if (profile === PROFILE.MATCH) {
		await Promise.all(
			MATCH_KNOWN_IGNORED.map(([id, descricao]) =>
				db.query(
					`insert into hubsoft_unknown_os_types
              (id_tipo_ordem_servico, descricao, status, source_payload)
             values ($1, $2, 'IGNORED', $3::jsonb)
             on conflict (id_tipo_ordem_servico) do update set
               descricao = excluded.descricao,
               last_seen_at = now()`,
					[id, descricao, JSON.stringify({ source: "built_in_ignore" })],
				),
			),
		);
	}
	const payload = baseReportPayload({ period, types });
	const collected = await collectPaginated(session, {
		path: `/api/v1/ordem_servico/consultar/paginado/${PAGE_SIZE}`,
		payload,
		pageMode: "query",
		onProgress: options.onProgress,
	});
	return {
		...collected,
		requestSummary: {
			period,
			tipo_data: payload.tipo_data,
			status_ordem_servico: payload.status_ordem_servico,
			tipo_ordem_servicos: types.map((item) => ({
				id_tipo_ordem_servico: item.id_tipo_ordem_servico,
				descricao: item.descricao,
			})),
		},
	};
}

function uniqueKeyFor(profile, row) {
	if (profile === PROFILE.LOJA) {
		return cleanText(row.id_atendimento || row.protocolo);
	}
	return cleanText(row.id_ordem_servico || row.numero_ordem_servico);
}

function extractTechnicians(row = {}) {
	const list = Array.isArray(row.tecnicos)
		? row.tecnicos
		: Array.isArray(row.ordem_servico_tecnico)
			? row.ordem_servico_tecnico.map((item) => item.usuario || item)
			: [];
	return list
		.map((item) => ({
			id: Number(item.id || item.id_usuario || item.id_tecnico || 0) || null,
			name: cleanText(item.name || item.nome || item.display || item.descricao),
		}))
		.filter((item) => item.id || item.name);
}

function extractCity(row = {}) {
	return (
		row?.cliente_servico?.endereco_instalacao?.endereco_numero?.cidade?.nome ||
		row?.cliente_servico?.cliente_servico_endereco?.find?.(
			(item) => item?.tipo === "instalacao",
		)?.endereco_numero?.cidade?.nome ||
		row?.cliente_servico?.cliente_servico_endereco?.[0]?.endereco_numero?.cidade
			?.nome ||
		row?.cidade?.nome ||
		row?.cidade ||
		row?.endereco_instalacao?.cidade?.nome ||
		null
	);
}

function extractCityId(row = {}) {
	return (
		row?.cliente_servico?.endereco_instalacao?.endereco_numero?.cidade
			?.id_cidade ||
		row?.cliente_servico?.cliente_servico_endereco?.find?.(
			(item) => item?.tipo === "instalacao",
		)?.endereco_numero?.cidade?.id_cidade ||
		row?.cliente_servico?.cliente_servico_endereco?.[0]?.endereco_numero?.cidade
			?.id_cidade ||
		row?.cidade?.id_cidade ||
		null
	);
}

function extractOrderType(row = {}) {
	return (
		row?.tipo_ordem_servico?.descricao ||
		row?.tipo_ordem_servico ||
		row?.tipo ||
		""
	);
}

function extractOrderTypeId(row = {}) {
	return Number(
		row?.tipo_ordem_servico?.id_tipo_ordem_servico ||
			row?.id_tipo_ordem_servico ||
			0,
	);
}

function extractMotivo(row = {}) {
	return row?.motivo_fechamento?.descricao || row?.motivo_fechamento || "";
}

function extractStatus(row = {}) {
	return row?.status || row?.status_ordem_servico || "";
}

function extractSourceDate(row = {}) {
	return (
		row?.data_termino_executado ||
		row?.data_termino_executado_br ||
		row?.data_cadastro ||
		row?.data_cadastro_br ||
		null
	);
}

function safeTimestamp(value) {
	const text = cleanText(value);
	if (!text) return null;
	const iso = text.includes(" ") ? text.replace(" ", "T") : text;
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizePhone(value) {
	return cleanText(value).replace(/\D/g, "");
}

function extractPhonesFromText(value) {
	const text = cleanText(value);
	if (!text) return [];
	const phoneLines = text
		.split(/\n+/)
		.filter((line) => /telefone|whats|celular/i.test(line));
	const source = phoneLines.length ? phoneLines.join(" ") : text;
	return [...source.matchAll(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\s?\d{4}[-.\s]?\d{4}/g)]
		.map((match) => normalizePhone(match[0]))
		.filter((phone) => phone.length >= 10 && phone.length <= 13);
}

function extractInstallationAddress(row = {}) {
	const addresses = row?.cliente_servico?.cliente_servico_endereco || [];
	const selected =
		row?.cliente_servico?.endereco_instalacao?.endereco_numero ||
		addresses.find?.((item) => item?.tipo === "instalacao")?.endereco_numero ||
		addresses[0]?.endereco_numero ||
		{};
	return {
		endereco:
			selected.endereco ||
			row.endereco ||
			row.endereco_instalacao ||
			row.cliente_servico?.endereco_numero_completo ||
			"",
		numero: selected.numero || row.numero || "",
		bairro: selected.bairro || row.bairro || "",
		coordenadas:
			row.coordenadas ||
			[selected.latitude, selected.longitude].filter(Boolean).join(", "),
	};
}

function adaptReportRow(row = {}) {
	const cliente = row.cliente || row.cliente_servico?.cliente || {};
	const servico = row.cliente_servico || row.servico || {};
	const address = extractInstallationAddress(row);
	const telefones = [
		row.telefone_primario,
		row.telefone_secundario,
		row.telefone_terciario,
		row.telefone,
		...(Array.isArray(row.telefones) ? row.telefones : []),
		...extractPhonesFromText(row.descricao_abertura),
		...extractPhonesFromText(row.descricao_servico),
	]
		.map(normalizePhone)
		.filter(Boolean);
	return {
		numero_ordem_servico: cleanText(
			row.numero_ordem_servico || row.num_os || row.numero_os,
		),
		status: cleanText(row.status?.descricao || row.status),
		tipo_ordem_servico: cleanText(extractOrderType(row)),
		cidade: cleanText(extractCity(row) || row.cidade),
		codigo_cliente: cleanText(row.codigo_cliente || cliente.codigo_cliente),
		nome_razaosocial: cleanText(
			row.nome_razaosocial || cliente.nome_razaosocial || cliente.nome,
		),
		endereco: cleanText(address.endereco),
		numero: cleanText(address.numero),
		bairro: cleanText(address.bairro),
		telefone_primario: telefones[0] || "",
		telefone_secundario: telefones[1] || "",
		telefone_terciario: telefones[2] || "",
		telefones,
		data_cadastro: cleanText(row.data_cadastro || row.data_cadastro_br),
		servico: cleanText(row.servico || servico.display || servico.descricao),
		numero_plano: cleanText(row.numero_plano || servico.numero_plano),
		id_cliente_servico: cleanText(
			row.id_cliente_servico || servico.id_cliente_servico,
		),
		mac_addr: cleanText(row.mac_addr || row["Mac Addr"]),
		phy_addr: cleanText(row.phy_addr || row["Phy Addr"]),
		coordenadas: cleanText(address.coordenadas),
		tecnicos: extractTechnicians(row)
			.map((item) => item.name)
			.filter(Boolean)
			.join(", "),
	};
}

async function listActiveWithdrawalTechnicians() {
	const result = await db.query(
		`select id, hubsoft_technician_id, nome_hubsoft, nome_exibicao, ativo
       from hubsoft_withdrawal_technicians
      where ativo = true`,
	);
	return result.rows;
}

async function upsertWithdrawalTechnician(technician = {}, user = {}) {
	const result = await db.query(
		`insert into hubsoft_withdrawal_technicians
        (hubsoft_technician_id, nome_hubsoft, nome_exibicao, ativo, observacao,
         created_by, updated_by, source_payload)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       on conflict (hubsoft_technician_id) do update set
         nome_hubsoft = excluded.nome_hubsoft,
         nome_exibicao = coalesce(nullif(hubsoft_withdrawal_technicians.nome_exibicao, ''), excluded.nome_exibicao),
         ativo = excluded.ativo,
         observacao = coalesce(excluded.observacao, hubsoft_withdrawal_technicians.observacao),
         updated_by = excluded.updated_by,
         source_payload = excluded.source_payload
       returning *`,
		[
			Number(technician.hubsoft_technician_id || technician.id),
			cleanText(technician.nome_hubsoft || technician.name),
			cleanText(
				technician.nome_exibicao || technician.nome_hubsoft || technician.name,
			),
			technician.ativo !== false,
			technician.observacao || null,
			user.uid || user.email || null,
			user.uid || user.email || null,
			JSON.stringify(technician.source_payload || technician),
		],
	);
	return result.rows[0];
}

async function discoverWithdrawalTechnicians(user = {}) {
	const session = await getSession();
	const createPayload = await fetchCreateMetadata(session);
	const candidates = (createPayload?.tecnicos || []).filter((technician) =>
		/TECNICO RETIRADA|TÉCNICO RETIRADA/i.test(
			normalizeText(technician.name || technician.nome),
		),
	);
	const saved = [];
	for (const technician of candidates) {
		saved.push(
			await upsertWithdrawalTechnician(
				{
					id: technician.id,
					name: technician.name || technician.nome,
					source_payload: {
						id: technician.id,
						name: technician.name || technician.nome,
					},
				},
				user,
			),
		);
	}
	return { candidates: candidates.length, saved };
}

async function listWithdrawalTechnicians() {
	const result = await db.query(
		`select *
       from hubsoft_withdrawal_technicians
      order by ativo desc, nome_exibicao nulls last, nome_hubsoft`,
	);
	return result.rows;
}

async function buildClassificationMaps() {
	const [technicians, regionais, agentesDocs] = await Promise.all([
		listActiveWithdrawalTechnicians(),
		regionaisRepository.listAllRegionalDocuments(),
		documents.listAllDocuments("agentes").catch(() => []),
	]);
	const techById = new Map(
		technicians.map((item) => [Number(item.hubsoft_technician_id), item]),
	);
	const regionalsByCity = new Map();
	const duplicateRegionalCities = new Map();
	for (const row of regionais) {
		const regionalName = row.data?.nome || row.nome || row.id;
		for (const city of row.data?.cidades || []) {
			const key = normalizeCityKey(city?.nome || city);
			if (!key) continue;
			const entry = {
				cidade: city?.nome || city,
				tipo: city?.tipo || "",
				regional: regionalName,
				regionalId: row.id,
			};
			if (regionalsByCity.has(key)) {
				duplicateRegionalCities.set(key, [
					...(duplicateRegionalCities.get(key) || [regionalsByCity.get(key)]),
					entry,
				]);
			} else {
				regionalsByCity.set(key, entry);
			}
		}
	}
	const agentsByCity = new Map();
	for (const row of agentesDocs) {
		const data = row.data || {};
		const key = normalizeCityKey(data.cidade);
		if (!key) continue;
		agentsByCity.set(key, {
			cidade: data.cidade,
			regional: data.regional_nome,
			regionalId: data.regional_id,
			ownerName: data.responsavel?.nome || data.cidade,
			ownerId: row.id,
		});
	}
	return { techById, regionalsByCity, duplicateRegionalCities, agentsByCity };
}

function classifyOrder(row, maps) {
	const technicians = extractTechnicians(row);
	for (const technician of technicians) {
		const registered = maps.techById.get(Number(technician.id));
		if (registered) {
			return {
				production_channel: "RETIRADA",
				production_owner_id: String(registered.hubsoft_technician_id),
				production_owner_name:
					registered.nome_exibicao || registered.nome_hubsoft || technician.name,
				classification_rule: "WITHDRAWAL_TECHNICIAN_ID",
				classification_reason: "TECHNICIAN_MATCH",
			};
		}
	}

	const city = extractCity(row);
	const cityKey = normalizeCityKey(city);
	if (!cityKey) {
		return {
			production_channel: "UNCLASSIFIED",
			classification_rule: "UNCLASSIFIED",
			classification_reason: "MISSING_CITY",
		};
	}
	const agent = maps.agentsByCity.get(cityKey);
	if (agent) {
		return {
			production_channel: "AA",
			production_owner_id: agent.ownerId || cityKey,
			production_owner_name: agent.cidade || city,
			classification_rule: "AUTHORIZED_AGENT_CITY",
			classification_reason: "AUTHORIZED_AGENT_CITY",
		};
	}
	if (maps.duplicateRegionalCities.has(cityKey)) {
		return {
			production_channel: "UNCLASSIFIED",
			classification_rule: "UNCLASSIFIED",
			classification_reason: "REGIONAL_AMBIGUOUS",
		};
	}
	const regional = maps.regionalsByCity.get(cityKey);
	if (regional) {
		return {
			production_channel: "REGIONAL",
			production_owner_id: regional.regionalId || regional.regional,
			production_owner_name: regional.regional,
			classification_rule: "REGIONAL_CITY",
			classification_reason: "REGIONAL_CITY",
		};
	}
	return {
		production_channel: "UNCLASSIFIED",
		classification_rule: "UNCLASSIFIED",
		classification_reason: "CITY_NOT_FOUND",
	};
}

function recordFor(profile, row, maps) {
	const isMeta = profile === PROFILE.META_D0 || profile === PROFILE.META_D_MINUS_ONE;
	const classification = isMeta
		? classifyOrder(row, maps)
		: {
				production_channel: null,
				production_owner_id: null,
				production_owner_name: null,
				classification_rule: null,
				classification_reason: null,
			};
	return {
		profile,
		entity_type: profile === PROFILE.LOJA ? "attendance" : "order",
		hubsoft_id: String(uniqueKeyFor(profile, row)),
		hubsoft_number: cleanText(
			row.numero_ordem_servico || row.protocolo || row.id_atendimento,
		),
		source_status: cleanText(extractStatus(row)),
		source_type: cleanText(extractOrderType(row) || row.tipo_atendimento?.descricao),
		source_city: cleanText(extractCity(row) || row.cidade),
		source_city_id: cleanText(extractCityId(row)),
		source_date: safeTimestamp(extractSourceDate(row)),
		raw_excerpt: {
			tecnicos: extractTechnicians(row),
			id_tipo_ordem_servico: extractOrderTypeId(row),
			motivo_fechamento: extractMotivo(row),
		},
		...classification,
		classified_at: isMeta ? new Date().toISOString() : null,
	};
}

async function createRun(profile, user = {}) {
	const result = await db.query(
		`insert into hubsoft_sync_runs
        (profile, status, created_by, created_by_name)
       values ($1, 'RUNNING', $2, $3)
       returning *`,
		[profile, user.uid || user.email || null, user.nome || user.name || ""],
	);
	return result.rows[0];
}

async function updateRun(id, patch = {}) {
	const current = await db.query(`select * from hubsoft_sync_runs where id = $1`, [
		id,
	]);
	const row = current.rows[0] || {};
	const next = { ...row, ...patch };
	await db.query(
		`update hubsoft_sync_runs set
         status = $2,
         finished_at = $3,
         duration_ms = $4,
         expected_total = $5,
         expected_pages = $6,
         received_pages = $7,
         received_rows = $8,
         unique_rows = $9,
         duplicate_rows = $10,
         inserted = $11,
         updated = $12,
         deactivated = $13,
         ignored = $14,
         unclassified = $15,
         error_code = $16,
         error_message = $17,
         request_summary = $18::jsonb,
         result_summary = $19::jsonb
       where id = $1
       returning *`,
		[
			id,
			next.status,
			next.finished_at || null,
			next.duration_ms || null,
			next.expected_total ?? null,
			next.expected_pages ?? null,
			next.received_pages ?? null,
			next.received_rows ?? null,
			next.unique_rows ?? null,
			next.duplicate_rows ?? null,
			next.inserted || 0,
			next.updated || 0,
			next.deactivated || 0,
			next.ignored || 0,
			next.unclassified || 0,
			next.error_code || null,
			next.error_message || null,
			JSON.stringify(next.request_summary || {}),
			JSON.stringify(next.result_summary || {}),
		],
	);
	return next;
}

async function updateRunProgress(runId, patch = {}) {
	await updateRun(runId, {
		status: RUN_STATUS.RUNNING,
		result_summary: {
			stage: patch.stage || "Processando",
			percent: Number(patch.percent || 0),
			heartbeatAt: new Date().toISOString(),
		},
	});
}

async function acquireLock(profile, runId, user = {}) {
	const expiresAt = new Date(Date.now() + LOCK_TTL_MS).toISOString();
	const result = await db.query(
		`insert into hubsoft_sync_locks (profile, sync_run_id, expires_at, locked_by)
       values ($1, $2, $3, $4)
       on conflict (profile) do update set
         sync_run_id = excluded.sync_run_id,
         locked_at = now(),
         expires_at = excluded.expires_at,
         locked_by = excluded.locked_by
       where hubsoft_sync_locks.expires_at < now()
       returning *`,
		[profile, runId, expiresAt, user.uid || user.email || null],
	);
	if (!result.rows.length) {
		const error = new Error(`Profile ${profile} ja esta em execucao.`);
		error.code = "ALREADY_RUNNING";
		throw error;
	}
}

async function releaseLock(profile, runId) {
	await db.query(
		`delete from hubsoft_sync_locks
      where profile = $1 and sync_run_id = $2`,
		[profile, runId],
	);
}

async function persistRecords(runId, profile, records) {
	let inserted = 0;
	let updated = 0;
	const activeIds = [];
	for (const record of records) {
		activeIds.push(record.hubsoft_id);
		const result = await db.query(
			`insert into hubsoft_sync_records
          (sync_run_id, profile, entity_type, hubsoft_id, hubsoft_number,
           source_status, source_type, source_city, source_city_id, source_date,
           production_channel, production_owner_id, production_owner_name,
           classification_rule, classification_reason, classified_at,
           raw_excerpt, active)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 $11, $12, $13, $14, $15, $16, $17::jsonb, true)
         on conflict (profile, entity_type, hubsoft_id) do update set
           sync_run_id = excluded.sync_run_id,
           hubsoft_number = excluded.hubsoft_number,
           source_status = excluded.source_status,
           source_type = excluded.source_type,
           source_city = excluded.source_city,
           source_city_id = excluded.source_city_id,
           source_date = excluded.source_date,
           production_channel = excluded.production_channel,
           production_owner_id = excluded.production_owner_id,
           production_owner_name = excluded.production_owner_name,
           classification_rule = excluded.classification_rule,
           classification_reason = excluded.classification_reason,
           classified_at = excluded.classified_at,
           raw_excerpt = excluded.raw_excerpt,
           active = true
         returning (xmax = 0) as inserted`,
			[
				runId,
				record.profile,
				record.entity_type,
				record.hubsoft_id,
				record.hubsoft_number,
				record.source_status,
				record.source_type,
				record.source_city,
				record.source_city_id,
				record.source_date,
				record.production_channel,
				record.production_owner_id,
				record.production_owner_name,
				record.classification_rule,
				record.classification_reason,
				record.classified_at,
				JSON.stringify(record.raw_excerpt || {}),
			],
		);
		if (result.rows[0]?.inserted) inserted += 1;
		else updated += 1;
	}
	const deactivated = await db.query(
		`update hubsoft_sync_records
        set active = false
      where profile = $1
        and sync_run_id <> $2
        and active = true
        and not (hubsoft_id = any($3::text[]))`,
		[profile, runId, activeIds],
	);
	return { inserted, updated, deactivated: deactivated.rowCount || 0 };
}

function validateCollected(collected, uniqueRows) {
	if (collected.expectedTotal === 0 && collected.receivedRows === 0) {
		return RUN_STATUS.VALID_EMPTY_RESULT;
	}
	if (collected.expectedTotal !== collected.receivedRows) return RUN_STATUS.INCOMPLETE;
	if (uniqueRows !== collected.receivedRows) return RUN_STATUS.SUSPICIOUS;
	return RUN_STATUS.COMPLETE;
}

function summarizeRecords(records) {
	const byChannel = {};
	const byReason = {};
	const byCity = {};
	const byType = {};
	for (const record of records) {
		const channel = record.production_channel || "N/A";
		byChannel[channel] = (byChannel[channel] || 0) + 1;
		const city = record.source_city || "Sem cidade";
		byCity[city] = (byCity[city] || 0) + 1;
		const type = record.source_type || "Sem tipo";
		byType[type] = (byType[type] || 0) + 1;
		if (record.classification_reason) {
			byReason[record.classification_reason] =
				(byReason[record.classification_reason] || 0) + 1;
		}
	}
	const rankingFrom = (source) =>
		Object.entries(source)
			.map(([label, total]) => ({ label, total }))
			.sort((left, right) => right.total - left.total)
			.slice(0, 10);
	return {
		byChannel,
		byReason,
		ranking: {
			cidades: rankingFrom(byCity),
			tipos: rankingFrom(byType),
			canais: rankingFrom(byChannel),
		},
	};
}

async function maybeApplyOperationalProfile(profile, rows, records, options, user) {
	if (![PROFILE.MAPA, PROFILE.MATCH, PROFILE.META_D0, PROFILE.META_D_MINUS_ONE, PROFILE.LOJA].includes(profile)) return null;
	if (options.applyOperational === false) return null;
	if ([PROFILE.META_D0, PROFILE.META_D_MINUS_ONE, PROFILE.LOJA].includes(profile)) {
		return operationalImports.persistHubsoftMetaRecords({
			profile,
			date:
				options.date ||
				(profile === PROFILE.META_D_MINUS_ONE || profile === PROFILE.LOJA
					? addDays(todaySaoPaulo(), -1)
					: todaySaoPaulo()),
			records,
			user,
		});
	}
	const payload = {
		rows: rows.map(adaptReportRow),
		periodo: options.period || currentMapPeriod(options.date),
		fontes: options.fontes || ["sempre", "onnet"],
	};
	if (profile === PROFILE.MAPA) {
		return operationalImports.persistMapaImport(payload, user, {});
	}
	return operationalImports.persistMatchImport(payload, user, {});
}

async function runProfile(profile, options = {}, user = {}) {
	if (!Object.values(PROFILE).includes(profile)) {
		const error = new Error(`Profile HubSoft invalido: ${profile}`);
		error.statusCode = 400;
		throw error;
	}
	const run = await createRun(profile, user);
	const started = Date.now();
	let lockAcquired = false;
	try {
		await acquireLock(profile, run.id, user);
		lockAcquired = true;
		await updateRunProgress(run.id, {
			stage: "Iniciando execucao",
			percent: 3,
		});
		if (options.discoverTechnicians !== false) {
			await updateRunProgress(run.id, {
				stage: "Atualizando tecnicos de retirada",
				percent: 5,
			});
			await discoverWithdrawalTechnicians(user).catch(() => null);
		}
		const collected = await collectProfile(profile, {
			...options,
			onProgress: (progress) => updateRunProgress(run.id, progress),
		});
		await updateRunProgress(run.id, {
			stage: "Normalizando registros",
			percent: 55,
		});
		const keys = collected.rows.map((row) => uniqueKeyFor(profile, row)).filter(Boolean);
		const uniqueRows = new Set(keys).size;
		const duplicateRows = keys.length - uniqueRows;
		const collectedStats = {
			expectedTotal: collected.expectedTotal,
			expectedPages: collected.expectedPages,
			receivedPages: collected.receivedPages,
			receivedRows: collected.rows.length,
			uniqueRows,
			duplicateRows,
		};
		await updateRunProgress(run.id, {
			stage: "Classificando producao",
			percent: 62,
		});
		const maps = await buildClassificationMaps();
		const records = collected.rows
			.filter((row) => uniqueKeyFor(profile, row))
			.map((row) => recordFor(profile, row, maps));
		const status = validateCollected(
			{ ...collectedStats, receivedRows: collected.rows.length },
			uniqueRows,
		);
		let persistence = { inserted: 0, updated: 0, deactivated: 0 };
		let operational = null;
		if ([RUN_STATUS.COMPLETE, RUN_STATUS.VALID_EMPTY_RESULT].includes(status)) {
			await updateRunProgress(run.id, {
				stage: "Salvando historico HubSoft",
				percent: 72,
			});
			persistence = await persistRecords(run.id, profile, records);
			await updateRunProgress(run.id, {
				stage: "Aplicando nos paineis operacionais",
				percent: 84,
			});
			operational = await maybeApplyOperationalProfile(
				profile,
				collected.rows,
				records,
				options,
				user,
			);
		}
		const unclassified = records.filter(
			(record) => record.production_channel === "UNCLASSIFIED",
		).length;
		const finishedAt = new Date().toISOString();
		const resultSummary = {
			...summarizeRecords(records),
			operational,
			stage: "Concluido",
			percent: 100,
			heartbeatAt: finishedAt,
			date: options.date || null,
			period: options.period || null,
		};
		await updateRun(run.id, {
			status,
			finished_at: finishedAt,
			duration_ms: Date.now() - started,
			expected_total: collectedStats.expectedTotal,
			expected_pages: collectedStats.expectedPages,
			received_pages: collectedStats.receivedPages,
			received_rows: collectedStats.receivedRows,
			unique_rows: uniqueRows,
			duplicate_rows: duplicateRows,
			inserted: persistence.inserted,
			updated: persistence.updated,
			deactivated: persistence.deactivated,
			unclassified,
			request_summary: collected.requestSummary,
			result_summary: resultSummary,
		});
		return getRun(run.id);
	} catch (error) {
		const status = error.code === "FAILED_AUTH" ? RUN_STATUS.FAILED_AUTH : error.code === "SCHEMA_CHANGED" ? RUN_STATUS.SCHEMA_CHANGED : error.code === "SUSPICIOUS" ? RUN_STATUS.SUSPICIOUS : RUN_STATUS.FAILED;
		await updateRun(run.id, {
			status,
			finished_at: new Date().toISOString(),
			duration_ms: Date.now() - started,
			error_code: error.code || status,
			error_message: sanitizeErrorMessage(error),
		});
		throw error;
	} finally {
		if (lockAcquired) await releaseLock(profile, run.id).catch(() => {});
	}
}

function localDateParts(date = new Date()) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	})
		.formatToParts(date)
		.reduce((acc, item) => {
			acc[item.type] = item.value;
			return acc;
		}, {});
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		hour: Number(parts.hour),
		minute: Number(parts.minute),
		time: `${parts.hour}:${parts.minute}`,
	};
}

function minutesSince(value) {
	const time = value ? new Date(value).getTime() : 0;
	if (!Number.isFinite(time) || time <= 0) return Infinity;
	return (Date.now() - time) / 60_000;
}

function isTimeDue(nowTime, targetTime) {
	return nowTime >= normalizeTime(targetTime);
}

async function runProfileSafely(profile, options = {}) {
	try {
		return await runProfile(
			profile,
			{ ...options, discoverTechnicians: false },
			SCHEDULER_USER,
		);
	} catch (error) {
		console.error(
			`[hubsoftSyncProfiles] Falha na rotina ${profile}:`,
			error?.message || error,
		);
		return null;
	}
}

async function runSchedulerTick() {
	if (schedulerTickRunning) return { ok: true, skipped: "already_running" };
	schedulerTickRunning = true;
	try {
	const rawConfig = await readConfig();
	const config = normalizeAutomationConfig(rawConfig);
	if (!config.autoSyncEnabled) return { ok: true, skipped: "disabled" };

	const now = localDateParts();
	const results = [];

	if (
		config.autoDailyEnabled &&
		minutesSince(rawConfig.autoDailyLastRunAt) >= config.autoDailyIntervalMinutes
	) {
		results.push({
			profile: PROFILE.META_D0,
			result: await runProfileSafely(PROFILE.META_D0, { date: now.date }),
		});
		const patch = { autoDailyLastRunAt: new Date().toISOString() };
		if (config.autoDailyCheckpointHours.includes(now.hour)) {
			const checkpointKey = `${now.date}-${String(now.hour).padStart(2, "0")}`;
			if (rawConfig.autoDailyLastCheckpointKey !== checkpointKey) {
				patch.autoDailyLastCheckpointKey = checkpointKey;
				patch.autoDailyLastCheckpointAt = new Date().toISOString();
			}
		}
		await saveSchedulerState(patch);
	}

	if (
		config.autoMetaEnabled &&
		isTimeDue(now.time, config.autoMetaTime) &&
		rawConfig.autoMetaLastRunDate !== now.date
	) {
		results.push({
			profile: PROFILE.META_D_MINUS_ONE,
			result: await runProfileSafely(PROFILE.META_D_MINUS_ONE, {
				date: addDays(now.date, -1),
			}),
		});
		await saveSchedulerState({
			autoMetaLastRunDate: now.date,
			autoMetaLastRunAt: new Date().toISOString(),
		});
	}

	if (
		config.autoMapMatchEnabled &&
		minutesSince(rawConfig.autoMapMatchLastRunAt) >=
			config.autoMapMatchIntervalMinutes
	) {
		results.push({
			profile: PROFILE.MAPA,
			result: await runProfileSafely(PROFILE.MAPA),
		});
		results.push({
			profile: PROFILE.MATCH,
			result: await runProfileSafely(PROFILE.MATCH),
		});
		await saveSchedulerState({
			autoMapMatchLastRunAt: new Date().toISOString(),
		});
	}

	return { ok: true, results };
	} finally {
		schedulerTickRunning = false;
	}
}

function startScheduler(app) {
	if (app?.locals?.hubsoftSyncProfilesTimer) return app.locals.hubsoftSyncProfilesTimer;
	const timer = setInterval(() => {
		runSchedulerTick().catch((error) => {
			console.error(
				"[hubsoftSyncProfiles] Falha no scheduler:",
				error?.message || error,
			);
		});
	}, Number(process.env.HUBSOFT_SYNC_SCHEDULER_INTERVAL_MS || SCHEDULER_CHECK_INTERVAL_MS));
	timer.unref?.();
	if (app?.locals) app.locals.hubsoftSyncProfilesTimer = timer;
	return timer;
}

async function getRun(id) {
	const result = await db.query(`select * from hubsoft_sync_runs where id = $1`, [
		id,
	]);
	return result.rows[0] || null;
}

async function listRuns({ limit = 20, profile } = {}) {
	const params = [];
	let where = "";
	if (profile) {
		params.push(profile);
		where = "where profile = $1";
	}
	params.push(Math.min(Math.max(Number(limit || 20), 1), 100));
	const result = await db.query(
		`select *
       from hubsoft_sync_runs
       ${where}
      order by started_at desc
      limit $${params.length}`,
		params,
	);
	return result.rows;
}

async function listRecords({ runId, profile, channel, limit = 200 } = {}) {
	const clauses = [];
	const params = [];
	if (runId) {
		params.push(runId);
		clauses.push(`sync_run_id = $${params.length}`);
	}
	if (profile) {
		params.push(profile);
		clauses.push(`profile = $${params.length}`);
	}
	if (channel) {
		params.push(channel);
		clauses.push(`production_channel = $${params.length}`);
	}
	params.push(Math.min(Math.max(Number(limit || 200), 1), 1000));
	const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
	const result = await db.query(
		`select *
       from hubsoft_sync_records
       ${where}
      order by source_date nulls last, hubsoft_number
      limit $${params.length}`,
		params,
	);
	return result.rows;
}

async function getProfilesOverview() {
	const runs = await listRuns({ limit: 50 });
	const locks = await db.query(`select * from hubsoft_sync_locks`);
	const lockByProfile = new Map(locks.rows.map((lock) => [lock.profile, lock]));
	return Object.values(PROFILE).map((profile) => {
		const lastRun = runs.find((run) => run.profile === profile) || null;
		const lock = lockByProfile.get(profile) || null;
		return {
			profile,
			status: lock ? RUN_STATUS.RUNNING : lastRun?.status || "NEVER_RUN",
			lastRun,
			locked: Boolean(lock),
			lock,
		};
	});
}

module.exports = {
	PROFILE,
	RUN_STATUS,
	classifyOrder,
	discoverWithdrawalTechnicians,
	getProfilesOverview,
	listRecords,
	listRuns,
	listWithdrawalTechnicians,
	runSchedulerTick,
	runProfile,
	startScheduler,
	upsertWithdrawalTechnician,
};
