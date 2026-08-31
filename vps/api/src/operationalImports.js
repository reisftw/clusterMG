const documents = require("./documents");
const db = require("./db");
const mensageriaRepository = require("./mensageriaRepository");
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

function normalizeMapaFonte(value) {
	const raw = normalizeText(value);
	return raw.includes("onnet") ? "onnet" : "sempre";
}

function getMapaFonteConfig(value) {
	return MAPA_FONTES[normalizeMapaFonte(value)] || MAPA_FONTES.sempre;
}

function getMapaFontesSelecionadas(data = {}, fallbackFontes = ["sempre"]) {
	const rawFontes = Array.isArray(data?.fontes)
		? data.fontes
		: Array.isArray(data?.periodo?.fontes)
			? data.periodo.fontes
			: [data?.fonte || data?.periodo?.fonte].filter(Boolean);

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
		const numOs = getRowValue(row, [
			"numero_ordem_servico",
			"num_o_s",
			"num_os",
			"numero_os",
		]);
		const status = getRowValue(row, ["status"]);
		const tipoRaw = getRowValue(row, ["tipo_ordem_servico", "tipo"]);
		const tipo = String(tipoRaw || "").trim();
		if (!numOs || !tipo || tipo === "-" || status === "-") return;

		if (forMatch) {
			const normalizedType = normalizeText(tipo);
			const shouldIgnore = ignoredTypes.todos.some(
				(item) => normalizeText(item) === normalizedType,
			);
			if (shouldIgnore) {
				ignoradasPorTipo += 1;
				ignoradasTipos[tipo] = (ignoradasTipos[tipo] || 0) + 1;
				return;
			}
		}

		const statusNorm = normalizeStatus(status);
		if (!statusNorm) return;

		const endereco = getRowValue(row, ["endereco", "endereco_instalacao"]);
		const cidadeRaw = getRowValue(row, ["cidade"]) || extractCity(endereco);
		const cidadeInformada = normalizeCity(cidadeRaw);
		if (!cidadeInformada) return;

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
			ignoradasSemRegional += 1;
			return;
		}

		const fonteDaLinha = getFonteMapaPorRegional(info.regional);
		if (!fontesSet.has(fonteDaLinha)) return;

		const fonteConfig = getMapaFonteConfig(fonteDaLinha);
		const numero = getRowValue(row, ["numero"]);
		const bairro = getRowValue(row, ["bairro"]);
		const coordenadas = getRowValue(row, ["coordenadas"]);
		const coords = parseCoordinates(coordenadas);
		const dataCadastro = normalizeMapaDateValue(
			getRowValue(row, [
				"data_cadastro",
				"data_abertura",
				"data_abertura_os",
				"abertura",
			]),
		);
		const telefonePrimario = getFirstRowValue(row, [
			"telefone_primario",
			"telefone_principal",
			"celular",
			"telefone",
			"whatsapp",
		]);
		const telefoneSecundario = getRowValue(row, ["telefone_secundario"]);
		const telefoneTerciario = getRowValue(row, ["telefone_terciario"]);
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
			...parsePhoneList(getRowValue(row, ["telefones"])),
		]);
		const id = buildMapaDocumentId(numOs, fonteConfig.id);

		ordensNovas[id] = {
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
		await documents.upsertDocument({
			path: `${collectionPath}/${documentId}`,
			collectionPath,
			documentId,
			parentPath: null,
			data,
		});
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

function broadcastImportResult(type, result = {}) {
	const source = result?.source || type;
	const payload = {
		...result,
		source,
		sourceLabel:
			source === "match" ? "MATCH" : source === "mapa" ? "Mapa" : "Operacional",
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
) {
	const snapshot = await buildSnapshotDomain(domain);
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
	await refreshStaticSnapshot("dashboard", generatedAt);
}

async function refreshOperationalSnapshot(
	generatedAt = new Date().toISOString(),
) {
	await refreshStaticSnapshot("operacional", generatedAt);
}

async function getMensageriaConfig() {
	return mensageriaRepository.getMessagingConfig().catch(() => ({}));
}

async function getMensageriaQueueKeys() {
	const items = await mensageriaRepository.listAllQueueMessages().catch(() => []);
	return new Set(
		items
			.map((item) => {
				return `${String(item.os || "").trim()}|${normalizeMensageriaPhone(item.telefone)}`;
			})
			.filter((key) => key !== "|"),
	);
}

function buildMensageriaQueueItemFromOrder(order = {}, id = "", config = {}) {
	const createdAt = new Date().toISOString();
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
	const telefone = String(
		readAnyField(order, ["telefone", "celular", "fone", "whatsapp", "contato"]),
	);
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
	if (!newEntries.length) return { created: 0, skipped: 0, disabled: true };
	const config = await getMensageriaConfig();
	if (!config.autoEnqueueMapDiff)
		return { created: 0, skipped: newEntries.length, disabled: true };

	const allowedCities = new Set(
		(Array.isArray(config.autoEnqueueCities) ? config.autoEnqueueCities : [])
			.map(normalizeCityKey)
			.filter(Boolean),
	);
	const queueKeys = await getMensageriaQueueKeys();
	let created = 0;
	let skipped = 0;

	for (const [id, order] of newEntries) {
		const item = buildMensageriaQueueItemFromOrder(order, id, config);
		if (!item.telefone_digits) {
			skipped += 1;
			continue;
		}
		if (
			allowedCities.size &&
			!allowedCities.has(normalizeCityKey(item.cidade))
		) {
			skipped += 1;
			continue;
		}
		const key = `${item.os}|${item.telefone_digits}`;
		if (config.avoidDuplicates !== false && queueKeys.has(key)) {
			skipped += 1;
			continue;
		}
		queueKeys.add(key);
		const docId = `mapa_${sanitizeId(item.os || id)}_${Date.now()}_${created}`;
		await mensageriaRepository.enqueueMessage(
			{
				...item,
				criadoPor: user.uid || null,
			},
			{ id: docId },
		);
		created += 1;
	}

	return { created, skipped, disabled: false };
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
	const mensageriaDiff = await enqueueNewMapOrdersForMensageria(
		newMapEntries,
		user,
	);
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
	const fontesSet = new Set(fontes);
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
	await context.update?.({
		stage: "Comparando base atual do match",
		percent: 30,
		processedRows: Array.isArray(payload.rows)
			? payload.rows.length
			: Object.keys(incoming).length,
		totalDocuments: Object.keys(incoming).length,
	});
	const current = await getCollectionMap("match_os_abertas");
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
	persistMetasImport,
	saveMatchConfig,
	saveMetasBaseConfig,
	saveMetasForceTaskConfig,
};
