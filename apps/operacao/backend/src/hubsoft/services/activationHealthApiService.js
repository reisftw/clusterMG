const { HUBSOFT_ACTIVATION_ORDER_TYPES } = require("../constants");
const { addLocalDays, localDateKey, localMonthEnd, localMonthStart } = require("../normalizers/dates");
const { evaluateActivationHealth, resolveActivationDate } = require("./activationHealthRules");

function text(value) {
	return String(value ?? "").trim();
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

function dateRangeFromPreset(preset = "last30", query = {}) {
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
	return { from: addLocalDays(today, -29), to: today };
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
			conn.framed_ip_address,
			conn.network_equipment_display,
			prev.connected as previous_connection_connected,
			prev.captured_at as previous_connection_captured_at,
			coalesce(support.support_events, '[]'::jsonb) as support_events
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
		  left join lateral (
		  	select *
		  	  from hubsoft_connection_snapshots hcs
		  	 where hcs.hubsoft_cliente_servico_id = os.hubsoft_cliente_servico_id
		  	   and conn.id is not null
		  	   and hcs.id <> conn.id
		  	 order by hcs.captured_at desc
		  	 limit 1
		  ) prev on true
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
	const period = dateRangeFromPreset(query.period || "last30", query);
	const values = [];
	const clauses = [
		"os.is_current = true",
		"os.health_monitoring_mode in ('FULL', 'LIMITED')",
		"coalesce(os.executed_end_at, os.executed_start_at, os.scheduled_end_at, os.created_at_hubsoft) is not null",
	];
	const dateExpression = "coalesce(os.executed_end_at, os.executed_start_at, os.scheduled_end_at, os.created_at_hubsoft)";
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
	if (text(query.technicianId).startsWith("hubsoft:")) addEquals("os.hubsoft_technician_id", text(query.technicianId).slice(8), "::bigint");
	else addEquals("os.operacao_tecnico_id::text", query.technicianId);
	addEquals("os.operacao_empresa_id::text", query.companyId);
	addEquals("coalesce(ac.regional_id, t.regional_id)", query.regionalId);
	addEquals("coalesce(ac.id, t.cidade_id)::text", query.cityId);
	addEquals("cs.brand", query.brand);
	return { where: clauses.join(" and "), values, period };
}

function publicHealthItem(row, evaluation) {
	const technicianName = row.technician_assignment_status === "UNASSIGNED"
		? "Sem técnico definido"
		: text(row.technician_name || row.hubsoft_technician_name || "Não identificado");
	const cityName = text(row.activation_city_name || row.city_name || row.cidade_nome);
	return {
		id: row.id,
		hubsoftOrderId: row.hubsoft_order_id,
		orderNumber: row.order_number,
		orderTypeId: row.order_type_id,
		orderTypeName: row.order_type_name,
		activationDate: resolveActivationDate(row),
		daysSinceActivation: evaluation.daysSinceActivation,
		healthWindow: evaluation.healthWindow,
		healthStatus: evaluation.healthStatus,
		reasons: evaluation.reasons,
		technicalReasons: evaluation.reasons,
		dataQualityIssues: evaluation.dataQualityIssues || [],
		evidence: evaluation.evidence,
		evaluatedAt: evaluation.evaluatedAt,
		technician: {
			id: row.operacao_tecnico_id || (row.hubsoft_technician_id ? `hubsoft:${row.hubsoft_technician_id}` : null),
			localId: row.operacao_tecnico_id,
			hubsoftUserId: row.hubsoft_technician_id,
			name: technicianName,
			assignmentStatus: row.technician_assignment_status || "UNKNOWN",
			matchStatus: row.technician_match_status,
		},
		company: { id: row.operacao_empresa_id, name: row.company_name || "" },
		regional: { id: row.activation_city_regional_id || row.regional_id, name: row.regional_name || "" },
		city: { id: row.activation_city_local_id || row.cidade_id || row.activation_city_id, name: cityName },
		service: {
			description: row.service_description || "",
			status: row.service_status || "",
			brand: row.brand || "UNKNOWN",
			speedMbps: row.speed_mbps_derived,
		},
		connection: {
			connected: row.connection_connected,
			pppoeUsername: row.pppoe_username || "",
			ip: row.framed_ip_address,
			nasIpAddress: row.nas_ip_address,
			nasPortId: row.nas_port_id || "",
			sessionTimeSeconds: row.session_time_seconds,
			downloadGigabytes: row.download_gigabytes,
			uploadGigabytes: row.upload_gigabytes,
			statusText: row.connection_status_text || "",
			capturedAt: row.connection_captured_at,
			previousConnected: row.previous_connection_connected,
			previousCapturedAt: row.previous_connection_captured_at,
		},
		support: {
			events: evaluation.evidence.support.events,
			qualityCount: evaluation.evidence.support.qualityCount || 0,
			repeated: (evaluation.evidence.support.qualityCount || 0) >= 2,
		},
	};
}

async function persistHealthSnapshot(db, row, evaluation) {
	if (!row?.id || !evaluation?.sourceHash) return;
	const client = typeof db.connect === "function" ? await db.connect() : db;
	try {
		const current = await client.query(
			`select id, source_hash from hubsoft_activation_health_snapshots
			  where activation_snapshot_id = $1 and is_current = true
			  limit 1`,
			[row.id],
		);
		if (current.rows[0]?.source_hash === evaluation.sourceHash) return;
		if (typeof db.connect === "function") await client.query("begin");
		if (current.rows[0]) {
			await client.query(`update hubsoft_activation_health_snapshots set is_current = false where id = $1`, [current.rows[0].id]);
		}
		await client.query(
			`insert into hubsoft_activation_health_snapshots (
				activation_snapshot_id, hubsoft_order_id, hubsoft_cliente_servico_id,
				health_status, days_since_activation, health_window, reasons, evidence, source_hash
			)
			values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)`,
			[
				row.id,
				row.hubsoft_order_id,
				row.hubsoft_cliente_servico_id,
				evaluation.healthStatus,
				evaluation.daysSinceActivation,
				evaluation.healthWindow,
				JSON.stringify(evaluation.reasons || []),
				JSON.stringify(evaluation.evidence || {}),
				evaluation.sourceHash,
			],
		);
		if (typeof db.connect === "function") await client.query("commit");
	} catch (error) {
		if (typeof db.connect === "function") await client.query("rollback");
		throw error;
	} finally {
		if (typeof client.release === "function") client.release();
	}
}

function applyDerivedFilters(items, query = {}) {
	let filtered = items;
	if (text(query.healthStatus)) filtered = filtered.filter((item) => item.healthStatus === query.healthStatus);
	if (text(query.window)) filtered = filtered.filter((item) => item.healthWindow === query.window);
	if (query.withRecall === "yes") filtered = filtered.filter((item) => item.support.qualityCount > 0);
	if (query.withRecall === "no") filtered = filtered.filter((item) => item.support.qualityCount === 0);
	if (query.repeatedSupport === "yes") filtered = filtered.filter((item) => item.support.repeated);
	if (query.repeatedSupport === "no") filtered = filtered.filter((item) => !item.support.repeated);
	if (query.noConnection === "yes") filtered = filtered.filter((item) => item.connection.connected === false);
	if (query.noTraffic === "yes") filtered = filtered.filter((item) => item.reasons.includes("NO_TRAFFIC"));
	if (query.staleData === "yes") filtered = filtered.filter((item) => item.reasons.includes("STALE_CONNECTION_DATA"));
	if (query.dataQuality === "yes") filtered = filtered.filter((item) => item.dataQualityIssues.length > 0);
	if (text(query.q)) {
		const normalize = (value) => text(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
		const q = normalize(query.q);
		filtered = filtered.filter((item) => [
			item.orderNumber,
			item.orderTypeName,
			item.technician.name,
			item.company.name,
			item.city.name,
			item.regional.name,
		].some((value) => normalize(value).includes(q)));
	}
	return filtered;
}

function sortHealthItems(items) {
	const statusWeight = { CRITICO: 0, ATENCAO: 1, SEM_DADOS: 2, SAUDAVEL: 3 };
	const reasonWeight = {
		NO_CONNECTION: 0,
		REPEATED_SUPPORT: 1,
		RECENT_SUPPORT: 2,
		SERVICE_INACTIVE: 3,
		NO_TRAFFIC: 4,
		STALE_CONNECTION_DATA: 5,
	};
	return [...items].sort((a, b) => {
		const status = (statusWeight[a.healthStatus] ?? 9) - (statusWeight[b.healthStatus] ?? 9);
		if (status) return status;
		const aReason = Math.min(...(a.technicalReasons || []).map((reason) => reasonWeight[reason] ?? 9), 9);
		const bReason = Math.min(...(b.technicalReasons || []).map((reason) => reasonWeight[reason] ?? 9), 9);
		if (aReason !== bReason) return aReason - bReason;
		return (b.daysSinceActivation ?? -1) - (a.daysSinceActivation ?? -1);
	});
}

async function evaluateRows(db, rows, { persist = false } = {}) {
	const evaluated = [];
	for (const row of rows) {
		const evaluation = evaluateActivationHealth(row);
		if (persist) await persistHealthSnapshot(db, row, evaluation);
		evaluated.push(publicHealthItem(row, evaluation));
	}
	return evaluated;
}

async function listHealth(db, query = {}) {
	const filters = buildFilters(query);
	const { rows } = await db.query(`${baseSelect()} where ${filters.where}`, filters.values);
	const evaluated = await evaluateRows(db, rows, { persist: query.persist === "true" });
	const filtered = sortHealthItems(applyDerivedFilters(evaluated, query));
	const page = parsePositiveInt(query.page, 1, 10000);
	const limit = parsePositiveInt(query.limit, 30, 10000);
	const offset = (page - 1) * limit;
	return {
		items: filtered.slice(offset, offset + limit),
		page,
		limit,
		total: filtered.length,
		totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
		period: filters.period,
	};
}

function pct(value, total) {
	return total ? Math.round((Number(value || 0) / total) * 1000) / 10 : 0;
}

function countBy(items, keyGetter) {
	const counts = {};
	for (const item of items) {
		const key = keyGetter(item);
		if (!key) continue;
		counts[key] = (counts[key] || 0) + 1;
	}
	return counts;
}

function topReasonCounts(items, field, limit = 5) {
	const counts = {};
	for (const item of items) {
		for (const reason of item[field] || []) {
			counts[reason] = (counts[reason] || 0) + 1;
		}
	}
	return Object.entries(counts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([reason, count]) => ({ reason, count }));
}

async function supportSourceStatus(db) {
	const { rows } = await db.query(`select count(*)::int as total from hubsoft_activation_support_events`);
	const total = Number(rows[0]?.total || 0);
	return {
		available: total > 0,
		total,
		message: total > 0 ? "Fonte com eventos de suporte materializados." : "Dados de suporte ainda não disponíveis.",
	};
}

async function summary(db, query = {}) {
	const data = await listHealth(db, { ...query, page: 1, limit: 10000 });
	const items = data.items;
	const count = (predicate) => items.filter(predicate).length;
	const total = items.length;
	const byStatus = {
		SAUDAVEL: count((item) => item.healthStatus === "SAUDAVEL"),
		ATENCAO: count((item) => item.healthStatus === "ATENCAO"),
		CRITICO: count((item) => item.healthStatus === "CRITICO"),
		SEM_DADOS: count((item) => item.healthStatus === "SEM_DADOS"),
	};
	const byWindow = countBy(items, (item) => item.healthWindow);
	const supportSource = await supportSourceStatus(db);
	return {
		period: data.period,
		supportSource,
		summary: {
			monitored: total,
			healthy: byStatus.SAUDAVEL,
			attention: byStatus.ATENCAO,
			critical: byStatus.CRITICO,
			noData: byStatus.SEM_DADOS,
			withRecall: count((item) => item.support.qualityCount > 0),
			withRepeatedSupport: count((item) => item.support.repeated),
			noConnection: count((item) => item.connection.connected === false),
			dataQuality: count((item) => item.dataQualityIssues.length > 0),
			staleData: count((item) => item.technicalReasons.includes("STALE_CONNECTION_DATA")),
			topTechnicalReasons: topReasonCounts(items, "technicalReasons"),
			topDataQualityIssues: topReasonCounts(items, "dataQualityIssues"),
			byWindow: ["D+1", "D+7", "D+15", "D+30", "SEM_DATA"].map((window) => ({
				window,
				monitored: byWindow[window] || 0,
				critical: items.filter((item) => item.healthWindow === window && item.healthStatus === "CRITICO").length,
				attention: items.filter((item) => item.healthWindow === window && item.healthStatus === "ATENCAO").length,
				healthy: items.filter((item) => item.healthWindow === window && item.healthStatus === "SAUDAVEL").length,
				noData: items.filter((item) => item.healthWindow === window && item.healthStatus === "SEM_DADOS").length,
			})).filter((item) => item.monitored > 0 || item.window !== "SEM_DATA"),
			percentages: {
				healthy: pct(byStatus.SAUDAVEL, total),
				attention: pct(byStatus.ATENCAO, total),
				critical: pct(byStatus.CRITICO, total),
				noData: pct(byStatus.SEM_DADOS, total),
			},
		},
	};
}

async function detail(db, id) {
	const { rows } = await db.query(`${baseSelect()} where os.id = $1 and os.is_current = true limit 1`, [id]);
	if (!rows[0]) return null;
	const [item] = await evaluateRows(db, rows);
	const history = await db.query(
		`select health_status, days_since_activation, health_window, reasons, evidence, evaluated_at
		   from hubsoft_activation_health_snapshots
		  where activation_snapshot_id = $1
		  order by evaluated_at desc
		  limit 20`,
		[id],
	);
	return { ...item, healthHistory: history.rows };
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
				  	   and health_monitoring_mode in ('FULL', 'LIMITED')
				  	   and hubsoft_technician_id is not null
				  	   and nullif(hubsoft_technician_name, '') is not null
				  ) x
			) as technicians,
			(select jsonb_agg(jsonb_build_object('id', id, 'name', nome) order by nome) from operacao_empresas where status = 'Ativa') as companies,
			(select jsonb_agg(jsonb_build_object('id', id, 'name', nome) order by nome) from regionais where ativo = true) as regionals,
			(select jsonb_agg(jsonb_build_object('id', id, 'name', nome, 'regionalId', regional_id) order by nome) from regional_cidades) as cities
	`);
	return {
		orderTypes: HUBSOFT_ACTIVATION_ORDER_TYPES.filter((item) => item.healthMonitoringMode !== "NONE"),
		healthStatuses: ["SAUDAVEL", "ATENCAO", "CRITICO", "SEM_DADOS"],
		windows: ["D+1", "D+7", "D+15", "D+30"],
		brands: ["SEMPRE", "ONNET", "UNKNOWN"],
		technicians: rows[0]?.technicians || [],
		companies: rows[0]?.companies || [],
		regionals: rows[0]?.regionals || [],
		cities: rows[0]?.cities || [],
	};
}

function toCsv(items = []) {
	const columns = [
		["orderNumber", "Numero OS"],
		["orderTypeName", "Tipo"],
		["activationDate", "Ativacao"],
		["daysSinceActivation", "D+n"],
		["healthWindow", "Janela"],
		["healthStatus", "Saude"],
		["reasons", "Motivos"],
		["technician.name", "Tecnico"],
		["company.name", "Empresa"],
		["city.name", "Cidade"],
		["service.brand", "Marca"],
		["connection.connected", "Conectado"],
		["support.qualityCount", "Rechamados"],
	];
	const valueAt = (item, path) => path.split(".").reduce((acc, key) => acc?.[key], item);
	const escape = (value) => `"${String(Array.isArray(value) ? value.join(", ") : value ?? "").replace(/"/g, '""')}"`;
	return [
		columns.map(([, label]) => escape(label)).join(";"),
		...items.map((item) => columns.map(([path]) => escape(valueAt(item, path))).join(";")),
	].join("\n");
}

module.exports = { detail, filters, listHealth, summary, toCsv };
