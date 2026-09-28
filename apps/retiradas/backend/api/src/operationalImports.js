const documents = require("./documents");
const db = require("./db");
const auditLog = require("./auditLog");
const mensageriaRepository = require("./mensageriaRepository");
const ordensRepository = require("./ordensRepository");
const regionaisRepository = require("./regionaisRepository");
const { broadcastRealtime } = require("./realtime");
const {
	reconcileAppointmentsWithMapa,
} = require("./agendamentoMapaReconciliation");
const {
	buildMatchData,
	buildMatchMessages,
} = require("./operationalMatchSnapshot");
const { buildSnapshotDomain } = require("./publicDashboard");
const { randomId } = require("./secureRandom");

const DIARIO_AFTER_HOURS_HORARIO = "23:59";
const DIARIO_CADASTRO_HORARIOS = [
	"11h",
	"14h",
	"16h",
	"18h",
	DIARIO_AFTER_HOURS_HORARIO,
];

const MAPA_FONTES = {
	sempre: {
		id: "sempre",
		label: "SEMPRE",
		empresa: "SEMPRE INTERNET",
	},
	onnet: {
		id: "onnet",
		label: "ONNET",
		empresa: "ONNET",
	},
};

const ONNET_REGIONAIS = new Set([
	"triangulo mineiro",
	"alto paranaiba",
	"noroeste de minas",
	"norte de minas",
]);

const MONTHORDER = [
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

const DEFAULT_MATCH_IGNORED_TYPES = [];
const IMPORT_JOB_COLLECTION = "operational_import_jobs";
const importJobPromises = new Map();

const ORDER_DATE_ALIASES = [
	"data_cadastro",
	"data_abertura",
	"data_abertura_os",
	"data_cadastro_os",
	"data_criacao",
	"data_criacao_os",
	"data_inicio_programado",
	"dt_cadastro",
	"dt_abertura",
	"dt_criacao",
	"abertura",
	"cadastro",
];

const ORDER_PRIMARY_PHONE_ALIASES = [
	"telefone_primario",
	"telefone_principal",
	"telefone_cliente",
	"telefone_contato",
	"telefone",
	"celular",
	"celular_cliente",
	"whatsapp",
	"fone",
	"fone_cliente",
	"contato",
	"phone",
];

const ORDER_SECONDARY_PHONE_ALIASES = [
	"telefone_secundario",
	"telefone_2",
	"telefone2",
	"celular_secundario",
	"fone_2",
	"fone2",
];

const ORDER_TERTIARY_PHONE_ALIASES = [
	"telefone_terciario",
	"telefone_3",
	"telefone3",
	"celular_terciario",
	"fone_3",
	"fone3",
];

const ORDER_PHONE_LIST_ALIASES = [
	"telefones",
	"lista_telefones",
	"telefones_cliente",
	"contatos",
];

function normalizeText(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

function normalizeCityKey(value) {
	const key = String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-zA-Z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ")
		.toUpperCase();
	return key === "AGUIANIL" ? "AGUANIL" : key;
}

function normalizeCity(value) {
	const text = String(value || "").trim();
	if (!text) return null;
	const normalized = text
		.toLowerCase()
		.split(/\s+/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
	return normalizeCityKey(text) === "AGUANIL" ? "Aguanil" : normalized;
}

function getRowValue(row, aliases) {
	const normalizedRow = new Map(
		Object.entries(row || {}).map(([key, value]) => [
			normalizeText(key).replace(/[^a-z0-9]+/g, ""),
			value,
		]),
	);

	for (const alias of aliases) {
		const key = normalizeText(alias).replace(/[^a-z0-9]+/g, "");
		if (!normalizedRow.has(key)) continue;
		const value = normalizedRow.get(key);
		if (value === undefined || value === null || value === "") continue;
		return value;
	}
	return null;
}

function getFirstRowValue(row, aliases) {
	for (const alias of aliases) {
		const value = getRowValue(row, [alias]);
		if (value !== null && value !== undefined && value !== "") return value;
	}
	return null;
}

function normalizePhone(value) {
	return String(value || "").replace(/\D/g, "");
}

function normalizeMensageriaPhone(value) {
	let digits = normalizePhone(value);
	if (!digits) return "";
	if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
	return digits;
}

function normalizeMac(value) {
	const mac = String(value || "")
		.replace(/[^a-fA-F0-9]/g, "")
		.toUpperCase();
	if (mac === "FFFFFFFFFFFF") return "";
	return mac.length === 12 ? mac : "";
}

function buildMacCandidates(...values) {
	return [...new Set(values.map(normalizeMac).filter(Boolean))];
}

function parsePhoneList(value) {
	if (!value) return [];
	return String(value)
		.split(/[;,|/\n]+/g)
		.map(normalizePhone)
		.filter(Boolean);
}

function uniqueValues(values) {
	return [...new Set(values.filter(Boolean))];
}

function readAnyField(source, fields = []) {
	for (const field of fields) {
		const value = source?.[field];
		if (value !== undefined && value !== null && String(value).trim() !== "")
			return value;
	}
	return "";
}

function readPhoneFromOrder(order = {}) {
	const direct = readAnyField(order, [
		"telefone",
		"telefone_primario",
		"celular",
		"fone",
		"whatsapp",
		"contato",
		"phone",
	]);
	if (direct) return direct;
	if (Array.isArray(order.telefones)) {
		return order.telefones.find((item) => normalizePhone(item)) || "";
	}
	return "";
}

function normalizeMapaFonte(value) {
	const raw = normalizeText(value);
	return raw.includes("onnet") ? "onnet" : "sempre";
}

function getMapaFonteConfig(value) {
	return MAPA_FONTES[normalizeMapaFonte(value)] || MAPA_FONTES.sempre;
}

function getMapaFontesSelecionadas(data = {}, fallbackFontes = ["sempre"]) {
	// Extraido pra achado javascript:S3358 (ternario aninhado).
	let rawFontes = [data?.fonte || data?.periodo?.fonte].filter(Boolean);
	if (Array.isArray(data?.fontes)) rawFontes = data.fontes;
	else if (Array.isArray(data?.periodo?.fontes)) rawFontes = data.periodo.fontes;

	const fontes = [...new Set(rawFontes.map(normalizeMapaFonte))].filter(
		(fonte) => MAPA_FONTES[fonte],
	);

	return fontes.length > 0 ? fontes : fallbackFontes;
}

function getMapaFonteLabel(fontes = []) {
	const normalized = [...new Set(fontes.map(normalizeMapaFonte))];
	if (normalized.includes("sempre") && normalized.includes("onnet"))
		return "SEMPRE + ONNET";
	return MAPA_FONTES[normalized[0]]?.label || MAPA_FONTES.sempre.label;
}

function getFonteMapaPorRegional(regional) {
	return ONNET_REGIONAIS.has(normalizeText(regional)) ? "onnet" : "sempre";
}

function normalizeStatus(status) {
	const value = String(status || "")
		.trim()
		.toLowerCase()
		.replace(/_/g, " ");
	if (!value) return null;
	if (value.startsWith("pendente")) return "Pendente";
	if (value.includes("aguardando") && value.includes("agendamento")) {
		return "Aguardando Agendamento";
	}
	return null;
}

function sanitizeId(value) {
	return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function buildMapaDocumentId(numOs, fonte) {
	const baseId = sanitizeId(numOs);
	return fonte === "onnet" ? `onnet_${baseId}` : baseId;
}

function parseCoordinates(raw) {
	if (!raw) return null;
	const parts = String(raw)
		.split(",")
		.map((item) => Number.parseFloat(String(item).trim()));
	if (parts.length !== 2 || parts.some((item) => Number.isNaN(item)))
		return null;
	return { latitude: parts[0], longitude: parts[1] };
}

function extractCity(address) {
	if (!address) return null;
	const match = String(address).match(/,\s*([^,|/]+)\/MG/i);
	return match ? match[1].trim().toUpperCase() : null;
}

function formatDatePartsPtBr(
	year,
	month,
	day,
	hour = 0,
	minute = 0,
	second = 0,
) {
	const date = new Date(year, month - 1, day, hour, minute, second);
	const isValid =
		date.getFullYear() === year &&
		date.getMonth() === month - 1 &&
		date.getDate() === day;
	if (!isValid || year <= 1990) return "";

	const datePart = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
	const hasTime = hour > 0 || minute > 0 || second > 0;
	return hasTime
		? `${datePart} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`
		: datePart;
}

function normalizeMapaDateValue(value) {
	if (value === undefined || value === null || value === "") return "";
	const text = String(value).trim();
	const numeric = Number(text);
	if (Number.isFinite(numeric) && numeric > 0) {
		const wholeDays = Math.floor(numeric);
		const dayFraction = numeric - wholeDays;
		const date = new Date(1899, 11, 30 + wholeDays);
		const totalSeconds = Math.round(dayFraction * 24 * 60 * 60);
		date.setSeconds(totalSeconds);
		return formatDatePartsPtBr(
			date.getFullYear(),
			date.getMonth() + 1,
			date.getDate(),
			date.getHours(),
			date.getMinutes(),
			date.getSeconds(),
		);
	}

	const brMatch = text.match(
		/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
	);
	if (brMatch) {
		const [, dayRaw, monthRaw, yearRaw, hourRaw, minuteRaw, secondRaw] =
			brMatch;
		const yearNumber = Number(yearRaw);
		return (
			formatDatePartsPtBr(
				yearNumber < 100 ? 2000 + yearNumber : yearNumber,
				Number(monthRaw),
				Number(dayRaw),
				Number(hourRaw || 0),
				Number(minuteRaw || 0),
				Number(secondRaw || 0),
			) || text
		);
	}

	return text;
}

function buildAddress({ endereco, numero, bairro }) {
	return [endereco, numero, bairro].filter(Boolean).join(", ");
}

async function loadCityMap() {
	const rows = await regionaisRepository.listAllRegionalDocuments();
	const toolRows = await documents.listAllDocuments("ferramentas_regionais");
	const cityMap = {};

	function addRegional(data = {}) {
		const regionalName = data.nome || "Sem Regional";
		(data.cidades || []).forEach((city) => {
			const cityName = normalizeCity(city?.nome || city);
			const key = normalizeCityKey(cityName);
			if (!key) return;
			const kind = normalizeText(city?.tipo || city?.tipoCidade || "");
			const current = cityMap[key] || {};
			cityMap[key] = {
				nome: cityName,
				regional: regionalName,
				agente:
					current.agente === true ||
					city?.agente === true ||
					kind.includes("agente"),
			};
		});
	}

	[...toolRows, ...rows].forEach((row) => addRegional(row.data || {}));
	return cityMap;
}

async function loadMatchIgnoredTypes() {
	const config = await documents.getDocument("config/match_os");
	const extras = Array.isArray(config?.data?.tiposIgnoradosAdicionais)
		? config.data.tiposIgnoradosAdicionais
		: [];
	const unique = [
		...new Set(extras.map((item) => String(item || "").trim()).filter(Boolean)),
	];
	return { adicionais: extras, todos: unique };
}

// Constroi o registro de ordem a partir de uma linha da planilha, ou
// devolve o motivo pelo qual a linha deve ser ignorada. Extraido de
// buildOrdersFromRows (achado javascript:S3776) — cada "return" antigo
// virou um "status" de retorno, sem mudar nenhuma regra de negocio.
// Extraido de buildOrderFromRow (achado javascript:S3776,
// docs/SONARQUBE-MAP.md).
function isIgnoredOrderType(tipo, ignoredTypes) {
	const normalizedType = normalizeText(tipo);
	return ignoredTypes.todos.some((item) => normalizeText(item) === normalizedType);
}

// Agrupa a extracao de contato/localizacao da linha (telefones, MAC/PHY,
// coordenadas), mesma logica de antes.
function extractOrderContactInfo(row) {
	const numero = getRowValue(row, ["numero"]);
	const bairro = getRowValue(row, ["bairro"]);
	const coordenadas = getRowValue(row, ["coordenadas"]);
	const coords = parseCoordinates(coordenadas);
	const telefonePrimario = getFirstRowValue(row, ORDER_PRIMARY_PHONE_ALIASES);
	const telefoneSecundario = getFirstRowValue(
		row,
		ORDER_SECONDARY_PHONE_ALIASES,
	);
	const telefoneTerciario = getFirstRowValue(row, ORDER_TERTIARY_PHONE_ALIASES);
	const macAddr = getRowValue(row, [
		"mac_addr",
		"mac addr",
		"macaddr",
		"mac",
		"mac_address",
	]);
	const phyAddr = getRowValue(row, [
		"phy_addr",
		"phy addr",
		"phyaddr",
		"phy",
		"phy_address",
	]);
	const macCandidates = buildMacCandidates(macAddr, phyAddr);
	const telefones = uniqueValues([
		normalizePhone(telefonePrimario),
		normalizePhone(telefoneSecundario),
		normalizePhone(telefoneTerciario),
		...parsePhoneList(getFirstRowValue(row, ORDER_PHONE_LIST_ALIASES)),
	]);
	return {
		numero,
		bairro,
		coordenadas,
		coords,
		telefonePrimario,
		telefoneSecundario,
		telefoneTerciario,
		macAddr,
		phyAddr,
		macCandidates,
		telefones,
	};
}

// Monta o objeto de ordem final a partir dos campos ja resolvidos, mesmos
// campos/ternarios de antes (so extraido pra funcao propria pra tirar
// esses ~8 ternarios do orcamento de complexidade de buildOrderFromRow).
function buildOrderRecord(row, ctx) {
	const {
		numOs, fonteConfig, statusNorm, tipo, info, cidadeInformada, dataCadastro,
		endereco, numero, bairro, coordenadas, coords,
		telefonePrimario, telefoneSecundario, telefoneTerciario, telefones,
		macAddr, phyAddr, macCandidates,
	} = ctx;
	return {
		num_os: String(numOs),
		empresa: fonteConfig.empresa,
		fonte: fonteConfig.id,
		status: statusNorm,
		tipo,
		cidade: info.nome || cidadeInformada,
		regional: info.regional || "Sem Regional",
		agente: info.agente === true,
		codigo_cliente: getRowValue(row, ["codigo_cliente", "codigo"])
			? String(getRowValue(row, ["codigo_cliente", "codigo"]))
			: "",
		nome_cliente: getRowValue(row, [
			"nome_razaosocial",
			"cliente",
			"nome_cliente",
		])
			? String(
					getRowValue(row, ["nome_razaosocial", "cliente", "nome_cliente"]),
				).trim()
			: "",
		id_cliente_servico: getRowValue(row, [
			"id_cliente_servico",
			"cliente_servico",
			"id_servico",
		])
			? String(
					getRowValue(row, [
						"id_cliente_servico",
						"cliente_servico",
						"id_servico",
					]),
				).trim()
			: "",
		servico: getRowValue(row, ["servico", "plano", "nome_plano"])
			? String(getRowValue(row, ["servico", "plano", "nome_plano"])).trim()
			: "",
		numero_plano: getRowValue(row, ["numero_plano"])
			? String(getRowValue(row, ["numero_plano"])).trim()
			: "",
		data_cadastro: dataCadastro,
		data_abertura_os: dataCadastro,
		telefone: telefones[0] || "",
		telefone_primario: normalizePhone(telefonePrimario),
		telefone_secundario: normalizePhone(telefoneSecundario),
		telefone_terciario: normalizePhone(telefoneTerciario),
		telefones,
		mac_addr: normalizeMac(macAddr),
		phy_addr: normalizeMac(phyAddr),
		macs_equipamento: macCandidates,
		tecnico: getRowValue(row, ["tecnicos", "tecnico"])
			? String(getRowValue(row, ["tecnicos", "tecnico"])).trim()
			: "",
		endereco: endereco ? String(endereco).trim() : "",
		numero: numero ? String(numero).trim() : "",
		bairro: bairro ? String(bairro).trim() : "",
		endereco_resumo: buildAddress({
			endereco: endereco ? String(endereco).trim() : "",
			numero: numero ? String(numero).trim() : "",
			bairro: bairro ? String(bairro).trim() : "",
		}),
		coordenadas: coordenadas ? String(coordenadas).trim() : "",
		latitude: coords?.latitude ?? null,
		longitude: coords?.longitude ?? null,
	};
}

function buildOrderFromRow(row, { cityMap, ignoredTypes, fontesSet, forMatch }) {
	const numOs = getRowValue(row, [
		"numero_ordem_servico",
		"num_o_s",
		"num_os",
		"numero_os",
	]);
	const status = getRowValue(row, ["status"]);
	const tipoRaw = getRowValue(row, ["tipo_ordem_servico", "tipo"]);
	const tipo = String(tipoRaw || "").trim();
	if (!numOs || !tipo || tipo === "-" || status === "-") {
		return { status: "skip" };
	}

	if (forMatch && isIgnoredOrderType(tipo, ignoredTypes)) {
		return { status: "ignoredByType", tipo };
	}

	const statusNorm = normalizeStatus(status);
	if (!statusNorm) return { status: "skip" };

	const endereco = getRowValue(row, ["endereco", "endereco_instalacao"]);
	const cidadeRaw = getRowValue(row, ["cidade"]) || extractCity(endereco);
	const cidadeInformada = normalizeCity(cidadeRaw);
	if (!cidadeInformada) return { status: "skip" };

	const regionalRaw = getRowValue(row, [
		"regional",
		"regiao",
		"região",
		"nome_regional",
		"regional_atendimento",
	]);
	const info = cityMap[normalizeCityKey(cidadeInformada)] || {
		nome: cidadeInformada,
		regional: regionalRaw ? String(regionalRaw).trim() : "Sem Regional",
		agente: false,
	};
	if (forMatch && (!info.regional || info.regional === "Sem Regional")) {
		return { status: "ignoredNoRegional" };
	}

	const fonteDaLinha = getFonteMapaPorRegional(info.regional);
	if (!fontesSet.has(fonteDaLinha)) return { status: "skip" };

	const fonteConfig = getMapaFonteConfig(fonteDaLinha);
	const dataCadastro = normalizeMapaDateValue(
		getFirstRowValue(row, ORDER_DATE_ALIASES),
	);
	const contactInfo = extractOrderContactInfo(row);
	const id = buildMapaDocumentId(numOs, fonteConfig.id);

	const order = buildOrderRecord(row, {
		numOs,
		id,
		fonteConfig,
		statusNorm,
		tipo,
		info,
		cidadeInformada,
		dataCadastro,
		endereco,
		...contactInfo,
	});

	return { status: "ok", id, order };
}

async function buildOrdersFromRows(
	rows = [],
	fontesSelecionadas = ["sempre"],
	{ forMatch = false } = {},
) {
	const cityMap = await loadCityMap();
	const ignoredTypes = forMatch
		? await loadMatchIgnoredTypes()
		: { adicionais: [], todos: [] };
	const fontesSet = new Set(fontesSelecionadas.map(normalizeMapaFonte));
	const ordensNovas = {};
	let ignoradasSemRegional = 0;
	let ignoradasPorTipo = 0;
	const ignoradasTipos = {};

	rows.forEach((row) => {
		const result = buildOrderFromRow(row, {
			cityMap,
			ignoredTypes,
			fontesSet,
			forMatch,
		});
		if (result.status === "ignoredByType") {
			ignoradasPorTipo += 1;
			ignoradasTipos[result.tipo] = (ignoradasTipos[result.tipo] || 0) + 1;
			return;
		}
		if (result.status === "ignoredNoRegional") {
			ignoradasSemRegional += 1;
			return;
		}
		if (result.status !== "ok") return;
		ordensNovas[result.id] = result.order;
	});

	return {
		ordensNovas,
		ignoradasSemRegional,
		ignoradasPorTipo,
		ignoradasTipos,
		tiposIgnoradosAplicados: ignoredTypes.todos,
		tiposIgnoradosAdicionais: ignoredTypes.adicionais,
	};
}

function buildMapaSnapshot(ordens = []) {
	const regionais = {};
	const agentes = {};
	const rankingRegionais = {};
	const rankingAgentes = {};
	const kpis = {
		total: ordens.length,
		pendente: 0,
		aguardando: 0,
		totalRegional: 0,
		totalAgente: 0,
	};

	ordens.forEach((order) => {
		const statusKey = order.status === "Pendente" ? "pendente" : "aguardando";
		const type = order.tipo || "Outros";
		if (order.status === "Pendente") kpis.pendente += 1;
		if (order.status === "Aguardando Agendamento") kpis.aguardando += 1;

		if (order.agente) {
			kpis.totalAgente += 1;
			const city = order.cidade || "Desconhecida";
			if (!agentes[city])
				agentes[city] = {
					pendente: {},
					aguardando: {},
					regional: order.regional || "",
				};
			agentes[city][statusKey][type] =
				(agentes[city][statusKey][type] || 0) + 1;
			rankingAgentes[city] = (rankingAgentes[city] || 0) + 1;
			return;
		}

		kpis.totalRegional += 1;
		const regional = order.regional || "Sem Regional";
		const city = order.cidade || "Desconhecida";
		if (!regionais[regional]) regionais[regional] = {};
		if (!regionais[regional][city])
			regionais[regional][city] = { pendente: {}, aguardando: {} };
		regionais[regional][city][statusKey][type] =
			(regionais[regional][city][statusKey][type] || 0) + 1;
		rankingRegionais[city] = (rankingRegionais[city] || 0) + 1;
	});

	const totalCity = (cityData) =>
		Object.values(cityData.pendente || {}).reduce(
			(sum, value) => sum + value,
			0,
		) +
		Object.values(cityData.aguardando || {}).reduce(
			(sum, value) => sum + value,
			0,
		);

	return {
		totalOrdens: ordens.length,
		kpis,
		chartRegionais: Object.entries(regionais)
			.map(([regional, cities]) => ({
				regional,
				total: Object.values(cities).reduce(
					(sum, cityData) => sum + totalCity(cityData),
					0,
				),
			}))
			.sort((a, b) => b.total - a.total),
		rankingRegionais: Object.entries(rankingRegionais)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([cidade, total]) => ({ cidade, total })),
		rankingAgentes: Object.entries(rankingAgentes)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([cidade, total]) => ({ cidade, total })),
		regionais,
		agentes,
	};
}

function shouldReportImportProgress(processed, total, step = 1000) {
	return processed === 1 || processed === total || processed % step === 0;
}

function calculateImportProgressPercent(processed, total, startPercent, endPercent) {
	if (!total) return endPercent;
	const progress = processed / total;
	return Math.min(
		endPercent,
		Math.round(startPercent + (endPercent - startPercent) * progress),
	);
}

async function upsertMany(collectionPath, docsMap, progress = null) {
	const entries = Object.entries(docsMap || {});
	const total = entries.length;
	let processed = 0;
	for (const [documentId, data] of entries) {
		const record = {
			path: `${collectionPath}/${documentId}`,
			collectionPath,
			documentId,
			parentPath: null,
			data,
		};
		if (ordensRepository.isOrdersCollection(collectionPath)) {
			await ordensRepository.upsertDocument(record, { returnDocument: false });
		} else {
			await documents.upsertDocument(record);
		}
		processed += 1;
		if (
			progress?.update &&
			shouldReportImportProgress(processed, total, progress.step)
		) {
			await progress.update({
				stage: `${progress.stage} (${processed}/${total})`,
				percent: calculateImportProgressPercent(
					processed,
					total,
					progress.startPercent,
					progress.endPercent,
				),
				processedDocuments: processed,
				totalDocuments: total,
			});
		}
	}
}

async function getCollectionMap(collectionPath) {
	const rows = await documents.listAllDocuments(collectionPath);
	return rows.reduce((acc, row) => {
		acc[row.documentId] = row.data || {};
		return acc;
	}, {});
}

async function saveImportRun(type, payload = {}, uid = null) {
	const id = randomId(type);
	await documents.upsertDocument({
		path: `operational_import_runs/${id}`,
		collectionPath: "operational_import_runs",
		documentId: id,
		parentPath: null,
		data: {
			...payload,
			tipo: type,
			createdBy: uid,
			createdAt: new Date().toISOString(),
		},
	});
	return id;
}

async function saveImportJobStatus(job) {
	await documents.upsertDocument({
		path: `${IMPORT_JOB_COLLECTION}/${job.id}`,
		collectionPath: IMPORT_JOB_COLLECTION,
		documentId: job.id,
		parentPath: null,
		data: job,
	});
	return job;
}

async function getImportJob(jobId) {
	const id = String(jobId || "").trim();
	if (!id) return null;
	const doc = await documents.getDocument(`${IMPORT_JOB_COLLECTION}/${id}`);
	return doc?.data || null;
}

async function markInterruptedImportJobs() {
	const now = new Date().toISOString();
	const result = await db.query(
		`update app_documents
		    set data = data
		      || jsonb_build_object(
		           'status', 'failed',
		           'stage', 'Interrompido',
		           'percent', 100,
		           'error', 'Importacao interrompida por reinicio da API. Envie o arquivo novamente.',
		           'finishedAt', $1::text,
		           'updatedAt', $1::text
		         )
		  where collection_path = $2
		    and data->>'status' = 'running'
		  returning document_id`,
		[now, IMPORT_JOB_COLLECTION],
	);
	if (result.rowCount) {
		console.warn(
			`[operationalImports] ${result.rowCount} job(s) interrompido(s) marcado(s) como falha.`,
		);
	}
	return result.rowCount || 0;
}

async function updateImportJob(jobId, patch = {}) {
	const current = (await getImportJob(jobId)) || { id: jobId };
	return saveImportJobStatus({
		...current,
		...patch,
		updatedAt: new Date().toISOString(),
	});
}

async function createImportJob(type, payload = {}, user = {}) {
	const id = randomId(type);
	const now = new Date().toISOString();
	const job = {
		id,
		type,
		status: "queued",
		stage: "Aguardando processamento",
		percent: 0,
		processedRows: 0,
		totalRows: Array.isArray(payload.rows) ? payload.rows.length : 0,
		result: null,
		error: "",
		createdAt: now,
		updatedAt: now,
		startedAt: null,
		finishedAt: null,
		createdBy: user?.uid || null,
		createdByName: user?.profile?.nome || user?.nome || "",
	};
	await saveImportJobStatus(job);
	setImmediate(() => {
		const promise = runImportJob(id, type, payload, user)
			.catch((error) => {
				console.error(`[operationalImports] Falha no job ${id}:`, error);
			})
			.finally(() => {
				importJobPromises.delete(id);
			});
		importJobPromises.set(id, promise);
	});
	return {
		accepted: true,
		jobId: id,
		status: job.status,
		stage: job.stage,
		percent: job.percent,
		totalRows: job.totalRows,
	};
}

async function runImportJob(jobId, type, payload = {}, user = {}) {
	await updateImportJob(jobId, {
		status: "running",
		stage: "Iniciando processamento",
		percent: 2,
		startedAt: new Date().toISOString(),
		error: "",
	});

	try {
		const context = {
			jobId,
			update: (patch) => updateImportJob(jobId, patch),
		};
		const result =
			type === "match"
				? await persistMatchImport(payload, user, context)
				: await persistMapaImport(payload, user, context);
		await updateImportJob(jobId, {
			status: "completed",
			stage: "Concluido",
			percent: 100,
			processedRows: Array.isArray(payload.rows) ? payload.rows.length : 0,
			result,
			finishedAt: new Date().toISOString(),
		});
		broadcastImportResult(type, result);
		return result;
	} catch (error) {
		await updateImportJob(jobId, {
			status: "failed",
			stage: "Erro",
			percent: 100,
			error: error?.message || "Falha ao processar importacao.",
			finishedAt: new Date().toISOString(),
		});
		throw error;
	}
}

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveImportSourceLabel(source) {
	if (source === "match") return "MATCH";
	if (source === "mapa") return "Mapa";
	return "Operacional";
}

function broadcastImportResult(type, result = {}) {
	const source = result?.source || type;
	const payload = {
		...result,
		source,
		sourceLabel: resolveImportSourceLabel(source),
		message:
			result?.message ||
			(source === "match"
				? `MATCH atualizado: ${Number(result?.totalGeral || result?.total || 0)} O.S carregadas.`
				: `Mapa atualizado: ${Number(result?.totalGeral || result?.total || 0)} O.S em aberto.`),
		updatedAt: result?.generatedAt || new Date().toISOString(),
	};
	broadcastRealtime(source, payload);
	broadcastRealtime("dashboard", payload);
	broadcastRealtime("acompanhamento", payload);
}

async function publishAcompanhamentoUpdate(source, payload = {}) {
	const nowIso = new Date().toISOString();
	const sourceLabels = {
		mapa: "Mapa",
		match: "MATCH",
		metas: "Metas",
	};

	await documents.upsertDocument({
		path: "config/acompanhamento_atualizacoes",
		collectionPath: "config",
		documentId: "acompanhamento_atualizacoes",
		parentPath: null,
		data: {
			source,
			sourceLabel: sourceLabels[source] || "Operacional",
			message: payload.message || "Novas informacoes atualizadas.",
			notify: payload.notify === true,
			notifyAcompanhamento: payload.notifyAcompanhamento === true,
			lastUpdateKey: `${source}-${Date.now()}`,
			generatedAt: payload.generatedAt || nowIso,
			updatedAt: nowIso,
			summary: payload.summary || null,
			updatedBy: payload.updatedBy || null,
		},
	});
}

async function refreshStaticSnapshot(
	domain,
	generatedAt = new Date().toISOString(),
	options = {},
) {
	const snapshot = await buildSnapshotDomain(domain, options);
	if (!snapshot) return;
	await db.query(
		`insert into static_snapshots (domain, data, generated_at)
     values ($1, $2, $3)
     on conflict (domain)
     do update set
       data = excluded.data,
       generated_at = excluded.generated_at`,
		[domain, JSON.stringify(snapshot), generatedAt],
	);
}

async function refreshDashboardSnapshot(generatedAt = new Date().toISOString()) {
	await refreshStaticSnapshot("dashboard", generatedAt, { compact: true });
}

async function refreshOperationalSnapshot(
	generatedAt = new Date().toISOString(),
) {
	await refreshStaticSnapshot("operacional", generatedAt, { compact: true });
}

async function getMensageriaConfig() {
	return mensageriaRepository.getMessagingConfig().catch(() => ({}));
}

const MENSAGERIA_MAP_DIFF_TERMINAL_STATUSES = new Set([
	"agendado",
	"cancelado",
	"concluido",
	"concluído",
	"descartado",
	"duplicado",
	"enviado",
	"ignorado",
]);

const MENSAGERIA_EXCLUDED_OS_TYPES = new Set([
	"CANCELAMENTO OUTROS",
	"RETIRADA OUTROS",
]);

const MENSAGERIA_ALLOWED_OS_TYPES = new Set([
	"CANCELAMENTO FTTH",
	"RETIRADA FTTH",
	"RETIRADA CANCELAMENTO SEGUNDA TENTATIVA",
	"CANCELAMENTO LOJA",
]);

function isActiveMensageriaQueueEntry(item = {}) {
	const status = String(item.status || "").trim().toLowerCase();
	return !MENSAGERIA_MAP_DIFF_TERMINAL_STATUSES.has(status);
}

function normalizeMensageriaOrderType(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, " ")
		.trim();
}

function getMensageriaOrderTypeCandidates(item = {}) {
	return [
		item.tipo,
		item.tipo_ordem_servico,
		item.tipoOrdemServico,
		item.nome_tipo_ordem_servico,
		item.nomeTipoOrdemServico,
		item.tipo_os,
		item.tipoOs,
	].map(normalizeMensageriaOrderType).filter(Boolean);
}

function isExcludedMensageriaOrderType(item = {}) {
	return getMensageriaOrderTypeCandidates(item).some((value) =>
		MENSAGERIA_EXCLUDED_OS_TYPES.has(value),
	);
}

function isAllowedMensageriaOrderType(item = {}) {
	return getMensageriaOrderTypeCandidates(item).some((value) =>
		MENSAGERIA_ALLOWED_OS_TYPES.has(value),
	);
}

async function getMensageriaQueueItemsByKey({ includeInactive = false } = {}) {
	const items = await mensageriaRepository.listAllQueueMessages().catch(() => []);
	const itemsByKey = new Map();
	for (const item of items.filter((entry) => includeInactive || isActiveMensageriaQueueEntry(entry))) {
		const key = `${String(item.os || "").trim()}|${normalizeMensageriaPhone(item.telefone)}`;
		if (key === "|") continue;
		const current = itemsByKey.get(key);
		const currentTime = new Date(
			current?.prioridadeEm || current?.criadoEm || current?.createdAt || 0,
		).getTime();
		const itemTime = new Date(
			item.prioridadeEm || item.criadoEm || item.createdAt || 0,
		).getTime();
		if (!current || itemTime > currentTime) itemsByKey.set(key, item);
	}
	return itemsByKey;
}

function isFinalMensageriaQueueEntry(item = {}) {
	const status = String(item.status || "").trim().toLowerCase();
	return ["agendado", "concluido", "concluído", "enviado"].includes(status);
}

function dateOnlyFromOrder(value) {
	const text = String(value || "").trim();
	if (!text) return "";
	const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
	const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
	if (br) {
		return `${br[3]}-${String(br[2]).padStart(2, "0")}-${String(br[1]).padStart(2, "0")}`;
	}
	const parsed = new Date(text);
	if (Number.isNaN(parsed.getTime())) return "";
	return parsed.toISOString().slice(0, 10);
}

function isRecentMensageriaOrder(order = {}, lookbackDays = 2) {
	const rawDate = readAnyField(order, [
		"data_abertura_os",
		"data_cadastro",
		"data_abertura",
		"abertura",
		"data",
	]);
	const dateOnly = dateOnlyFromOrder(rawDate);
	if (!dateOnly) return false;
	const orderDate = new Date(`${dateOnly}T12:00:00.000Z`);
	const today = new Date();
	today.setUTCHours(12, 0, 0, 0);
	const minDate = new Date(today);
	minDate.setUTCDate(minDate.getUTCDate() - Number(lookbackDays || 2));
	return orderDate >= minDate;
}

function buildMensageriaQueueItemFromOrder(
	order = {},
	id = "",
	config = {},
	createdAt = new Date().toISOString(),
) {
	const clienteRaw = String(
		readAnyField(order, [
			"nome_cliente",
			"cliente",
			"nome_razaosocial",
			"assinante",
		]),
	);
	const cliente = clienteRaw
		.replace(/^\s*\(\d+\)\s*/, "")
		.replace(/\s*-\s*\((?:INATIVO|ATIVO)\)\s*$/i, "")
		.replace(/\s*\((?:INATIVO|ATIVO)\)\s*$/i, "")
		.replace(/\s+/g, " ")
		.trim();
	const telefone = String(readPhoneFromOrder(order));
	const endereco = String(
		readAnyField(order, ["endereco_resumo", "endereco", "logradouro"]),
	);
	const codigoCliente =
		String(readAnyField(order, ["codigo_cliente", "codigo"])) ||
		clienteRaw.match(/^\s*\((\d+)\)/)?.[1] ||
		"";
	return {
		cliente: cliente || "Cliente nao informado",
		codigo_cliente: codigoCliente,
		contrato:
			String(
				readAnyField(order, ["contrato", "codigo_contrato", "id_contrato"]),
			) || id,
		os:
			String(
				readAnyField(order, [
					"num_os",
					"os",
					"numero_os",
					"numero_ordem_servico",
				]),
			) || id,
		cidade: String(readAnyField(order, ["cidade"])) || "Cidade nao informada",
		regional: String(readAnyField(order, ["regional"])) || "Sem Regional",
		endereco,
		telefone,
		telefone_digits: normalizeMensageriaPhone(telefone),
		data_abertura_os: String(
			readAnyField(order, [
				"data_abertura",
				"data_abertura_os",
				"abertura",
				"data",
			]),
		),
		status_os: String(readAnyField(order, ["status"])) || "Aberta",
		tipo:
			String(readAnyField(order, ["tipo", "tipo_ordem_servico"])) ||
			"Tipo nao informado",
		origem: "Mapa - diferenca automatica",
		origemTipo: "mapa_diff",
		prioridadeEm: createdAt,
		diffMapaEm: createdAt,
		templateId: config.activeTemplateId || "cancelamento",
		status: config.autoSend && config.approvedTemplate ? "aprovado" : "novo",
		tentativas: 0,
		requiredCentralButton: true,
		centralButtonText: "Falar com a central",
		centralButtonPhone: "+55 31 3987-0880",
		centralButtonMessage: config.buttonMessage || "",
		criadoEm: createdAt,
		atualizadoEm: createdAt,
	};
}

async function enqueueNewMapOrdersForMensageria(newEntries = [], user = {}) {
	const config = await getMensageriaConfig();
	if (config.autoEnqueueMapDiff === false)
		return { created: 0, skipped: newEntries.length, disabled: true };
	const diffBatchAt = new Date().toISOString();
	if (!newEntries.length) {
		return {
			created: 0,
			skipped: 0,
			disabled: false,
			reprioritized: 0,
		};
	}

	const allowedCities = new Set(
		(Array.isArray(config.autoEnqueueCities) ? config.autoEnqueueCities : [])
			.map(normalizeCityKey)
			.filter(Boolean),
	);
	const queueItemsByKey = await getMensageriaQueueItemsByKey({
		includeInactive: true,
	});
	let created = 0;
	let skipped = 0;
	let reprioritized = 0;
	const skippedReasons = {
		semTelefone: 0,
		cidadeForaFiltro: 0,
		tipoNaoPermitido: 0,
		jaFinalizado: 0,
	};
	const skippedSamples = [];

	function trackSkipped(reason, id, item) {
		skipped += 1;
		if (skippedReasons[reason] !== undefined) {
			skippedReasons[reason] += 1;
		}
		if (skippedSamples.length < 10) {
			skippedSamples.push({
				id,
				os: item?.os || id,
				cidade: item?.cidade || "",
				motivo: reason,
			});
		}
	}

	for (const [id, order] of newEntries) {
		const item = buildMensageriaQueueItemFromOrder(
			order,
			id,
			config,
			diffBatchAt,
		);
		if (isExcludedMensageriaOrderType(item)) {
			trackSkipped("tipoNaoPermitido", id, item);
			continue;
		}
		if (!isAllowedMensageriaOrderType(item)) {
			trackSkipped("tipoNaoPermitido", id, item);
			continue;
		}
		if (!item.telefone_digits) {
			trackSkipped("semTelefone", id, item);
			continue;
		}
		if (
			allowedCities.size &&
			!allowedCities.has(normalizeCityKey(item.cidade))
		) {
			trackSkipped("cidadeForaFiltro", id, item);
			continue;
		}
		const key = `${item.os}|${item.telefone_digits}`;
		const existingItem = queueItemsByKey.get(key);
		if (existingItem && isFinalMensageriaQueueEntry(existingItem)) {
			trackSkipped("jaFinalizado", id, item);
			continue;
		}
		if (config.avoidDuplicates !== false && existingItem) {
			await mensageriaRepository.updateQueueMessage(existingItem.id, {
				...existingItem,
				...item,
				id: existingItem.id,
				criadoPor: existingItem.criadoPor || existingItem.criado_por || user.uid || null,
				tentativas: 0,
				ultimoErro: "",
				ultimo_erro: "",
				ultimoEnvioEm: "",
				ultimo_envio_em: "",
				envioLockId: "",
				envio_lock_id: "",
				envioLockEm: "",
				envio_lock_em: "",
				atualizadoEm: diffBatchAt,
				atualizado_em: diffBatchAt,
				repriorizadoEm: diffBatchAt,
				repriorizadoPor: user.uid || null,
				repriorizadoMotivo: "O.S. voltou na diferenca mais recente do mapa.",
			});
			queueItemsByKey.set(key, { ...existingItem, ...item, id: existingItem.id });
			reprioritized += 1;
			continue;
		}
		const docId = `mapa_${sanitizeId(item.os || id)}_${Date.now()}_${created}`;
		await mensageriaRepository.enqueueMessage(
			{
				...item,
				criadoPor: user.uid || null,
			},
			{ id: docId },
		);
		queueItemsByKey.set(key, { ...item, id: docId });
		created += 1;
	}

	return {
		created,
		skipped,
		disabled: false,
		reprioritized,
		skippedReasons,
		skippedSamples,
	};
}

async function ensureOpenMapOrdersInMensageria(finalMap = {}, user = {}) {
	const config = await getMensageriaConfig();
	const lookbackDays = Math.max(
		0,
		Math.min(Number(config.autoEnqueueBackfillDays ?? 8), 30),
	);
	const entries = Object.entries(finalMap || {}).filter(([, order]) => {
		const item = buildMensageriaQueueItemFromOrder(order, "", {}, "");
		return (
			isRecentMensageriaOrder(order, lookbackDays) &&
			!isExcludedMensageriaOrderType(item) &&
			isAllowedMensageriaOrderType(item)
		);
	});
	return enqueueNewMapOrdersForMensageria(entries, user);
}

async function reconcileMensageriaQueueWithOpenMap(finalMap = {}) {
	const queue = await mensageriaRepository.listAllQueueMessages().catch(() => []);
	const activeStatuses = new Set([
		"novo",
		"aprovado",
		"aguardando_janela",
		"falhou",
		"duplicado",
	]);
	const openOs = new Set(
		Object.entries(finalMap)
			.flatMap(([id, order]) => [
				id,
				order?.num_os,
				order?.os,
				order?.numero_os,
				order?.numero_ordem_servico,
			])
			.map((value) => String(value || "").trim())
			.filter(Boolean),
	);
	let checked = 0;
	let removed = 0;
	for (const item of queue) {
		if (!activeStatuses.has(String(item.status || "novo"))) continue;
		checked += 1;
		if (isExcludedMensageriaOrderType(item)) {
			removed += 1;
			await mensageriaRepository.updateQueueMessage(item.id, {
				...item,
				status: "ignorado",
				ultimoErro:
					"Removido automaticamente: tipo de O.S. não entra na fila de mensageria.",
				ultimo_erro:
					"Removido automaticamente: tipo de O.S. não entra na fila de mensageria.",
				atualizadoEm: new Date().toISOString(),
				atualizado_em: new Date().toISOString(),
				ajustadoFilaEm: new Date().toISOString(),
			});
			continue;
		}
		if (!isAllowedMensageriaOrderType(item)) {
			removed += 1;
			await mensageriaRepository.updateQueueMessage(item.id, {
				...item,
				status: "ignorado",
				ultimoErro:
					"Removido automaticamente: tipo de O.S. não é elegível para mensageria.",
				ultimo_erro:
					"Removido automaticamente: tipo de O.S. não é elegível para mensageria.",
				atualizadoEm: new Date().toISOString(),
				atualizado_em: new Date().toISOString(),
				ajustadoFilaEm: new Date().toISOString(),
			});
			continue;
		}
		const os = String(item.os || item.num_os || item.numero_os || "").trim();
		if (os && openOs.has(os)) continue;
		removed += 1;
		await mensageriaRepository.updateQueueMessage(item.id, {
			...item,
			status: "ignorado",
			ultimoErro:
				"Removido automaticamente: cliente/O.S. não consta mais no mapa de O.S abertas.",
			ultimo_erro:
				"Removido automaticamente: cliente/O.S. não consta mais no mapa de O.S abertas.",
			atualizadoEm: new Date().toISOString(),
			atualizado_em: new Date().toISOString(),
			ajustadoFilaEm: new Date().toISOString(),
		});
	}
	broadcastRealtime("mensageria", { action: "queue_reconciled", removed });
	return { checked, removed, remaining: checked - removed, openOrders: openOs.size };
}

async function persistMapaImport(payload = {}, user = {}, context = {}) {
	const fontes = getMapaFontesSelecionadas(payload, ["sempre"]);
	const fonteLabel = getMapaFonteLabel(fontes);
	const fontesSet = new Set(fontes);
	const periodo = payload.periodo || {};
	await context.update?.({
		stage: "Lendo e normalizando linhas do mapa",
		percent: 10,
		processedRows: 0,
		totalRows: Array.isArray(payload.rows) ? payload.rows.length : 0,
	});
	const prepared = Array.isArray(payload.rows)
		? await buildOrdersFromRows(payload.rows, fontes)
		: { ordensNovas: payload.ordens || {} };
	const incoming = prepared.ordensNovas || {};
	await context.update?.({
		stage: "Comparando base atual do mapa",
		percent: 35,
		processedRows: Array.isArray(payload.rows)
			? payload.rows.length
			: Object.keys(incoming).length,
	});
	const current = await getCollectionMap("ordens_abertas");
	const currentBySource = Object.fromEntries(
		Object.entries(current).filter(([, order]) =>
			fontesSet.has(normalizeMapaFonte(order?.fonte || order?.empresa)),
		),
	);
	const newMapEntries = Object.entries(incoming).filter(
		([id]) => !currentBySource[id],
	);
	const deleted = await documents.deleteDocumentsByCollectionAndSources(
		"ordens_abertas",
		fontes,
	);
	await context.update?.({
		stage: "Salvando ordens do mapa no PostgreSQL",
		percent: 55,
		totalDocuments: Object.keys(incoming).length,
	});
	await upsertMany("ordens_abertas", incoming, {
		update: context.update,
		stage: "Salvando ordens do mapa no PostgreSQL",
		startPercent: 55,
		endPercent: 72,
		step: 1000,
	});
	await context.update?.({
		stage: "Montando snapshot atualizado do mapa",
		percent: 74,
		totalDocuments: Object.keys(incoming).length,
	});

	const finalMap = {
		...Object.fromEntries(
			Object.entries(current).filter(
				([, order]) =>
					!fontesSet.has(normalizeMapaFonte(order?.fonte || order?.empresa)),
			),
		),
		...incoming,
	};
	const finalOrders = Object.entries(finalMap).map(([id, data]) => ({
		id,
		...data,
	}));
	const totalGeral = finalOrders.length;
	const totalSempre = finalOrders.filter(
		(order) => normalizeMapaFonte(order.fonte || order.empresa) === "sempre",
	).length;
	const totalOnnet = finalOrders.filter(
		(order) => normalizeMapaFonte(order.fonte || order.empresa) === "onnet",
	).length;
	const meta = {
		data: new Date().toISOString(),
		totalOS: totalGeral,
		totalSempre,
		totalOnnet,
		fontesAtualizadas: fontes,
		fonteAtualizada: fontes[0],
		fonteAtualizadaLabel: fonteLabel,
		novasSalvas: Object.keys(incoming).filter((id) => !currentBySource[id])
			.length,
		removidas: deleted,
		periodoInicio: periodo?.inicio || null,
		periodoFim: periodo?.fim || null,
	};
	await context.update?.({
		stage: "Gerando painel publico do mapa",
		percent: 78,
	});

	await documents.upsertDocument({
		path: "mapa_meta/ultima_atualizacao",
		collectionPath: "mapa_meta",
		documentId: "ultima_atualizacao",
		parentPath: null,
		data: meta,
	});
	await documents.upsertDocument({
		path: "public_dashboard/mapa_os",
		collectionPath: "public_dashboard",
		documentId: "mapa_os",
		parentPath: null,
		data: { summary: buildMapaSnapshot(finalOrders), meta },
	});
	await context.update?.({
		stage: "Atualizando snapshot operacional do mapa",
		percent: 84,
	});
	await refreshOperationalSnapshot(meta.data);
	await context.update?.({
		stage: "Registrando importacao do mapa",
		percent: 86,
	});
	const importRunId = await saveImportRun(
		"mapa",
		{ total: Object.keys(incoming).length, totalGeral, fontes },
		user.uid,
	);
	const mensageriaDiff = await ensureOpenMapOrdersInMensageria(
		finalMap,
		user,
	);
	const mensageriaNovas = await enqueueNewMapOrdersForMensageria(
		newMapEntries,
		user,
	);
	const mensageriaReconciliation =
		await reconcileMensageriaQueueWithOpenMap(finalMap).catch((error) => {
			console.error(
				"[operationalImports] Falha ao reconciliar fila da mensageria:",
				error,
			);
			return {
				ok: false,
				error: error?.message || "Falha ao reconciliar fila da mensageria.",
			};
		});
	await context.update?.({
		stage: "Conferindo agendamentos no mapa",
		percent: 88,
	});
	const agendamentosMapa = await reconcileAppointmentsWithMapa({
		user,
		reason: "mapa_import",
	}).catch((error) => {
		console.error(
			"[operationalImports] Falha ao conferir agendamentos no mapa:",
			error,
		);
		return {
			ok: false,
			error: error?.message || "Falha ao conferir agendamentos no mapa.",
		};
	});
	await context.update?.({
		stage: "Publicando atualizacao do acompanhamento",
		percent: 92,
	});
	await publishAcompanhamentoUpdate("mapa", {
		generatedAt: meta.data,
		updatedBy: user.uid || null,
		notify: meta.novasSalvas > 0,
		notifyAcompanhamento: meta.novasSalvas > 0,
		message:
			meta.novasSalvas > 0
				? `Mapa recebeu ${meta.novasSalvas} O.S nova(s) e o acompanhamento foi atualizado.`
				: `Mapa atualizado: ${totalGeral} O.S em aberto.`,
		summary: {
			totalGeral,
			totalSempre,
			totalOnnet,
			fontes,
			mensageriaDiff,
			mensageriaNovas,
			mensageriaReconciliation,
			agendamentosMapa,
		},
	});

	setImmediate(() => {
		try {
			const sempreIntegration = require("./sempreIntegration");
			sempreIntegration
				.refreshMapEquipmentsSnapshot({ trigger: "mapa-import" })
				.catch((error) =>
					console.error(
						"[operationalImports] Falha ao atualizar equipamentos do mapa:",
						error,
					),
				);
		} catch (error) {
			console.error(
				"[operationalImports] Falha ao iniciar atualizacao de equipamentos do mapa:",
				error,
			);
		}
	});

	return {
		source: "mapa",
		generatedAt: meta.data,
		total: Object.keys(incoming).length,
		totalGeral,
		totalSempre,
		totalOnnet,
		fontes,
		fonte: fontes[0],
		fonteLabel,
		salvas: meta.novasSalvas,
		notify: meta.novasSalvas > 0,
		notifyAcompanhamento: meta.novasSalvas > 0,
		mensageriaDiff,
		mensageriaNovas,
		mensageriaReconciliation,
		agendamentosMapa,
		atualizadas: Object.keys(incoming).length,
		removidas: deleted,
		comparativo: [],
		importRunId,
	};
}

async function persistMatchImport(payload = {}, user = {}, context = {}) {
	const fontes = getMapaFontesSelecionadas(payload, ["sempre", "onnet"]);
	const fonteLabel = getMapaFonteLabel(fontes);
	const periodo = payload.periodo || {};
	await context.update?.({
		stage: "Lendo e normalizando linhas do match",
		percent: 10,
		processedRows: 0,
		totalRows: Array.isArray(payload.rows) ? payload.rows.length : 0,
	});
	const prepared = Array.isArray(payload.rows)
		? await buildOrdersFromRows(payload.rows, fontes, { forMatch: true })
		: { ordensNovas: payload.ordens || {} };
	const incoming = prepared.ordensNovas || {};
	if (!Object.keys(incoming).length) {
		await context.update?.({
			stage: "Resultado vazio do match ignorado",
			percent: 100,
			totalDocuments: 0,
		});
		await publishAcompanhamentoUpdate("match", {
			generatedAt: new Date().toISOString(),
			updatedBy: user.uid || null,
			message:
				"Match retornou vazio e a base atual foi preservada para evitar rollback.",
			summary: {
				fontes,
				fonteLabel,
				skipped: true,
				reason: "EMPTY_MATCH_IMPORT_NOT_APPLIED",
			},
		});
		return {
			source: "match",
			skipped: true,
			reason: "EMPTY_MATCH_IMPORT_NOT_APPLIED",
			message: "Resultado vazio do match ignorado; base atual preservada.",
			total: 0,
			atualizadas: 0,
			removidas: 0,
		};
	}
	const currentBeforeApply = await getCollectionMap("match_os_abertas");
	await context.update?.({
		stage: "Comparando base atual do match",
		percent: 30,
		processedRows: Array.isArray(payload.rows)
			? payload.rows.length
			: Object.keys(incoming).length,
		totalDocuments: Object.keys(incoming).length,
	});
	const deleted = await documents.deleteDocumentsByCollectionAndSources(
		"match_os_abertas",
		fontes,
	);
	await context.update?.({
		stage: "Salvando ordens do match no PostgreSQL",
		percent: 50,
		totalDocuments: Object.keys(incoming).length,
	});
	await upsertMany("match_os_abertas", incoming, {
		update: context.update,
		stage: "Salvando ordens do match no PostgreSQL",
		startPercent: 50,
		endPercent: 62,
		step: 1000,
	});
	await context.update?.({
		stage: "Montando base final do match",
		percent: 64,
		totalDocuments: Object.keys(incoming).length,
	});

	const persistedMatchMap = await getCollectionMap("match_os_abertas");
	const finalOrders = Object.entries(persistedMatchMap).map(([id, data]) => ({
		id,
		...data,
	}));
	if (!finalOrders.length && Object.keys(currentBeforeApply).length) {
		await context.update?.({
			stage: "Resultado final vazio do match ignorado",
			percent: 100,
			totalDocuments: 0,
		});
		await upsertMany("match_os_abertas", currentBeforeApply, {
			update: context.update,
			stage: "Restaurando ultima base valida do match",
			startPercent: 95,
			endPercent: 100,
			step: 1000,
		});
		await publishAcompanhamentoUpdate("match", {
			generatedAt: new Date().toISOString(),
			updatedBy: user.uid || null,
			message:
				"Match retornou resultado final vazio e a última base válida foi preservada.",
			summary: {
				fontes,
				fonteLabel,
				skipped: true,
				reason: "EMPTY_MATCH_FINAL_NOT_APPLIED",
				preservedTotal: Object.keys(currentBeforeApply).length,
			},
		});
		return {
			source: "match",
			skipped: true,
			reason: "EMPTY_MATCH_FINAL_NOT_APPLIED",
			message: "Resultado final vazio do match ignorado; base atual preservada.",
			total: Object.keys(incoming).length,
			totalGeral: Object.keys(currentBeforeApply).length,
			atualizadas: 0,
			removidas: 0,
		};
	}
	await context.update?.({
		stage: "Calculando matches por proximidade",
		percent: 68,
		totalDocuments: finalOrders.length,
	});
	const matchData = buildMatchData(finalOrders);
	const mensagens = buildMatchMessages(matchData);
	const totalGeral = finalOrders.length;
	const totalSempre = finalOrders.filter(
		(order) => normalizeMapaFonte(order.fonte || order.empresa) === "sempre",
	).length;
	const totalOnnet = finalOrders.filter(
		(order) => normalizeMapaFonte(order.fonte || order.empresa) === "onnet",
	).length;
	const meta = {
		data: new Date().toISOString(),
		totalOS: totalGeral,
		totalSempre,
		totalOnnet,
		fontesAtualizadas: fontes,
		fonteAtualizada: fontes[0],
		fonteAtualizadaLabel: fonteLabel,
		removidas: deleted,
		periodoInicio: periodo?.inicio || null,
		periodoFim: periodo?.fim || null,
		ignoradasSemRegional: prepared.ignoradasSemRegional || 0,
		ignoradasPorTipo: prepared.ignoradasPorTipo || 0,
		ignoradasTipos: prepared.ignoradasTipos || {},
		tiposIgnoradosAplicados:
			prepared.tiposIgnoradosAplicados || DEFAULT_MATCH_IGNORED_TYPES,
		tiposIgnoradosAdicionais: prepared.tiposIgnoradosAdicionais || [],
		mensagens,
	};
	const regionaisData = {
		regionais: matchData.regionais,
		agentes: [],
		resumo: matchData.resumo,
	};
	const agentesData = {
		agentes: matchData.agentes,
		regionais: [],
		resumo: {
			...matchData.resumo,
			totalRegionais: 0,
			totalCidades: matchData.agentes.reduce(
				(sum, item) => sum + item.totalCidades,
				0,
			),
			totalMatches: matchData.agentes.reduce(
				(sum, item) => sum + item.totalMatches,
				0,
			),
		},
	};
	await context.update?.({
		stage: "Gerando painel publico do match",
		percent: 82,
	});

	await documents.upsertDocument({
		path: "match_os_meta/ultima_atualizacao",
		collectionPath: "match_os_meta",
		documentId: "ultima_atualizacao",
		parentPath: null,
		data: meta,
	});
	await documents.upsertDocument({
		path: "public_dashboard/match_os",
		collectionPath: "public_dashboard",
		documentId: "match_os",
		parentPath: null,
		data: { data: regionaisData, meta },
	});
	await documents.upsertDocument({
		path: "public_dashboard/agentes_match_os",
		collectionPath: "public_dashboard",
		documentId: "agentes_match_os",
		parentPath: null,
		data: { data: agentesData, meta },
	});
	await context.update?.({
		stage: "Atualizando snapshot operacional do match",
		percent: 88,
	});
	await refreshOperationalSnapshot(meta.data);
	await context.update?.({
		stage: "Registrando importacao do match",
		percent: 90,
	});
	const importRunId = await saveImportRun(
		"match",
		{ total: Object.keys(incoming).length, totalGeral, fontes },
		user.uid,
	);
	await context.update?.({
		stage: "Publicando atualizacao do acompanhamento",
		percent: 94,
	});
	await publishAcompanhamentoUpdate("match", {
		generatedAt: meta.data,
		updatedBy: user.uid || null,
		message: `MATCH atualizado: ${totalGeral} O.S carregadas.`,
		summary: { totalGeral, totalSempre, totalOnnet, fontes },
	});

	return {
		source: "match",
		generatedAt: meta.data,
		total: Object.keys(incoming).length,
		totalGeral,
		totalSempre,
		totalOnnet,
		fontes,
		fonte: fontes[0],
		fonteLabel,
		atualizadas: Object.keys(incoming).length,
		removidas: deleted,
		ignoradasSemRegional: meta.ignoradasSemRegional,
		ignoradasPorTipo: meta.ignoradasPorTipo,
		ignoradasTipos: meta.ignoradasTipos,
		tiposIgnoradosAplicados: meta.tiposIgnoradosAplicados,
		tiposIgnoradosAdicionais: meta.tiposIgnoradosAdicionais,
		mensagens,
		importRunId,
	};
}

function hasMonthMovement(data) {
	return (
		Boolean(data) &&
		(Number(data.totalOS) > 0 ||
			(data.planilhaCarregada === true && Number(data.meta) > 0))
	);
}

function shouldKeepMonth(data) {
	return (
		hasMonthMovement(data) ||
		hasMonthMovement(data?.onnet) ||
		hasMonthMovement(data?.onnetSempre)
	);
}

function buildDashboardPayload(month, data, nowIso) {
	const rawDays = Array.isArray(data.saldoDiario)
		? data.saldoDiario.map((item) => ({
				dia: item.dia,
				equipe: item.equipe,
				agente: item.agente,
				loja: item.loja,
				regionais: item.regionais,
				totalDia: item.totalDia,
			}))
		: [];

	return {
		month,
		meta: data.meta,
		totalOS: data.totalOS,
		cancelamentos: data.cancelamentos,
		totalCancelamentos: data.totalMultas,
		percentAchieved: String(data.percentAchieved),
		status: data.status,
		planilhaCarregada: data.planilhaCarregada === true,
		temLancamentos: Number(data.totalOS) > 0,
		technicians: data.technicians || [],
		regionais: data.regionais || [],
		agenteTotal: data.agenteTotal || 0,
		lojaTotal: data.lojaTotal || 0,
		onnet: data.onnet || null,
		onnetSempre: data.onnetSempre || null,
		saldoDiario: Array.isArray(data.saldoDiario) ? data.saldoDiario : [],
		rawDays,
		updatedAt: nowIso,
	};
}

function getMetaMonthFromDate(dateText) {
	const date = dateText ? new Date(`${String(dateText).slice(0, 10)}T12:00:00Z`) : new Date();
	const monthIndex = Number.isNaN(date.getTime()) ? new Date().getMonth() : date.getUTCMonth();
	return MONTHORDER[monthIndex] || MONTHORDER[new Date().getMonth()];
}

function getMetaYearFromDate(dateText) {
	const date = dateText ? new Date(`${String(dateText).slice(0, 10)}T12:00:00Z`) : new Date();
	return Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getUTCFullYear();
}

function getMetaDayFromDate(dateText) {
	const date = dateText ? new Date(`${String(dateText).slice(0, 10)}T12:00:00Z`) : new Date();
	return Number.isNaN(date.getTime()) ? new Date().getDate() : date.getUTCDate();
}

function metaMonthDateKey(month, year, day) {
	const monthNumber = MONTHORDER.indexOf(month) + 1;
	if (!monthNumber || !day || !year) return null;
	return [
		String(year).padStart(4, "0"),
		String(monthNumber).padStart(2, "0"),
		String(day).padStart(2, "0"),
	].join("-");
}

function buildDiarioEntryFromSaldoDay({ dateKey, row, nowIso, user = {} }) {
	const total = Number(row?.totalDia || 0);
	const horarios = DIARIO_CADASTRO_HORARIOS.reduce((result, horario) => {
		result[horario] = horario === DIARIO_AFTER_HOURS_HORARIO ? total : 0;
		return result;
	}, {});

	return {
		date: dateKey,
		monthKey: String(dateKey).slice(0, 7),
		horarios,
		deliveredTotal: total,
		hourlyTotal: total,
		afterHoursTotal: total,
		fines: Number(row?.multas || row?.fines || 0),
		notes: "Preenchido automaticamente pela sincronizacao de metas HubSoft.",
		autoGeneratedFromMetas: true,
		source: "hubsoft-metas",
		sourceTotals: {
			equipe: Number(row?.equipe || 0),
			agente: Number(row?.agente || 0),
			loja: Number(row?.loja || 0),
			regionais: Number(row?.regionais || 0),
			totalDia: total,
		},
		updatedBy: user.uid || null,
		updatedByName: user.nome || user.name || user.displayName || "HubSoft",
		updatedAt: nowIso,
	};
}

function shouldUpdateDiarioFromMetas(existing = {}) {
	if (!existing || !Object.keys(existing).length) return true;
	if (existing.autoGeneratedFromMetas === true) return true;
	const horarios = existing.horarios || {};
	const detailedTotal = ["11h", "14h", "16h", "18h"].reduce(
		(sum, horario) => sum + Number(horarios[horario] || 0),
		0,
	);
	const total = Number(existing.hourlyTotal || existing.deliveredTotal || 0);
	return detailedTotal === 0 && total === 0;
}

async function syncDiarioFromMetaRecord(record = {}, month, year, user = {}, options) {
	const rows = Array.isArray(record?.saldoDiario) ? record.saldoDiario : [];
	const nowIso = new Date().toISOString();
	for (const row of rows) {
		const dateKey = metaMonthDateKey(month, year, Number(row?.dia));
		const total = Number(row?.totalDia || 0);
		if (!dateKey || total <= 0) continue;
		const path = `acompanhamento_diario/${dateKey}`;
		const existing =
			(await documents.getDocument(path).catch(() => null))?.data || null;
		if (!shouldUpdateDiarioFromMetas(existing)) continue;
		await documents.upsertDocument({
			path,
			collectionPath: "acompanhamento_diario",
			documentId: dateKey,
			parentPath: null,
			data: buildDiarioEntryFromSaldoDay({ dateKey, row, nowIso, user }),
		}, options);
	}
}

async function persistHubsoftFineRecords({
	profile = "MULTAS",
	date,
	records = [],
	user = {},
	quiet = false,
} = {}) {
	const dateKey = String(date || new Date().toISOString().slice(0, 10)).slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
		const error = new Error("Data invalida para sincronizacao de multas.");
		error.statusCode = 400;
		throw error;
	}
	const nowIso = new Date().toISOString();
	const unique = new Set(
		(Array.isArray(records) ? records : [])
			.map((record) => String(record.hubsoft_id || record.hubsoft_number || "").trim())
			.filter(Boolean),
	);
	const total = unique.size || (Array.isArray(records) ? records.length : 0);
	const path = `acompanhamento_diario/${dateKey}`;
	const existing =
		(await documents.getDocument(path).catch(() => null))?.data || {};
	const horarios = existing.horarios || DIARIO_CADASTRO_HORARIOS.reduce((result, horario) => {
		result[horario] = 0;
		return result;
	}, {});
	const data = {
		...existing,
		date: existing.date || dateKey,
		monthKey: existing.monthKey || String(dateKey).slice(0, 7),
		horarios,
		deliveredTotal: Number(existing.deliveredTotal || existing.hourlyTotal || 0),
		hourlyTotal: Number(existing.hourlyTotal || existing.deliveredTotal || 0),
		afterHoursTotal: Number(existing.afterHoursTotal || horarios[DIARIO_AFTER_HOURS_HORARIO] || 0),
		fines: total,
		fineSource: "hubsoft-multas",
		fineProfile: profile,
		fineUpdatedAt: nowIso,
		fineRecordIds: [...unique].slice(0, 200),
		updatedBy: user.uid || existing.updatedBy || null,
		updatedByName:
			user.nome ||
			user.name ||
			user.displayName ||
			existing.updatedByName ||
			"HubSoft",
		updatedAt: nowIso,
	};
	const writeOptions = quiet
		? { audit: false, broadcast: false, normalized: false }
		: undefined;
	await documents.upsertDocument({
		path,
		collectionPath: "acompanhamento_diario",
		documentId: dateKey,
		parentPath: null,
		data,
	}, writeOptions);
	if (!quiet) {
		await publishAcompanhamentoUpdate("diario", {
			generatedAt: nowIso,
			updatedBy: user.uid || null,
			message: `Multas lancadas atualizadas pelo HubSoft para ${dateKey}.`,
			summary: {
				profile,
				date: dateKey,
				fines: total,
			},
		});
	}
	return {
		source: "hubsoft-multas",
		profile,
		date: dateKey,
		total,
		updatedAt: nowIso,
	};
}

function getDaysInMetaMonth(month, year = new Date().getFullYear()) {
	const index = MONTHORDER.indexOf(month);
	if (index < 0) return 31;
	return new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
}

function createDailyArray(dayCount) {
	return Array.from({ length: dayCount }, () => 0);
}

function normalizeDailyForMonth(daily, dayCount) {
	return Array.from({ length: dayCount }, (_, index) => Number(daily?.[index] || 0));
}

function setDailyTotal(items = [], name, dayIndex, value, dayCount) {
	const normalizedName = String(name || "Sem classificacao HubSoft").trim();
	const key = normalizeText(normalizedName);
	const current = Array.isArray(items) ? [...items] : [];
	let item = current.find((row) => normalizeText(row?.name) === key);
	if (!item) {
		item = {
			name: normalizedName,
			meta: 110,
			daily: createDailyArray(dayCount),
			total: 0,
			percent: 0,
		};
		current.push(item);
	}
	item.daily = normalizeDailyForMonth(item.daily, dayCount);
	item.daily[dayIndex] = Number(value || 0);
	item.total = item.daily.reduce((sum, dailyValue) => sum + Number(dailyValue || 0), 0);
	item.meta = Number(item.meta || 110);
	item.percent = item.meta > 0 ? Number(((item.total / item.meta) * 100).toFixed(1)) : 0;
	return current.sort((left, right) => Number(right.total || 0) - Number(left.total || 0));
}

function clearDailyTotal(items = [], dayIndex, dayCount) {
	return (Array.isArray(items) ? items : []).map((item) => {
		const daily = normalizeDailyForMonth(item.daily, dayCount);
		daily[dayIndex] = 0;
		const total = daily.reduce((sum, dailyValue) => sum + Number(dailyValue || 0), 0);
		const meta = Number(item.meta || 110);
		return {
			...item,
			daily,
			total,
			percent: meta > 0 ? Number(((total / meta) * 100).toFixed(1)) : 0,
		};
	});
}

function getRawDaysByDay(record = {}) {
	const map = new Map();
	for (const row of record.rawDays || record.saldoDiario || []) {
		const dia = Number(row?.dia || 0);
		if (!dia) continue;
		map.set(dia, {
			dia,
			equipe: Number(row.equipe || 0),
			agente: Number(row.agente || 0),
			loja: Number(row.loja || 0),
			regionais: Number(row.regionais || 0),
			naoClassificado: Number(row.naoClassificado || row.unclassified || 0),
			totalDia: Number(row.totalDia || 0),
		});
	}
	return map;
}

function setRawDayField(record = {}, day, field, value) {
	const rawByDay = getRawDaysByDay(record);
	const current = rawByDay.get(day) || {
		dia: day,
		equipe: 0,
		agente: 0,
		loja: 0,
		regionais: 0,
		naoClassificado: 0,
		totalDia: 0,
	};
	current[field] = Number(value || 0);
	current.totalDia =
		Number(current.equipe || 0) +
		Number(current.agente || 0) +
		Number(current.loja || 0) +
		Number(current.regionais || 0) +
		Number(current.naoClassificado || 0);
	rawByDay.set(day, current);
	return [...rawByDay.values()]
		.filter((row) => Number(row.totalDia || 0) > 0)
		.sort((left, right) => Number(left.dia || 0) - Number(right.dia || 0));
}

function recalculateSimpleSaldoDiario(record = {}, month, year) {
	const dayCount = getDaysInMetaMonth(month, year);
	const meta = Number(record.meta || 0);
	const rawDays = record.rawDays || record.saldoDiario || [];
	const activeDays = Math.max(1, dayCount);
	const metaDiaria = meta > 0 ? Math.ceil(meta / activeDays) : 0;
	let saldoMes = 0;
	const saldoDiario = rawDays.map((row) => {
		const dia = Number(row.dia || 0);
		const totalDia = Number(row.totalDia || 0);
		const metaDia = metaDiaria;
		const saldoDia = totalDia - metaDia;
		saldoMes += saldoDia;
		return {
			...row,
			dia,
			totalDia,
			util: true,
			metaDia,
			metaAcumulada: metaDiaria * dia,
			saldoDia,
			saldoMes,
		};
	});
	return { metaDiaria, saldoDiario };
}

function recalculateMetaRecord(record = {}, month, year) {
	const rawDays = (record.rawDays || record.saldoDiario || []).filter(
		(row) => Number(row?.totalDia || 0) > 0,
	);
	const totalOS = rawDays.reduce((sum, row) => sum + Number(row.totalDia || 0), 0);
	const meta = Number(record.meta || 0);
	const percentAchieved = meta > 0 ? Number(((totalOS / meta) * 100).toFixed(1)) : 0;
	const saldo = recalculateSimpleSaldoDiario({ ...record, rawDays }, month, year);
	return {
		...record,
		mes: record.mes || month,
		month: record.month || month,
		ano: Number(record.ano || year),
		year: Number(record.year || year),
		totalOS,
		planilhaCarregada: true,
		temLancamentos: totalOS > 0,
		percentAchieved,
		rawDays,
		saldoDiario: saldo.saldoDiario,
		metaDiaria: saldo.metaDiaria,
		status:
			percentAchieved >= 100
				? "Meta atingida!"
				: `Faltam ${Math.max(0, meta - totalOS).toFixed(0)} O.S`,
	};
}

function combineMetaRecords(sempre = {}, onnet = {}, month, year) {
	const rawByDay = new Map();
	for (const record of [sempre, onnet]) {
		for (const row of record.rawDays || record.saldoDiario || []) {
			const dia = Number(row?.dia || 0);
			if (!dia) continue;
			const current = rawByDay.get(dia) || {
				dia,
				equipe: 0,
				agente: 0,
				loja: 0,
				regionais: 0,
				naoClassificado: 0,
				totalDia: 0,
			};
			current.equipe += Number(row.equipe || 0);
			current.agente += Number(row.agente || 0);
			current.loja += Number(row.loja || 0);
			current.regionais += Number(row.regionais || 0);
			current.naoClassificado += Number(row.naoClassificado || row.unclassified || 0);
			current.totalDia += Number(row.totalDia || 0);
			rawByDay.set(dia, current);
		}
	}
	return recalculateMetaRecord(
		{
			...sempre,
			mes: month,
			month,
			ano: year,
			year,
			origem: "ONNET + SEMPRE",
			cancelamentos:
				Number(sempre.cancelamentos || 0) + Number(onnet.cancelamentos || 0),
			meta: Number(sempre.meta || 0) + Number(onnet.meta || 0),
			technicians: [
				...(sempre.technicians || []),
				...(onnet.technicians || []),
			].sort((left, right) => Number(right.total || 0) - Number(left.total || 0)),
			regionais: [
				...(sempre.regionais || []),
				...(onnet.regionais || []),
			].sort((left, right) => Number(right.total || 0) - Number(left.total || 0)),
			agenteTotal: Number(sempre.agenteTotal || 0),
			lojaTotal: Number(sempre.lojaTotal || 0) + Number(onnet.lojaTotal || 0),
			rawDays: [...rawByDay.values()].sort((left, right) => left.dia - right.dia),
		},
		month,
		year,
	);
}

async function resolveMetaFonteByCity() {
	const cityMap = await loadCityMap();
	return (record) => {
		const cityKey = normalizeCityKey(record?.source_city);
		const info = cityMap[cityKey];
		return getFonteMapaPorRegional(info?.regional);
	};
}

function updateAgentDashboardCity(cities = [], cityName, dayIndex, value, dayCount) {
	const name = normalizeCity(cityName) || "Sem cidade";
	const key = normalizeCityKey(name);
	const current = Array.isArray(cities) ? [...cities] : [];
	let city = current.find((item) => normalizeCityKey(item?.nome || item?.cidade) === key);
	if (!city) {
		city = {
			nome: name,
			cancelamentos: 0,
			meta80: 0,
			realizado: 0,
			falta: 0,
			pct: 0,
			daily: createDailyArray(dayCount),
			lojaAgentesTotal: 0,
			lojaAgentesDaily: createDailyArray(dayCount),
		};
		current.push(city);
	}
	city.daily = normalizeDailyForMonth(city.daily, dayCount);
	city.daily[dayIndex] = Number(value || 0);
	city.realizado = city.daily.reduce((sum, item) => sum + Number(item || 0), 0);
	city.meta80 = Number(city.meta80 || city.meta || 0);
	city.cancelamentos = Number(city.cancelamentos || 0);
	city.falta = Math.max(0, Number(city.meta80 || 0) - city.realizado);
	city.pct =
		Number(city.meta80 || 0) > 0
			? Number(((city.realizado / Number(city.meta80 || 0)) * 100).toFixed(1))
			: 0;
	return current.sort((left, right) => Number(right.realizado || 0) - Number(left.realizado || 0));
}

function clearAgentDashboardDay(cities = [], dayIndex, dayCount) {
	return (Array.isArray(cities) ? cities : []).map((city) => {
		const daily = normalizeDailyForMonth(city.daily, dayCount);
		daily[dayIndex] = 0;
		const realizado = daily.reduce((sum, value) => sum + Number(value || 0), 0);
		const meta80 = Number(city.meta80 || city.meta || 0);
		return {
			...city,
			daily,
			realizado,
			falta: Math.max(0, meta80 - realizado),
			pct: meta80 > 0 ? Number(((realizado / meta80) * 100).toFixed(1)) : 0,
		};
	});
}

function recalculateAgentDashboard(month, data = {}, year) {
	const cities = Array.isArray(data.cidades) ? data.cidades : [];
	const dayCount = getDaysInMetaMonth(month, year);
	const normalizedCities = cities.map((city) => ({
		...city,
		daily: normalizeDailyForMonth(city.daily, dayCount),
		lojaAgentesDaily: normalizeDailyForMonth(city.lojaAgentesDaily, dayCount),
		realizado: normalizeDailyForMonth(city.daily, dayCount).reduce(
			(sum, value) => sum + Number(value || 0),
			0,
		),
	}));
	const totalRealizado = normalizedCities.reduce(
		(sum, city) => sum + Number(city.realizado || 0),
		0,
	);
	const totalMeta = normalizedCities.reduce(
		(sum, city) => sum + Number(city.meta80 || city.meta || 0),
		0,
	);
	const totalCancelamentos = normalizedCities.reduce(
		(sum, city) => sum + Number(city.cancelamentos || 0),
		0,
	);
	return {
		...data,
		month,
		cidades: normalizedCities,
		cidadesRanking: [...normalizedCities].sort(
			(left, right) => Number(right.realizado || 0) - Number(left.realizado || 0),
		),
		dayCount,
		totalCancelamentos,
		totalMeta,
		totalRealizado,
		totalFalta: totalMeta - totalRealizado,
		percentAchieved:
			totalMeta > 0 ? Number(((totalRealizado / totalMeta) * 100).toFixed(1)) : 0,
		totalDaily: createDailyArray(dayCount).map((_, index) =>
			normalizedCities.reduce(
				(sum, city) => sum + Number(city.daily?.[index] || 0),
				0,
			),
		),
		status:
			totalRealizado >= totalMeta && totalMeta > 0
				? "Meta atingida!"
				: `Faltam ${Math.max(0, Math.round(totalMeta - totalRealizado))} retiradas`,
	};
}

async function persistHubsoftMetaRecords({
	profile,
	date,
	records = [],
	user = {},
	quiet = false,
} = {}) {
	const isStoreProfile = profile === "LOJA";
	const day = getMetaDayFromDate(date);
	const month = getMetaMonthFromDate(date);
	const year = getMetaYearFromDate(date);
	const dayCount = getDaysInMetaMonth(month, year);
	const dayIndex = day - 1;
	const nowIso = new Date().toISOString();
	const currentDoc = (await documents.getDocument(`metas/${month}`).catch(() => null))?.data || {
		mes: month,
		month,
		ano: year,
		year,
		onnet: { mes: month, month, ano: year, year, origem: "ONNET" },
	};
	const currentAgents =
		(await documents.getDocument(`dashboardagentes/${month}`).catch(() => null))?.data || {
			month,
			cidades: [],
		};
	const resolveFonte = await resolveMetaFonteByCity(records);
	const grouped = {
		sempre: { RETIRADA: new Map(), REGIONAL: new Map(), AA: new Map(), LOJA: 0, UNCLASSIFIED: 0 },
		onnet: { RETIRADA: new Map(), REGIONAL: new Map(), AA: new Map(), LOJA: 0, UNCLASSIFIED: 0 },
	};
	for (const record of records) {
		const fonte = resolveFonte(record);
		const channel = record.production_channel || "UNCLASSIFIED";
		if (profile === "LOJA") {
			grouped[fonte].LOJA += 1;
			continue;
		}
		if (!["AA", "RETIRADA", "REGIONAL"].includes(channel)) {
			grouped[fonte].UNCLASSIFIED += 1;
			continue;
		}
		const bucket = channel === "AA" ? "AA" : channel === "RETIRADA" ? "RETIRADA" : "REGIONAL";
		const name =
			bucket === "AA"
				? normalizeCity(record.source_city) || record.production_owner_name
				: record.production_owner_name || "Sem classificacao HubSoft";
		const map = grouped[fonte][bucket];
		map.set(name, Number(map.get(name) || 0) + 1);
	}

	const updateBase = (baseId, sourceRecord) => {
		let next = {
			...sourceRecord,
			mes: month,
			month,
			ano: year,
			year,
			origem: baseId === "onnet" ? "ONNET" : "SEMPRE",
		};
		if (!isStoreProfile) {
			next.technicians = clearDailyTotal(next.technicians, dayIndex, dayCount);
			next.regionais = clearDailyTotal(next.regionais, dayIndex, dayCount);
			for (const [name, total] of grouped[baseId].RETIRADA.entries()) {
				next.technicians = setDailyTotal(next.technicians, name, dayIndex, total, dayCount);
			}
			for (const [name, total] of grouped[baseId].REGIONAL.entries()) {
				next.regionais = setDailyTotal(next.regionais, name, dayIndex, total, dayCount);
			}
		}
		const equipe = [...grouped[baseId].RETIRADA.values()].reduce(
			(sum, value) => sum + Number(value || 0),
			0,
		);
		const regionaisTotal = [...grouped[baseId].REGIONAL.values()].reduce(
			(sum, value) => sum + Number(value || 0),
			0,
		);
		const agentesTotal = [...grouped[baseId].AA.values()].reduce(
			(sum, value) => sum + Number(value || 0),
			0,
		);
		if (isStoreProfile) {
			next.rawDays = setRawDayField(next, day, "loja", grouped[baseId].LOJA);
		} else {
			next.rawDays = setRawDayField(next, day, "equipe", equipe);
			next.rawDays = setRawDayField({ ...next, rawDays: next.rawDays }, day, "regionais", regionaisTotal);
			next.rawDays = setRawDayField({ ...next, rawDays: next.rawDays }, day, "agente", agentesTotal);
			next.rawDays = setRawDayField(
				{ ...next, rawDays: next.rawDays },
				day,
				"naoClassificado",
				grouped[baseId].UNCLASSIFIED,
			);
		}
		next.agenteTotal =
			(next.rawDays || []).reduce((sum, row) => sum + Number(row.agente || 0), 0);
		next.lojaTotal =
			(next.rawDays || []).reduce((sum, row) => sum + Number(row.loja || 0), 0);
		return recalculateMetaRecord(next, month, year);
	};

	const sempre = updateBase("sempre", currentDoc);
	const onnet = updateBase("onnet", currentDoc.onnet || {});
	let nextAgents = currentAgents;
	if (!isStoreProfile) {
		nextAgents.cidades = clearAgentDashboardDay(nextAgents.cidades, dayIndex, dayCount);
		for (const [city, total] of grouped.sempre.AA.entries()) {
			nextAgents.cidades = updateAgentDashboardCity(
				nextAgents.cidades,
				city,
				dayIndex,
				total,
				dayCount,
			);
		}
	}
	nextAgents = recalculateAgentDashboard(month, nextAgents, year);
	const combined = combineMetaRecords(sempre, onnet, month, year);
	const nextMonth = {
		...sempre,
		onnet,
		onnetSempre: combined,
		hubsoftUpdatedAt: nowIso,
		hubsoftLastProfile: profile,
	};
	const writeOptions = quiet
		? { audit: false, broadcast: false, normalized: false }
		: undefined;

	await documents.upsertDocument({
		path: `metas/${month}`,
		collectionPath: "metas",
		documentId: month,
		parentPath: null,
		data: { ...nextMonth, updatedAt: nowIso },
	}, writeOptions);
	await documents.upsertDocument({
		path: `dashboard/${month}`,
		collectionPath: "dashboard",
		documentId: month,
		parentPath: null,
		data: buildDashboardPayload(month, nextMonth, nowIso),
	}, writeOptions);
	await documents.upsertDocument({
		path: `dashboardagentes/${month}`,
		collectionPath: "dashboardagentes",
		documentId: month,
		parentPath: null,
		data: { ...nextAgents, updatedAt: nowIso },
	}, writeOptions);
	await syncDiarioFromMetaRecord(combined, month, year, user, writeOptions);
	if (!quiet) {
		await publishAcompanhamentoUpdate("metas", {
			generatedAt: nowIso,
			updatedBy: user.uid || null,
			message: `Metas atualizadas pelo HubSoft (${profile}) para ${String(day).padStart(2, "0")}/${String(MONTHORDER.indexOf(month) + 1).padStart(2, "0")}/${year}.`,
			summary: {
				profile,
				date,
				total: records.length,
				sempre: {
					equipe: [...grouped.sempre.RETIRADA.values()].reduce((sum, value) => sum + value, 0),
					regionais: [...grouped.sempre.REGIONAL.values()].reduce((sum, value) => sum + value, 0),
					agentes: [...grouped.sempre.AA.values()].reduce((sum, value) => sum + value, 0),
					loja: grouped.sempre.LOJA,
				},
				onnet: {
					equipe: [...grouped.onnet.RETIRADA.values()].reduce((sum, value) => sum + value, 0),
					regionais: [...grouped.onnet.REGIONAL.values()].reduce((sum, value) => sum + value, 0),
					agentes: [...grouped.onnet.AA.values()].reduce((sum, value) => sum + value, 0),
					loja: grouped.onnet.LOJA,
				},
			},
		});
		await refreshDashboardSnapshot(nowIso);
	}
	return {
		source: "hubsoft-metas",
		profile,
		generatedAt: nowIso,
		month,
		day,
		total: records.length,
		sempreTotal: Number(sempre.totalOS || 0),
		onnetTotal: Number(onnet.totalOS || 0),
		combinedTotal: Number(combined.totalOS || 0),
	};
}

function dedupeAgentCities(cities = []) {
	const map = new Map();
	(Array.isArray(cities) ? cities : []).forEach((city) => {
		const name = normalizeCity(city?.cidade || city?.nome);
		const key = normalizeCityKey(name);
		if (!key) return;
		map.set(key, { ...city, cidade: name });
	});
	return [...map.values()].sort((a, b) =>
		String(a.cidade || "").localeCompare(String(b.cidade || ""), "pt-BR"),
	);
}

async function persistMetasImport(payload = {}, user = {}) {
	const parsed = payload.parsed || {};
	const agentesData = payload.agentesData || {};
	const lastUpdate = payload.lastUpdate || null;
	const manualLaunchAudit = payload.manualLaunchAudit || null;
	const nowIso = new Date().toISOString();

	for (const month of MONTHORDER) {
		const data = parsed[month];
		if (!shouldKeepMonth(data)) {
			await documents.deleteDocument(`metas/${month}`);
			await documents.deleteDocument(`dashboard/${month}`);
			await documents.deleteDocument(`dashboardagentes/${month}`);
			continue;
		}

		await documents.upsertDocument({
			path: `metas/${month}`,
			collectionPath: "metas",
			documentId: month,
			parentPath: null,
			data: {
				...data,
				planilhaCarregada: data.planilhaCarregada === true,
				temLancamentos: Number(data.totalOS) > 0,
				updatedAt: nowIso,
			},
		});
		await documents.upsertDocument({
			path: `dashboard/${month}`,
			collectionPath: "dashboard",
			documentId: month,
			parentPath: null,
			data: buildDashboardPayload(month, data, nowIso),
		});
		await syncDiarioFromMetaRecord(
			data.onnetSempre || data,
			month,
			Number(data.ano || data.year || new Date().getFullYear()),
			user,
		);

		const cities = dedupeAgentCities(agentesData[month]);
		if (!cities.length) {
			await documents.deleteDocument(`dashboardagentes/${month}`);
		} else {
			const normalizedCities = cities.map((city) => ({
				nome: normalizeCity(city.cidade),
				cancelamentos: city.cancelamentos,
				meta80: city.meta,
				realizado: city.total,
				falta: city.meta - city.total,
				pct: city.pct,
				daily: city.daily,
				lojaAgentesTotal: Number(city.lojaAgentesTotal || 0),
				lojaAgentesDaily: Array.isArray(city.lojaAgentesDaily)
					? city.lojaAgentesDaily
					: [],
			}));
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
			const totalFalta = totalMeta - totalRealizado;
			const percentAchieved =
				totalCancelamentos > 0
					? Number(((totalRealizado / totalCancelamentos) * 100).toFixed(1))
					: 0;
			const dayCount = normalizedCities[0]?.daily?.length ?? 31;
			const totalDaily = Array.from({ length: dayCount }, (_, index) =>
				normalizedCities.reduce(
					(sum, city) => sum + Number(city.daily?.[index] || 0),
					0,
				),
			);

			await documents.upsertDocument({
				path: `dashboardagentes/${month}`,
				collectionPath: "dashboardagentes",
				documentId: month,
				parentPath: null,
				data: {
					month,
					cidades: normalizedCities,
					cidadesRanking: [...normalizedCities].sort(
						(a, b) => b.realizado - a.realizado,
					),
					dayCount,
					totalCancelamentos,
					totalMeta,
					totalRealizado,
					totalFalta,
					percentAchieved,
					totalDaily,
					status:
						percentAchieved >= 80
							? "Meta atingida!"
							: `Faltam ${Math.max(0, Math.round(totalFalta))} retiradas`,
					updatedAt: nowIso,
				},
			});
		}
	}

	if (lastUpdate) {
		const config = (await documents.getDocument("config/metas"))?.data || {};
		await documents.upsertDocument({
			path: "config/metas",
			collectionPath: "config",
			documentId: "metas",
			parentPath: null,
			data: { ...config, lastUpdate, updatedAt: nowIso },
		});
	}
	if (
		manualLaunchAudit &&
		Array.isArray(manualLaunchAudit.entries) &&
		manualLaunchAudit.entries.length > 0
	) {
		await auditLog.recordAuditLog({
			action: "update",
			module: "metas",
			entity: "metas_lancamento_manual",
			recordId: `${manualLaunchAudit.mes || "mes"}-${manualLaunchAudit.ano || "ano"}`,
			userId: user.uid || null,
			userName: user.nome || user.name || user.displayName || null,
			userEmail: user.email || null,
			beforeData: {
				mes: manualLaunchAudit.mes || null,
				ano: manualLaunchAudit.ano || null,
				lancamentos: manualLaunchAudit.entries.map((entry) => ({
					fonte: entry.source,
					secao: entry.sectionId,
					nome: entry.name,
					dia: entry.day,
					valor: Number(entry.beforeValue || 0),
				})),
			},
			afterData: {
				mes: manualLaunchAudit.mes || null,
				ano: manualLaunchAudit.ano || null,
				lancamentos: manualLaunchAudit.entries.map((entry) => ({
					fonte: entry.source,
					secao: entry.sectionId,
					nome: entry.name,
					dia: entry.day,
					valor: Number(entry.afterValue || 0),
				})),
			},
			changedFields: [
				...new Set(
					manualLaunchAudit.entries.map(
						(entry) => `${entry.sectionId || "secao"}.dia${entry.day || ""}`,
					),
				),
			],
		});
	}
	await publishAcompanhamentoUpdate("metas", {
		generatedAt: nowIso,
		updatedBy: user.uid || null,
		message: "Metas atualizadas.",
		summary: {
			updatedMonths: Object.keys(parsed || {}).length,
			updatedAuditoriaMonths: Object.keys(agentesData || {}).length,
			lastUpdate,
		},
	});
	// Sem isso, o snapshot estatico do dashboard (static_snapshots,
	// dominio "dashboard") ficava desatualizado ate algo mais o
	// regenerar (ex.: salvar a config de bases). O frontend le esse
	// snapshot primeiro em toda releitura (inclusive na propria
	// releitura pos-save disparada pelo evento realtime local) — sem
	// regenerar aqui, um "Salvar card"/"Lançar nos paineis" bem
	// sucedido podia aparecer revertido pro valor antigo poucos
	// instantes depois de salvar.
	await refreshDashboardSnapshot(nowIso);

	return {
		source: "metas",
		generatedAt: nowIso,
		updatedMonths: Object.keys(parsed || {}).length,
		updatedAuditoriaMonths: Object.keys(agentesData || {}).length,
		lastUpdate,
		cobrancasEmail: null,
	};
}

async function saveMetasForceTaskConfig(rawConfig = {}, user = {}) {
	const metas = rawConfig.metas || {};
	const nowIso = new Date().toISOString();
	const config = {
		ativa: rawConfig.ativa === true,
		inicio: String(rawConfig.inicio || "").trim(),
		fim: String(rawConfig.fim || "").trim(),
		metas: {
			regionais: Math.max(0, Number(metas.regionais) || 0),
			agentes: Math.max(0, Number(metas.agentes) || 0),
			tecnicos: Math.max(0, Number(metas.tecnicos) || 0),
		},
		updatedAt: nowIso,
		updatedBy: user.uid || null,
	};

	if (config.ativa && (!config.inicio || !config.fim)) {
		const error = new Error(
			"Informe data inicial e data final para ativar a forca tarefa.",
		);
		error.statusCode = 400;
		throw error;
	}

	const current = (await documents.getDocument("config/metas"))?.data || {};
	await documents.upsertDocument({
		path: "config/metas",
		collectionPath: "config",
		documentId: "metas",
		parentPath: null,
		data: { ...current, forcaTarefa: config, updatedAt: nowIso },
	});
	await publishAcompanhamentoUpdate("metas", {
		generatedAt: nowIso,
		updatedBy: user.uid || null,
		message: "Configuração de força-tarefa atualizada.",
		summary: { forcaTarefa: config },
	});
	// Mesma omissao de persistMetasImport (ver comentario la): sem
	// regenerar aqui, o snapshot do dashboard fica desatualizado ate
	// algo mais o regenerar.
	await refreshDashboardSnapshot(nowIso);

	return { source: "metas", generatedAt: nowIso, config };
}

const DEFAULT_META_SEASONAL = {
	Janeiro: 65,
	Fevereiro: 65,
	Marco: 75,
	Abril: 85,
	Maio: 90,
	Junho: 90,
	Julho: 90,
	Agosto: 90,
	Setembro: 85,
	Outubro: 85,
	Novembro: 75,
	Dezembro: 65,
};

const META_BASE_IDS = ["sempre", "onnet", "onnetSempre"];
const META_BASE_DEFAULTS = {
	sempre: { mode: "sazonal", fixedPercent: 80 },
	onnet: { mode: "fixa", fixedPercent: 65 },
	onnetSempre: { mode: "fixa", fixedPercent: 80 },
};

function sanitizeMetaPercent(value, fallback) {
	const number = Number(value);
	if (!Number.isFinite(number)) return fallback;
	return Math.min(100, Math.max(0, Number(number.toFixed(1))));
}

function normalizeMetasBaseConfig(rawConfig = {}) {
	return META_BASE_IDS.reduce((acc, baseId) => {
		const defaults = META_BASE_DEFAULTS[baseId];
		const raw = rawConfig?.[baseId] || {};
		const rawSeasonal = raw.seasonalPercentByMonth || raw.sazonalidade || {};
		acc[baseId] = {
			mode:
				raw.mode === "fixa" || raw.mode === "sazonal"
					? raw.mode
					: defaults.mode,
			fixedPercent: sanitizeMetaPercent(
				raw.fixedPercent ?? raw.percentualFixo,
				defaults.fixedPercent,
			),
			seasonalPercentByMonth: Object.fromEntries(
				Object.entries(DEFAULT_META_SEASONAL).map(([month, fallback]) => [
					month,
					sanitizeMetaPercent(rawSeasonal[month], fallback),
				]),
			),
		};
		return acc;
	}, {});
}

function getMetaPercentForBase(config, baseId, month) {
	const base = config?.[baseId] || config?.sempre || {};
	if (base.mode === "fixa") return Number(base.fixedPercent || 0);
	return Number(
		base.seasonalPercentByMonth?.[month] || base.fixedPercent || 80,
	);
}

function getMetaModeLabel(config, baseId) {
	const base = config?.[baseId] || config?.sempre || {};
	return base.mode === "fixa" ? "Meta fixa" : "Meta sazonal";
}

function recalculateSaldoDiarioByMeta(saldoDiario = [], meta, metaOriginal) {
	if (!Array.isArray(saldoDiario) || saldoDiario.length === 0)
		return saldoDiario;
	const ratio = metaOriginal > 0 ? meta / metaOriginal : 1;
	let saldoMes = 0;

	return saldoDiario.map((row) => {
		const totalDia = Number(row?.totalDia || 0);
		const metaDia = Number((Number(row?.metaDia || 0) * ratio).toFixed(2));
		const saldoDia = Number((totalDia - metaDia).toFixed(2));
		saldoMes = Number((saldoMes + saldoDia).toFixed(2));
		return {
			...row,
			totalDia,
			metaDia,
			metaAcumulada: Number(
				(Number(row?.metaAcumulada || 0) * ratio).toFixed(2),
			),
			saldoDia,
			saldoMes,
		};
	});
}

function recalculatePerformanceItemsByMeta(items = [], meta, metaOriginal) {
	if (!Array.isArray(items) || items.length === 0) return items;
	const ratio = metaOriginal > 0 ? meta / metaOriginal : 1;

	return items.map((item) => {
		const itemMetaOriginal = Number(item?.meta || 0);
		const itemMeta =
			itemMetaOriginal > 0
				? Number((itemMetaOriginal * ratio).toFixed(2))
				: itemMetaOriginal;
		const total = Number(item?.total || 0);
		return {
			...item,
			meta: itemMeta,
			percent:
				itemMeta > 0
					? Number(((total / itemMeta) * 100).toFixed(1))
					: Number(item?.percent || 0),
		};
	});
}

function applyMetasBaseConfigToRecord(data, config, baseId, month) {
	if (!data || typeof data !== "object") return data;
	const metaSazonal = getMetaPercentForBase(config, baseId, month);
	const metaOriginal = Number(data.meta || 0);
	const cancelamentos =
		Number(data.cancelamentos || 0) ||
		Number(data.totalCancelamentos || 0) ||
		(metaOriginal > 0 && Number(data.metaSazonal || 0) > 0
			? metaOriginal / (Number(data.metaSazonal || 0) / 100)
			: 0);
	const meta =
		cancelamentos > 0
			? Math.round(cancelamentos * (metaSazonal / 100))
			: metaOriginal;
	const totalOS = Number(data.totalOS || 0);
	const percentAchieved =
		meta > 0
			? Number(((totalOS / meta) * 100).toFixed(1))
			: Number(data.percentAchieved || 0);

	return {
		...data,
		meta,
		metaSazonal,
		metaMode: config?.[baseId]?.mode || "sazonal",
		metaModeLabel: getMetaModeLabel(config, baseId),
		percentAchieved,
		saldoDiario: recalculateSaldoDiarioByMeta(
			data.saldoDiario,
			meta,
			metaOriginal,
		),
		technicians: recalculatePerformanceItemsByMeta(
			data.technicians,
			meta,
			metaOriginal,
		),
		regionais: recalculatePerformanceItemsByMeta(
			data.regionais,
			meta,
			metaOriginal,
		),
		status:
			percentAchieved >= 100
				? "Meta atingida!"
				: `Faltam ${Math.max(0, meta - totalOS).toFixed(0)} O.S`,
	};
}

function applyMetasBaseConfigToMonthData(data, config, month) {
	if (!data || typeof data !== "object") return data;
	return {
		...applyMetasBaseConfigToRecord(data, config, "sempre", month),
		onnet: applyMetasBaseConfigToRecord(data.onnet, config, "onnet", month),
		onnetSempre: applyMetasBaseConfigToRecord(
			data.onnetSempre,
			config,
			"onnetSempre",
			month,
		),
	};
}

async function recalculateExistingMetasDocuments(config, nowIso) {
	for (const collectionPath of ["metas", "dashboard"]) {
		const rows = await documents.listAllDocuments(collectionPath);
		for (const row of rows) {
			const recalculated = applyMetasBaseConfigToMonthData(
				row.data,
				config,
				row.documentId,
			);
			await documents.upsertDocument({
				path: row.path,
				collectionPath,
				documentId: row.documentId,
				parentPath: row.parentPath || null,
				data: {
					...recalculated,
					updatedAt: nowIso,
				},
			});
		}
	}
}

async function saveMetasBaseConfig(rawConfig = {}, user = {}) {
	const nowIso = new Date().toISOString();
	const config = normalizeMetasBaseConfig(rawConfig);
	const current = (await documents.getDocument("config/metas"))?.data || {};
	await documents.upsertDocument({
		path: "config/metas",
		collectionPath: "config",
		documentId: "metas",
		parentPath: null,
		data: { ...current, baseConfig: config, updatedAt: nowIso },
	});
	await recalculateExistingMetasDocuments(config, nowIso);
	await publishAcompanhamentoUpdate("metas", {
		generatedAt: nowIso,
		updatedBy: user.uid || null,
		message: "Configuração de metas por base atualizada.",
		summary: { baseConfig: config },
	});
	await refreshDashboardSnapshot(nowIso);

	return { source: "metas", generatedAt: nowIso, config };
}

async function getMatchConfig() {
	const config = await loadMatchIgnoredTypes();
	return {
		tiposIgnoradosAdicionais: config.adicionais,
		tiposIgnoradosAplicados: config.todos,
	};
}

async function saveMatchConfig(payload = {}, user = {}) {
	const extras = [
		...new Set(
			(Array.isArray(payload.tiposIgnoradosAdicionais)
				? payload.tiposIgnoradosAdicionais
				: []
			)
				.map((item) => String(item || "").trim())
				.filter(Boolean),
		),
	];
	const current = (await documents.getDocument("config/match_os"))?.data || {};
	await documents.upsertDocument({
		path: "config/match_os",
		collectionPath: "config",
		documentId: "match_os",
		parentPath: null,
		data: {
			...current,
			tiposIgnoradosAdicionais: extras,
			updatedAt: new Date().toISOString(),
			updatedBy: user.uid || null,
		},
	});
	await publishAcompanhamentoUpdate("match", {
		updatedBy: user.uid || null,
		message: "Configuração do MATCH atualizada.",
		summary: { tiposIgnoradosAdicionais: extras },
	});
	return {
		source: "match",
		tiposIgnoradosAdicionais: extras,
		tiposIgnoradosAplicados: [...new Set(extras)],
	};
}

module.exports = {
	createImportJob,
	getImportJob,
	getMatchConfig,
	markInterruptedImportJobs,
	persistMapaImport,
	persistMatchImport,
	persistHubsoftFineRecords,
	persistHubsoftMetaRecords,
	persistMetasImport,
	publishAcompanhamentoUpdate,
	refreshDashboardSnapshot,
	saveMatchConfig,
	saveMetasBaseConfig,
	saveMetasForceTaskConfig,
	// Exportado so pra teste (achado javascript:S3776,
	// docs/SONARQUBE-MAP.md) — funcao pura extraida de buildOrdersFromRows.
	buildOrderFromRow,
};
