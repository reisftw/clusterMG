const crypto = require("node:crypto");
const db = require("../db");
const auditLog = require("../auditLog");

const VIEW_PERMISSIONS = ["tentativas.visualizar"];
const EXECUTE_PERMISSIONS = ["tentativas.executar"];
const HISTORY_PERMISSIONS = ["tentativas.historico.visualizar"];
const DISTRIBUTE_PERMISSIONS = ["tentativas.distribuir"];
const CAMPAIGN_PERMISSIONS = ["tentativas.campanhas.gerenciar"];
const TEMPLATE_PERMISSIONS = ["tentativas.templates.gerenciar"];
const SETTINGS_PERMISSIONS = ["tentativas.configuracoes.gerenciar"];
const EXPORT_PERMISSIONS = ["tentativas.relatorio.exportar"];
const OVERRIDE_PERMISSIONS = ["tentativas.override"];
const WITHDRAWAL_ORDER_TYPE_REGEX =
	"(RETIRADA\\s+FTTH|RETIRADA\\s*&\\s*CANCELAMENTO\\s*-\\s*SEGUNDA\\s+TENTATIVA|CANCELAMENTO\\s+FTTH|CANCELAMENTO\\s+LOJA)";
const VALID_PHONE_DIGITS_REGEX = "^55[0-9]{10,11}$";
const OPPORTUNITIES_SYNC_TTL_MS = 60 * 60 * 1000;
const OPPORTUNITIES_RECONCILIATION_INTERVAL_MS = 60 * 60 * 1000;
const OPPORTUNITIES_RECONCILIATION_INITIAL_DELAY_MS = 60 * 1000;
const PHONE_ENRICH_WAIT_MS = 5 * 1000;

let opportunitiesSyncPromise = null;
let opportunitiesLastSyncAt = 0;
let opportunitiesReconciliationTimer = null;
let opportunitiesReconciliationInitialTimer = null;
const phoneEnrichmentPromises = new Map();

const CONTACT_RESULTS = new Set([
	"NO_RESPONSE",
	"RESPONDED",
	"SCHEDULED",
	"REFUSED",
	"INVALID_PHONE",
	"ALREADY_RETURNED",
	"EQUIPMENT_UNAVAILABLE",
	"CALLBACK_REQUESTED",
	"COMPLETED",
	"CANCELLED",
	"OTHER",
]);

const RESULT_TO_STATUS = {
	NO_RESPONSE: "NO_RESPONSE",
	RESPONDED: "RESPONDED",
	SCHEDULED: "SCHEDULED",
	REFUSED: "REFUSED",
	INVALID_PHONE: "INVALID_PHONE",
	ALREADY_RETURNED: "ALREADY_RETURNED",
	EQUIPMENT_UNAVAILABLE: "EQUIPMENT_UNAVAILABLE",
	CALLBACK_REQUESTED: "CALLBACK_REQUESTED",
	COMPLETED: "COMPLETED",
	CANCELLED: "CANCELLED",
	OTHER: "CONTACTED",
};

function id(prefix) {
	return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function text(value) {
	return String(value ?? "").trim();
}

function normalizeText(value) {
	return text(value)
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

function userId(user = {}) {
	return text(user.uid || user.id || user.profile?.uid || user.email);
}

function userName(user = {}) {
	return text(user.nome || user.name || user.displayName || user.profile?.nome || user.email);
}

function userEmail(user = {}) {
	return text(user.email || user.profile?.email).toLowerCase();
}

function normalizePhone(value) {
	let digits = text(value).replace(/\D/g, "");
	if (!digits) return { digits: "", display: "" };
	if (digits.startsWith("00")) digits = digits.slice(2);
	if (!digits.startsWith("55") && digits.length >= 10 && digits.length <= 11) {
		digits = `55${digits}`;
	}
	return {
		digits,
		display: digits,
		valid: /^55\d{10,11}$/.test(digits),
	};
}

function firstValidPhone(values = []) {
	for (const value of values) {
		const phone = normalizePhone(value);
		if (phone.valid) return phone;
	}
	return normalizePhone("");
}

function firstName(name) {
	return text(name).split(/\s+/).filter(Boolean)[0] || text(name);
}

function formatCustomerIdentification(code, name) {
	const customerCode = text(code);
	const customerName = text(name) || "Cliente sem nome";
	return customerCode ? `(${customerCode}) ${customerName}` : customerName;
}

function buildWhatsappUrls(phoneDigits, message) {
	const digits = text(phoneDigits);
	const encodedMessage = encodeURIComponent(text(message));
	const whatsappUrl = `https://wa.me/${digits}?text=${encodedMessage}`;
	const fallbackUrl = encodeURIComponent(whatsappUrl);
	const intentQuery = `phone=${encodeURIComponent(digits)}&text=${encodedMessage}`;
	return {
		whatsappUrl,
		whatsappNormalUrl: `intent://send?${intentQuery}#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=${fallbackUrl};end`,
		whatsappBusinessUrl: `intent://send?${intentQuery}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;S.browser_fallback_url=${fallbackUrl};end`,
	};
}

function normalizeLimit(value, fallback = 20, max = 100) {
	const parsed = Number(value || fallback);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

function normalizePage(value) {
	const parsed = Number(value || 1);
	if (!Number.isFinite(parsed)) return 1;
	return Math.max(Math.trunc(parsed), 1);
}

function hasAdminAccess(user = {}) {
	const role = normalizeText(user.role || user.profile?.role);
	const permissions = new Set(user.permissions || user.profile?.permissions || []);
	return role === "admin" || permissions.has("*") || permissions.has("tentativas.distribuir");
}

function hasGlobalHistoryAccess(user = {}) {
	const role = normalizeText(user.role || user.profile?.role);
	const permissions = new Set(user.permissions || user.profile?.permissions || []);
	return role === "admin" || permissions.has("*");
}

function renderTemplate(body, variables = {}) {
	return text(body).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
		const normalized = String(key || "").trim();
		return text(variables[normalized]);
	});
}

function priorityExpression() {
	return `case
		when coalesce(tentativas_opportunities.attempt_count, 0) = 0 and coalesce(excluded.os_age_days, 0) >= 30 then 'ALTA'
		when coalesce(tentativas_opportunities.attempt_count, 0) = 0 then 'MEDIA'
		when coalesce(tentativas_opportunities.last_result, '') in ('RESPONDED', 'CALLBACK_REQUESTED') then 'ALTA'
		else 'BAIXA'
	end`;
}

async function recordAudit(action, recordId, user, afterData = {}, beforeData = {}) {
	await auditLog.recordAuditLog({
		module: "tentativas",
		entity: "tentativas",
		action,
		recordId,
		beforeData,
		afterData,
		user,
	});
}

async function performOpportunitiesSyncFromMatch() {
	const client = await db.connect();
	let releasedAssignments = [];
	let completedAutomatically = 0;
	try {
		await client.query("begin");
		const inventoryResult = await client.query(
			`select
				(select count(*)::int from tentativas_opportunities where active = true) as active_total,
				(select count(*)::int
				   from ordens_servico
				  where source_collection = 'match_os_abertas'
				    and coalesce(num_os, '') <> ''
				    and coalesce(cidade, '') <> ''
				    and coalesce(tipo, '') ~* $1
				    and coalesce(tipo, '') !~* '(CANCELAMENTO\\s*-\\s*OUTROS|RETIRADA\\s*-\\s*OUTROS)') as source_total`,
			[WITHDRAWAL_ORDER_TYPE_REGEX],
		);
		const activeTotal = Number(inventoryResult.rows[0]?.active_total || 0);
		const sourceTotal = Number(inventoryResult.rows[0]?.source_total || 0);
		if (activeTotal > 0 && sourceTotal === 0) {
			const error = new Error("Reconciliacao cancelada: o mapa de origem esta vazio.");
			error.code = "EMPTY_MATCH_SOURCE";
			throw error;
		}
		await client.query(
			`update tentativas_opportunities
			    set active = false,
			        removed_from_match_at = coalesce(removed_from_match_at, now()),
			        updated_at = now()
			  where active = true`,
		);
		await client.query(
		`with phone_sources_raw as materialized (
			select o.num_os as os,
			       o.codigo_cliente,
			       phone.value as telefone,
			       o.updated_at as source_at,
			       case o.source_collection
			         when 'ordens_abertas' then 0
			         when 'match_os_abertas' then 1
			         else 2
			       end as source_rank,
			       phone.ordinality as phone_rank
			  from ordens_servico o
			 cross join lateral unnest(array[
			   o.telefone,
			   o.telefones[1],
			   o.source_payload->>'telefone',
			   o.source_payload->>'telefone_primario',
			   o.source_payload->>'telefone_principal',
			   o.source_payload->>'celular',
			   o.source_payload->>'whatsapp',
			   o.source_payload->>'fone',
			   o.source_payload#>>'{cliente,telefone_primario}',
			   o.source_payload#>>'{cliente,telefone}',
			   o.source_payload#>>'{cliente,celular}',
			   o.source_payload#>>'{servico,telefone_primario}',
			   o.source_payload#>>'{servico,telefone}'
			 ]) with ordinality as phone(value, ordinality)
			union all
			select mf.os, mf.codigo_cliente, mf.telefone, mf.created_at, 3, 1
			  from mensageria_fila mf
			union all
			select mh.os, mh.codigo_cliente, mh.telefone, mh.created_at, 3, 1
			  from mensageria_historico mh
			union all
			select mc.os, mc.codigo_cliente, mc.telefone, mc.created_at, 3, 1
			  from mensageria_callbacks mc
			union all
			select mac.os, mac.codigo_cliente, mac.telefone, mac.created_at, 3, 1
			  from mensageria_agendamento_conversas mac
			union all
			select a.os, a.codigo_cliente, phone.value, a.created_at, 4, phone.ordinality
			  from agendamentos a
			 cross join lateral unnest(array[a.telefone, a.telefones->>0])
			   with ordinality as phone(value, ordinality)
		),
		phone_sources as materialized (
			select os,
			       codigo_cliente,
			       case
			         when raw_digits ~ '^0055[0-9]{10,11}$' then substring(raw_digits from 3)
			         when raw_digits ~ $2 then raw_digits
			         when raw_digits ~ '^[0-9]{10,11}$' then '55' || raw_digits
			         else null
			       end as telefone,
			       source_at,
			       source_rank,
			       phone_rank
			  from (
			    select phone_sources_raw.*,
			           regexp_replace(coalesce(telefone, ''), '\\D', '', 'g') as raw_digits
			      from phone_sources_raw
			  ) normalized_sources
		),
		phone_by_os as (
			select distinct on (os) os, telefone
			  from phone_sources
			 where coalesce(os, '') <> ''
			   and telefone is not null
			 order by os, source_rank, phone_rank, source_at desc nulls last
		),
		phone_by_client as (
			select distinct on (codigo_cliente) codigo_cliente, telefone
			  from phone_sources
			 where coalesce(codigo_cliente, '') <> ''
			   and telefone is not null
			 order by codigo_cliente, source_rank, phone_rank, source_at desc nulls last
		),
		eligible_orders as (
			select os.*,
			       coalesce(phone_by_os.telefone, phone_by_client.telefone) as normalized_phone_digits
			  from ordens_servico os
			  left join phone_by_os on phone_by_os.os = os.num_os
			  left join phone_by_client on phone_by_client.codigo_cliente = os.codigo_cliente
			 where os.source_collection = 'match_os_abertas'
			   and coalesce(os.num_os, '') <> ''
			   and coalesce(os.cidade, '') <> ''
			   and coalesce(os.tipo, '') ~* $1
			   and coalesce(os.tipo, '') !~* '(CANCELAMENTO\\s*-\\s*OUTROS|RETIRADA\\s*-\\s*OUTROS)'
		)
		insert into tentativas_opportunities (
			id, ordem_id, os, codigo_cliente, cliente, telefone, telefone_digits,
			cidade, cidade_normalizada, regional, empresa, tipo_os, origem,
			match_entered_at, os_opened_at, os_age_days, status, priority,
			active, source_payload, created_at, updated_at
		)
		select
			'tent_' || encode(digest(coalesce(os.num_os, os.id), 'sha256'), 'hex'),
			null::text,
			os.num_os,
			os.codigo_cliente,
			os.nome_cliente,
			os.normalized_phone_digits,
			os.normalized_phone_digits,
			os.cidade,
			lower(translate(coalesce(os.cidade, ''), 'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
			os.regional,
			coalesce(os.empresa, os.source, 'Sempre'),
			os.tipo,
			'match',
			coalesce(os.updated_at, now()),
			os.data_abertura,
			greatest(0, floor(extract(epoch from (now() - coalesce(os.data_abertura, now()))) / 86400)::int),
			'PENDING',
			case
				when os.data_abertura is not null and os.data_abertura < now() - interval '30 days' then 'ALTA'
				when os.data_abertura is not null and os.data_abertura < now() - interval '10 days' then 'MEDIA'
				else 'BAIXA'
			end,
			true,
			coalesce(os.source_payload, '{}'::jsonb),
			now(),
			now()
		from eligible_orders os
		where os.normalized_phone_digits is not null
		on conflict (os) do update set
			ordem_id = coalesce(tentativas_opportunities.ordem_id, excluded.ordem_id),
			codigo_cliente = excluded.codigo_cliente,
			cliente = excluded.cliente,
			telefone = excluded.telefone,
			telefone_digits = excluded.telefone_digits,
			cidade = excluded.cidade,
			cidade_normalizada = excluded.cidade_normalizada,
			regional = excluded.regional,
			empresa = excluded.empresa,
			tipo_os = excluded.tipo_os,
			match_entered_at = least(tentativas_opportunities.match_entered_at, excluded.match_entered_at),
			os_opened_at = excluded.os_opened_at,
			os_age_days = excluded.os_age_days,
			priority = ${priorityExpression()},
			active = true,
			removed_from_match_at = null,
			source_payload = excluded.source_payload,
			updated_at = now()`,
			[WITHDRAWAL_ORDER_TYPE_REGEX, VALID_PHONE_DIGITS_REGEX],
		);
		const completionResult = await client.query(
			`update tentativas_opportunities
			    set status = 'COMPLETED',
			        last_result = 'COMPLETED',
			        completed_at = coalesce(completed_at, now()),
			        removed_from_match_at = coalesce(removed_from_match_at, now()),
			        updated_at = now()
			  where active = false
			    and status not in ('COMPLETED', 'CANCELLED')`,
		);
		completedAutomatically = completionResult.rowCount;
		const releaseResult = await client.query(
			`update tentativas_assignments a
			    set released_at = now(),
			        release_reason = 'OPORTUNIDADE_CONCLUIDA_FORA_DO_MAPA',
			        updated_at = now()
			   from tentativas_opportunities o
			  where a.opportunity_id = o.id
			    and a.released_at is null
			    and (o.active = false or coalesce(o.telefone_digits, '') !~ $1)
			  returning a.technician_user_id,
			            a.technician_email,
			            a.technician_name,
			            coalesce(a.cidade, o.cidade) as cidade`,
			[VALID_PHONE_DIGITS_REGEX],
		);
		releasedAssignments = releaseResult.rows;
		await client.query("commit");
		const replenished = await replenishReleasedAssignments(releasedAssignments);
		return {
			completedAutomatically,
			released: releasedAssignments.length,
			replenished,
		};
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function replenishReleasedAssignments(releasedAssignments = []) {
	const groups = new Map();
	for (const assignment of releasedAssignments) {
		const cidade = text(assignment.cidade);
		const technicianId = text(assignment.technician_user_id);
		const technicianEmail = text(assignment.technician_email).toLowerCase();
		if (!cidade || (!technicianId && !technicianEmail)) continue;
		const key = `${technicianId}|${technicianEmail}|${normalizeText(cidade)}`;
		const current = groups.get(key) || {
			cidade,
			count: 0,
			user: {
				uid: technicianId,
				email: technicianEmail,
				nome: text(assignment.technician_name),
			},
		};
		current.count += 1;
		groups.set(key, current);
	}

	let replenished = 0;
	for (const group of groups.values()) {
		const loadResult = await db.query(
			`select count(*)::int as total
			   from tentativas_assignments a
			   join tentativas_opportunities o on o.id = a.opportunity_id
			  where a.released_at is null
			    and o.active = true
			    and o.cidade_normalizada = $1
			    and (a.technician_user_id = $2 or lower(coalesce(a.technician_email, '')) = $3)
			    and o.status not in (
			      'SCHEDULED', 'COMPLETED', 'CANCELLED', 'REFUSED',
			      'INVALID_PHONE', 'ALREADY_RETURNED', 'EQUIPMENT_UNAVAILABLE'
			    )`,
			[normalizeText(group.cidade), userId(group.user), userEmail(group.user)],
		);
		const currentLoad = Number(loadResult.rows[0]?.total || 0);
		replenished += await autoClaimCity(
			group.cidade,
			group.user,
			currentLoad + group.count,
		);
	}
	return replenished;
}

function shouldSkipOpportunitiesSync(force = false) {
	return !force && Date.now() - opportunitiesLastSyncAt < OPPORTUNITIES_SYNC_TTL_MS;
}

async function syncOpportunitiesFromMatch({ force = false } = {}) {
	if (shouldSkipOpportunitiesSync(force)) {
		return { skipped: true, reason: "fresh" };
	}
	if (!opportunitiesSyncPromise) {
		opportunitiesSyncPromise = performOpportunitiesSyncFromMatch()
			.then((summary) => {
				opportunitiesLastSyncAt = Date.now();
				return { ok: true, ...summary };
			})
			.catch((error) => {
				console.error("[tentativas] Falha ao sincronizar oportunidades:", error);
				throw error;
			})
			.finally(() => {
				opportunitiesSyncPromise = null;
			});
	}
	return opportunitiesSyncPromise;
}

function scheduleOpportunitiesSyncFromMatch() {
	if (shouldSkipOpportunitiesSync(false) || opportunitiesSyncPromise) return;
	syncOpportunitiesFromMatch().catch(() => {});
}

function runScheduledOpportunitiesReconciliation() {
	syncOpportunitiesFromMatch({ force: true })
		.then((summary) => {
			console.log("[tentativas] Reconciliacao horaria concluida:", summary);
		})
		.catch((error) => {
			console.error(
				"[tentativas] Falha na reconciliacao horaria:",
				error?.message || error,
			);
		});
}

function startOpportunitiesReconciliationWorker() {
	if (opportunitiesReconciliationTimer) return;
	opportunitiesReconciliationInitialTimer = setTimeout(
		runScheduledOpportunitiesReconciliation,
		Number(
			process.env.TENTATIVAS_RECONCILIATION_INITIAL_DELAY_MS ||
				OPPORTUNITIES_RECONCILIATION_INITIAL_DELAY_MS,
		),
	);
	opportunitiesReconciliationInitialTimer.unref?.();
	opportunitiesReconciliationTimer = setInterval(
		runScheduledOpportunitiesReconciliation,
		Number(
			process.env.TENTATIVAS_RECONCILIATION_INTERVAL_MS ||
				OPPORTUNITIES_RECONCILIATION_INTERVAL_MS,
		),
	);
	opportunitiesReconciliationTimer.unref?.();
}

function stopOpportunitiesReconciliationWorker() {
	if (opportunitiesReconciliationInitialTimer) {
		clearTimeout(opportunitiesReconciliationInitialTimer);
		opportunitiesReconciliationInitialTimer = null;
	}
	if (opportunitiesReconciliationTimer) {
		clearInterval(opportunitiesReconciliationTimer);
		opportunitiesReconciliationTimer = null;
	}
}

async function getSettings(client = db) {
	const result = await client.query("select * from tentativas_settings where id = 'global'");
	return result.rows[0] || {};
}

async function saveSettings(payload = {}, user = {}) {
	const result = await db.query(
		`update tentativas_settings
		    set coverage_goal = $1,
		        min_interval_hours = $2,
		        max_attempts = $3,
		        default_campaign_size = $4,
		        allowed_start_time = $5,
		        allowed_end_time = $6,
		        updated_at = now()
		  where id = 'global'
		  returning *`,
		[
			Number(payload.coverageGoal || payload.coverage_goal || 90),
			Number(payload.minIntervalHours || payload.min_interval_hours || 12),
			Number(payload.maxAttempts || payload.max_attempts || 3),
			Number(payload.defaultCampaignSize || payload.default_campaign_size || 30),
			text(payload.allowedStartTime || payload.allowed_start_time || "08:00"),
			text(payload.allowedEndTime || payload.allowed_end_time || "18:00"),
		],
	);
	await recordAudit("settings.update", "global", user, result.rows[0]);
	return result.rows[0];
}

async function listCities(_query = {}, user = {}) {
	scheduleOpportunitiesSyncFromMatch();
	const admin = hasAdminAccess(user);
	const params = [userId(user), userEmail(user), admin];
	const result = await db.query(
		`with allowed as (
			select distinct cidade_normalizada
			  from tentativas_technician_cities
			 where active = true
			   and (permanent = true or current_date between coalesce(valid_from, current_date) and coalesce(valid_until, current_date))
			   and (user_id = $1 or lower(coalesce(user_email, '')) = $2)
		),
		counts as (
			select o.cidade,
			       o.cidade_normalizada,
			       count(*) filter (where o.active = true) as total,
			       count(*) filter (where o.active = true and o.status in ('PENDING','CONTACT_STARTED')) as pending,
			       count(*) filter (where o.active = true and o.attempt_count > 0) as worked,
			       count(*) filter (where o.active = true and o.status = 'RESPONDED') as responded,
			       count(*) filter (where o.active = true and o.status = 'SCHEDULED') as scheduled
			  from tentativas_opportunities o
			 where o.active = true
			   and coalesce(o.telefone_digits, '') ~ $4
			   and ($3::boolean = true or exists (select 1 from allowed a where a.cidade_normalizada = o.cidade_normalizada))
			 group by o.cidade, o.cidade_normalizada
		)
		select * from counts order by total desc, cidade asc`,
		[...params, VALID_PHONE_DIGITS_REGEX],
	);
	return { items: result.rows };
}

async function ensureTechnicianCanUseCity(cidade, user = {}) {
	if (hasAdminAccess(user)) return true;
	const result = await db.query(
		`select 1
		   from tentativas_technician_cities
		  where active = true
		    and cidade_normalizada = $1
		    and (permanent = true or current_date between coalesce(valid_from, current_date) and coalesce(valid_until, current_date))
		    and (user_id = $2 or lower(coalesce(user_email, '')) = $3)
		  limit 1`,
		[normalizeText(cidade), userId(user), userEmail(user)],
	);
	return Boolean(result.rowCount);
}

async function autoClaimCity(cidade, user = {}, limit = 60) {
	const client = await db.connect();
	try {
		await client.query("begin");
		const result = await client.query(
			`with current_load as (
				select count(*)::int as total
				  from tentativas_assignments a
				  join tentativas_opportunities o on o.id = a.opportunity_id
				 where a.released_at is null
				   and o.active = true
				   and coalesce(o.telefone_digits, '') ~ $6
				   and o.cidade_normalizada = $1
				   and (a.technician_user_id = $2 or lower(coalesce(a.technician_email, '')) = $3)
				   and o.status not in (
				     'SCHEDULED', 'COMPLETED', 'CANCELLED', 'REFUSED',
				     'INVALID_PHONE', 'ALREADY_RETURNED', 'EQUIPMENT_UNAVAILABLE'
				   )
			), selected as (
				select o.id, o.cidade
				  from tentativas_opportunities o
				 where o.active = true
				   and coalesce(o.telefone_digits, '') ~ $6
				   and o.cidade_normalizada = $1
				   and o.status not in (
				     'SCHEDULED', 'COMPLETED', 'CANCELLED', 'REFUSED',
				     'INVALID_PHONE', 'ALREADY_RETURNED', 'EQUIPMENT_UNAVAILABLE'
				   )
				   and not exists (
				     select 1 from tentativas_assignments a
				      where a.opportunity_id = o.id and a.released_at is null
				   )
				 order by o.priority = 'ALTA' desc, o.os_opened_at desc nulls last, o.created_at desc
				 limit greatest($5 - (select total from current_load), 0)
			)
			insert into tentativas_assignments (
				id, opportunity_id, technician_user_id, technician_email,
				technician_name, cidade, assigned_by
			)
			select 'ta_' || encode(gen_random_bytes(12), 'hex'),
			       selected.id, $2, $3, $4, selected.cidade, $2
			  from selected
			on conflict do nothing
			returning id`,
			[
				normalizeText(cidade),
				userId(user),
				userEmail(user),
				userName(user),
				limit,
				VALID_PHONE_DIGITS_REGEX,
			],
		);
		await client.query("commit");
		return result.rowCount;
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

function mapOpportunity(row = {}) {
	return {
		id: row.id,
		os: row.os,
		codigoCliente: row.codigo_cliente,
		cliente: row.cliente,
		telefone: row.telefone,
		cidade: row.cidade,
		regional: row.regional,
		empresa: row.empresa,
		tipoOs: row.tipo_os,
		status: row.status,
		priority: row.priority,
		attemptCount: Number(row.attempt_count || 0),
		lastAttemptAt: row.last_attempt_at,
		lastResult: row.last_result,
		nextAttemptAt: row.next_attempt_at,
		osOpenedAt: row.os_opened_at,
		osAgeDays: Number(row.os_age_days || 0),
		assignmentId: row.assignment_id,
		technicianName: row.technician_name,
		active: row.active,
	};
}

async function getMyRoute(query = {}, user = {}) {
	scheduleOpportunitiesSyncFromMatch();
	const cidade = text(query.cidade);
	if (!cidade) return { city: "", summary: {}, items: [] };
	if (!(await ensureTechnicianCanUseCity(cidade, user))) {
		const error = new Error("Cidade nao autorizada para este tecnico.");
		error.statusCode = 403;
		throw error;
	}
	await autoClaimCity(cidade, user, normalizeLimit(query.claimLimit, 50, 150));
	const result = await db.query(
		`select o.*, a.id as assignment_id, a.technician_name
		   from tentativas_opportunities o
		   join tentativas_assignments a on a.opportunity_id = o.id and a.released_at is null
		  where o.active = true
		    and coalesce(o.telefone_digits, '') ~ $5
		    and o.cidade_normalizada = $1
		    and (a.technician_user_id = $2 or lower(coalesce(a.technician_email, '')) = $3)
		  order by o.status = 'PENDING' desc,
		           o.priority = 'ALTA' desc,
		           o.next_attempt_at nulls first,
		           o.os_opened_at desc nulls last
		  limit $4`,
		[
			normalizeText(cidade),
			userId(user),
			userEmail(user),
			normalizeLimit(query.limit, 50, 100),
			VALID_PHONE_DIGITS_REGEX,
		],
	);
	const items = result.rows.map(mapOpportunity);
	return {
		city: cidade,
		summary: {
			total: items.length,
			pending: items.filter((item) => ["PENDING", "CONTACT_STARTED"].includes(item.status)).length,
			worked: items.filter((item) => item.attemptCount > 0).length,
			responded: items.filter((item) => item.status === "RESPONDED").length,
			scheduled: items.filter((item) => item.status === "SCHEDULED").length,
		},
		items,
	};
}

async function findAssignmentForUser(opportunityId, user = {}, client = db) {
	const result = await client.query(
		`select o.*,
		        o.id as opportunity_id,
		        a.id as assignment_id,
		        a.technician_user_id,
		        a.technician_email,
		        a.technician_name,
		        a.assigned_at,
		        a.released_at
		   from tentativas_assignments a
		   join tentativas_opportunities o on o.id = a.opportunity_id
		  where a.opportunity_id = $1
		    and a.released_at is null
		    and ($2::boolean = true or a.technician_user_id = $3 or lower(coalesce(a.technician_email, '')) = $4)
		  limit 1`,
		[opportunityId, hasAdminAccess(user), userId(user), userEmail(user)],
	);
	return result.rows[0] || null;
}

async function getTemplateForAttempt(attemptNumber, client = db) {
	const result = await client.query(
		`select *
		   from tentativas_templates
		  where active = true
		    and (attempt_number = $1 or is_default = true)
		  order by (attempt_number = $1) desc, is_default desc, attempt_number asc
		  limit 1`,
		[attemptNumber],
	);
	return result.rows[0] || null;
}

async function waitForPhoneEnrichment(opportunityId, user) {
	let timer;
	try {
		return await Promise.race([
			enrichOpportunityPhone(opportunityId, user),
			new Promise((_, reject) => {
				timer = setTimeout(() => {
					reject(new Error("Consulta de telefone excedeu o tempo de espera."));
				}, PHONE_ENRICH_WAIT_MS);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

async function enrichOpportunityPhoneOnce(opportunityId, user = {}) {
	const row = await findAssignmentForUser(opportunityId, user);
	if (!row) return normalizePhone("");
	const existing = normalizePhone(row.telefone);
	if (existing.valid) return existing;

	const localResult = await db.query(
		`select telefone
		   from (
		     select coalesce(
		              nullif(o.telefone, ''),
		              o.telefones[1],
		              nullif(o.source_payload->>'telefone', ''),
		              nullif(o.source_payload->>'telefone_primario', ''),
		              nullif(o.source_payload->>'telefone_principal', ''),
		              nullif(o.source_payload->>'celular', ''),
		              nullif(o.source_payload->>'whatsapp', ''),
		              nullif(o.source_payload#>>'{cliente,telefone_primario}', ''),
		              nullif(o.source_payload#>>'{cliente,telefone}', '')
		            ) as telefone,
		            case when o.num_os = $1 then 0 else 1 end as match_rank,
		            o.updated_at as source_at
		       from ordens_servico o
		      where o.num_os = $1
		         or (coalesce($2, '') <> '' and o.codigo_cliente = $2)
		     union all
		     select mf.telefone,
		            case when mf.os = $1 then 0 else 1 end,
		            mf.created_at
		       from mensageria_fila mf
		      where mf.os = $1
		         or (coalesce($2, '') <> '' and mf.codigo_cliente = $2)
		     union all
		     select mh.telefone,
		            case when mh.os = $1 then 0 else 1 end,
		            mh.created_at
		       from mensageria_historico mh
		      where mh.os = $1
		         or (coalesce($2, '') <> '' and mh.codigo_cliente = $2)
		     union all
		     select mc.telefone,
		            case when mc.os = $1 then 0 else 1 end,
		            mc.created_at
		       from mensageria_callbacks mc
		      where mc.os = $1
		         or (coalesce($2, '') <> '' and mc.codigo_cliente = $2)
		     union all
		     select mac.telefone,
		            case when mac.os = $1 then 0 else 1 end,
		            mac.created_at
		       from mensageria_agendamento_conversas mac
		      where mac.os = $1
		         or (coalesce($2, '') <> '' and mac.codigo_cliente = $2)
		     union all
		     select coalesce(nullif(a.telefone, ''), a.telefones->>0),
		            case when a.os = $1 then 0 else 1 end,
		            a.created_at
		       from agendamentos a
		      where a.os = $1
		         or (coalesce($2, '') <> '' and a.codigo_cliente = $2)
		   ) saved_phones
		  where nullif(telefone, '') is not null
		  order by match_rank, source_at desc nulls last
		  limit 20`,
		[row.os, row.codigo_cliente],
	);
	const phone = firstValidPhone(localResult.rows.map((item) => item.telefone));

	if (phone.valid) {
		await db.query(
			`update tentativas_opportunities
			    set telefone = $2, telefone_digits = $3, updated_at = now()
			  where id = $1`,
			[opportunityId, phone.display, phone.digits],
		);
	}
	return phone;
}

async function enrichOpportunityPhone(opportunityId, user = {}) {
	const running = phoneEnrichmentPromises.get(opportunityId);
	if (running) return running;

	const promise = enrichOpportunityPhoneOnce(opportunityId, user).finally(() => {
		phoneEnrichmentPromises.delete(opportunityId);
	});
	phoneEnrichmentPromises.set(opportunityId, promise);
	return promise;
}

async function startContact(opportunityId, payload = {}, user = {}, req = {}) {
	let enrichedPhone = normalizePhone("");
	try {
		enrichedPhone = await waitForPhoneEnrichment(opportunityId, user);
	} catch (error) {
		console.warn(
			`[tentativas] Consulta de telefone da oportunidade ${opportunityId} continuara em segundo plano:`,
			error?.message || error,
		);
	}
	const client = await db.connect();
	try {
		await client.query("begin");
		const row = await findAssignmentForUser(opportunityId, user, client);
		if (!row) {
			const error = new Error("Oportunidade nao atribuida para este usuario.");
			error.statusCode = 409;
			throw error;
		}
		if (!row.active) {
			const error = new Error("Oportunidade inativa no Match.");
			error.statusCode = 409;
			throw error;
		}
		const settings = await getSettings(client);
		if (row.next_attempt_at && new Date(row.next_attempt_at) > new Date() && !payload.override) {
			const error = new Error("Intervalo minimo entre tentativas ainda nao foi cumprido.");
			error.statusCode = 429;
			error.nextAttemptAt = row.next_attempt_at;
			throw error;
		}
		const phone = firstValidPhone([
			payload.phone,
			row.telefone,
			enrichedPhone.display,
		]);
		if (!phone.valid) {
			const error = new Error("Telefone invalido ou ausente para WhatsApp.");
			error.statusCode = 400;
			throw error;
		}
		const attemptNumber = Number(row.attempt_count || 0) + 1;
		if (settings.max_attempts && attemptNumber > Number(settings.max_attempts) && !payload.override) {
			const error = new Error("Limite maximo de tentativas atingido.");
			error.statusCode = 429;
			throw error;
		}
		const template = await getTemplateForAttempt(attemptNumber, client);
		const customerIdentification = formatCustomerIdentification(
			row.codigo_cliente,
			row.cliente,
		);
		const renderedMessage = renderTemplate(template?.body || "", {
			cliente: customerIdentification,
			nome_cliente: row.cliente,
			codigo_cliente: row.codigo_cliente,
			primeiro_nome: firstName(row.cliente),
			tecnico: userName(user),
			empresa: row.empresa || "Sempre Internet",
			cidade: row.cidade,
			os: row.os,
			data: new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
		});
		const message = renderedMessage.includes(customerIdentification)
			? renderedMessage
			: `Cliente: ${customerIdentification}\n\n${renderedMessage}`.trim();
		const whatsappUrls = buildWhatsappUrls(phone.digits, message);
		const { whatsappUrl } = whatsappUrls;
		const contactId = id("tc");
		await client.query(
			`insert into tentativas_contacts (
				id, opportunity_id, assignment_id, technician_user_id, technician_name,
				phone, phone_digits, event_type, attempt_number, template_id,
				message, whatsapp_url, status, ip_address, user_agent
			) values ($1,$2,$3,$4,$5,$6,$7,'WHATSAPP_OPENED',$8,$9,$10,$11,'OPENED',$12,$13)`,
			[
				contactId,
				row.opportunity_id,
				row.assignment_id,
				userId(user),
				userName(user),
				phone.display,
				phone.digits,
				attemptNumber,
				template?.id || null,
				message,
				whatsappUrl,
				req.ip || "",
				req.get?.("user-agent") || "",
			],
		);
		await client.query(
			"update tentativas_opportunities set status = 'CONTACT_STARTED', updated_at = now() where id = $1",
			[row.opportunity_id],
		);
		await client.query("commit");
		await recordAudit("contact.whatsapp_opened", contactId, user, {
			opportunityId,
			os: row.os,
			attemptNumber,
		});
		return {
			contactId,
			...whatsappUrls,
			message,
			phone: phone.display,
			attemptNumber,
			customerCode: row.codigo_cliente,
			customerName: row.cliente,
		};
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function saveResult(contactId, payload = {}, user = {}) {
	const result = text(payload.result).toUpperCase();
	if (!CONTACT_RESULTS.has(result)) {
		const error = new Error("Resultado de tentativa invalido.");
		error.statusCode = 400;
		throw error;
	}
	const sentConfirmed = payload.sentConfirmed === true || payload.sent_confirmed === true;
	const observation = text(payload.observation || payload.observacao).slice(0, 500);
	const settings = await getSettings();
	const client = await db.connect();
	try {
		await client.query("begin");
		const contactResult = await client.query(
			`select c.*, o.os, o.id as opportunity_id
			   from tentativas_contacts c
			   join tentativas_opportunities o on o.id = c.opportunity_id
			  where c.id = $1
			  for update`,
			[contactId],
		);
		const contact = contactResult.rows[0];
		if (!contact) {
			const error = new Error("Tentativa nao encontrada.");
			error.statusCode = 404;
			throw error;
		}
		const assignment = await findAssignmentForUser(contact.opportunity_id, user, client);
		if (!assignment) {
			const error = new Error("Tentativa nao pertence a este usuario.");
			error.statusCode = 403;
			throw error;
		}
		const wasConfirmed = contact.sent_confirmed === true;
		const attemptDelta = sentConfirmed === wasConfirmed ? 0 : sentConfirmed ? 1 : -1;
		const nextAttemptAt =
			sentConfirmed && (result === "NO_RESPONSE" || result === "CALLBACK_REQUESTED")
				? new Date(Date.now() + Number(settings.min_interval_hours || 12) * 3600 * 1000).toISOString()
				: null;
		const status = sentConfirmed ? RESULT_TO_STATUS[result] || "CONTACTED" : "PENDING";
		await client.query(
			`update tentativas_contacts
			    set sent_confirmed = $2,
			        result = $3,
			        status = case when $2 = true then 'CONFIRMED' else 'NOT_SENT' end,
			        observation = $4,
			        confirmed_at = now(),
			        next_attempt_at = $5,
			        updated_at = now()
			  where id = $1`,
			[contactId, sentConfirmed, result, observation, nextAttemptAt],
		);
		await client.query(
			`update tentativas_opportunities
			    set status = $2,
			        attempt_count = greatest(0, attempt_count + $6),
			        last_attempt_at = case when $6 > 0 then now() else last_attempt_at end,
			        last_result = $3,
			        next_attempt_at = $4,
			        responded_at = case when $2 in ('RESPONDED','SCHEDULED') then coalesce(responded_at, now()) else responded_at end,
			        scheduled_at = case when $2 = 'SCHEDULED' then coalesce(scheduled_at, now()) else scheduled_at end,
			        completed_at = case when $2 = 'COMPLETED' then coalesce(completed_at, now()) else completed_at end,
			        updated_at = now()
			  where id = $1`,
			[contact.opportunity_id, status, result, nextAttemptAt, sentConfirmed, attemptDelta],
		);
		await client.query("commit");
		await recordAudit("contact.result", contactId, user, {
			opportunityId: contact.opportunity_id,
			result,
			status,
			sentConfirmed,
		});
		return { ok: true, status, nextAttemptAt };
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function getOpportunity(idValue, user = {}) {
	const result = await db.query(
		`select o.*, a.id as assignment_id, a.technician_name, a.technician_user_id
		   from tentativas_opportunities o
		   left join tentativas_assignments a on a.opportunity_id = o.id and a.released_at is null
		  where o.id = $1
		    and ($2::boolean = true or a.technician_user_id = $3 or lower(coalesce(a.technician_email, '')) = $4)`,
		[idValue, hasAdminAccess(user), userId(user), userEmail(user)],
	);
	const item = result.rows[0];
	if (!item) return null;
	const contacts = await db.query(
		`select *
		   from tentativas_contacts
		  where opportunity_id = $1
		  order by created_at desc`,
		[idValue],
	);
	return { item: mapOpportunity(item), contacts: contacts.rows };
}

async function listHistory(query = {}, user = {}) {
	const page = normalizePage(query.page);
	const limit = normalizeLimit(query.limit, 20, 100);
	const offset = (page - 1) * limit;
	const filters = [];
	const params = [hasGlobalHistoryAccess(user), userId(user), userEmail(user)];
	let index = params.length;
	if (query.q) {
		params.push(`%${text(query.q)}%`);
		index += 1;
		filters.push(`(o.cliente ilike $${index} or o.codigo_cliente ilike $${index} or o.os ilike $${index} or o.telefone ilike $${index} or o.cidade ilike $${index})`);
	}
	if (query.status) {
		params.push(text(query.status));
		index += 1;
		filters.push(`o.status = $${index}`);
	}
	if (query.cidade) {
		params.push(normalizeText(query.cidade));
		index += 1;
		filters.push(`o.cidade_normalizada = $${index}`);
	}
	const where = filters.length ? `and ${filters.join(" and ")}` : "";
	const result = await db.query(
		`select count(*) over() as total_count,
		        c.*, o.os, o.codigo_cliente, o.cliente, o.cidade, o.regional,
		        o.status as opportunity_status,
		        o.active as opportunity_active,
		        a.released_at as assignment_released_at
		   from tentativas_contacts c
		   join tentativas_opportunities o on o.id = c.opportunity_id
		   left join tentativas_assignments a on a.id = c.assignment_id
		  where ($1::boolean = true or c.technician_user_id = $2 or lower(coalesce(a.technician_email, '')) = $3)
		    ${where}
		  order by c.created_at desc
		  limit $${index + 1} offset $${index + 2}`,
		[...params, limit, offset],
	);
	return {
		items: result.rows,
		page,
		limit,
		total: Number(result.rows[0]?.total_count || 0),
	};
}

function percent(part, total) {
	const denominator = Number(total || 0);
	if (!denominator) return 0;
	return Number(((Number(part || 0) / denominator) * 100).toFixed(1));
}

async function getOverview(query = {}) {
	scheduleOpportunitiesSyncFromMatch();
	const result = await db.query(
		`select
			count(*) filter (where active = true) as opportunities,
			count(distinct id) filter (where attempt_count > 0) as worked,
			count(*) filter (where active = true and attempt_count = 0) as pending,
			coalesce(sum(attempt_count), 0) as attempts,
			count(*) filter (where status in ('RESPONDED','SCHEDULED','COMPLETED')) as responded,
			count(*) filter (where status = 'SCHEDULED') as scheduled,
			count(*) filter (where status = 'COMPLETED') as completed,
			max(updated_at) as latest_opportunity_update
		   from tentativas_opportunities
		  where ($1::text = '' or cidade_normalizada = $1)
		    and ($2::text = '' or regional = $2)
		    and ($3::text = '' or empresa = $3)
		    and (active = false or coalesce(telefone_digits, '') ~ $4)`,
		[
			normalizeText(query.cidade),
			text(query.regional),
			text(query.empresa),
			VALID_PHONE_DIGITS_REGEX,
		],
	);
	const row = result.rows[0] || {};
	const opportunities = Number(row.opportunities || 0);
	const worked = Number(row.worked || 0);
	const responded = Number(row.responded || 0);
	const scheduled = Number(row.scheduled || 0);
	return {
		...row,
		opportunities,
		worked,
		pending: Number(row.pending || 0),
		attempts: Number(row.attempts || 0),
		responded,
		scheduled,
		completed: Number(row.completed || 0),
		lastReconciliationAt: opportunitiesLastSyncAt
			? new Date(opportunitiesLastSyncAt).toISOString()
			: row.latest_opportunity_update,
		coverage: percent(worked, opportunities),
		responseConversion: percent(responded, worked),
		scheduleConversion: percent(scheduled, worked),
		funnel: [
			{ label: "Oportunidades", value: opportunities },
			{ label: "Trabalhadas", value: worked },
			{ label: "Responderam", value: responded },
			{ label: "Agendaram", value: scheduled },
			{ label: "Retiradas", value: Number(row.completed || 0) },
		],
	};
}

async function getRanking() {
	const result = await db.query(
		`with technician_sources as (
			select user_id as technician_user_id,
			       nullif(user_name, '') as technician_name
			  from tentativas_technician_cities
			 where active = true
			union all
			select technician_user_id,
			       nullif(technician_name, '') as technician_name
			  from tentativas_assignments
			 where released_at is null
		), technicians as (
			select technician_user_id,
			       max(technician_name) as technician_name
			  from technician_sources
			 group by technician_user_id
		)
		select coalesce(t.technician_user_id, 'sem_tecnico') as technician_id,
		        coalesce(t.technician_name, 'Sem tecnico') as technician_name,
		        count(distinct o.id) as opportunities,
		        count(distinct o.id) filter (where o.attempt_count > 0) as worked,
		        coalesce(sum(o.attempt_count), 0) as attempts,
		        count(distinct o.id) filter (where o.status in ('RESPONDED','SCHEDULED','COMPLETED')) as responded,
		        count(distinct o.id) filter (where o.status = 'SCHEDULED') as scheduled,
		        count(distinct o.id) filter (where o.status = 'COMPLETED') as completed
		   from technicians t
		   left join tentativas_assignments a
		     on a.technician_user_id = t.technician_user_id
		    and a.released_at is null
		   left join tentativas_opportunities o on o.id = a.opportunity_id
		  group by t.technician_user_id, t.technician_name
		  order by worked desc, attempts desc
		  limit 100`,
	);
	return {
		items: result.rows.map((row) => ({
			...row,
			opportunities: Number(row.opportunities || 0),
			worked: Number(row.worked || 0),
			attempts: Number(row.attempts || 0),
			responded: Number(row.responded || 0),
			scheduled: Number(row.scheduled || 0),
			completed: Number(row.completed || 0),
			coverage: percent(row.worked, row.opportunities),
		})),
	};
}

async function listDistribution() {
	const result = await db.query(
		`with distribution_sources as (
			select user_id as technician_user_id,
			       user_email as technician_email,
			       user_name as technician_name,
			       cidade,
			       cidade_normalizada
			  from tentativas_technician_cities
			 where active = true
			union all
			select a.technician_user_id,
			       a.technician_email,
			       a.technician_name,
			       o.cidade,
			       o.cidade_normalizada
			  from tentativas_assignments a
			  join tentativas_opportunities o on o.id = a.opportunity_id
			 where a.released_at is null
		), distribution_keys as (
			select technician_user_id,
			       max(nullif(technician_email, '')) as technician_email,
			       max(nullif(technician_name, '')) as technician_name,
			       max(cidade) as cidade,
			       cidade_normalizada
			  from distribution_sources
			 group by technician_user_id, cidade_normalizada
		)
		select k.technician_user_id, k.technician_name, k.cidade,
		        count(o.id) as opportunities,
		        count(o.id) filter (where o.attempt_count > 0) as worked,
		        count(o.id) filter (where o.attempt_count = 0) as pending
		   from distribution_keys k
		   left join tentativas_assignments a
		     on a.technician_user_id = k.technician_user_id
		    and a.released_at is null
		   left join tentativas_opportunities o
		     on o.id = a.opportunity_id
		    and o.cidade_normalizada = k.cidade_normalizada
		    and o.active = true
		  group by k.technician_user_id, k.technician_name, k.cidade
		  order by k.technician_name, k.cidade
		  limit 500`,
	);
	return {
		items: result.rows.map((row) => ({
			...row,
			opportunities: Number(row.opportunities || 0),
			worked: Number(row.worked || 0),
			pending: Number(row.pending || 0),
			coverage: percent(row.worked, row.opportunities),
		})),
	};
}

async function saveTechnicianCity(payload = {}, user = {}) {
	const city = text(payload.cidade);
	if (!city) {
		const error = new Error("Informe a cidade.");
		error.statusCode = 400;
		throw error;
	}
	const result = await db.query(
		`insert into tentativas_technician_cities (
			id, user_id, user_email, user_name, cidade, cidade_normalizada,
			valid_from, valid_until, permanent, active, created_by
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10)
		on conflict do nothing
		returning *`,
		[
			id("ttc"),
			text(payload.userId),
			text(payload.userEmail).toLowerCase(),
			text(payload.userName),
			city,
			normalizeText(city),
			payload.validFrom || null,
			payload.validUntil || null,
			payload.permanent !== false,
			userId(user),
		],
	);
	const association = result.rows[0] || null;
	const assigned = await autoClaimCity(
		city,
		{
			uid: text(payload.userId),
			email: text(payload.userEmail).toLowerCase(),
			nome: text(payload.userName),
		},
		50,
	);
	await recordAudit("city.assign", city, user, payload);
	return { ...(association || { ok: true }), assigned };
}

async function removeTechnicianCity(idValue, user = {}) {
	await db.query(
		"update tentativas_technician_cities set active = false, updated_at = now() where id = $1",
		[idValue],
	);
	await recordAudit("city.remove", idValue, user, { active: false });
	return { ok: true };
}

async function listTechnicianCities() {
	const result = await db.query(
		`select *
		   from tentativas_technician_cities
		  where active = true
		  order by user_name asc nulls last, cidade asc`,
	);
	return { items: result.rows };
}

async function searchUsers(query = {}) {
	const q = text(query.q || query.search);
	if (q.length < 2) return { items: [] };
	const result = await db.query(
		`select uid, email, display_name, role, regional
		   from app_users
		  where disabled = false
		    and (
		      uid ilike $1
		      or email ilike $1
		      or display_name ilike $1
		      or coalesce(imported_profile->>'nome', '') ilike $1
		    )
		  order by
		    case when display_name ilike $2 or email ilike $2 then 0 else 1 end,
		    coalesce(display_name, email) asc
		  limit 12`,
		[`%${q}%`, `${q}%`],
	);
	return {
		items: result.rows.map((row) => ({
			id: row.uid,
			uid: row.uid,
			email: row.email,
			nome: row.display_name || row.email,
			role: row.role,
			regional: row.regional,
		})),
	};
}

async function listTemplates() {
	const result = await db.query(
		"select * from tentativas_templates order by attempt_number asc, name asc",
	);
	return { items: result.rows };
}

async function saveTemplate(payload = {}, user = {}) {
	const templateId = text(payload.id) || id("tmpl");
	const result = await db.query(
		`insert into tentativas_templates (
			id, name, body, attempt_number, active, is_default, created_by, updated_by
		) values ($1,$2,$3,$4,$5,$6,$7,$7)
		on conflict (id) do update set
			name = excluded.name,
			body = excluded.body,
			attempt_number = excluded.attempt_number,
			active = excluded.active,
			is_default = excluded.is_default,
			updated_by = excluded.updated_by,
			updated_at = now()
		returning *`,
		[
			templateId,
			text(payload.name || payload.nome || "Template"),
			text(payload.body || payload.conteudo),
			Number(payload.attemptNumber || payload.attempt_number || 1),
			payload.active !== false,
			payload.isDefault === true || payload.is_default === true,
			userId(user),
		],
	);
	await recordAudit("template.save", templateId, user, result.rows[0]);
	return result.rows[0];
}

async function createCampaign(payload = {}, user = {}) {
	const city = text(payload.cidade);
	const quantity = normalizeLimit(payload.quantity || payload.quantidade, 30, 500);
	const campaignId = id("camp");
	const client = await db.connect();
	try {
		await client.query("begin");
		await client.query(
			`insert into tentativas_campaigns (
				id, name, cidade, cidade_normalizada, technician_user_id,
				technician_name, quantity, criteria, created_by
			) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
			[
				campaignId,
				text(payload.name || payload.nome) || `Recuperacao ${city}`,
				city,
				normalizeText(city),
				text(payload.technicianUserId || payload.tecnicoId),
				text(payload.technicianName || payload.tecnicoNome),
				quantity,
				JSON.stringify(payload.criteria || {}),
				userId(user),
			],
		);
		const assignResult = await client.query(
			`with selected as (
				select o.id, o.cidade
				  from tentativas_opportunities o
				 where o.active = true
				   and coalesce(o.telefone_digits, '') ~ $7
				   and ($1 = '' or o.cidade_normalizada = $1)
				   and not exists (
				     select 1 from tentativas_assignments a
				      where a.opportunity_id = o.id and a.released_at is null
				   )
				 order by o.priority = 'ALTA' desc, o.os_opened_at desc nulls last
				 limit $2
			),
			created as (
				insert into tentativas_assignments (
					id, opportunity_id, technician_user_id, technician_name,
					cidade, campaign_id, assigned_by
				)
				select 'ta_' || encode(gen_random_bytes(12), 'hex'), id, $3, $4, cidade, $5, $6
				  from selected
				on conflict do nothing
				returning id, opportunity_id
			)
			insert into tentativas_campaign_items (id, campaign_id, opportunity_id, assignment_id)
			select 'tci_' || encode(gen_random_bytes(12), 'hex'), $5, opportunity_id, id
			  from created
			returning *`,
			[
				normalizeText(city),
				quantity,
				text(payload.technicianUserId || payload.tecnicoId),
				text(payload.technicianName || payload.tecnicoNome),
				campaignId,
				userId(user),
				VALID_PHONE_DIGITS_REGEX,
			],
		);
		await client.query(
			"update tentativas_campaigns set quantity = $2 where id = $1",
			[campaignId, assignResult.rowCount],
		);
		await client.query("commit");
		await recordAudit("campaign.create", campaignId, user, { city, quantity: assignResult.rowCount });
		return { id: campaignId, quantity: assignResult.rowCount };
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function exportCsv(query = {}, user = {}) {
	const history = await listHistory({ ...query, limit: 1000 }, user);
	const header = [
		"data",
		"tecnico",
		"codigo_cliente",
		"cliente",
		"os",
		"cidade",
		"telefone",
		"resultado",
		"tentativa",
	].join(";");
	const rows = history.items.map((item) =>
		[
			item.created_at,
			item.technician_name,
			item.codigo_cliente,
			item.cliente,
			item.os,
			item.cidade,
			item.phone,
			item.result,
			item.attempt_number,
		]
			.map((value) => `"${text(value).replace(/"/g, '""')}"`)
			.join(";"),
	);
	return Buffer.from(`\ufeff${[header, ...rows].join("\n")}`, "utf8");
}

module.exports = {
	__testables: {
		buildWhatsappUrls,
		firstName,
		firstValidPhone,
		formatCustomerIdentification,
		normalizePhone,
		renderTemplate,
	},
	CAMPAIGN_PERMISSIONS,
	DISTRIBUTE_PERMISSIONS,
	EXECUTE_PERMISSIONS,
	EXPORT_PERMISSIONS,
	HISTORY_PERMISSIONS,
	OVERRIDE_PERMISSIONS,
	SETTINGS_PERMISSIONS,
	TEMPLATE_PERMISSIONS,
	VIEW_PERMISSIONS,
	createCampaign,
	exportCsv,
	getMyRoute,
	getOpportunity,
	getOverview,
	getRanking,
	getSettings,
	listCities,
	listDistribution,
	listHistory,
	listTechnicianCities,
	searchUsers,
	listTemplates,
	removeTechnicianCity,
	saveResult,
	saveSettings,
	saveTechnicianCity,
	saveTemplate,
	startOpportunitiesReconciliationWorker,
	startContact,
	stopOpportunitiesReconciliationWorker,
	syncOpportunitiesFromMatch,
};
