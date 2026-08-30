const documents = require("./documents");
const financeiroReportsRepository = require("./financeiroReportsRepository");
const { google } = require("googleapis");
const crypto = require("node:crypto");
const fs = require("fs");
const { DEFAULT_COST_CENTER_PLAN } = require("./financeiroCostCenterPlan");
const {
	DEFAULT_FINANCIAL_ACCOUNT_PLAN,
} = require("./financeiroFinancialAccountPlan");

const DASHBOARD_PATH = "financeiro_config/dashboard";
const BUDGET_COST_CENTERS_PATH = "financeiro_config/orcamento_centros_custo";
const BUDGET_DATA_PATH = "financeiro_config/orcamento_dados";
const SHEETS_CONFIG_PATH = "financeiro_config/google_sheets";
const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
const SHEET_TYPES = [
	{ id: "contas_pagar", label: "Contas a pagar", defaultRange: "A:ZZ" },
	{ id: "contas_receber", label: "Contas a receber", defaultRange: "A:ZZ" },
	{ id: "faturamento", label: "Faturamento", defaultRange: "A:ZZ" },
	{ id: "notas", label: "Notas", defaultRange: "A:ZZ" },
	{
		id: "serasa",
		label: "Serasa",
		defaultRange: "A:ZZ",
		defaultSheetName: "MOVIMENTAÇÃO SERASA",
		defaultHeaderRow: 1,
	},
	{
		id: "tarifas",
		label: "Tarifas",
		defaultRange: "A:ZZ",
		defaultSheetName: "",
		defaultHeaderRow: 1,
	},
];

const DEFAULT_BUDGET_SETTINGS = {
	centerTypes: ["sintetico", "analitico"],
	mainCategories: [
		"11 - DEPARTAMENTO",
		"12 - INATIVO - DEPARTAMENTO ADMINISTRATIVO",
		"13 - INATIVO - DEPARTAMENTO COMERCIAL",
		"14 - INATIVO - DEPARTAMENTO EXPERIENCIA DO CLIENTE",
		"15 - INATIVO - DEPARTAMENTO DSO",
		"16 - INATIVO - DEPARTAMENTO FINANCEIRO",
		"17 - INATIVO - DEPARTAMENTO PESSOAL",
		"18 - INATIVO - DEPARTAMENTO SIS/TD",
		"19 - INATIVO - DEPARTAMENTO T.I",
		"21 - Lançamentos reclassificar - INATIVAR",
		"22 - PROJETOS",
	],
	directorates: [],
	accountGroups: [
		"11 - RECEITAS",
		"12 - CUSTOS",
		"13 - DESPESAS",
		"14 - IMPOSTOS",
		"15 - DISTRIBUIÇÃO",
		"16 - CONTA TRANSITÓRIA",
		"17 - DEDUÇÕES",
		"18 - AÇÕES",
	],
	dreGroups: [
		"Receita Bruta",
		"Despesas administrativas",
		"Despesas operacionais",
		"CAPEX",
		"Impostos",
	],
	centerStatuses: ["ativo", "em_observacao", "bloqueado", "inativo"],
};

const BUDGET_DATA_FIELDS = [
	{ key: "quebra", label: "Quebra" },
	{ key: "data", label: "Data" },
	{ key: "fornecedor", label: "Fornecedor" },
	{ key: "codConta", label: "Cod_Conta" },
	{ key: "nomeConta", label: "Nome_Conta" },
	{ key: "codCc", label: "Cod_CC" },
	{ key: "nomeCc", label: "Nome_CC" },
	{ key: "orcado", label: "Orçado" },
	{ key: "realizado", label: "Realizado" },
	{ key: "empresa", label: "Empresa" },
	{ key: "filial", label: "Filial" },
	{ key: "conta", label: "Conta" },
	{ key: "seqMov", label: "SeqMov" },
	{ key: "titulo", label: "Titulo" },
	{ key: "tipo", label: "Tipo" },
	{ key: "observacoes", label: "Observações" },
	{ key: "ano", label: "Ano" },
	{ key: "numMes", label: "Num_Mes" },
	{ key: "mes", label: "Mês" },
	{ key: "categoria", label: "Categoria" },
	{ key: "gestor", label: "Gestor" },
	{ key: "quebra2", label: "Quebra2" },
	{ key: "entidade", label: "Entidade" },
	{ key: "diretoria", label: "Diretoria" },
	{ key: "diretor", label: "Diretor" },
	{ key: "statusProjetos", label: "Status_Projetos" },
	{ key: "grupo", label: "Grupo" },
];

let sheetsClient = null;
let workerTimer = null;
let workerRunning = false;
let serviceAccountInfoCache = null;

function nowIso() {
	return new Date().toISOString();
}

function toNumber(value) {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : 0;
	}
	const text = String(value || "").trim();
	if (!text) return 0;
	const normalized = text
		.replace(/[R$\s]/g, "")
		.replace(/\.(?=\d{3}(\D|$))/g, "")
		.replace(",", ".");
	const number = Number(normalized || 0);
	return Number.isFinite(number) ? number : 0;
}

function currency(value) {
	return Math.round(toNumber(value) * 100) / 100;
}

function validBudgetMonth(value) {
	const month = Number(value || 0) || 0;
	return month >= 1 && month <= 12 ? month : "";
}

function firstValue(row = {}, keys = []) {
	for (const key of keys) {
		if (Object.hasOwn(row, key) && cleanText(row[key])) return row[key];
	}
	return "";
}

function splitCodeName(value) {
	const text = cleanText(value);
	if (!text) return { codigo: "", nome: "", raw: "" };
	const match = text.match(/^\s*([^-–—]+?)\s*[-–—]\s*(.+)\s*$/);
	if (!match) return { codigo: "", nome: text, raw: text };
	return {
		codigo: cleanText(match[1]),
		nome: cleanText(match[2]),
		raw: text,
	};
}

function monthName(month) {
	return (
		[
			"",
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
		][Number(month) || 0] || ""
	);
}

function normalizeBudgetDate(value) {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return {
			data: value.toISOString().slice(0, 10),
			ano: value.getFullYear(),
			numMes: value.getMonth() + 1,
			mes: monthName(value.getMonth() + 1),
		};
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		const excelEpoch = Date.UTC(1899, 11, 30);
		const parsed = new Date(excelEpoch + Math.round(value) * 86400000);
		if (!Number.isNaN(parsed.getTime())) {
			const month = parsed.getUTCMonth() + 1;
			return {
				data: `${parsed.getUTCFullYear()}-${String(month).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`,
				ano: parsed.getUTCFullYear(),
				numMes: month,
				mes: monthName(month),
			};
		}
	}

	const text = cleanText(value);
	if (!text) return { data: "", ano: "", numMes: "", mes: "" };

	const brDate = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
	if (brDate) {
		const first = Number(brDate[1]);
		const second = Number(brDate[2]);
		const month = first <= 12 ? first : second;
		const day = first <= 12 ? second : first;
		if (month < 1 || month > 12 || day < 1 || day > 31) {
			return { data: text, ano: "", numMes: "", mes: "" };
		}
		const year = Number(brDate[3].length === 2 ? `20${brDate[3]}` : brDate[3]);
		const parsed = new Date(Date.UTC(year, month - 1, day));
		if (!Number.isNaN(parsed.getTime())) {
			return {
				data: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
				ano: year,
				numMes: month,
				mes: monthName(month),
			};
		}
	}

	const parsed = new Date(text);
	if (!Number.isNaN(parsed.getTime())) {
		return {
			data: parsed.toISOString().slice(0, 10),
			ano: parsed.getFullYear(),
			numMes: parsed.getMonth() + 1,
			mes: monthName(parsed.getMonth() + 1),
		};
	}

	return { data: text, ano: "", numMes: "", mes: "" };
}

function emptyDashboard() {
	return {
		source: "empty",
		updatedAt: "",
		kpis: [],
		lastBillings: [],
		receivables: [],
		paymentMethods: [],
		revenueEvolution: [],
		citiesRanking: [],
		alerts: [],
		operationalSummary: {},
		upcomingAccounts: [],
		extras: {},
	};
}

function cleanText(value) {
	return String(value || "").trim();
}

function normalizeEmail(value) {
	return cleanText(value).toLowerCase();
}

function getUserEmail(user = {}) {
	return normalizeEmail(user.email || user.profile?.email || user.user?.email);
}

function getUserPermissionList(user = {}) {
	return [
		...(Array.isArray(user.permissions) ? user.permissions : []),
		...(Array.isArray(user.profile?.permissions)
			? user.profile.permissions
			: []),
		...(Array.isArray(user.permissoes) ? user.permissoes : []),
		...(Array.isArray(user.profile?.permissoes) ? user.profile.permissoes : []),
	]
		.map(cleanText)
		.filter(Boolean);
}

function userCanManageBudget(user = {}) {
	const role = cleanText(
		user.role || user.profile?.role || user.cargo,
	).toLowerCase();
	if (["admin", "administrador"].includes(role)) return true;
	const permissions = new Set(getUserPermissionList(user));
	return (
		permissions.has("financeiro.gestao_orcamento.manage") ||
		permissions.has("financeiro.configuracoes.manage")
	);
}

function httpError(message, statusCode = 400) {
	const error = new Error(message);
	error.statusCode = statusCode;
	return error;
}

function slug(value, fallback = "item") {
	return (
		cleanText(value)
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || fallback
	);
}

function budgetCodeKey(value) {
	return cleanText(value).replace(/\D/g, "");
}

function budgetEntityIdFromCode(value, fallback = "item") {
	const code = budgetCodeKey(value);
	return code || slug(value, fallback);
}

function toBool(value) {
	return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeSpreadsheetId(value) {
	const text = cleanText(value);
	if (!text) return "";
	const sheetsMatch = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
	if (sheetsMatch?.[1]) return sheetsMatch[1];
	const idQueryMatch = text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
	if (idQueryMatch?.[1]) return idQueryMatch[1];
	return text;
}

function getSheetsServiceAccountInfo() {
	const keyFile = cleanText(process.env.GOOGLE_APPLICATION_CREDENTIALS);
	if (!keyFile) {
		return {
			configured: false,
			email: "",
			projectId: "",
			error: "GOOGLE_APPLICATION_CREDENTIALS não configurado.",
		};
	}

	if (serviceAccountInfoCache?.keyFile === keyFile) {
		return serviceAccountInfoCache.info;
	}

	try {
		const keyData = JSON.parse(fs.readFileSync(keyFile, "utf8"));
		const info = {
			configured: Boolean(keyData.client_email),
			email: cleanText(keyData.client_email),
			projectId: cleanText(keyData.project_id),
			error: keyData.client_email
				? ""
				: "JSON da Service Account sem client_email.",
		};
		serviceAccountInfoCache = { keyFile, info };
		return info;
	} catch (error) {
		const info = {
			configured: false,
			email: "",
			projectId: "",
			error: `Não foi possível ler o JSON da Service Account: ${error.message}`,
		};
		serviceAccountInfoCache = { keyFile, info };
		return info;
	}
}

function getDefaultSheetsConfig() {
	const serviceAccount = getSheetsServiceAccountInfo();
	return {
		enabled: false,
		intervalMinutes: 30,
		serviceAccountConfigured: serviceAccount.configured,
		serviceAccountEmail: serviceAccount.email,
		serviceAccountProjectId: serviceAccount.projectId,
		serviceAccountError: serviceAccount.error,
		lastRunAt: "",
		lastRunStatus: "",
		lastRunMessage: "",
		nextRunAt: "",
		sources: SHEET_TYPES.map((item) => ({
			id: item.id,
			label: item.label,
			enabled: false,
			spreadsheetId: "",
			spreadsheetUrl: "",
			sheetName: item.defaultSheetName || "",
			range: item.defaultRange,
			headerRow: item.defaultHeaderRow || 1,
			intervalMinutes: item.id === "serasa" ? 60 : "",
			lastReadAt: "",
			lastStatus: "",
			lastMessage: "",
			lastRows: 0,
			lastColumns: 0,
		})),
	};
}

function mergeSheetsConfig(data = {}) {
	const defaults = getDefaultSheetsConfig();
	const incomingSources = Array.isArray(data.sources) ? data.sources : [];
	const sources = defaults.sources.map((source) => {
		const incoming =
			incomingSources.find((item) => item?.id === source.id) || {};
		return {
			...source,
			...incoming,
			enabled: toBool(incoming.enabled),
			spreadsheetId: normalizeSpreadsheetId(
				incoming.spreadsheetUrl || incoming.spreadsheetId,
			),
			spreadsheetUrl: cleanText(incoming.spreadsheetUrl),
			sheetName: cleanText(incoming.sheetName),
			range: source.range,
			headerRow: Math.max(
				1,
				Number(incoming.headerRow || source.headerRow || 1),
			),
			intervalMinutes: Math.max(
				5,
				Math.min(
					24 * 60,
					Number(incoming.intervalMinutes || source.intervalMinutes || 60),
				),
			),
		};
	});

	const intervalMinutes = Math.max(
		5,
		Math.min(24 * 60, Number(data.intervalMinutes || defaults.intervalMinutes)),
	);
	const serviceAccount = getSheetsServiceAccountInfo();
	const {
		serviceAccountConfigured: _incomingServiceAccountConfigured,
		serviceAccountEmail: _incomingServiceAccountEmail,
		serviceAccountProjectId: _incomingServiceAccountProjectId,
		serviceAccountError: _incomingServiceAccountError,
		...persistedData
	} = data;
	return {
		...defaults,
		...persistedData,
		enabled: toBool(data.enabled),
		intervalMinutes,
		serviceAccountConfigured: serviceAccount.configured,
		serviceAccountEmail: serviceAccount.email,
		serviceAccountProjectId: serviceAccount.projectId,
		serviceAccountError: serviceAccount.error,
		sources,
	};
}

async function getSheetsConfig() {
	const doc = await documents.getDocument(SHEETS_CONFIG_PATH).catch(() => null);
	return mergeSheetsConfig(doc?.data || {});
}

async function saveSheetsConfig(payload = {}, user = {}) {
	const current = await getSheetsConfig();
	const next = mergeSheetsConfig({
		...current,
		...payload,
		sources: Array.isArray(payload.sources) ? payload.sources : current.sources,
		updatedAt: nowIso(),
		updatedBy: user?.uid || user?.email || "",
		updatedByName: user?.profile?.nome || user?.nome || user?.email || "",
	});

	await documents.upsertDocument({
		path: SHEETS_CONFIG_PATH,
		collectionPath: "financeiro_config",
		documentId: "google_sheets",
		parentPath: null,
		data: next,
	});
	return { ok: true, config: next };
}

async function getSheetsClient() {
	if (sheetsClient) return sheetsClient;
	const keyFile = cleanText(process.env.GOOGLE_APPLICATION_CREDENTIALS);
	if (!keyFile)
		throw new Error("GOOGLE_APPLICATION_CREDENTIALS não configurado.");
	const auth = new google.auth.GoogleAuth({ keyFile, scopes: SHEETS_SCOPES });
	sheetsClient = google.sheets({ version: "v4", auth });
	return sheetsClient;
}

function normalizeSheetTitle(value) {
	return cleanText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

function normalizeSheetRange(value) {
	const range = cleanText(value) || "A:Z";
	const rangeParts = range.split("!");
	return cleanText(rangeParts.at(-1)) || "A:Z";
}

function buildSheetRange(source = {}, overrides = {}) {
	const sheetName = cleanText(overrides.sheetName ?? source.sheetName);
	const range = normalizeSheetRange(overrides.range ?? source.range) || "A:ZZ";
	if (!sheetName) return range;
	const safeSheetName = sheetName.includes("'")
		? sheetName.replace(/'/g, "''")
		: sheetName;
	return `'${safeSheetName}'!${range}`;
}

function getDefaultSheetRange(source = {}) {
	const sourceType = SHEET_TYPES.find((item) => item.id === source.id);
	return sourceType?.defaultRange || "A:ZZ";
}

async function listSpreadsheetSheetTitles(sheets, spreadsheetId) {
	const response = await sheets.spreadsheets.get({
		spreadsheetId,
		fields: "sheets(properties(title))",
	});
	return (response.data.sheets || [])
		.map((sheet) => cleanText(sheet.properties?.title))
		.filter(Boolean);
}

function resolveFallbackSheetTitle(source = {}, titles = []) {
	const requested = normalizeSheetTitle(source.sheetName);
	const sourceId = cleanText(source.id);
	if (!titles.length) return "";
	const exact = titles.find((title) => normalizeSheetTitle(title) === requested);
	if (exact) return exact;
	if (sourceId === "serasa") {
		const serasaTitle = titles.find((title) =>
			normalizeSheetTitle(title).includes("serasa"),
		);
		if (serasaTitle) return serasaTitle;
	}
	return titles[0];
}

async function getSheetValues(sheets, spreadsheetId, range) {
	return sheets.spreadsheets.values.get({
		spreadsheetId,
		range,
		majorDimension: "ROWS",
	});
}

function normalizeGoogleSheetsError(error, source = {}) {
	const googleStatus = Number(
		error?.code || error?.status || error?.response?.status || 0,
	);
	const googleMessage = cleanText(
		error?.response?.data?.error?.message ||
			error?.errors?.[0]?.message ||
			error?.message,
	);
	const sourceLabel = cleanText(source.label) || "planilha";
	const friendly = new Error();

	if (
		googleStatus === 401 ||
		/invalid_grant|unauthorized/i.test(googleMessage)
	) {
		friendly.statusCode = 400;
		friendly.message =
			"A credencial da Service Account está inválida, expirada ou revogada. Gere/instale um novo JSON e tente novamente.";
		return friendly;
	}

	if (googleStatus === 403 || /permission|forbidden/i.test(googleMessage)) {
		friendly.statusCode = 403;
		friendly.message = `A Service Account não tem acesso à origem "${sourceLabel}". Compartilhe a Google Planilha com o e-mail exibido em Financeiro > Configurações como Leitor.`;
		return friendly;
	}

	if (googleStatus === 404 || /not found/i.test(googleMessage)) {
		friendly.statusCode = 404;
		friendly.message = `Google Planilha não encontrada para "${sourceLabel}". Confira se o ID/link está correto e se a planilha foi compartilhada com a Service Account.`;
		return friendly;
	}

	if (
		googleStatus === 400 ||
		/Unable to parse range|range|Invalid/i.test(googleMessage)
	) {
		friendly.statusCode = 400;
		friendly.message = `Aba ou range inválido em "${sourceLabel}". Confira o nome da aba, o intervalo e a linha do cabeçalho.`;
		return friendly;
	}

	friendly.statusCode = googleStatus >= 500 ? 502 : 400;
	friendly.message = `Falha ao ler a Google Planilha "${sourceLabel}": ${googleMessage || "erro não informado pela Google API."}`;
	return friendly;
}

async function readSheetSource(source = {}) {
	const spreadsheetId = normalizeSpreadsheetId(
		source.spreadsheetUrl || source.spreadsheetId,
	);
	if (!spreadsheetId) {
		const error = new Error("Informe o ID ou link da Google Planilha.");
		error.statusCode = 400;
		throw error;
	}
	const sheets = await getSheetsClient();
	let response;
	const defaultRange = getDefaultSheetRange(source);
	let usedRange = buildSheetRange(source, { range: defaultRange });
	try {
		response = await getSheetValues(sheets, spreadsheetId, usedRange);
	} catch (error) {
		const normalizedError = normalizeGoogleSheetsError(error, source);
		if (normalizedError.statusCode !== 400) throw normalizedError;
		try {
			const titles = await listSpreadsheetSheetTitles(sheets, spreadsheetId);
			const fallbackSheetName = resolveFallbackSheetTitle(source, titles);
			if (!fallbackSheetName) throw normalizedError;
			const fallbackRanges = [
				defaultRange,
				"A:ZZ",
				"A:Z",
			].filter((range, index, list) => range && list.indexOf(range) === index);
			let lastFallbackError = null;
			for (const range of fallbackRanges) {
				usedRange = buildSheetRange(source, {
					sheetName: fallbackSheetName,
					range,
				});
				try {
					response = await getSheetValues(sheets, spreadsheetId, usedRange);
					lastFallbackError = null;
					break;
				} catch (rangeError) {
					lastFallbackError = rangeError;
				}
			}
			if (!response && lastFallbackError) throw lastFallbackError;
		} catch (fallbackError) {
			if (fallbackError.statusCode) throw fallbackError;
			const availableSheets = await listSpreadsheetSheetTitles(
				sheets,
				spreadsheetId,
			).catch(() => []);
			const details = availableSheets.length
				? ` Abas encontradas: ${availableSheets.join(", ")}.`
				: "";
			const friendly = normalizeGoogleSheetsError(fallbackError, source);
			friendly.message = `${normalizedError.message}${details}`;
			throw friendly;
		}
	}
	const values = response.data.values || [];
	const headerRow = Math.max(1, Number(source.headerRow || 1));
	const headers = values[headerRow - 1] || [];
	const rows = values
		.slice(headerRow)
		.filter((row) => row.some((cell) => cleanText(cell)));
	return {
		ok: true,
		spreadsheetId,
		range: response.data.range,
		headers,
		rows,
		clientCount: source.id === "serasa" ? extractSerasaClientCount(values) : 0,
		totalRows: rows.length,
		totalColumns: values.reduce((max, row) => Math.max(max, row.length), 0),
		sample: rows.slice(0, 3),
	};
}

async function readTariffsSheetSource(source = {}) {
	const spreadsheetId = normalizeSpreadsheetId(
		source.spreadsheetUrl || source.spreadsheetId,
	);
	if (!spreadsheetId) {
		const error = new Error("Informe o ID ou link da Google Planilha.");
		error.statusCode = 400;
		throw error;
	}
	const sheets = await getSheetsClient();
	let titles;
	try {
		titles = await listSpreadsheetSheetTitles(sheets, spreadsheetId);
	} catch (error) {
		throw normalizeGoogleSheetsError(error, source);
	}
	const ranges = ["A:ZZ", "A:Z"];
	const parsedSheets = [];
	for (const title of titles) {
		let response = null;
		let lastError = null;
		for (const range of ranges) {
			try {
				response = await getSheetValues(
					sheets,
					spreadsheetId,
					buildSheetRange(source, { sheetName: title, range }),
				);
				break;
			} catch (error) {
				lastError = error;
			}
		}
		if (!response && lastError) throw normalizeGoogleSheetsError(lastError, source);
		parsedSheets.push({
			sheetName: title,
			rows: response?.data?.values || [],
		});
	}
	const totalRows = parsedSheets.reduce(
		(total, sheet) =>
			total + sheet.rows.filter((row) => row.some((cell) => cleanText(cell))).length,
		0,
	);
	const totalColumns = parsedSheets.reduce(
		(max, sheet) =>
			Math.max(
				max,
				sheet.rows.reduce((sheetMax, row) => Math.max(sheetMax, row.length), 0),
			),
		0,
	);
	return {
		ok: true,
		spreadsheetId,
		range: "Todas as abas · A:ZZ",
		headers: [],
		rows: [],
		sheets: parsedSheets,
		totalRows,
		totalColumns,
		totalSheets: parsedSheets.length,
		sample: parsedSheets
			.flatMap((sheet) =>
				sheet.rows
					.filter((row) => row.some((cell) => cleanText(cell)))
					.slice(0, 1)
					.map((row) => ({ sheetName: sheet.sheetName, row })),
			)
			.slice(0, 3),
	};
}

async function appendImportLog(data = {}) {
	return financeiroReportsRepository.appendImportLog({
		...data,
		createdAt: nowIso(),
	});
}

function normalizeSerasaHeader(value) {
	return cleanText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");
}

function parseSerasaCurrency(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	const text = cleanText(value);
	if (!text || text === "-") return 0;
	const negative = /^-/.test(text) || /\(-/.test(text);
	const clean = text.replace(/[R$\s()]/g, "").replace(/^-/, "");
	let normalized = clean;
	const hasComma = clean.includes(",");
	const hasDot = clean.includes(".");
	if (hasComma && hasDot) {
		const lastComma = clean.lastIndexOf(",");
		const lastDot = clean.lastIndexOf(".");
		normalized =
			lastComma > lastDot
				? clean.replace(/\./g, "").replace(",", ".")
				: clean.replace(/,/g, "");
	} else if (hasComma) {
		normalized = clean.replace(/\./g, "").replace(",", ".");
	}
	const number = Number(normalized || 0);
	if (!Number.isFinite(number)) return 0;
	return negative ? -Math.abs(number) : number;
}

function normalizeSerasaDate(value) {
	const dateInfo = normalizeBudgetDate(value);
	return {
		date: dateInfo.data || cleanText(value),
		year: dateInfo.ano || "",
		month: dateInfo.numMes || "",
		monthName: dateInfo.mes || "",
	};
}

function rowArrayToObject(headers = [], row = []) {
	return headers.reduce((acc, header, index) => {
		const key = normalizeSerasaHeader(header);
		if (key) acc[key] = row[index] ?? "";
		return acc;
	}, {});
}

function normalizeSerasaOperationLabel(value, fallback = "Movimentação") {
	const text = cleanText(value || fallback);
	if (!text) return fallback;
	const normalized = text
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
	if (normalized === "entrada" || normalized === "credito") return "Entrada";
	if (normalized === "saida" || normalized === "debito") return "Saída";
	if (normalized === "estorno") return "Estorno";
	if (normalized === "receita liquida") return "Receita líquida";
	return text;
}

function normalizeSerasaRows(rows = [], headers = []) {
	const isNetRevenueOperation = (operation) =>
		cleanText(operation) === "-" ||
		/receita\s*l[ií]quida/i.test(cleanText(operation));
	const isClientMarker = (row = {}) =>
		/\b(clientes?|usuarios?|usuarias?|base\s+serasa|qtd\s+clientes?)\b/i.test(
			cleanText(`${row.tipo || ""} ${row.descricao || ""} ${row.operacao || ""}`)
				.normalize("NFD")
				.replace(/[\u0300-\u036f]/g, ""),
		);
	const normalizedRows = rows
		.map((row) => {
			if (Array.isArray(row)) return rowArrayToObject(headers, row);
			return Object.entries(row || {}).reduce((acc, [key, value]) => {
				acc[normalizeSerasaHeader(key)] = value;
				return acc;
			}, {});
		})
		.map((row) => {
			const dateValue = row.data || row.coluna1 || row.coluna01;
			const date = normalizeSerasaDate(dateValue);
			const value = parseSerasaCurrency(row.valor);
			const operation = cleanText(row.operacao);
			const type = cleanText(row.tipo);
			const isNetRevenue = isNetRevenueOperation(operation);
			const direction =
				isNetRevenue
					? "receita_liquida"
					: 
				/entrada|credito|cr[eé]dito/i.test(`${operation} ${type}`) || value > 0
					? "entrada"
					: /saida|sa[ií]da|debito|d[eé]bito/i.test(`${operation} ${type}`) ||
						  value < 0
						? "saida"
						: "neutro";
			return {
				id: crypto
					.createHash("sha1")
					.update(
						[
							date.date,
							row.tipo,
							row.descricao,
							row.operacao,
							row.valor,
						].join("|"),
					)
					.digest("hex")
					.slice(0, 16),
				date: date.date,
				year: date.year,
				month: date.month,
				monthName: date.monthName,
				type,
				description: cleanText(row.descricao),
				operation: isNetRevenue
					? "Receita líquida"
					: normalizeSerasaOperationLabel(operation, type || "Movimentação"),
				value,
				direction,
				isNetRevenue,
				isClientMarker: isClientMarker(row),
			};
		})
		.filter((row) => !row.isClientMarker && (row.date || row.type || row.description || row.value));
	const uniqueRows = [...new Map(normalizedRows.map((row) => [row.id, row])).values()];

	const summaryByDate = new Map();
	const summaryByMonth = new Map();
	for (const row of uniqueRows) {
		const key = row.date || "Sem data";
		const current = summaryByDate.get(key) || {
			date: key,
			entradas: 0,
			saidas: 0,
			saldo: 0,
			total: 0,
		};
		if (row.isNetRevenue) current.receitaLiquida = (current.receitaLiquida || 0) + Math.abs(row.value);
		else if (row.value > 0) current.entradas += row.value;
		else if (row.value < 0) current.saidas += Math.abs(row.value);
		current.saldo += row.value;
		current.total += 1;
		summaryByDate.set(key, current);

		const monthKey = row.year && row.month ? `${row.year}-${String(row.month).padStart(2, "0")}` : "Sem mês";
		const monthly = summaryByMonth.get(monthKey) || {
			key: monthKey,
			year: row.year,
			month: row.month,
			label: row.year && row.month ? `${row.year} - ${row.monthName}` : "Sem mês",
			entradas: 0,
			saidas: 0,
			receitaLiquida: 0,
			saldo: 0,
			total: 0,
		};
		if (row.isNetRevenue) monthly.receitaLiquida += Math.abs(row.value);
		else if (row.value > 0) monthly.entradas += row.value;
		else if (row.value < 0) monthly.saidas += Math.abs(row.value);
		monthly.saldo += row.value;
		monthly.total += 1;
		summaryByMonth.set(monthKey, monthly);
	}

	const totalEntradas = uniqueRows
		.filter((row) => row.value > 0 && !row.isNetRevenue)
		.reduce((sum, row) => sum + row.value, 0);
	const totalSaidas = uniqueRows
		.filter((row) => row.value < 0 && !row.isNetRevenue)
		.reduce((sum, row) => sum + Math.abs(row.value), 0);
	const receitaLiquida = uniqueRows
		.filter((row) => row.isNetRevenue)
		.reduce((sum, row) => sum + Math.abs(row.value), 0);
	const positiveRows = uniqueRows.filter((row) => row.value > 0 && !row.isNetRevenue);

	return {
		rows: uniqueRows,
		summary: {
			totalRows: uniqueRows.length,
			duplicatesIgnored: Math.max(0, normalizedRows.length - uniqueRows.length),
			totalEntradas: currency(totalEntradas),
			totalSaidas: currency(totalSaidas),
			receitaLiquida: currency(receitaLiquida || totalEntradas - totalSaidas),
			comissao: currency(totalSaidas),
			ticketMedio: currency(positiveRows.length ? totalEntradas / positiveRows.length : 0),
		},
		daily: [...summaryByDate.values()].sort((a, b) =>
			String(a.date).localeCompare(String(b.date)),
		),
		monthly: [...summaryByMonth.values()].sort((a, b) =>
			String(a.key).localeCompare(String(b.key)),
		),
	};
}

function extractSerasaClientCount(values = []) {
	const directCell = values?.[4]?.[15];
	const directValue = Number(
		String(directCell ?? "")
			.replace(/[^\d.-]/g, "")
			.trim(),
	);
	if (Number.isFinite(directValue) && directValue > 0) return Math.trunc(directValue);
	for (const row of values) {
		const labelIndex = row.findIndex((cell) => /clientes/i.test(cleanText(cell)));
		if (labelIndex >= 0) {
			const candidate = Number(
				String(row[labelIndex + 1] ?? "")
					.replace(/[^\d.-]/g, "")
					.trim(),
			);
			if (Number.isFinite(candidate) && candidate > 0) return Math.trunc(candidate);
		}
	}
	return 0;
}

function resolveSerasaReference(rows = []) {
	const datedRows = rows
		.filter((row) => Number(row.year || 0) && Number(row.month || 0))
		.sort((a, b) => `${b.year}-${String(b.month).padStart(2, "0")}`.localeCompare(`${a.year}-${String(a.month).padStart(2, "0")}`));
	const latest = datedRows[0] || {};
	const now = new Date();
	const year = Number(latest.year || now.getFullYear());
	const month = Number(latest.month || now.getMonth() + 1);
	return {
		key: `${year}-${String(month).padStart(2, "0")}`,
		year,
		month,
		label: `${year} - ${monthName(month)}`,
	};
}

function mergeSerasaClientHistory(previous = [], reference = {}, clientCount = 0) {
	const count = Math.max(0, Math.trunc(Number(clientCount || 0)));
	if (!count) return Array.isArray(previous) ? previous : [];
	const currentHistory = Array.isArray(previous) ? previous : [];
	const next = currentHistory.filter((item) => item?.key !== reference.key);
	next.push({
		key: reference.key,
		year: reference.year,
		month: reference.month,
		label: reference.label,
		clientes: count,
		updatedAt: nowIso(),
	});
	return next.sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

async function saveSerasaData(payload = {}, user = {}) {
	const normalized = normalizeSerasaRows(payload.rows || [], payload.headers || []);
	const previousData = await financeiroReportsRepository
		.getSerasaReport()
		.catch(() => null);
	const reference = resolveSerasaReference(normalized.rows);
	const clientCount = Math.max(
		0,
		Math.trunc(Number(payload.clientCount || payload.clientes || 0)),
	);
	const clientesHistory = mergeSerasaClientHistory(
		previousData?.clientesHistory,
		reference,
		clientCount,
	);
	const now = nowIso();
	const data = {
		...normalized,
		clientes: clientCount || previousData?.clientes || 0,
		clientesHistory,
		importInfo: {
			fileName: cleanText(payload.fileName),
			sheetName: cleanText(payload.sheetName) || "MOVIMENTAÇÃO SERASA",
			importedAt: now,
			importedBy: user?.uid || user?.email || "",
			importedByName: user?.profile?.nome || user?.nome || user?.email || "",
		},
	};
	await financeiroReportsRepository.saveSerasaReport(data);
	return { ok: true, data };
}

async function getSerasaReport() {
	const data = await financeiroReportsRepository.getSerasaReport().catch(() => null);
	return {
		ok: true,
		data: data || {
			rows: [],
			daily: [],
			monthly: [],
			clientes: 0,
			clientesHistory: [],
			summary: {
				totalRows: 0,
				totalEntradas: 0,
				totalSaidas: 0,
				receitaLiquida: 0,
				comissao: 0,
				ticketMedio: 0,
			},
			importInfo: {},
		},
	};
}

async function clearSerasaReport(user = {}) {
	const data = {
		rows: [],
		daily: [],
		monthly: [],
		clientes: 0,
		clientesHistory: [],
		summary: {
			totalRows: 0,
			duplicatesIgnored: 0,
			totalEntradas: 0,
			totalSaidas: 0,
			receitaLiquida: 0,
			comissao: 0,
			ticketMedio: 0,
		},
		importInfo: {
			fileName: "",
			sheetName: "",
			importedAt: nowIso(),
			importedBy: user?.uid || user?.email || "",
			importedByName: user?.profile?.nome || user?.nome || user?.email || "",
			cleared: true,
		},
	};
	await financeiroReportsRepository.clearSerasaReport(data);
	return { ok: true, data };
}

const TARIFF_MONTHS = {
	janeiro: 1,
	jan: 1,
	january: 1,
	fevereiro: 2,
	fev: 2,
	february: 2,
	feb: 2,
	marco: 3,
	março: 3,
	mar: 3,
	march: 3,
	abril: 4,
	abr: 4,
	april: 4,
	apr: 4,
	maio: 5,
	may: 5,
	junho: 6,
	jun: 6,
	june: 6,
	julho: 7,
	jul: 7,
	july: 7,
	agosto: 8,
	ago: 8,
	august: 8,
	aug: 8,
	setembro: 9,
	set: 9,
	september: 9,
	sep: 9,
	october: 10,
	oct: 10,
	outubro: 10,
	out: 10,
	novembro: 11,
	nov: 11,
	november: 11,
	dezembro: 12,
	dez: 12,
	december: 12,
	dec: 12,
};

const BANK_COLORS = {
	ITAU: "#f97316",
	ITAÚ: "#f97316",
	CREDITAMA: "#16a34a",
	CREDIFOR: "#0ea5e9",
	"BANCO BRASIL": "#facc15",
	"BANCO DO BRASIL": "#facc15",
	"BANCO INTER": "#fb923c",
	INTER: "#fb923c",
	"CAIXA ECON.": "#2563eb",
	"CAIXA ECONOMICA": "#2563eb",
	CIELO: "#1d4ed8",
	INTERSETE: "#7c3aed",
	"BANCO ABC": "#475569",
	ABC: "#475569",
};

function parseTariffMonthYear(value) {
	const text = cleanText(value);
	if (!text) return null;
	const slash = text.match(/^(\d{1,2})\/(\d{4})$/);
	if (slash) {
		const month = Number(slash[1]);
		const year = Number(slash[2]);
		if (month >= 1 && month <= 12) {
			return { year, month, label: `${year} - ${monthName(month)}` };
		}
	}
	const words = text
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.match(/([a-zç]+)\s+(\d{4})/i);
	if (!words) return null;
	const month = TARIFF_MONTHS[words[1]] || TARIFF_MONTHS[words[1].slice(0, 3)];
	const year = Number(words[2]);
	if (!month || !year) return null;
	return { year, month, label: `${year} - ${monthName(month)}` };
}

function tariffKey(parts = []) {
	return crypto.createHash("sha1").update(parts.map(cleanText).join("|")).digest("hex").slice(0, 16);
}

function normalizeBankName(value) {
	return cleanText(value).replace(/\s+/g, " ");
}

function parseTariffCount(value) {
	if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : 0;
	const text = cleanText(value);
	if (!text || text === "-") return 0;
	const normalized = text.replace(/[^\d-]/g, "");
	const number = Number(normalized || 0);
	return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function bankVisual(value) {
	const name = normalizeBankName(value);
	const upper = name.toUpperCase();
	const initials = name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase() || "BC";
	return {
		bankKey: slug(name, "banco"),
		bankInitials: initials,
		bankColor: BANK_COLORS[upper] || "#0f766e",
	};
}

function normalizeTariffRows(rows = []) {
	return rows.map((row) =>
		Array.isArray(row)
			? row.map((cell) => cleanText(cell))
			: Object.values(row || {}).map((cell) => cleanText(cell)),
	);
}

function parseDailyRevenueSheet(sheetName, rows, blocks) {
	const records = [];
	rows[0]?.forEach((cell, col) => {
		const monthInfo = parseTariffMonthYear(cell);
		if (!monthInfo) return;
		blocks.push({ sheetName, type: "receita_diaria", label: monthInfo.label, row: 1, column: col + 1 });
		for (let rowIndex = 2; rowIndex < rows.length; rowIndex += 1) {
			const dateInfo = normalizeBudgetDate(rows[rowIndex]?.[col]);
			const value = parseSerasaCurrency(rows[rowIndex]?.[col + 1]);
			if (!dateInfo.data || !value) continue;
			records.push({
				id: tariffKey(["receita_diaria", sheetName, dateInfo.data, value]),
				sheetName,
				date: dateInfo.data,
				year: dateInfo.ano || monthInfo.year,
				month: dateInfo.numMes || monthInfo.month,
				monthName: dateInfo.mes || monthName(monthInfo.month),
				value: currency(value),
			});
		}
	});
	return records;
}

function parseMonthlyTariffsSheet(sheetName, rows, blocks) {
	const records = [];
	for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
		for (let col = 0; col < (rows[rowIndex]?.length || 0); col += 1) {
			const monthInfo = parseTariffMonthYear(rows[rowIndex][col]);
			const headerBank = cleanText(rows[rowIndex + 1]?.[col]).replace(/:$/, "");
			const headerValue = cleanText(rows[rowIndex + 1]?.[col + 1]).replace(/:$/, "");
			if (!monthInfo || !/^banco$/i.test(headerBank) || !/^valor$/i.test(headerValue)) continue;
			blocks.push({ sheetName, type: "tarifas_mensais", label: monthInfo.label, row: rowIndex + 1, column: col + 1 });
			for (let currentRow = rowIndex + 2; currentRow < rows.length; currentRow += 1) {
				const bank = normalizeBankName(rows[currentRow]?.[col]);
				const value = parseSerasaCurrency(rows[currentRow]?.[col + 1]);
				if (!bank) break;
				if (/^total$/i.test(bank)) break;
				records.push({
					id: tariffKey(["tarifa_mensal", sheetName, monthInfo.year, monthInfo.month, bank]),
					sheetName,
					year: monthInfo.year,
					month: monthInfo.month,
					monthName: monthName(monthInfo.month),
					label: monthInfo.label,
					bank,
					value: currency(value),
					...bankVisual(bank),
				});
			}
		}
	}
	return records;
}

function parseBillingClientsSheet(sheetName, rows, blocks) {
	const cobrancas = [];
	const tarifas = [];
	const headerRow = rows.findIndex((row) => /cobran/i.test(cleanText(row[0])) && /quant/i.test(cleanText(row[1])));
	if (headerRow >= 0) {
		blocks.push({ sheetName, type: "clientes_forma_cobranca", label: "Clientes por forma de cobrança", row: headerRow + 1, column: 1 });
		for (let rowIndex = headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
			const method = cleanText(rows[rowIndex]?.[0]);
			if (!method || /^total$/i.test(method)) break;
			cobrancas.push({
				id: tariffKey(["forma_cobranca", method]),
				method,
				customers: parseTariffCount(rows[rowIndex]?.[1]),
				estimatedValue: currency(parseSerasaCurrency(rows[rowIndex]?.[2])),
				percent: parseSerasaCurrency(rows[rowIndex]?.[3]),
				...bankVisual(method),
			});
		}
	}
	const tariffHeaderRow = rows.findIndex((row) => /tarifas de boletos/i.test(cleanText(row[0])));
	if (tariffHeaderRow >= 0) {
		blocks.push({ sheetName, type: "tarifas_boletos", label: "Tarifas de boletos por banco", row: tariffHeaderRow + 1, column: 1 });
		for (let rowIndex = tariffHeaderRow + 2; rowIndex < rows.length; rowIndex += 1) {
			const bank = normalizeBankName(rows[rowIndex]?.[0]);
			const value = parseSerasaCurrency(rows[rowIndex]?.[1]);
			const valueLabel = cleanText(rows[rowIndex]?.[1]);
			const paymentTypes = cleanText(rows[rowIndex]?.[2]);
			if (!bank) continue;
			if (/^observa/i.test(bank)) break;
			tarifas.push({
				id: tariffKey(["tarifa_boleto", bank, value, paymentTypes]),
				bank,
				value: currency(value),
				valueLabel,
				paymentTypes,
				...bankVisual(bank),
			});
		}
	}
	return { cobrancas, tarifas };
}

function parsePaymentFormsSheet(sheetName, rows, blocks) {
	const quantities = [];
	const values = [];
	const collectionValues = [];
	for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
		for (let col = 0; col < (rows[rowIndex]?.length || 0); col += 4) {
			const monthInfo = parseTariffMonthYear(rows[rowIndex]?.[col]);
			if (!monthInfo) continue;
			const quantityHeader = rows[rowIndex + 2] || [];
			if (/forma de pagamento/i.test(cleanText(quantityHeader[col]))) {
				blocks.push({ sheetName, type: "formas_pagamento_quantidade", label: monthInfo.label, row: rowIndex + 3, column: col + 1 });
				for (let currentRow = rowIndex + 3; currentRow < rows.length; currentRow += 1) {
					const method = cleanText(rows[currentRow]?.[col]);
					if (!method || /^total/i.test(method)) break;
					quantities.push({
						id: tariffKey(["pagamento_qtd", monthInfo.year, monthInfo.month, method]),
						year: monthInfo.year,
						month: monthInfo.month,
						monthName: monthName(monthInfo.month),
						method,
						quantity: parseTariffCount(rows[currentRow]?.[col + 1]),
						percent: parseSerasaCurrency(rows[currentRow]?.[col + 2]),
					});
				}
			}
			const valueHeader = rows[rowIndex + 10] || [];
			if (/forma de cobran/i.test(cleanText(valueHeader[col]))) {
				blocks.push({ sheetName, type: "formas_pagamento_valor", label: monthInfo.label, row: rowIndex + 11, column: col + 1 });
				for (let currentRow = rowIndex + 11; currentRow < rows.length; currentRow += 1) {
					const method = cleanText(rows[currentRow]?.[col]);
					if (!method || /^total$/i.test(method)) break;
					values.push({
						id: tariffKey(["pagamento_valor", monthInfo.year, monthInfo.month, method]),
						year: monthInfo.year,
						month: monthInfo.month,
						monthName: monthName(monthInfo.month),
						method,
						value: currency(parseSerasaCurrency(rows[currentRow]?.[col + 1])),
						percent: parseSerasaCurrency(rows[currentRow]?.[col + 2]),
						...bankVisual(method),
					});
				}
			}
			const collectionHeader = rows[rowIndex + 17] || [];
			if (/forma de cobran/i.test(cleanText(collectionHeader[col]))) {
				blocks.push({ sheetName, type: "formas_cobranca_valor", label: monthInfo.label, row: rowIndex + 18, column: col + 1 });
				for (let currentRow = rowIndex + 18; currentRow < rows.length; currentRow += 1) {
					const method = cleanText(rows[currentRow]?.[col]);
					if (!method || /^total$/i.test(method)) break;
					collectionValues.push({
						id: tariffKey(["cobranca_valor", monthInfo.year, monthInfo.month, method]),
						year: monthInfo.year,
						month: monthInfo.month,
						monthName: monthName(monthInfo.month),
						method,
						value: currency(parseSerasaCurrency(rows[currentRow]?.[col + 1])),
						percent: parseSerasaCurrency(rows[currentRow]?.[col + 2]),
						...bankVisual(method),
					});
				}
			}
		}
	}
	return { quantities, values, collectionValues };
}

function parseInvoicesSheet(sheetName, rows, blocks) {
	const records = [];
	let currentYear = "";
	const invoiceMetric = (value) => {
		const metric = cleanText(value);
		if (/cancelad|outros lan/i.test(metric)) return "Canceladas";
		if (/ativa|faturamento/i.test(metric)) return "Ativas";
		return "";
	};
	for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
		const title = cleanText(rows[rowIndex]?.[0]);
		const yearMatch = title.match(/(\d{4})/);
		if (/faturas por data/i.test(title) && yearMatch) currentYear = Number(yearMatch[1]);
		for (let col = 0; col < (rows[rowIndex]?.length || 0); col += 3) {
			const monthInfo = parseTariffMonthYear(rows[rowIndex]?.[col]);
			if (!monthInfo && !currentYear) continue;
			const monthOnly = cleanText(rows[rowIndex]?.[col])
				.normalize("NFD")
				.replace(/[\u0300-\u036f]/g, "")
				.toLowerCase();
			const month = monthInfo?.month || TARIFF_MONTHS[monthOnly];
			const year = monthInfo?.year || currentYear;
			if (!month || !year) continue;
			blocks.push({ sheetName, type: "faturas", label: `${year} - ${monthName(month)}`, row: rowIndex + 1, column: col + 1 });
			for (let currentRow = rowIndex + 1; currentRow < Math.min(rows.length, rowIndex + 5); currentRow += 1) {
				const metric = invoiceMetric(rows[currentRow]?.[col]);
				const value = parseTariffCount(rows[currentRow]?.[col + 1]);
				if (!metric || !value) continue;
				records.push({
					id: tariffKey(["fatura", year, month, metric]),
					year,
					month,
					monthName: monthName(month),
					metric,
					value,
				});
			}
		}
	}
	return records;
}

function isRelevantTariffInvoiceRecord(item = {}) {
	const metric = cleanText(item.metric);
	if (!/cancelad|outros lan|ativa|faturamento/i.test(metric)) return false;
	const year = Number(item.year || 0);
	const month = Number(item.month || 0);
	if (!year || !month) return false;
	const now = new Date();
	const currentYear = now.getFullYear();
	const currentMonth = now.getMonth() + 1;
	return !(year === currentYear && month > currentMonth);
}

function parseRevenueByClientSheet(sheetName, rows, blocks) {
	const headerIndex = rows.findIndex((row) =>
		/c[oó]digo cliente/i.test(cleanText(row[0])) &&
		row.some((cell) => /total geral/i.test(cleanText(cell))),
	);
	if (headerIndex < 0) return [];
	const year = Number(sheetName.match(/20\d{2}/)?.[0] || 0);
	const headers = rows[headerIndex];
	const totalIndex = headers.findIndex((cell) => /total geral/i.test(cleanText(cell)));
	const nameIndex = headers.findIndex((cell) => /nome|raz[aã]o/i.test(cleanText(cell)));
	const monthColumns = headers
		.map((header, index) => ({ index, month: TARIFF_MONTHS[cleanText(header).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()] }))
		.filter((item) => item.month);
	blocks.push({ sheetName, type: "receita_por_cliente", label: `Receita por cliente ${year || ""}`.trim(), row: headerIndex + 1, column: 1 });
	const records = [];
	for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
		const code = cleanText(rows[rowIndex]?.[0]);
		if (!code || /^total geral$/i.test(code)) continue;
		const clientName = cleanText(rows[rowIndex]?.[nameIndex]);
		const total = currency(parseSerasaCurrency(rows[rowIndex]?.[totalIndex]));
		monthColumns.forEach(({ index, month }) => {
			const value = currency(parseSerasaCurrency(rows[rowIndex]?.[index]));
			if (!value) return;
			records.push({
				id: tariffKey(["receita_cliente", sheetName, code, month, value]),
				year,
				month,
				monthName: monthName(month),
				clientCode: code,
				clientName,
				value,
				total,
			});
		});
	}
	return records;
}

function summarizeTariffs(data) {
	const sum = (items, field = "value") =>
		currency((items || []).reduce((total, item) => total + Number(item[field] || 0), 0));
	const invoiceNetTotal = (data.faturas || []).filter(isRelevantTariffInvoiceRecord).reduce((total, item) => {
		const metric = cleanText(item.metric);
		if (/cancelad|outros lan/i.test(metric)) return total - Number(item.value || 0);
		if (/ativa|faturamento/i.test(metric)) return total + Number(item.value || 0);
		return total;
	}, 0);
	const latestByMonth = [...(data.tarifasMensais || [])]
		.sort((a, b) => `${b.year}-${String(b.month).padStart(2, "0")}`.localeCompare(`${a.year}-${String(a.month).padStart(2, "0")}`))[0];
	const currentKey = latestByMonth ? `${latestByMonth.year}-${String(latestByMonth.month).padStart(2, "0")}` : "";
	const tarifasMesAtual = sum(
		(data.tarifasMensais || []).filter((item) => `${item.year}-${String(item.month).padStart(2, "0")}` === currentKey),
	);
	const totalClientesCobranca = sum(data.formasCobrancaClientes || [], "customers");
	return {
		receitaTotal: sum(data.receitasDiarias),
		tarifasTotal: sum(data.tarifasMensais),
		tarifasMesAtual,
		receitaPorClienteTotal: sum(data.receitaPorCliente),
		totalClientesCobranca,
		faturasTotal: currency(invoiceNetTotal),
		blocosDetectados: data.blocosDetectados.length,
		blocosNaoMapeados: data.blocosNaoMapeados.length,
	};
}

function parseTariffsWorkbook(payload = {}) {
	const sheets = Array.isArray(payload.sheets) ? payload.sheets : [];
	const data = {
		receitasDiarias: [],
		tarifasMensais: [],
		formasCobrancaClientes: [],
		tarifasBoletos: [],
		formasPagamentoQuantidade: [],
		formasPagamentoValor: [],
		formasCobrancaValor: [],
		faturas: [],
		receitaPorCliente: [],
		blocosDetectados: [],
		blocosNaoMapeados: [],
	};
	for (const sheet of sheets) {
		const sheetName = cleanText(sheet.sheetName || sheet.name);
		const rows = normalizeTariffRows(sheet.rows || sheet.values || []);
		const before = data.blocosDetectados.length;
		if (/receita di[áa]rias hubsoft/i.test(sheetName)) {
			data.receitasDiarias.push(...parseDailyRevenueSheet(sheetName, rows, data.blocosDetectados));
		} else if (/clientes.*forma cobran/i.test(sheetName)) {
			const parsed = parseBillingClientsSheet(sheetName, rows, data.blocosDetectados);
			data.formasCobrancaClientes.push(...parsed.cobrancas);
			data.tarifasBoletos.push(...parsed.tarifas);
		} else if (/tarifas mensais/i.test(sheetName)) {
			data.tarifasMensais.push(...parseMonthlyTariffsSheet(sheetName, rows, data.blocosDetectados));
		} else if (/formas de pagamento/i.test(sheetName)) {
			const parsed = parsePaymentFormsSheet(sheetName, rows, data.blocosDetectados);
			data.formasPagamentoQuantidade.push(...parsed.quantities);
			data.formasPagamentoValor.push(...parsed.values);
			data.formasCobrancaValor.push(...parsed.collectionValues);
		} else if (/faturas/i.test(sheetName)) {
			data.faturas.push(
				...parseInvoicesSheet(sheetName, rows, data.blocosDetectados).filter(
					isRelevantTariffInvoiceRecord,
				),
			);
		} else if (/rec\.\s*por cliente|receita.*cliente/i.test(sheetName)) {
			data.receitaPorCliente.push(...parseRevenueByClientSheet(sheetName, rows, data.blocosDetectados));
		}
		if (data.blocosDetectados.length === before) {
			data.blocosNaoMapeados.push({
				sheetName,
				reason: "Nenhum bloco conhecido identificado.",
				sample: rows.filter((row) => row.some(Boolean)).slice(0, 5),
			});
		}
	}
	for (const key of Object.keys(data)) {
		if (!Array.isArray(data[key]) || key.startsWith("blocos")) continue;
		data[key] = [...new Map(data[key].map((item) => [item.id, item])).values()];
	}
	return { ...data, summary: summarizeTariffs(data) };
}

async function saveTariffsReport(payload = {}, user = {}) {
	const parsed = parseTariffsWorkbook(payload);
	const data = {
		...parsed,
		importInfo: {
			fileName: cleanText(payload.fileName),
			importedAt: nowIso(),
			importedBy: user?.uid || user?.email || "",
			importedByName: user?.profile?.nome || user?.nome || user?.email || "",
			totalSheets: Array.isArray(payload.sheets) ? payload.sheets.length : 0,
		},
	};
	await financeiroReportsRepository.saveTariffsReport(data);
	return { ok: true, data };
}

async function getTariffsReport() {
	const savedData = await financeiroReportsRepository
		.getTariffsReport()
		.catch(() => null);
	const data = savedData
		? {
				...savedData,
				faturas: (savedData.faturas || []).filter(isRelevantTariffInvoiceRecord),
			}
		: null;
	if (data) data.summary = summarizeTariffs(data);
	return {
		ok: true,
		data: data || {
			receitasDiarias: [],
			tarifasMensais: [],
			formasCobrancaClientes: [],
			tarifasBoletos: [],
			formasPagamentoQuantidade: [],
			formasPagamentoValor: [],
			formasCobrancaValor: [],
			faturas: [],
			receitaPorCliente: [],
			blocosDetectados: [],
			blocosNaoMapeados: [],
			summary: summarizeTariffs({
				receitasDiarias: [],
				tarifasMensais: [],
				formasCobrancaClientes: [],
				faturas: [],
				receitaPorCliente: [],
				blocosDetectados: [],
				blocosNaoMapeados: [],
			}),
			importInfo: {},
		},
	};
}

async function clearTariffsReport(user = {}) {
	const data = {
		receitasDiarias: [],
		tarifasMensais: [],
		formasCobrancaClientes: [],
		tarifasBoletos: [],
		formasPagamentoQuantidade: [],
		formasPagamentoValor: [],
		formasCobrancaValor: [],
		faturas: [],
		receitaPorCliente: [],
		blocosDetectados: [],
		blocosNaoMapeados: [],
		summary: summarizeTariffs({
			receitasDiarias: [],
			tarifasMensais: [],
			formasCobrancaClientes: [],
			faturas: [],
			receitaPorCliente: [],
			blocosDetectados: [],
			blocosNaoMapeados: [],
		}),
		importInfo: {
			fileName: "",
			importedAt: nowIso(),
			importedBy: user?.uid || user?.email || "",
			importedByName: user?.profile?.nome || user?.nome || user?.email || "",
			cleared: true,
		},
	};
	await financeiroReportsRepository.clearTariffsReport(data);
	return { ok: true, data };
}

async function listImportLogs(limit = 20) {
	const result = await financeiroReportsRepository.listImportLogs(limit);
	return {
		ok: true,
		items: result
			.map((item) => ({ id: item.documentId, ...(item.data || {}) }))
			.sort((a, b) =>
				String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
			),
	};
}

async function testSheetSource(sourceId) {
	const config = await getSheetsConfig();
	const source = config.sources.find((item) => item.id === sourceId);
	if (!source) {
		const error = new Error("Origem financeira não encontrada.");
		error.statusCode = 404;
		throw error;
	}
	const result =
		source.id === "tarifas"
			? await readTariffsSheetSource(source)
			: await readSheetSource(source);
	return { ok: true, sourceId, result };
}

function resolveNextRunAt(config = {}) {
	if (!config.enabled || !config.lastRunAt) return "";
	const date = new Date(config.lastRunAt);
	if (Number.isNaN(date.getTime())) return "";
	date.setMinutes(date.getMinutes() + Number(config.intervalMinutes || 30));
	return date.toISOString();
}

async function runSheetsImport(user = {}, options = {}) {
	const startedAt = nowIso();
	const config = await getSheetsConfig();
	const requestedSourceId = cleanText(options.sourceId);
	const enabledSources = requestedSourceId
		? config.sources.filter((source) => source.id === requestedSourceId)
		: config.sources.filter((source) => source.enabled);
	const results = [];
	let status = "ok";
	let message = "Leitura concluída.";

	if (requestedSourceId && !enabledSources.length) {
		const error = new Error("Origem financeira não encontrada.");
		error.statusCode = 404;
		throw error;
	}

	for (const source of enabledSources) {
		try {
			const result =
				source.id === "tarifas"
					? await readTariffsSheetSource(source)
					: await readSheetSource(source);
			let importedRows = null;
			if (source.id === "serasa") {
				const saved = await saveSerasaData(
					{
						fileName: source.label,
						sheetName: source.sheetName,
						headers: result.headers,
						rows: result.rows,
						clientCount: result.clientCount,
					},
					user,
				);
				importedRows = saved.data?.summary?.totalRows || 0;
			} else if (source.id === "tarifas") {
				const saved = await saveTariffsReport(
					{
						fileName: source.label,
						sheets: result.sheets,
					},
					user,
				);
				importedRows = saved.data?.summary?.blocosDetectados || 0;
			}
			results.push({
				sourceId: source.id,
				label: source.label,
				status: "ok",
				importedRows,
				...result,
			});
		} catch (error) {
			status = "erro";
			results.push({
				sourceId: source.id,
				label: source.label,
				status: "erro",
				message: error?.message || "Falha na leitura.",
			});
		}
	}

	if (!enabledSources.length) {
		status = "sem_origem";
		message = "Nenhuma planilha financeira está ativa para leitura.";
	} else if (status === "erro") {
		message = requestedSourceId
			? results.find((item) => item.status === "erro")?.message ||
				"A planilha selecionada falhou na leitura."
			: "Uma ou mais planilhas falharam na leitura.";
	}

	const sources = config.sources.map((source) => {
		const result = results.find((item) => item.sourceId === source.id);
		if (!result) return source;
		return {
			...source,
			lastReadAt: startedAt,
			lastStatus: result.status,
			lastMessage:
				result.status === "ok"
					? `${result.totalRows} linha(s) lida(s).`
					: result.message,
			lastRows: result.totalRows || 0,
			lastColumns: result.totalColumns || 0,
		};
	});

	const nextConfig = mergeSheetsConfig({
		...config,
		sources,
		lastRunAt: startedAt,
		lastRunStatus: status,
		lastRunMessage: message,
		lastRunBy: user?.uid || user?.email || "worker",
		lastRunByName:
			user?.profile?.nome || user?.nome || user?.email || "Rotina automática",
	});
	nextConfig.nextRunAt = resolveNextRunAt(nextConfig);
	await saveSheetsConfig(nextConfig, user);
	await appendImportLog({
		status,
		message,
		startedAt,
		manual: Boolean(options.manual),
		results,
	});

	return {
		ok: status !== "erro",
		status,
		message,
		results,
		config: nextConfig,
	};
}

async function runSheetsImportIfDue() {
	if (workerRunning) return null;
	const config = await getSheetsConfig();
	if (!config.enabled) return null;
	const nextRunAt = resolveNextRunAt(config);
	if (nextRunAt && new Date(nextRunAt).getTime() > Date.now()) return null;
	workerRunning = true;
	try {
		return await runSheetsImport({ uid: "financeiro-worker", email: "worker" });
	} finally {
		workerRunning = false;
	}
}

function startWorker() {
	if (workerTimer) return;
	workerTimer = setInterval(() => {
		runSheetsImportIfDue().catch((error) => {
			console.error(
				"[financeiro] falha no worker de planilhas:",
				error?.message || error,
			);
		});
	}, 60 * 1000);
	workerTimer.unref?.();
}

function stopWorker() {
	if (!workerTimer) return;
	clearInterval(workerTimer);
	workerTimer = null;
}

async function getDashboard() {
	const doc = await documents.getDocument(DASHBOARD_PATH);
	return { ok: true, data: doc?.data || emptyDashboard() };
}

function normalizeCostCenterType(value) {
	const normalized = String(value || "")
		.toLowerCase()
		.trim();
	if (["capex", "opex", "misto"].includes(normalized)) return normalized;
	return "opex";
}

function normalizeCostCenter(center = {}, index = 0) {
	const rawCode = cleanText(center.codigo || center.reduzida || center.id);
	const codeWithoutDots = budgetCodeKey(rawCode);
	const rawId = String(
		center.id ||
			codeWithoutDots ||
			rawCode ||
			center.nome ||
			`centro-${index + 1}`,
	).trim();
	const id = budgetEntityIdFromCode(rawId, `centro-${index + 1}`);
	const clusters = Array.isArray(center.clusters)
		? center.clusters
		: String(center.clusters || center.cluster || "")
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean);
	const companies = Array.isArray(center.companies || center.empresas)
		? (center.companies || center.empresas).map(cleanText).filter(Boolean)
		: [];
	const branches = Array.isArray(center.branches || center.filiais)
		? (center.branches || center.filiais).map(cleanText).filter(Boolean)
		: [];
	const realizedByCompanyBranch = Array.isArray(
		center.realizedByCompanyBranch || center.realizadoPorEmpresaFilial,
	)
		? (center.realizedByCompanyBranch || center.realizadoPorEmpresaFilial)
				.map((item, itemIndex) => ({
					id: String(
						item.id || `realizado-${index + 1}-${itemIndex + 1}`,
					).trim(),
					companyId: String(item.companyId || item.empresaId || "").trim(),
					branchId: String(item.branchId || item.filialId || "").trim(),
					accountId: String(item.accountId || item.contaId || "").trim(),
					year: Number(item.year || item.ano || 0) || "",
					month: Number(item.month || item.mesNumero || item.numMes || 0) || "",
					budgeted: currency(item.budgeted ?? item.orcado ?? item.orcadoMes),
					orcado: currency(item.orcado ?? item.budgeted ?? item.orcadoMes),
					realized: currency(item.realized ?? item.realizado),
					realizado: currency(item.realizado ?? item.realized),
					saldo: currency(
						item.saldo ??
							currency(item.budgeted ?? item.orcado ?? item.orcadoMes) -
								currency(item.realized ?? item.realizado),
					),
					suppliers: Array.isArray(item.suppliers || item.fornecedores)
						? [
								...new Set(
									(item.suppliers || item.fornecedores)
										.map(cleanText)
										.filter(Boolean),
								),
							]
						: [],
					movements: Array.isArray(item.movements || item.movimentacoes)
						? (item.movements || item.movimentacoes)
								.map((movement, movementIndex) => ({
									id: String(
										movement.id ||
											`${item.id || `realizado-${index + 1}-${itemIndex + 1}`}-mov-${movementIndex + 1}`,
									).trim(),
									date: cleanText(movement.date || movement.data),
									supplier: cleanText(movement.supplier || movement.fornecedor),
									accountId: cleanText(movement.accountId || movement.contaId),
									accountName: cleanText(
										movement.accountName ||
											movement.contaNome ||
											movement.nomeConta,
									),
									companyId: cleanText(
										movement.companyId || movement.empresaId,
									),
									branchId: cleanText(movement.branchId || movement.filialId),
									document: cleanText(
										movement.document || movement.titulo || movement.seqMov,
									),
									type: cleanText(movement.type || movement.tipo),
									notes: cleanText(movement.notes || movement.observacoes),
									value: currency(
										movement.value ??
											movement.valor ??
											movement.realized ??
											movement.realizado,
									),
									budgeted: currency(movement.budgeted ?? movement.orcado),
								}))
								.filter(
									(movement) =>
										movement.value || movement.supplier || movement.date,
								)
						: [],
					rows: Number(item.rows || item.linhas || 0) || 0,
					updatedAt: item.updatedAt || item.atualizadoEm || nowIso(),
				}))
				.filter((item) => item.companyId || item.branchId || item.realized)
		: [];
	const rawMonthlyBudget = Object.hasOwn(center, "valorMensal")
		? center.valorMensal
		: center.orcamentoMensal;
	const rawAnnualBudget = Object.hasOwn(center, "valorAnual")
		? center.valorAnual
		: center.orcamentoAnual;
	const tipoPlano = ["S", "A"].includes(
		String(
			center.tipoPlano || center.tipoSinteticoAnalitico || "",
		).toUpperCase(),
	)
		? String(center.tipoPlano || center.tipoSinteticoAnalitico).toUpperCase()
		: "";
	const centerIsSynthetic = tipoPlano === "S";
	const monthlyBudget = centerIsSynthetic
		? 0
		: currency(
				rawMonthlyBudget ||
					(rawAnnualBudget ? currency(rawAnnualBudget) / 12 : 0),
			);
	const annualBudget = currency(monthlyBudget * 12);

	return {
		id,
		codigo: codeWithoutDots || String(center.codigo || rawId || id).trim(),
		reduzida: String(
			center.reduzida || center.codigoOriginal || center.codigo || "",
		).trim(),
		classificacao: String(center.classificacao || "").trim(),
		nome: String(center.nome || center.name || "Centro de custo").trim(),
		parentId: budgetEntityIdFromCode(
			center.parentId || center.parentCodigo || center.parent || "",
			"",
		),
		parentCodigo: budgetCodeKey(
			center.parentCodigo || center.parentId || center.parent || "",
		),
		tipoPlano,
		nivel: Number(center.nivel || 0) || "",
		categoriaCodigo: budgetCodeKey(
			center.categoriaCodigo || center.categoriaPrincipalCodigo || "",
		),
		tipoCentro: String(
			center.tipoCentro || center.tipo || "departamento",
		).trim(),
		clusters: [
			...new Set(clusters.map((item) => String(item).trim()).filter(Boolean)),
		],
		companies: [...new Set(companies)],
		branches: [...new Set(branches)],
		contasFinanceiras: Array.isArray(center.contasFinanceiras)
			? [
					...new Set(
						center.contasFinanceiras
							.map((item) => String(item).trim())
							.filter(Boolean),
					),
				]
			: [],
		contaFinanceiraPadrao: String(center.contaFinanceiraPadrao || "").trim(),
		responsavel: String(center.responsavel || "").trim(),
		telefoneResponsavel: String(
			center.telefoneResponsavel || center.telefone || "",
		).trim(),
		emailResponsavel: String(
			center.emailResponsavel || center.email || "",
		).trim(),
		tipoDespesa: normalizeCostCenterType(center.tipoDespesa || center.tipo),
		categoriaPrincipal: String(
			center.categoriaPrincipal || center.categoria || "",
		).trim(),
		diretoria: String(center.diretoria || "").trim(),
		contaContabil: String(center.contaContabil || center.glCode || "").trim(),
		valorMensal: monthlyBudget,
		valorAnual: annualBudget,
		orcamentoMensal: monthlyBudget,
		orcamentoAnual: annualBudget,
		comprometidoMes: centerIsSynthetic ? 0 : currency(center.comprometidoMes),
		realizadoMes: 0,
		orcadoImportado: centerIsSynthetic
			? 0
			: currency(center.orcadoImportado || center.totalOrcadoImportado),
		realizadoImportado: centerIsSynthetic
			? 0
			: currency(center.realizadoImportado || center.totalRealizadoImportado),
		saldoImportado: centerIsSynthetic ? 0 : currency(center.saldoImportado),
		linhasImportadas: centerIsSynthetic
			? 0
			: Number(center.linhasImportadas || 0) || 0,
		alertaPercentual: Math.min(
			Math.max(Number(center.alertaPercentual || 85), 1),
			100,
		),
		prioridade: String(center.prioridade || "normal").trim(),
		status: String(
			center.status ||
				(String(center.nome || "")
					.toLowerCase()
					.includes("inativo")
					? "inativo"
					: "ativo"),
		).trim(),
		finalidade: String(center.finalidade || "").trim(),
		observacoes: String(center.observacoes || "").trim(),
		realizedByCompanyBranch: centerIsSynthetic ? [] : realizedByCompanyBranch,
		realizadoPorEmpresaFilial: centerIsSynthetic ? [] : realizedByCompanyBranch,
		atualizadoEm: center.atualizadoEm || nowIso(),
	};
}

function normalizeFinancialAccount(account = {}, index = 0) {
	const rawId = String(
		account.id || account.codigo || account.nome || `conta-${index + 1}`,
	).trim();
	const id =
		rawId
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || `conta-${index + 1}`;
	return {
		id,
		codigo: String(account.codigo || rawId || id).trim(),
		reduzida: String(
			account.reduzida || account.reducedCode || account.codigo || rawId || id,
		).trim(),
		classificacao: String(
			account.classificacao || account.classification || "",
		).trim(),
		nome: String(account.nome || account.name || "Conta financeira").trim(),
		parentId: String(account.parentId || account.parent || "").trim(),
		parentCodigo: budgetCodeKey(
			account.parentCodigo ||
				account.parentCode ||
				account.parentId ||
				account.parent ||
				"",
		),
		tipoPlano: ["S", "A"].includes(
			String(account.tipoPlano || account.planType || "").toUpperCase(),
		)
			? String(account.tipoPlano || account.planType).toUpperCase()
			: "",
		nivel: Number(account.nivel || account.level || 0) || "",
		categoriaCodigo: budgetCodeKey(
			account.categoriaCodigo || account.categoryCode || "",
		),
		naturezaPlano: ["C", "D"].includes(
			String(
				account.naturezaPlano || account.accountNature || account.nature || "",
			).toUpperCase(),
		)
			? String(
					account.naturezaPlano || account.accountNature || account.nature,
				).toUpperCase()
			: "",
		rateio: ["S", "N"].includes(
			String(account.rateio || account.allocation || "").toUpperCase(),
		)
			? String(account.rateio || account.allocation).toUpperCase()
			: "",
		tipo: ["receita", "despesa"].includes(
			String(account.tipo || "").toLowerCase(),
		)
			? String(account.tipo).toLowerCase()
			: "despesa",
		natureza: normalizeCostCenterType(
			account.natureza || account.tipoDespesa || "opex",
		),
		grupo: String(account.grupo || account.categoria || "").trim(),
		dreGroup: String(account.dreGroup || account.grupoDre || "").trim(),
		contaContabil: String(account.contaContabil || account.glCode || "").trim(),
		status: String(
			account.status ||
				(String(account.nome || account.name || "")
					.toLowerCase()
					.includes("inativo")
					? "inativo"
					: "ativo"),
		).trim(),
		descricao: String(account.descricao || account.description || "").trim(),
		atualizadoEm: account.atualizadoEm || nowIso(),
	};
}

function normalizeBudgetPartner(partner = {}, index = 0) {
	const rawId = String(
		partner.id ||
			partner.codigo ||
			partner.cnpj ||
			partner.nome ||
			`parceiro-${index + 1}`,
	).trim();
	const id =
		rawId
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || `parceiro-${index + 1}`;
	return {
		id,
		codigo: String(partner.codigo || "").trim(),
		tipo: ["cliente", "fornecedor", "ambos"].includes(
			String(partner.tipo || "").toLowerCase(),
		)
			? String(partner.tipo).toLowerCase()
			: "fornecedor",
		cnpj: String(partner.cnpj || "").replace(/\D/g, ""),
		nome: String(
			partner.nome || partner.razaoSocial || "Fornecedor/Cliente",
		).trim(),
		nomeFantasia: String(partner.nomeFantasia || "").trim(),
		contaPadraoId: String(
			partner.contaPadraoId || partner.contaFinanceiraPadrao || "",
		).trim(),
		centroCustoPadraoId: String(
			partner.centroCustoPadraoId || partner.centroPadraoId || "",
		).trim(),
		contasFinanceiras: Array.isArray(partner.contasFinanceiras)
			? [...new Set(partner.contasFinanceiras.map(cleanText).filter(Boolean))]
			: [],
		centrosCusto: Array.isArray(partner.centrosCusto)
			? [...new Set(partner.centrosCusto.map(cleanText).filter(Boolean))]
			: [],
		empresas: Array.isArray(partner.empresas)
			? [...new Set(partner.empresas.map(cleanText).filter(Boolean))]
			: [],
		filiais: Array.isArray(partner.filiais)
			? [...new Set(partner.filiais.map(cleanText).filter(Boolean))]
			: [],
		totalOrcado: currency(partner.totalOrcado),
		totalRealizado: currency(partner.totalRealizado),
		saldo: currency(partner.saldo),
		linhasImportadas: Number(partner.linhasImportadas || 0) || 0,
		ultimaMovimentacao: String(partner.ultimaMovimentacao || "").trim(),
		movements: Array.isArray(partner.movements || partner.movimentacoes)
			? (partner.movements || partner.movimentacoes)
					.map((movement = {}, movementIndex) => ({
						id: cleanText(
							movement.id || `mov-fornecedor-${index + 1}-${movementIndex + 1}`,
						),
						date: cleanText(movement.date || movement.data),
						centerId: cleanText(movement.centerId || movement.centroCustoId),
						centerName: cleanText(
							movement.centerName || movement.centroCustoNome,
						),
						accountId: cleanText(movement.accountId || movement.contaId),
						accountName: cleanText(movement.accountName || movement.contaNome),
						companyId: cleanText(movement.companyId || movement.empresaId),
						branchId: cleanText(movement.branchId || movement.filialId),
						document: cleanText(
							movement.document || movement.titulo || movement.seqMov,
						),
						type: cleanText(movement.type || movement.tipo),
						notes: cleanText(movement.notes || movement.observacoes),
						value: currency(
							movement.value ??
								movement.valor ??
								movement.realized ??
								movement.realizado,
						),
						budgeted: currency(movement.budgeted ?? movement.orcado),
					}))
					.filter(
						(movement) => movement.value || movement.date || movement.centerId,
					)
			: [],
		movimentacoes: Array.isArray(partner.movements || partner.movimentacoes)
			? (partner.movements || partner.movimentacoes)
					.map((movement = {}, movementIndex) => ({
						id: cleanText(
							movement.id || `mov-fornecedor-${index + 1}-${movementIndex + 1}`,
						),
						date: cleanText(movement.date || movement.data),
						centerId: cleanText(movement.centerId || movement.centroCustoId),
						centerName: cleanText(
							movement.centerName || movement.centroCustoNome,
						),
						accountId: cleanText(movement.accountId || movement.contaId),
						accountName: cleanText(movement.accountName || movement.contaNome),
						companyId: cleanText(movement.companyId || movement.empresaId),
						branchId: cleanText(movement.branchId || movement.filialId),
						document: cleanText(
							movement.document || movement.titulo || movement.seqMov,
						),
						type: cleanText(movement.type || movement.tipo),
						notes: cleanText(movement.notes || movement.observacoes),
						value: currency(
							movement.value ??
								movement.valor ??
								movement.realized ??
								movement.realizado,
						),
						budgeted: currency(movement.budgeted ?? movement.orcado),
					}))
					.filter(
						(movement) => movement.value || movement.date || movement.centerId,
					)
			: [],
		origemImportacao: Boolean(partner.origemImportacao),
		email: String(partner.email || "").trim(),
		telefone: String(partner.telefone || "").trim(),
		status: String(partner.status || "ativo").trim(),
		observacoes: String(partner.observacoes || "").trim(),
		atualizadoEm: partner.atualizadoEm || nowIso(),
	};
}

function normalizeBudgetCompany(company = {}, index = 0) {
	const rawId = String(
		company.id || company.codigo || company.nome || `matriz-${index + 1}`,
	).trim();
	const id = slug(rawId, `matriz-${index + 1}`);
	const rawBranches = Array.isArray(company.filiais)
		? company.filiais
		: Array.isArray(company.branches)
			? company.branches
			: [];
	const branchIds = rawBranches
		.map((branch) => {
			if (typeof branch === "object" && branch)
				return cleanText(branch.id || branch.codigo || branch.nome);
			return cleanText(branch);
		})
		.filter(Boolean);
	const filialId = cleanText(
		company.filialId || company.branchId || branchIds[0] || "",
	);
	return {
		id,
		codigo: String(company.codigo || rawId || id).trim(),
		nome: String(
			company.nome ||
				company.name ||
				company.razaoSocial ||
				`Matriz ${company.codigo || rawId || index + 1}`,
		).trim(),
		nomeFantasia: String(company.nomeFantasia || company.fantasia || "").trim(),
		razaoSocial: String(company.razaoSocial || company.nome || "").trim(),
		cidade: String(company.cidade || "").trim(),
		cnpj: String(company.cnpj || "").replace(/\D/g, ""),
		filialId,
		branchId: filialId,
		filiais: [...new Set([filialId, ...branchIds].filter(Boolean))],
		responsavel: String(company.responsavel || "").trim(),
		telefoneResponsavel: String(
			company.telefoneResponsavel || company.telefone || "",
		).trim(),
		emailResponsavel: String(
			company.emailResponsavel || company.email || "",
		).trim(),
		status: String(company.status || "ativo").trim(),
		observacoes: String(company.observacoes || "").trim(),
		atualizadoEm: company.atualizadoEm || nowIso(),
	};
}

function normalizeBudgetBranch(branch = {}, index = 0) {
	const companyId = String(
		branch.empresaId ||
			branch.companyId ||
			branch.empresa ||
			branch.company ||
			"",
	).trim();
	const rawCompanies = Array.isArray(branch.empresas)
		? branch.empresas
		: Array.isArray(branch.companies)
			? branch.companies
			: [];
	const companyIds = [
		...new Set([companyId, ...rawCompanies.map(cleanText)].filter(Boolean)),
	];
	const branchCode = String(
		branch.codigo || branch.code || branch.id || `filial-${index + 1}`,
	).trim();
	const rawId = String(branch.id || branchCode || `filial-${index + 1}`).trim();
	const id = slug(rawId, `filial-${index + 1}`);
	return {
		id,
		codigo: String(
			branch.codigo || branch.code || branchCode || rawId || id,
		).trim(),
		empresaId: companyIds[0] || "",
		empresas: companyIds,
		companies: companyIds,
		nome: String(
			branch.nome ||
				branch.name ||
				`Filial ${branch.codigo || rawId || index + 1}`,
		).trim(),
		nomeFantasia: String(branch.nomeFantasia || branch.fantasia || "").trim(),
		razaoSocial: String(branch.razaoSocial || "").trim(),
		cnpj: String(branch.cnpj || "").replace(/\D/g, ""),
		cidade: String(branch.cidade || "").trim(),
		estado: String(branch.estado || branch.uf || "").trim(),
		responsavel: String(branch.responsavel || "").trim(),
		telefoneResponsavel: String(
			branch.telefoneResponsavel || branch.telefone || "",
		).trim(),
		emailResponsavel: String(
			branch.emailResponsavel || branch.email || "",
		).trim(),
		status: String(branch.status || "ativo").trim(),
		observacoes: String(branch.observacoes || "").trim(),
		atualizadoEm: branch.atualizadoEm || nowIso(),
	};
}

function normalizeBudgetMatrixRow(row = {}, index = 0) {
	const months = Array.from({ length: 12 }, (_, monthIndex) =>
		currency(row.months?.[monthIndex] || row[`m${monthIndex + 1}`]),
	);
	return {
		id: String(row.id || `linha-${index + 1}`).trim(),
		accountId: String(row.accountId || row.contaId || "").trim(),
		costCenterId: String(row.costCenterId || row.centroCustoId || "").trim(),
		versionId: String(row.versionId || "budget").trim(),
		year: Number(row.year || new Date().getFullYear()),
		months,
		total: months.reduce((sum, value) => sum + value, 0),
	};
}

function normalizeBudgetVersion(version = {}, index = 0) {
	return {
		id: String(version.id || `versao-${index + 1}`).trim(),
		nome: String(version.nome || version.name || "Budget").trim(),
		tipo: ["budget", "forecast"].includes(
			String(version.tipo || "").toLowerCase(),
		)
			? String(version.tipo).toLowerCase()
			: "budget",
		year: Number(version.year || new Date().getFullYear()),
		status: String(version.status || "aberto").trim(),
		locked: Boolean(version.locked),
		criadoEm: version.criadoEm || nowIso(),
	};
}

function normalizeAllocationRule(rule = {}, index = 0) {
	return {
		id: String(rule.id || `rateio-${index + 1}`).trim(),
		nome: String(rule.nome || rule.name || "Regra de rateio").trim(),
		accountId: String(rule.accountId || "").trim(),
		splits: Array.isArray(rule.splits)
			? rule.splits.map((split) => ({
					costCenterId: String(split.costCenterId || "").trim(),
					percent: Math.min(Math.max(Number(split.percent || 0), 0), 100),
				}))
			: [],
		status: String(rule.status || "ativo").trim(),
	};
}

function normalizeBudgetWorkflow(workflow = {}) {
	return {
		enabled: Boolean(workflow.enabled),
		overflowPolicy: String(
			workflow.overflowPolicy || "bloquear_e_aprovar",
		).trim(),
		approverName: String(workflow.approverName || "").trim(),
		approverEmail: String(workflow.approverEmail || "").trim(),
		approverRole: String(workflow.approverRole || "Diretor Financeiro").trim(),
		approvalPercent: Math.max(Number(workflow.approvalPercent || 100), 1),
		alertChannels: Array.isArray(workflow.alertChannels)
			? workflow.alertChannels
			: ["painel", "email"],
	};
}

function normalizeCashSettings(settings = {}) {
	return {
		bankBalance: currency(settings.bankBalance),
		projectionDays: Math.min(
			Math.max(Number(settings.projectionDays || 90), 1),
			365,
		),
		rolloverHour: String(settings.rolloverHour || "00:15").trim(),
		cashCrunchAlertEnabled: settings.cashCrunchAlertEnabled !== false,
	};
}

function normalizeBudgetList(value, fallback = []) {
	if (value === undefined || value === null) return fallback;
	const rawSource = Array.isArray(value)
		? value
		: String(value || "").split(/[,;\n]+/);
	const source = rawSource.flatMap((item) =>
		String(item || "")
			.replace(
				/(respons[áa]vel|financeiro|operacional|administrativo|comercial|t[.\s-]*i|tiago|diretor[a-z\s]*)\s*(?=Diretoria\s)/gi,
				"$1\n",
			)
			.split(/\n+/),
	);
	const normalized = source
		.map((item) => String(item || "").trim())
		.filter(Boolean);
	return [...new Set(normalized)];
}

function normalizeBudgetDirectorates(value, fallback = []) {
	const source = value === undefined || value === null ? fallback : value;
	const rawItems = Array.isArray(source)
		? source
		: String(source || "").split(/[,;\n]+/);
	const seen = new Set();
	return rawItems
		.map((item) => {
			const parsed =
				typeof item === "object" && item !== null
					? {
							id: cleanText(item.id || item.nome || item.name),
							nome: cleanText(item.nome || item.name || item.diretoria),
							diretor: cleanText(
								item.diretor || item.director || item.responsavel,
							),
							emailDiretor: cleanText(
								item.emailDiretor || item.directorEmail || item.email,
							),
							numeroDiretor: cleanText(
								item.numeroDiretor ||
									item.telefoneDiretor ||
									item.directorPhone ||
									item.telefone ||
									item.numero,
							),
						}
					: (() => {
							const text = cleanText(item);
							if (!text || text.toLowerCase() === "[object object]")
								return {
									nome: "",
									diretor: "",
									emailDiretor: "",
									numeroDiretor: "",
								};
							const [
								nome = "",
								diretor = "",
								emailDiretor = "",
								numeroDiretor = "",
							] = text.split("|").map(cleanText);
							return { nome, diretor, emailDiretor, numeroDiretor };
						})();
			if (
				!parsed.nome ||
				String(parsed.nome).trim().toLowerCase() === "[object object]"
			)
				return null;
			const key = slug(parsed.nome, parsed.nome);
			return {
				id: slug(parsed.id || parsed.nome, key),
				nome: parsed.nome,
				diretor: parsed.diretor,
				emailDiretor: parsed.emailDiretor,
				numeroDiretor: parsed.numeroDiretor,
			};
		})
		.filter(Boolean)
		.filter((item) => {
			const key = slug(item.nome, item.nome);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
}

function normalizeBudgetSettings(settings = {}) {
	return {
		centerTypes: normalizeBudgetList(
			settings.centerTypes,
			DEFAULT_BUDGET_SETTINGS.centerTypes,
		),
		mainCategories: normalizeBudgetList(
			settings.mainCategories,
			DEFAULT_BUDGET_SETTINGS.mainCategories,
		),
		directorates: normalizeBudgetDirectorates(
			settings.directorates,
			DEFAULT_BUDGET_SETTINGS.directorates,
		),
		accountGroups: normalizeBudgetList(
			settings.accountGroups,
			DEFAULT_BUDGET_SETTINGS.accountGroups,
		),
		dreGroups: normalizeBudgetList(
			settings.dreGroups,
			DEFAULT_BUDGET_SETTINGS.dreGroups,
		),
		centerStatuses: normalizeBudgetList(
			settings.centerStatuses,
			DEFAULT_BUDGET_SETTINGS.centerStatuses,
		),
	};
}

function normalizeBudgetApproval(approval = {}, index = 0) {
	const status = String(approval.status || "pendente")
		.trim()
		.toLowerCase();
	const approvalMonth = validBudgetMonth(
		approval.month || approval.mes || approval.numMes,
	);
	const history = Array.isArray(approval.history || approval.historico)
		? (approval.history || approval.historico).map((item, itemIndex) => ({
				id: String(
					item.id ||
						`${approval.id || `aprovacao-${index + 1}`}-hist-${itemIndex + 1}`,
				).trim(),
				action: String(item.action || item.acao || "").trim(),
				status: String(item.status || "")
					.trim()
					.toLowerCase(),
				note: String(
					item.note || item.observacao || item.comentario || "",
				).trim(),
				actorId: String(item.actorId || item.usuarioId || "").trim(),
				actorName: String(
					item.actorName || item.usuarioNome || item.nome || "",
				).trim(),
				at: item.at || item.createdAt || item.criadoEm || nowIso(),
			}))
		: [];
	return {
		id: String(approval.id || `aprovacao-${index + 1}`).trim(),
		type: String(approval.type || approval.tipo || "estouro_orcamento").trim(),
		status: [
			"pendente",
			"aprovado",
			"reprovado",
			"ajuste_solicitado",
			"expirado",
		].includes(status)
			? status
			: "pendente",
		severity: String(
			approval.severity || approval.severidade || "estourado",
		).trim(),
		reason: String(
			approval.reason || approval.motivo || "Estouro de orçamento",
		).trim(),
		centerId: String(approval.centerId || approval.centroCustoId || "").trim(),
		accountId: String(approval.accountId || approval.contaId || "").trim(),
		companyId: String(approval.companyId || approval.empresaId || "").trim(),
		branchId: String(approval.branchId || approval.filialId || "").trim(),
		year: Number(approval.year || approval.ano || new Date().getFullYear()),
		month: approvalMonth || "",
		budgeted: currency(approval.budgeted ?? approval.orcado),
		realized: currency(approval.realized ?? approval.realizado),
		committed: currency(approval.committed ?? approval.comprometido),
		overflow: currency(approval.overflow ?? approval.estouro),
		percent: Number(approval.percent || approval.percentual || 0) || 0,
		requesterName: String(
			approval.requesterName || approval.solicitante || "Importação automática",
		).trim(),
		approverName: String(
			approval.approverName || approval.aprovador || "",
		).trim(),
		decidedBy: String(approval.decidedBy || "").trim(),
		decidedByName: String(approval.decidedByName || "").trim(),
		decidedAt: approval.decidedAt || "",
		note: String(approval.note || approval.observacao || "").trim(),
		createdAt: approval.createdAt || approval.criadoEm || nowIso(),
		updatedAt: approval.updatedAt || approval.atualizadoEm || nowIso(),
		source: String(approval.source || approval.origem || "importacao").trim(),
		history,
		historico: history,
	};
}

function costCenterPlanToCenter(planItem = {}) {
	const code = budgetCodeKey(planItem.codigo || planItem.reduzida);
	const parentCode = budgetCodeKey(planItem.parentCodigo);
	const isInactive = String(planItem.nome || "")
		.toLowerCase()
		.includes("inativo");
	const tipoPlano = String(planItem.tipoPlano || "").toUpperCase();
	return {
		id: code,
		codigo: code,
		reduzida: cleanText(planItem.reduzida || planItem.codigo),
		classificacao: cleanText(planItem.classificacao),
		nome: cleanText(planItem.nome || code),
		parentId: parentCode,
		parentCodigo: parentCode,
		tipoPlano: ["S", "A"].includes(tipoPlano) ? tipoPlano : "",
		nivel: Number(planItem.nivel || 0) || "",
		categoriaCodigo: budgetCodeKey(planItem.categoriaCodigo),
		tipoCentro: tipoPlano === "S" ? "sintetico" : "analitico",
		tipoDespesa: "opex",
		status: isInactive ? "inativo" : "ativo",
		alertaPercentual: 85,
		finalidade:
			planItem.nivel === 2 ? "Categoria do plano de centro de custo" : "",
		observacoes: "Centro importado do Plano de Centro de Custo.",
	};
}

function mergeDefaultCostCenterPlan(rawCenters = []) {
	const planCenters = DEFAULT_COST_CENTER_PLAN.map(costCenterPlanToCenter);
	const mergedByCode = new Map();
	planCenters.forEach((center) => {
		const normalized = normalizeCostCenter(center, mergedByCode.size);
		mergedByCode.set(normalized.codigo || normalized.id, normalized);
	});

	rawCenters.forEach((center, index) => {
		const normalized = normalizeCostCenter(center, index);
		const key =
			budgetCodeKey(normalized.codigo || normalized.id) || normalized.id;
		const planCenter = mergedByCode.get(key);
		mergedByCode.set(key, {
			...(planCenter || {}),
			...normalized,
			id: planCenter?.id || normalized.id,
			codigo: key || normalized.codigo,
			reduzida:
				normalized.reduzida || planCenter?.reduzida || normalized.codigo,
			classificacao:
				normalized.classificacao || planCenter?.classificacao || "",
			parentId: normalized.parentId || planCenter?.parentId || "",
			parentCodigo: normalized.parentCodigo || planCenter?.parentCodigo || "",
			tipoPlano: normalized.tipoPlano || planCenter?.tipoPlano || "",
			nivel: normalized.nivel || planCenter?.nivel || "",
			categoriaCodigo:
				normalized.categoriaCodigo || planCenter?.categoriaCodigo || "",
			tipoCentro:
				normalized.tipoCentro && normalized.tipoCentro !== "departamento"
					? normalized.tipoCentro
					: planCenter?.tipoCentro || normalized.tipoCentro,
			status: normalized.status || planCenter?.status || "ativo",
			atualizadoEm:
				normalized.atualizadoEm || planCenter?.atualizadoEm || nowIso(),
		});
	});

	return Array.from(mergedByCode.values()).sort((left, right) => {
		const leftInactive = String(left.status || "")
			.toLowerCase()
			.includes("inativo")
			? 1
			: 0;
		const rightInactive = String(right.status || "")
			.toLowerCase()
			.includes("inativo")
			? 1
			: 0;
		if (leftInactive !== rightInactive) return leftInactive - rightInactive;
		return String(left.classificacao || left.codigo).localeCompare(
			String(right.classificacao || right.codigo),
			"pt-BR",
			{ numeric: true },
		);
	});
}

function financialAccountPlanToAccount(planItem = {}) {
	const code = budgetCodeKey(planItem.code || planItem.reducedCode);
	const parentCode = budgetCodeKey(planItem.parentCode);
	const categoryAccount = DEFAULT_FINANCIAL_ACCOUNT_PLAN.find(
		(item) =>
			Number(item.level) === 2 &&
			(String(planItem.classification || "") ===
				String(item.classification || "") ||
				String(planItem.classification || "").startsWith(
					`${item.classification}.`,
				)),
	);
	const categoryCode =
		categoryAccount?.code || (Number(planItem.level) === 2 ? code : "");
	const categoryName = cleanText(
		categoryAccount?.name ||
			(Number(planItem.level) === 2 ? planItem.name : ""),
	);
	const categoryGroup =
		categoryCode && categoryName
			? `${budgetCodeKey(categoryCode)} - ${categoryName}`
			: categoryName;
	const planType = String(planItem.planType || "").toUpperCase();
	const accountNature = String(planItem.nature || "").toUpperCase();
	const isInactive =
		String(planItem.name || "")
			.toLowerCase()
			.includes("inativo") ||
		String(planItem.status || "")
			.toLowerCase()
			.includes("inativo");
	return {
		id: code,
		codigo: code,
		reduzida: cleanText(planItem.reducedCode || planItem.code),
		classificacao: cleanText(planItem.classification),
		nome: cleanText(planItem.name || code),
		parentId: parentCode,
		parentCodigo: parentCode,
		tipoPlano: ["S", "A"].includes(planType) ? planType : "",
		nivel: Number(planItem.level || 0) || "",
		categoriaCodigo: budgetCodeKey(categoryCode),
		naturezaPlano: ["C", "D"].includes(accountNature) ? accountNature : "",
		rateio: ["S", "N"].includes(String(planItem.allocation || "").toUpperCase())
			? String(planItem.allocation).toUpperCase()
			: "",
		tipo: accountNature === "C" ? "receita" : "despesa",
		natureza: "opex",
		grupo: categoryGroup,
		dreGroup: categoryGroup || cleanText(planItem.name),
		contaContabil: code,
		status: isInactive ? "inativo" : "ativo",
		descricao: "Conta importada do Plano Financeiro.",
	};
}

function mergeDefaultFinancialAccountPlan(rawAccounts = []) {
	const planAccounts = DEFAULT_FINANCIAL_ACCOUNT_PLAN.map(
		financialAccountPlanToAccount,
	);
	const mergedByCode = new Map();
	planAccounts.forEach((account) => {
		const normalized = normalizeFinancialAccount(account, mergedByCode.size);
		mergedByCode.set(
			budgetCodeKey(normalized.codigo || normalized.id) || normalized.id,
			normalized,
		);
	});

	rawAccounts.forEach((account, index) => {
		const normalized = normalizeFinancialAccount(account, index);
		const key =
			budgetCodeKey(
				normalized.codigo || normalized.reduzida || normalized.id,
			) || normalized.id;
		const planAccount = mergedByCode.get(key);
		mergedByCode.set(key, {
			...(planAccount || {}),
			...normalized,
			id: planAccount?.id || normalized.id,
			codigo: key || normalized.codigo,
			reduzida:
				normalized.reduzida || planAccount?.reduzida || normalized.codigo,
			classificacao:
				normalized.classificacao || planAccount?.classificacao || "",
			parentId: normalized.parentId || planAccount?.parentId || "",
			parentCodigo: normalized.parentCodigo || planAccount?.parentCodigo || "",
			tipoPlano: normalized.tipoPlano || planAccount?.tipoPlano || "",
			nivel: normalized.nivel || planAccount?.nivel || "",
			categoriaCodigo:
				normalized.categoriaCodigo || planAccount?.categoriaCodigo || "",
			naturezaPlano:
				normalized.naturezaPlano || planAccount?.naturezaPlano || "",
			rateio: normalized.rateio || planAccount?.rateio || "",
			grupo: planAccount?.grupo || normalized.grupo || "",
			dreGroup: planAccount?.dreGroup || normalized.dreGroup || "",
			status: normalized.status || planAccount?.status || "ativo",
			atualizadoEm:
				normalized.atualizadoEm || planAccount?.atualizadoEm || nowIso(),
		});
	});

	return Array.from(mergedByCode.values()).sort((left, right) => {
		const leftInactive = String(left.status || "")
			.toLowerCase()
			.includes("inativo")
			? 1
			: 0;
		const rightInactive = String(right.status || "")
			.toLowerCase()
			.includes("inativo")
			? 1
			: 0;
		if (leftInactive !== rightInactive) return leftInactive - rightInactive;
		return String(left.classificacao || left.codigo).localeCompare(
			String(right.classificacao || right.codigo),
			"pt-BR",
			{ numeric: true },
		);
	});
}

function buildBudgetApprovalCandidates(config = {}, user = {}) {
	const workflow = normalizeBudgetWorkflow(config.workflow || {});
	const referenceYear = Number(
		config.lastImportReference?.year ||
			config.lastImportSummary?.referenceYear ||
			new Date().getFullYear(),
	);
	const referenceMonth = validBudgetMonth(
		config.lastImportReference?.month ||
			config.lastImportSummary?.referenceMonth,
	);
	if (!referenceMonth) return [];
	const existingApprovals = new Map(
		(config.approvals || []).map((approval, index) => {
			const normalized = normalizeBudgetApproval(approval, index);
			return [normalized.id, normalized];
		}),
	);
	const candidates = [];

	(config.centers || [])
		.filter((center) => center.tipoPlano !== "S")
		.forEach((center) => {
			const budgeted = currency(center.valorMensal || center.orcamentoMensal);
			const realized = (
				center.realizedByCompanyBranch ||
				center.realizadoPorEmpresaFilial ||
				[]
			)
				.filter(
					(item) =>
						Number(item.year || item.ano || 0) === referenceYear &&
						Number(item.month || item.numMes || 0) === referenceMonth,
				)
				.reduce(
					(sum, item) => sum + currency(item.realized ?? item.realizado),
					0,
				);
			const committed = currency(center.comprometidoMes);
			const used = currency(realized + committed);
			const percent = budgeted ? (used / budgeted) * 100 : 0;
			const threshold = Number(workflow.approvalPercent || 100);
			if (!budgeted || percent <= threshold) return;

			const id = `orcamento-estouro-${center.id}-${referenceYear}-${referenceMonth}`;
			const existing = existingApprovals.get(id);
			const candidate = normalizeBudgetApproval(
				{
					...(existing || {}),
					id,
					type: "estouro_orcamento",
					severity: "estourado",
					reason: `Centro de custo consumiu ${Math.round(percent * 100) / 100}% do orçamento.`,
					centerId: center.id,
					accountId:
						center.contaFinanceiraPadrao ||
						(center.contasFinanceiras || [])[0] ||
						"",
					year: referenceYear,
					month: referenceMonth,
					budgeted,
					realized,
					committed,
					overflow: currency(used - budgeted),
					percent,
					requesterName: existing?.requesterName || "Importação automática",
					approverName:
						existing?.approverName ||
						workflow.approverName ||
						center.responsavel ||
						"",
					createdAt: existing?.createdAt || nowIso(),
					updatedAt: nowIso(),
					source: "importacao",
				},
				candidates.length,
			);
			if (!existing) {
				candidate.history = [
					{
						id: `${id}-hist-1`,
						action: "criada",
						status: "pendente",
						note: "Aprovação criada automaticamente por estouro de orçamento.",
						actorId: user?.uid || "",
						actorName:
							user?.profile?.nome || user?.nome || user?.email || "Sistema",
						at: nowIso(),
					},
				];
				candidate.historico = candidate.history;
			}
			candidates.push(candidate);
		});

	const candidateIds = new Set(candidates.map((approval) => approval.id));
	const historical = Array.from(existingApprovals.values()).filter(
		(approval) => {
			if (candidateIds.has(approval.id)) return false;
			const month = Number(approval.month || 0);
			if (month < 1 || month > 12) return false;
			const isAutomaticOverflow =
				approval.type === "estouro_orcamento" &&
				approval.source === "importacao";
			if (isAutomaticOverflow) return false;
			return true;
		},
	);
	return [...candidates, ...historical].sort((left, right) =>
		String(right.updatedAt).localeCompare(String(left.updatedAt)),
	);
}

function normalizeCostCentersConfig(payload = {}, user = {}) {
	const planCategories = DEFAULT_COST_CENTER_PLAN.filter(
		(item) => Number(item.nivel) === 2,
	)
		.map(
			(item) =>
				`${budgetCodeKey(item.codigo || item.reduzida)} - ${cleanText(item.nome)}`,
		)
		.filter(Boolean);
	const planAccountCategories = DEFAULT_FINANCIAL_ACCOUNT_PLAN.filter(
		(item) =>
			Number(item.level) === 2 &&
			String(item.planType || "").toUpperCase() === "S",
	)
		.map(
			(item) =>
				`${budgetCodeKey(item.code || item.reducedCode)} - ${cleanText(item.name)}`,
		)
		.filter(Boolean);
	const mergedSettings = {
		...(payload.settings || {}),
		centerTypes: [
			...new Set([
				"sintetico",
				"analitico",
				...normalizeBudgetList(payload.settings?.centerTypes, []),
			]),
		],
		mainCategories: [
			...new Set([
				...planCategories,
				...normalizeBudgetList(payload.settings?.mainCategories, []),
			]),
		],
		directorates: normalizeBudgetDirectorates(
			payload.settings?.directorates,
			DEFAULT_BUDGET_SETTINGS.directorates,
		),
		accountGroups: [
			...new Set([
				...planAccountCategories,
				...normalizeBudgetList(
					payload.settings?.accountGroups,
					DEFAULT_BUDGET_SETTINGS.accountGroups,
				),
			]),
		],
		dreGroups: normalizeBudgetList(
			payload.settings?.dreGroups,
			DEFAULT_BUDGET_SETTINGS.dreGroups,
		),
		centerStatuses: normalizeBudgetList(
			payload.settings?.centerStatuses,
			DEFAULT_BUDGET_SETTINGS.centerStatuses,
		),
	};
	const accounts = Array.isArray(payload.accounts)
		? mergeDefaultFinancialAccountPlan(payload.accounts)
		: mergeDefaultFinancialAccountPlan([]);
	const accountIds = new Set(accounts.map((account) => account.id));
	const centers = mergeDefaultCostCenterPlan(
		Array.isArray(payload.centers) ? payload.centers : [],
	);
	const normalizedCenters = centers.map((center) => ({
		...center,
		clusters: [],
		contasFinanceiras: (center.contasFinanceiras || []).filter((accountId) =>
			accountIds.has(accountId),
		),
		contaFinanceiraPadrao: accountIds.has(center.contaFinanceiraPadrao)
			? center.contaFinanceiraPadrao
			: "",
	}));
	const rawCompanies = Array.isArray(payload.companies)
		? payload.companies.map(normalizeBudgetCompany)
		: [];
	const rawBranches = Array.isArray(payload.branches)
		? payload.branches.map(normalizeBudgetBranch)
		: [];
	const companiesByCode = new Map();
	rawCompanies.forEach((company) => {
		const key = slug(company.codigo || company.id, company.id);
		const current = companiesByCode.get(key);
		companiesByCode.set(
			key,
			current
				? {
						...current,
						...company,
						id: current.id,
						filialId: company.filialId || current.filialId || "",
						branchId: company.branchId || current.branchId || "",
						filiais: [
							...new Set(
								[...(current.filiais || []), ...(company.filiais || [])].filter(
									Boolean,
								),
							),
						].slice(0, 1),
					}
				: company,
		);
	});
	const branchesByCode = new Map();
	rawBranches.forEach((branch) => {
		const primaryCompanyId =
			branch.empresaId || branch.empresas?.[0] || branch.companies?.[0] || "";
		const key =
			[primaryCompanyId, branch.codigo || branch.id]
				.map((item) => slug(item, ""))
				.filter(Boolean)
				.join("|") || branch.id;
		const current = branchesByCode.get(key);
		branchesByCode.set(
			key,
			current
				? {
						...current,
						...branch,
						id: current.id,
						empresas: [
							...new Set(
								[
									...(current.empresas || []),
									...(branch.empresas || []),
								].filter(Boolean),
							),
						],
						companies: [
							...new Set(
								[
									...(current.companies || []),
									...(branch.companies || []),
								].filter(Boolean),
							),
						],
						empresaId: current.empresaId || branch.empresaId || "",
					}
				: branch,
		);
	});
	const companies = Array.from(companiesByCode.values());
	const branches = Array.from(branchesByCode.values());
	const branchIds = new Set(branches.map((branch) => branch.id));
	const companyPrimaryBranch = new Map();
	const companiesByBranch = new Map();
	companies.forEach((company) => {
		const branchId =
			[company.filialId, ...(company.filiais || [])].find(
				(item) => item && branchIds.has(item),
			) || "";
		if (!branchId) return;
		companyPrimaryBranch.set(company.id, branchId);
		const companiesInBranch = companiesByBranch.get(branchId) || [];
		companiesInBranch.push(company.id);
		companiesByBranch.set(branchId, companiesInBranch);
	});
	branches.forEach((branch) => {
		(branch.empresas || []).forEach((companyId) => {
			if (!companyId) return;
			if (!companyPrimaryBranch.has(companyId))
				companyPrimaryBranch.set(companyId, branch.id);
			const companiesInBranch = companiesByBranch.get(branch.id) || [];
			companiesInBranch.push(companyId);
			companiesByBranch.set(branch.id, companiesInBranch);
		});
	});
	const normalizedCompanies = companies.map((company) => {
		const companyBranches = [
			...new Set(
				[
					companyPrimaryBranch.get(company.id) || company.filialId || "",
					...(company.filiais || []),
					...(companiesByBranch.entries
						? Array.from(companiesByBranch.entries())
								.filter(([, companyIds]) => companyIds.includes(company.id))
								.map(([branchId]) => branchId)
						: []),
				].filter(Boolean),
			),
		];
		return {
			...company,
			filialId: companyBranches[0] || company.filialId || "",
			branchId: companyBranches[0] || company.branchId || "",
			filiais: companyBranches,
		};
	});
	const normalizedBranches = branches.map((branch) => {
		const companiesInBranch = [
			...new Set(
				[
					...(branch.empresas || []),
					...(companiesByBranch.get(branch.id) || []),
				].filter(Boolean),
			),
		];
		return {
			...branch,
			empresas: companiesInBranch,
			companies: companiesInBranch,
			empresaId: companiesInBranch[0] || branch.empresaId || "",
		};
	});
	const syntheticCenterIds = new Set(
		normalizedCenters
			.filter((center) => center.tipoPlano === "S")
			.map((center) => center.id),
	);
	const normalizedMatrix = Array.isArray(payload.matrix)
		? payload.matrix
				.map(normalizeBudgetMatrixRow)
				.filter((row) => !syntheticCenterIds.has(row.costCenterId))
		: [];

	return {
		clusters: [],
		accounts,
		centers: normalizedCenters,
		companies: normalizedCompanies,
		branches: normalizedBranches,
		partners: Array.isArray(payload.partners)
			? payload.partners.map(normalizeBudgetPartner)
			: [],
		matrix: normalizedMatrix,
		versions: Array.isArray(payload.versions)
			? payload.versions.map(normalizeBudgetVersion)
			: [
					{
						id: "budget",
						nome: `Budget ${new Date().getFullYear()}`,
						tipo: "budget",
						year: new Date().getFullYear(),
						status: "travado",
						locked: true,
						criadoEm: nowIso(),
					},
				],
		allocationRules: Array.isArray(payload.allocationRules)
			? payload.allocationRules.map(normalizeAllocationRule)
			: [],
		workflow: normalizeBudgetWorkflow(payload.workflow || {}),
		cashSettings: normalizeCashSettings(payload.cashSettings || {}),
		settings: normalizeBudgetSettings(mergedSettings),
		approvals: Array.isArray(payload.approvals)
			? payload.approvals
					.map(normalizeBudgetApproval)
					.filter(
						(approval) =>
							Number(approval.month) >= 1 && Number(approval.month) <= 12,
					)
			: [],
		lastImportReference: payload.lastImportReference || null,
		lastImportSummary: payload.lastImportSummary || null,
		lastImportInfo: payload.lastImportInfo || null,
		updatedAt: nowIso(),
		updatedBy: user?.uid || "",
		updatedByName: user?.profile?.nome || user?.nome || user?.email || "",
	};
}

function normalizeBudgetDataRow(row = {}, index = 0) {
	const supplier = splitCodeName(firstValue(row, ["fornecedor", "Fornecedor"]));
	const account = splitCodeName(
		firstValue(row, [
			"cf",
			"CF",
			"codConta",
			"Cod_Conta",
			"cod_conta",
			"contaFinanceira",
			"Conta Financeira",
		]),
	);
	const costCenter = splitCodeName(
		firstValue(row, [
			"cc",
			"CC",
			"codCc",
			"Cod_CC",
			"cod_cc",
			"centroCusto",
			"Centro de Custo",
		]),
	);
	const dateInfo = normalizeBudgetDate(
		firstValue(row, [
			"dataPagamento",
			"Data Pagamento",
			"Data_Pagamento",
			"data_pagamento",
			"data",
			"Data",
		]),
	);
	const empresaId = cleanText(
		firstValue(row, ["empresaId", "Empresa ID", "empresa", "Empresa"]),
	);
	const filialId = cleanText(
		firstValue(row, ["filialId", "Filial ID", "filial", "Filial"]),
	);
	const banco = cleanText(
		firstValue(row, ["banco", "Banco", "conta", "Conta"]),
	);
	const seqMov = cleanText(firstValue(row, ["seqMov", "SeqMov", "seq", "Seq"]));
	const monthFromDate = validBudgetMonth(dateInfo.numMes);
	const explicitMonth = validBudgetMonth(
		row.numMes || row.Num_Mes || row.num_mes,
	);
	const observacoes = cleanText(
		firstValue(row, [
			"observacoes",
			"Observações",
			"Observacoes",
			"historico",
			"Histórico",
			"Historico",
			"__EMPTY_8",
			"__EMPTY",
		]),
	);
	const normalized = {
		id: cleanText(row.id || seqMov || `linha-${index + 1}`),
		quebra: cleanText(firstValue(row, ["quebra", "Quebra", "area", "Area"])),
		data: cleanText(dateInfo.data || row.data || row.Data),
		fornecedor: cleanText(row.fornecedor || supplier.nome || row.Fornecedor),
		codConta: cleanText(
			row.codConta || row.Cod_Conta || row.cod_conta || account.codigo,
		),
		nomeConta: cleanText(
			row.nomeConta || row.Nome_Conta || row.nome_conta || account.nome,
		),
		codCc: cleanText(
			row.codCc || row.Cod_CC || row.cod_cc || costCenter.codigo,
		),
		nomeCc: cleanText(
			row.nomeCc || row.Nome_CC || row.nome_cc || costCenter.nome,
		),
		orcado: currency(row.orcado ?? row["Orçado"] ?? row.Orcado),
		realizado: currency(
			row.realizado ?? row.Realizado ?? row.valor ?? row.Valor,
		),
		empresa: cleanText(row.empresa || row.Empresa || empresaId),
		filial: cleanText(row.filial || row.Filial || filialId),
		conta: cleanText(row.conta || row.Conta || banco),
		seqMov,
		titulo: cleanText(row.titulo || row.Titulo || row.Título),
		tipo: cleanText(row.tipo || row.Tipo),
		observacoes,
		ano: Number(dateInfo.ano || row.ano || row.Ano || 0) || "",
		numMes: monthFromDate || explicitMonth || "",
		mes: cleanText(
			monthName(monthFromDate || explicitMonth) ||
				dateInfo.mes ||
				row.mes ||
				row.Mês ||
				row.Mes,
		),
		categoria: cleanText(row.categoria || row.Categoria),
		gestor: cleanText(row.gestor || row.Gestor),
		quebra2: cleanText(row.quebra2 || row.Quebra2),
		entidade: cleanText(row.entidade || row.Entidade),
		diretoria: cleanText(row.diretoria || row.Diretoria),
		diretor: cleanText(row.diretor || row.Diretor),
		statusProjetos: cleanText(
			row.statusProjetos || row.Status_Projetos || row.status_projetos,
		),
		grupo: cleanText(row.grupo || row.Grupo),
		empresaId,
		filialId,
		codFornecedor: cleanText(
			row.codFornecedor || row.Cod_Fornecedor || supplier.codigo,
		),
		nomeFornecedor: cleanText(
			row.nomeFornecedor || row.Nome_Fornecedor || supplier.nome,
		),
		banco,
		cf: cleanText(row.cf || row.CF || account.raw),
		cc: cleanText(row.cc || row.CC || costCenter.raw),
	};

	if (!normalized.categoria) normalized.categoria = normalized.nomeConta;
	if (!normalized.entidade)
		normalized.entidade = normalized.nomeFornecedor || normalized.fornecedor;
	return normalized;
}

function uniqueCount(rows, key) {
	return new Set(rows.map((row) => cleanText(row[key])).filter(Boolean)).size;
}

function summarizeBudgetDataRows(rows = []) {
	const byMonthMap = new Map();
	rows.forEach((row) => {
		const dateInfo = normalizeBudgetDate(row.data);
		const year = Number(row.ano || dateInfo.ano || 0);
		const month =
			validBudgetMonth(row.numMes) || validBudgetMonth(dateInfo.numMes);
		const key =
			year && month
				? `${year}-${String(month).padStart(2, "0")}`
				: row.mes || "Sem período";
		const current = byMonthMap.get(key) || {
			key,
			year: year || "",
			month: month || "",
			mes: row.mes || "",
			orcado: 0,
			realizado: 0,
			rows: 0,
		};
		current.orcado += currency(row.orcado);
		current.realizado += currency(row.realizado);
		current.rows += 1;
		byMonthMap.set(key, current);
	});

	const byMonth = Array.from(byMonthMap.values()).sort((left, right) =>
		String(left.key).localeCompare(String(right.key), "pt-BR"),
	);
	const reference =
		byMonth
			.filter((item) => Number(item.year) && Number(item.month))
			.slice(-1)[0] ||
		byMonth.slice(-1)[0] ||
		{};

	return {
		totalRows: rows.length,
		totalOrcado: currency(
			rows.reduce((sum, row) => sum + currency(row.orcado), 0),
		),
		totalRealizado: currency(
			rows.reduce((sum, row) => sum + currency(row.realizado), 0),
		),
		uniqueAccounts:
			uniqueCount(rows, "codConta") || uniqueCount(rows, "nomeConta"),
		uniqueCostCenters:
			uniqueCount(rows, "codCc") || uniqueCount(rows, "nomeCc"),
		uniqueSuppliers: uniqueCount(rows, "fornecedor"),
		uniqueCompanies:
			uniqueCount(rows, "empresaId") || uniqueCount(rows, "empresa"),
		uniqueBranches:
			uniqueCount(rows, "filialId") || uniqueCount(rows, "filial"),
		byMonth,
		referenceYear: reference.year || "",
		referenceMonth: reference.month || "",
		referenceLabel: reference.key || "",
	};
}

function buildImportCodeByName(rows = [], codeKey, nameKey) {
	const lookup = new Map();
	rows.forEach((row) => {
		const code = cleanText(row[codeKey]);
		const name = cleanText(row[nameKey]);
		if (code && name) lookup.set(slug(name, ""), code);
	});
	return lookup;
}

function clearBudgetImportArtifacts(config = {}) {
	return normalizeCostCentersConfig({
		...config,
		matrix: [],
		centers: (config.centers || []).map((center) => {
			const nextCenter = {
				...center,
				realizadoMes: 0,
				realizedByCompanyBranch: [],
				realizadoPorEmpresaFilial: [],
			};
			delete nextCenter.orcadoImportado;
			delete nextCenter.realizadoImportado;
			delete nextCenter.saldoImportado;
			delete nextCenter.linhasImportadas;
			return nextCenter;
		}),
		partners: (config.partners || []).map((partner) => {
			if (partner.origemImportacao !== true) return partner;
			return {
				...partner,
				totalOrcado: 0,
				totalRealizado: 0,
				saldo: 0,
				linhasImportadas: 0,
				ultimaMovimentacao: "",
			};
		}),
		approvals: (config.approvals || []).filter((approval) => {
			const normalized = normalizeBudgetApproval(approval);
			return !(
				normalized.type === "estouro_orcamento" &&
				normalized.source === "importacao"
			);
		}),
		lastImportReference: null,
		lastImportSummary: null,
		lastImportInfo: null,
	});
}

function mergeBudgetConfigFromRows(existingConfig = {}, rows = [], user = {}) {
	const accountCodeByName = buildImportCodeByName(
		rows,
		"codConta",
		"nomeConta",
	);
	const centerCodeByName = buildImportCodeByName(rows, "codCc", "nomeCc");
	const accountAliases = new Map();
	const centerAliases = new Map();
	const originalCenterBudgetFields = new Map();
	const accountsMap = new Map();
	const centersMap = new Map();
	(existingConfig.accounts || []).forEach((account, index) => {
		const normalized = normalizeFinancialAccount(account, index);
		const nameKey = slug(normalized.nome, "");
		const importedCode = accountCodeByName.get(nameKey);
		const canonicalCode = importedCode || cleanText(account.codigo);
		const canonicalId = canonicalCode
			? slug(canonicalCode, normalized.id)
			: normalized.id;
		accountAliases.set(normalized.id, canonicalId);
		const current = accountsMap.get(canonicalId);
		accountsMap.set(canonicalId, {
			...(current || {}),
			...normalized,
			id: canonicalId,
			codigo: canonicalCode || normalized.codigo,
			nome: importedCode ? normalized.nome : current?.nome || normalized.nome,
			atualizadoEm: nowIso(),
		});
	});
	(existingConfig.centers || []).forEach((center, index) => {
		const rawCenterId = String(
			center.id || center.codigo || center.nome || `centro-${index + 1}`,
		).trim();
		const normalized = normalizeCostCenter(center, index);
		const nameKey = slug(normalized.nome, "");
		const ownCode = budgetCodeKey(
			center.codigo || center.reduzida || normalized.codigo || normalized.reduzida,
		);
		const importedCode = ownCode ? "" : centerCodeByName.get(nameKey);
		const canonicalCode = budgetCodeKey(ownCode || importedCode);
		const canonicalId = canonicalCode || normalized.id;
		const originalBudgetFields = { rawId: rawCenterId };
		if (Object.hasOwn(center, "valorMensal"))
			originalBudgetFields.valorMensal = center.valorMensal;
		if (Object.hasOwn(center, "valorAnual"))
			originalBudgetFields.valorAnual = center.valorAnual;
		if (Object.hasOwn(center, "orcamentoMensal"))
			originalBudgetFields.orcamentoMensal = center.orcamentoMensal;
		if (Object.hasOwn(center, "orcamentoAnual"))
			originalBudgetFields.orcamentoAnual = center.orcamentoAnual;
		originalCenterBudgetFields.set(canonicalId, originalBudgetFields);
		centerAliases.set(normalized.id, canonicalId);
		const current = centersMap.get(canonicalId);
		centersMap.set(canonicalId, {
			...normalized,
			...(current || {}),
			id: canonicalId,
			codigo: canonicalCode || current?.codigo || normalized.codigo,
			clusters: [],
			atualizadoEm: nowIso(),
		});
	});
	const partnersMap = new Map(
		(existingConfig.partners || []).map((partner) => [partner.id, partner]),
	);
	const partnerIdsByName = new Map(
		(existingConfig.partners || [])
			.map((partner) => [
				slug(partner.nome || partner.razaoSocial || partner.id, ""),
				partner.id,
			])
			.filter(([nameKey, id]) => nameKey && id),
	);
	const companiesMap = new Map(
		(existingConfig.companies || []).map((company) => [company.id, company]),
	);
	const branchesMap = new Map(
		(existingConfig.branches || []).map((branch) => [branch.id, branch]),
	);
	const idsByCode = (items = []) =>
		new Map(
			items
				.map((item) => [slug(item.codigo || item.code || item.id, ""), item.id])
				.filter(([codeKey, id]) => codeKey && id),
		);
	const costCenterIdsByCode = (items = []) =>
		new Map(
			items
				.flatMap((item) =>
					[item.codigo, item.reduzida, item.id]
						.map((value) => [budgetCodeKey(value), item.id])
						.filter(([codeKey, id]) => codeKey && id),
				)
				.filter(([codeKey, id]) => codeKey && id),
		);
	const accountIdsByCode = idsByCode(Array.from(accountsMap.values()));
	const centerIdsByCode = costCenterIdsByCode(Array.from(centersMap.values()));
	const companyIdsByCode = idsByCode(existingConfig.companies || []);
	const branchIdsByCode = idsByCode(existingConfig.branches || []);
	const branchIdsByCompanyAndCode = new Map(
		(existingConfig.branches || [])
			.map((branch) => {
				const companyKey = slug(
					branch.empresaId ||
						branch.empresas?.[0] ||
						branch.companies?.[0] ||
						"",
					"",
				);
				const branchKey = slug(branch.codigo || branch.code || branch.id, "");
				return [[companyKey, branchKey].filter(Boolean).join("|"), branch.id];
			})
			.filter(([key, id]) => key && id),
	);
	const matrixMap = new Map();
	const summary = summarizeBudgetDataRows(rows);
	const referenceYear = Number(
		summary.referenceYear || new Date().getFullYear(),
	);
	const referenceMonth =
		validBudgetMonth(summary.referenceMonth) || new Date().getMonth() + 1;
	const statsByCenter = new Map();
	const created = {
		accounts: 0,
		centers: 0,
		partners: 0,
		companies: 0,
		branches: 0,
		matrixRows: 0,
		clusters: 0,
	};
	const partnersTouchedThisImport = new Set();

	rows.forEach((row, index) => {
		const accountSource =
			row.codConta || row.nomeConta || row.conta || `conta-${index + 1}`;
		const accountCodeKey = slug(row.codConta || accountSource, "");
		const accountId =
			accountIdsByCode.get(accountCodeKey) ||
			slug(accountSource, `conta-${index + 1}`);
		const centerSource =
			row.codCc ||
			row.nomeCc ||
			row.entidade ||
			row.empresa ||
			`centro-${index + 1}`;
		const centerCodeKey = budgetCodeKey(row.codCc || centerSource);
		const centerId =
			centerIdsByCode.get(centerCodeKey) ||
			budgetEntityIdFromCode(centerSource, `centro-${index + 1}`);
		// Regra orçamentária: na planilha, "Filial" representa a Matriz,
		// e "Empresa" representa a Filial operacional daquela matriz.
		const companyParts = splitCodeName(
			row.filialId || row.filial || row.entidade,
		);
		const branchParts = splitCodeName(row.empresaId || row.empresa);
		const companyCode = cleanText(
			companyParts.codigo || row.filialId || row.filial || row.entidade,
		);
		const branchCode = cleanText(
			branchParts.codigo || row.empresaId || row.empresa,
		);
		const companyCodeKey = slug(companyCode, "");
		const branchCodeKey = slug(branchCode, "");
		const companyId = companyCode
			? companyIdsByCode.get(companyCodeKey) ||
				slug(companyCode, `matriz-${index + 1}`)
			: "";
		const branchCompositeKey = [companyId || companyCodeKey, branchCodeKey]
			.filter(Boolean)
			.join("|");
		const branchId = branchCode
			? branchIdsByCompanyAndCode.get(branchCompositeKey) ||
				slug(
					`${companyId || companyCode || "matriz"}-${branchCode}`,
					`filial-${index + 1}`,
				)
			: "";
		const companyName = cleanText(
			companyParts.nome ||
				(String(row.filial || "").trim() &&
				!String(row.filial || "").match(/^\d+$/)
					? row.filial
					: "") ||
				(companyCode ? `Matriz ${companyCode}` : ""),
		);
		const branchName = cleanText(
			branchParts.nome ||
				(String(row.empresa || "").trim() &&
				!String(row.empresa || "").match(/^\d+$/)
					? row.empresa
					: "") ||
				(branchCode ? `Filial ${branchCode}` : ""),
		);
		const supplierName = cleanText(
			row.nomeFornecedor || row.fornecedor || row.entidade,
		);
		const rowYear = Number(
			row.ano || referenceYear || new Date().getFullYear(),
		);
		const rowMonth =
			validBudgetMonth(row.numMes) || validBudgetMonth(referenceMonth) || 1;
		const plannedValue = currency(row.orcado);
		const realizedValue = currency(row.realizado);
		const matrixKey = `${accountId}|${centerId}|${rowYear}|importacao`;
		const currentMatrix = matrixMap.get(matrixKey) || {
			id: `importado-${rowYear}-${accountId}-${centerId}`,
			accountId,
			costCenterId: centerId,
			versionId: "importacao",
			year: rowYear,
			months: Array.from({ length: 12 }, () => 0),
			source: "importacao",
			origemImportacao: true,
		};
		currentMatrix.months[rowMonth - 1] = currency(
			currentMatrix.months[rowMonth - 1] + realizedValue,
		);
		currentMatrix.total = currentMatrix.months.reduce(
			(sum, value) => sum + currency(value),
			0,
		);
		matrixMap.set(matrixKey, currentMatrix);

		if (companyId) {
			const currentCompany = companiesMap.get(companyId);
			if (!currentCompany) {
				created.companies += 1;
				companiesMap.set(
					companyId,
					normalizeBudgetCompany(
						{
							id: companyId,
							codigo: companyCode,
							nome: companyName,
							filialId: branchId,
							filiais: branchId ? [branchId] : [],
							observacoes:
								"Criada automaticamente pela importacao de dados orcamentarios.",
						},
						companiesMap.size,
					),
				);
				if (companyCodeKey) companyIdsByCode.set(companyCodeKey, companyId);
			} else if (
				branchId &&
				!(currentCompany.filiais || []).includes(branchId)
			) {
				const nextBranches = [
					...new Set(
						[...(currentCompany.filiais || []), branchId].filter(Boolean),
					),
				];
				companiesMap.set(companyId, {
					...currentCompany,
					filialId: currentCompany.filialId || nextBranches[0] || branchId,
					branchId: currentCompany.branchId || nextBranches[0] || branchId,
					filiais: nextBranches,
					atualizadoEm: nowIso(),
				});
			}
		}

		if (branchId) {
			const currentBranch = branchesMap.get(branchId);
			if (!currentBranch) {
				created.branches += 1;
				branchesMap.set(
					branchId,
					normalizeBudgetBranch(
						{
							id: branchId,
							codigo: branchCode,
							empresas: companyId ? [companyId] : [],
							nome: branchName,
							observacoes:
								"Criada automaticamente pela importacao de dados orcamentarios.",
						},
						branchesMap.size,
					),
				);
				if (branchCodeKey) branchIdsByCode.set(branchCodeKey, branchId);
				if (branchCompositeKey)
					branchIdsByCompanyAndCode.set(branchCompositeKey, branchId);
			} else if (
				companyId &&
				!(currentBranch.empresas || currentBranch.companies || []).includes(
					companyId,
				)
			) {
				branchesMap.set(branchId, {
					...currentBranch,
					empresas: [
						...new Set([
							...(currentBranch.empresas || currentBranch.companies || []),
							companyId,
						]),
					],
					companies: [
						...new Set([
							...(currentBranch.empresas || currentBranch.companies || []),
							companyId,
						]),
					],
					empresaId: currentBranch.empresaId || companyId,
					atualizadoEm: nowIso(),
				});
			}
		}

		if (!accountsMap.has(accountId)) {
			created.accounts += 1;
			accountsMap.set(
				accountId,
				normalizeFinancialAccount(
					{
						id: accountId,
						codigo: row.codConta || accountId,
						nome:
							row.nomeConta || row.conta || row.categoria || "Conta financeira",
						tipo: String(row.tipo || "")
							.toLowerCase()
							.includes("receita")
							? "receita"
							: "despesa",
						natureza: String(row.grupo || row.categoria || "")
							.toLowerCase()
							.includes("capex")
							? "capex"
							: "opex",
						grupo: row.grupo || row.categoria || "Importado",
						dreGroup: row.quebra || row.quebra2 || row.categoria || "",
						descricao: `Importado de dados orçamentários em ${nowIso()}`,
					},
					accountsMap.size,
				),
			);
			if (accountCodeKey) accountIdsByCode.set(accountCodeKey, accountId);
		}

		const existingCenter = centersMap.get(centerId);
		const planCenter = existingCenter || centersMap.get(centerId);
		const centerIsSynthetic = planCenter?.tipoPlano === "S";
		const importedResponsible = centerIsSynthetic
			? row.diretor || row.gestor || ""
			: row.gestor || "";
		const importedCategory =
			row.diretoria || row.categoria || row.nomeConta || row.grupo || "";
		const updateParentDirector = (currentCenterId) => {
			const currentCenter = centersMap.get(currentCenterId);
			const parentId = currentCenter?.parentId || currentCenter?.parentCodigo;
			if (
				!parentId ||
				!centersMap.has(parentId) ||
				!(row.diretor || row.diretoria)
			)
				return;
			const parentCenter = centersMap.get(parentId);
			centersMap.set(parentId, {
				...parentCenter,
				responsavel: parentCenter.responsavel || row.diretor || "",
				categoriaPrincipal:
					parentCenter.categoriaPrincipal ||
					row.diretoria ||
					parentCenter.categoriaPrincipal ||
					"",
				diretoria: parentCenter.diretoria || row.diretoria || "",
				finalidade:
					parentCenter.finalidade ||
					(row.diretoria ? `Diretoria: ${row.diretoria}` : ""),
				atualizadoEm: nowIso(),
			});
		};
		const centerStats = statsByCenter.get(centerId) || {
			annualBudget: 0,
			totalRealized: 0,
			totalRows: 0,
			referenceBudget: 0,
			referenceRealized: 0,
			accounts: new Set(),
			companies: new Set(),
			branches: new Set(),
			realizedBreakdown: new Map(),
		};
		centerStats.annualBudget += plannedValue;
		centerStats.totalRealized += realizedValue;
		centerStats.totalRows += 1;
		if (rowYear === referenceYear && rowMonth === referenceMonth) {
			centerStats.referenceBudget += plannedValue;
			centerStats.referenceRealized += realizedValue;
		}
		centerStats.accounts.add(accountId);
		if (companyId) centerStats.companies.add(companyId);
		if (branchId) centerStats.branches.add(branchId);
		const breakdownKey = `${companyId || "sem-empresa"}|${branchId || "sem-filial"}|${accountId}|${rowYear}|${rowMonth}`;
		const currentBreakdown = centerStats.realizedBreakdown.get(
			breakdownKey,
		) || {
			id: `realizado-${centerId}-${companyId || "sem-empresa"}-${branchId || "sem-filial"}-${accountId}-${rowYear}-${rowMonth}`,
			companyId,
			branchId,
			accountId,
			year: rowYear,
			month: rowMonth,
			budgeted: 0,
			orcado: 0,
			realized: 0,
			realizado: 0,
			saldo: 0,
			suppliers: [],
			fornecedores: [],
			movements: [],
			movimentacoes: [],
			rows: 0,
			updatedAt: nowIso(),
		};
		currentBreakdown.budgeted =
			currency(currentBreakdown.budgeted) + plannedValue;
		currentBreakdown.orcado = currentBreakdown.budgeted;
		currentBreakdown.realized =
			currency(currentBreakdown.realized) + realizedValue;
		currentBreakdown.realizado = currentBreakdown.realized;
		currentBreakdown.saldo =
			currency(currentBreakdown.budgeted) - currency(currentBreakdown.realized);
		currentBreakdown.suppliers = [
			...new Set(
				[...(currentBreakdown.suppliers || []), supplierName].filter(Boolean),
			),
		];
		currentBreakdown.fornecedores = currentBreakdown.suppliers;
		currentBreakdown.movements = [
			...(currentBreakdown.movements || []),
			{
				id: `mov-${centerId}-${accountId}-${rowYear}-${rowMonth}-${index + 1}`,
				date: row.data,
				supplier: supplierName,
				accountId,
				accountName: row.nomeConta || row.conta || row.categoria || "",
				companyId,
				branchId,
				document: row.titulo || row.seqMov || "",
				type: row.tipo || "",
				notes: row.observacoes || "",
				value: realizedValue,
				budgeted: plannedValue,
			},
		];
		currentBreakdown.movimentacoes = currentBreakdown.movements;
		currentBreakdown.rows += 1;
		centerStats.realizedBreakdown.set(breakdownKey, currentBreakdown);
		statsByCenter.set(centerId, centerStats);

		if (!existingCenter) {
			created.centers += 1;
			centersMap.set(
				centerId,
				normalizeCostCenter(
					{
						id: centerId,
						codigo: row.codCc || centerId,
						nome:
							row.nomeCc || row.entidade || row.empresa || "Centro de custo",
						tipoCentro: "departamento",
						companies: [companyId].filter(Boolean),
						branches: [branchId].filter(Boolean),
						contasFinanceiras: [accountId],
						contaFinanceiraPadrao: accountId,
						responsavel: importedResponsible,
						categoriaPrincipal: importedCategory,
						diretoria: row.diretoria || "",
						tipoDespesa: String(row.grupo || row.categoria || "")
							.toLowerCase()
							.includes("capex")
							? "capex"
							: "opex",
						finalidade: row.diretoria ? `Diretoria: ${row.diretoria}` : "",
						status: row.statusProjetos || "ativo",
						observacoes: row.observacoes || "",
					},
					centersMap.size,
				),
			);
			if (centerCodeKey) centerIdsByCode.set(centerCodeKey, centerId);
		} else {
			centersMap.set(centerId, {
				...existingCenter,
				clusters: [],
				companies: [
					...new Set(
						[
							...(existingCenter.companies || existingCenter.empresas || []),
							companyId,
						].filter(Boolean),
					),
				],
				branches: [
					...new Set(
						[
							...(existingCenter.branches || existingCenter.filiais || []),
							branchId,
						].filter(Boolean),
					),
				],
				contasFinanceiras: [
					...new Set(
						[...(existingCenter.contasFinanceiras || []), accountId].filter(
							Boolean,
						),
					),
				],
				contaFinanceiraPadrao:
					existingCenter.contaFinanceiraPadrao || accountId,
				responsavel: existingCenter.responsavel || importedResponsible,
				categoriaPrincipal:
					existingCenter.categoriaPrincipal || importedCategory,
				diretoria:
					existingCenter.diretoria ||
					(centerIsSynthetic ? row.diretoria || "" : ""),
				finalidade:
					existingCenter.finalidade ||
					(row.diretoria ? `Diretoria: ${row.diretoria}` : ""),
				atualizadoEm: nowIso(),
			});
		}
		updateParentDirector(centerId);

		if (supplierName) {
			const supplierNameKey = slug(supplierName, "");
			const partnerId = row.codFornecedor
				? slug(row.codFornecedor, `parceiro-${index + 1}`)
				: partnerIdsByName.get(supplierNameKey) ||
					slug(supplierName, `parceiro-${index + 1}`);
			const currentPartner = partnersMap.get(partnerId);
			const wasAutoImported =
				currentPartner?.origemImportacao === true ||
				/importa[cç][aã]o|importacao/i.test(currentPartner?.observacoes || "");
			const resetImportedTotals =
				wasAutoImported && !partnersTouchedThisImport.has(partnerId);
			const nextPartner = normalizeBudgetPartner(
				{
					...(currentPartner || {}),
					id: partnerId,
					codigo: currentPartner?.codigo || row.codFornecedor || "",
					nome: currentPartner?.nome || supplierName,
					tipo: "fornecedor",
					contaPadraoId: currentPartner?.contaPadraoId || accountId,
					centroCustoPadraoId: currentPartner?.centroCustoPadraoId || centerId,
					contasFinanceiras: [
						...new Set(
							[...(currentPartner?.contasFinanceiras || []), accountId].filter(
								Boolean,
							),
						),
					],
					centrosCusto: [
						...new Set(
							[...(currentPartner?.centrosCusto || []), centerId].filter(
								Boolean,
							),
						),
					],
					empresas: [
						...new Set(
							[...(currentPartner?.empresas || []), companyId].filter(Boolean),
						),
					],
					filiais: [
						...new Set(
							[...(currentPartner?.filiais || []), branchId].filter(Boolean),
						),
					],
					totalOrcado:
						(resetImportedTotals ? 0 : currency(currentPartner?.totalOrcado)) +
						plannedValue,
					totalRealizado:
						(resetImportedTotals
							? 0
							: currency(currentPartner?.totalRealizado)) + realizedValue,
					saldo:
						(resetImportedTotals ? 0 : currency(currentPartner?.saldo)) +
						plannedValue -
						realizedValue,
					linhasImportadas:
						(resetImportedTotals
							? 0
							: Number(currentPartner?.linhasImportadas || 0)) + 1,
					ultimaMovimentacao:
						row.data || currentPartner?.ultimaMovimentacao || "",
					movements: [
						...(resetImportedTotals
							? []
							: currentPartner?.movements ||
								currentPartner?.movimentacoes ||
								[]),
						{
							id: `mov-fornecedor-${partnerId}-${rowYear}-${rowMonth}-${index + 1}`,
							date: row.data,
							centerId,
							centerName: row.nomeCc || "",
							accountId,
							accountName: row.nomeConta || row.conta || row.categoria || "",
							companyId,
							branchId,
							document: row.titulo || row.seqMov || "",
							type: row.tipo || "",
							notes: row.observacoes || "",
							value: realizedValue,
							budgeted: plannedValue,
						},
					],
					origemImportacao: true,
					observacoes:
						currentPartner?.observacoes ||
						"Criado automaticamente pela importacao de dados orcamentarios.",
				},
				partnersMap.size,
			);
			if (!currentPartner) {
				created.partners += 1;
				if (supplierNameKey) partnerIdsByName.set(supplierNameKey, partnerId);
			}
			partnersMap.set(partnerId, nextPartner);
			partnersTouchedThisImport.add(partnerId);
		}
	});

	const nextCenters = Array.from(centersMap.values()).map((center) => {
		const stats = statsByCenter.get(center.id);
		if (!stats) return center;
		const originalBudget = originalCenterBudgetFields.get(center.id) || {};
		const nextCenter = {
			...center,
			contasFinanceiras: [
				...new Set([...(center.contasFinanceiras || []), ...stats.accounts]),
			],
			companies: [
				...new Set([
					...(center.companies || center.empresas || []),
					...stats.companies,
				]),
			],
			branches: [
				...new Set([
					...(center.branches || center.filiais || []),
					...stats.branches,
				]),
			],
			realizadoMes: 0,
			orcadoImportado: currency(stats.annualBudget),
			realizadoImportado: currency(stats.totalRealized),
			saldoImportado: currency(stats.annualBudget - stats.totalRealized),
			linhasImportadas: Number(stats.totalRows || 0),
			realizedByCompanyBranch: Array.from(stats.realizedBreakdown.values()),
			atualizadoEm: nowIso(),
		};
		const monthlyBudget = currency(
			originalBudget.valorMensal ??
				originalBudget.orcamentoMensal ??
				(Object.hasOwn(originalBudget, "valorAnual")
					? currency(originalBudget.valorAnual) / 12
					: 0),
		);
		nextCenter.valorMensal = monthlyBudget;
		nextCenter.orcamentoMensal = monthlyBudget;
		nextCenter.valorAnual = currency(monthlyBudget * 12);
		nextCenter.orcamentoAnual = currency(monthlyBudget * 12);
		return nextCenter;
	});

	return {
		config: normalizeCostCentersConfig(
			{
				...existingConfig,
				clusters: [],
				accounts: Array.from(accountsMap.values()),
				centers: nextCenters,
				companies: Array.from(companiesMap.values()),
				branches: Array.from(branchesMap.values()),
				partners: Array.from(partnersMap.values()),
				matrix: Array.from(matrixMap.values()),
				settings: existingConfig.settings || DEFAULT_BUDGET_SETTINGS,
				workflow: existingConfig.workflow || {},
				cashSettings: existingConfig.cashSettings || {},
				versions: (existingConfig.versions || []).length
					? existingConfig.versions
					: undefined,
				allocationRules: existingConfig.allocationRules || [],
				lastImportReference: {
					year: referenceYear,
					month: referenceMonth,
					label: summary.referenceLabel,
				},
				lastImportSummary: summary,
				approvals: buildBudgetApprovalCandidates(
					{
						...existingConfig,
						centers: nextCenters,
						workflow: existingConfig.workflow || {},
						approvals: [],
						lastImportReference: {
							year: referenceYear,
							month: referenceMonth,
							label: summary.referenceLabel,
						},
						lastImportSummary: summary,
					},
					user,
				),
			},
			user,
		),
		created,
		referenceYear,
		referenceMonth,
	};
}

async function getBudgetCostCenters() {
	const doc = await documents.getDocument(BUDGET_COST_CENTERS_PATH);
	const config = doc?.data || {
		clusters: [],
		accounts: [],
		centers: [],
		partners: [],
		companies: [],
		branches: [],
		matrix: [],
		versions: [],
		allocationRules: [],
		workflow: {},
		cashSettings: {},
		updatedAt: "",
		updatedBy: "",
		updatedByName: "",
	};
	const normalizedConfig = normalizeCostCentersConfig(config, {});
	const rawAccounts = Array.isArray(config.accounts) ? config.accounts : [];
	const rawAccountsByCode = new Map(
		rawAccounts.map((account) => [
			budgetCodeKey(account.codigo || account.reduzida || account.id) ||
				account.id,
			account,
		]),
	);
	const planAccounts = DEFAULT_FINANCIAL_ACCOUNT_PLAN.map(
		financialAccountPlanToAccount,
	);
	const needsFinancialPlanRefresh =
		rawAccounts.length < planAccounts.length ||
		planAccounts.some((account) => {
			const rawAccount = rawAccountsByCode.get(
				budgetCodeKey(account.codigo || account.id) || account.id,
			);
			if (!rawAccount) return true;
			return (
				cleanText(rawAccount.grupo) !== cleanText(account.grupo) ||
				cleanText(rawAccount.dreGroup) !== cleanText(account.dreGroup) ||
				cleanText(rawAccount.tipoPlano) !== cleanText(account.tipoPlano)
			);
		});
	if (needsFinancialPlanRefresh) {
		await documents.upsertDocument({
			path: BUDGET_COST_CENTERS_PATH,
			collectionPath: "financeiro_config",
			documentId: "orcamento_centros_custo",
			parentPath: null,
			data: normalizedConfig,
		});
	}
	return {
		ok: true,
		config: normalizedConfig,
	};
}

async function saveBudgetCostCenters(payload = {}, user = {}) {
	const existingDoc = await documents.getDocument(BUDGET_COST_CENTERS_PATH);
	const existingConfig = existingDoc?.data || {};
	const nextPayload = {
		...(existingConfig || {}),
		...(payload || {}),
		settings: {
			...(existingConfig.settings || {}),
			...(payload.settings || {}),
		},
	};
	const config = normalizeCostCentersConfig(nextPayload, user);
	await documents.upsertDocument({
		path: BUDGET_COST_CENTERS_PATH,
		collectionPath: "financeiro_config",
		documentId: "orcamento_centros_custo",
		parentPath: null,
		data: config,
	});
	return { ok: true, config };
}

async function updateBudgetApproval(approvalId, payload = {}, user = {}) {
	const current = await getBudgetCostCenters();
	const config = normalizeCostCentersConfig(current.config || {}, user);
	const approvals = Array.isArray(config.approvals) ? config.approvals : [];
	const index = approvals.findIndex(
		(item) => item.id === cleanText(approvalId),
	);
	if (index < 0) throw httpError("Aprovação não encontrada.", 404);

	const currentApproval = normalizeBudgetApproval(approvals[index], index);
	const center = (config.centers || []).find(
		(item) => item.id === currentApproval.centerId,
	);
	if (!center)
		throw httpError("Centro de custo da aprovação não encontrado.", 404);

	const nextStatus = cleanText(
		payload.status || payload.action || currentApproval.status,
	).toLowerCase();
	const action = cleanText(payload.action || nextStatus);
	const manager = userCanManageBudget(user);
	const responsibleEmail = normalizeEmail(center.emailResponsavel);
	const userEmail = getUserEmail(user);
	const isResponsible = Boolean(
		userEmail && responsibleEmail && userEmail === responsibleEmail,
	);

	if (!manager && !isResponsible) {
		throw httpError("Você não tem permissão para alterar esta pendência.", 403);
	}
	if (!manager && nextStatus !== "pendente") {
		throw httpError(
			"Responsáveis só podem reenviar a pendência para análise.",
			403,
		);
	}

	const actorName = cleanText(
		user?.profile?.nome || user?.nome || user?.email || "Usuário",
	);
	const now = nowIso();
	const updatedApproval = normalizeBudgetApproval(
		{
			...currentApproval,
			status: nextStatus,
			note: cleanText(payload.note) || currentApproval.note,
			decidedBy: manager
				? cleanText(user?.uid || user?.id || user?.email)
				: currentApproval.decidedBy,
			decidedByName: manager ? actorName : currentApproval.decidedByName,
			decidedAt: manager ? now : currentApproval.decidedAt,
			updatedAt: now,
			history: [
				...(currentApproval.history || currentApproval.historico || []),
				{
					id: `${currentApproval.id}-hist-${Date.now()}`,
					action,
					status: nextStatus,
					note: cleanText(payload.note),
					actorId: cleanText(user?.uid || user?.id || user?.email),
					actorName,
					at: now,
				},
			],
		},
		index,
	);

	const nextApprovals = approvals.map((item, itemIndex) =>
		itemIndex === index ? updatedApproval : item,
	);
	const saved = await saveBudgetCostCenters(
		{ ...config, approvals: nextApprovals },
		user,
	);
	return { ok: true, approval: updatedApproval, config: saved.config };
}

function emptyBudgetData() {
	return {
		rows: [],
		fields: BUDGET_DATA_FIELDS,
		detectedFields: [],
		summary: summarizeBudgetDataRows([]),
		importInfo: null,
		appliedConfig: null,
	};
}

async function getBudgetData() {
	const doc = await documents.getDocument(BUDGET_DATA_PATH);
	return {
		ok: true,
		data: {
			...emptyBudgetData(),
			...(doc?.data || {}),
			fields: BUDGET_DATA_FIELDS,
		},
	};
}

async function saveBudgetData(payload = {}, user = {}) {
	const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
	const rows = rawRows
		.map(normalizeBudgetDataRow)
		.filter(
			(row) =>
				row.codConta ||
				row.nomeConta ||
				row.codCc ||
				row.nomeCc ||
				row.fornecedor ||
				row.empresa ||
				row.filial ||
				row.orcado ||
				row.realizado,
		);
	const existingBudget = await getBudgetCostCenters();
	const merged = mergeBudgetConfigFromRows(
		existingBudget.config || {},
		rows,
		user,
	);
	const importInfo = {
		fileName: cleanText(payload.fileName),
		sheetName: cleanText(payload.sheetName),
		importedAt: nowIso(),
		importedBy: user?.uid || "",
		importedByName: user?.profile?.nome || user?.nome || user?.email || "",
		totalRowsReceived: rawRows.length,
		totalRowsImported: rows.length,
	};
	merged.config.lastImportInfo = importInfo;
	await saveBudgetCostCenters(merged.config, user);

	const data = {
		rows,
		fields: BUDGET_DATA_FIELDS,
		detectedFields: Array.isArray(payload.detectedFields)
			? payload.detectedFields.map(cleanText).filter(Boolean)
			: [],
		summary: summarizeBudgetDataRows(rows),
		importInfo,
		appliedConfig: merged.created,
	};

	await documents.upsertDocument({
		path: BUDGET_DATA_PATH,
		collectionPath: "financeiro_config",
		documentId: "orcamento_dados",
		parentPath: null,
		data,
	});

	return { ok: true, data, config: merged.config };
}

async function clearBudgetData(user = {}) {
	const existingBudget = await getBudgetCostCenters();
	const cleanConfig = clearBudgetImportArtifacts(existingBudget.config || {});
	await saveBudgetCostCenters(cleanConfig, user);

	const data = {
		...emptyBudgetData(),
		importInfo: {
			fileName: "",
			sheetName: "",
			importedAt: nowIso(),
			importedBy: user?.uid || "",
			importedByName: user?.profile?.nome || user?.nome || user?.email || "",
			totalRowsReceived: 0,
			totalRowsImported: 0,
			cleared: true,
		},
	};
	await documents.upsertDocument({
		path: BUDGET_DATA_PATH,
		collectionPath: "financeiro_config",
		documentId: "orcamento_dados",
		parentPath: null,
		data,
	});
	return { ok: true, data };
}

module.exports = {
	clearBudgetData,
	clearSerasaReport,
	clearTariffsReport,
	getBudgetCostCenters,
	getBudgetData,
	getDashboard,
	getSerasaReport,
	getSheetsConfig,
	getTariffsReport,
	listImportLogs,
	runSheetsImport,
	saveBudgetData,
	saveBudgetCostCenters,
	saveSerasaData,
	saveSheetsConfig,
	saveTariffsReport,
	startWorker,
	stopWorker,
	testSheetSource,
	updateBudgetApproval,
};

module.exports.__testables = {
	mergeBudgetConfigFromRows,
};
