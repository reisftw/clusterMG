const db = require("./db");
const ordensRepository = require("./ordensRepository");
const {
	buildMatchData,
	buildMatchMessages,
} = require("./operationalMatchSnapshot");

const DEFAULT_PUBLIC_DASHBOARD_CACHE_TTL_MS = 10_000;
const DEFAULT_MATCH_REBUILD_IDLE_MS = 120_000;

const publicDashboardCache = {
	data: null,
	cachedAt: 0,
	pending: null,
};

const MONTHS = [
	"Janeiro",
	"Fevereiro",
	"Março",
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

function rowsToDocumentMap(rows = []) {
	const map = rows.reduce((acc, row) => {
		acc[row.documentId] = row.data || {};
		return acc;
	}, {});
	if (map.Marco && !map.Março) {
		map.Março = { ...map.Marco, mes: "Março", month: "Março" };
	}
	if (map.Março && !map.Marco) {
		map.Marco = { ...map.Março, mes: "Marco", month: "Marco" };
	}
	return map;
}

async function getDocumentData(path) {
	const collectionPath = String(path || "").split("/").filter(Boolean)[0] || "";
	if (ordensRepository.isOrdersCollection(collectionPath)) {
		const normalizedRecord = await ordensRepository.getDocument(path);
		if (normalizedRecord?.data) return normalizedRecord.data;
	}
	const result = await db.query(
		`select data
       from app_documents
      where path = $1`,
		[path],
	);
	return result.rows[0]?.data || null;
}

async function listCollectionData(collectionPath, { limit = 10000 } = {}) {
	if (ordensRepository.isOrdersCollection(collectionPath)) {
		return (await ordensRepository.listAllDocuments(collectionPath))
			.slice(0, Number(limit) || 10000)
			.map((record) => ({
				documentId: record.documentId,
				data: record.data || {},
			}));
	}
	const result = await db.query(
		`select document_id as "documentId", data
       from app_documents
      where collection_path = $1
      order by document_id
      limit $2`,
		[collectionPath, limit],
	);
	return result.rows;
}

function getPublicDashboardCacheTtlMs() {
	const configuredTtl = Number(process.env.PUBLIC_DASHBOARD_CACHE_TTL_MS);
	if (!Number.isFinite(configuredTtl))
		return DEFAULT_PUBLIC_DASHBOARD_CACHE_TTL_MS;
	return Math.max(0, Math.min(configuredTtl, 60_000));
}

function getMatchRebuildIdleMs() {
	const configured = Number(process.env.PUBLIC_MATCH_REBUILD_IDLE_MS);
	if (!Number.isFinite(configured)) return DEFAULT_MATCH_REBUILD_IDLE_MS;
	return Math.max(0, Math.min(configured, 10 * 60_000));
}

function invalidatePublicDashboardCache() {
	publicDashboardCache.data = null;
	publicDashboardCache.cachedAt = 0;
	publicDashboardCache.pending = null;
}

function toTime(value) {
	if (!value) return 0;
	const time = new Date(value).getTime();
	return Number.isFinite(time) ? time : 0;
}

function getSnapshotMetaTime(snapshot) {
	return toTime(
		snapshot?.meta?.data ||
			snapshot?.meta?.generatedAt ||
			snapshot?.generatedAt ||
			snapshot?.updatedAt,
	);
}

function normalizeOrderSource(order = {}) {
	const text = String(order.fonte || order.empresa || order.source || "")
		.trim()
		.toLowerCase();
	if (text.includes("onnet")) return "onnet";
	return "sempre";
}

async function resolveMatchSnapshots(
	matchOSRaw,
	agentesMatchOSRaw,
	{ allowRebuild = false } = {},
) {
	if (!allowRebuild) {
		return { matchOS: matchOSRaw, agentesMatchOS: agentesMatchOSRaw };
	}

	const matchCollection =
		ordensRepository.COLLECTIONS?.match || "match_os_abertas";
	const latestUpdatedAt = await ordensRepository.getCollectionLatestUpdatedAt(
		matchCollection,
	);
	const latestTime = toTime(latestUpdatedAt);
	const idleMs = Date.now() - latestTime;
	const currentSnapshotTime = Math.max(
		getSnapshotMetaTime(matchOSRaw),
		getSnapshotMetaTime(agentesMatchOSRaw),
	);
	if (
		!latestTime ||
		currentSnapshotTime >= latestTime ||
		idleMs < getMatchRebuildIdleMs()
	) {
		return { matchOS: matchOSRaw, agentesMatchOS: agentesMatchOSRaw };
	}

	const rows = await listCollectionData(matchCollection, {
		limit: 100000,
	});
	const orders = rows.map((row) => ({ id: row.documentId, ...row.data }));
	const matchData = buildMatchData(orders);
	const mensagens = buildMatchMessages(matchData);
	const totalSempre = orders.filter(
		(order) => normalizeOrderSource(order) === "sempre",
	).length;
	const totalOnnet = orders.filter(
		(order) => normalizeOrderSource(order) === "onnet",
	).length;
	const meta = {
		...(matchOSRaw?.meta || agentesMatchOSRaw?.meta || {}),
		data: new Date(latestTime).toISOString(),
		totalOS: orders.length,
		totalSempre,
		totalOnnet,
		mensagens,
		rebuiltFrom: "match_os_abertas",
		staleSnapshotAt: currentSnapshotTime
			? new Date(currentSnapshotTime).toISOString()
			: null,
	};

	const rebuilt = {
		matchOS: {
			data: {
				regionais: matchData.regionais,
				agentes: [],
				resumo: matchData.resumo,
			},
			meta,
		},
		agentesMatchOS: {
			data: {
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
			},
			meta,
		},
	};
	await persistRebuiltMatchSnapshots(rebuilt).catch((error) => {
		console.error(
			"[publicDashboard] Falha ao persistir snapshot reconstruido do match:",
			error,
		);
	});
	return rebuilt;
}

async function persistRebuiltMatchSnapshots({ matchOS, agentesMatchOS } = {}) {
	if (typeof ordensRepository.upsertDocument !== "function") return;
	await Promise.all([
		ordensRepository.upsertDocument({
			path: "public_dashboard/match_os",
			collectionPath: "public_dashboard",
			documentId: "match_os",
			parentPath: null,
			data: matchOS,
		}),
		ordensRepository.upsertDocument({
			path: "public_dashboard/agentes_match_os",
			collectionPath: "public_dashboard",
			documentId: "agentes_match_os",
			parentPath: null,
			data: agentesMatchOS,
		}),
	]);
}

function compactMatchCity(cidade = {}) {
	return {
		cidade: cidade.cidade,
		totalMatches: Number(cidade.totalMatches || 0),
		totalRetiradasRelacionadas: Number(cidade.totalRetiradasRelacionadas || 0),
		isAgente: Boolean(cidade.isAgente),
	};
}

function compactMatchSection(section = []) {
	return (Array.isArray(section) ? section : []).map((item = {}) => ({
		regional: item.regional,
		totalMatches: Number(item.totalMatches || 0),
		totalCidades: Number(item.totalCidades || 0),
		isAgente: Boolean(item.isAgente),
		cidades: (Array.isArray(item.cidades) ? item.cidades : []).map(
			compactMatchCity,
		),
	}));
}

function compactMatchData(matchData = {}) {
	return {
		...matchData,
		compact: true,
		regionais: compactMatchSection(matchData.regionais),
		agentes: compactMatchSection(matchData.agentes),
	};
}

function compactMatchSlice(slice) {
	if (!slice) return slice;
	if (slice.data && typeof slice.data === "object") {
		return {
			...slice,
			compact: true,
			data: compactMatchData(slice.data),
		};
	}
	return compactMatchData(slice);
}

function compactMapaOrder(order = {}) {
	return {
		codigo: order.codigo || order.codigo_os || order.os || order.id || null,
		cliente: order.cliente || order.nome_cliente || order.nome || null,
		cidade: order.cidade || order.city || null,
		regional: order.regional || order.filial || null,
		tipo: order.tipo || order.tipo_os || order.servico || null,
	};
}

function compactMapaSlice(slice) {
	if (!slice) return slice;
	const data =
		slice.data && typeof slice.data === "object" ? slice.data : slice;
	const ordens = Array.isArray(data.ordens) ? data.ordens : [];
	return {
		compact: true,
		totalOrdens: Number(
			data.totalOrdens || data.summary?.totalOrdens || ordens.length || 0,
		),
		generatedAt:
			data.generatedAt || data.meta?.generatedAt || slice.generatedAt || null,
		meta: data.meta || null,
		summary: data.summary || null,
		sample: ordens.slice(0, 10).map(compactMapaOrder),
	};
}

function compactDashboardDomain(snapshot = {}) {
	return {
		domain: snapshot.domain,
		generatedAt: snapshot.generatedAt,
		compact: true,
		dashboard: {
			data: {
				feriadosTotal: snapshot.dashboard?.data?.feriados?.length || 0,
				feriasTotal: snapshot.dashboard?.data?.ferias?.length || 0,
				colaboradoresTotal:
					snapshot.dashboard?.data?.colaboradores?.length || 0,
			},
		},
		metas: {
			lastUpdate: snapshot.metas?.lastUpdate || null,
			baseConfig: snapshot.metas?.baseConfig || null,
			forcaTarefa: snapshot.metas?.forcaTarefa || null,
		},
		painel: snapshot.painel,
	};
}

function compactOperationalDomain(snapshot = {}) {
	return {
		domain: snapshot.domain,
		generatedAt: snapshot.generatedAt,
		compact: true,
		mapa: compactMapaSlice(snapshot.mapa),
		matchOS: compactMatchSlice(snapshot.matchOS),
		agentesMatchOS: compactMatchSlice(snapshot.agentesMatchOS),
	};
}

function compactSnapshotDomain(domain, snapshot) {
	if (!snapshot) return snapshot;
	if (domain === "dashboard") return compactDashboardDomain(snapshot);
	if (domain === "operacional") return compactOperationalDomain(snapshot);
	return {
		domain: snapshot.domain || domain,
		generatedAt: snapshot.generatedAt,
		compact: true,
	};
}

function normalizeHoliday(item = {}) {
	return {
		...item,
		date: item.date || item.data || "",
		name: item.name || item.nome || item.descricao || "",
	};
}

async function buildMetasSlice() {
	const [metasRows, config, feriadosRows, auditoriaRows] = await Promise.all([
		listCollectionData("metas", { limit: 36 }),
		getDocumentData("config/metas"),
		listCollectionData("feriados", { limit: 300 }),
		Promise.resolve(null),
	]);

	return {
		all: rowsToDocumentMap(metasRows),
		lastUpdate: config?.lastUpdate || null,
		forcaTarefa: config?.forcaTarefa || null,
		baseConfig: config?.baseConfig || null,
		feriados: feriadosRows
			.map((row) => normalizeHoliday(row.data))
			.map((item) => item.date)
			.filter(Boolean)
			.map((date) => {
				const parts = String(date).split("-");
				return parts.length === 3 ? `${parts[1]}-${parts[2]}` : null;
			})
			.filter(Boolean),
		auditoriaAgentes: auditoriaRows,
	};
}

async function buildDashboardDomain() {
	const [dashboardRows, feriadosRows, feriasRows, colaboradoresRows, metas] =
		await Promise.all([
			listCollectionData("dashboard", { limit: 36 }),
			listCollectionData("feriados", { limit: 300 }),
			listCollectionData("ferias", { limit: 2000 }),
			listCollectionData("colaboradores", { limit: 2000 }),
			buildMetasSlice(),
		]);

	return {
		domain: "dashboard",
		generatedAt: new Date().toISOString(),
		dashboard: {
			data: {
				feriados: feriadosRows.map((row) => normalizeHoliday(row.data)),
				ferias: feriasRows.map((row) => ({ id: row.documentId, ...row.data })),
				colaboradores: colaboradoresRows.map((row) => ({
					id: row.documentId,
					...row.data,
				})),
			},
		},
		metas,
		painel: {
			retiradas: {
				result: rowsToDocumentMap(dashboardRows),
				meta: { generatedAt: new Date().toISOString() },
				baseConfig: metas.baseConfig || null,
				feriados: feriadosRows.map((row) => normalizeHoliday(row.data)),
			},
			forcaTarefa: metas.forcaTarefa,
		},
	};
}

async function buildRhDomain() {
	const [colaboradoresRows, feriasRows] = await Promise.all([
		listCollectionData("colaboradores", { limit: 2000 }),
		listCollectionData("ferias", { limit: 2000 }),
	]);

	return {
		domain: "rh",
		generatedAt: new Date().toISOString(),
		colaboradores: {
			items: colaboradoresRows.map((row) => ({
				id: row.documentId,
				...row.data,
			})),
		},
		ferias: feriasRows.map((row) => ({ id: row.documentId, ...row.data })),
	};
}

async function buildOperationalDomain({ repairMatch = false } = {}) {
	const [mapaRaw, matchOSRaw, agentesMatchOSRaw] = await Promise.all([
		getDocumentData("public_dashboard/mapa_os"),
		getDocumentData("public_dashboard/match_os"),
		getDocumentData("public_dashboard/agentes_match_os"),
	]);
	const { matchOS, agentesMatchOS } = await resolveMatchSnapshots(
		matchOSRaw,
		agentesMatchOSRaw,
		{ allowRebuild: repairMatch },
	);

	return {
		domain: "operacional",
		generatedAt: new Date().toISOString(),
		mapa: mapaRaw,
		matchOS,
		agentesMatchOS,
	};
}

async function buildPublicDashboard({ matchDetail = false } = {}) {
	const [
		dashboardRows,
		agentesRows,
		feriadosRows,
		config,
		mapaRaw,
		matchOSRaw,
		agentesMatchOSRaw,
	] = await Promise.all([
		listCollectionData("dashboard", { limit: 36 }),
		listCollectionData("dashboardagentes", { limit: 36 }),
		listCollectionData("feriados", { limit: 300 }),
		getDocumentData("config/metas"),
		getDocumentData("public_dashboard/mapa_os"),
		getDocumentData("public_dashboard/match_os"),
		getDocumentData("public_dashboard/agentes_match_os"),
	]);
	const mapa = mapaRaw;
	const { matchOS: matchOSFull, agentesMatchOS: agentesMatchOSFull } =
		await resolveMatchSnapshots(matchOSRaw, agentesMatchOSRaw, {
			allowRebuild: matchDetail,
		});
	const matchOS = matchDetail ? matchOSFull : compactMatchSlice(matchOSFull);
	const agentesMatchOS = matchDetail
		? agentesMatchOSFull
		: compactMatchSlice(agentesMatchOSFull);

	return {
		generatedAt: new Date().toISOString(),
		mapa,
		matchOS,
		agentesMatchOS,
		painel: {
			retiradas: {
				result: rowsToDocumentMap(dashboardRows),
				meta: { generatedAt: new Date().toISOString() },
				feriados: feriadosRows.map((row) => normalizeHoliday(row.data)),
			},
			agentes: {
				result: rowsToDocumentMap(agentesRows),
				meta: { generatedAt: new Date().toISOString() },
			},
			forcaTarefa: config?.forcaTarefa || null,
		},
		months: MONTHS,
	};
}

async function getCachedPublicDashboard(options = {}) {
	const matchDetail = Boolean(options.matchDetail);
	if (matchDetail) {
		return {
			data: await buildPublicDashboard({ matchDetail }),
			cacheStatus: "BYPASS_DETAIL",
			cacheAgeMs: 0,
		};
	}

	const ttlMs = getPublicDashboardCacheTtlMs();
	const now = Date.now();
	const cacheAgeMs = now - publicDashboardCache.cachedAt;

	if (ttlMs > 0 && publicDashboardCache.data && cacheAgeMs < ttlMs) {
		return {
			data: publicDashboardCache.data,
			cacheStatus: "HIT",
			cacheAgeMs,
		};
	}

	if (ttlMs > 0 && publicDashboardCache.pending) {
		const data = await publicDashboardCache.pending;
		return {
			data,
			cacheStatus: "JOIN",
			cacheAgeMs: Date.now() - publicDashboardCache.cachedAt,
		};
	}

	const pending = buildPublicDashboard();
	publicDashboardCache.pending = pending;

	try {
		const data = await pending;
		if (ttlMs > 0) {
			publicDashboardCache.data = data;
			publicDashboardCache.cachedAt = Date.now();
		}
		return {
			data,
			cacheStatus: ttlMs > 0 ? "MISS" : "BYPASS",
			cacheAgeMs: 0,
		};
	} finally {
		if (publicDashboardCache.pending === pending) {
			publicDashboardCache.pending = null;
		}
	}
}

async function buildSnapshotDomain(domain, { compact = false } = {}) {
	if (domain === "dashboard") {
		const snapshot = await buildDashboardDomain();
		return compact ? compactSnapshotDomain(domain, snapshot) : snapshot;
	}
	if (domain === "rh") {
		const snapshot = await buildRhDomain();
		return compact ? compactSnapshotDomain(domain, snapshot) : snapshot;
	}
	if (domain === "operacional") {
		const snapshot = await buildOperationalDomain({ repairMatch: !compact });
		return compact ? compactSnapshotDomain(domain, snapshot) : snapshot;
	}
	if (domain === "financeiro") {
		const snapshot = {
			domain: "financeiro",
			generatedAt: new Date().toISOString(),
		};
		return compact ? compactSnapshotDomain(domain, snapshot) : snapshot;
	}
	return null;
}

module.exports = {
	buildPublicDashboard,
	buildSnapshotDomain,
	getCachedPublicDashboard,
	invalidatePublicDashboardCache,
};
