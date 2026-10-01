const { HUBSOFT_ACTIVATION_ORDER_TYPES } = require("../constants");
const { ACTIVATION_KANBAN_COLUMNS, resolveActivationOperationalStatus } = require("./activationOperationalStatus");

function text(value) {
	return String(value ?? "").trim();
}

function firstText(...values) {
	for (const value of values) {
		const clean = text(value);
		if (clean && clean !== "<masked>") return clean;
	}
	return "";
}

function nestedValue(source, path) {
	return path.split(".").reduce((acc, key) => acc?.[key], source);
}

function firstPathText(source, paths = []) {
	for (const path of paths) {
		const value = nestedValue(source, path);
		const clean = firstText(value);
		if (clean) return clean;
	}
	return "";
}

function parsePositiveInt(value, fallback, max = 200) {
	const number = Number(value);
	if (!Number.isFinite(number) || number <= 0) return fallback;
	return Math.min(Math.floor(number), max);
}

function todayRange() {
	const now = new Date();
	const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
	return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function dateRangeFromPreset(preset = "last7", query = {}) {
	const now = new Date();
	const pad = (value) => String(value).padStart(2, "0");
	const iso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	if (preset === "custom" && query.from && query.to) return { from: query.from, to: query.to };
	if (preset === "today") return todayRange();
	if (preset === "yesterday") {
		const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
		return { from: iso(y), to: iso(y) };
	}
	if (preset === "month") {
		return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
	}
	if (preset === "previousMonth") {
		return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
	}
	const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
	return { from: iso(from), to: iso(now) };
}

function buildFilters(query = {}) {
	const period = dateRangeFromPreset(query.period || "last7", query);
	const values = [];
	const clauses = ["os.is_current = true"];
	const dateExpression = "coalesce(os.executed_end_at, os.scheduled_start_at, os.created_at_hubsoft, os.created_at)";
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
	addEquals("os.status", query.status);
	addEquals("os.hubsoft_technician_id", query.hubsoftTechnicianId, "::bigint");
	addEquals("os.operacao_tecnico_id::text", query.technicianId);
	addEquals("os.operacao_empresa_id::text", query.companyId);
	addEquals("t.regional_id", query.regionalId);
	addEquals("t.cidade_id::text", query.cityId);
	addEquals("cs.brand", query.brand);

	if (query.technicianIdentified === "yes") clauses.push("os.operacao_tecnico_id is not null");
	if (query.technicianIdentified === "no") clauses.push("os.operacao_tecnico_id is null");
	if (text(query.q)) {
		values.push(`%${text(query.q).toLowerCase()}%`);
		clauses.push(`(lower(coalesce(os.order_number, '')) like $${values.length} or lower(coalesce(os.order_type_name, '')) like $${values.length})`);
	}
	return { where: clauses.join(" and "), values, period, dateExpression };
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
			conn.captured_at as connection_captured_at
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
		  ) conn on true`;
}

function publicActivation(row) {
	const derived = resolveActivationOperationalStatus(row);
	const raw = row.raw_payload_sanitized || {};
	const rawTechnician = Array.isArray(raw.tecnicos) ? raw.tecnicos[0] : null;
	const rawRelation = Array.isArray(raw.ordem_servico_tecnico) ? raw.ordem_servico_tecnico[0] : null;
	const rawCityName = firstPathText(raw, [
		"cidade.nome",
		"cidade.display",
		"cliente_servico.cidade.nome",
		"cliente_servico.cidade.display",
		"cliente_servico.endereco_instalacao.cidade",
		"cliente_servico.endereco_instalacao.cidade_nome",
		"endereco.cidade",
		"endereco.cidade_nome",
	]);
	const rawTechnicianName = firstText(
		rawTechnician?.display,
		rawTechnician?.name,
		rawTechnician?.nome,
		rawRelation?.usuario?.display,
		rawRelation?.usuario?.name,
		rawRelation?.tecnico?.display,
		rawRelation?.tecnico?.name,
	);
	return {
		id: row.id,
		hubsoftOrderId: row.hubsoft_order_id,
		orderNumber: row.order_number,
		orderTypeId: row.order_type_id,
		orderTypeName: row.order_type_name,
		rawStatus: row.status,
		derivedStatus: derived,
		executing: row.executando === true,
		closureReasonName: row.closure_reason_name || "",
		createdAtHubsoft: row.created_at_hubsoft,
		scheduledStartAt: row.scheduled_start_at,
		scheduledEndAt: row.scheduled_end_at,
		executedStartAt: row.executed_start_at,
		executedEndAt: row.executed_end_at,
		firstSeenAt: row.first_seen_at,
		lastSeenAt: row.last_seen_at,
		syncedAt: row.synced_at,
		version: row.version,
		technician: {
			id: row.operacao_tecnico_id,
			hubsoftUserId: row.hubsoft_technician_id,
			name: row.technician_name || rawTechnicianName || "Não identificado",
			matchStatus: row.technician_match_status,
			matchReason: row.technician_match_reason,
		},
		company: { id: row.operacao_empresa_id, name: row.company_name || "" },
		regional: { id: row.regional_id, name: row.regional_name || "" },
		city: { id: row.cidade_id, name: row.city_name || row.cidade_nome || rawCityName || "" },
		service: {
			description: row.service_description || "",
			status: row.service_status || "",
			brand: row.brand || "UNKNOWN",
			speedMbps: row.speed_mbps_derived,
		},
		connection: {
			connected: row.connection_connected,
			pppoeUsername: row.pppoe_username || "",
			sessionTimeSeconds: row.session_time_seconds,
			downloadGigabytes: row.download_gigabytes,
			uploadGigabytes: row.upload_gigabytes,
			nasIpAddress: row.nas_ip_address,
			nasPortId: row.nas_port_id || "",
			statusText: row.connection_status_text || "",
			capturedAt: row.connection_captured_at,
		},
	};
}

function dateKey(value) {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toISOString().slice(0, 10);
}

async function listActivations(db, query = {}) {
	const filters = buildFilters(query);
	const page = parsePositiveInt(query.page, 1, 10000);
	const limit = parsePositiveInt(query.limit, 30, 10000);
	const offset = (page - 1) * limit;
	const { rows: countRows } = await db.query(`${baseSelect()} where ${filters.where}`, filters.values);
	const all = countRows.map(publicActivation);
	let filtered = all;
	if (query.derivedStatus) filtered = all.filter((item) => item.derivedStatus.id === query.derivedStatus);
	const total = filtered.length;
	return {
		items: filtered.slice(offset, offset + limit),
		page,
		limit,
		total,
		totalPages: Math.max(1, Math.ceil(total / limit)),
		period: filters.period,
	};
}

function countBy(items, picker) {
	const map = new Map();
	for (const item of items) {
		const key = text(picker(item));
		if (!key) continue;
		map.set(key, (map.get(key) || 0) + 1);
	}
	return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function groupDailyEvolution(items) {
	const map = new Map();
	const ensure = (label) => {
		if (!map.has(label)) map.set(label, { label, created: 0, completed: 0, value: 0 });
		return map.get(label);
	};
	for (const item of items) {
		const created = dateKey(item.createdAtHubsoft);
		if (created) {
			const row = ensure(created);
			row.created += 1;
			row.value = row.created;
		}
		const completed = item.derivedStatus.id === "completed" ? dateKey(item.executedEndAt) : "";
		if (completed) ensure(completed).completed += 1;
	}
	return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

async function dashboard(db, query = {}) {
	const data = await listActivations(db, { ...query, page: 1, limit: 10000 });
	const items = data.items;
	const today = todayRange();
	const createdToday = items.filter((item) => String(item.createdAtHubsoft || "").slice(0, 10) === today.from).length;
	const completedToday = items.filter((item) => String(item.executedEndAt || "").slice(0, 10) === today.from).length;
	const byDerived = countBy(items, (item) => item.derivedStatus.id);
	const metricFor = (status) => byDerived.find((item) => item.label === status)?.value || 0;
	const created = items.length;
	const completed = metricFor("completed");
	const backlog = Math.max(0, created - completed);
	const technicians = new Set(items.map((item) => item.technician.id || item.technician.hubsoftUserId).filter(Boolean));
	const companies = new Set(items.map((item) => item.company.id || item.company.name).filter(Boolean));
	const cities = new Set(items.map((item) => item.city.id || item.city.name).filter(Boolean));
	return {
		period: data.period,
		summary: {
			created,
			completed,
			backlog,
			createdToday,
			completedToday,
			pending: metricFor("to_schedule"),
			inProgress: metricFor("in_progress"),
			awaitingSchedule: items.filter((item) => item.rawStatus === "aguardando_agendamento").length,
			awaitingApproval: metricFor("approval_pending"),
			pendingValidation: metricFor("to_validate"),
			technicians: technicians.size,
			companies: companies.size,
			cities: cities.size,
		},
		distributions: {
			byType: countBy(items, (item) => item.orderTypeName),
			byStatus: countBy(items, (item) => item.derivedStatus.label),
			topCities: countBy(items, (item) => item.city.name).slice(0, 8),
			topCompanies: countBy(items, (item) => item.company.name).slice(0, 8),
			topTechnicians: countBy(items, (item) => item.technician.name).slice(0, 8),
			dailyEvolution: groupDailyEvolution(items),
		},
	};
}

async function kanban(db, query = {}) {
	const data = await listActivations(db, { ...query, page: 1, limit: parsePositiveInt(query.limit, 250, 500) });
	const columns = ACTIVATION_KANBAN_COLUMNS.map((column) => ({
		...column,
		items: data.items.filter((item) => item.derivedStatus.id === column.id),
	}));
	return { period: data.period, columns, total: data.total };
}

async function detail(db, id) {
	const { rows } = await db.query(`${baseSelect()} where os.id = $1 and os.is_current = true limit 1`, [id]);
	return rows[0] ? publicActivation(rows[0]) : null;
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
		statuses: ACTIVATION_KANBAN_COLUMNS,
		brands: ["SEMPRE", "ONNET", "UNKNOWN"],
		technicians: rows[0]?.technicians || [],
		companies: rows[0]?.companies || [],
		regionals: rows[0]?.regionals || [],
		cities: rows[0]?.cities || [],
	};
}

async function latestSync(db) {
	const { rows } = await db.query(
		`select * from hubsoft_activation_sync_runs order by coalesce(started_at, created_at) desc limit 1`,
	);
	return rows[0] || null;
}

function toCsv(items = []) {
	const columns = [
		["orderNumber", "Numero OS"],
		["orderTypeName", "Tipo"],
		["rawStatus", "Status HubSoft"],
		["derivedStatus.label", "Status Operacional"],
		["technician.name", "Tecnico"],
		["company.name", "Empresa"],
		["regional.name", "Regional"],
		["city.name", "Cidade"],
		["service.brand", "Marca"],
		["service.speedMbps", "Velocidade Mbps"],
		["scheduledStartAt", "Inicio Programado"],
		["executedEndAt", "Termino Executado"],
	];
	const valueAt = (item, path) => path.split(".").reduce((acc, key) => acc?.[key], item);
	const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
	return [
		columns.map(([, label]) => escape(label)).join(";"),
		...items.map((item) => columns.map(([path]) => escape(valueAt(item, path))).join(";")),
	].join("\n");
}

module.exports = { dashboard, detail, filters, kanban, latestSync, listActivations, toCsv };
