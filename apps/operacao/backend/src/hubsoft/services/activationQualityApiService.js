const { HUBSOFT_ACTIVATION_ORDER_TYPES } = require("../constants");
const { ACTIVATION_QUALITY_CONFIG, SCHEDULE_STATUS } = require("./activationQualityConfig");
const { analyzeActivationQuality } = require("./activationQualityRules");

function text(value) {
	return String(value ?? "").trim();
}

function parsePositiveInt(value, fallback, max = 200) {
	const number = Number(value);
	if (!Number.isFinite(number) || number <= 0) return fallback;
	return Math.min(Math.floor(number), max);
}

function normalizeSearch(value = "") {
	return text(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function iso(date) {
	const pad = (value) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayRange() {
	const now = new Date();
	return { from: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate())), to: iso(now) };
}

function dateRangeFromPreset(preset = "last7", query = {}) {
	const now = new Date();
	if (preset === "custom" && query.from && query.to) return { from: query.from, to: query.to };
	if (preset === "today") return todayRange();
	if (preset === "yesterday") {
		const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
		return { from: iso(y), to: iso(y) };
	}
	if (preset === "month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
	if (preset === "previousMonth") return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
	const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
	return { from: iso(from), to: iso(now) };
}

function baseSelect() {
	return `
		select
			os.*,
			cs.service_description,
			cs.service_status,
			cs.brand,
			cs.speed_mbps_derived,
			t.nome as technician_name,
			t.email as technician_email,
			t.regional_id,
			t.cidade_id,
			t.cidade_nome,
			e.nome as company_name,
			r.nome as regional_name,
			c.nome as city_name,
			conn.connected as connection_connected,
			conn.pppoe_username,
			conn.session_time_seconds,
			conn.download_gigabytes,
			conn.upload_gigabytes,
			conn.nas_ip_address,
			conn.nas_port_id,
			conn.status_text as connection_status_text,
			conn.captured_at as connection_captured_at,
			coalesce(support.support_events, '[]'::jsonb) as support_events
		  from hubsoft_activation_os_snapshots os
		  left join hubsoft_cliente_servico_snapshots cs
		    on cs.hubsoft_cliente_servico_id = os.hubsoft_cliente_servico_id and cs.is_current = true
		  left join operacao_tecnicos t on t.id = os.operacao_tecnico_id
		  left join operacao_empresas e on e.id = os.operacao_empresa_id
		  left join regionais r on r.id = t.regional_id
		  left join regional_cidades c on c.id = t.cidade_id
		  left join lateral (
		  	select *
		  	  from hubsoft_connection_snapshots hcs
		  	 where hcs.hubsoft_cliente_servico_id = os.hubsoft_cliente_servico_id
		  	 order by hcs.captured_at desc
		  	 limit 1
		  ) conn on true
		  left join lateral (
		  	select jsonb_agg(jsonb_build_object(
		  		'id', se.id,
		  		'hubsoftAttendanceId', se.hubsoft_attendance_id,
		  		'openedAt', se.opened_at,
		  		'closedAt', se.closed_at,
		  		'attendanceType', se.attendance_type,
		  		'attendanceCategory', se.attendance_category,
		  		'affectsActivationQuality', se.affects_activation_quality,
		  		'rawSummary', se.raw_summary
		  	) order by se.opened_at) as support_events
		  	  from hubsoft_activation_support_events se
		  	 where se.hubsoft_cliente_servico_id = os.hubsoft_cliente_servico_id
		  	   and se.opened_at >= coalesce(os.executed_end_at, os.executed_start_at, os.scheduled_end_at, os.created_at_hubsoft)
		  	   and se.opened_at < coalesce(os.executed_end_at, os.executed_start_at, os.scheduled_end_at, os.created_at_hubsoft) + interval '30 days'
		  ) support on true`;
}

function buildFilters(query = {}) {
	const period = dateRangeFromPreset(query.period || "last7", query);
	const values = [];
	const clauses = ["os.is_current = true", "os.health_monitoring_mode in ('FULL', 'LIMITED')"];
	const dateExpression = "coalesce(os.executed_end_at, os.executed_start_at, os.scheduled_end_at, os.created_at_hubsoft)";
	values.push(period.from);
	clauses.push(`${dateExpression} >= $${values.length}::date`);
	values.push(period.to);
	clauses.push(`${dateExpression} < ($${values.length}::date + interval '1 day')`);
	const addEquals = (column, value, cast = "") => {
		if (!text(value)) return;
		values.push(value);
		clauses.push(`${column} = $${values.length}${cast}`);
	};
	addEquals("os.order_type_id", query.orderTypeId, "::int");
	addEquals("os.operacao_tecnico_id::text", query.technicianId);
	addEquals("os.operacao_empresa_id::text", query.companyId);
	addEquals("t.regional_id", query.regionalId);
	addEquals("t.cidade_id::text", query.cityId);
	addEquals("cs.brand", query.brand);
	return { where: clauses.join(" and "), values, period };
}

function percent(num, den) {
	return den ? Math.round((Number(num || 0) / Number(den)) * 10000) / 100 : null;
}

function emptyMetrics() {
	return {
		production: { completed: 0, analyzable: 0, unidentifiedTechnician: 0 },
		schedule: { ON_TIME: 0, EARLY: 0, LATE: 0, NO_DATA: 0 },
		health: { SAUDAVEL: 0, ATENCAO: 0, CRITICO: 0, SEM_DADOS: 0 },
		rework: {
			d7: { count: 0, denominator: 0, rate: null },
			d15: { count: 0, denominator: 0, rate: null },
			d30: { count: 0, denominator: 0, rate: null },
			repeated: 0,
			totalEvents: 0,
		},
		operational: { durationCount: 0, durationAverageMinutes: null, durationMedianMinutes: null, pending: 0, noConnectionData: 0, noConnection: 0 },
	};
}

function median(values) {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 100) / 100;
}

function publicRow(row, analysis) {
	return {
		id: row.id,
		orderNumber: row.order_number,
		hubsoftOrderId: row.hubsoft_order_id,
		orderTypeId: row.order_type_id,
		orderTypeName: row.order_type_name,
		activationDate: analysis.activationDate,
		scheduledStartAt: row.scheduled_start_at,
		scheduledEndAt: row.scheduled_end_at,
		executedStartAt: row.executed_start_at,
		executedEndAt: row.executed_end_at,
		scheduleStatus: analysis.scheduleStatus,
		durationMinutes: analysis.durationMinutes,
		healthStatus: analysis.health.healthStatus,
		healthReasons: analysis.health.reasons,
		repeatedSupport: analysis.repeatedSupport,
		supportEvents: analysis.supportEvents,
		windows: analysis.windows,
		technician: { id: row.operacao_tecnico_id, name: row.technician_name || "Não identificado", hubsoftUserId: row.hubsoft_technician_id },
		company: { id: row.operacao_empresa_id, name: row.company_name || "Sem empresa" },
		regional: { id: row.regional_id, name: row.regional_name || "" },
		city: { id: row.cidade_id, name: row.city_name || row.cidade_nome || "" },
		service: { brand: row.brand || "UNKNOWN", description: row.service_description || "", status: row.service_status || "" },
		connection: { connected: row.connection_connected, capturedAt: row.connection_captured_at },
	};
}

function enrichMetrics(metrics, durations = []) {
	const total = metrics.production.completed;
	metrics.sample = {
		minimum: ACTIVATION_QUALITY_CONFIG.minQualitySampleSize,
		small: total > 0 && total < ACTIVATION_QUALITY_CONFIG.minQualitySampleSize,
	};
	metrics.schedule.onTimeRate = percent(metrics.schedule.ON_TIME, total);
	for (const key of ["d7", "d15", "d30"]) metrics.rework[key].rate = percent(metrics.rework[key].count, metrics.rework[key].denominator);
	metrics.health.criticalRate = percent(metrics.health.CRITICO, total);
	metrics.operational.durationAverageMinutes = durations.length ? Math.round((durations.reduce((sum, value) => sum + value, 0) / durations.length) * 100) / 100 : null;
	metrics.operational.durationMedianMinutes = median(durations);
	return metrics;
}

function addToMetrics(metrics, row, analysis, durations) {
	metrics.production.completed += row.executed_end_at ? 1 : 0;
	metrics.production.analyzable += analysis.analyzable ? 1 : 0;
	if (!row.operacao_tecnico_id) metrics.production.unidentifiedTechnician += 1;
	metrics.schedule[analysis.scheduleStatus] = (metrics.schedule[analysis.scheduleStatus] || 0) + 1;
	metrics.health[analysis.health.healthStatus] = (metrics.health[analysis.health.healthStatus] || 0) + 1;
	for (const days of ACTIVATION_QUALITY_CONFIG.reworkWindows) {
		const key = `d${days}`;
		if (analysis.windows[key].eligible) metrics.rework[key].denominator += 1;
		if (analysis.windows[key].hasRework) metrics.rework[key].count += 1;
	}
	if (analysis.repeatedSupport) metrics.rework.repeated += 1;
	metrics.rework.totalEvents += analysis.supportEvents.length;
	if (analysis.durationMinutes !== null) {
		metrics.operational.durationCount += 1;
		durations.push(analysis.durationMinutes);
	}
	if (!row.executed_end_at) metrics.operational.pending += 1;
	if (!row.connection_captured_at) metrics.operational.noConnectionData += 1;
	if (row.connection_connected === false) metrics.operational.noConnection += 1;
}

function aggregate(items, dimension) {
	const groups = new Map();
	const dimensionValue = (item) => {
		if (dimension === "technician") return { id: item.row.operacao_tecnico_id || "unmatched", label: item.row.technician_name || "Sem técnico vinculado", subtitle: item.row.company_name || "Cadastro pendente" };
		if (dimension === "company") return { id: item.row.operacao_empresa_id || "none", label: item.row.company_name || "Sem empresa vinculada", subtitle: "" };
		if (dimension === "city") return { id: item.row.cidade_id || item.row.city_name || item.row.cidade_nome || "none", label: item.row.city_name || item.row.cidade_nome || "Cidade não informada", subtitle: item.row.regional_name || "" };
		return { id: item.row.order_type_id || "none", label: item.row.order_type_name || "Sem tipo", subtitle: item.row.health_monitoring_mode || "" };
	};
	for (const item of items) {
		const key = dimensionValue(item);
		const id = String(key.id);
		if (!groups.has(id)) groups.set(id, { id, label: key.label, subtitle: key.subtitle, dimension, metrics: emptyMetrics(), durations: [], osIds: [] });
		const group = groups.get(id);
		addToMetrics(group.metrics, item.row, item.analysis, group.durations);
		group.osIds.push(item.row.id);
	}
	return [...groups.values()].map((group) => ({
		...group,
		metrics: enrichMetrics(group.metrics, group.durations),
		durations: undefined,
	})).sort((a, b) => b.metrics.production.completed - a.metrics.production.completed);
}

function applyQualityFilters(items, query = {}) {
	let filtered = items;
	if (text(query.healthStatus)) filtered = filtered.filter((item) => item.analysis.health.healthStatus === query.healthStatus);
	if (text(query.scheduleStatus)) filtered = filtered.filter((item) => item.analysis.scheduleStatus === query.scheduleStatus);
	if (query.quality === "withRework") return filtered.filter((item) => item.analysis.supportEvents.length > 0);
	if (query.quality === "withoutRework") return filtered.filter((item) => item.analysis.supportEvents.length === 0);
	if (query.quality === "repeated") return filtered.filter((item) => item.analysis.repeatedSupport);
	if (query.quality === "onTime") return filtered.filter((item) => item.analysis.scheduleStatus === SCHEDULE_STATUS.ON_TIME);
	if (query.quality === "late") return filtered.filter((item) => item.analysis.scheduleStatus === SCHEDULE_STATUS.LATE);
	if (query.quality === "criticalHealth") return filtered.filter((item) => item.analysis.health.healthStatus === "CRITICO");
	if (query.quality === "noData") return filtered.filter((item) => item.analysis.health.healthStatus === "SEM_DADOS" || item.analysis.scheduleStatus === SCHEDULE_STATUS.NO_DATA);
	return filtered;
}

async function supportSourceAvailability(db) {
	const { rows } = await db.query(`select count(*)::int as total from hubsoft_activation_support_events`);
	const total = Number(rows[0]?.total || 0);
	return {
		available: total > 0,
		totalEvents: total,
		reason: total > 0 ? null : "SUPPORT_SOURCE_NOT_POPULATED",
	};
}

async function loadAnalyzed(db, query = {}) {
	const filters = buildFilters(query);
	const { rows } = await db.query(`${baseSelect()} where ${filters.where}`, filters.values);
	const items = rows.map((row) => ({ row, analysis: analyzeActivationQuality(row) }));
	return { period: filters.period, items: applyQualityFilters(items, query) };
}

async function summary(db, query = {}) {
	const [{ period, items }, supportSource] = await Promise.all([loadAnalyzed(db, query), supportSourceAvailability(db)]);
	const metrics = emptyMetrics();
	const durations = [];
	for (const item of items) addToMetrics(metrics, item.row, item.analysis, durations);
	return { period, supportSource, metrics: enrichMetrics(metrics, durations), config: ACTIVATION_QUALITY_CONFIG };
}

async function grouped(db, query = {}, dimension = "technician") {
	const page = parsePositiveInt(query.page, 1, 10000);
	const limit = parsePositiveInt(query.limit, 25, 10000);
	const [{ period, items }, supportSource] = await Promise.all([loadAnalyzed(db, query), supportSourceAvailability(db)]);
	let groups = aggregate(items, dimension);
	if (text(query.q)) {
		const q = normalizeSearch(query.q);
		groups = groups.filter((item) => [item.label, item.subtitle].some((value) => normalizeSearch(value).includes(q)));
	}
	if (query.sort === "onTime") groups = [...groups].sort((a, b) => (b.metrics.schedule.onTimeRate || 0) - (a.metrics.schedule.onTimeRate || 0));
	else if (query.sort === "late") groups = [...groups].sort((a, b) => (b.metrics.schedule.LATE || 0) - (a.metrics.schedule.LATE || 0));
	else if (query.sort === "criticalHealth") groups = [...groups].sort((a, b) => (b.metrics.health.CRITICO || 0) - (a.metrics.health.CRITICO || 0));
	else groups = [...groups].sort((a, b) => (b.metrics.production.completed || 0) - (a.metrics.production.completed || 0));
	const offset = (page - 1) * limit;
	return { period, supportSource, items: groups.slice(offset, offset + limit), total: groups.length, page, limit, totalPages: Math.max(1, Math.ceil(groups.length / limit)) };
}

async function detail(db, query = {}) {
	const dimension = query.dimension || "technician";
	const id = text(query.id);
	const page = parsePositiveInt(query.page, 1, 10000);
	const limit = parsePositiveInt(query.limit, 25, 100);
	const [{ period, items }, supportSource] = await Promise.all([loadAnalyzed(db, query), supportSourceAvailability(db)]);
	const groups = aggregate(items, dimension);
	const group = groups.find((item) => item.id === id) || null;
	let osItems = items
		.filter((item) => !group || group.osIds.includes(item.row.id))
		.filter((item) => !text(query.scheduleStatus) || item.analysis.scheduleStatus === query.scheduleStatus)
		.filter((item) => !text(query.healthStatus) || item.analysis.health.healthStatus === query.healthStatus);
	if (text(query.search)) {
		const q = normalizeSearch(query.search);
		osItems = osItems.filter((item) => [
			item.row.order_number,
			item.row.hubsoft_order_id,
			item.row.order_type_name,
			item.row.technician_name,
			item.row.city_name,
			item.row.cidade_nome,
		].some((value) => normalizeSearch(value).includes(q)));
	}
	osItems = osItems.map((item) => publicRow(item.row, item.analysis));
	const total = osItems.length;
	const offset = (page - 1) * limit;
	return {
		period,
		supportSource,
		group,
		items: osItems.slice(offset, offset + limit),
		pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
	};
}

async function filters(db) {
	const { rows } = await db.query(`
		select
			(select jsonb_agg(jsonb_build_object('id', id, 'name', nome) order by nome) from operacao_tecnicos where status = 'Ativo') as technicians,
			(select jsonb_agg(jsonb_build_object('id', id, 'name', nome) order by nome) from operacao_empresas where status = 'Ativa') as companies,
			(select jsonb_agg(jsonb_build_object('id', id, 'name', nome) order by nome) from regionais where ativo = true) as regionals,
			(select jsonb_agg(jsonb_build_object('id', id, 'name', nome, 'regionalId', regional_id) order by nome) from regional_cidades) as cities
	`);
	return {
		orderTypes: HUBSOFT_ACTIVATION_ORDER_TYPES,
		brands: ["SEMPRE", "ONNET", "UNKNOWN"],
		quality: [
			{ id: "withRework", label: "Com rechamado" },
			{ id: "withoutRework", label: "Sem rechamado" },
			{ id: "repeated", label: "Reincidente" },
			{ id: "onTime", label: "Dentro da janela" },
			{ id: "late", label: "Atrasado" },
			{ id: "criticalHealth", label: "Saúde crítica" },
			{ id: "noData", label: "Sem dados" },
		],
		technicians: rows[0]?.technicians || [],
		companies: rows[0]?.companies || [],
		regionals: rows[0]?.regionals || [],
		cities: rows[0]?.cities || [],
	};
}

function toCsv(groups = []) {
	const columns = [
		["label", "Grupo"],
		["subtitle", "Complemento"],
		["metrics.production.completed", "OS"],
		["metrics.schedule.ON_TIME", "Janela OK"],
		["metrics.schedule.onTimeRate", "% Janela OK"],
		["metrics.rework.d7.count", "D+7"],
		["metrics.rework.d7.denominator", "Den D+7"],
		["metrics.rework.d30.count", "D+30"],
		["metrics.rework.d30.denominator", "Den D+30"],
		["metrics.rework.repeated", "Reincidencia"],
		["metrics.health.CRITICO", "Saude critica"],
	];
	const valueAt = (item, path) => path.split(".").reduce((acc, key) => acc?.[key], item);
	const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
	return [
		columns.map(([, label]) => escape(label)).join(";"),
		...groups.map((item) => columns.map(([path]) => escape(valueAt(item, path))).join(";")),
	].join("\n");
}

module.exports = { detail, filters, grouped, summary, toCsv };
