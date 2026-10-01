const { HUBSOFT_ACTIVATION_ORDER_TYPES } = require("../constants");
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
	const now = new Date();
	const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
	return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function dateRangeFromPreset(preset = "last30", query = {}) {
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
	const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
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

function publicHealthItem(row, evaluation) {
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
		evidence: evaluation.evidence,
		evaluatedAt: evaluation.evaluatedAt,
		technician: {
			id: row.operacao_tecnico_id,
			hubsoftUserId: row.hubsoft_technician_id,
			name: row.technician_name || "Não identificado",
			matchStatus: row.technician_match_status,
		},
		company: { id: row.operacao_empresa_id, name: row.company_name || "" },
		regional: { id: row.regional_id, name: row.regional_name || "" },
		city: { id: row.cidade_id, name: row.city_name || row.cidade_nome || "" },
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
	if (text(query.q)) {
		const q = text(query.q).toLowerCase();
		filtered = filtered.filter((item) => [
			item.orderNumber,
			item.orderTypeName,
			item.technician.name,
			item.company.name,
			item.city.name,
			item.regional.name,
		].some((value) => String(value || "").toLowerCase().includes(q)));
	}
	return filtered;
}

function sortHealthItems(items) {
	const statusWeight = { CRITICO: 0, ATENCAO: 1, SEM_DADOS: 2, SAUDAVEL: 3 };
	return [...items].sort((a, b) => {
		const status = (statusWeight[a.healthStatus] ?? 9) - (statusWeight[b.healthStatus] ?? 9);
		if (status) return status;
		return (b.daysSinceActivation ?? -1) - (a.daysSinceActivation ?? -1);
	});
}

async function evaluateRows(db, rows, { persist = true } = {}) {
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
	const evaluated = await evaluateRows(db, rows, { persist: query.persist !== "false" });
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
	return {
		period: data.period,
		summary: {
			monitored: total,
			healthy: byStatus.SAUDAVEL,
			attention: byStatus.ATENCAO,
			critical: byStatus.CRITICO,
			noData: byStatus.SEM_DADOS,
			withRecall: count((item) => item.support.qualityCount > 0),
			withRepeatedSupport: count((item) => item.support.repeated),
			noConnection: count((item) => item.connection.connected === false),
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
			(select jsonb_agg(jsonb_build_object('id', id, 'name', nome) order by nome) from operacao_tecnicos where status = 'Ativo') as technicians,
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
