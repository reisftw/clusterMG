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
const ensureSnapshotJobs = new Map();

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

function normalizeEquipment(value) {
	const text = cleanText(value).toUpperCase();
	return ["FAST", "AC", "AX", "UNKNOWN"].includes(text) ? text : "";
}

function normalizeRecoveryStatus(value) {
	const text = cleanText(value).toUpperCase();
	const aliases = {
		DEVOLVIDO: "MATCHED",
		PENDENTE: "PENDING",
		PROVAVEL: "PROBABLE",
		"DEVOLUCAO PROVAVEL": "PROBABLE",
		"DEVOLUÇÃO PROVÁVEL": "PROBABLE",
		"NAO CLASSIFICADO": "UNCLASSIFIED",
		"NÃO CLASSIFICADO": "UNCLASSIFIED",
		"NAO LOCALIZADO": "NOT_FOUND",
		"NÃO LOCALIZADO": "NOT_FOUND",
	};
	return aliases[text] || text;
}

function asArray(value) {
	if (Array.isArray(value)) return value;
	if (value === undefined || value === null || value === "") return [];
	return String(value)
		.split(",")
		.map((item) => cleanText(item))
		.filter(Boolean);
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

function readPath(source, path) {
	return path.split(".").reduce((current, key) => {
		if (current === undefined || current === null) return undefined;
		return current[key];
	}, source);
}

function collectServiceCandidates(raw = {}) {
	const candidates = [
		raw.servico,
		raw.numero_plano,
		raw.plano,
		raw.nome_plano,
		raw.velocidade,
		raw.velocidade_download,
		raw.download,
		raw.download_speed,
		raw?.cliente_servico?.display,
		raw?.cliente_servico?.descricao,
		raw?.cliente_servico?.numero_plano,
		raw?.cliente_servico?.plano?.descricao,
		raw?.cliente_servico?.servico?.descricao,
		raw?.servico?.descricao,
		raw?.plano?.descricao,
		readPath(raw, "raw.servico"),
		readPath(raw, "raw.numero_plano"),
		readPath(raw, "raw.cliente_servico.display"),
		readPath(raw, "raw.cliente_servico.descricao"),
		readPath(raw, "raw.cliente_servico.plano.descricao"),
	];
	return [...new Set(candidates.map(cleanText).filter(Boolean))];
}

function classifySnapshotService(raw = {}) {
	const candidates = collectServiceCandidates(raw);
	for (const candidate of candidates) {
		const classification = classifyEquipmentByServiceSpeed(candidate);
		if (classification.equipmentType !== "UNKNOWN") {
			return { ...classification, serviceName: candidate, candidates };
		}
	}
	const fallback = candidates[0] || "";
	return {
		...classifyEquipmentByServiceSpeed(fallback),
		serviceName: fallback,
		candidates,
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

function mapJob(row = {}) {
	if (!row) return null;
	return {
		id: row.id,
		status: row.status,
		mode: row.mode,
		dateStart: row.date_start,
		dateEnd: row.date_end,
		startedAt: row.started_at,
		finishedAt: row.finished_at,
		createdBy: row.created_by,
		errorMessage: row.error_message,
		summary: row.summary || {},
	};
}

async function updateJob(jobId, patch = {}) {
	const fields = [];
	const params = [jobId];
	function set(column, value) {
		params.push(value);
		fields.push(`${column} = $${params.length}`);
	}
	if (patch.status !== undefined) set("status", patch.status);
	if (patch.finishedAt !== undefined) set("finished_at", patch.finishedAt);
	if (patch.errorMessage !== undefined) set("error_message", patch.errorMessage);
	if (patch.summary !== undefined) {
		params.push(JSON.stringify(patch.summary || {}));
		fields.push(`summary = coalesce(summary, '{}'::jsonb) || $${params.length}::jsonb`);
	}
	if (!fields.length) return getJob(jobId);
	await db.query(
		`update equipment_recovery_jobs set ${fields.join(", ")} where id = $1`,
		params,
	);
	return getJob(jobId);
}

async function getJob(jobId) {
	const result = await db.query(
		`select * from equipment_recovery_jobs where id = $1`,
		[jobId],
	);
	return mapJob(result.rows[0]);
}

async function getLatestJob() {
	const result = await db.query(
		`select *
		 from equipment_recovery_jobs
		 order by started_at desc
		 limit 1`,
	);
	return mapJob(result.rows[0]);
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
	const classification = classifySnapshotService(raw);
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
		serviceName: classification.serviceName || raw.servico || raw.numero_plano || "",
		serviceSpeedMbps: classification.speedMbps,
		equipmentType: classification.equipmentType,
		equipmentUnitValue: valueConfig.value ?? null,
		equipmentValueSource: valueConfig.source || null,
		equipmentValueProductName: valueConfig.productName || null,
		closedAt: record.source_date,
		rawSnapshot: {
			classificationReason: classification.reason,
			serviceCandidates: classification.candidates,
			rawService: raw.servico || "",
			rawPlanNumber: raw.numero_plano || "",
			parsedSpeedMbps: classification.speedMbps,
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

async function ensureSnapshotsForRange(query = {}) {
	const { startDate, endDate } = defaultDateRange(query);
	const key = `${startDate}:${endDate}`;
	if (ensureSnapshotJobs.has(key)) return ensureSnapshotJobs.get(key);
	const promise = (async () => {
		const source = await getSourceRecords({ start_date: startDate, end_date: endDate });
		if (!source.records.length) return { skipped: true, total: 0 };
		const sourceIds = [...new Set(source.records.map((record) => String(record.hubsoft_id)).filter(Boolean))];
		const existing = await db.query(
			`select count(*)::int as total
			   from equipment_recovery_snapshots
			  where closed_at >= ($1::date::timestamp at time zone '${TIME_ZONE}')
			    and closed_at < (($2::date + interval '1 day')::timestamp at time zone '${TIME_ZONE}')
			    and os_id = any($3::text[])`,
			[startDate, endDate, sourceIds],
		);
		if (Number(existing.rows[0]?.total || 0) >= sourceIds.length) {
			return { skipped: true, total: sourceIds.length };
		}
		const valuesByCategory = await getEquipmentValues();
		if (!source.records.length) return { skipped: true, total: 0 };
		const saved = [];
		for (const record of source.records) {
			saved.push(await upsertSnapshot(snapshotFromRecord(record, valuesByCategory)));
		}
		const matchSummary = await applyMovementMatches(saved, {
			start_date: startDate,
			end_date: endDate,
		});
		return { total: saved.length, ...matchSummary };
	})().finally(() => {
		ensureSnapshotJobs.delete(key);
	});
	ensureSnapshotJobs.set(key, promise);
	return promise;
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
		technician: movementTechnician(row),
		quantity: movementQuantity(row),
		remaining() {
			return Math.max(0, this.quantity - (used.get(row.id) || 0));
		},
		consume() {
			used.set(row.id, (used.get(row.id) || 0) + 1);
		},
	}));
}

function addIndexedMovement(index, key, item) {
	if (!key) return;
	if (!index.has(key)) index.set(key, []);
	index.get(key).push(item);
}

function buildMovementIndex(movements = []) {
	const byCategory = new Map();
	const byCategoryAndTechnicianId = new Map();
	const byCategoryAndTechnicianName = new Map();
	for (const item of movements) {
		const category = item.row.equipment_type;
		const technician = item.technician || movementTechnician(item.row);
		addIndexedMovement(byCategory, category, item);
		addIndexedMovement(
			byCategoryAndTechnicianId,
			`${category}|${technician.id}`,
			item,
		);
		addIndexedMovement(
			byCategoryAndTechnicianName,
			`${category}|${technician.normalizedName}`,
			item,
		);
	}
	return { byCategory, byCategoryAndTechnicianId, byCategoryAndTechnicianName };
}

function daysBetween(left, right) {
	const a = new Date(left);
	const b = new Date(right);
	if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return Infinity;
	return Math.abs(a - b) / 86_400_000;
}

function findAvailableInsideWindow(snapshot, candidates = []) {
	return candidates.find(
		(item) =>
			item.remaining() > 0 &&
			daysBetween(snapshot.closed_at, item.row.emitido_em) <= MATCH_WINDOW_DAYS,
	);
}

function findMovementMatch(snapshot, movementsOrIndex) {
	if (!featureEnabled("ENABLE_STOCK_MATCH", true)) return null;
	if (!snapshot || snapshot.equipment_type === "UNKNOWN") return null;
	const technicianName = normalizeText(snapshot.technician_name);
	const technicianId = cleanText(snapshot.technician_id);
	const index = Array.isArray(movementsOrIndex)
		? buildMovementIndex(movementsOrIndex)
		: movementsOrIndex;
	const byId = technicianId
		? findAvailableInsideWindow(
				snapshot,
				index.byCategoryAndTechnicianId.get(
					`${snapshot.equipment_type}|${technicianId}`,
				) || [],
			)
		: null;
	if (byId) return { item: byId, confidence: "CONFIRMED", type: "TECHNICIAN_ID" };
	const byName = technicianName
		? findAvailableInsideWindow(
				snapshot,
				index.byCategoryAndTechnicianName.get(
					`${snapshot.equipment_type}|${technicianName}`,
				) || [],
			)
		: null;
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
	const movementIndex = buildMovementIndex(movements);
	let matched = 0;
	let probable = 0;
	for (const snapshot of snapshots) {
		const match = findMovementMatch(snapshot, movementIndex);
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

async function runReprocess(jobId, query = {}) {
	const mode = query.apply === false || query.mode === "SIMULATE" ? "SIMULATE" : "APPLY";
	try {
		await updateJob(jobId, {
			summary: { stage: "Carregando registros HubSoft", percent: 8 },
		});
		const valuesByCategory = await getEquipmentValues();
		const source = await getSourceRecords(query);
		const snapshots = source.records.map((record) =>
			snapshotFromRecord(record, valuesByCategory),
		);
		const summary = summarizeSnapshots(snapshots);
		if (mode === "APPLY") {
			const saved = [];
			for (const [index, snapshot] of snapshots.entries()) {
				saved.push(await upsertSnapshot(snapshot));
				if (index % 100 === 0) {
					await updateJob(jobId, {
						summary: {
							stage: "Gravando snapshots",
							percent: Math.min(
								70,
								15 + Math.round(((index + 1) / Math.max(1, snapshots.length)) * 55),
							),
							processed: index + 1,
							total: snapshots.length,
						},
					});
				}
			}
			await updateJob(jobId, {
				summary: {
					stage: "Conciliando movimentações de estoque",
					percent: 78,
					processed: saved.length,
					total: snapshots.length,
				},
			});
			const matchSummary = await applyMovementMatches(saved, query);
			Object.assign(summary, matchSummary, { persisted: saved.length });
		}
		await db.query(
			`update equipment_recovery_jobs
				set status = 'COMPLETE',
				    finished_at = now(),
				    summary = coalesce(summary, '{}'::jsonb) || $2::jsonb
			 where id = $1`,
			[jobId, JSON.stringify({ ...summary, stage: "Concluído", percent: 100 })],
		);
		return { jobId, mode, ...source, summary };
	} catch (error) {
		await db.query(
			`update equipment_recovery_jobs
				set status = 'FAILED', finished_at = now(), error_message = $2
			 where id = $1`,
			[jobId, error?.message || "Falha ao reprocessar recuperação."],
		);
		throw error;
	}
}

async function reprocess(query = {}, user = {}) {
	const mode = query.apply === false || query.mode === "SIMULATE" ? "SIMULATE" : "APPLY";
	const { startDate, endDate } = defaultDateRange(query);
	const jobResult = await db.query(
		`insert into equipment_recovery_jobs
			(status, mode, date_start, date_end, created_by, summary)
		 values ('RUNNING', $1, $2, $3, $4, $5::jsonb)
		 returning *`,
		[
			mode,
			startDate,
			endDate,
			user?.uid || user?.email || null,
			JSON.stringify({
				stage: "Na fila",
				percent: 1,
				startDate,
				endDate,
			}),
		],
	);
	const job = jobResult.rows[0];
	setImmediate(() => {
		runReprocess(job.id, query).catch((error) => {
			console.error("[equipmentRecovery] Falha no job de reprocessamento:", error);
		});
	});
	return mapJob(job);
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

function snapshotFilters(query = {}, params = []) {
	const { startDate, endDate } = defaultDateRange(query);
	const conditions = [
		`closed_at >= ($${params.push(startDate)}::date::timestamp at time zone '${TIME_ZONE}')`,
		`closed_at < (($${params.push(endDate)}::date + interval '1 day')::timestamp at time zone '${TIME_ZONE}')`,
	];
	const equipment = normalizeEquipment(query.equipment || query.equipment_type || query.equipmentType);
	if (equipment) {
		conditions.push(`equipment_type = $${params.push(equipment)}`);
	}
	const status = normalizeRecoveryStatus(query.status || query.return_status || query.returnStatus);
	if (status && status !== "TODOS" && status !== "ALL") {
		if (status === "PROBABLE") {
			conditions.push("match_confidence = 'PROBABLE'");
		} else if (status === "NOT_FOUND") {
			conditions.push("match_confidence = 'NOT_FOUND' and equipment_type <> 'UNKNOWN'");
		} else if (status === "UNCLASSIFIED") {
			conditions.push("equipment_type = 'UNKNOWN'");
		} else {
			conditions.push(`return_status = $${params.push(status)}`);
		}
	}
	const technician = cleanText(query.technician || query.technician_id || query.technicianId);
	if (technician) {
		conditions.push(
			`(technician_id = $${params.push(technician)} or technician_name_normalized = $${params.push(normalizeText(technician))} or technician_name ilike $${params.push(`%${technician}%`)})`,
		);
	}
	const city = cleanText(query.city);
	if (city) {
		conditions.push(`city_name ilike $${params.push(`%${city}%`)}`);
	}
	const osTypes = asArray(query.os_type || query.osType || query.os_type_id || query.osTypeId);
	if (osTypes.length) {
		const numeric = osTypes.map(Number).filter(Number.isFinite);
		if (numeric.length) {
			conditions.push(`os_type_id = any($${params.push(numeric)}::int[])`);
		} else {
			conditions.push(`os_type = any($${params.push(osTypes)}::text[])`);
		}
	}
	const channel = cleanText(query.channel || query.production_channel || query.regional);
	if (channel) {
		conditions.push(`production_channel = $${params.push(channel)}`);
	}
	return { where: conditions.join(" and "), params, startDate, endDate };
}

function mapSnapshot(row = {}) {
	const raw = row.raw_snapshot || {};
	return {
		id: row.id,
		osId: row.os_id,
		osNumber: row.os_number,
		osTypeId: row.os_type_id,
		osType: row.os_type,
		productionChannel: row.production_channel,
		technicianId: row.technician_id,
		technicianName: row.technician_name,
		cityName: row.city_name,
		serviceName: row.service_name,
		serviceSpeedMbps: Number(row.service_speed_mbps || 0) || null,
		equipmentType: row.equipment_type,
		equipmentUnitValue: Number(row.equipment_unit_value || 0),
		closedAt: row.closed_at,
		returnStatus: row.return_status,
		matchConfidence: row.match_confidence,
		matchType: row.match_type,
		movementId: row.movement_id,
		movementAt: row.movement_at,
		classificationReason: raw.classificationReason || "",
		serviceCandidates: raw.serviceCandidates || [],
		rawService: raw.rawService || "",
		rawPlanNumber: raw.rawPlanNumber || "",
		parsedSpeedMbps: raw.parsedSpeedMbps || null,
	};
}

function mapEquipmentRows(rows = []) {
	const expected = new Map(
		["FAST", "AC", "AX", "UNKNOWN"].map((category) => [
			category,
			{
				category,
				total: 0,
				returned: 0,
				pending: 0,
				probable: 0,
				notFound: 0,
				value: 0,
				returnedValue: 0,
				pendingValue: 0,
			},
		]),
	);
	for (const row of rows) {
		const category = row.equipment_type || "UNKNOWN";
		const current = expected.get(category) || {
			category,
			total: 0,
			returned: 0,
			pending: 0,
			probable: 0,
			notFound: 0,
			value: 0,
			returnedValue: 0,
			pendingValue: 0,
		};
		current.total = Number(row.total || 0);
		current.returned = Number(row.devolvidos || 0);
		current.pending = Number(row.pendentes || 0);
		current.probable = Number(row.provaveis || 0);
		current.notFound = Number(row.nao_localizados || 0);
		current.value = Number(row.valor_total || 0);
		current.returnedValue = Number(row.valor_devolvido || 0);
		current.pendingValue = Number(row.valor_pendente || 0);
		expected.set(category, current);
	}
	return [...expected.values()];
}

async function getSummary(query = {}) {
	await ensureSnapshotsForRange(query);
	const params = [];
	const base = snapshotFilters(query, params);
	const result = await db.query(
		`select
			count(*)::int as total,
			count(*) filter (where equipment_type <> 'UNKNOWN')::int as classificados,
			count(*) filter (where return_status = 'MATCHED')::int as devolvidos,
			count(*) filter (where return_status <> 'MATCHED' and equipment_type <> 'UNKNOWN')::int as pendentes,
			count(*) filter (where equipment_type = 'UNKNOWN')::int as desconhecidos,
			count(*) filter (where match_confidence = 'PROBABLE')::int as provaveis,
			count(*) filter (where match_confidence = 'NOT_FOUND' and equipment_type <> 'UNKNOWN')::int as nao_localizados,
			count(*) filter (where return_status <> 'MATCHED' and equipment_type <> 'UNKNOWN' and closed_at < now() - interval '5 days')::int as vencidas,
			sum(coalesce(equipment_unit_value, 0))::numeric as valor_total,
			sum(coalesce(equipment_unit_value, 0)) filter (where return_status = 'MATCHED')::numeric as valor_devolvido,
			sum(coalesce(equipment_unit_value, 0)) filter (where return_status <> 'MATCHED' and equipment_type <> 'UNKNOWN')::numeric as valor_pendente,
			sum(coalesce(equipment_unit_value, 0)) filter (where equipment_type <> 'UNKNOWN')::numeric as valor_classificado,
			sum(coalesce(equipment_unit_value, 0)) filter (where equipment_type = 'UNKNOWN')::numeric as valor_nao_classificado
		 from equipment_recovery_snapshots
		 where ${base.where}`,
		base.params,
	);
	const equipmentResult = await db.query(
		`select
			equipment_type,
			count(*)::int as total,
			count(*) filter (where return_status = 'MATCHED')::int as devolvidos,
			count(*) filter (where return_status <> 'MATCHED')::int as pendentes,
			count(*) filter (where match_confidence = 'PROBABLE')::int as provaveis,
			count(*) filter (where match_confidence = 'NOT_FOUND')::int as nao_localizados,
			sum(coalesce(equipment_unit_value, 0))::numeric as valor_total,
			sum(coalesce(equipment_unit_value, 0)) filter (where return_status = 'MATCHED')::numeric as valor_devolvido,
			sum(coalesce(equipment_unit_value, 0)) filter (where return_status <> 'MATCHED')::numeric as valor_pendente
		 from equipment_recovery_snapshots
		 where ${base.where}
		 group by equipment_type
		 order by equipment_type`,
		base.params,
	);
	const reasonsResult = await db.query(
		`select coalesce(raw_snapshot->>'classificationReason', 'UNKNOWN') as reason,
		        count(*)::int as total
		   from equipment_recovery_snapshots
		  where ${base.where}
		    and equipment_type = 'UNKNOWN'
		  group by 1
		  order by total desc
		  limit 5`,
		base.params,
	);
	const statusResult = await db.query(
		`select
			count(*) filter (where return_status = 'MATCHED')::int as matched,
			count(*) filter (where return_status <> 'MATCHED' and equipment_type <> 'UNKNOWN')::int as pending,
			count(*) filter (where match_confidence = 'PROBABLE')::int as probable,
			count(*) filter (where equipment_type = 'UNKNOWN')::int as unclassified,
			count(*) filter (where match_confidence = 'NOT_FOUND' and equipment_type <> 'UNKNOWN')::int as not_found
		   from equipment_recovery_snapshots
		  where ${base.where}`,
		base.params,
	);
	const deadlineResult = await db.query(
		`select
			count(*) filter (where return_status = 'MATCHED')::int as matched,
			count(*) filter (where return_status <> 'MATCHED' and equipment_type <> 'UNKNOWN' and now() - closed_at <= interval '1 day')::int as within_deadline,
			count(*) filter (where return_status <> 'MATCHED' and equipment_type <> 'UNKNOWN' and now() - closed_at > interval '1 day' and now() - closed_at <= interval '3 days')::int as d1_d3,
			count(*) filter (where return_status <> 'MATCHED' and equipment_type <> 'UNKNOWN' and now() - closed_at > interval '3 days' and now() - closed_at <= interval '5 days')::int as d4_d5,
			count(*) filter (where return_status <> 'MATCHED' and equipment_type <> 'UNKNOWN' and now() - closed_at > interval '5 days')::int as overdue
		   from equipment_recovery_snapshots
		  where ${base.where}`,
		base.params,
	);
	const row = result.rows[0] || {};
	const classified = Number(row.classificados || 0);
	const total = Number(row.total || 0);
	return {
		startDate: base.startDate,
		endDate: base.endDate,
		total,
		classificados: classified,
		devolvidos: Number(row.devolvidos || 0),
		pendentes: Number(row.pendentes || 0),
		desconhecidos: Number(row.desconhecidos || 0),
		provaveis: Number(row.provaveis || 0),
		naoLocalizados: Number(row.nao_localizados || 0),
		vencidas: Number(row.vencidas || 0),
		taxaDevolucao:
			total > 0
				? Number(row.devolvidos || 0) / total
				: 0,
		taxaClassificacao: total > 0 ? classified / total : 0,
		valorTotal: Number(row.valor_total || 0),
		valorClassificado: Number(row.valor_classificado || 0),
		valorDevolvido: Number(row.valor_devolvido || 0),
		valorPendente: Number(row.valor_pendente || 0),
		valorNaoClassificado: Number(row.valor_nao_classificado || 0),
		equipamentos: mapEquipmentRows(equipmentResult.rows),
		motivosNaoClassificacao: reasonsResult.rows.map((item) => ({
			reason: item.reason,
			total: Number(item.total || 0),
		})),
		status: {
			matched: Number(statusResult.rows[0]?.matched || 0),
			pending: Number(statusResult.rows[0]?.pending || 0),
			probable: Number(statusResult.rows[0]?.probable || 0),
			unclassified: Number(statusResult.rows[0]?.unclassified || 0),
			notFound: Number(statusResult.rows[0]?.not_found || 0),
		},
		prazos: {
			matched: Number(deadlineResult.rows[0]?.matched || 0),
			withinDeadline: Number(deadlineResult.rows[0]?.within_deadline || 0),
			d1d3: Number(deadlineResult.rows[0]?.d1_d3 || 0),
			d4d5: Number(deadlineResult.rows[0]?.d4_d5 || 0),
			overdue: Number(deadlineResult.rows[0]?.overdue || 0),
		},
	};
}

async function listTechnicians(query = {}) {
	await ensureSnapshotsForRange(query);
	const params = [];
	const base = snapshotFilters(query, params);
	const sort = cleanText(query.sort || "pending");
	const orderBy = {
		os: "retirados desc",
		pending: "pendentes desc, retirados desc",
		value: "valor_pendente desc nulls last",
		returnRate: "taxa_devolucao desc nulls last, retirados desc",
	}[sort] || "pendentes desc, retirados desc";
	const result = await db.query(
		`with grouped as (
		select
			coalesce(technician_id, technician_name_normalized, 'SEM_TECNICO') as technician_key,
			coalesce(technician_name, 'Sem tecnico identificado') as technician_name,
			count(*)::int as retirados,
			count(*) filter (where equipment_type <> 'UNKNOWN')::int as classificados,
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
		 where ${base.where}
		 group by 1, 2
		)
		select *, case when retirados > 0 then devolvidos::numeric / retirados else 0 end as taxa_devolucao
		  from grouped
		 order by ${orderBy}, technician_name`,
		base.params,
	);
	return result.rows.map((row) => ({
		technicianKey: row.technician_key,
		technicianName: row.technician_name,
		retirados: Number(row.retirados || 0),
		classificados: Number(row.classificados || 0),
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
	await ensureSnapshotsForRange(query);
	const page = normalizePage(query.page);
	const limit = normalizeLimit(query.limit, 20);
	const offset = (page - 1) * limit;
	const params = [];
	const base = snapshotFilters(query, params);
	const where = `${base.where} and return_status <> 'MATCHED'`;
	const totalResult = await db.query(
		`select count(*)::int as total from equipment_recovery_snapshots where ${where}`,
		base.params,
	);
	const rowsResult = await db.query(
		`select *
		 from equipment_recovery_snapshots
		 where ${where}
		 order by closed_at desc nulls last, technician_name, os_number
		 limit ${limit} offset ${offset}`,
		base.params,
	);
	const total = Number(totalResult.rows[0]?.total || 0);
	return {
		items: rowsResult.rows.map(mapSnapshot),
		page,
		limit,
		total,
		totalPages: Math.max(1, Math.ceil(total / limit)),
	};
}

async function listRecords(query = {}) {
	await ensureSnapshotsForRange(query);
	const page = normalizePage(query.page);
	const limit = normalizeLimit(query.limit, 20);
	const offset = (page - 1) * limit;
	const params = [];
	const base = snapshotFilters(query, params);
	const totalResult = await db.query(
		`select count(*)::int as total from equipment_recovery_snapshots where ${base.where}`,
		base.params,
	);
	const rowsResult = await db.query(
		`select *
		   from equipment_recovery_snapshots
		  where ${base.where}
		  order by closed_at desc nulls last, technician_name, os_number
		  limit ${limit} offset ${offset}`,
		base.params,
	);
	const total = Number(totalResult.rows[0]?.total || 0);
	return {
		items: rowsResult.rows.map(mapSnapshot),
		page,
		limit,
		total,
		totalPages: Math.max(1, Math.ceil(total / limit)),
	};
}

async function getOptions(query = {}) {
	await ensureSnapshotsForRange(query);
	const params = [];
	const base = snapshotFilters(
		{ start_date: query.start_date, end_date: query.end_date },
		params,
	);
	const result = await db.query(
		`select
			array_remove(array_agg(distinct jsonb_build_object('id', technician_id, 'name', technician_name)), null) as technicians,
			array_remove(array_agg(distinct jsonb_build_object('id', os_type_id, 'name', os_type)), null) as os_types,
			array_remove(array_agg(distinct production_channel), null) as channels,
			array_remove(array_agg(distinct city_name), null) as cities
		   from equipment_recovery_snapshots
		  where ${base.where}`,
		base.params,
	);
	const row = result.rows[0] || {};
	return {
		technicians: (row.technicians || [])
			.filter((item) => item?.name)
			.sort((a, b) => String(a.name).localeCompare(String(b.name))),
		osTypes: (row.os_types || [])
			.filter((item) => item?.name || item?.id)
			.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id))),
		channels: (row.channels || []).filter(Boolean).sort(),
		cities: (row.cities || []).filter(Boolean).sort(),
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
	getOptions,
	getSummary,
	listPending,
	listRecords,
	listTechnicians,
	getJob,
	getLatestJob,
	reprocess,
	_private: {
		buildMovementIndex,
		findMovementMatch,
		movementQuantity,
		movementTechnician,
		snapshotFromRecord,
	},
};
