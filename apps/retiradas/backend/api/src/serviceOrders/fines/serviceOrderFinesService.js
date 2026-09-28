const db = require("../../db");

const TIME_ZONE = "America/Sao_Paulo";
const VIEW_PERMISSIONS = [
	"service_orders.fines.view",
	"service_orders.fines.simulate",
	"view_metas",
	"manage_metas",
];
const SIMULATE_PERMISSIONS = [
	"service_orders.fines.simulate",
	"manage_metas",
];

function cleanText(value) {
	return String(value || "").trim();
}

function parsePositiveInteger(value, fallback, max) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, max);
}

function parseDateKey(value) {
	const text = cleanText(value);
	return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeText(value) {
	return cleanText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ")
		.toUpperCase();
}

function parseMoney(value) {
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function addMonths(dateText, months) {
	const date = parseDateKey(dateText)
		? new Date(`${dateText}T12:00:00.000Z`)
		: new Date();
	date.setUTCMonth(date.getUTCMonth() + months);
	return date.toISOString().slice(0, 10);
}

function todaySaoPaulo() {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

function defaultStartDate() {
	const now = new Date();
	const zoned = new Intl.DateTimeFormat("en-CA", {
		timeZone: TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
	return `${zoned.slice(0, 8)}01`;
}

function normalizeDateRange(query = {}) {
	const startDate = parseDateKey(query.start_date || query.startDate) || defaultStartDate();
	const endDate = parseDateKey(query.end_date || query.endDate) || todaySaoPaulo();
	return startDate > endDate
		? { startDate: endDate, endDate: startDate }
		: { startDate, endDate };
}

function makeParamBuilder(initial = []) {
	const values = [...initial];
	return {
		add(value) {
			values.push(value);
			return `$${values.length}`;
		},
		values,
	};
}

function buildWhere(query = {}) {
	const params = makeParamBuilder();
	const { startDate, endDate } = normalizeDateRange(query);
	const clauses = [
		"profile = 'MULTAS'",
		"active = true",
		`source_date >= (${params.add(startDate)}::date::timestamp at time zone '${TIME_ZONE}')`,
		`source_date < ((${params.add(endDate)}::date + interval '1 day')::timestamp at time zone '${TIME_ZONE}')`,
	];
	const search = cleanText(query.q || query.search);
	if (search) {
		const term = `%${search.toLowerCase()}%`;
		clauses.push(`(
			lower(coalesce(hubsoft_number, '')) like ${params.add(term)}
			or lower(coalesce(hubsoft_id, '')) like ${params.add(term)}
			or lower(coalesce(source_city, '')) like ${params.add(term)}
			or lower(coalesce(raw_excerpt #>> '{cliente,nome_razaosocial}', '')) like ${params.add(term)}
			or lower(coalesce(raw_excerpt #>> '{cliente_servico,cliente,nome_razaosocial}', '')) like ${params.add(term)}
			or lower(coalesce(raw_excerpt->>'nome_razaosocial', '')) like ${params.add(term)}
		)`);
	}
	const city = cleanText(query.city || query.cidade);
	if (city) {
		clauses.push(`lower(coalesce(source_city, '')) = lower(${params.add(city)})`);
	}
	return {
		where: clauses.join("\n\t\tand "),
		values: params.values,
		startDate,
		endDate,
	};
}

function mapFineRecord(row = {}) {
	const raw = row.raw_excerpt || {};
	const finance = raw.finance || null;
	const hasFinance = finance && Number(finance.totalCharges || 0) > 0;
	return {
		id: row.id,
		atendimento: row.hubsoft_number || row.hubsoft_id,
		hubsoftId: row.hubsoft_id,
		cliente:
			raw?.cliente?.nome_razaosocial ||
			raw?.cliente_servico?.cliente?.nome_razaosocial ||
			raw?.nome_razaosocial ||
			raw?.cliente_nome ||
			"Não identificado",
		cidade: row.source_city || "Não identificada",
		data: row.source_date,
		tipo: row.source_type || "Multa - Equipamento",
		status: row.source_status || "Resolvido",
		responsavel:
			raw?.usuarios_responsaveis ||
			raw?.responsavel?.nome ||
			row.production_owner_name ||
			"Não identificado",
		finalizadoPor:
			raw?.usuario_fechamento?.name ||
			raw?.usuario_fechamento?.nome ||
			raw?.usuario_fechamento ||
			raw?.finalizado_por?.nome ||
			"Não identificado",
		idCliente: raw?.id_cliente || null,
		codigoCliente: raw?.codigo_cliente || null,
		idClienteServico: raw?.id_cliente_servico || null,
		equipmentType: raw?.equipment_type || "UNKNOWN",
		equipmentReason: raw?.equipment_classification_reason || null,
		serviceName: raw?.servico || "",
		lancadoPor: hasFinance ? finance.lancadoPor || "Não identificado" : "Não identificado",
		valorLancado: hasFinance ? parseMoney(finance.valorLancado) : null,
		valorEsperado: null,
		diferenca: null,
		matchStatus: hasFinance ? "Cobrança localizada" : "Sem cobrança",
		matchConfidence: hasFinance ? "Cliente/serviço conciliado" : "Não conciliado",
		auditStatus: hasFinance ? "Cobrança localizada" : "Sem referência",
		auditReason: hasFinance
			? finance.auditReason || "Cobrança financeira localizada na varredura."
			: "Varredura financeira ainda não localizada para este atendimento.",
		finance: hasFinance ? finance : undefined,
		raw,
	};
}

function flattenFinanceCharges(payload = {}) {
	const groups = payload?.cobrancas_agrupadas?.data || [];
	const charges = [];
	for (const group of groups) {
		const rows = group?.cobrancas?.data || [];
		for (const row of rows) {
			charges.push({
				...row,
				groupVencimento: group.vencimento,
				groupVencimentoBr: group.vencimento_br,
			});
		}
	}
	return charges;
}

function isEquipmentFineCharge(charge = {}) {
	const description = normalizeText(charge.descricao);
	return description.includes("MULTA") && description.includes("EQUIPAMENTO");
}

function pickFineCharges(record, charges) {
	const serviceId = cleanText(record.idClienteServico);
	const candidates = charges.filter(isEquipmentFineCharge);
	if (!serviceId) return candidates;
	const exact = candidates.filter(
		(charge) => cleanText(charge.id_cliente_servico) === serviceId,
	);
	return exact.length ? exact : candidates;
}

async function fetchFinanceCharges(hubsoftSyncProfiles, record) {
	if (!hubsoftSyncProfiles?.requestHubsoft || !record?.idCliente) return [];
	const startDate = addMonths(record.data || todaySaoPaulo(), -6);
	const endDate = addMonths(record.data || todaySaoPaulo(), 12);
	const payload = await hubsoftSyncProfiles.requestHubsoft(
		"/api/v1/cliente/financeiro/cobranca/agrupadas/paginado/50?page=1",
		{
			method: "POST",
			body: {
				filtros: {
					id_cliente: String(record.idCliente),
					cliente_servico: null,
					data_inicio: startDate,
					data_fim: endDate,
					tipo: "ativo",
					situacao: "todos",
				},
			},
		},
	);
	return flattenFinanceCharges(payload);
}

async function enrichWithFinance(records, { hubsoftSyncProfiles } = {}) {
	if (!hubsoftSyncProfiles?.liveFinance) return records;
	const cache = new Map();
	const enrichRecord = async (record) => {
		if (record.matchStatus === "Cobrança localizada") return record;
		let charges = [];
		if (record.idCliente) {
			if (!cache.has(record.idCliente)) {
				cache.set(
					record.idCliente,
					fetchFinanceCharges(hubsoftSyncProfiles, record).catch((error) => {
						return { error };
					}),
				);
			}
			const result = await cache.get(record.idCliente);
			if (Array.isArray(result)) charges = result;
		}
		const fineCharges = pickFineCharges(record, charges);
		if (!fineCharges.length) {
			return record;
		}
		const valorLancado = fineCharges.reduce(
			(total, charge) => total + (parseMoney(charge.valor) || 0),
			0,
		);
		const saldo = fineCharges.reduce(
			(total, charge) => total + (parseMoney(charge.saldo) || 0),
			0,
		);
		return {
			...record,
			lancadoPor: [
				...new Set(
					fineCharges
						.map((charge) => cleanText(charge.id_usuario_cadastro))
						.filter(Boolean),
				),
			].join(", ") || "Não identificado",
			valorLancado,
			diferenca: null,
			matchStatus: "Cobrança localizada",
			matchConfidence: "Cliente/serviço conciliado",
			auditStatus: "Cobrança localizada",
			auditReason: fineCharges
				.map((charge) => `${charge.id_cobranca} - ${charge.descricao}`)
				.join("; "),
			finance: {
				totalCharges: fineCharges.length,
				ids: fineCharges.map((charge) => charge.id_cobranca),
				descriptions: fineCharges.map((charge) => charge.descricao),
				dueDates: [...new Set(fineCharges.map((charge) => charge.data_vencimento_br || charge.data_vencimento).filter(Boolean))],
				saldo,
			},
		};
	};

	const concurrency = 6;
	const enriched = new Array(records.length);
	let cursor = 0;
	const workers = Array.from({ length: Math.min(concurrency, records.length) }, async () => {
		while (cursor < records.length) {
			const index = cursor;
			cursor += 1;
			enriched[index] = await enrichRecord(records[index]);
		}
	});
	await Promise.all(workers);
	return enriched;
}

async function listFineAudit(query = {}, dependencies = {}) {
	const page = parsePositiveInteger(query.page, 1, 10_000);
	const limit = parsePositiveInteger(query.limit, 20, 100);
	const offset = (page - 1) * limit;
	const { where, values, startDate, endDate } = buildWhere(query);
	const summaryResult = await db.query(
		`select
			count(*)::int as total,
			count(*) filter (
				where coalesce((raw_excerpt #>> '{finance,totalCharges}')::numeric, 0) > 0
			)::int as cobrancas_localizadas,
			count(*) filter (
				where coalesce((raw_excerpt #>> '{finance,totalCharges}')::numeric, 0) <= 0
			)::int as sem_cobranca,
			count(*)::int as sem_referencia,
			count(*) filter (
				where coalesce((raw_excerpt #>> '{finance,valorLancado}')::numeric, 0) = 270
			)::int as multas_270,
			coalesce(sum(coalesce((raw_excerpt #>> '{finance,valorLancado}')::numeric, 0)), 0)::numeric as valor_lancado
		   from hubsoft_sync_records
		  where ${where}`,
		values,
	);
	const rowsResult = await db.query(
		`select *
		   from hubsoft_sync_records
		  where ${where}
		  order by source_date desc nulls last, hubsoft_number
		  limit $${values.length + 1}
		  offset $${values.length + 2}`,
		[...values, limit, offset],
	);
	const summaryRow = summaryResult.rows[0] || {};
	const total = Number(summaryRow.total || 0);
	const items = await enrichWithFinance(
		rowsResult.rows.map(mapFineRecord),
		dependencies,
	);
	return {
		items,
		pagination: {
			page,
			limit,
			total,
			totalPages: Math.max(1, Math.ceil(total / limit)),
		},
		period: { startDate, endDate },
		summary: {
			total,
			cobrancasLocalizadas: Number(summaryRow.cobrancas_localizadas || 0),
			semCobranca: Number(summaryRow.sem_cobranca || 0),
			semReferencia: Number(summaryRow.sem_referencia || 0),
			multas270: Number(summaryRow.multas_270 || 0),
			valorLancado: Number(summaryRow.valor_lancado || 0),
			valorEsperado: 0,
			diferenca: 0,
		},
		limitations: [
			"Conciliação financeira calculada sob demanda para os registros da página atual.",
			"Responsável/finalizador/lançador são exibidos quando presentes no payload real.",
			"R$270 não é considerado erro automático.",
		],
	};
}

async function simulateFineAudit(hubsoftSyncProfiles, body = {}, user = {}) {
	const { startDate, endDate } = normalizeDateRange(body);
	return hubsoftSyncProfiles.startProfileRun(
		"MULTAS",
		{
			async: true,
			startDate,
			endDate,
			applyOperational: true,
			},
		user,
	);
}

async function getFineAuditRun(hubsoftSyncProfiles, runId) {
	if (!runId || !hubsoftSyncProfiles?.getRun) return null;
	const run = await hubsoftSyncProfiles.getRun(runId);
	if (!run || run.profile !== "MULTAS") return null;
	return run;
}

module.exports = {
	SIMULATE_PERMISSIONS,
	VIEW_PERMISSIONS,
	getFineAuditRun,
	listFineAudit,
	simulateFineAudit,
};
