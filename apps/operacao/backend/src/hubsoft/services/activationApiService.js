const { HUBSOFT_ACTIVATION_KPI_ORDER_TYPE_IDS, HUBSOFT_ACTIVATION_ORDER_TYPES } = require("../constants");
const { addLocalDays, localDateKey, localMonthEnd, localMonthStart } = require("../normalizers/dates");
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

function activationFamilyFor(orderTypeId, orderTypeName = "") {
	const id = Number(orderTypeId);
	if ([4, 50, 51, 52, 453, 760, 767].includes(id)) return { id: "installation", label: "Instalação" };
	if ([6, 508].includes(id)) return { id: "move", label: "Mudança de Endereço" };
	if (id === 65) return { id: "upgrade", label: "Upgrade" };
	const normalized = text(orderTypeName).toLowerCase();
	if (normalized.includes("mudan")) return { id: "move", label: "Mudança de Endereço" };
	if (normalized.includes("upgrade")) return { id: "upgrade", label: "Upgrade" };
	return { id: "installation", label: "Instalação" };
}

function parsePositiveInt(value, fallback, max = 200) {
	const number = Number(value);
	if (!Number.isFinite(number) || number <= 0) return fallback;
	return Math.min(Math.floor(number), max);
}

function todayRange() {
	const today = localDateKey(new Date());
	return { from: today, to: today };
}

function dateRangeFromPreset(preset = "last7", query = {}) {
	const today = localDateKey(new Date());
	if (preset === "custom" && query.from && query.to) return { from: query.from, to: query.to };
	if (preset === "today") return todayRange();
	if (preset === "yesterday") {
		const y = addLocalDays(today, -1);
		return { from: y, to: y };
	}
	if (preset === "month") {
		return { from: localMonthStart(today), to: localMonthEnd(today) };
	}
	if (preset === "previousMonth") {
		return { from: localMonthStart(today, -1), to: localMonthEnd(today, -1) };
	}
	return { from: addLocalDays(today, -6), to: today };
}

function buildFilters(query = {}) {
	const period = dateRangeFromPreset(query.period || "last7", query);
	const values = [];
	const clauses = ["os.is_current = true", `os.order_type_id = any($1::int[])`];
	values.push(HUBSOFT_ACTIVATION_KPI_ORDER_TYPE_IDS);
	const dateExpression = "coalesce(os.executed_end_at, os.scheduled_start_at, os.created_at_hubsoft, os.created_at)";
	values.push(period.from);
	clauses.push(`(${dateExpression} at time zone 'America/Sao_Paulo')::date >= $${values.length}::date`);
	values.push(period.to);
	clauses.push(`(${dateExpression} at time zone 'America/Sao_Paulo')::date <= $${values.length}::date`);

	const addEquals = (column, value, cast = "") => {
		if (!text(value)) return;
		values.push(value);
		clauses.push(`${column} = $${values.length}${cast}`);
	};
	addEquals("os.order_type_id", query.orderTypeId, "::int");
	addEquals("os.status", query.status);
	addEquals("os.hubsoft_technician_id", query.hubsoftTechnicianId, "::bigint");
	if (text(query.technicianId).startsWith("hubsoft:")) addEquals("os.hubsoft_technician_id", text(query.technicianId).slice(8), "::bigint");
	else addEquals("os.operacao_tecnico_id::text", query.technicianId);
	addEquals("os.operacao_empresa_id::text", query.companyId);
	addEquals("coalesce(ac.regional_id, t.regional_id)", query.regionalId);
	addEquals("coalesce(ac.id, t.cidade_id)::text", query.cityId);
	addEquals("cs.brand", query.brand);

	if (query.technicianIdentified === "yes") clauses.push("os.technician_assignment_status = 'ASSIGNED'");
	if (query.technicianIdentified === "no") clauses.push("os.technician_assignment_status <> 'ASSIGNED'");
	if (text(query.q)) {
		values.push(`%${text(query.q).toLowerCase()}%`);
		clauses.push(`(
			lower(coalesce(os.order_number, '')) like $${values.length}
			or lower(coalesce(os.order_type_name, '')) like $${values.length}
			or lower(coalesce(os.hubsoft_technician_name, t.nome, '')) like $${values.length}
			or lower(coalesce(os.activation_city_name, ac.nome, t.cidade_nome, c.nome, '')) like $${values.length}
		)`);
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
			os.hubsoft_technician_name,
			os.hubsoft_technician_email,
			os.technician_assignment_status,
			os.activation_closure_status,
			os.activation_city_id,
			os.activation_city_name,
			os.activation_city_source,
			os.activation_city_confidence,
			e.nome as company_name,
			coalesce(ar.nome, r.nome) as regional_name,
			coalesce(ac.nome, c.nome) as city_name,
			ac.id as activation_city_local_id,
			ac.regional_id as activation_city_regional_id,
			conn.connected as connection_connected,
			conn.pppoe_username,
			conn.session_time_seconds,
			conn.download_gigabytes,
			conn.upload_gigabytes,
			conn.nas_ip_address,
			conn.nas_port_id,
			conn.status_text as connection_status_text,
			conn.captured_at as connection_captured_at,
			health.health_status,
			health.health_window,
			health.days_since_activation,
			health.reasons as health_reasons,
			health.evaluated_at as health_evaluated_at
		  from hubsoft_activation_os_snapshots os
		  left join hubsoft_cliente_servico_snapshots cs
		    on cs.hubsoft_cliente_servico_id = os.hubsoft_cliente_servico_id and cs.is_current = true
		  left join operacao_tecnicos t on t.id = os.operacao_tecnico_id
		  left join operacao_empresas e on e.id = os.operacao_empresa_id
		  left join regionais r on r.id = t.regional_id
		  left join regional_cidades c on c.id = t.cidade_id
		  left join lateral (
		  	select rc.id, rc.nome, rc.regional_id
		  	  from regional_cidades rc
		  	 where lower(rc.nome) = lower(os.activation_city_name)
		  	 order by rc.nome
		  	 limit 1
		  ) ac on true
		  left join regionais ar on ar.id = ac.regional_id
		  left join lateral (
		  	select *
		  	  from hubsoft_connection_snapshots hcs
		  	 where hcs.hubsoft_cliente_servico_id = os.hubsoft_cliente_servico_id
		  	 order by hcs.captured_at desc
		  	 limit 1
		  ) conn on true
		  left join hubsoft_activation_health_snapshots health
		    on health.activation_snapshot_id = os.id and health.is_current = true`;
}

function publicActivation(row) {
	const derived = resolveActivationOperationalStatus(row);
	const technicianName = row.technician_assignment_status === "UNASSIGNED"
		? "Sem técnico definido"
		: firstText(row.technician_name, row.hubsoft_technician_name, "Não identificado");
	const cityName = firstText(row.activation_city_name, row.city_name, row.cidade_nome);
	return {
		id: row.id,
		hubsoftOrderId: row.hubsoft_order_id,
		orderNumber: row.order_number,
		orderTypeId: row.order_type_id,
		orderTypeName: row.order_type_name,
		orderFamily: activationFamilyFor(row.order_type_id, row.order_type_name),
		rawStatus: row.status,
		derivedStatus: derived,
		executing: row.executando === true,
		closureReasonName: row.closure_reason_name || "",
		closureStatus: row.activation_closure_status || "",
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
			id: row.operacao_tecnico_id || (row.hubsoft_technician_id ? `hubsoft:${row.hubsoft_technician_id}` : null),
			localId: row.operacao_tecnico_id,
			hubsoftUserId: row.hubsoft_technician_id,
			name: technicianName,
			assignmentStatus: row.technician_assignment_status || "UNKNOWN",
			matchStatus: row.technician_match_status,
			matchReason: row.technician_match_reason,
		},
		company: { id: row.operacao_empresa_id, name: row.company_name || "" },
		regional: { id: row.activation_city_regional_id || row.regional_id, name: row.regional_name || "" },
		city: {
			id: row.activation_city_local_id || row.cidade_id || row.activation_city_id,
			name: cityName,
			source: row.activation_city_source || "",
			confidence: row.activation_city_confidence || "MISSING",
		},
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
		health: {
			status: row.health_status || "",
			window: row.health_window || "",
			daysSinceActivation: row.days_since_activation,
			reasons: row.health_reasons || [],
			evaluatedAt: row.health_evaluated_at,
		},
	};
}

function dateKey(value) {
	return localDateKey(value);
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
	filtered = sortActivations(filtered);
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

function timeValue(value, fallback = 0) {
	if (!value) return fallback;
	const timestamp = new Date(value).getTime();
	return Number.isNaN(timestamp) ? fallback : timestamp;
}

function operationalTimestamp(item) {
	if (item.derivedStatus.id === "completed") return timeValue(item.executedEndAt || item.scheduledEndAt || item.lastSeenAt);
	if (item.derivedStatus.id === "in_progress") return timeValue(item.executedStartAt || item.scheduledStartAt || item.createdAtHubsoft);
	if (item.derivedStatus.id === "to_validate") return timeValue(item.executedEndAt || item.scheduledEndAt || item.createdAtHubsoft);
	return timeValue(item.scheduledStartAt || item.createdAtHubsoft || item.firstSeenAt);
}

function healthPriority(item) {
	if (item.health?.status === "CRITICO") return 0;
	if (item.health?.status === "ATENCAO") return 1;
	if (item.connection?.connected === false) return 2;
	if (!item.city?.name || !item.company?.name) return 3;
	return 4;
}

function sortActivations(items = []) {
	return [...items].sort((a, b) => {
		if (a.derivedStatus.id === "completed" || b.derivedStatus.id === "completed") {
			return operationalTimestamp(b) - operationalTimestamp(a);
		}
		const priority = healthPriority(a) - healthPriority(b);
		if (priority !== 0) return priority;
		const age = timeValue(a.createdAtHubsoft || a.firstSeenAt, Number.MAX_SAFE_INTEGER) - timeValue(b.createdAtHubsoft || b.firstSeenAt, Number.MAX_SAFE_INTEGER);
		if (age !== 0) return age;
		return operationalTimestamp(a) - operationalTimestamp(b);
	});
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

function groupByActivationFamily({ openedItems = [], completedItems = [], backlogItems = [], inProgressItems = [] }) {
	const order = ["installation", "move", "upgrade"];
	const labels = new Map([
		["installation", "Instalação"],
		["move", "Mudança de Endereço"],
		["upgrade", "Upgrade"],
	]);
	const base = new Map(order.map((id) => [id, {
		id,
		label: labels.get(id),
		opened: 0,
		completed: 0,
		backlog: 0,
		inProgress: 0,
	}]));
	const bump = (items, key) => {
		for (const item of items) {
			const id = item.orderFamily?.id || activationFamilyFor(item.orderTypeId, item.orderTypeName).id;
			if (!base.has(id)) base.set(id, { id, label: item.orderFamily?.label || labels.get(id) || "Outros", opened: 0, completed: 0, backlog: 0, inProgress: 0 });
			base.get(id)[key] += 1;
		}
	};
	bump(openedItems, "opened");
	bump(completedItems, "completed");
	bump(backlogItems, "backlog");
	bump(inProgressItems, "inProgress");
	return [...base.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
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
	const period = dateRangeFromPreset(query.period || "last7", query);
	const metricTypeIds = HUBSOFT_ACTIVATION_KPI_ORDER_TYPE_IDS;
	const commonValues = [period.from, period.to, metricTypeIds];
	const openedSql = `${baseSelect()}
		where os.is_current = true
		  and os.order_type_id = any($3::int[])
		  and (os.created_at_hubsoft at time zone 'America/Sao_Paulo')::date >= $1::date
		  and (os.created_at_hubsoft at time zone 'America/Sao_Paulo')::date <= $2::date`;
	const completedSql = `${baseSelect()}
		where os.is_current = true
		  and os.order_type_id = any($3::int[])
		  and os.activation_closure_status = 'CONCLUIDA'
		  and os.executed_end_at is not null
		  and (os.executed_end_at at time zone 'America/Sao_Paulo')::date >= $1::date
		  and (os.executed_end_at at time zone 'America/Sao_Paulo')::date <= $2::date`;
	const backlogSql = `${baseSelect()}
		where os.is_current = true
		  and os.order_type_id = any($1::int[])
		  and os.status in ('pendente', 'aguardando_agendamento')`;
	const inProgressSql = `${baseSelect()}
		where os.is_current = true
		  and os.order_type_id = any($1::int[])
		  and (os.executando = true or os.activation_closure_status = 'EM_ATENDIMENTO')`;
	const [openedRows, completedRows, backlogRows, inProgressRows] = await Promise.all([
		db.query(openedSql, commonValues),
		db.query(completedSql, commonValues),
		db.query(backlogSql, [metricTypeIds]),
		db.query(inProgressSql, [metricTypeIds]),
	]);
	const openedItems = openedRows.rows.map(publicActivation);
	const completedItems = completedRows.rows.map(publicActivation);
	const backlogItems = backlogRows.rows.map(publicActivation);
	const inProgressItems = inProgressRows.rows.map(publicActivation);
	const items = openedItems;
	const today = todayRange();
	const createdToday = openedItems.filter((item) => localDateKey(item.createdAtHubsoft) === today.from).length;
	const completedToday = completedItems.filter((item) => localDateKey(item.executedEndAt) === today.from).length;
	const byDerived = countBy(items, (item) => item.derivedStatus.id);
	const metricFor = (status) => byDerived.find((item) => item.label === status)?.value || 0;
	const created = openedItems.length;
	const completed = completedItems.length;
	const closedWithoutConclusion = openedItems.filter((item) => item.derivedStatus.id === "to_validate").length;
	const backlog = backlogItems.length;
	const technicians = new Set(openedItems.map((item) => item.technician.id || item.technician.hubsoftUserId).filter(Boolean));
	const companies = new Set(openedItems.map((item) => item.company.id || item.company.name).filter(Boolean));
	const cities = new Set(openedItems.map((item) => item.city.id || item.city.name).filter(Boolean));
	return {
		period,
		summary: {
			created,
			completed,
			closedWithoutConclusion,
			backlog,
			createdToday,
			completedToday,
			pending: metricFor("to_schedule"),
			inProgress: inProgressItems.length,
			awaitingSchedule: backlogItems.filter((item) => item.rawStatus === "aguardando_agendamento").length,
			awaitingApproval: metricFor("approval_pending"),
			pendingValidation: metricFor("to_validate"),
			technicians: technicians.size,
			companies: companies.size,
			cities: cities.size,
		},
		distributions: {
			byFamily: groupByActivationFamily({ openedItems, completedItems, backlogItems, inProgressItems }),
			byType: countBy(openedItems, (item) => item.orderTypeName),
			byStatus: countBy([...openedItems, ...completedItems], (item) => item.derivedStatus.label),
			topCities: countBy(openedItems, (item) => item.city.name).slice(0, 8),
			topCompanies: countBy(openedItems, (item) => item.company.name).slice(0, 8),
			topTechnicians: countBy(openedItems, (item) => item.technician.name).slice(0, 8),
			dailyEvolution: groupDailyEvolution([...openedItems, ...completedItems]),
		},
	};
}

async function kanban(db, query = {}) {
	const period = dateRangeFromPreset(query.period || "last7", query);
	const metricTypeIds = HUBSOFT_ACTIVATION_KPI_ORDER_TYPE_IDS;
	const limit = parsePositiveInt(query.limit, 500, 1000);
	const currentOpenSql = `${baseSelect()}
		where os.is_current = true
		  and os.order_type_id = any($1::int[])
		  and (
		  	os.status in ('pendente', 'aguardando_agendamento', 'aguardando_aprovacao')
		  	or os.executando = true
		  	or os.activation_closure_status in ('EM_ATENDIMENTO', 'ENCERRADA_SEM_CONCLUSAO')
		  )`;
	const completedSql = `${baseSelect()}
		where os.is_current = true
		  and os.order_type_id = any($3::int[])
		  and os.activation_closure_status = 'CONCLUIDA'
		  and os.executed_end_at is not null
		  and (os.executed_end_at at time zone 'America/Sao_Paulo')::date >= $1::date
		  and (os.executed_end_at at time zone 'America/Sao_Paulo')::date <= $2::date`;
	const [currentOpenRows, completedRows] = await Promise.all([
		db.query(currentOpenSql, [metricTypeIds]),
		db.query(completedSql, [period.from, period.to, metricTypeIds]),
	]);
	const data = {
		period,
		items: sortActivations([
			...currentOpenRows.rows.map(publicActivation),
			...completedRows.rows.map(publicActivation),
		]).slice(0, limit),
	};
	const columns = ACTIVATION_KANBAN_COLUMNS.map((column) => ({
		...column,
		items: data.items.filter((item) => item.derivedStatus.id === column.id),
	}));
	return { period: data.period, columns, total: columns.reduce((sum, column) => sum + column.items.length, 0) };
}

async function detail(db, id) {
	const { rows } = await db.query(`${baseSelect()} where os.id = $1 and os.is_current = true limit 1`, [id]);
	return rows[0] ? publicActivation(rows[0]) : null;
}

async function filters(db) {
	const { rows } = await db.query(`
		select
			(
				select jsonb_agg(item order by item->>'name')
				  from (
				  	select jsonb_build_object('id', id, 'name', nome, 'source', 'local') as item
				  	  from operacao_tecnicos
				  	 where status = 'Ativo'
				  	union
				  	select distinct jsonb_build_object('id', concat('hubsoft:', hubsoft_technician_id), 'name', hubsoft_technician_name, 'source', 'hubsoft')
				  	  from hubsoft_activation_os_snapshots
				  	 where is_current = true
				  	   and hubsoft_technician_id is not null
				  	   and nullif(hubsoft_technician_name, '') is not null
				  ) x
			) as technicians,
			(select jsonb_agg(jsonb_build_object('id', id, 'name', nome) order by nome) from operacao_empresas where status = 'Ativa') as companies,
			(select jsonb_agg(jsonb_build_object('id', id, 'name', nome) order by nome) from regionais where ativo = true) as regionals,
			(select jsonb_agg(jsonb_build_object('id', id, 'name', nome, 'regionalId', regional_id) order by nome) from regional_cidades) as cities
	`);
	return {
		orderTypes: HUBSOFT_ACTIVATION_ORDER_TYPES.filter((item) => HUBSOFT_ACTIVATION_KPI_ORDER_TYPE_IDS.includes(item.id)),
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
