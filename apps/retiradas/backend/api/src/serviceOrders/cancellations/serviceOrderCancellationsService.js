const db = require("../../db");
const documents = require("../../documents");
const regionaisRepository = require("../../regionaisRepository");
const { broadcastRealtime } = require("../../realtime");
const hubsoftSyncProfiles = require("../../hubsoftSyncProfiles");
const { execFile } = require("child_process");
const { promisify } = require("util");

const TIME_ZONE = "America/Sao_Paulo";
const METABASE_CARD_UUID = "7c9f15dd-1e51-4c77-bc7c-d19cc74218f1";
const METABASE_BASE_URL = "https://bi.sempre.hubsoft.com.br:8443";
const CANCELLATIONS_PAGE_LIMIT = 15;
const HUBSOFT_DASHBOARD_CANCELLATIONS_PATH = "/api/v1/dashboard/painel/movimento_base";
const AUTOMATIC_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const TECHNOLOGY_RULES_PATH = "config/cancellation_technology_rules";
const SYNC_RUNNING_MAX_AGE_MS = Number(
	process.env.HUBSOFT_CANCELLATIONS_RUNNING_MAX_AGE_MS || 30 * 60 * 1000,
);
const execFileAsync = promisify(execFile);
const VIEW_PERMISSIONS = [
	"service_orders.cancellations.view",
	"service_orders.cancellations.manage",
	"view_metas",
	"manage_metas",
];
const MANAGE_PERMISSIONS = [
	"service_orders.cancellations.manage",
	"manage_metas",
];
const AGENT_CITY_EXCLUSION_KEYS = new Set(["pompeu"]);

const METABASE_PARAMETERS = {
	dataCancelamento: {
		id: "2dad0509-7680-2dfd-7d9d-80bda5e4f52f",
		type: "date/all-options",
		target: ["dimension", ["template-tag", "data_cancelamento"]],
	},
	churn: {
		id: "fcd3bea5-6c24-9f94-14ba-7549930657e2",
		type: "category",
		target: ["variable", ["template-tag", "motivo_cancelamento_gera_grafico"]],
	},
	tipo: {
		id: "a597b09d-789b-aef2-4a30-85976ca92ddd",
		type: "category",
		target: ["variable", ["template-tag", "tipo"]],
	},
};

function cleanText(value) {
	return String(value ?? "").trim();
}

function normalizeKey(value) {
	return cleanText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ")
		.toUpperCase();
}

function normalizeCityKey(value) {
	return cleanText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ")
		.toLowerCase();
}

function currentYear() {
	return Number(
		new Intl.DateTimeFormat("en-US", {
			timeZone: TIME_ZONE,
			year: "numeric",
		}).format(new Date()),
	);
}

function currentYearMonth() {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: TIME_ZONE,
		year: "numeric",
		month: "2-digit",
	}).formatToParts(new Date());
	const year = parts.find((part) => part.type === "year")?.value;
	const month = parts.find((part) => part.type === "month")?.value;
	return `${year}-${month}`;
}

function parseYear(value) {
	const year = Number(value || currentYear());
	return Number.isInteger(year) && year >= 2000 && year <= 2100
		? year
		: currentYear();
}

function emptyCompanyTotals() {
	return { SEMPRE: 0, ONNET: 0 };
}

function buildPublicCancellationCities(rows = [], year = currentYear(), updatedAt = null) {
	const months = Array.from({ length: 12 }, (_, index) => ({
		competencia: `${year}-${String(index + 1).padStart(2, "0")}`,
		total: 0,
		sempre: 0,
		onnet: 0,
	}));
	const cities = new Map();
	const regionals = new Map();
	const companies = emptyCompanyTotals();

	for (const row of rows) {
		const competencia = cleanText(row.competencia);
		const monthIndex = Number(competencia.slice(5, 7)) - 1;
		if (monthIndex < 0 || monthIndex > 11) continue;
		const company = normalizeKey(row.empresa);
		if (!Object.hasOwn(companies, company)) continue;
		const total = Number(row.total || 0);
		const cityName = cleanText(row.cidade) || "Sem cidade";
		const regionalName = cleanText(row.regional) || "Sem regional";
		const cityKey = `${normalizeCityKey(cityName)}|${normalizeKey(regionalName)}`;
		const city = cities.get(cityKey) || {
			cidade: cityName,
			regional: regionalName,
			total: 0,
			sempre: 0,
			onnet: 0,
			mensal: months.map((month) => ({ ...month, total: 0, sempre: 0, onnet: 0 })),
		};
		const regional = regionals.get(normalizeKey(regionalName)) || {
			regional: regionalName,
			total: 0,
			sempre: 0,
			onnet: 0,
		};
		const companyKey = company === "SEMPRE" ? "sempre" : "onnet";

		city.total += total;
		city[companyKey] += total;
		city.mensal[monthIndex].total += total;
		city.mensal[monthIndex][companyKey] += total;
		regional.total += total;
		regional[companyKey] += total;
		months[monthIndex].total += total;
		months[monthIndex][companyKey] += total;
		companies[company] += total;
		cities.set(cityKey, city);
		regionals.set(normalizeKey(regionalName), regional);
	}

	const cityItems = [...cities.values()].sort(
		(left, right) => right.total - left.total || left.cidade.localeCompare(right.cidade),
	);
	const regionalItems = [...regionals.values()].sort(
		(left, right) => right.total - left.total || left.regional.localeCompare(right.regional),
	);
	const total = companies.SEMPRE + companies.ONNET;
	const currentMonth = currentYearMonth();

	return {
		year,
		currentMonth,
		updatedAt,
		totals: {
			total,
			sempre: companies.SEMPRE,
			onnet: companies.ONNET,
			cities: cityItems.length,
			regionals: regionalItems.length,
			currentMonth: months.find((month) => month.competencia === currentMonth)?.total || 0,
		},
		months,
		cities: cityItems,
		regionals: regionalItems,
	};
}

async function getPublicCancellationCities(query = {}) {
	const year = parseYear(query.year);
	const [aggregate, freshness] = await Promise.all([
		db.query(
			`select competencia,
			        coalesce(cidade, 'Sem cidade') as cidade,
			        coalesce(regional_nome, 'Sem regional') as regional,
			        empresa_normalizada as empresa,
			        count(*)::int as total
			   from service_order_cancellation_records
			  where competencia like $1
			    and empresa_normalizada in ('SEMPRE', 'ONNET')
			    and classificacao_tecnologia = 'FTTH'
			  group by competencia,
			           coalesce(cidade, 'Sem cidade'),
			           coalesce(regional_nome, 'Sem regional'),
			           empresa_normalizada
			  order by competencia, total desc`,
			[`${year}-%`],
		),
		db.query(
			`select max(last_synced_at) as updated_at
			   from service_order_cancellation_competencies
			  where competencia like $1`,
			[`${year}-%`],
		),
	]);
	return buildPublicCancellationCities(
		aggregate.rows,
		year,
		freshness.rows[0]?.updated_at || null,
	);
}

function isExcludedAgentCityKey(value) {
	return AGENT_CITY_EXCLUSION_KEYS.has(normalizeCityKey(value));
}

function parsePositiveInteger(value, fallback, max) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, max);
}

function parseCompetencia(value) {
	const text = cleanText(value);
	return /^\d{4}-\d{2}$/.test(text) ? text : currentCompetencia();
}

function currentCompetencia() {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: TIME_ZONE,
		year: "numeric",
		month: "2-digit",
	}).format(new Date());
}

function monthNameFromCompetencia(competencia) {
	const month = Number(String(competencia || "").slice(5, 7));
	return [
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
	][month - 1] || null;
}

function getDaysInCompetencia(competencia) {
	const [year, month] = String(competencia || "")
		.split("-")
		.map((value) => Number(value));
	if (!year || !month) return 31;
	return new Date(year, month, 0).getDate();
}

function normalizeDailyForMonth(values = [], dayCount = 31) {
	const current = Array.isArray(values) ? values : [];
	return Array.from({ length: dayCount }, (_, index) =>
		Math.round(Number(current[index] || 0)),
	);
}

function normalizeCityName(value) {
	const text = cleanText(value);
	if (!text) return "";
	return text
		.toLowerCase()
		.split(/\s+/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

async function loadAuthorizedAgentCities() {
	const [regionalRows, toolRows] = await Promise.all([
		regionaisRepository.listAllRegionalDocuments(),
		documents.listAllDocuments("ferramentas_regionais"),
	]);
	const map = new Map();
	function addCity(city, regionalName) {
		const name = normalizeCityName(city?.nome || city);
		const key = normalizeCityKey(name);
		if (!key) return;
		const kind = normalizeKey(city?.tipo || city?.tipoCidade || "");
		const current = map.get(key) || {};
		const agente =
			!isExcludedAgentCityKey(key) &&
			(current.agente === true || city?.agente === true || kind.includes("AGENTE"));
		map.set(key, {
			nome: name,
			regional: regionalName || current.regional || null,
			agente,
		});
	}
	for (const row of [...toolRows, ...regionalRows]) {
		const data = row?.data || {};
		const regionalName = data.nome || "Sem regional";
		for (const city of data.cidades || []) addCity(city, regionalName);
	}
	return map;
}

function normalizeAgentCityRecord(city = {}, dayCount) {
	const daily = normalizeDailyForMonth(city.daily, dayCount);
	const realizado = daily.reduce((sum, value) => sum + Number(value || 0), 0);
	const cancelamentos = Math.round(Number(city.cancelamentos || 0));
	const meta80 = Math.round(Number(city.meta80 || city.meta || 0));
	return {
		...city,
		nome: normalizeCityName(city.nome || city.cidade) || "Sem cidade",
		cancelamentos,
		meta80,
		realizado,
		falta: meta80 - realizado,
		pct: meta80 > 0 ? Number(((realizado / meta80) * 100).toFixed(1)) : 0,
		daily,
		lojaAgentesTotal: Number(city.lojaAgentesTotal || 0),
		lojaAgentesDaily: normalizeDailyForMonth(city.lojaAgentesDaily, dayCount),
	};
}

const DEFAULT_AGENT_META_PERCENT_BY_MONTH = {
	Janeiro: 65,
	Fevereiro: 65,
	Marco: 75,
	Abril: 80,
	Maio: 90,
	Junho: 90,
	Julho: 90,
	Agosto: 90,
	Setembro: 80,
	Outubro: 75,
	Novembro: 70,
	Dezembro: 65,
};

function getAgentMetaPercent(monthName) {
	return DEFAULT_AGENT_META_PERCENT_BY_MONTH[monthName] || 80;
}

async function rebuildAgentCancellationTargetsForCompetencia(competencia) {
	const normalizedCompetencia = parseCompetencia(competencia);
	const sourceCompetencia = addMonth(normalizedCompetencia, -1);
	const monthName = monthNameFromCompetencia(normalizedCompetencia);
	if (!monthName) return null;
	const metaPercent = getAgentMetaPercent(monthName);
	const dayCount = getDaysInCompetencia(normalizedCompetencia);
	const agentCities = await loadAuthorizedAgentCities();
	const result = await db.query(
		`select coalesce(cidade, 'Sem cidade') as cidade,
		        coalesce(cidade_normalizada, '') as cidade_normalizada,
		        count(*)::int as total
		   from service_order_cancellation_records
		  where competencia = $1
		    and empresa_normalizada = 'SEMPRE'
		  group by coalesce(cidade, 'Sem cidade'), coalesce(cidade_normalizada, '')
		  order by total desc, cidade`,
		[sourceCompetencia],
	);
	const cancellationsByCity = new Map();
	for (const row of result.rows) {
		const key = normalizeCityKey(row.cidade_normalizada || row.cidade);
		const agentInfo = agentCities.get(key);
		if (!agentInfo?.agente) continue;
		cancellationsByCity.set(key, {
			nome: agentInfo.nome || normalizeCityName(row.cidade),
			cancelamentos: Number(row.total || 0),
		});
	}
	const currentDoc =
		(await documents.getDocument(`dashboardagentes/${monthName}`).catch(() => null))
			?.data || {};
	const byCity = new Map();
	for (const city of currentDoc.cidades || []) {
		const normalized = normalizeAgentCityRecord(city, dayCount);
		const key = normalizeCityKey(normalized.nome);
		if (!key) continue;
		if (isExcludedAgentCityKey(key)) continue;
		byCity.set(key, normalized);
	}
	for (const [key, item] of cancellationsByCity.entries()) {
		const current =
			byCity.get(key) ||
			normalizeAgentCityRecord(
				{
					nome: item.nome,
					daily: [],
					lojaAgentesDaily: [],
				},
				dayCount,
			);
		current.nome = item.nome;
		current.cancelamentos = item.cancelamentos;
		current.meta80 = Math.round(item.cancelamentos * (metaPercent / 100));
		current.falta = current.meta80 - current.realizado;
		current.pct =
			current.meta80 > 0
				? Number(((current.realizado / current.meta80) * 100).toFixed(1))
				: 0;
		byCity.set(key, current);
	}
	const normalizedCities = [...byCity.values()]
		.filter((city) => Number(city.cancelamentos || 0) > 0 || Number(city.realizado || 0) > 0)
		.sort((left, right) => Number(right.realizado || 0) - Number(left.realizado || 0));
	const totalRealizado = normalizedCities.reduce(
		(sum, city) => sum + Number(city.realizado || 0),
		0,
	);
	const totalMeta = normalizedCities.reduce(
		(sum, city) => sum + Number(city.meta80 || 0),
		0,
	);
	const totalCancelamentos = normalizedCities.reduce(
		(sum, city) => sum + Number(city.cancelamentos || 0),
		0,
	);
	const totalDaily = Array.from({ length: dayCount }, (_, index) =>
		normalizedCities.reduce((sum, city) => sum + Number(city.daily?.[index] || 0), 0),
	);
	const totalFalta = totalMeta - totalRealizado;
	const nowIso = new Date().toISOString();
	const payload = {
		...currentDoc,
		month: monthName,
		metaSazonal: metaPercent,
		metaModeLabel: "Meta sazonal",
		cidades: normalizedCities,
		cidadesRanking: [...normalizedCities].sort(
			(left, right) => Number(right.realizado || 0) - Number(left.realizado || 0),
		),
		dayCount,
		totalCancelamentos,
		totalMeta,
		totalRealizado,
		totalFalta,
		percentAchieved:
			totalMeta > 0 ? Number(((totalRealizado / totalMeta) * 100).toFixed(1)) : 0,
		totalDaily,
		status:
			totalRealizado >= totalMeta && totalMeta > 0
				? "Meta atingida!"
				: `Faltam ${Math.max(0, Math.round(totalFalta))} retiradas`,
		cancelamentosUpdatedAt: nowIso,
		updatedAt: nowIso,
	};
	await documents.upsertDocument(
		{
			path: `dashboardagentes/${monthName}`,
			collectionPath: "dashboardagentes",
			documentId: monthName,
			parentPath: null,
			data: payload,
		},
		{ audit: false },
	);
	return {
		competencia: normalizedCompetencia,
		sourceCompetencia,
		month: monthName,
		cidades: normalizedCities.length,
		totalCancelamentos,
		totalMeta,
		totalRealizado,
	};
}

async function rebuildAgentCancellationTargetsRange(body = {}) {
	const start = parseCompetencia(body.startCompetencia || body.start || "2026-01");
	const end = parseCompetencia(body.endCompetencia || body.end || currentCompetencia());
	const competencias = listCompetenciasInRange(start, end);
	const results = [];
	for (const competencia of competencias) {
		results.push(await rebuildAgentCancellationTargetsForCompetencia(competencia));
	}
	return { startCompetencia: start, endCompetencia: end, results: results.filter(Boolean) };
}

function parseDate(value) {
	const text = cleanText(value);
	if (!text) return null;
	const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (match) return `${match[1]}-${match[2]}-${match[3]}`;
	const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
	if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
	const date = new Date(text);
	return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function getMonthRange(competencia) {
	const [year, month] = parseCompetencia(competencia).split("-").map(Number);
	const start = `${year}-${String(month).padStart(2, "0")}-01`;
	const endDate = new Date(Date.UTC(year, month, 0, 12));
	return {
		startDate: start,
		endDate: endDate.toISOString().slice(0, 10),
		metabaseRange: `${start}~${endDate.toISOString().slice(0, 10)}`,
	};
}

function addMonth(competencia, amount) {
	const [year, month] = parseCompetencia(competencia).split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1 + amount, 1, 12));
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function listCompetenciasInRange(startCompetencia, endCompetencia) {
	let current = parseCompetencia(startCompetencia);
	const end = parseCompetencia(endCompetencia);
	if (current > end) return listCompetenciasInRange(end, current);
	const values = [];
	while (current <= end && values.length < 240) {
		values.push(current);
		current = addMonth(current, 1);
	}
	return values;
}

function parseNumber(value) {
	if (value === null || value === undefined || value === "") return null;
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	const normalized = cleanText(value)
		.replace(/[^\d,.-]/g, "")
		.replace(/\.(?=\d{3}(?:\D|$))/g, "")
		.replace(",", ".");
	const number = Number(normalized);
	return Number.isFinite(number) ? number : null;
}

function parseInteger(value) {
	const number = Number.parseInt(value, 10);
	return Number.isFinite(number) ? number : null;
}

function normalizeTechnology(row = {}) {
	const original = cleanText(row.tecnologia);
	const haystack = normalizeKey([
		row.tecnologia,
		row.servico,
		row.grupo_servico,
		row.grupo_padrao,
		row.grupos_servico,
		row.grupos_cliente,
	].join(" "));
	if (
		["WIRELESS", "RADIO", "DEDICADO", "CLEAR CHANNEL", "B2B"].some(
			(marker) => haystack.includes(marker),
		)
	) {
		return { original, classification: "NAO_FTTH" };
	}
	if (
		haystack.includes("FIBRA") ||
		haystack.includes("FIBRA OPTICA") ||
		haystack.includes("FIBER") ||
		haystack.includes("FTTH")
	) {
		return { original, classification: "FTTH" };
	}
	const speed = /(\d{1,5}(?:[.,]\d{1,3})?) *(GB|MB)/.exec(haystack);
	if (speed) {
		const megabits = Number(speed[1].replace(",", ".")) * (speed[2] === "GB" ? 1000 : 1);
		if (megabits >= 50) return { original, classification: "FTTH" };
	}
	return { original, classification: "NAO_FTTH" };
}

function technologyModelKey(row = {}) {
	return normalizeKey(row.servico || row.tecnologia || row.tecnologia_original);
}

async function loadTechnologyRules() {
	const item = await documents.getDocument(TECHNOLOGY_RULES_PATH).catch(() => null);
	return item?.data?.rules && typeof item.data.rules === "object"
		? item.data.rules
		: {};
}

function normalizeCompany(row = {}) {
	const sources = [
		row.empresa_cluster,
		row.grupo_servico,
		row.grupo_padrao,
		row.grupos_servico,
		row.grupos_cliente,
		row.grupo_permissao,
		row.setor,
		row.forma_cobranca,
		row.servico,
		row.motivo_cancelamento,
	].filter((value) => cleanText(value));
	const original = sources[0] || "";
	const haystack = normalizeKey(sources.join(" "));
	if (haystack.includes("ONNET")) {
		return { original, normalized: "ONNET" };
	}
	return { original: original || "SEMPRE", normalized: "SEMPRE" };
}

function userDisplayName(user = {}) {
	return (
		cleanText(user?.profile?.nome) ||
		cleanText(user?.nome) ||
		cleanText(user?.name) ||
		cleanText(user?.email) ||
		cleanText(user?.uid) ||
		"Sistema"
	);
}

function buildUniqueKey(row = {}) {
	return [
		cleanText(row.id_cliente || row.codigo_cliente || "sem-cliente"),
		cleanText(row.id_cliente_servico || row.numero_plano || "sem-servico"),
		parseDate(row.data_cancelamento) || "sem-data",
	].join("|");
}

function getRowField(row = {}, fields = []) {
	for (const field of fields) {
		const value = row[field];
		if (cleanText(value)) return value;
	}
	return "";
}

function rowBelongsToCancellationScope(row = {}, competencia) {
	const date = parseDate(row.data_cancelamento);
	if (!date || !date.startsWith(`${competencia}-`)) return false;

	const status = normalizeKey(row.servico_status || row.status || row.status_servico);
	if (status && !status.includes("CANCEL")) return false;

	const churn = normalizeKey(
		getRowField(row, [
			"gera_grafico",
			"GERA_GRAFICO",
			"churn",
			"CHURN",
			"motivo_cancelamento_gera_grafico",
			"gera_grafico",
		]),
	);
	if (churn && !["S", "SIM", "TRUE", "1"].includes(churn)) return false;

	const type = normalizeKey(getRowField(row, ["tipo", "TIPO", "tipo_cliente_servico"]));
	if (type && !["V", "VENDA", "VAREJO"].includes(type)) return false;

	return true;
}

function sanitizePayload(row = {}) {
	const sensitiveKeys = new Set([
		"cpf",
		"cpf_cnpj",
		"cnpj",
		"rg",
		"email",
		"email_principal",
		"data_nascimento",
		"senha",
		"password",
	]);
	return Object.fromEntries(
		Object.entries(row).filter(([key]) => !sensitiveKeys.has(normalizeKey(key).toLowerCase())),
	);
}

async function loadRegionalMap() {
	const result = await db.query(
		`select c.nome as cidade, r.id as regional_id, r.nome as regional_nome
		   from regional_cidades c
		   join regionais r on r.id = c.regional_id
		  where r.ativo is distinct from false`,
	);
	const map = new Map();
	for (const row of result.rows) {
		map.set(normalizeCityKey(row.cidade), row);
	}
	return map;
}

function mapHubsoftRow(
	row,
	competencia,
	regionalMap = new Map(),
	technologyRules = {},
) {
	const dataCancelamento = parseDate(row.data_cancelamento);
	const company = normalizeCompany(row);
	const inferredTechnology = normalizeTechnology(row);
	const rule = technologyRules[technologyModelKey(row)];
	const technology = rule
		? { original: cleanText(rule.type), classification: rule.classification }
		: inferredTechnology;
	const cidade = cleanText(row.cidade);
	const regional = regionalMap.get(normalizeCityKey(cidade)) || {};
	return {
		competencia,
		uniqueKey: buildUniqueKey(row),
		codigoCliente: cleanText(row.codigo_cliente),
		clienteId: cleanText(row.id_cliente),
		clienteServicoId: cleanText(row.id_cliente_servico),
		clienteNome: cleanText(
			row["RAZÃO SOCIAL"] || row.nome_razaosocial || row.razao_social || row.cliente,
		),
		numeroPlano: cleanText(row.numero_plano),
		empresaOriginal: company.original,
		empresaNormalizada: company.normalized,
		servico: cleanText(row.servico),
		tecnologiaOriginal: technology.original,
		classificacaoTecnologia: technology.classification,
		grupoServico: cleanText(row.grupo_servico || row.grupos_servico),
		grupoPadrao: cleanText(row.grupo_padrao || row.grupos_cliente),
		velocidade: parseNumber(row.velocidade),
		dataCancelamento,
		motivoCancelamento: cleanText(row.motivo_cancelamento || row.motivo),
		usuarioCancelamento: cleanText(row.usuario_cancelamento),
		cidade,
		cidadeNormalizada: normalizeCityKey(cidade),
		regionalId: regional.regional_id || null,
		regionalNome: regional.regional_nome || null,
		bairro: cleanText(row.bairro),
		endereco: cleanText(row["endereco_instalação"] || row.endereco_instalacao || row.endereco),
		equipamentoComodato: cleanText(
			row.equipamento_comodato ||
				row.mac_addr ||
				row.phy_addr ||
				row.equipamento_conexao,
		),
		valor: parseNumber(row.valor || row.valor_com_pacote || row["valor (R$)"]),
		faturasGeradas: parseInteger(row.faturas_geradas),
		faturasQuitadas: parseInteger(row.faturas_quitadas),
		faturasEmAberto: parseInteger(row.faturas_em_aberto),
		payloadOriginal: sanitizePayload(row),
	};
}

function buildMetabaseParameters(competencia) {
	const { metabaseRange } = getMonthRange(competencia);
	return [
		{
			...METABASE_PARAMETERS.dataCancelamento,
			value: metabaseRange,
		},
		{
			...METABASE_PARAMETERS.churn,
			value: "S",
		},
		{
			...METABASE_PARAMETERS.tipo,
			value: "V",
		},
	];
}

function getMetabaseTimeoutMs() {
	return Number(process.env.HUBSOFT_CANCELLATIONS_TIMEOUT_MS || 180000);
}

function getMetabaseProxyUrl() {
	return cleanText(
		process.env.METABASE_PROXY_URL ||
			process.env.HTTPS_PROXY ||
			process.env.HTTP_PROXY,
	);
}

async function fetchMetabaseText(url, { signal } = {}) {
	const proxyUrl = getMetabaseProxyUrl();
	if (!proxyUrl) {
		const response = await fetch(url, {
			headers: { accept: "application/json" },
			signal,
		});
		const text = await response.text();
		return { ok: response.ok, status: response.status, text };
	}

	const timeoutMs = getMetabaseTimeoutMs();
	try {
		const { stdout } = await execFileAsync(
			"curl",
			[
				"--silent",
				"--show-error",
				"--fail-with-body",
				"--location",
				"--max-time",
				String(Math.max(1, Math.ceil(timeoutMs / 1000))),
				"--proxy",
				proxyUrl,
				"-H",
				"accept: application/json",
				url,
			],
			{
				encoding: "utf8",
				maxBuffer: Number(process.env.HUBSOFT_CANCELLATIONS_MAX_BUFFER || 100 * 1024 * 1024),
				timeout: timeoutMs + 5000,
			},
		);
		return { ok: true, status: 200, text: stdout };
	} catch (error) {
		const message = cleanText(error.stderr || error.message);
		const proxyError = new Error(
			message
				? `Falha ao consultar BI via proxy configurado: ${message}`
				: "Falha ao consultar BI via proxy configurado.",
		);
		proxyError.statusCode = 502;
		throw proxyError;
	}
}

async function fetchMetabaseJson(competencia) {
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		getMetabaseTimeoutMs(),
	);
	const parameters = encodeURIComponent(
		JSON.stringify(buildMetabaseParameters(competencia)),
	);
	const url = `${METABASE_BASE_URL}/api/public/card/${METABASE_CARD_UUID}/query/json?parameters=${parameters}`;
	try {
		const response = await fetchMetabaseText(url, { signal: controller.signal });
		if (!response.ok) {
			const error = new Error(
				`Fonte HubSoft indisponivel (${response.status}).`,
			);
			error.statusCode = 502;
			error.details = response.text.slice(0, 500);
			throw error;
		}
		const payload = JSON.parse(response.text);
		return Array.isArray(payload) ? payload : [];
	} catch (error) {
		if (error.name === "AbortError") {
			const timeoutError = new Error("Consulta ao BI do HubSoft expirou.");
			timeoutError.statusCode = 504;
			throw timeoutError;
		}
		if (error.cause?.code === "UND_ERR_CONNECT_TIMEOUT") {
			const timeoutError = new Error(
				"BI do HubSoft indisponivel para a VPS de homologacao.",
			);
			timeoutError.statusCode = 504;
			throw timeoutError;
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}

function dashboardRows(payload = {}) {
	return [payload, payload?.data, payload?.dados?.servicos, payload?.dados, payload?.items, payload?.registros,
		payload?.resultados, payload?.data?.data, payload?.data?.items].find(Array.isArray) || [];
}

function dashboardLastPage(payload = {}) {
	return [payload?.last_page, payload?.ultima_pagina, payload?.total_paginas,
		payload?.dados?.ultima_pagina,
		payload?.meta?.last_page, payload?.pagination?.last_page, payload?.data?.last_page]
		.map(Number).find((value) => Number.isFinite(value) && value > 0) || null;
}

async function fetchDashboardCancellations(competencia) {
	const { startDate, endDate } = getMonthRange(competencia);
	const session = await hubsoftSyncProfiles.createAutomationSession();
	const rows = [];
	const seen = new Set();
	let previousFingerprint = "";
	for (let page = 1; page <= 1000; page += 1) {
		const payload = await hubsoftSyncProfiles.automationRequest(session,
			HUBSOFT_DASHBOARD_CANCELLATIONS_PATH, {
				method: "POST",
				body: { data_inicio: startDate, data_fim: endDate, cidades: [], tipo: "cancelados", pagina: page },
			});
		const pageRows = dashboardRows(payload);
		if (!pageRows.length) break;
		const fingerprint = pageRows.slice(0, 3)
			.map((row) => `${row.id_cliente_servico || ""}:${row.data_cancelamento || ""}`).join("|");
		if (page > 1 && fingerprint === previousFingerprint) break;
		previousFingerprint = fingerprint;
		for (const row of pageRows) {
			const key = buildUniqueKey(row);
			if (!seen.has(key)) { seen.add(key); rows.push(row); }
		}
		const lastPage = dashboardLastPage(payload);
		if ((lastPage && page >= lastPage) || (!lastPage && pageRows.length < 50)) break;
	}
	return rows;
}

async function fetchCancellationRows(competencia) {
	try {
		return await fetchDashboardCancellations(competencia);
	} catch (error) {
		console.warn("[service-order-cancellations] API oficial indisponivel; usando BI de contingencia:", error?.message || error);
		return fetchMetabaseJson(competencia);
	}
}

function emptySummary() {
	return {
		geral: { ftth: 0, naoFtth: 0, total: 0 },
		empresas: {},
		equipamentos: { comEquipamento: 0, semEquipamento: 0 },
	};
}

function addToSummary(summary, row) {
	const company = row.empresa_normalizada || row.empresaNormalizada || "SEMPRE";
	const classification =
		row.classificacao_tecnologia || row.classificacaoTecnologia || "NAO_FTTH";
	if (!summary.empresas[company]) {
		summary.empresas[company] = { ftth: 0, naoFtth: 0, total: 0 };
	}
	const key = classification === "FTTH" ? "ftth" : "naoFtth";
	summary.geral[key] += 1;
	summary.geral.total += 1;
	summary.empresas[company][key] += 1;
	summary.empresas[company].total += 1;
	const equipment = cleanText(row.equipamento_comodato || row.equipamentoComodato);
	if (equipment) summary.equipamentos.comEquipamento += 1;
	else summary.equipamentos.semEquipamento += 1;
}

function buildSummary(rows = []) {
	const summary = emptySummary();
	rows.forEach((row) => addToSummary(summary, row));
	return summary;
}

async function summarizeCompetencia(client, competencia) {
	const result = await client.query(
		`select empresa_normalizada, classificacao_tecnologia, equipamento_comodato
		   from service_order_cancellation_records
		  where competencia = $1`,
		[competencia],
	);
	return buildSummary(result.rows);
}

function summariesDiffer(left, right) {
	return JSON.stringify(left || {}) !== JSON.stringify(right || {});
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableWriteConflict(error) {
	return ["40P01", "40001"].includes(String(error?.code || ""));
}

function syncLockKey(competencia) {
	const digits = String(competencia || "").replace(/\D/g, "");
	return Number(`91${digits}`) || 91000000;
}

async function recoverStaleSyncRuns(client = db) {
	const result = await client.query(
		`update service_order_cancellation_sync_runs
		    set status = 'FAILED',
		        finished_at = now(),
		        duration_ms = least(2147483647, greatest(
		          0,
		          extract(epoch from (now() - started_at))::bigint * 1000
		        )),
		        error_message = coalesce(
		          nullif(error_message, ''),
		          'Execucao interrompida antes da conclusao. Inicie uma nova sincronizacao.'
		        )
		  where status = 'RUNNING'
		    and started_at < now() - ($1::numeric * interval '1 millisecond')
		  returning id, competencia, error_message`,
		[SYNC_RUNNING_MAX_AGE_MS],
	);
	for (const run of result.rows) {
		if (!run.competencia) continue;
		await client.query(
			`update service_order_cancellation_competencies
			    set status = case when total_records > 0 then 'SYNCED' else 'ERROR' end,
			        last_error = $3
			  where competencia = $1
			    and last_sync_run_id = $2`,
			[run.competencia, run.id, run.error_message],
		);
	}
	return result.rows;
}

async function upsertCompetencyShell(client, competencia, status, runId = null) {
	await client.query(
		`insert into service_order_cancellation_competencies
		 (competencia, status, last_sync_run_id, last_error)
		 values ($1, $2, $3, null)
		 on conflict (competencia) do update set
		   status = excluded.status,
		   last_sync_run_id = coalesce(excluded.last_sync_run_id, service_order_cancellation_competencies.last_sync_run_id),
		   last_error = null`,
		[competencia, status, runId],
	);
}

async function upsertCancellationRecord(client, record) {
	const result = await client.query(
		`insert into service_order_cancellation_records (
			competencia, unique_key, codigo_cliente, cliente_id, cliente_servico_id,
			cliente_nome, numero_plano, empresa_original, empresa_normalizada,
			servico, tecnologia_original, classificacao_tecnologia, grupo_servico,
			grupo_padrao, velocidade, data_cancelamento, motivo_cancelamento,
			usuario_cancelamento, cidade, cidade_normalizada, regional_id,
			regional_nome, bairro, endereco, equipamento_comodato, valor,
			faturas_geradas, faturas_quitadas, faturas_em_aberto, payload_original,
			synced_at
		) values (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
			$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30::jsonb,now()
		)
		on conflict (competencia, unique_key) do update set
			codigo_cliente = excluded.codigo_cliente,
			cliente_id = excluded.cliente_id,
			cliente_servico_id = excluded.cliente_servico_id,
			cliente_nome = excluded.cliente_nome,
			numero_plano = excluded.numero_plano,
			empresa_original = excluded.empresa_original,
			empresa_normalizada = excluded.empresa_normalizada,
			servico = excluded.servico,
			tecnologia_original = coalesce(nullif(excluded.tecnologia_original, ''), service_order_cancellation_records.tecnologia_original),
			classificacao_tecnologia = case
				when nullif(excluded.tecnologia_original, '') is null
					then service_order_cancellation_records.classificacao_tecnologia
				else excluded.classificacao_tecnologia
			end,
			grupo_servico = excluded.grupo_servico,
			grupo_padrao = excluded.grupo_padrao,
			velocidade = excluded.velocidade,
			data_cancelamento = excluded.data_cancelamento,
			motivo_cancelamento = excluded.motivo_cancelamento,
			usuario_cancelamento = excluded.usuario_cancelamento,
			cidade = excluded.cidade,
			cidade_normalizada = excluded.cidade_normalizada,
			regional_id = excluded.regional_id,
			regional_nome = excluded.regional_nome,
			bairro = excluded.bairro,
			endereco = excluded.endereco,
			equipamento_comodato = excluded.equipamento_comodato,
			valor = excluded.valor,
			faturas_geradas = excluded.faturas_geradas,
			faturas_quitadas = excluded.faturas_quitadas,
			faturas_em_aberto = excluded.faturas_em_aberto,
			payload_original = excluded.payload_original,
			synced_at = now()
		returning (xmax = 0) as inserted`,
		[
			record.competencia,
			record.uniqueKey,
			record.codigoCliente || null,
			record.clienteId || null,
			record.clienteServicoId || null,
			record.clienteNome || null,
			record.numeroPlano || null,
			record.empresaOriginal || null,
			record.empresaNormalizada,
			record.servico || null,
			record.tecnologiaOriginal || null,
			record.classificacaoTecnologia,
			record.grupoServico || null,
			record.grupoPadrao || null,
			record.velocidade,
			record.dataCancelamento,
			record.motivoCancelamento || null,
			record.usuarioCancelamento || null,
			record.cidade || null,
			record.cidadeNormalizada || null,
			record.regionalId,
			record.regionalNome,
			record.bairro || null,
			record.endereco || null,
			record.equipamentoComodato || null,
			record.valor,
			record.faturasGeradas,
			record.faturasQuitadas,
			record.faturasEmAberto,
			JSON.stringify(record.payloadOriginal || {}),
		],
	);
	return result.rows[0]?.inserted ? "inserted" : "updated";
}

async function finishCompetency(client, competencia, runId, summary, total) {
	const current = await client.query(
		`select validation_status, validated_summary
		   from service_order_cancellation_competencies
		  where competencia = $1
		  for update`,
		[competencia],
	);
	const row = current.rows[0] || {};
	let validationStatus = row.validation_status || "PENDING";
	if (
		validationStatus === "VALIDATED" &&
		summariesDiffer(row.validated_summary, summary)
	) {
		validationStatus = "REQUIRES_REVALIDATION";
	}
	await client.query(
		`update service_order_cancellation_competencies
		    set status = 'SYNCED',
		        validation_status = $2,
		        total_records = $3,
		        summary = $4::jsonb,
		        last_sync_run_id = $5,
		        last_synced_at = now(),
		        last_error = null
		  where competencia = $1`,
		[competencia, validationStatus, total, JSON.stringify(summary), runId],
	);
}

async function syncCompetencia(competencia, user = {}, parentRunId = null) {
	const normalizedCompetencia = parseCompetencia(competencia);
	const startedAt = Date.now();
	const client = await db.connect();
	let runId = parentRunId;
	try {
		await client.query("begin");
		if (!runId) {
			const run = await client.query(
				`insert into service_order_cancellation_sync_runs
				 (competencia, status, triggered_by_uid, triggered_by_name)
				 values ($1, 'RUNNING', $2, $3)
				 returning id`,
				[normalizedCompetencia, user.uid || null, userDisplayName(user)],
			);
			runId = run.rows[0].id;
		}
		await upsertCompetencyShell(client, normalizedCompetencia, "SYNCING", runId);
		await client.query("commit");
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}

	let records = [];
	let keys = [];
	try {
		const rows = await fetchCancellationRows(normalizedCompetencia);
		const [regionalMap, technologyRules] = await Promise.all([
			loadRegionalMap(),
			loadTechnologyRules(),
		]);
		records = rows
			.map((row) =>
				mapHubsoftRow(row, normalizedCompetencia, regionalMap, technologyRules),
			)
			.filter((record) => record.dataCancelamento);
		keys = records.map((record) => record.uniqueKey);
	} catch (error) {
		await markSyncFailed(runId, normalizedCompetencia, error);
		throw error;
	}
	let inserted = 0;
	let updated = 0;
	let deleted = 0;
	if (records.length === 0) {
		const existing = await db.query(
			`select count(*)::int as total
			   from service_order_cancellation_records
			  where competencia = $1`,
			[normalizedCompetencia],
		);
		if (Number(existing.rows[0]?.total || 0) > 0) {
			const error = new Error(
				"HubSoft retornou zero cancelamentos; dados anteriores foram preservados.",
			);
			await markSyncFailed(runId, normalizedCompetencia, error);
			throw error;
		}
	}
	const maxWriteAttempts = 4;
	const lockKey = syncLockKey(normalizedCompetencia);
	for (let attempt = 1; attempt <= maxWriteAttempts; attempt += 1) {
	const writeClient = await db.connect();
	try {
		await writeClient.query("begin");
		await writeClient.query("select pg_advisory_xact_lock($1)", [lockKey]);
		await upsertCompetencyShell(writeClient, normalizedCompetencia, "SYNCING", runId);
		inserted = 0;
		updated = 0;
		deleted = 0;
		for (const record of records) {
			const action = await upsertCancellationRecord(writeClient, record);
			if (action === "inserted") inserted += 1;
			else updated += 1;
		}
		const deletedResult = await writeClient.query(
			`delete from service_order_cancellation_records
			  where competencia = $1
			    and not (unique_key = any($2::text[]))`,
			[normalizedCompetencia, keys],
		);
		deleted = deletedResult.rowCount || 0;
		const summary = await summarizeCompetencia(writeClient, normalizedCompetencia);
		await finishCompetency(
			writeClient,
			normalizedCompetencia,
			runId,
			summary,
			records.length,
		);
		await writeClient.query(
			`update service_order_cancellation_sync_runs
			    set status = 'COMPLETE',
			        finished_at = now(),
			        duration_ms = $2,
			        total_hubsoft = $3,
			        inserted_count = $4,
			        updated_count = $5,
			        deleted_count = $6,
			        summary = $7::jsonb
			  where id = $1`,
			[
				runId,
				Date.now() - startedAt,
				records.length,
				inserted,
				updated,
				deleted,
				JSON.stringify(summary),
			],
		);
		await writeClient.query("commit");
		try {
			await rebuildAgentCancellationTargetsForCompetencia(addMonth(normalizedCompetencia, 1));
		} catch (error) {
			console.error(
				"[service-order-cancellations] Falha ao atualizar metas de agentes",
				error,
			);
		}
		broadcastRealtime("cancellations", {
			competencia: normalizedCompetencia,
			updatedAt: new Date().toISOString(),
		});
		return {
			id: runId,
			competencia: normalizedCompetencia,
			status: "COMPLETE",
			total: records.length,
			inserted,
			updated,
			deleted,
			summary,
		};
	} catch (error) {
		await writeClient.query("rollback").catch(() => {});
		if (isRetryableWriteConflict(error) && attempt < maxWriteAttempts) {
			await sleep(500 * attempt);
			continue;
		}
		await markSyncFailed(runId, normalizedCompetencia, error);
		throw error;
	} finally {
		writeClient.release();
	}
	}
	throw new Error("Sincronizacao nao finalizada apos tentativas de gravacao.");
}

async function markSyncFailed(runId, competencia, error) {
	await db.query(
		`update service_order_cancellation_sync_runs
		    set status = 'FAILED',
		        finished_at = now(),
		        error_message = $2
		  where id = $1`,
		[runId, error?.message || "Falha na sincronizacao."],
	).catch(() => {});
	await db.query(
		`insert into service_order_cancellation_competencies
		 (competencia, status, validation_status, last_sync_run_id, last_error)
		 values ($1, 'ERROR', 'PENDING', $2, $3)
		 on conflict (competencia) do update set
		   status = 'ERROR',
		   last_sync_run_id = $2,
		   last_error = $3`,
		[competencia, runId, error?.message || "Falha na sincronizacao."],
	).catch(() => {});
}

function runAsync(task) {
	setImmediate(() => {
		task().catch((error) => {
			console.error("[service-order-cancellations]", error);
		});
	});
}

async function startSync(body = {}, user = {}) {
	const competencia = parseCompetencia(body.competencia);
	const client = await db.connect();
	let run;
	let reused = false;
	try {
		await client.query("begin");
		await client.query("select pg_advisory_xact_lock($1)", [
			syncLockKey(competencia),
		]);
		await recoverStaleSyncRuns(client);
		const active = await client.query(
			`select *
			   from service_order_cancellation_sync_runs
			  where competencia = $1 and status = 'RUNNING'
			  order by started_at desc
			  limit 1`,
			[competencia],
		);
		if (active.rows[0]) {
			run = active.rows[0];
			reused = true;
		} else {
			const result = await client.query(
				`insert into service_order_cancellation_sync_runs
				 (competencia, status, triggered_by_uid, triggered_by_name)
				 values ($1, 'RUNNING', $2, $3)
				 returning *`,
				[competencia, user.uid || null, userDisplayName(user)],
			);
			run = result.rows[0];
			await upsertCompetencyShell(client, competencia, "SYNCING", run.id);
		}
		await client.query("commit");
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
	if (reused) return { run: mapSyncRun(run), reused: true };
	runAsync(() => syncCompetencia(competencia, user, run.id));
	return { run: mapSyncRun(run), reused: false };
}

async function getSyncRun(id) {
	await recoverStaleSyncRuns();
	const result = await db.query(
		`select * from service_order_cancellation_sync_runs where id = $1`,
		[id],
	);
	return result.rows[0] ? mapSyncRun(result.rows[0]) : null;
}

async function startHistorySync(body = {}, user = {}) {
	const startCompetencia = parseCompetencia(body.startCompetencia || body.start);
	const endCompetencia = parseCompetencia(body.endCompetencia || body.end);
	const competencias = listCompetenciasInRange(startCompetencia, endCompetencia);
	const result = await db.query(
		`insert into service_order_cancellation_sync_runs
		 (start_competencia, end_competencia, status, triggered_by_uid, triggered_by_name)
		 values ($1, $2, 'RUNNING', $3, $4)
		 returning *`,
		[startCompetencia, endCompetencia, user.uid || null, userDisplayName(user)],
	);
	const run = result.rows[0];
	runAsync(async () => {
		let total = 0;
		const summary = {};
		try {
			for (const competencia of competencias) {
				const monthResult = await syncCompetencia(competencia, user);
				total += monthResult.total || 0;
				summary[competencia] = monthResult.summary || {};
			}
			await db.query(
				`update service_order_cancellation_sync_runs
				    set status = 'COMPLETE',
				        finished_at = now(),
				        duration_ms = extract(epoch from (now() - started_at))::int * 1000,
				        total_hubsoft = $2,
				        summary = $3::jsonb
				  where id = $1`,
				[run.id, total, JSON.stringify(summary)],
			);
		} catch (error) {
			await db.query(
				`update service_order_cancellation_sync_runs
				    set status = 'FAILED',
				        finished_at = now(),
				        error_message = $2
				  where id = $1`,
				[run.id, error?.message || "Falha na sincronizacao historica."],
			).catch(() => {});
		}
	});
	return { run: mapSyncRun(run), competencias };
}

function makeParamBuilder() {
	const values = [];
	return {
		add(value) {
			values.push(value);
			return `$${values.length}`;
		},
		values,
	};
}

function buildFilters(query = {}) {
	const params = makeParamBuilder();
	const competencia = parseCompetencia(query.competencia);
	const clauses = [`competencia = ${params.add(competencia)}`];
	const exactFilters = [
		["empresa", "empresa_normalizada"],
		["classificacao", "classificacao_tecnologia"],
		["tecnologia", "tecnologia_original"],
		["motivo", "motivo_cancelamento"],
		["servico", "servico"],
	];
	for (const [input, column] of exactFilters) {
		const value = cleanText(query[input]);
		if (value && value !== "TODOS" && value !== "all") {
			clauses.push(`${column} = ${params.add(value)}`);
		}
	}
	const citySearch = cleanText(query.cidade);
	if (citySearch && citySearch !== "TODOS" && citySearch !== "all") {
		clauses.push(`lower(coalesce(cidade, '')) like ${params.add(`%${citySearch.toLowerCase()}%`)}`);
	}
	const regionalSearch = cleanText(query.regional);
	if (regionalSearch && regionalSearch !== "TODOS" && regionalSearch !== "all") {
		clauses.push(`lower(coalesce(regional_nome, '')) like ${params.add(`%${regionalSearch.toLowerCase()}%`)}`);
	}
	const search = cleanText(query.q || query.search);
	if (search) {
		const term = `%${search.toLowerCase()}%`;
		clauses.push(`(
			lower(coalesce(cliente_nome, '')) like ${params.add(term)}
			or lower(coalesce(codigo_cliente, '')) like ${params.add(term)}
			or lower(coalesce(cliente_id, '')) like ${params.add(term)}
			or lower(coalesce(cliente_servico_id, '')) like ${params.add(term)}
			or lower(coalesce(servico, '')) like ${params.add(term)}
			or lower(coalesce(cidade, '')) like ${params.add(term)}
			or lower(coalesce(regional_nome, '')) like ${params.add(term)}
		)`);
	}
	return { where: clauses.join("\n and "), values: params.values, competencia };
}

function mapRecord(row = {}) {
	return {
		id: row.id,
		competencia: row.competencia,
		codigoCliente: row.codigo_cliente,
		clienteId: row.cliente_id,
		clienteServicoId: row.cliente_servico_id,
		clienteNome: row.cliente_nome,
		numeroPlano: row.numero_plano,
		empresaOriginal: row.empresa_original,
		empresa: row.empresa_normalizada,
		servico: row.servico,
		tecnologiaOriginal: row.tecnologia_original,
		classificacaoTecnologia: row.classificacao_tecnologia,
		grupoServico: row.grupo_servico,
		grupoPadrao: row.grupo_padrao,
		velocidade: row.velocidade === null ? null : Number(row.velocidade),
		dataCancelamento: row.data_cancelamento,
		motivoCancelamento: row.motivo_cancelamento,
		usuarioCancelamento: row.usuario_cancelamento,
		cidade: row.cidade,
		regionalId: row.regional_id,
		regionalNome: row.regional_nome,
		bairro: row.bairro,
		endereco: row.endereco,
		equipamentoComodato: row.equipamento_comodato,
		valor: row.valor === null ? null : Number(row.valor),
		faturasGeradas: row.faturas_geradas,
		faturasQuitadas: row.faturas_quitadas,
		faturasEmAberto: row.faturas_em_aberto,
		payloadOriginal: row.payload_original,
		syncedAt: row.synced_at,
	};
}

function mapCompetency(row = {}) {
	return {
		competencia: row.competencia,
		status: row.status || "NOT_SYNCED",
		validationStatus: row.validation_status || "PENDING",
		totalRecords: Number(row.total_records || 0),
		summary: row.summary || emptySummary(),
		validatedSummary: row.validated_summary || null,
		validatedBy: row.validated_by_name || null,
		validatedAt: row.validated_at || null,
		lastSyncRunId: row.last_sync_run_id || null,
		lastSyncedAt: row.last_synced_at || null,
		lastError: row.last_error || null,
	};
}

function mapSyncRun(row = {}) {
	return {
		id: row.id,
		competencia: row.competencia,
		startCompetencia: row.start_competencia,
		endCompetencia: row.end_competencia,
		status: row.status,
		triggeredBy: row.triggered_by_name,
		startedAt: row.started_at,
		finishedAt: row.finished_at,
		durationMs: row.duration_ms,
		totalHubsoft: Number(row.total_hubsoft || 0),
		inserted: Number(row.inserted_count || 0),
		updated: Number(row.updated_count || 0),
		deleted: Number(row.deleted_count || 0),
		summary: row.summary || {},
		error: row.error_message || null,
	};
}

async function listCancellations(query = {}) {
	const page = parsePositiveInteger(query.page, 1, 100000);
	const limit = CANCELLATIONS_PAGE_LIMIT;
	const offset = (page - 1) * limit;
	const { where, values } = buildFilters(query);
	const totalResult = await db.query(
		`select count(*)::int as total
		   from service_order_cancellation_records
		  where ${where}`,
		values,
	);
	const result = await db.query(
		`select *
		   from service_order_cancellation_records
		  where ${where}
		  order by data_cancelamento desc, cliente_nome nulls last
		  limit $${values.length + 1}
		  offset $${values.length + 2}`,
		[...values, limit, offset],
	);
	const total = Number(totalResult.rows[0]?.total || 0);
	return {
		page,
		limit,
		total,
		totalPages: Math.max(1, Math.ceil(total / limit)),
		data: result.rows.map(mapRecord),
	};
}

async function getRecord(id) {
	const result = await db.query(
		`select * from service_order_cancellation_records where id = $1`,
		[id],
	);
	return result.rows[0] ? mapRecord(result.rows[0]) : null;
}

async function reclassifyTechnology(id, payload = {}, user = {}) {
	const classification = normalizeKey(payload.classification);
	if (!["FTTH", "NAO_FTTH"].includes(classification)) {
		const error = new Error("Classificacao deve ser FTTH ou NAO_FTTH.");
		error.statusCode = 400;
		throw error;
	}
	const type = cleanText(payload.type);
	if (!type) {
		const error = new Error("Informe o tipo de tecnologia.");
		error.statusCode = 400;
		throw error;
	}
	const currentResult = await db.query(
		`select * from service_order_cancellation_records where id = $1`,
		[id],
	);
	const current = currentResult.rows[0];
	if (!current) return null;
	const modelKey = technologyModelKey(current);
	if (!modelKey) {
		const error = new Error("Este registro nao possui modelo ou servico para calibrar.");
		error.statusCode = 400;
		throw error;
	}

	const rules = await loadTechnologyRules();
	const now = new Date().toISOString();
	rules[modelKey] = {
		model: cleanText(current.servico || current.tecnologia_original),
		classification,
		type,
		updatedAt: now,
		updatedBy: userDisplayName(user),
	};
	await documents.upsertDocument({
		path: TECHNOLOGY_RULES_PATH,
		collectionPath: "config",
		documentId: "cancellation_technology_rules",
		parentPath: null,
		data: { rules, updatedAt: now, updatedBy: userDisplayName(user) },
	});

	const candidates = await db.query(
		`select id, competencia, servico, tecnologia_original
		   from service_order_cancellation_records`,
	);
	const matches = candidates.rows.filter((row) => technologyModelKey(row) === modelKey);
	const ids = matches.map((row) => row.id);
	if (ids.length) {
		await db.query(
			`update service_order_cancellation_records
			    set classificacao_tecnologia = $2,
			        tecnologia_original = $3
			  where id = any($1::uuid[])`,
			[ids, classification, type],
		);
		const competencias = [...new Set(matches.map((row) => row.competencia))];
		await Promise.all(competencias.map(async (competencia) => {
			const records = await db.query(
				`select empresa_normalizada, classificacao_tecnologia, equipamento_comodato
				   from service_order_cancellation_records where competencia = $1`,
				[competencia],
			);
			const summary = buildSummary(records.rows);
			await db.query(
				`update service_order_cancellation_competencies
				    set total_records = $2, summary = $3::jsonb
				  where competencia = $1`,
				[competencia, records.rowCount, JSON.stringify(summary)],
			);
		}));
	}
	broadcastRealtime("service-order-cancellations", {
		type: "technology-reclassified",
		model: rules[modelKey].model,
		classification,
		updated: ids.length,
	});
	return {
		item: await getRecord(id),
		updated: ids.length,
		rule: rules[modelKey],
	};
}

async function getSummary(query = {}) {
	const competencia = parseCompetencia(query.competencia);
	const competency = await getCompetency(competencia);
	const [empresa, regional, cidade, tecnologia] = await Promise.all([
		groupBy(competencia, "empresa_normalizada"),
		groupByRegional(competencia),
		groupByCity(competencia),
		groupByTechnology(competencia),
	]);
	return {
		competencia: competency,
		porEmpresa: empresa,
		porRegional: regional,
		porCidade: cidade,
		tecnologias: tecnologia,
	};
}

async function getCompetency(competencia) {
	const normalizedCompetencia = parseCompetencia(competencia);
	const result = await db.query(
		`select * from service_order_cancellation_competencies where competencia = $1`,
		[normalizedCompetencia],
	);
	return result.rows[0]
		? mapCompetency(result.rows[0])
		: {
				competencia: normalizedCompetencia,
				status: "NOT_SYNCED",
				validationStatus: "PENDING",
				totalRecords: 0,
				summary: emptySummary(),
			};
}

async function listCompetencies() {
	const result = await db.query(
		`select *
		   from service_order_cancellation_competencies
		  order by competencia desc
		  limit 120`,
	);
	return { items: result.rows.map(mapCompetency) };
}

async function groupBy(competencia, column) {
	const result = await db.query(
		`select ${column} as name,
		        count(*) filter (where classificacao_tecnologia = 'FTTH')::int as ftth,
		        count(*) filter (where classificacao_tecnologia = 'NAO_FTTH')::int as nao_ftth,
		        count(*)::int as total
		   from service_order_cancellation_records
		  where competencia = $1
		  group by ${column}
		  order by total desc, name`,
		[competencia],
	);
	return result.rows.map((row) => ({
		name: row.name || "Nao informado",
		ftth: Number(row.ftth || 0),
		naoFtth: Number(row.nao_ftth || 0),
		total: Number(row.total || 0),
		ftthPercent: Number(row.total) ? (Number(row.ftth) / Number(row.total)) * 100 : 0,
	}));
}

async function groupByRegional(competencia) {
	const result = await db.query(
		`select coalesce(regional_nome, 'Sem regional') as regional,
		        count(*) filter (where empresa_normalizada = 'SEMPRE' and classificacao_tecnologia = 'FTTH')::int as sempre_ftth,
		        count(*) filter (where empresa_normalizada = 'SEMPRE' and classificacao_tecnologia = 'NAO_FTTH')::int as sempre_nao_ftth,
		        count(*) filter (where empresa_normalizada = 'ONNET' and classificacao_tecnologia = 'FTTH')::int as onnet_ftth,
		        count(*) filter (where empresa_normalizada = 'ONNET' and classificacao_tecnologia = 'NAO_FTTH')::int as onnet_nao_ftth,
		        count(*)::int as total
		   from service_order_cancellation_records
		  where competencia = $1
		  group by coalesce(regional_nome, 'Sem regional')
		  order by total desc, regional`,
		[competencia],
	);
	return result.rows.map((row) => ({
		regional: row.regional,
		sempreFtth: Number(row.sempre_ftth || 0),
		sempreNaoFtth: Number(row.sempre_nao_ftth || 0),
		onnetFtth: Number(row.onnet_ftth || 0),
		onnetNaoFtth: Number(row.onnet_nao_ftth || 0),
		total: Number(row.total || 0),
	}));
}

async function groupByCity(competencia) {
	const result = await db.query(
		`select coalesce(cidade, 'Sem cidade') as cidade,
		        coalesce(regional_nome, 'Sem regional') as regional,
		        count(*) filter (where empresa_normalizada = 'SEMPRE' and classificacao_tecnologia = 'FTTH')::int as sempre_ftth,
		        count(*) filter (where empresa_normalizada = 'SEMPRE' and classificacao_tecnologia = 'NAO_FTTH')::int as sempre_nao_ftth,
		        count(*) filter (where empresa_normalizada = 'ONNET' and classificacao_tecnologia = 'FTTH')::int as onnet_ftth,
		        count(*) filter (where empresa_normalizada = 'ONNET' and classificacao_tecnologia = 'NAO_FTTH')::int as onnet_nao_ftth,
		        count(*)::int as total
		   from service_order_cancellation_records
		  where competencia = $1
		  group by coalesce(cidade, 'Sem cidade'), coalesce(regional_nome, 'Sem regional')
		  order by total desc, cidade
		  limit 500`,
		[competencia],
	);
	return result.rows.map((row) => ({
		cidade: row.cidade,
		regional: row.regional,
		sempreFtth: Number(row.sempre_ftth || 0),
		sempreNaoFtth: Number(row.sempre_nao_ftth || 0),
		onnetFtth: Number(row.onnet_ftth || 0),
		onnetNaoFtth: Number(row.onnet_nao_ftth || 0),
		total: Number(row.total || 0),
	}));
}

async function groupByTechnology(competencia) {
	const result = await db.query(
		`select case
		          when nullif(trim(tecnologia_original), '') is not null then tecnologia_original
		          when classificacao_tecnologia = 'FTTH' then 'Fibra inferida pelo plano'
		          when upper(coalesce(servico, '')) similar to '%(WIRELESS|RADIO)%' then 'Wireless / Radio'
		          when upper(coalesce(servico, '')) like '%DEDICADO%' then 'Link dedicado'
		          when upper(coalesce(servico, '')) similar to '%(B2B|CLEAR CHANNEL)%' then 'B2B / Clear Channel'
		          else 'Outro nao FTTH'
		        end as tecnologia,
		        empresa_normalizada as empresa,
		        classificacao_tecnologia as classificacao,
		        count(*)::int as total
		   from service_order_cancellation_records
		  where competencia = $1
		  group by tecnologia, empresa_normalizada, classificacao_tecnologia
		  order by total desc, tecnologia`,
		[competencia],
	);
	return result.rows.map((row) => ({
		tecnologia: row.tecnologia,
		empresa: row.empresa,
		classificacao: row.classificacao,
		total: Number(row.total || 0),
	}));
}

async function listFilterOptions(query = {}) {
	const competencia = parseCompetencia(query.competencia);
	const columns = {
		empresas: "empresa_normalizada",
		regionais: "regional_nome",
		cidades: "cidade",
		tecnologias: "tecnologia_original",
		motivos: "motivo_cancelamento",
		servicos: "servico",
	};
	const entries = await Promise.all(
		Object.entries(columns).map(async ([key, column]) => {
			const result = await db.query(
				`select distinct ${column} as value
				   from service_order_cancellation_records
				  where competencia = $1
				    and ${column} is not null
				    and ${column} <> ''
				  order by ${column}
				  limit 1000`,
				[competencia],
			);
			return [key, result.rows.map((row) => row.value)];
		}),
	);
	return Object.fromEntries(entries);
}

async function validateCompetency(competencia, user = {}) {
	const normalizedCompetencia = parseCompetencia(competencia);
	const summary = await getSummary({ competencia: normalizedCompetencia });
	await db.query(
		`insert into service_order_cancellation_competencies
		 (competencia, status, validation_status, summary, validated_summary,
		  validated_by_uid, validated_by_name, validated_at)
		 values ($1, 'SYNCED', 'VALIDATED', $2::jsonb, $2::jsonb, $3, $4, now())
		 on conflict (competencia) do update set
		   validation_status = 'VALIDATED',
		   validated_summary = $2::jsonb,
		   validated_by_uid = $3,
		   validated_by_name = $4,
		   validated_at = now(),
		   last_error = null`,
		[
			normalizedCompetencia,
			JSON.stringify(summary.competencia.summary || emptySummary()),
			user.uid || null,
			userDisplayName(user),
		],
	);
	return getCompetency(normalizedCompetencia);
}

async function listSyncHistory(query = {}) {
	await recoverStaleSyncRuns();
	const limit = parsePositiveInteger(query.limit, 20, 100);
	const result = await db.query(
		`select *
		   from service_order_cancellation_sync_runs
		  order by started_at desc
		  limit $1`,
		[limit],
	);
	return { items: result.rows.map(mapSyncRun) };
}

function escapeCsv(value) {
	const text = String(value ?? "");
	if (!/[",\n;]/.test(text)) return text;
	return `"${text.replace(/"/g, '""')}"`;
}

async function exportCsv(query = {}) {
	const { where, values } = buildFilters(query);
	const result = await db.query(
		`select *
		   from service_order_cancellation_records
		  where ${where}
		  order by data_cancelamento desc, cliente_nome nulls last`,
		values,
	);
	const columns = [
		["clienteNome", "Cliente"],
		["codigoCliente", "Codigo"],
		["clienteId", "ID Cliente"],
		["clienteServicoId", "ID Cliente Servico"],
		["empresa", "Empresa"],
		["servico", "Servico"],
		["tecnologiaOriginal", "Tecnologia"],
		["classificacaoTecnologia", "Classificacao"],
		["cidade", "Cidade"],
		["regionalNome", "Regional"],
		["dataCancelamento", "Data Cancelamento"],
		["motivoCancelamento", "Motivo"],
		["usuarioCancelamento", "Usuario Cancelamento"],
		["equipamentoComodato", "Equipamento Comodato"],
		["valor", "Valor"],
	];
	const lines = [columns.map(([, label]) => escapeCsv(label)).join(";")];
	for (const row of result.rows.map(mapRecord)) {
		lines.push(columns.map(([key]) => escapeCsv(row[key])).join(";"));
	}
	return Buffer.from(`\ufeff${lines.join("\n")}`, "utf8");
}

async function getAutomationStatus() {
	const competencia = currentCompetencia();
	const result = await db.query(
		`select * from service_order_cancellation_sync_runs
		  where competencia = $1 order by started_at desc limit 1`,
		[competencia],
	);
	const lastRun = result.rows[0] ? mapSyncRun(result.rows[0]) : null;
	const base = lastRun?.finishedAt || lastRun?.startedAt;
	return {
		enabled: true,
		intervalMinutes: 60,
		competencia,
		lastRun,
		nextRunAt: base
			? new Date(new Date(base).getTime() + AUTOMATIC_SYNC_INTERVAL_MS).toISOString()
			: new Date().toISOString(),
	};
}

async function runAutomaticSyncIfDue() {
	const status = await getAutomationStatus();
	if (status.lastRun?.status === "RUNNING" ||
		(status.lastRun && Date.now() < new Date(status.nextRunAt).getTime())) {
		return { skipped: true, status };
	}
	return startSync({ competencia: status.competencia }, {
		uid: "cancellations-hourly",
		nome: "Automacao horaria HubSoft",
	});
}

function startAutomaticSyncWorker(app) {
	if (process.env.NODE_ENV === "test" || process.env.VITEST) return null;
	if (app?.locals?.cancellationsSyncTimer) return app.locals.cancellationsSyncTimer;
	const run = () => runAutomaticSyncIfDue().catch((error) =>
		console.error("[service-order-cancellations] Falha na automacao:", error?.message || error));
	const bootstrap = setTimeout(run, 30_000);
	bootstrap.unref?.();
	const timer = setInterval(run, 5 * 60 * 1000);
	timer.unref?.();
	if (app?.locals) {
		app.locals.cancellationsSyncBootstrapTimer = bootstrap;
		app.locals.cancellationsSyncTimer = timer;
	}
	return timer;
}

module.exports = {
	MANAGE_PERMISSIONS,
	VIEW_PERMISSIONS,
	exportCsv,
	getRecord,
	getPublicCancellationCities,
	getSummary,
	getAutomationStatus,
	getSyncRun,
	listCancellations,
	listCompetencies,
	listFilterOptions,
	listSyncHistory,
	reclassifyTechnology,
	rebuildAgentCancellationTargetsRange,
	startHistorySync,
	startSync,
	startAutomaticSyncWorker,
	validateCompetency,
	_buildPublicCancellationCities: buildPublicCancellationCities,
	_mapHubsoftRow: mapHubsoftRow,
	_normalizeCompany: normalizeCompany,
	_normalizeTechnology: normalizeTechnology,
	_parseDate: parseDate,
	_parseNumber: parseNumber,
	_parseCompetencia: parseCompetencia,
	_rowBelongsToCancellationScope: rowBelongsToCancellationScope,
};
