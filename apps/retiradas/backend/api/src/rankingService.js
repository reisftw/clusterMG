const XLSX = require("xlsx");
const db = require("./db");

const TIME_ZONE = "America/Sao_Paulo";
const META_PROFILES = ["META_D0", "META_D_MINUS_ONE", "META_AUDIT_DAILY"];
const CLASSIFIED_CHANNELS = ["RETIRADA", "REGIONAL", "AA"];
const ALL_CHANNELS = [...CLASSIFIED_CHANNELS, "UNCLASSIFIED"];

const CHANNEL_LABELS = {
	RETIRADA: "Retirada",
	REGIONAL: "Regional",
	AA: "Agente",
	UNCLASSIFIED: "Nao classificado",
};

const TECHNICIAN_CHANNELS = {
	all: CLASSIFIED_CHANNELS,
	withdrawal: ["RETIRADA"],
	regional: ["REGIONAL"],
	agent: ["AA"],
};

function pad(value) {
	return String(value).padStart(2, "0");
}

function formatDateKey(date) {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateKey(value) {
	const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return null;
	const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
	return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDateRange(query = {}) {
	const today = formatDateKey(new Date());
	const startDate = parseDateKey(query.start_date) ? query.start_date : today;
	const endDate = parseDateKey(query.end_date) ? query.end_date : startDate;
	return startDate > endDate
		? { startDate: endDate, endDate: startDate }
		: { startDate, endDate };
}

function countInclusiveDays(startDate, endDate) {
	const start = parseDateKey(startDate);
	const end = parseDateKey(endDate);
	if (!start || !end) return 1;
	return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

function parsePositiveInteger(value, fallback, max) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, max);
}

function normalizeDimension(value) {
	const dimension = String(value || "technician").trim().toLowerCase();
	if (["technician", "regional", "agent", "city"].includes(dimension)) {
		return dimension;
	}
	const oldChannel = String(value || "").trim().toUpperCase();
	if (oldChannel === "CIDADES") return "city";
	if (oldChannel === "REGIONAL") return "regional";
	if (oldChannel === "AA") return "agent";
	return "technician";
}

function normalizeTechnicianChannel(value) {
	const channel = String(value || "all").trim().toLowerCase();
	return Object.prototype.hasOwnProperty.call(TECHNICIAN_CHANNELS, channel)
		? channel
		: "all";
}

function normalizeSort(value) {
	const sort = String(value || "production").toLowerCase();
	if (["production", "average", "name", "last"].includes(sort)) return sort;
	return "production";
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

function buildRecordsWhere(query = {}) {
	const params = makeParamBuilder();
	const { startDate, endDate } = normalizeDateRange(query);
	const clauses = [
		`profile = any(${params.add(META_PROFILES)}::text[])`,
		"active = true",
		`source_date >= (${params.add(startDate)}::date::timestamp at time zone '${TIME_ZONE}')`,
		`source_date < ((${params.add(endDate)}::date + interval '1 day')::timestamp at time zone '${TIME_ZONE}')`,
	];
	if (query.city) {
		clauses.push(`lower(coalesce(source_city, '')) = lower(${params.add(query.city)})`);
	}
	if (query.os_type) {
		clauses.push(`lower(coalesce(source_type, '')) = lower(${params.add(query.os_type)})`);
	}
	if (query.regional_id || query.regional) {
		clauses.push(
			`production_channel = 'REGIONAL' and lower(coalesce(production_owner_id, production_owner_name, '')) = lower(${params.add(query.regional_id || query.regional)})`,
		);
	}
	if (query.agent_id || query.agent) {
		clauses.push(
			`production_channel = 'AA' and lower(coalesce(production_owner_id, production_owner_name, '')) = lower(${params.add(query.agent_id || query.agent)})`,
		);
	}
	return {
		where: clauses.join("\n\t\tand "),
		values: params.values,
		startDate,
		endDate,
	};
}

function rankingOrderBy(sort) {
	if (sort === "average") return "average_per_day desc nulls last, production desc, name asc";
	if (sort === "name") return "name asc, production desc";
	if (sort === "last") return "last_production desc nulls last, production desc";
	return "production desc, name asc";
}

function dedupedRecordsCte(where) {
	return `records as (
		select
			ranked_records.*,
			case
				when jsonb_typeof(raw_excerpt->'tecnicos') = 'array'
					then jsonb_array_length(raw_excerpt->'tecnicos')
				else 0
			end as technician_count,
			nullif(raw_excerpt #>> '{tecnicos,0,id}', '') as technician_id,
			nullif(raw_excerpt #>> '{tecnicos,0,name}', '') as technician_name
		from (
			select
				*,
				row_number() over (
					partition by hubsoft_id
					order by
						case profile
							when 'META_D0' then 1
							when 'META_D_MINUS_ONE' then 2
							when 'META_AUDIT_DAILY' then 3
							else 9
						end,
						updated_at desc nulls last
				) as ranking_record_order
			from hubsoft_sync_records
			where ${where}
		) ranked_records
		where ranking_record_order = 1
	),
	enriched as (
		select
			records.*,
			case
				when technician_count = 1 and nullif(technician_id, '') is not null then 'id:' || technician_id
				when technician_count = 1 and nullif(technician_name, '') is not null then 'name:' || lower(technician_name)
				when technician_count > 1 then 'MULTIPLE_TECHNICIANS'
				else 'NO_TECHNICIAN'
			end as technician_key,
			case
				when technician_count = 1 then coalesce(technician_name, 'Tecnico sem nome')
				when technician_count > 1 then 'Equipe / multiplos tecnicos'
				else 'Sem tecnico identificado'
			end as technician_display_name
		from records
	)`;
}

function channelLabel(channel) {
	return CHANNEL_LABELS[channel] || channel || "-";
}

function technicianTypeFromChannels(channels = []) {
	const unique = [...new Set(channels.filter(Boolean))];
	if (unique.length !== 1) return "MISTO";
	if (unique[0] === "RETIRADA") return "RETIRADA";
	if (unique[0] === "REGIONAL") return "REGIONAL";
	if (unique[0] === "AA") return "AA";
	return unique[0] || "-";
}

function applyRank(rows = []) {
	let lastProduction = null;
	let lastPosition = 0;
	return rows.map((row, index) => {
		const production = Number(row.production || 0);
		const position = production === lastProduction ? lastPosition : index + 1;
		lastProduction = production;
		lastPosition = position;
		return { ...row, position };
	});
}

function mapChannels(row = {}) {
	return {
		withdrawal: Number(row.withdrawal || 0),
		regional: Number(row.regional || 0),
		agent: Number(row.agent || 0),
	};
}

async function getLastSync() {
	const result = await db.query(
		`select max(updated_at) as records_updated_at
		from hubsoft_sync_records
		where profile = any($1::text[]) and active = true`,
		[META_PROFILES],
	);
	const updatedAt = result.rows[0]?.records_updated_at || null;
	const ageMinutes = updatedAt
		? Math.round((Date.now() - new Date(updatedAt).getTime()) / 60_000)
		: null;
	return {
		updatedAt,
		ageMinutes,
		stale: ageMinutes !== null && ageMinutes > 90,
	};
}

async function getSummary(query = {}) {
	const base = buildRecordsWhere(query);
	const result = await db.query(
		`with ${dedupedRecordsCte(base.where)}
		select
			count(distinct hubsoft_id) filter (where production_channel = 'RETIRADA') as retirada,
			count(distinct hubsoft_id) filter (where production_channel = 'REGIONAL') as regional,
			count(distinct hubsoft_id) filter (where production_channel = 'AA') as aa,
			count(distinct hubsoft_id) filter (where production_channel = 'UNCLASSIFIED') as unclassified,
			count(distinct hubsoft_id) filter (where production_channel = any($${base.values.length + 1}::text[])) as classified,
			count(distinct technician_key) filter (where production_channel = any($${base.values.length + 1}::text[]) and technician_count = 1) as active_technicians,
			count(distinct technician_key) filter (where production_channel = 'RETIRADA' and technician_count = 1) as withdrawal_technicians,
			count(distinct technician_key) filter (where production_channel = 'REGIONAL' and technician_count = 1) as regional_technicians,
			count(distinct technician_key) filter (where production_channel = 'AA' and technician_count = 1) as agent_technicians,
			count(distinct coalesce(production_owner_id, production_owner_name)) filter (where production_channel = 'REGIONAL') as regional_entities,
			count(distinct coalesce(production_owner_id, production_owner_name)) filter (where production_channel = 'AA') as agent_entities,
			count(distinct hubsoft_id) filter (where production_channel = any($${base.values.length + 1}::text[]) and technician_count = 0) as no_technician,
			count(distinct hubsoft_id) filter (where production_channel = any($${base.values.length + 1}::text[]) and technician_count > 1) as multiple_technicians
		from enriched`,
		[...base.values, CLASSIFIED_CHANNELS],
	);
	const row = result.rows[0] || {};
	const classified = Number(row.classified || 0);
	const noTechnician = Number(row.no_technician || 0);
	const multipleTechnicians = Number(row.multiple_technicians || 0);
	const attributable = Math.max(0, classified - noTechnician - multipleTechnicians);
	return {
		total: classified + Number(row.unclassified || 0),
		classified,
		retirada: Number(row.retirada || 0),
		regional: Number(row.regional || 0),
		aa: Number(row.aa || 0),
		unclassified: Number(row.unclassified || 0),
		activeTechnicians: Number(row.active_technicians || 0),
		withdrawalTechnicians: Number(row.withdrawal_technicians || 0),
		regionalTechnicians: Number(row.regional_technicians || 0),
		agentTechnicians: Number(row.agent_technicians || 0),
		regionals: Number(row.regional_entities || 0),
		agents: Number(row.agent_entities || 0),
		coverage: {
			attributable,
			noTechnician,
			multipleTechnicians,
			coveragePercent:
				classified > 0 ? Number(((attributable / classified) * 100).toFixed(1)) : null,
		},
	};
}

async function getFilters(query = {}) {
	const base = buildRecordsWhere(query);
	const result = await db.query(
		`with ${dedupedRecordsCte(base.where)}
		select jsonb_build_object(
			'cities', coalesce((select jsonb_agg(value order by value) from (
				select distinct source_city as value from enriched where nullif(source_city, '') is not null
			) x), '[]'::jsonb),
			'osTypes', coalesce((select jsonb_agg(value order by value) from (
				select distinct source_type as value from enriched where nullif(source_type, '') is not null
			) x), '[]'::jsonb),
			'technicians', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from (
				select distinct technician_key as id, technician_display_name as name
				from enriched
				where technician_count = 1 and production_channel = any($${base.values.length + 1}::text[])
			) x), '[]'::jsonb),
			'regionals', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from (
				select distinct
					coalesce(production_owner_id, production_owner_name, '') as id,
					coalesce(production_owner_name, production_owner_id, '') as name
				from enriched
				where production_channel = 'REGIONAL'
			) x), '[]'::jsonb),
			'agents', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from (
				select distinct
					coalesce(production_owner_id, production_owner_name, '') as id,
					coalesce(production_owner_name, production_owner_id, '') as name
				from enriched
				where production_channel = 'AA'
			) x), '[]'::jsonb)
		) as filters`,
		[...base.values, CLASSIFIED_CHANNELS],
	);
	return result.rows[0]?.filters || {
		cities: [],
		osTypes: [],
		technicians: [],
		regionals: [],
		agents: [],
	};
}

async function getDenominator(query = {}, dimension, technicianChannel) {
	const base = buildRecordsWhere(query);
	const channels =
		dimension === "technician"
			? TECHNICIAN_CHANNELS[technicianChannel]
			: dimension === "regional"
				? ["REGIONAL"]
				: dimension === "agent"
					? ["AA"]
					: CLASSIFIED_CHANNELS;
	const result = await db.query(
		`with ${dedupedRecordsCte(base.where)}
		select count(distinct hubsoft_id) as total
		from enriched
		where production_channel = any($${base.values.length + 1}::text[])
			and ($${base.values.length + 2}::boolean = false or technician_count = 1)`,
		[...base.values, channels, dimension === "technician"],
	);
	return Number(result.rows[0]?.total || 0);
}

function buildDimensionSql(dimension) {
	if (dimension === "regional") {
		return {
			filter: `production_channel = any($CHANNELS$::text[])`,
			id: "coalesce(production_owner_id, production_owner_name, 'SEM_REGIONAL')",
			name: "coalesce(production_owner_name, production_owner_id, 'Sem regional')",
			type: "'REGIONAL'",
			responsible: "null::text",
		};
	}
	if (dimension === "agent") {
		return {
			filter: `production_channel = any($CHANNELS$::text[])`,
			id: "coalesce(production_owner_id, production_owner_name, 'SEM_AGENTE')",
			name: "coalesce(production_owner_name, production_owner_id, 'Sem agente')",
			type: "'AA'",
			responsible: "null::text",
		};
	}
	if (dimension === "city") {
		return {
			filter: `production_channel = any($CHANNELS$::text[])`,
			id: "coalesce(source_city, 'SEM_CIDADE')",
			name: "coalesce(source_city, 'Sem cidade')",
			type: "coalesce((array_agg(production_channel order by production_channel))[1], 'CIDADE')",
			responsible: "coalesce((array_agg(production_owner_name order by production_owner_name nulls last))[1], null)",
		};
	}
	return {
		filter: `production_channel = any($CHANNELS$::text[]) and technician_count = 1`,
		id: "technician_key",
		name: "technician_display_name",
		type: "null::text",
		responsible: "case when count(distinct production_owner_name) = 1 then max(production_owner_name) else 'Misto' end",
	};
}

async function getRanking(query = {}) {
	const dimension = normalizeDimension(query.dimension || query.channel);
	const technicianChannel = normalizeTechnicianChannel(query.technician_channel);
	const sort = normalizeSort(query.sort);
	const page = parsePositiveInteger(query.page, 1, 10_000);
	const limit = parsePositiveInteger(query.limit, 20, 100);
	const offset = (page - 1) * limit;
	const base = buildRecordsWhere(query);
	const days = countInclusiveDays(base.startDate, base.endDate);
	const denominator = await getDenominator(query, dimension, technicianChannel);
	const params = makeParamBuilder(base.values);
	const channels =
		dimension === "technician"
			? TECHNICIAN_CHANNELS[technicianChannel]
			: dimension === "regional"
				? ["REGIONAL"]
				: dimension === "agent"
					? ["AA"]
					: CLASSIFIED_CHANNELS;
	const channelsParam = params.add(channels);
	const searchTerm = String(query.search || "").trim();
	const searchClause = searchTerm
		? `and (
			coalesce(name, '') ilike ${params.add(`%${searchTerm}%`)}
			or coalesce(entity_id, '') ilike ${params.add(`%${searchTerm}%`)}
			or coalesce(responsible_name, '') ilike ${params.add(`%${searchTerm}%`)}
		)`
		: "";
	const limitParam = params.add(limit);
	const offsetParam = params.add(offset);
	const sql = buildDimensionSql(dimension);
	const filterSql = sql.filter.replace("$CHANNELS$", () => channelsParam);
	const groupBy =
		dimension === "technician"
			? "technician_key, technician_display_name"
			: dimension === "city"
				? "coalesce(source_city, 'SEM_CIDADE'), coalesce(source_city, 'Sem cidade')"
				: dimension === "regional"
					? "coalesce(production_owner_id, production_owner_name, 'SEM_REGIONAL'), coalesce(production_owner_name, production_owner_id, 'Sem regional')"
					: "coalesce(production_owner_id, production_owner_name, 'SEM_AGENTE'), coalesce(production_owner_name, production_owner_id, 'Sem agente')";
	const result = await db.query(
		`with ${dedupedRecordsCte(base.where)},
		filtered as (
			select *
			from enriched
			where ${filterSql}
		),
		grouped as (
			select
				${sql.id} as entity_id,
				${sql.name} as name,
				${sql.type} as type,
				${sql.responsible} as responsible_name,
				count(distinct hubsoft_id) as production,
				count(distinct technician_key) filter (where technician_count = 1) as unique_technicians,
				count(distinct source_city) as city_count,
				count(distinct (source_date at time zone '${TIME_ZONE}')::date) as active_days,
				max(source_date) as last_production,
				count(distinct hubsoft_id) filter (where production_channel = 'RETIRADA') as withdrawal,
				count(distinct hubsoft_id) filter (where production_channel = 'REGIONAL') as regional,
				count(distinct hubsoft_id) filter (where production_channel = 'AA') as agent,
				jsonb_agg(distinct production_channel) as channels_list,
				(count(distinct hubsoft_id)::numeric / ${days}) as average_per_day
			from filtered
			group by ${groupBy}
		),
		searched as (
			select *
			from grouped
			where true
			${searchClause}
		),
		ranked as (
			select *, count(*) over () as total_rows
			from searched
		)
		select *
		from ranked
		order by ${rankingOrderBy(sort)}
		limit ${limitParam} offset ${offsetParam}`,
		params.values,
	);
	const ranking = applyRank(result.rows).map((row) => {
		const production = Number(row.production || 0);
		const channelCounts = mapChannels(row);
		const channelsList = Array.isArray(row.channels_list) ? row.channels_list : [];
		const type =
			dimension === "technician"
				? technicianTypeFromChannels(channelsList)
				: row.type || dimension.toUpperCase();
		return {
			position: row.position,
			id: String(row.entity_id || ""),
			name: String(row.name || ""),
			dimension,
			type,
			typeLabel: channelLabel(type),
			responsibleName: row.responsible_name || "",
			production,
			participation:
				denominator > 0 ? Number(((production / denominator) * 100).toFixed(1)) : null,
			averagePerDay: Number(row.average_per_day || 0),
			activeDays: Number(row.active_days || 0),
			lastProduction: row.last_production,
			cityCount: Number(row.city_count || 0),
			uniqueTechnicians: Number(row.unique_technicians || 0),
			channels: channelCounts,
			channelsLabel: [
				channelCounts.withdrawal ? `Retirada ${channelCounts.withdrawal}` : "",
				channelCounts.regional ? `Regional ${channelCounts.regional}` : "",
				channelCounts.agent ? `AA ${channelCounts.agent}` : "",
			].filter(Boolean).join(" · "),
		};
	});
	return {
		period: { startDate: base.startDate, endDate: base.endDate, days },
		dimension,
		technicianChannel,
		summary: await getSummary(query),
		filters: await getFilters(query),
		lastSync: await getLastSync(),
		podium: ranking.filter((item) => item.position <= 3).slice(0, 3),
		ranking,
		pagination: {
			page,
			limit,
			total: Number(result.rows[0]?.total_rows || 0),
			pages: Math.max(1, Math.ceil(Number(result.rows[0]?.total_rows || 0) / limit)),
		},
	};
}

function buildDetailFilter(query, dimension, technicianChannel, params) {
	if (dimension === "regional") {
		return `production_channel = 'REGIONAL'
			and coalesce(production_owner_id, production_owner_name, 'SEM_REGIONAL') = ${params.add(query.id || "")}`;
	}
	if (dimension === "agent") {
		return `production_channel = 'AA'
			and coalesce(production_owner_id, production_owner_name, 'SEM_AGENTE') = ${params.add(query.id || "")}`;
	}
	if (dimension === "city") {
		return `production_channel = any(${params.add(CLASSIFIED_CHANNELS)}::text[])
			and coalesce(source_city, 'SEM_CIDADE') = ${params.add(query.id || "")}`;
	}
	return `production_channel = any(${params.add(TECHNICIAN_CHANNELS[technicianChannel])}::text[])
		and technician_count = 1
		and technician_key = ${params.add(query.id || "")}`;
}

async function getDetail(query = {}) {
	const dimension = normalizeDimension(query.dimension || query.channel);
	const technicianChannel = normalizeTechnicianChannel(query.technician_channel);
	const base = buildRecordsWhere(query);
	const params = makeParamBuilder(base.values);
	const predicate = buildDetailFilter(query, dimension, technicianChannel, params);
	const days = countInclusiveDays(base.startDate, base.endDate);
	const result = await db.query(
		`with ${dedupedRecordsCte(base.where)},
		filtered as (
			select *
			from enriched
			where ${predicate}
		),
		daily as (
			select (source_date at time zone '${TIME_ZONE}')::date as day, count(distinct hubsoft_id) as total
			from filtered
			group by 1
		),
		channel_distribution as (
			select production_channel as channel, count(distinct hubsoft_id) as total
			from filtered
			group by 1
		),
		owner_distribution as (
			select coalesce(production_owner_name, production_owner_id, 'Sem responsavel') as name, count(distinct hubsoft_id) as total
			from filtered
			group by 1
			order by total desc, name asc
			limit 20
		),
		city_distribution as (
			select coalesce(source_city, 'Sem cidade') as name, count(distinct hubsoft_id) as total
			from filtered
			group by 1
			order by total desc, name asc
			limit 20
		),
		technician_ranking as (
			select technician_key as id, technician_display_name as name, count(distinct hubsoft_id) as total
			from filtered
			where technician_count = 1
			group by 1,2
			order by total desc, name asc
			limit 20
		)
		select
			(select count(distinct hubsoft_id) from filtered) as production,
			(select count(distinct technician_key) from filtered where technician_count = 1) as unique_technicians,
			(select count(*) from daily) as active_days,
			(select max(source_date) from filtered) as last_production,
			coalesce((select jsonb_agg(jsonb_build_object('day', day, 'total', total) order by day) from daily), '[]'::jsonb) as evolution,
			coalesce((select jsonb_agg(jsonb_build_object('channel', channel, 'label', channel, 'total', total) order by total desc) from channel_distribution), '[]'::jsonb) as channels,
			coalesce((select jsonb_agg(jsonb_build_object('name', name, 'total', total) order by total desc) from owner_distribution), '[]'::jsonb) as owners,
			coalesce((select jsonb_agg(jsonb_build_object('name', name, 'total', total) order by total desc) from city_distribution), '[]'::jsonb) as cities,
			coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'total', total) order by total desc) from technician_ranking), '[]'::jsonb) as technician_ranking,
			coalesce((
				select jsonb_agg(
					jsonb_build_object(
						'hubsoftId', hubsoft_id,
						'number', hubsoft_number,
						'type', source_type,
						'city', source_city,
						'finishedAt', source_date,
						'channel', production_channel,
						'ownerName', production_owner_name,
						'technicianId', technician_id,
						'technicianName', technician_display_name,
						'classificationRule', classification_rule,
						'classificationReason', classification_reason
					)
					order by source_date desc nulls last
				)
				from (
					select distinct on (hubsoft_id) *
					from filtered
					order by hubsoft_id, source_date desc nulls last
					limit 500
				) os
			), '[]'::jsonb) as records`,
		params.values,
	);
	const row = result.rows[0] || {};
	const production = Number(row.production || 0);
	return {
		period: { startDate: base.startDate, endDate: base.endDate, days },
		dimension,
		stats: {
			production,
			activeDays: Number(row.active_days || 0),
			averagePerDay: production / days,
			lastProduction: row.last_production,
			uniqueTechnicians: Number(row.unique_technicians || 0),
		},
		evolution: row.evolution || [],
		channels: row.channels || [],
		owners: row.owners || [],
		cities: row.cities || [],
		technicianRanking: row.technician_ranking || [],
		records: row.records || [],
	};
}

async function exportRankingXlsx(query = {}) {
	const data = await getRanking({ ...query, page: 1, limit: 100 });
	const rows = data.ranking.map((item) => ({
		Posicao: item.position,
		Dimensao: item.dimension,
		"HubSoft ID": item.id.startsWith("id:") ? item.id.replace("id:", "") : "",
		Nome: item.name,
		Tipo: item.typeLabel,
		Responsavel: item.responsibleName,
		Producao: item.production,
		Retirada: item.channels.withdrawal,
		Regional: item.channels.regional,
		AA: item.channels.agent,
		Participacao: item.participation === null ? "" : `${item.participation}%`,
		"Media por dia": Number(item.averagePerDay.toFixed(2)),
		"Ultima producao": item.lastProduction || "",
	}));
	const workbook = XLSX.utils.book_new();
	const worksheet = XLSX.utils.json_to_sheet(rows);
	XLSX.utils.book_append_sheet(workbook, worksheet, "Ranking");
	return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
}

const operationalProductionCache = new Map();
async function getOperationalProduction(query = {}) {
	const cacheKey = JSON.stringify(query);
	const cached = operationalProductionCache.get(cacheKey);
	if (cached && cached.expires > Date.now()) return cached.value;
	const value = loadOperationalProduction(query);
	if (operationalProductionCache.size >= 10) operationalProductionCache.clear();
	operationalProductionCache.set(cacheKey, { value, expires: Date.now() + 15000 });
	try { return await value; } catch (error) { operationalProductionCache.delete(cacheKey); throw error; }
}

async function loadOperationalProduction(query = {}) {
	const base = buildRecordsWhere(query);
	const result = await db.query(
		`with ${dedupedRecordsCte(base.where)}
		 select to_char(source_date at time zone '${TIME_ZONE}', 'YYYY-MM-DD') as day,
		        to_char(source_date at time zone '${TIME_ZONE}', 'HH24') as hour,
		        coalesce(source_city, 'Sem cidade') as city,
		        count(*)::int as total, max(updated_at) as updated_at
		 from records
		 where production_channel = any($${base.values.length + 1}::text[])
		 group by 1, 2, 3`,
		[...base.values, CLASSIFIED_CHANNELS],
	);
	return result.rows;
}

module.exports = {
	getOperationalProduction,
	getDetail,
	getRanking,
	exportRankingXlsx,
};
