const db = require("./db");
const rankingService = require("./rankingService");
const { buildSnapshotDiff } = require("./mapSnapshotDiff");

const TIME_ZONE = "America/Sao_Paulo";
const MAP_PROFILE = "MAPA";
const META_PROFILES = ["META_D0", "META_D_MINUS_ONE", "META_AUDIT_DAILY"];
const VALID_MAP_STATUS = "COMPLETE";
const CLASSIFIED_CHANNELS = ["RETIRADA", "REGIONAL", "AA"];

function text(value) {
	return String(value ?? "").trim();
}

function number(value, fallback = 0) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function toIso(value) {
	if (!value) return "";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function todaySaoPaulo() {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

function addDays(dateText, days) {
	const date = new Date(`${dateText}T12:00:00.000Z`);
	if (Number.isNaN(date.getTime())) return dateText;
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function normalizeDate(value, fallback = todaySaoPaulo()) {
	const raw = text(value);
	return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

function parseLimit(value, fallback = 20, max = 100) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, max);
}

function firstTechnician(raw = {}) {
	const technicians = Array.isArray(raw.tecnicos) ? raw.tecnicos : [];
	const first = technicians[0] || {};
	return {
		id: text(first.id || first.id_tecnico || first.codigo),
		name: text(first.name || first.nome || first.nome_tecnico),
	};
}

function compactRecord(record = {}) {
	const raw = record.raw_excerpt || {};
	const technician = firstTechnician(raw);
	return {
		id: text(record.hubsoft_id),
		syncRunId: record.sync_run_id || null,
		number: text(record.hubsoft_number),
		status: text(record.source_status),
		type: text(record.source_type),
		city: text(record.source_city),
		cityId: text(record.source_city_id),
		sourceDate: record.source_date || null,
		technicianId: technician.id,
		technicianName: technician.name,
		payload: {
			tecnicos: Array.isArray(raw.tecnicos) ? raw.tecnicos : [],
			id_tipo_ordem_servico: raw.id_tipo_ordem_servico || null,
			motivo_fechamento: raw.motivo_fechamento || null,
		},
	};
}

function mapUpdate(row = {}) {
	const summary = row.summary || {};
	return {
		id: row.id,
		profile: row.profile || MAP_PROFILE,
		syncRunId: row.sync_run_id,
		previousSyncRunId: row.previous_sync_run_id,
		previousTotal: number(row.previous_total),
		currentTotal: number(row.current_total),
		addedCount: number(row.added_count),
		removedCount: number(row.removed_count),
		executedCount: number(row.executed_count),
		otherRemovedCount: number(row.other_removed_count),
		updatedCount: number(row.updated_count),
		permanentCount: number(row.permanent_count),
		saldo: number(row.saldo),
		detectedAt: toIso(row.detected_at || row.created_at),
		createdAt: toIso(row.created_at),
		summary,
		topTechnicians: summary.topTechnicians || [],
		topOpenedCities: summary.topOpenedCities || [],
		topClosedCities: summary.topClosedCities || [],
	};
}

function mapItem(row = {}) {
	const payload = row.record_payload || {};
	return {
		id: row.id,
		updateId: row.update_id,
		orderId: row.order_id,
		orderNumber: row.order_number,
		changeType: row.change_type,
		city: row.source_city,
		type: row.source_type,
		status: row.source_status,
		sourceDate: toIso(row.source_date),
		technicianId: row.technician_id,
		technicianName: row.technician_name,
		channel: row.production_channel,
		ownerId: row.production_owner_id,
		ownerName: row.production_owner_name,
		confirmedMetaRecordId: row.confirmed_meta_record_id,
		detectedAt: toIso(row.detected_at),
		payload,
	};
}

function topFrom(items, keyGetter, labelGetter = keyGetter, limit = 5) {
	const map = new Map();
	for (const item of items) {
		const key = text(keyGetter(item));
		if (!key) continue;
		const current = map.get(key) || { key, label: text(labelGetter(item)) || key, total: 0 };
		current.total += 1;
		map.set(key, current);
	}
	return [...map.values()]
		.sort((left, right) => right.total - left.total || left.label.localeCompare(right.label))
		.slice(0, limit);
}

async function captureActiveMapSnapshot(profile = MAP_PROFILE) {
	const result = await db.query(
		`select *
		   from hubsoft_sync_records
		  where profile = $1
		    and active = true`,
		[profile],
	);
	const records = result.rows.map(compactRecord);
	const syncRunCounts = new Map();
	for (const record of records) {
		if (!record.syncRunId) continue;
		syncRunCounts.set(record.syncRunId, (syncRunCounts.get(record.syncRunId) || 0) + 1);
	}
	const previousSyncRunId =
		[...syncRunCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
	return { previousSyncRunId, records };
}

async function loadRun(id) {
	if (!id) return null;
	const result = await db.query(`select * from hubsoft_sync_runs where id = $1`, [id]);
	return result.rows[0] || null;
}

async function findConfirmedExecutions(removedIds = [], previousRun, currentRun) {
	if (!removedIds.length) return new Map();
	const start = previousRun?.finished_at || previousRun?.started_at || null;
	const end = currentRun?.finished_at || new Date().toISOString();
	const result = await db.query(
		`select distinct on (hubsoft_id)
		        id, hubsoft_id, hubsoft_number, source_city, source_type, source_status,
		        source_date, production_channel, production_owner_id,
		        production_owner_name, raw_excerpt
		   from hubsoft_sync_records
		  where profile = any($1::text[])
		    and active = true
		    and hubsoft_id = any($2::text[])
		    and production_channel = any($3::text[])
		    and ($4::timestamptz is null or source_date >= $4::timestamptz - interval '12 hours')
		    and ($5::timestamptz is null or source_date <= $5::timestamptz + interval '1 hour')
		  order by hubsoft_id, source_date desc nulls last`,
		[META_PROFILES, removedIds, CLASSIFIED_CHANNELS, start, end],
	);
	return new Map(result.rows.map((row) => [text(row.hubsoft_id), row]));
}

async function insertItems(client, updateId, syncRunId, items = []) {
	for (const item of items) {
		await client.query(
			`insert into map_sync_update_items (
		       update_id, sync_run_id, order_id, order_number, change_type,
		       source_city, source_type, source_status, source_date,
		       technician_id, technician_name, production_channel,
		       production_owner_id, production_owner_name, confirmed_meta_record_id,
		       detected_at, record_payload
		     ) values (
		       $1, $2, $3, $4, $5,
		       $6, $7, $8, $9,
		       $10, $11, $12,
		       $13, $14, $15,
		       $16, $17::jsonb
		     )
		     on conflict (update_id, order_id, change_type) do update set
		       order_number = excluded.order_number,
		       source_city = excluded.source_city,
		       source_type = excluded.source_type,
		       source_status = excluded.source_status,
		       source_date = excluded.source_date,
		       technician_id = excluded.technician_id,
		       technician_name = excluded.technician_name,
		       production_channel = excluded.production_channel,
		       production_owner_id = excluded.production_owner_id,
		       production_owner_name = excluded.production_owner_name,
		       confirmed_meta_record_id = excluded.confirmed_meta_record_id,
		       detected_at = excluded.detected_at,
		       record_payload = excluded.record_payload`,
			[
				updateId,
				syncRunId,
				item.orderId,
				item.orderNumber,
				item.changeType,
				item.city,
				item.type,
				item.status,
				item.sourceDate || null,
				item.technicianId,
				item.technicianName,
				item.channel || null,
				item.ownerId || null,
				item.ownerName || null,
				item.confirmedMetaRecordId || null,
				item.detectedAt,
				JSON.stringify(item.payload || {}),
			],
		);
	}
}

async function processCompletedMapRun({ runId, previousSnapshot, currentRecords = [], finishedAt }) {
	const currentRun = await loadRun(runId);
	if (!currentRun || ![MAP_PROFILE, "MATCH"].includes(currentRun.profile) || currentRun.status !== VALID_MAP_STATUS) {
		return null;
	}
	const existing = await db.query("select * from map_sync_updates where sync_run_id = $1", [runId]);
	if (existing.rows[0]) return mapUpdate(existing.rows[0]);
	const previousRecords = Array.isArray(previousSnapshot?.records)
		? previousSnapshot.records
		: [];
	const { current: currentCompact, added, removed, updated } = buildSnapshotDiff(previousRecords, currentRecords.map(compactRecord));
	const previousRun = await loadRun(previousSnapshot?.previousSyncRunId);
	const confirmed = await findConfirmedExecutions(
		removed.map((record) => record.id),
		previousRun,
		currentRun,
	);
	const detectedAt = finishedAt || currentRun.finished_at || new Date().toISOString();
	const addedItems = added.map((record) => ({
		orderId: record.id,
		orderNumber: record.number,
		changeType: "ADDED",
		city: record.city,
		type: record.type,
		status: record.status,
		sourceDate: record.sourceDate,
		technicianId: record.technicianId,
		technicianName: record.technicianName,
		detectedAt,
		payload: record.payload,
	}));
	const updatedItems = updated.map((record) => ({
		orderId: record.id,
		orderNumber: record.number,
		changeType: "UPDATED",
		city: record.city,
		type: record.type,
		status: record.status,
		sourceDate: record.sourceDate,
		technicianId: record.technicianId,
		technicianName: record.technicianName,
		detectedAt,
		payload: record.payload,
	}));
	const removedItems = removed.map((record) => {
		const meta = confirmed.get(record.id);
		const metaTech = firstTechnician(meta?.raw_excerpt || {});
		return {
			orderId: record.id,
			orderNumber: record.number,
			changeType: meta ? "REMOVED_EXECUTED" : "REMOVED_UNKNOWN",
			city: meta?.source_city || record.city,
			type: meta?.source_type || record.type,
			status: meta?.source_status || record.status,
			sourceDate: meta?.source_date || record.sourceDate,
			technicianId: metaTech.id || record.technicianId,
			technicianName: metaTech.name || record.technicianName,
			channel: meta?.production_channel || null,
			ownerId: meta?.production_owner_id || null,
			ownerName: meta?.production_owner_name || null,
			confirmedMetaRecordId: meta?.id || null,
			detectedAt,
			payload: {
				...(record.payload || {}),
				confirmedByMeta: Boolean(meta),
				metaRecord: meta
					? {
							id: meta.id,
							channel: meta.production_channel,
							ownerId: meta.production_owner_id,
							ownerName: meta.production_owner_name,
						}
					: null,
			},
		};
	});
	const executedItems = removedItems.filter((item) => item.changeType === "REMOVED_EXECUTED");
	const summary = {
		topTechnicians: topFrom(
			executedItems,
			(item) => item.technicianId || item.technicianName,
			(item) => item.technicianName || item.technicianId,
		),
		topOpenedCities: topFrom(addedItems, (item) => item.city || "Sem cidade"),
		topClosedCities: topFrom(executedItems, (item) => item.city || "Sem cidade"),
		unknownRemovalNotice:
			removedItems.length - executedItems.length > 0
				? "Ha saidas do mapa sem confirmacao de execucao pela Meta."
				: "",
	};
	const client = await db.connect();
	try {
	await client.query("begin");
	const result = await client.query(
		`insert into map_sync_updates (
		   sync_run_id, previous_sync_run_id, previous_total, current_total,
		   added_count, removed_count, executed_count, other_removed_count,
		   updated_count, permanent_count, saldo, summary, detected_at
		 ) values (
		   $1, $2, $3, $4,
		   $5, $6, $7, $8,
		   $9, $10, $11, $12::jsonb, $13
		 )
		 on conflict (sync_run_id) do update set
		   previous_sync_run_id = excluded.previous_sync_run_id,
		   previous_total = excluded.previous_total,
		   current_total = excluded.current_total,
		   added_count = excluded.added_count,
		   removed_count = excluded.removed_count,
		   executed_count = excluded.executed_count,
		   other_removed_count = excluded.other_removed_count,
		   updated_count = excluded.updated_count,
		   permanent_count = excluded.permanent_count,
		   saldo = excluded.saldo,
		   summary = excluded.summary,
		   detected_at = excluded.detected_at
		 returning *`,
		[
			runId,
			previousSnapshot?.previousSyncRunId || null,
			previousRecords.length,
			currentCompact.length,
			addedItems.length,
			removedItems.length,
			executedItems.length,
			removedItems.length - executedItems.length,
			updatedItems.length,
			currentCompact.length - addedItems.length,
			addedItems.length - executedItems.length,
			JSON.stringify(summary),
			detectedAt,
		],
	);
	const update = result.rows[0];
	await client.query("update map_sync_updates set profile = $2 where id = $1", [update.id, currentRun.profile]);
	update.profile = currentRun.profile;
	await insertItems(client, update.id, runId, [...addedItems, ...removedItems, ...updatedItems]);
	await client.query("commit");
	return mapUpdate(update);
	} catch (error) {
		await client.query("rollback");
		throw error;
	} finally {
		client.release();
	}
}

async function listUpdates(query = {}) {
	const date = normalizeDate(query.date);
	const profile = query.profile === "MATCH" ? "MATCH" : MAP_PROFILE;
	const limit = parseLimit(query.limit, 20, 100);
	const result = await db.query(
		`select *
		   from map_sync_updates
		  where profile = $4 and detected_at >= ($1::date::timestamp at time zone $3)
		    and detected_at < (($1::date + interval '1 day')::timestamp at time zone $3)
		  order by detected_at desc
		  limit $2`,
		[date, limit, TIME_ZONE, profile],
	);
	const summaryResult = await db.query(
		`select count(*)::int as updates,
		        coalesce(sum(added_count), 0)::int as added,
		        coalesce(sum(executed_count), 0)::int as executed,
		        coalesce(sum(saldo), 0)::int as saldo,
		        max(detected_at) as last_update
		   from map_sync_updates
		  where profile = $3 and detected_at >= ($1::date::timestamp at time zone $2)
		    and detected_at < (($1::date + interval '1 day')::timestamp at time zone $2)`,
		[date, TIME_ZONE, profile],
	);
	return {
		date,
		summary: {
			updates: number(summaryResult.rows[0]?.updates),
			added: number(summaryResult.rows[0]?.added),
			executed: number(summaryResult.rows[0]?.executed),
			saldo: number(summaryResult.rows[0]?.saldo),
			lastUpdate: toIso(summaryResult.rows[0]?.last_update),
		},
		updates: result.rows.map(mapUpdate),
	};
}

async function getLatestUpdate(profile = MAP_PROFILE) {
	const result = await db.query(
		`select * from map_sync_updates where profile = $1 order by detected_at desc limit 1`,
		[profile === "MATCH" ? "MATCH" : MAP_PROFILE],
	);
	return result.rows[0] ? mapUpdate(result.rows[0]) : null;
}

async function groupItems(updateId) {
	const result = await db.query(
		`select *
		   from map_sync_update_items
		  where update_id = $1
		  order by
		    case change_type
		      when 'ADDED' then 1
		      when 'REMOVED_EXECUTED' then 2
		      when 'REMOVED_UNKNOWN' then 3
		      when 'REMOVED_NO_LONGER_MATCHES_MAP_FILTER' then 4
		      else 5
		    end,
		    source_city nulls last,
		    order_number nulls last`,
		[updateId],
	);
	const items = result.rows.map(mapItem);
	return {
		all: items,
		added: items.filter((item) => item.changeType === "ADDED"),
		executed: items.filter((item) => item.changeType === "REMOVED_EXECUTED"),
		otherRemovals: items.filter((item) =>
			["REMOVED_UNKNOWN", "REMOVED_NO_LONGER_MATCHES_MAP_FILTER"].includes(item.changeType),
		),
		updated: items.filter((item) => item.changeType === "UPDATED"),
	};
}

async function getUpdateDetail(id) {
	const result = await db.query(`select * from map_sync_updates where id = $1`, [id]);
	if (!result.rows[0]) return null;
	const update = mapUpdate(result.rows[0]);
	const items = await groupItems(id);
	return {
		update,
		items,
		topTechnicians: topFrom(
			items.executed,
			(item) => item.technicianId || item.technicianName,
			(item) => item.technicianName || item.technicianId,
			10,
		),
		topOpenedCities: topFrom(items.added, (item) => item.city || "Sem cidade", undefined, 10),
		topClosedCities: topFrom(items.executed, (item) => item.city || "Sem cidade", undefined, 10),
	};
}

async function getHourlyProduction(date = todaySaoPaulo()) {
	const rows = await rankingService.getOperationalProduction({ start_date: date, end_date: date });
	const hours = new Map();
	for (const row of rows) hours.set(row.hour, (hours.get(row.hour) || 0) + number(row.total));
	return [...hours].sort(([a], [b]) => a.localeCompare(b)).map(([hour, total]) => ({ hour: `${hour}h`, total }));
}

async function getDailyProduction(date = todaySaoPaulo()) {
	const rows = await rankingService.getOperationalProduction({ start_date: date, end_date: date });
	return { date, total: rows.reduce((sum, row) => sum + number(row.total), 0), meta: null, percent: null, remaining: null,
		updatedAt: rows.map((row) => toIso(row.updated_at)).sort().at(-1) || null };
}

async function getWeeklyProduction(date = todaySaoPaulo()) {
	const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
	const start = addDays(date, 1 - weekday);
	const rows = await rankingService.getOperationalProduction({ start_date: start, end_date: date });
	const days = Array.from({ length: weekday }, (_, index) => ({ date: addDays(start, index), total: 0 }));
	for (const row of rows) {
		const day = days.find((entry) => entry.date === row.day);
		if (day) day.total += number(row.total);
	}
	const total = days.reduce((sum, day) => sum + day.total, 0);
	return { date, total, averagePerDay: Number((total / days.length).toFixed(1)), days };
}

async function getOpenedCities(date = todaySaoPaulo()) {
	const result = await db.query(
		`select coalesce(source_city, 'Sem cidade') as city,
		        count(*)::int as total
		   from hubsoft_sync_records
		  where profile = $1
		    and active = true
		    and source_date >= ($2::date::timestamp at time zone $3)
		    and source_date < (($2::date + interval '1 day')::timestamp at time zone $3)
		  group by 1
		  order by total desc, city
		  limit 5`,
		[MAP_PROFILE, date, TIME_ZONE],
	);
	return result.rows.map((row) => ({ label: row.city, total: number(row.total) }));
}

async function getClosedCities(date = todaySaoPaulo()) {
	const rows = await rankingService.getOperationalProduction({ start_date: date, end_date: date });
	const cities = new Map();
	for (const row of rows) cities.set(row.city, (cities.get(row.city) || 0) + number(row.total));
	return [...cities].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total).slice(0, 5);
}

async function getOperationalSummary(query = {}) {
	const date = normalizeDate(query.date);
	const weekDate = date;
	const [lastMapUpdate, dailyProduction, weeklyProduction, hourlyProduction, topRanking, openedCities, closedCities] =
		await Promise.all([
			getLatestUpdate(),
			getDailyProduction(date),
			getWeeklyProduction(weekDate),
			getHourlyProduction(date),
			rankingService.getRanking({
				start_date: date,
				end_date: date,
				dimension: "technician",
				technician_channel: "all",
				page: 1,
				limit: 5,
			}).catch(() => ({ ranking: [] })),
			getOpenedCities(date),
			getClosedCities(date),
		]);
	return {
		date,
		lastMapUpdate,
		dailyProduction,
		weeklyProduction,
		hourlyProduction,
		topTechnicians: (topRanking.ranking || []).map((item) => ({
			id: item.id,
			label: item.name,
			total: item.production,
			type: item.typeLabel,
		})),
		topOpenedCities: openedCities,
		topClosedCities: closedCities,
		carousel: {
			intervalSeconds: 60,
			items: ["dailyProduction", "weeklyProduction"],
		},
	};
}

module.exports = {
	captureActiveMapSnapshot,
	getLatestUpdate,
	getOperationalSummary,
	getUpdateDetail,
	listUpdates,
	processCompletedMapRun,
};
