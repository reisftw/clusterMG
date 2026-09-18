const crypto = require("node:crypto");
const documents = require("./documents");
const emailService = require("./emailService");
const sempreIntegration = require("./sempreIntegration");

const CONFIG_PATH = "tecnicos_bolsa_auditoria_config/global";
const SNAPSHOT_COLLECTION = "tecnicos_bolsa_auditoria_snapshots";
const LOG_COLLECTION = "tecnicos_bolsa_auditoria_logs";
const JOB_COLLECTION = "tecnicos_bolsa_auditoria_jobs";
const MOVEMENT_COLLECTION = "tecnicos_bolsa_auditoria_movements";
const EMPRESAS_COLLECTION = "empresas_tecnicos";
const SEMPRE_STOCK_TIMEOUT_MS = 60 * 60 * 1000;
const CATEGORY_DEFINITIONS = Object.freeze([
	{
		id: "cabos",
		label: "Cabos",
		tipo: "metragem",
		limite: 1000,
		terms: [
			"cabo",
			"drop",
			"bobina",
			"fibra",
			"cordao",
			"cordão",
			"patch cord",
			"utp",
			"lan",
			"metro",
		],
	},
	{
		id: "cameras",
		label: "Câmeras",
		tipo: "unidade",
		limite: 20,
		terms: [
			"camera",
			"câmera",
			"camera de video",
			"câmera de vídeo",
			"video wi-fi",
			"vídeo wi-fi",
			"im5",
			"imxc",
			"tapo",
			"tc60",
		],
	},
	{
		id: "ont_onu",
		label: "ONT e ONU",
		tipo: "unidade",
		limite: 20,
		terms: ["ont", "onu", "gpon", "xpon", "epon"],
	},
	{
		id: "roteadores",
		label: "Roteadores",
		tipo: "unidade",
		limite: 20,
		terms: [
			"roteador",
			"router",
			"wifi",
			"wi-fi",
			"tplink",
			"tp-link",
			"archer",
		],
	},
	{
		id: "insumos",
		label: "Insumos",
		tipo: "unidade",
		limite: 100,
		terms: [
			"fita isolante",
			"esticador",
			"emenda mecanica",
			"emenda mecânica",
			"carrinho para bobina de drop",
			"fixa cabo",
			"fixa-cabo",
			"prego",
			"para cabo drop",
		],
	},
]);
const DEFAULT_CONFIG = Object.freeze({
	enabled: true,
	alertsEnabled: false,
	dailyRunTime: "10:00",
	timezone: "America/Sao_Paulo",
	thresholdTotalUnits: 100,
	thresholdTotalMeters: 1000,
	categoryThresholds: CATEGORY_DEFINITIONS.map(
		({ id, label, tipo, limite }) => ({ id, label, tipo, limite }),
	),
	itemThresholds: [],
	lastDailyRunDate: "",
});

function cleanText(value) {
	return String(value || "").trim();
}

function normalizeText(value) {
	return cleanText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

function normalizeId(value) {
	return (
		cleanText(value)
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^a-zA-Z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 120) || crypto.randomUUID()
	);
}

function nowIso() {
	return new Date().toISOString();
}

function randomId(prefix) {
	return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
}

function toNumber(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	const parsed = Number(
		String(value || "0")
			.replace(/\./g, "")
			.replace(",", ".")
			.replace(/[^\d.-]/g, ""),
	);
	return Number.isFinite(parsed) ? parsed : 0;
}

function getCategoryDefinition(id) {
	return (
		CATEGORY_DEFINITIONS.find((category) => category.id === id) ||
		CATEGORY_DEFINITIONS[CATEGORY_DEFINITIONS.length - 1]
	);
}

function categorizeStockItem(name, unit = "") {
	const key = normalizeText(`${name} ${unit}`);
	const cameraTerms = getCategoryDefinition("cameras").terms;
	if (cameraTerms.some((term) => key.includes(normalizeText(term)))) {
		return getCategoryDefinition("cameras");
	}
	const forcedInsumoTerms = getCategoryDefinition("insumos").terms;
	if (forcedInsumoTerms.some((term) => key.includes(normalizeText(term)))) {
		return getCategoryDefinition("insumos");
	}
	return (
		CATEGORY_DEFINITIONS.find((category) =>
			category.terms.some((term) => key.includes(normalizeText(term))),
		) || getCategoryDefinition("insumos")
	);
}

function normalizeCategoryThresholds(value) {
	const current = new Map(
		(Array.isArray(value) ? value : []).map((item) => [
			cleanText(item.id || item.categoria || item.category),
			item,
		]),
	);

	return CATEGORY_DEFINITIONS.map((category) => {
		const saved = current.get(category.id) || {};
		return {
			id: category.id,
			label: category.label,
			tipo: cleanText(saved.tipo || category.tipo),
			limite: Math.max(
				0,
				toNumber(saved.limite ?? saved.quantidade ?? category.limite),
			),
		};
	});
}

function getProfile(user = {}) {
	return user.profile || user || {};
}

function getUserRole(user = {}) {
	return normalizeText(user?.role || user?.profile?.role);
}

function getUserRegional(user = {}) {
	const profile = getProfile(user);
	return normalizeText(profile.regional || user.regional);
}

function getUserPermissions(user = {}) {
	if (Array.isArray(user.permissions)) return user.permissions;
	if (Array.isArray(user.profile?.permissions)) return user.profile.permissions;
	return [];
}

function hasUserPermission(user, permission) {
	const permissions = getUserPermissions(user);
	return permissions.includes("*") || permissions.includes(permission);
}

function getUserCompanyScope(user = {}) {
	const profile = getProfile(user);
	return {
		id: cleanText(
			profile.empresaId ||
				profile.empresa_id ||
				user.empresaId ||
				user.empresa_id,
		),
		nome: normalizeText(
			profile.empresaNome ||
				profile.empresa_nome ||
				user.empresaNome ||
				user.empresa_nome,
		),
	};
}

function canSeeCompany(user, empresa) {
	const role = getUserRole(user);
	if (role === "admin" || hasUserPermission(user, "*")) return true;

	const companyScope = getUserCompanyScope(user);
	if (
		companyScope.id ||
		companyScope.nome ||
		["lider_empresa", "agente_autorizado"].includes(role)
	) {
		return Boolean(
			(companyScope.id && companyScope.id === empresa.id) ||
				(companyScope.nome &&
					companyScope.nome === normalizeText(empresa.nome)),
		);
	}

	const regional = getUserRegional(user);
	if (
		regional ||
		["supervisor", "backoffice", "backoffice_retirada"].includes(role)
	) {
		return Boolean(regional && regional === normalizeText(empresa.regional));
	}

	return hasUserPermission(user, "tecnicos.auditoria_bolsa.manage");
}

function normalizeEmpresa(doc) {
	const data = doc.data || {};
	return {
		id: doc.documentId,
		nome: cleanText(data.nome || data.empresa || doc.documentId),
		regional: cleanText(data.regional),
		supervisor: data.supervisor || {},
		responsavel: data.responsavel || {},
		tecnicos: Array.isArray(data.tecnicos) ? data.tecnicos : [],
	};
}

function normalizeTecnico(empresa, tecnico) {
	const id =
		cleanText(tecnico.id) ||
		normalizeId(
			`${empresa.id}-${tecnico.nome}-${tecnico.emailHubsoft || tecnico.email}`,
		);
	return {
		id,
		snapshotId: normalizeId(`${empresa.id}-${id}`),
		empresaId: empresa.id,
		empresaNome: empresa.nome,
		regional: empresa.regional,
		supervisor: empresa.supervisor,
		nome: cleanText(tecnico.nome),
		telefone: cleanText(tecnico.telefone),
		cidade: cleanText(tecnico.cidade),
		emailHubsoft: cleanText(
			tecnico.emailHubsoft ||
				tecnico.email_hubsoft ||
				tecnico.emailHubSoft ||
				tecnico.hubsoftEmail ||
				tecnico.email,
		),
		status: cleanText(tecnico.status || "Ativo"),
	};
}

async function listAuthorizedTechnicians(user) {
	const docs = await documents.listAllDocuments(EMPRESAS_COLLECTION);
	const empresas = docs
		.map(normalizeEmpresa)
		.filter((empresa) => canSeeCompany(user, empresa));
	return empresas.map((empresa) => ({
		...empresa,
		tecnicos: empresa.tecnicos
			.map((tecnico) => normalizeTecnico(empresa, tecnico))
			.filter(
				(tecnico) =>
					tecnico.nome && normalizeText(tecnico.status) !== "inativo",
			),
	}));
}

async function readConfig({ sanitized = true } = {}) {
	const current = await documents.getDocument(CONFIG_PATH);
	const config = {
		...DEFAULT_CONFIG,
		...(current?.data || {}),
	};
	config.categoryThresholds = normalizeCategoryThresholds(
		config.categoryThresholds,
	);
	if (sanitized) {
		return { ok: true, config };
	}
	return config;
}

async function saveConfig(payload = {}, user = {}) {
	const current = await readConfig({ sanitized: false });
	const next = {
		...current,
		enabled:
			payload.enabled !== undefined
				? Boolean(payload.enabled)
				: current.enabled,
		alertsEnabled:
			payload.alertsEnabled !== undefined
				? Boolean(payload.alertsEnabled)
				: current.alertsEnabled,
		dailyRunTime: cleanText(
			payload.dailyRunTime ||
				current.dailyRunTime ||
				DEFAULT_CONFIG.dailyRunTime,
		).slice(0, 5),
		thresholdTotalUnits: Math.max(
			0,
			toNumber(payload.thresholdTotalUnits ?? current.thresholdTotalUnits),
		),
		thresholdTotalMeters: Math.max(
			0,
			toNumber(payload.thresholdTotalMeters ?? current.thresholdTotalMeters),
		),
		categoryThresholds: normalizeCategoryThresholds(
			payload.categoryThresholds ?? current.categoryThresholds,
		),
		lastDailyRunDate: cleanText(
			payload.lastDailyRunDate || current.lastDailyRunDate,
		),
		lastReportRefreshAt: cleanText(
			payload.lastReportRefreshAt || current.lastReportRefreshAt,
		),
		lastReportRefreshStart: cleanText(
			payload.lastReportRefreshStart || current.lastReportRefreshStart,
		),
		lastReportRefreshEnd: cleanText(
			payload.lastReportRefreshEnd || current.lastReportRefreshEnd,
		),
		lastReportRefreshTotal: Math.max(
			0,
			toNumber(
				payload.lastReportRefreshTotal ?? current.lastReportRefreshTotal,
			),
		),
		itemThresholds: Array.isArray(payload.itemThresholds)
			? payload.itemThresholds
					.map((item) => ({
						nome: cleanText(item.nome),
						quantidade: Math.max(0, toNumber(item.quantidade)),
						tipo: cleanText(item.tipo || "unidade"),
					}))
					.filter((item) => item.nome)
			: current.itemThresholds || [],
		updatedAt: nowIso(),
		updatedBy: user?.uid || "",
		updatedByName: getProfile(user).nome || user?.email || "",
	};

	await documents.upsertDocument({
		path: CONFIG_PATH,
		collectionPath: "tecnicos_bolsa_auditoria_config",
		documentId: "global",
		parentPath: null,
		data: next,
	});

	return { ok: true, config: next };
}

function extractArray(payload, keys = []) {
	if (Array.isArray(payload)) return payload;
	if (!payload || typeof payload !== "object") return [];

	const preferredKeys = [
		...keys,
		"data",
		"items",
		"rows",
		"results",
		"records",
		"registros",
		"usuarios",
		"estoques",
		"estoque",
		"materiais",
		"produtos",
	];

	for (const key of preferredKeys) {
		if (Array.isArray(payload?.[key])) return payload[key];
	}

	for (const key of preferredKeys) {
		const nested = extractArray(payload?.[key], preferredKeys);
		if (nested.length) return nested;
	}

	for (const value of Object.values(payload)) {
		const nested = extractArray(value, preferredKeys);
		if (nested.length) return nested;
	}

	return [];
}

function pickValue(item, keys) {
	for (const key of keys) {
		const value = key.split(".").reduce((acc, part) => acc?.[part], item);
		if (value !== undefined && value !== null && cleanText(value)) return value;
	}
	return "";
}

function flattenObject(value, prefix = "", output = {}) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		return output;
	for (const [key, entry] of Object.entries(value)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (entry && typeof entry === "object" && !Array.isArray(entry)) {
			flattenObject(entry, path, output);
		} else {
			output[path] = entry;
		}
	}
	return output;
}

function pickQuantityValue(item, preferredKeys) {
	const flattened = flattenObject(item);
	const preferred = preferredKeys
		.map((key, index) => [
			key,
			key.split(".").reduce((acc, part) => acc?.[part], item),
			index,
		])
		.filter(
			([, value]) => value !== undefined && value !== null && cleanText(value),
		);
	const flattenedCandidates = Object.entries(flattened)
		.map(([key, value]) => [key, value, preferredKeys.length])
		.filter(([key, value]) => {
			const normalizedKey = normalizeText(key);
			if (
				!/(disponivel|disponivel|saldo|quantidade|qtde|qtd|balance|amount|metragem|metros)/.test(
					normalizedKey,
				)
			)
				return false;
			return cleanText(value) && Number.isFinite(toNumber(value));
		})
		.sort(
			([leftKey, leftValue, leftIndex], [rightKey, rightValue, rightIndex]) => {
				const score = (key) => {
					const normalizedKey = normalizeText(key);
					if (normalizedKey.includes("disponivel")) return 0;
					if (normalizedKey.includes("saldo")) return 1;
					if (normalizedKey.includes("quantidade")) return 2;
					if (normalizedKey.includes("qtd") || normalizedKey.includes("qtde"))
						return 3;
					return 4;
				};
				const leftPositive = toNumber(leftValue) > 0 ? 0 : 1;
				const rightPositive = toNumber(rightValue) > 0 ? 0 : 1;
				return (
					leftPositive - rightPositive ||
					score(leftKey) - score(rightKey) ||
					leftIndex - rightIndex
				);
			},
		);
	const candidates = [...preferred, ...flattenedCandidates]
		.filter(([, value]) => Number.isFinite(toNumber(value)))
		.sort(
			([leftKey, leftValue, leftIndex], [rightKey, rightValue, rightIndex]) => {
				const score = (key) => {
					const normalizedKey = normalizeText(key);
					if (normalizedKey.includes("disponivel")) return 0;
					if (normalizedKey.includes("saldo")) return 1;
					if (normalizedKey.includes("quantidade")) return 2;
					if (normalizedKey.includes("qtd") || normalizedKey.includes("qtde"))
						return 3;
					return 4;
				};
				const leftPositive = toNumber(leftValue) > 0 ? 0 : 1;
				const rightPositive = toNumber(rightValue) > 0 ? 0 : 1;
				return (
					leftPositive - rightPositive ||
					score(leftKey) - score(rightKey) ||
					leftIndex - rightIndex
				);
			},
		);
	return candidates[0]?.[1] ?? "";
}

function pickDirectAvailableQuantity(item) {
	const directKeys = [
		"disponivel",
		"disponiveis",
		"disponível",
		"saldo_disponivel",
		"saldoDisponivel",
		"saldo_estoque",
		"saldoEstoque",
		"saldo_atual",
		"saldo",
	];
	for (const key of directKeys) {
		if (Object.hasOwn(item || {}, key)) {
			const value = toNumber(item[key]);
			if (Number.isFinite(value)) return value;
		}
	}
	return null;
}

async function findTecnicoSeniorId(email) {
	if (!email) {
		const error = new Error("E-mail Hubsoft do técnico não informado.");
		error.statusCode = 400;
		throw error;
	}
	const params = new URLSearchParams({
		page: "1",
		limit: "100",
		"filter.email": `$ilike:${email}`,
	});
	const payload = await sempreIntegration.requestSempreRaw(
		`/mesclar/usuario?${params.toString()}`,
		{
			timeoutMs: SEMPRE_STOCK_TIMEOUT_MS,
		},
	);
	const users = extractArray(payload, ["usuarios", "users", "data"]);
	const exact =
		users.find((item) => normalizeText(item.email) === normalizeText(email)) ||
		users[0];
	const seniorId = cleanText(
		pickValue(exact, [
			"senior_id",
			"id_senior",
			"seniorId",
			"codigo_senior",
			"id",
			"id_usuario",
			"usuario_id",
			"codigo",
			"value",
		]),
	);
	if (!seniorId) {
		const error = new Error(
			`Nenhum usuário encontrado na API Sempre para ${email}.`,
		);
		error.statusCode = 404;
		throw error;
	}
	return { seniorId, rawUser: exact || null };
}

function isMetricItem(name, unit) {
	const key = normalizeText(`${name} ${unit}`);
	return (
		/\b(m|mt|mts|metro|metros)\b/.test(key) ||
		key.includes("cabo") ||
		key.includes("drop") ||
		key.includes("fibra")
	);
}

function inferItemType(name, unit, category) {
	if (category?.tipo === "unidade") return "unidade";
	return isMetricItem(name, unit) ? "metragem" : "unidade";
}

function normalizeStockItem(item) {
	const name =
		cleanText(
			pickValue(item, [
				"produto.nome",
				"produto.descricao",
				"material.nome",
				"material.descricao",
				"item.nome",
				"item.descricao",
				"item.produto.nome",
				"item.produto.descricao",
				"insumo.nome",
				"insumo.descricao",
				"produto_descricao",
				"produto_nome",
				"nome_produto",
				"descricao_produto",
				"material_nome",
				"nome_material",
				"descricao_material",
				"descricao",
				"nome",
				"produto",
				"material",
			]),
		) || "Item sem nome";
	const rawUnit = cleanText(
		pickValue(item, [
			"unidade.sigla",
			"unidade.nome",
			"unidade_medida",
			"unidade",
			"tipo_unidade",
			"medida",
			"tipo_medida",
			"sigla_unidade",
		]),
	);
	const category = categorizeStockItem(name, rawUnit);
	const type = inferItemType(name, rawUnit, category);
	const unit = rawUnit || (type === "metragem" ? "m" : "un");
	const directQuantity = pickDirectAvailableQuantity(item);
	const quantity =
		directQuantity !== null
			? directQuantity
			: toNumber(
					pickQuantityValue(item, [
						"disponivel",
						"disponiveis",
						"disponível",
						"saldo_disponivel",
						"saldoDisponivel",
						"saldo_estoque",
						"saldoEstoque",
						"saldo_atual",
						"saldo",
						"quantidade",
						"quantidade_atual",
						"quantidade_disponivel",
						"quantidadeDisponivel",
						"quantidade_total",
						"quantidadeTotal",
						"qtde",
						"qtde_atual",
						"qtd_atual",
						"qtd",
						"total",
						"total_atual",
						"metragem",
						"metros",
						"amount",
						"balance",
					]),
				);
	return {
		key: normalizeId(`${category.id}-${name}-${unit}`),
		nome: name,
		unidade: unit,
		tipo: type,
		categoria: category.id,
		categoriaLabel: category.label,
		quantidade: quantity,
		raw: item,
	};
}

function summarizeCategories(items = []) {
	const grouped = new Map(
		CATEGORY_DEFINITIONS.map((category) => [
			category.id,
			{
				id: category.id,
				label: category.label,
				tipo: category.tipo,
				itens: 0,
				unidades: 0,
				metros: 0,
				consumoUnidades: 0,
				consumoMetros: 0,
			},
		]),
	);

	for (const item of items) {
		const category = getCategoryDefinition(item.categoria);
		const current = grouped.get(category.id) || grouped.get("insumos");
		current.itens += 1;
		if (item.tipo === "metragem") {
			current.metros += toNumber(item.quantidade);
			current.consumoMetros += toNumber(item.consumidoDesdeAnterior);
		} else {
			current.unidades += toNumber(item.quantidade);
			current.consumoUnidades += toNumber(item.consumidoDesdeAnterior);
		}
	}

	return [...grouped.values()];
}

function summarizeItems(items = []) {
	const grouped = new Map();
	for (const item of items.map(normalizeStockItem)) {
		const current = grouped.get(item.key) || {
			...item,
			quantidade: 0,
			raw: undefined,
		};
		current.quantidade += item.quantidade;
		grouped.set(item.key, current);
	}
	const normalized = [...grouped.values()]
		.filter((item) => item.quantidade > 0)
		.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
	const totals = normalized.reduce(
		(acc, item) => {
			if (item.tipo === "metragem") acc.metros += item.quantidade;
			else acc.unidades += item.quantidade;
			acc.itens += 1;
			return acc;
		},
		{ itens: 0, unidades: 0, metros: 0 },
	);
	return { items: normalized, totals };
}

function countRawPositiveItems(items = []) {
	return items.filter(
		(item) =>
			toNumber(
				pickDirectAvailableQuantity(item) ??
					pickQuantityValue(item, [
						"disponivel",
						"disponiveis",
						"disponível",
						"saldo_disponivel",
						"saldoDisponivel",
						"saldo_estoque",
						"saldoEstoque",
						"saldo_atual",
						"saldo",
						"quantidade",
						"quantidade_atual",
						"quantidade_disponivel",
						"quantidadeDisponivel",
					]),
			) > 0,
	).length;
}

function calculateDiff(previousItems = [], currentItems = []) {
	const previous = new Map(previousItems.map((item) => [item.key, item]));
	return currentItems.map((item) => {
		const oldQuantity = toNumber(previous.get(item.key)?.quantidade);
		const diff = item.quantidade - oldQuantity;
		return {
			...item,
			quantidadeAnterior: oldQuantity,
			diferenca: diff,
			consumidoDesdeAnterior: diff < 0 ? Math.abs(diff) : 0,
			reposicionadoDesdeAnterior: diff > 0 ? diff : 0,
		};
	});
}

function parseDateBoundary(value, endOfDay = false) {
	const raw = cleanText(value);
	if (!raw) return null;
	const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	const date = match
		? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
		: new Date(raw);
	if (Number.isNaN(date.getTime())) return null;
	date.setHours(
		endOfDay ? 23 : 0,
		endOfDay ? 59 : 0,
		endOfDay ? 59 : 0,
		endOfDay ? 999 : 0,
	);
	return date;
}

function getPeriodRange(periodo = "mensal", dataInicio = "", dataFim = "") {
	const now = new Date();
	const start = new Date(now);
	const end = new Date(now);
	const customStart = parseDateBoundary(dataInicio, false);
	const customEnd = parseDateBoundary(dataFim, true);

	if (customStart || customEnd) {
		const resolvedStart =
			customStart || new Date(now.getFullYear(), now.getMonth(), 1);
		const resolvedEnd = customEnd || new Date(now);
		if (resolvedEnd < resolvedStart) {
			return { start: resolvedEnd, end: resolvedStart };
		}
		return { start: resolvedStart, end: resolvedEnd };
	}

	if (periodo === "diario") {
		start.setHours(0, 0, 0, 0);
		end.setHours(23, 59, 59, 999);
	} else if (periodo === "semanal") {
		start.setDate(start.getDate() - 6);
		start.setHours(0, 0, 0, 0);
		end.setHours(23, 59, 59, 999);
	} else if (periodo === "anual") {
		start.setMonth(0, 1);
		start.setHours(0, 0, 0, 0);
		end.setMonth(11, 31);
		end.setHours(23, 59, 59, 999);
	} else {
		start.setDate(1);
		start.setHours(0, 0, 0, 0);
		end.setMonth(end.getMonth() + 1, 0);
		end.setHours(23, 59, 59, 999);
	}
	return { start, end };
}

function getReportFiltersFromQuery(query = {}) {
	return {
		periodo: cleanText(query.periodo || "mensal"),
		dataInicio: cleanText(query.dataInicio || query.startDate || query.inicio),
		dataFim: cleanText(query.dataFim || query.endDate || query.fim),
		regional: normalizeText(query.regional),
		empresaId: cleanText(query.empresaId),
		tecnicoId: cleanText(query.tecnicoId),
	};
}

function addGroupedValue(
	map,
	key,
	base,
	item,
	quantityField = "consumidoDesdeAnterior",
) {
	const current = map.get(key) || { ...base, itens: 0, unidades: 0, metros: 0 };
	current.itens += 1;
	if (item.tipo === "metragem") current.metros += toNumber(item[quantityField]);
	else current.unidades += toNumber(item[quantityField]);
	map.set(key, current);
	return current;
}

function addClientConsumption(row = {}, item = {}) {
	const clienteNome = cleanText(
		item.clienteNome || item.destino || "Cliente não informado",
	);
	const clienteCodigo = cleanText(
		item.clienteCodigo || item.codigoCliente || "",
	);
	const key = normalizeId(clienteCodigo || clienteNome);
	const clientes = Array.isArray(row.clientes) ? row.clientes : [];
	const current = clientes.find((cliente) => cliente.key === key) || {
		key,
		nome: clienteNome,
		codigo: clienteCodigo,
		itens: 0,
		unidades: 0,
		metros: 0,
		movimentacoes: [],
	};
	current.itens += 1;
	if (item.tipo === "metragem") current.metros += toNumber(item.quantidade);
	else current.unidades += toNumber(item.quantidade);
	current.movimentacoes = [
		...(current.movimentacoes || []),
		{
			id: item.id,
			data: item.data,
			nome: item.nome,
			quantidade: item.quantidade,
			unidade: item.unidade,
			tipo: item.tipo,
			numero: item.numero,
		},
	].slice(0, 30);
	if (!clientes.some((cliente) => cliente.key === key)) clientes.push(current);
	row.clientes = clientes.sort(
		(a, b) => b.unidades + b.metros - (a.unidades + a.metros),
	);
}

function createDailyHistoryRow(date) {
	return {
		date,
		movimentacoes: 0,
		consumos: 0,
		unidades: 0,
		metros: 0,
		estimadoUnidades: 0,
		estimadoMetros: 0,
		bate: true,
		movimentos: [],
		consumosItens: [],
	};
}

function parseObservation(value) {
	const text = cleanText(value).replace(/\s*\n\s*/g, " | ");
	const pick = (label) => {
		const regex = new RegExp(`${label}:\\s*([^|]+)`, "i");
		return cleanText(text.match(regex)?.[1]);
	};
	return {
		raw: text,
		operacao: pick("Operacao"),
		origem: pick("Origem"),
		destino: pick("Destino"),
		usuarioCadastro: pick("Usuario do cadastrado"),
		tipo: pick("tipo"),
		observacao: pick("observa[cç][aã]o"),
		movimentoEstoqueId: cleanText(
			text.match(/movimento_estoque_id:\s*([^|\s]+)/i)?.[1],
		),
	};
}

function getNoteDate(note = {}) {
	return note.emitido_em || note.atualizado_em || note.criado_em || "";
}

function getBrazilDateKey(value) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const formatter = new Intl.DateTimeFormat("en-CA", {
		timeZone: DEFAULT_CONFIG.timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	return formatter.format(date);
}

function addCalendarDays(date, days) {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

function buildPeriodDays(start, end) {
	const days = [];
	const startDate = new Date(start);
	startDate.setHours(12, 0, 0, 0);
	const endDate = new Date(end);
	endDate.setHours(12, 0, 0, 0);
	for (
		let current = startDate;
		current <= endDate;
		current = addCalendarDays(current, 1)
	) {
		days.push(getBrazilDateKey(current));
	}
	return days.filter(Boolean);
}

function classifyMovement(note = {}, parsed = {}) {
	const movimento = normalizeText(
		note.tipo_operacao?.tipo_movimento ||
			note.tipo_operacao?.descricao ||
			parsed.operacao,
	);
	const operacao = normalizeText(parsed.operacao);
	const origem = normalizeText(parsed.origem);
	const destino = normalizeText(parsed.destino);
	const tipo = normalizeText(parsed.tipo);

	if (
		(movimento.includes("comodato") || operacao.includes("comodato")) &&
		origem.includes("tecnico") &&
		destino.includes("cliente")
	) {
		return "consumo";
	}
	if (
		destino.includes("tecnico") &&
		(origem.includes("estoque") || origem.includes("local de estoque"))
	) {
		return "entrada_bolsa";
	}
	if (movimento.includes("transferencia") || operacao.includes("usuario")) {
		return "transferencia";
	}
	if (
		movimento.includes("devolucao") ||
		operacao.includes("retirada") ||
		operacao.includes("retorno ao estoque")
	) {
		return tipo.includes("entrada") || destino.includes("estoque")
			? "devolucao_estoque"
			: "devolucao";
	}
	return tipo || movimento || "movimentacao";
}

function movementLabel(type) {
	const labels = {
		consumo: "Consumo no cliente",
		entrada_bolsa: "Entrada na bolsa",
		transferencia: "Transferência",
		devolucao: "Devolução",
		devolucao_estoque: "Devolução ao estoque",
		movimentacao: "Movimentação",
	};
	return labels[type] || type;
}

function normalizeMovementItem(
	note = {},
	item = {},
	parsed = {},
	tecnico = null,
) {
	const productName = cleanText(
		item.produto?.descricao ||
			item.produto_descricao ||
			item.descricao ||
			item.nome ||
			"Item sem nome",
	);
	const unit = cleanText(
		item.produto?.unidade_medida?.sigla ||
			item.unidade_medida?.sigla ||
			item.unidade ||
			"",
	);
	const category = categorizeStockItem(productName, unit);
	const type = inferItemType(productName, unit, category);
	const movementType = classifyMovement(note, parsed);
	const quantity = toNumber(item.quantidade);
	const parceiro = note.parceiro || {};
	const recebedorEmail = cleanText(note.usuario_recebedor?.email);
	const cadastroEmail = cleanText(note.usuario_cadastro?.email);
	const stableId = normalizeId(
		[
			note.id || note.numero || parsed.movimentoEstoqueId || getNoteDate(note),
			item.id || item.produto_id || productName,
			cleanText(item.serie),
			tecnico?.id || recebedorEmail || cadastroEmail,
		]
			.filter(Boolean)
			.join("-"),
	);

	return {
		id: stableId,
		notaId: note.id || null,
		numero: cleanText(note.numero),
		movimentoEstoqueId: cleanText(
			note.externo_id || parsed.movimentoEstoqueId,
		).replace(/^movimento_estoque_id=/, ""),
		status: cleanText(note.status),
		situacao: cleanText(note.situacao),
		data: getNoteDate(note),
		tipo: type,
		tipoMovimentacao: movementType,
		tipoMovimentacaoLabel: movementLabel(movementType),
		tipoOperacao: cleanText(note.tipo_operacao?.descricao || parsed.operacao),
		quantidade: quantity,
		nome: productName,
		unidade: unit || (type === "metragem" ? "m" : "un"),
		categoria: category.id,
		categoriaLabel: category.label,
		serie: cleanText(item.serie),
		valorUnitario: toNumber(item.valor_unitario),
		valorTotal: toNumber(item.valor_total),
		tecnicoId: tecnico?.id || "",
		tecnicoNome:
			tecnico?.nome || cleanText(parsed.origem).replace(/^técnico:\s*/i, ""),
		tecnicoEmail: tecnico?.emailHubsoft || recebedorEmail,
		empresaId: tecnico?.empresaId || "",
		empresaNome:
			tecnico?.empresaNome || cleanText(note.empresa?.nome_razaosocial),
		regional: tecnico?.regional || "",
		usuarioRecebedorEmail: recebedorEmail,
		usuarioCadastroEmail: cadastroEmail,
		clienteNome: cleanText(parceiro.nome_razaosocial || parsed.destino).replace(
			/^cliente:\s*/i,
			"",
		),
		clienteCodigo: cleanText(parceiro.externo_id),
		origem: parsed.origem,
		destino: parsed.destino,
		observacao: parsed.raw,
	};
}

function buildNotesQueryParams({
	page,
	limit,
	start,
	end,
	supportsDateFilter,
}) {
	const params = new URLSearchParams({
		page: String(page),
		limit: String(limit),
	});
	if (supportsDateFilter) {
		params.append("filter.emitido_em", `$gte:${start.toISOString()}`);
		params.append("filter.emitido_em", `$lte:${end.toISOString()}`);
	}
	params.append("filter.status", "$in:transmitido,cancelado,rejeitado");
	return params;
}

async function fetchNotesPage({ page, limit, start, end, supportsDateFilter }) {
	const params = buildNotesQueryParams({
		page,
		limit,
		start,
		end,
		supportsDateFilter,
	});
	return sempreIntegration.requestSempreRaw(`/nota?${params.toString()}`, {
		timeoutMs: SEMPRE_STOCK_TIMEOUT_MS,
	});
}

function isNoteInsidePeriod(note, start, end) {
	const noteDate = new Date(getNoteDate(note));
	return (
		!Number.isNaN(noteDate.getTime()) && noteDate >= start && noteDate <= end
	);
}

function findMovementTecnico(note, tecnicoByEmail) {
	const email = normalizeText(
		note.usuario_recebedor?.email || note.usuario_cadastro?.email,
	);
	return tecnicoByEmail.get(email) || null;
}

function extractNoteMovements(note, tecnicoByEmail, start, end) {
	if (!isNoteInsidePeriod(note, start, end)) return [];
	const tecnico = findMovementTecnico(note, tecnicoByEmail);
	if (!tecnico) return [];
	const parsed = parseObservation(note.observacao);
	return (Array.isArray(note.itens) ? note.itens : [])
		.map((item) => normalizeMovementItem(note, item, parsed, tecnico))
		.filter((movement) => movement.quantidade > 0);
}

async function fetchSempreNotesMovements({ start, end, tecnicoByEmail }) {
	const movements = [];
	const limit = 100;
	const maxPages = 80;
	let page = 1;
	let supportsDateFilter = true;

	while (page <= maxPages) {
		let payload = null;
		try {
			payload = await fetchNotesPage({
				page,
				limit,
				start,
				end,
				supportsDateFilter,
			});
		} catch (error) {
			if (!supportsDateFilter) throw error;
			supportsDateFilter = false;
			page = 1;
			continue;
		}
		const notes = extractArray(payload, ["data"]);
		for (const note of notes) {
			movements.push(...extractNoteMovements(note, tecnicoByEmail, start, end));
		}

		const totalPages = Number(payload?.meta?.totalPages || 1);
		if (!notes.length || page >= totalPages) break;
		page += 1;
	}

	return movements.sort((a, b) =>
		String(b.data || "").localeCompare(String(a.data || "")),
	);
}

async function saveMovementCache(
	movements = [],
	{ user = {}, start, end } = {},
) {
	const cachedAt = nowIso();
	let saved = 0;
	for (const movement of movements) {
		const documentId = normalizeId(
			movement.id ||
				`${movement.numero}-${movement.nome}-${movement.tecnicoEmail}-${movement.data}`,
		);
		await documents.upsertDocument({
			path: `${MOVEMENT_COLLECTION}/${documentId}`,
			collectionPath: MOVEMENT_COLLECTION,
			documentId,
			parentPath: null,
			data: {
				...movement,
				id: documentId,
				cachedAt,
				cacheStart: start ? start.toISOString() : "",
				cacheEnd: end ? end.toISOString() : "",
			},
		});
		saved += 1;
	}
	await appendLog({
		type: "movement_cache",
		status: "ok",
		total: saved,
		periodoInicio: start ? start.toISOString() : "",
		periodoFim: end ? end.toISOString() : "",
		userName: getProfile(user).nome || user?.email || "Rotina",
	});
	return { saved, cachedAt };
}

async function refreshMovementCache({ user = {}, start, end } = {}) {
	const empresas = await listAuthorizedTechnicians(user);
	const allowedTecnicos = empresas.flatMap((empresa) => empresa.tecnicos);
	const tecnicoByEmail = new Map(
		allowedTecnicos
			.filter((tecnico) => tecnico.emailHubsoft)
			.map((tecnico) => [normalizeText(tecnico.emailHubsoft), tecnico]),
	);
	const movements = await fetchSempreNotesMovements({
		start,
		end,
		tecnicoByEmail,
	});
	const cache = await saveMovementCache(movements, { user, start, end });
	const currentConfig = await readConfig({ sanitized: false });
	await saveConfig(
		{
			...currentConfig,
			lastReportRefreshAt: cache.cachedAt,
			lastReportRefreshStart: start ? start.toISOString() : "",
			lastReportRefreshEnd: end ? end.toISOString() : "",
			lastReportRefreshTotal: movements.length,
		},
		user,
	);
	return { ok: true, movements: movements.length, ...cache };
}

async function refreshReportMovements({ user = {}, query = {} } = {}) {
	const filters = getReportFiltersFromQuery(query);
	const { start, end } = getPeriodRange(
		filters.periodo,
		filters.dataInicio,
		filters.dataFim,
	);
	const result = await refreshMovementCache({ user, start, end });
	return {
		...result,
		filters,
		periodo: { inicio: start.toISOString(), fim: end.toISOString() },
	};
}

async function runReportRefreshJob(jobId, user = {}, query = {}) {
	await updateRefreshJob(jobId, {
		status: "running",
		stage: "Consultando movimentações do Playground",
		percent: 10,
		startedAt: nowIso(),
		error: "",
	});

	try {
		const filters = getReportFiltersFromQuery(query);
		const { start, end } = getPeriodRange(
			filters.periodo,
			filters.dataInicio,
			filters.dataFim,
		);
		await updateRefreshJob(jobId, {
			stage: "Lendo notas e movimentações",
			percent: 30,
			filters,
			periodo: { inicio: start.toISOString(), fim: end.toISOString() },
		});
		const result = await refreshMovementCache({ user, start, end });
		await updateRefreshJob(jobId, {
			status: "completed",
			stage: "Movimentações salvas no banco",
			percent: 100,
			processed: result.movements || result.saved || 0,
			total: result.movements || result.saved || 0,
			success: result.movements || result.saved || 0,
			errors: 0,
			result: {
				...result,
				filters,
				periodo: { inicio: start.toISOString(), fim: end.toISOString() },
			},
			finishedAt: nowIso(),
		});
		return result;
	} catch (error) {
		await updateRefreshJob(jobId, {
			status: "failed",
			stage: "Falha ao atualizar movimentações",
			percent: 100,
			error:
				error?.message || "Falha ao atualizar movimentações do Playground.",
			finishedAt: nowIso(),
		});
		throw error;
	}
}

async function startReportRefreshJob(user = {}, query = {}) {
	const now = nowIso();
	const job = {
		id: randomId("tecnicos_bolsa_relatorio"),
		type: "tecnicos_bolsa_auditoria_report_refresh",
		status: "queued",
		stage: "Aguardando processamento",
		percent: 0,
		processed: 0,
		total: 0,
		current: null,
		result: null,
		error: "",
		filters: getReportFiltersFromQuery(query),
		createdAt: now,
		updatedAt: now,
		startedAt: null,
		finishedAt: null,
		createdBy: user?.uid || null,
		createdByName: getProfile(user).nome || user?.email || "",
	};
	await saveRefreshJob(job);

	setImmediate(() => {
		runReportRefreshJob(job.id, user, query).catch((error) => {
			console.error(
				`[tecnicosBolsaAuditoria] Falha no job de relatório ${job.id}:`,
				error,
			);
		});
	});

	return {
		accepted: true,
		jobId: job.id,
		status: job.status,
		stage: job.stage,
		percent: job.percent,
	};
}

async function loadCachedMovements({ start, end, tecnicoByEmail }) {
	const docs = await documents.listAllDocuments(MOVEMENT_COLLECTION);
	return docs
		.map((doc) => ({ id: doc.documentId, ...(doc.data || {}) }))
		.filter((item) => {
			const date = new Date(item.data || item.cachedAt || 0);
			return !Number.isNaN(date.getTime()) && date >= start && date <= end;
		})
		.filter((item) => {
			const email = normalizeText(
				item.tecnicoEmail ||
					item.usuarioRecebedorEmail ||
					item.usuarioCadastroEmail,
			);
			return !email || tecnicoByEmail.has(email);
		})
		.sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
}

function createHistoryDayMap(start, end) {
	return new Map(
		buildPeriodDays(start, end).map((date) => [
			date,
			createDailyHistoryRow(date),
		]),
	);
}

function getHistoryDay(byDay, date) {
	const current = byDay.get(date) || createDailyHistoryRow(date);
	byDay.set(date, current);
	return current;
}

function registerDailyMovement(byDay, movement) {
	const date = getBrazilDateKey(movement.data);
	if (!date) return;
	const day = getHistoryDay(byDay, date);
	day.movimentacoes += 1;
	day.movimentos.push(movement);
}

function registerConsumptionSummary({ item, byCategory, byItem, byDay }) {
	const categoryRow = addGroupedValue(
		byCategory,
		item.categoria || "insumos",
		{
			id: item.categoria || "insumos",
			nome: item.categoriaLabel || getCategoryDefinition(item.categoria).label,
		},
		item,
		"quantidade",
	);
	addClientConsumption(categoryRow, item);
	addGroupedValue(
		byItem,
		item.nome || item.id,
		{
			id: item.nome || item.id,
			nome: item.nome || "Item",
			categoria: item.categoriaLabel || "",
			unidade: item.unidade || "",
		},
		item,
		"quantidade",
	);

	const date = getBrazilDateKey(item.data);
	if (!date) return;
	const day = byDay.get(date);
	if (!day) return;
	day.consumos += 1;
	if (item.tipo === "metragem") day.metros += toNumber(item.quantidade);
	else day.unidades += toNumber(item.quantidade);
	day.consumosItens.push(item);
}

function applyEstimatedDailyTotals(byDay, estimatedByDay) {
	for (const [date, estimated] of estimatedByDay.entries()) {
		const day = byDay.get(date);
		if (!day) continue;
		day.estimadoUnidades = toNumber(estimated.unidades);
		day.estimadoMetros = toNumber(estimated.metros);
	}
}

function prepareHistoryDays(byDay) {
	return [...byDay.values()]
		.map((day) => ({
			...day,
			bate:
				Math.abs(toNumber(day.unidades) - toNumber(day.estimadoUnidades)) <
					0.001 &&
				Math.abs(toNumber(day.metros) - toNumber(day.estimadoMetros)) < 0.001,
			movimentos: day.movimentos.slice(0, 80),
			consumosItens: day.consumosItens.slice(0, 80),
		}))
		.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function summarizeMovementHistory(
	movements = [],
	{ start, end, estimatedByDay = new Map() } = {},
) {
	const consumptions = movements.filter(
		(item) => item.tipoMovimentacao === "consumo",
	);
	const byCategory = new Map();
	const byItem = new Map();
	const byDay = createHistoryDayMap(start, end);

	for (const movement of movements) {
		registerDailyMovement(byDay, movement);
	}

	for (const item of consumptions) {
		registerConsumptionSummary({ item, byCategory, byItem, byDay });
	}

	const sortRows = (rows) =>
		rows.sort((a, b) => b.unidades + b.metros - (a.unidades + a.metros));
	const items = sortRows([...byItem.values()]);
	applyEstimatedDailyTotals(byDay, estimatedByDay);
	const dias = prepareHistoryDays(byDay);

	return {
		periodoInicio: start ? start.toISOString() : "",
		periodoFim: end ? end.toISOString() : "",
		movimentacoes: movements.length,
		consumos: consumptions.length,
		unidades: items.reduce((acc, item) => acc + toNumber(item.unidades), 0),
		metros: items.reduce((acc, item) => acc + toNumber(item.metros), 0),
		categorias: sortRows([...byCategory.values()]),
		itens: items,
		dias,
		ultimasMovimentacoes: movements.slice(0, 80),
		ultimosConsumos: consumptions.slice(0, 80),
	};
}

async function fetchTecnicoStock(tecnico) {
	const { seniorId, rawUser } = await findTecnicoSeniorId(tecnico.emailHubsoft);
	const payload = await sempreIntegration.requestSempreRaw(
		`/v2/mesclar/estoque?tipo_vinculo=tecnico&vinculo_id=${encodeURIComponent(seniorId)}`,
		{
			timeoutMs: SEMPRE_STOCK_TIMEOUT_MS,
		},
	);
	const stockItems = extractArray(payload, [
		"estoques",
		"estoque",
		"materiais",
		"produtos",
		"items",
		"data",
	]);
	const { items, totals } = summarizeItems(stockItems);
	return {
		seniorId,
		rawUser,
		items,
		totals,
		diagnostics: {
			rawItemCount: stockItems.length,
			parsedItemCount: items.length,
			rawPositiveItemCount: countRawPositiveItems(stockItems),
			sampleKeys: Object.keys(stockItems[0] || {}).slice(0, 20),
			sampleItem: stockItems[0] || null,
			ignoredZeroItems: Math.max(0, stockItems.length - items.length),
		},
		rawStock: payload,
	};
}

async function appendLog(data = {}) {
	const id = `log_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
	const payload = {
		id,
		createdAt: nowIso(),
		...data,
	};
	await documents.upsertDocument({
		path: `${LOG_COLLECTION}/${id}`,
		collectionPath: LOG_COLLECTION,
		documentId: id,
		parentPath: null,
		data: payload,
	});
	return payload;
}

function buildAlerts(snapshot, config) {
	const alerts = [];
	const categories = summarizeCategories(snapshot.items || []);
	for (const threshold of normalizeCategoryThresholds(
		config.categoryThresholds,
	)) {
		const category = categories.find((item) => item.id === threshold.id);
		const amount =
			threshold.tipo === "metragem"
				? toNumber(category?.metros)
				: toNumber(category?.unidades);
		if (threshold.limite && amount > threshold.limite) {
			const suffix = threshold.tipo === "metragem" ? "m" : "un";
			alerts.push(
				`${threshold.label} acima do limite (${amount} ${suffix} > ${threshold.limite} ${suffix}).`,
			);
		}
	}
	for (const threshold of config.itemThresholds || []) {
		const item = snapshot.items.find((current) =>
			normalizeText(current.nome).includes(normalizeText(threshold.nome)),
		);
		if (item && item.quantidade > threshold.quantidade) {
			alerts.push(
				`${item.nome} acima do limite (${item.quantidade} ${item.unidade} > ${threshold.quantidade}).`,
			);
		}
	}
	return alerts;
}

async function sendAlertIfNeeded(snapshot, alerts, config) {
	if (!alerts.length) return { sent: false, reason: "Sem alerta." };
	const to = cleanText(snapshot.supervisor?.email);
	if (!config.alertsEnabled)
		return { sent: false, reason: "Alertas desativados." };
	if (!to) return { sent: false, reason: "Supervisor sem e-mail cadastrado." };

	await emailService.sendMail({
		to,
		subject: `Alerta de bolsa técnica - ${snapshot.tecnicoNome}`,
		text: `O técnico ${snapshot.tecnicoNome} está com alerta de material em bolsa:\n\n${alerts.join("\n")}`,
		html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h2>Alerta de bolsa técnica</h2>
        <p><strong>Técnico:</strong> ${snapshot.tecnicoNome}</p>
        <p><strong>Empresa:</strong> ${snapshot.empresaNome}</p>
        <p><strong>Regional:</strong> ${snapshot.regional || "-"}</p>
        <ul>${alerts.map((alert) => `<li>${alert}</li>`).join("")}</ul>
      </div>
    `,
		meta: {
			type: "tecnicos_bolsa_alerta",
			tecnicoId: snapshot.tecnicoId,
			empresaId: snapshot.empresaId,
		},
	});
	return { sent: true, reason: "Enviado." };
}

async function refreshTecnico(tecnico, user = {}) {
	const previous = await documents
		.getDocument(`${SNAPSHOT_COLLECTION}/${tecnico.snapshotId}`)
		.catch(() => null);
	const config = await readConfig({ sanitized: false });
	const updatedAt = nowIso();

	try {
		const result = await fetchTecnicoStock(tecnico);
		const itemsWithDiff = calculateDiff(
			previous?.data?.items || [],
			result.items,
		);
		const snapshot = {
			id: tecnico.snapshotId,
			tecnicoId: tecnico.id,
			tecnicoNome: tecnico.nome,
			telefone: tecnico.telefone,
			cidade: tecnico.cidade,
			emailHubsoft: tecnico.emailHubsoft,
			seniorId: result.seniorId,
			empresaId: tecnico.empresaId,
			empresaNome: tecnico.empresaNome,
			regional: tecnico.regional,
			supervisor: tecnico.supervisor || {},
			items: itemsWithDiff,
			totals: result.totals,
			categoryTotals: summarizeCategories(itemsWithDiff),
			diagnostics: result.diagnostics,
			lastUpdatedAt: updatedAt,
			lastError: "",
			updatedBy: user?.uid || "",
			updatedByName: getProfile(user).nome || user?.email || "Rotina",
		};
		const alerts = buildAlerts(snapshot, config);
		const delivery = await sendAlertIfNeeded(snapshot, alerts, config).catch(
			(error) => ({
				sent: false,
				reason: error?.message || "Falha ao enviar alerta.",
			}),
		);
		snapshot.alerts = alerts;
		snapshot.lastAlert = alerts.length ? { ...delivery, at: updatedAt } : null;

		await documents.upsertDocument({
			path: `${SNAPSHOT_COLLECTION}/${tecnico.snapshotId}`,
			collectionPath: SNAPSHOT_COLLECTION,
			documentId: tecnico.snapshotId,
			parentPath: null,
			data: snapshot,
		});
		await appendLog({
			type: "refresh",
			status: "ok",
			tecnicoId: tecnico.id,
			tecnicoNome: tecnico.nome,
			empresaId: tecnico.empresaId,
			empresaNome: tecnico.empresaNome,
			regional: tecnico.regional,
			alerts,
			alertSent: Boolean(delivery.sent),
			alertReason: delivery.reason,
			totals: result.totals,
			categoryTotals: snapshot.categoryTotals,
			items: itemsWithDiff.map(
				({
					key,
					nome,
					unidade,
					tipo,
					categoria,
					categoriaLabel,
					quantidade,
					quantidadeAnterior,
					diferenca,
					consumidoDesdeAnterior,
					reposicionadoDesdeAnterior,
				}) => ({
					key,
					nome,
					unidade,
					tipo,
					categoria,
					categoriaLabel,
					quantidade,
					quantidadeAnterior,
					diferenca,
					consumidoDesdeAnterior,
					reposicionadoDesdeAnterior,
				}),
			),
			diagnostics: result.diagnostics,
			userName: snapshot.updatedByName,
		});
		return snapshot;
	} catch (error) {
		const snapshot = {
			...(previous?.data || {}),
			id: tecnico.snapshotId,
			tecnicoId: tecnico.id,
			tecnicoNome: tecnico.nome,
			emailHubsoft: tecnico.emailHubsoft,
			empresaId: tecnico.empresaId,
			empresaNome: tecnico.empresaNome,
			regional: tecnico.regional,
			supervisor: tecnico.supervisor || {},
			lastUpdatedAt: previous?.data?.lastUpdatedAt || "",
			lastError: error?.message || "Falha ao consultar bolsa do técnico.",
			lastErrorAt: updatedAt,
		};
		await documents.upsertDocument({
			path: `${SNAPSHOT_COLLECTION}/${tecnico.snapshotId}`,
			collectionPath: SNAPSHOT_COLLECTION,
			documentId: tecnico.snapshotId,
			parentPath: null,
			data: snapshot,
		});
		await appendLog({
			type: "refresh",
			status: "erro",
			tecnicoId: tecnico.id,
			tecnicoNome: tecnico.nome,
			empresaId: tecnico.empresaId,
			empresaNome: tecnico.empresaNome,
			regional: tecnico.regional,
			error: snapshot.lastError,
			userName: getProfile(user).nome || user?.email || "Rotina",
		});
		return snapshot;
	}
}

async function getSnapshotMap() {
	const docs = await documents.listAllDocuments(SNAPSHOT_COLLECTION);
	return new Map(
		docs.map((doc) => [
			doc.documentId,
			{ id: doc.documentId, ...(doc.data || {}) },
		]),
	);
}

function buildTecnicoByEmail(empresas = []) {
	const tecnicos = empresas.flatMap((empresa) => empresa.tecnicos);
	return new Map(
		tecnicos
			.filter((tecnico) => tecnico.emailHubsoft)
			.map((tecnico) => [normalizeText(tecnico.emailHubsoft), tecnico]),
	);
}

function groupMovementsBySnapshotId(
	movements = [],
	tecnicoByEmail = new Map(),
) {
	const grouped = new Map();
	for (const movement of movements) {
		const email = normalizeText(
			movement.tecnicoEmail ||
				movement.usuarioRecebedorEmail ||
				movement.usuarioCadastroEmail,
		);
		const tecnico = tecnicoByEmail.get(email);
		if (!tecnico) continue;
		const current = grouped.get(tecnico.snapshotId) || [];
		current.push(movement);
		grouped.set(tecnico.snapshotId, current);
	}
	return grouped;
}

async function loadSuccessfulRefreshLogs(start, end) {
	const logs = await documents.listAllDocuments(LOG_COLLECTION).catch(() => []);
	return logs
		.map((doc) => ({ id: doc.documentId, ...(doc.data || {}) }))
		.filter((log) => log.status === "ok")
		.filter((log) => {
			const date = new Date(log.createdAt || 0);
			return !Number.isNaN(date.getTime()) && date >= start && date <= end;
		});
}

function addEstimatedLogItems(day, items = []) {
	for (const item of Array.isArray(items) ? items : []) {
		const value = toNumber(item.consumidoDesdeAnterior);
		if (value <= 0) continue;
		if (item.tipo === "metragem") day.metros += value;
		else day.unidades += value;
	}
}

function groupEstimatedBySnapshotId(logs = [], tecnicos = []) {
	const tecnicoById = new Map(tecnicos.map((tecnico) => [tecnico.id, tecnico]));
	const grouped = new Map();
	for (const log of logs) {
		const tecnico = tecnicoById.get(log.tecnicoId);
		const date = getBrazilDateKey(log.createdAt);
		if (!tecnico || !date) continue;
		const byDay = grouped.get(tecnico.snapshotId) || new Map();
		const day = byDay.get(date) || { unidades: 0, metros: 0 };
		addEstimatedLogItems(day, log.items);
		byDay.set(date, day);
		grouped.set(tecnico.snapshotId, byDay);
	}
	return grouped;
}

function enrichDashboardTecnico({
	tecnico,
	snapshots,
	movementsBySnapshotId,
	estimatedBySnapshotId,
	start,
	end,
}) {
	const snapshot = snapshots.get(tecnico.snapshotId) || null;
	const monthlyHistory = summarizeMovementHistory(
		movementsBySnapshotId.get(tecnico.snapshotId) || [],
		{
			start,
			end,
			estimatedByDay:
				estimatedBySnapshotId.get(tecnico.snapshotId) || new Map(),
		},
	);
	return {
		...tecnico,
		snapshot: snapshot ? { ...snapshot, monthlyHistory } : { monthlyHistory },
	};
}

function enrichDashboardEmpresas({
	empresas,
	snapshots,
	movementsBySnapshotId,
	estimatedBySnapshotId,
	start,
	end,
}) {
	return empresas.map((empresa) => ({
		...empresa,
		tecnicos: empresa.tecnicos.map((tecnico) =>
			enrichDashboardTecnico({
				tecnico,
				snapshots,
				movementsBySnapshotId,
				estimatedBySnapshotId,
				start,
				end,
			}),
		),
	}));
}

function summarizeDashboard(empresas = []) {
	return empresas.reduce(
		(acc, empresa) => {
			acc.empresas += 1;
			acc.tecnicos += empresa.tecnicos.length;
			for (const tecnico of empresa.tecnicos) {
				if (tecnico.snapshot?.lastUpdatedAt) acc.atualizados += 1;
				if (tecnico.snapshot?.lastError) acc.erros += 1;
				if (tecnico.snapshot?.alerts?.length)
					acc.alertas += tecnico.snapshot.alerts.length;
			}
			return acc;
		},
		{ empresas: 0, tecnicos: 0, atualizados: 0, erros: 0, alertas: 0 },
	);
}

async function getDashboard(user) {
	const empresas = await listAuthorizedTechnicians(user);
	const snapshots = await getSnapshotMap();
	const tecnicos = empresas.flatMap((empresa) => empresa.tecnicos);
	const tecnicoByEmail = buildTecnicoByEmail(empresas);
	const { start, end } = getPeriodRange("mensal");
	const movements = await loadCachedMovements({
		start,
		end,
		tecnicoByEmail,
	}).catch(() => []);
	const logs = await loadSuccessfulRefreshLogs(start, end);
	const movementsBySnapshotId = groupMovementsBySnapshotId(
		movements,
		tecnicoByEmail,
	);
	const estimatedBySnapshotId = groupEstimatedBySnapshotId(logs, tecnicos);
	const enriched = enrichDashboardEmpresas({
		empresas,
		snapshots,
		movementsBySnapshotId,
		estimatedBySnapshotId,
		start,
		end,
	});
	return {
		ok: true,
		empresas: enriched,
		summary: summarizeDashboard(enriched),
	};
}

async function refreshAll(user = {}) {
	const empresas = await listAuthorizedTechnicians(user);
	const tecnicos = empresas.flatMap((empresa) => empresa.tecnicos);
	const results = [];
	for (const tecnico of tecnicos) {
		results.push(await refreshTecnico(tecnico, user));
	}
	return { ok: true, total: results.length, results };
}

async function saveRefreshJob(job) {
	await documents.upsertDocument({
		path: `${JOB_COLLECTION}/${job.id}`,
		collectionPath: JOB_COLLECTION,
		documentId: job.id,
		parentPath: null,
		data: job,
	});
	return job;
}

async function getRefreshJob(jobId) {
	const id = cleanText(jobId);
	if (!id) return null;
	const doc = await documents.getDocument(`${JOB_COLLECTION}/${id}`);
	return doc?.data || null;
}

async function updateRefreshJob(jobId, patch = {}) {
	const current = (await getRefreshJob(jobId)) || { id: jobId };
	return saveRefreshJob({
		...current,
		...patch,
		updatedAt: nowIso(),
	});
}

async function runRefreshAllJob(jobId, user = {}) {
	await updateRefreshJob(jobId, {
		status: "running",
		stage: "Buscando empresas e técnicos",
		percent: 2,
		startedAt: nowIso(),
		error: "",
	});

	try {
		const empresas = await listAuthorizedTechnicians(user);
		const tecnicos = empresas.flatMap((empresa) => empresa.tecnicos);
		const total = tecnicos.length;
		const results = [];

		await updateRefreshJob(jobId, {
			total,
			processed: 0,
			stage: total
				? "Consultando bolsas na API Sempre"
				: "Nenhum técnico encontrado",
			percent: total ? 5 : 100,
		});

		for (let index = 0; index < tecnicos.length; index += 1) {
			const tecnico = tecnicos[index];
			await updateRefreshJob(jobId, {
				current: {
					tecnicoId: tecnico.id,
					tecnicoNome: tecnico.nome,
					empresaNome: tecnico.empresaNome,
				},
				stage: `Consultando ${tecnico.nome}`,
				percent: Math.min(
					95,
					Math.round((index / Math.max(total, 1)) * 90) + 5,
				),
			});
			const snapshot = await refreshTecnico(tecnico, user);
			results.push(snapshot);
			await updateRefreshJob(jobId, {
				processed: index + 1,
				errors: results.filter((item) => item?.lastError).length,
				success: results.filter((item) => !item?.lastError).length,
				percent: Math.min(
					98,
					Math.round(((index + 1) / Math.max(total, 1)) * 90) + 5,
				),
			});
		}

		const errors = results.filter((item) => item?.lastError).length;
		const success = results.length - errors;
		let reportCache = null;
		try {
			const { start, end } = getPeriodRange("mensal");
			await updateRefreshJob(jobId, {
				stage: "Atualizando movimentações do Playground",
				percent: 99,
			});
			reportCache = await refreshMovementCache({ user, start, end });
		} catch (error) {
			reportCache = {
				ok: false,
				error:
					error?.message || "Falha ao atualizar movimentações do Playground.",
			};
			await appendLog({
				type: "movement_cache",
				status: "erro",
				error: reportCache.error,
				userName: getProfile(user).nome || user?.email || "Rotina",
			});
		}
		const result = {
			ok: true,
			total: results.length,
			success,
			errors,
			reportCache,
			results,
		};
		await updateRefreshJob(jobId, {
			status: "completed",
			stage: errors
				? `Atualização finalizada com ${errors} erro(s)`
				: "Atualização finalizada",
			percent: 100,
			processed: total,
			success,
			errors,
			result,
			finishedAt: nowIso(),
			current: null,
		});
		return result;
	} catch (error) {
		await updateRefreshJob(jobId, {
			status: "failed",
			stage: "Erro ao atualizar bolsas",
			percent: 100,
			error: error?.message || "Falha ao atualizar bolsas.",
			finishedAt: nowIso(),
		});
		throw error;
	}
}

async function startRefreshAllJob(user = {}) {
	const empresas = await listAuthorizedTechnicians(user);
	const tecnicos = empresas.flatMap((empresa) => empresa.tecnicos);
	const now = nowIso();
	const job = {
		id: randomId("tecnicos_bolsa"),
		type: "tecnicos_bolsa_auditoria_refresh",
		status: "queued",
		stage: "Aguardando processamento",
		percent: 0,
		processed: 0,
		total: tecnicos.length,
		current: null,
		result: null,
		error: "",
		createdAt: now,
		updatedAt: now,
		startedAt: null,
		finishedAt: null,
		createdBy: user?.uid || null,
		createdByName: getProfile(user).nome || user?.email || "",
	};
	await saveRefreshJob(job);

	setImmediate(() => {
		runRefreshAllJob(job.id, user).catch((error) => {
			console.error(`[tecnicosBolsaAuditoria] Falha no job ${job.id}:`, error);
		});
	});

	return {
		accepted: true,
		jobId: job.id,
		status: job.status,
		stage: job.stage,
		percent: job.percent,
		total: job.total,
		processed: job.processed,
	};
}

async function refreshBySnapshotId(snapshotId, user = {}) {
	const empresas = await listAuthorizedTechnicians(user);
	const tecnico = empresas
		.flatMap((empresa) => empresa.tecnicos)
		.find((item) => item.snapshotId === snapshotId || item.id === snapshotId);
	if (!tecnico) {
		const error = new Error("Técnico não encontrado ou sem permissão.");
		error.statusCode = 404;
		throw error;
	}
	return { ok: true, snapshot: await refreshTecnico(tecnico, user) };
}

async function listLogs({ page = 1, limit = 20, user } = {}) {
	const safePage = Math.max(1, Number(page) || 1);
	const safeLimit = Math.min(100, Math.max(10, Number(limit) || 20));
	const empresas = await listAuthorizedTechnicians(user);
	const allowedEmpresaIds = new Set(empresas.map((empresa) => empresa.id));
	const all = (await documents.listAllDocuments(LOG_COLLECTION))
		.map((doc) => ({ id: doc.documentId, ...(doc.data || {}) }))
		.filter((item) => allowedEmpresaIds.has(item.empresaId))
		.sort((a, b) =>
			String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
		);
	const offset = (safePage - 1) * safeLimit;
	return {
		ok: true,
		page: safePage,
		limit: safeLimit,
		total: all.length,
		totalPages: Math.max(1, Math.ceil(all.length / safeLimit)),
		items: all.slice(offset, offset + safeLimit),
	};
}

async function getReports({ user, query = {} } = {}) {
	const filters = getReportFiltersFromQuery(query);
	const empresas = await listAuthorizedTechnicians(user);
	const allowedTecnicos = empresas.flatMap((empresa) => empresa.tecnicos);
	const allowedEmpresaIds = new Set(empresas.map((empresa) => empresa.id));
	const allowedTecnicoIds = new Set(
		allowedTecnicos.map((tecnico) => tecnico.id),
	);
	const tecnicoByEmail = new Map(
		allowedTecnicos
			.filter((tecnico) => tecnico.emailHubsoft)
			.map((tecnico) => [normalizeText(tecnico.emailHubsoft), tecnico]),
	);
	const { start, end } = getPeriodRange(
		filters.periodo,
		filters.dataInicio,
		filters.dataFim,
	);
	const byEmpresa = new Map();
	const byTecnico = new Map();
	const byCategoria = new Map();
	const byItem = new Map();
	const movimentosByEmpresa = new Map();
	const movimentosByTecnico = new Map();
	const movimentosByCategoria = new Map();
	const movimentosByItem = new Map();

	const logs = (await documents.listAllDocuments(LOG_COLLECTION))
		.map((doc) => ({ id: doc.documentId, ...(doc.data || {}) }))
		.filter((log) => log.status === "ok")
		.filter(
			(log) =>
				allowedEmpresaIds.has(log.empresaId) ||
				allowedTecnicoIds.has(log.tecnicoId),
		)
		.filter(
			(log) =>
				!filters.regional || normalizeText(log.regional) === filters.regional,
		)
		.filter((log) => !filters.empresaId || log.empresaId === filters.empresaId)
		.filter((log) => !filters.tecnicoId || log.tecnicoId === filters.tecnicoId)
		.filter((log) => {
			const date = new Date(log.createdAt || 0);
			return !Number.isNaN(date.getTime()) && date >= start && date <= end;
		});

	for (const log of logs) {
		for (const item of Array.isArray(log.items) ? log.items : []) {
			if (toNumber(item.consumidoDesdeAnterior) <= 0) continue;
			const category = getCategoryDefinition(item.categoria);
			addGroupedValue(
				byEmpresa,
				log.empresaId || "sem_empresa",
				{
					id: log.empresaId || "sem_empresa",
					nome: log.empresaNome || "Sem empresa",
					regional: log.regional || "",
				},
				item,
			);
			addGroupedValue(
				byTecnico,
				log.tecnicoId || "sem_tecnico",
				{
					id: log.tecnicoId || "sem_tecnico",
					nome: log.tecnicoNome || "Sem técnico",
					empresaNome: log.empresaNome || "",
					regional: log.regional || "",
				},
				item,
			);
			addGroupedValue(
				byCategoria,
				category.id,
				{
					id: category.id,
					nome: category.label,
				},
				item,
			);
			addGroupedValue(
				byItem,
				item.key || normalizeId(item.nome),
				{
					id: item.key || normalizeId(item.nome),
					nome: item.nome || "Item",
					categoria: category.label,
					unidade: item.unidade || "",
				},
				item,
			);
		}
	}

	const config = await readConfig({ sanitized: false });
	const movimentos = (await loadCachedMovements({ start, end, tecnicoByEmail }))
		.filter(
			(item) =>
				!filters.regional || normalizeText(item.regional) === filters.regional,
		)
		.filter(
			(item) => !filters.empresaId || item.empresaId === filters.empresaId,
		)
		.filter(
			(item) => !filters.tecnicoId || item.tecnicoId === filters.tecnicoId,
		);
	const consumosConfirmados = movimentos.filter(
		(item) => item.tipoMovimentacao === "consumo",
	);
	for (const item of consumosConfirmados) {
		addGroupedValue(
			movimentosByEmpresa,
			item.empresaId || "sem_empresa",
			{
				id: item.empresaId || "sem_empresa",
				nome: item.empresaNome || "Sem empresa",
				regional: item.regional || "",
			},
			item,
			"quantidade",
		);
		addGroupedValue(
			movimentosByTecnico,
			item.tecnicoId || "sem_tecnico",
			{
				id: item.tecnicoId || "sem_tecnico",
				nome: item.tecnicoNome || "Sem técnico",
				empresaNome: item.empresaNome || "",
				regional: item.regional || "",
			},
			item,
			"quantidade",
		);
		addGroupedValue(
			movimentosByCategoria,
			item.categoria,
			{
				id: item.categoria,
				nome: item.categoriaLabel,
			},
			item,
			"quantidade",
		);
		addGroupedValue(
			movimentosByItem,
			item.nome || item.id,
			{
				id: item.nome || item.id,
				nome: item.nome || "Item",
				categoria: item.categoriaLabel,
				unidade: item.unidade || "",
			},
			item,
			"quantidade",
		);
	}

	const sortRows = (rows) =>
		rows.sort((a, b) => b.unidades + b.metros - (a.unidades + a.metros));
	const itensEstimados = sortRows([...byItem.values()]);
	const itensMovimentados = sortRows([...movimentosByItem.values()]);
	const porEmpresa = sortRows([...movimentosByEmpresa.values()]);
	const porTecnico = sortRows([...movimentosByTecnico.values()]);
	const porCategoria = sortRows([...movimentosByCategoria.values()]);
	return {
		ok: true,
		movementsError: "",
		cache: {
			lastReportRefreshAt: config.lastReportRefreshAt || "",
			lastReportRefreshStart: config.lastReportRefreshStart || "",
			lastReportRefreshEnd: config.lastReportRefreshEnd || "",
			lastReportRefreshTotal: toNumber(config.lastReportRefreshTotal),
		},
		filters,
		periodo: { inicio: start.toISOString(), fim: end.toISOString() },
		options: {
			regionais: [
				...new Set(empresas.map((empresa) => empresa.regional).filter(Boolean)),
			].sort((a, b) => a.localeCompare(b, "pt-BR")),
			empresas: empresas.map((empresa) => ({
				id: empresa.id,
				nome: empresa.nome,
				regional: empresa.regional,
			})),
			tecnicos: allowedTecnicos.map((tecnico) => ({
				id: tecnico.id,
				nome: tecnico.nome,
				empresaId: tecnico.empresaId,
				empresaNome: tecnico.empresaNome,
				regional: tecnico.regional,
			})),
		},
		summary: {
			leituras: movimentos.length,
			empresas: porEmpresa.length,
			tecnicos: porTecnico.length,
			unidades: itensMovimentados.reduce(
				(acc, item) => acc + toNumber(item.unidades),
				0,
			),
			metros: itensMovimentados.reduce(
				(acc, item) => acc + toNumber(item.metros),
				0,
			),
			movimentacoes: movimentos.length,
			consumosConfirmados: consumosConfirmados.length,
			unidadesMovimentadas: itensMovimentados.reduce(
				(acc, item) => acc + toNumber(item.unidades),
				0,
			),
			metrosMovimentados: itensMovimentados.reduce(
				(acc, item) => acc + toNumber(item.metros),
				0,
			),
			consumoEstimadoUnidades: itensEstimados.reduce(
				(acc, item) => acc + toNumber(item.unidades),
				0,
			),
			consumoEstimadoMetros: itensEstimados.reduce(
				(acc, item) => acc + toNumber(item.metros),
				0,
			),
		},
		porEmpresa,
		porTecnico,
		porCategoria,
		itens: itensMovimentados,
		estimadoPorEmpresa: sortRows([...byEmpresa.values()]),
		estimadoPorTecnico: sortRows([...byTecnico.values()]),
		estimadoPorCategoria: sortRows([...byCategoria.values()]),
		itensEstimados,
		movimentos: movimentos.slice(0, 500),
		movimentosConsumo: consumosConfirmados.slice(0, 500),
		movimentosPorEmpresa: porEmpresa,
		movimentosPorTecnico: porTecnico,
		movimentosPorCategoria: porCategoria,
		movimentosItens: itensMovimentados,
	};
}

async function sendReportByEmail(
	{ to, pdfBase64, fileName, filters = {} } = {},
	user = {},
) {
	const target = cleanText(to);
	if (!target) {
		const error = new Error("Informe o e-mail de destino.");
		error.statusCode = 400;
		throw error;
	}
	if (!cleanText(pdfBase64)) {
		const error = new Error("PDF do relatório não informado.");
		error.statusCode = 400;
		throw error;
	}

	await emailService.sendMail({
		to: target,
		subject: "Relatório de auditoria de bolsa técnica",
		text: "Segue em anexo o relatório de auditoria de bolsa técnica.",
		html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h2>Relatório de auditoria de bolsa técnica</h2>
        <p>Segue em anexo o relatório solicitado.</p>
        <p><strong>Período:</strong> ${cleanText(filters.periodo || "mensal")}</p>
      </div>
    `,
		attachments: [
			{
				filename: cleanText(fileName || "relatorio-bolsa-tecnica.pdf"),
				content: Buffer.from(pdfBase64, "base64"),
				contentType: "application/pdf",
			},
		],
		meta: {
			type: "tecnicos_bolsa_relatorio",
			requestedBy: getProfile(user).nome || user?.email || "",
			filters,
		},
	});

	return { ok: true };
}

async function runDailyIfDue(user = {}) {
	const config = await readConfig({ sanitized: false });
	if (!config.enabled)
		return { ok: true, skipped: true, reason: "Rotina desativada." };
	const formatter = new Intl.DateTimeFormat("en-CA", {
		timeZone: config.timezone || DEFAULT_CONFIG.timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
	const parts = Object.fromEntries(
		formatter.formatToParts(new Date()).map((part) => [part.type, part.value]),
	);
	const today = `${parts.year}-${parts.month}-${parts.day}`;
	const currentTime = `${parts.hour}:${parts.minute}`;
	if (config.lastDailyRunDate === today || currentTime < config.dailyRunTime) {
		return {
			ok: true,
			skipped: true,
			reason: "Fora da janela ou rotina já executada hoje.",
		};
	}
	const result = await startRefreshAllJob(user);
	await saveConfig({ ...config, lastDailyRunDate: today }, user);
	await appendLog({
		type: "daily_run",
		status: "ok",
		total: result.total,
		userName: getProfile(user).nome || "Rotina",
	});
	return result;
}

module.exports = {
	getDashboard,
	listLogs,
	readConfig,
	getReports,
	refreshReportMovements,
	sendReportByEmail,
	startReportRefreshJob,
	refreshAll,
	getRefreshJob,
	startRefreshAllJob,
	refreshBySnapshotId,
	runDailyIfDue,
	saveConfig,
};
