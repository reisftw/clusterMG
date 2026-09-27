const db = require("../db");
const {
	classifyEquipmentByServiceSpeed,
	cleanText,
	featureEnabled,
	isNewProductionOsType,
	productionOsTypeIds,
	normalizeText,
} = require("../hubsoftOsRules");

const TIME_ZONE = "America/Sao_Paulo";
const META_PROFILES = ["META_D0", "META_D_MINUS_ONE", "META_AUDIT_DAILY"];
const MATCH_WINDOW_DAYS = Number(process.env.EQUIPMENT_MATCH_WINDOW_DAYS || 21);

function normalizeLimit(value, fallback = 20, max = 500) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, max);
}

function normalizePage(value) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return 1;
	return parsed;
}

function normalizeDate(value) {
	const text = cleanText(value);
	return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function defaultDateRange(query = {}) {
	const today = new Intl.DateTimeFormat("en-CA", {
		timeZone: TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
	const startDate = normalizeDate(query.start_date || query.startDate) || today;
	const endDate = normalizeDate(query.end_date || query.endDate) || startDate;
	return startDate > endDate
		? { startDate: endDate, endDate: startDate }
		: { startDate, endDate };
}

function technicianKeyFromRaw(raw = {}) {
	const technicians = Array.isArray(raw.tecnicos) ? raw.tecnicos : [];
	const first = technicians[0] || {};
	return {
		id: cleanText(first.id),
		name: cleanText(first.name),
		normalizedName: normalizeText(first.name),
	};
}

function movementTechnician(row = {}) {
	const raw = row.raw_payload || {};
	return {
		id: cleanText(
			raw.tecnicoId ||
				raw.tecnico_id ||
				raw.tecnico?.id ||
				raw.usuario_recebedor?.id ||
				"",
		),
		name: cleanText(
			raw.tecnicoNome ||
				raw.tecnico_nome ||
				raw.tecnico?.nome ||
				row.registrado_por ||
				raw.usuarioRecebedorNome ||
				"",
		),
		normalizedName: normalizeText(
			raw.tecnicoNome ||
				raw.tecnico_nome ||
				raw.tecnico?.nome ||
				row.registrado_por ||
				raw.usuarioRecebedorNome ||
				"",
		),
	};
}

function movementQuantity(row = {}) {
	const raw = row.raw_payload || {};
	const value = Number(raw.quantidade || raw.quantity || row.quantidade || 1);
	return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 1;
}

async function getEquipmentValues() {
	const result = await db.query(
		`select distinct on (categoria)
			categoria,
			produto_nome,
			valor
		 from movimentacoes_produtos_config
		 where categoria in ('FAST','AC','AX')
		   and valor is not null
		 order by categoria, atualizado_em desc nulls last, produto_nome`,
	);
	return new Map(
		result.rows.map((row) => [
			row.categoria,
			{
				value: row.valor === null ? null : Number(row.valor),
				productName: row.produto_nome,
				source: "movimentacoes_produtos_config",
			},
		]),
	);
}

function sourceRecordsWhere(params, query = {}) {
	const { startDate, endDate } = defaultDateRange(query);
	const clauses = [
		`profile = any($${params.push(META_PROFILES)}::text[])`,
		"active = true",
		`source_date >= ($${params.push(startDate)}::date::timestamp at time zone '${TIME_ZONE}')`,
		`source_date < (($${params.push(endDate)}::date + interval '1 day')::timestamp at time zone '${TIME_ZONE}')`,
		`(raw_excerpt->>'id_tipo_ordem_servico')::int = any($${params.push([
			...productionOsTypeIds(),
		])}::int[])`,
	];
	if (query.technician_id || query.technicianId) {
		clauses.push(`raw_excerpt #>> '{tecnicos,0,id}' = $${params.push(String(query.technician_id || query.technicianId))}`);
	}
	if (query.city) {
		clauses.push(`lower(coalesce(source_city, '')) = lower($${params.push(query.city)})`);
	}
	return {
		where: clauses.join("\n\t\tand "),
		startDate,
		endDate,
	};
}

function sourceRecordsCte(where) {
	return `ranked_records as (
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
			) as recovery_record_order
		from hubsoft_sync_records
		where ${where}
	), records as (
		select * from ranked_records where recovery_record_order = 1
	)`;
}

function snapshotFromRecord(record, valuesByCategory) {
	const raw = record.raw_excerpt || {};
	const classification = classifyEquipmentByServiceSpeed(raw.servico || raw.numero_plano || "");
	const technician = technicianKeyFromRaw(raw);
	const valueConfig = valuesByCategory.get(classification.equipmentType) || {};
	return {
		osRecordId: record.id,
		osId: String(record.hubsoft_id),
		osNumber: record.hubsoft_number,
		osTypeId: Number(raw.id_tipo_ordem_servico || 0) || null,
		osType: record.source_type,
		productionChannel: record.production_channel,
		technicianId: technician.id || record.production_owner_id || null,
		technicianName: technician.name || record.production_owner_name || null,
		technicianNameNormalized: technician.normalizedName || normalizeText(record.production_owner_name),
		cityId: record.source_city_id,
		cityName: record.source_city,
		serviceName: raw.servico || raw.numero_plano || "",
		serviceSpeedMbps: classification.speedMbps,
		equipmentType: classification.equipmentType,
		equipmentUnitValue: valueConfig.value ?? null,
		equipmentValueSource: valueConfig.source || null,
		equipmentValueProductName: valueConfig.productName || null,
		closedAt: record.source_date,
		rawSnapshot: {
			classificationReason: classification.reason,
			rawExcerpt: raw,
			isNewProductionOsType: isNewProductionOsType(raw.id_tipo_ordem_servico),
		},
	};
}

async function getSourceRecords(query = {}) {
	const params = [];
	const base = sourceRecordsWhere(params, query);
	const result = await db.query(
		`with ${sourceRecordsCte(base.where)}
		 select *
		 from records
		 order by source_date desc nulls last, hubsoft_number`,
		params,
	);
	return { ...base, records: result.rows };
}

async function getImpact(query = {}) {
	const params = [];
	const { startDate, endDate } = defaultDateRange(query);
	const legacyIds = [1487, 1488, 1495, 5];
	const newIds = [...productionOsTypeIds()].filter((id) => !legacyIds.includes(id));
	const result = await db.query(
		`with base as (
			select distinct on (hubsoft_id)
				hubsoft_id,
				hubsoft_number,
				source_type,
				(raw_excerpt->>'id_tipo_ordem_servico')::int as type_id
			from hubsoft_sync_records
			where profile = any($1::text[])
			  and active = true
			  and source_date >= ($2::date::timestamp at time zone '${TIME_ZONE}')
			  and source_date < (($3::date + interval '1 day')::timestamp at time zone '${TIME_ZONE}')
			order by hubsoft_id, updated_at desc nulls last
		)
		select
			count(*) filter (where type_id = any($4::int[]))::int as legacy_total,
			count(*) filter (where type_id = any($5::int[]))::int as new_types_total,
			count(*) filter (where type_id = any($6::int[]))::int as total_with_new_rule
		from base`,
		[...params, META_PROFILES, startDate, endDate, legacyIds, newIds, [...productionOsTypeIds()]],
	);
	const row = result.rows[0] || {};
	return {
		startDate,
		endDate,
		legacyTotal: Number(row.legacy_total || 0),
		newTypesTotal: Number(row.new_types_total || 0),
		totalWithNewRule: Number(row.total_with_new_rule || 0),
		delta: Number(row.new_types_total || 0),
		featureFlags: {
			newOsTypes: featureEnabled("ENABLE_NEW_OS_TYPES", true),
			equipmentClassification: featureEnabled("ENABLE_EQUIPMENT_CLASSIFICATION", true),
			stockMatch: featureEnabled("ENABLE_STOCK_MATCH", true),
		},
	};
}

async function upsertSnapshot(snapshot) {
	const result = await db.query(
		`insert into equipment_recovery_snapshots
			(os_record_id, os_id, os_number, os_type_id, os_type, production_channel,
			 technician_id, technician_name, technician_name_normalized,
			 city_id, city_name, service_name, service_speed_mbps, equipment_type,
			 equipment_unit_value, equipment_value_source, equipment_value_product_name,
			 closed_at, raw_snapshot, calculated_at)
		 values
			($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,now())
		 on conflict (os_id) do update set
			os_record_id = excluded.os_record_id,
			os_number = excluded.os_number,
			os_type_id = excluded.os_type_id,
			os_type = excluded.os_type,
			production_channel = excluded.production_channel,
			technician_id = excluded.technician_id,
			technician_name = excluded.technician_name,
			technician_name_normalized = excluded.technician_name_normalized,
			city_id = excluded.city_id,
			city_name = excluded.city_name,
			service_name = excluded.service_name,
			service_speed_mbps = excluded.service_speed_mbps,
			equipment_type = excluded.equipment_type,
			equipment_unit_value = excluded.equipment_unit_value,
			equipment_value_source = excluded.equipment_value_source,
			equipment_value_product_name = excluded.equipment_value_product_name,
			closed_at = excluded.closed_at,
			raw_snapshot = excluded.raw_snapshot,
			calculated_at = now()
		 returning *`,
		[
			snapshot.osRecordId,
			snapshot.osId,
			snapshot.osNumber,
			snapshot.osTypeId,
			snapshot.osType,
			snapshot.productionChannel,
			snapshot.technicianId,
			snapshot.technicianName,
			snapshot.technicianNameNormalized,
			snapshot.cityId,
			snapshot.cityName,
			snapshot.serviceName,
			snapshot.serviceSpeedMbps,
			snapshot.equipmentType,
			snapshot.equipmentUnitValue,
			snapshot.equipmentValueSource,
			snapshot.equipmentValueProductName,
			snapshot.closedAt,
			JSON.stringify(snapshot.rawSnapshot || {}),
		],
	);
	return result.rows[0];
}

async function buildMovementInventory(query = {}) {
	const { startDate, endDate } = defaultDateRange(query);
	const result = await db.query(
		`select
			m.*,
			c.categoria as equipment_type,
			c.valor as configured_value
		 from movimentacoes_estoque m
		 left join movimentacoes_produtos_config c on c.produto_nome = m.produto_nome
		 where m.emitido_em >= (($1::date - interval '${MATCH_WINDOW_DAYS} days')::timestamp at time zone '${TIME_ZONE}')
		   and m.emitido_em < (($2::date + interval '${MATCH_WINDOW_DAYS + 1} days')::timestamp at time zone '${TIME_ZONE}')
		   and coalesce(c.categoria, '') in ('FAST','AC','AX')
		 order by m.emitido_em asc nulls last, m.criado_em asc`,
		[startDate, endDate],
	);
	const used = new Map();
	return result.rows.map((row) => ({
		row,
		quantity: movementQuantity(row),
		remaining() {
			return Math.max(0, this.quantity - (used.get(row.id) || 0));
		},
		consume() {
			used.set(row.id, (used.get(row.id) || 0) + 1);
		},
	}));
}

function daysBetween(left, right) {
	const a = new Date(left);
	const b = new Date(right);
	if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return Infinity;
	return Math.abs(a - b) / 86_400_000;
}

function findMovementMatch(snapshot, movements) {
	if (!featureEnabled("ENABLE_STOCK_MATCH", true)) return null;
	if (!snapshot || snapshot.equipment_type === "UNKNOWN") return null;
	const technicianName = normalizeText(snapshot.technician_name);
	const technicianId = cleanText(snapshot.technician_id);
	const candidates = movements.filter(
		(item) =>
			item.remaining() > 0 &&
			item.row.equipment_type === snapshot.equipment_type &&
			daysBetween(snapshot.closed_at, item.row.emitido_em) <= MATCH_WINDOW_DAYS,
	);
	const byId = candidates.find((item) => {
		const technician = movementTechnician(item.row);
		return technicianId && technician.id && technician.id === technicianId;
	});
	if (byId) return { item: byId, confidence: "CONFIRMED", type: "TECHNICIAN_ID" };
	const byName = candidates.find((item) => {
		const technician = movementTechnician(item.row);
		return technicianName && technician.normalizedName === technicianName;
	});
	if (byName) {
		return {
			item: byName,
			confidence: "PROBABLE",
			type: "NORMALIZED_NAME_WINDOW",
		};
	}
	return null;
}

async function applyMovementMatches(snapshots, query = {}) {
	const movements = await buildMovementInventory(query);
	let matched = 0;
	let probable = 0;
	for (const snapshot of snapshots) {
		const match = findMovementMatch(snapshot, movements);
		if (!match) {
			await db.query(
				`update equipment_recovery_snapshots
					set return_status = case when equipment_type = 'UNKNOWN' then 'UNCLASSIFIED' else 'PENDING' end,
					    match_confidence = 'NOT_FOUND',
					    match_type = null,
					    movement_id = null,
					    movement_at = null
				 where id = $1`,
				[snapshot.id],
			);
			continue;
		}
		match.item.consume();
		if (match.confidence === "CONFIRMED") matched += 1;
		if (match.confidence === "PROBABLE") probable += 1;
		await db.query(
			`update equipment_recovery_snapshots
				set return_status = 'MATCHED',
				    match_confidence = $2,
				    match_type = $3,
				    movement_id = $4,
				    movement_at = $5,
				    calculated_at = now()
			 where id = $1`,
			[
				snapshot.id,
				match.confidence,
				match.type,
				match.item.row.id,
				match.item.row.emitido_em,
			],
		);
		await db.query(
			`insert into equipment_recovery_movement_allocations
				(recovery_id, movement_id, quantity, match_confidence, match_type)
			 values ($1,$2,1,$3,$4)
			 on conflict (recovery_id, movement_id) do nothing`,
			[snapshot.id, match.item.row.id, match.confidence, match.type],
		);
	}
	return { matched, probable };
}

async function reprocess(query = {}, user = {}) {
	const mode = query.apply === false || query.mode === "SIMULATE" ? "SIMULATE" : "APPLY";
	const jobResult = await db.query(
		`insert into equipment_recovery_jobs (status, mode, date_start, date_end, created_by)
		 values ('RUNNING', $1, $2, $3, $4)
		 returning *`,
		[
			mode,
			defaultDateRange(query).startDate,
			defaultDateRange(query).endDate,
			user?.uid || user?.email || null,
		],
	);
	const job = jobResult.rows[0];
	try {
		const valuesByCategory = await getEquipmentValues();
		const source = await getSourceRecords(query);
		const snapshots = source.records.map((record) =>
			snapshotFromRecord(record, valuesByCategory),
		);
		const summary = summarizeSnapshots(snapshots);
		if (mode === "APPLY") {
			const saved = [];
			for (const snapshot of snapshots) saved.push(await upsertSnapshot(snapshot));
			const matchSummary = await applyMovementMatches(saved, query);
			Object.assign(summary, matchSummary, { persisted: saved.length });
		}
		await db.query(
			`update equipment_recovery_jobs
				set status = 'COMPLETE', finished_at = now(), summary = $2::jsonb
			 where id = $1`,
			[job.id, JSON.stringify(summary)],
		);
		return { jobId: job.id, mode, ...source, summary };
	} catch (error) {
		await db.query(
			`update equipment_recovery_jobs
				set status = 'FAILED', finished_at = now(), error_message = $2
			 where id = $1`,
			[job.id, error?.message || "Falha ao reprocessar recuperação."],
		);
		throw error;
	}
}

function summarizeSnapshots(snapshots = []) {
	const byEquipment = {};
	const byType = {};
	let totalValue = 0;
	for (const snapshot of snapshots) {
		byEquipment[snapshot.equipmentType] = (byEquipment[snapshot.equipmentType] || 0) + 1;
		byType[snapshot.osType] = (byType[snapshot.osType] || 0) + 1;
		totalValue += Number(snapshot.equipmentUnitValue || 0);
	}
	return {
		total: snapshots.length,
		totalValue,
		byEquipment,
		byType,
	};
}

async function getSummary(query = {}) {
	const { startDate, endDate } = defaultDateRange(query);
	const result = await db.query(
		`select
			count(*)::int as total,
			count(*) filter (where return_status = 'MATCHED')::int as devolvidos,
			count(*) filter (where return_status in ('PENDING','NOT_FOUND'))::int as pendentes,
			count(*) filter (where equipment_type = 'UNKNOWN')::int as desconhecidos,
			sum(coalesce(equipment_unit_value, 0))::numeric as valor_total,
			sum(coalesce(equipment_unit_value, 0)) filter (where return_status = 'MATCHED')::numeric as valor_devolvido,
			sum(coalesce(equipment_unit_value, 0)) filter (where return_status <> 'MATCHED')::numeric as valor_pendente
		 from equipment_recovery_snapshots
		 where closed_at >= ($1::date::timestamp at time zone '${TIME_ZONE}')
		   and closed_at < (($2::date + interval '1 day')::timestamp at time zone '${TIME_ZONE}')`,
		[startDate, endDate],
	);
	const row = result.rows[0] || {};
	return {
		startDate,
		endDate,
		total: Number(row.total || 0),
		devolvidos: Number(row.devolvidos || 0),
		pendentes: Number(row.pendentes || 0),
		desconhecidos: Number(row.desconhecidos || 0),
		taxaDevolucao:
			Number(row.total || 0) > 0
				? Number(row.devolvidos || 0) / Number(row.total || 0)
				: 0,
		valorTotal: Number(row.valor_total || 0),
		valorDevolvido: Number(row.valor_devolvido || 0),
		valorPendente: Number(row.valor_pendente || 0),
	};
}

async function listTechnicians(query = {}) {
	const { startDate, endDate } = defaultDateRange(query);
	const result = await db.query(
		`select
			coalesce(technician_id, technician_name_normalized, 'SEM_TECNICO') as technician_key,
			coalesce(technician_name, 'Sem tecnico identificado') as technician_name,
			count(*)::int as retirados,
			count(*) filter (where return_status = 'MATCHED')::int as devolvidos,
			count(*) filter (where return_status <> 'MATCHED')::int as pendentes,
			sum(coalesce(equipment_unit_value, 0))::numeric as valor_total,
			sum(coalesce(equipment_unit_value, 0)) filter (where return_status = 'MATCHED')::numeric as valor_devolvido,
			sum(coalesce(equipment_unit_value, 0)) filter (where return_status <> 'MATCHED')::numeric as valor_pendente,
			count(*) filter (where equipment_type = 'FAST')::int as fast,
			count(*) filter (where equipment_type = 'AC')::int as ac,
			count(*) filter (where equipment_type = 'AX')::int as ax,
			count(*) filter (where equipment_type = 'UNKNOWN')::int as unknown
		 from equipment_recovery_snapshots
		 where closed_at >= ($1::date::timestamp at time zone '${TIME_ZONE}')
		   and closed_at < (($2::date + interval '1 day')::timestamp at time zone '${TIME_ZONE}')
		 group by 1, 2
		 order by retirados desc, technician_name`,
		[startDate, endDate],
	);
	return result.rows.map((row) => ({
		technicianKey: row.technician_key,
		technicianName: row.technician_name,
		retirados: Number(row.retirados || 0),
		devolvidos: Number(row.devolvidos || 0),
		pendentes: Number(row.pendentes || 0),
		taxaDevolucao:
			Number(row.retirados || 0) > 0
				? Number(row.devolvidos || 0) / Number(row.retirados || 0)
				: 0,
		valorTotal: Number(row.valor_total || 0),
		valorDevolvido: Number(row.valor_devolvido || 0),
		valorPendente: Number(row.valor_pendente || 0),
		equipamentos: {
			FAST: Number(row.fast || 0),
			AC: Number(row.ac || 0),
			AX: Number(row.ax || 0),
			UNKNOWN: Number(row.unknown || 0),
		},
	}));
}

async function listPending(query = {}) {
	const { startDate, endDate } = defaultDateRange(query);
	const page = normalizePage(query.page);
	const limit = normalizeLimit(query.limit, 20);
	const offset = (page - 1) * limit;
	const conditions = [
		`closed_at >= ($1::date::timestamp at time zone '${TIME_ZONE}')`,
		`closed_at < (($2::date + interval '1 day')::timestamp at time zone '${TIME_ZONE}')`,
		"return_status <> 'MATCHED'",
	];
	const params = [startDate, endDate];
	if (query.technician_id) {
		params.push(String(query.technician_id));
		conditions.push(`technician_id = $${params.length}`);
	}
	const where = conditions.join(" and ");
	const totalResult = await db.query(
		`select count(*)::int as total from equipment_recovery_snapshots where ${where}`,
		params,
	);
	const rowsResult = await db.query(
		`select *
		 from equipment_recovery_snapshots
		 where ${where}
		 order by closed_at desc nulls last, technician_name, os_number
		 limit ${limit} offset ${offset}`,
		params,
	);
	const total = Number(totalResult.rows[0]?.total || 0);
	return {
		items: rowsResult.rows,
		page,
		limit,
		total,
		totalPages: Math.max(1, Math.ceil(total / limit)),
	};
}

function csvEscape(value) {
	const text = String(value ?? "");
	return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function exportCsv(query = {}) {
	const { items } = await listPending({ ...query, page: 1, limit: 500 });
	const header = [
		"OS",
		"Tecnico",
		"Cidade",
		"Tipo OS",
		"Servico",
		"Equipamento estimado",
		"Valor",
		"Status",
		"Confianca",
	].join(";");
	const rows = items.map((item) =>
		[
			item.os_number,
			item.technician_name,
			item.city_name,
			item.os_type,
			item.service_name,
			item.equipment_type,
			item.equipment_unit_value,
			item.return_status,
			item.match_confidence,
		]
			.map(csvEscape)
			.join(";"),
	);
	return [header, ...rows].join("\n");
}

module.exports = {
	classifyEquipmentByServiceSpeed,
	exportCsv,
	getImpact,
	getSummary,
	listPending,
	listTechnicians,
	reprocess,
	_private: {
		findMovementMatch,
		movementQuantity,
		movementTechnician,
		snapshotFromRecord,
	},
};
