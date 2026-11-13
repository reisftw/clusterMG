const crypto = require("node:crypto");
const db = require("../db");
const auditLog = require("../auditLog");
const centralService = require("./tentativasCentralService");
const alertsService = require("./tentativasAlertsService");

const VIEW_PERMISSIONS = ["tentativas.visualizar"];
const EXECUTE_PERMISSIONS = ["tentativas.executar"];
const CONTACT_PERMISSIONS = ["tentativas.contatar", "tentativas.executar"];
const REGISTER_PERMISSIONS = ["tentativas.registrar", "tentativas.executar"];
const SCHEDULE_PERMISSIONS = ["tentativas.agendar", "tentativas.executar"];
const PORTFOLIO_PERMISSIONS = ["tentativas.carteiras.gerenciar", "tentativas.distribuir"];
const MANAGEMENT_PERMISSIONS = ["tentativas.gestao.visualizar", "tentativas.distribuir"];
const AUDIT_PERMISSIONS = ["tentativas.auditoria.visualizar", "tentativas.historico.visualizar"];
const CORRECTION_PERMISSIONS = ["tentativas.registros.corrigir", "tentativas.override"];
const HISTORY_PERMISSIONS = ["tentativas.historico.visualizar"];
const DISTRIBUTE_PERMISSIONS = ["tentativas.distribuir"];
const CAMPAIGN_PERMISSIONS = ["tentativas.campanhas.gerenciar"];
const TEMPLATE_PERMISSIONS = ["tentativas.templates.gerenciar"];
const SETTINGS_PERMISSIONS = ["tentativas.configuracoes.gerenciar"];
const EXPORT_PERMISSIONS = [
	"tentativas.relatorios.exportar",
	"tentativas.relatorio.exportar",
];
const OVERRIDE_PERMISSIONS = ["tentativas.override"];
const WITHDRAWAL_ORDER_TYPE_REGEX =
	"(RETIRADA\\s+FTTH|RETIRADA\\s*-\\s*OUTROS|RETIRADA\\s*&\\s*CANCELAMENTO\\s*-\\s*SEGUNDA\\s+TENTATIVA|CANCELAMENTO\\s*&\\s*RETIRADA\\s*-\\s*SEGUNDA\\s+TENTATIVA|CANCELAMENTO\\s+FTTH|CANCELAMENTO\\s*-\\s*OUTROS|CANCELAMENTO\\s+LOJA)";
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
	"RESPONDED_SCHEDULE",
	"STORE_DELIVERY",
	"RESPONDED_CALLBACK",
	"SCHEDULED",
	"REFUSED",
	"INVALID_PHONE",
	"UNAVAILABLE_PHONE",
	"ALREADY_RETURNED",
	"EQUIPMENT_UNAVAILABLE",
	"EQUIPMENT_NOT_FOUND",
	"CALLBACK_REQUESTED",
	"COMPLETED",
	"CANCELLED",
	"OTHER",
]);

const RESULT_TO_STATUS = {
	NO_RESPONSE: "NO_RESPONSE",
	RESPONDED: "RESPONDED",
	RESPONDED_SCHEDULE: "SCHEDULED",
	STORE_DELIVERY: "RESPONDED",
	RESPONDED_CALLBACK: "CALLBACK_REQUESTED",
	SCHEDULED: "SCHEDULED",
	REFUSED: "REFUSED",
	INVALID_PHONE: "INVALID_PHONE",
	UNAVAILABLE_PHONE: "INVALID_PHONE",
	ALREADY_RETURNED: "ALREADY_RETURNED",
	EQUIPMENT_UNAVAILABLE: "EQUIPMENT_UNAVAILABLE",
	EQUIPMENT_NOT_FOUND: "EQUIPMENT_UNAVAILABLE",
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

function normalizeNeighborhoodGroup(value) {
	const normalized = normalizeText(value);
	if (normalized === "__sem_bairro__") return normalized;
	return normalized.replace(/^(bairro|residencial)\s+/, "").replace(/\s+/g, " ").trim();
}

function normalizeNeighborhoodClaimHours(value) {
	const hours = Number(value);
	if (!Number.isFinite(hours)) return 24;
	return Math.min(24, Math.max(1, Math.ceil(hours)));
}

function neighborhoodGroupExpression(alias = "o") {
	return `regexp_replace(
		regexp_replace(
			lower(translate(trim(coalesce(${alias}.bairro, '')), 'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
			'^(bairro|residencial)[[:space:]]+', '', 'i'
		),
		'[[:space:]]+', ' ', 'g'
	)`;
}

function buildBalancedAssignmentPlan(candidates = [], technicians = [], loadRows = []) {
	if (!technicians.length) return [];
	const loadByTechnician = new Map(
		loadRows.map((row) => [
			text(row.technician_user_id) || text(row.technician_email).toLowerCase(),
			Number(row.total || 0),
		]),
	);
	return candidates.map((candidate) => {
		const technician = technicians.reduce((selected, current) => {
			const selectedKey = text(selected.user_id) || text(selected.user_email).toLowerCase();
			const currentKey = text(current.user_id) || text(current.user_email).toLowerCase();
			return (loadByTechnician.get(currentKey) || 0) < (loadByTechnician.get(selectedKey) || 0)
				? current
				: selected;
		}, technicians[0]);
		const technicianKey = text(technician.user_id) || text(technician.user_email).toLowerCase();
		loadByTechnician.set(technicianKey, (loadByTechnician.get(technicianKey) || 0) + 1);
		return {
			opportunity_id: candidate.opportunity_id,
			cidade: candidate.cidade,
			user_id: technician.user_id,
			email: technician.user_email,
			name: technician.user_name,
		};
	});
}

function technicianIdentity(technician = {}) {
	return text(technician.user_id || technician.technician_user_id) ||
		text(technician.user_email || technician.technician_email).toLowerCase();
}

function buildNeighborhoodDistributionPlan(neighborhoods = [], technicians = [], preferredOwners = []) {
	if (!technicians.length) return [];
	const orderedTechnicians = [...technicians].sort((left, right) =>
		text(left.user_name || left.technician_name || left.user_email).localeCompare(
			text(right.user_name || right.technician_name || right.user_email),
			"pt-BR",
		),
	);
	const technicianByIdentity = new Map(
		orderedTechnicians.map((technician) => [technicianIdentity(technician), technician]),
	);
	const preferredByGroup = new Map(
		preferredOwners
			.map((owner) => [
				text(owner.group_key),
				{
					ownerKey: technicianIdentity(owner),
					source: text(owner.preference_source || owner.assignment_source) || "CONTACT_HISTORY",
				},
			])
			.filter(([groupKey, preference]) =>
				groupKey && technicianByIdentity.has(preference.ownerKey),
			),
	);
	const loads = new Map(orderedTechnicians.map((technician) => [technicianIdentity(technician), 0]));
	const orderedNeighborhoods = [...neighborhoods].sort((left, right) => {
		const leftPreferred = preferredByGroup.has(text(left.group_key));
		const rightPreferred = preferredByGroup.has(text(right.group_key));
		if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;
		return Number(right.opportunities || 0) - Number(left.opportunities || 0) ||
			text(left.group_key).localeCompare(text(right.group_key), "pt-BR");
	});

	return orderedNeighborhoods.map((neighborhood) => {
		const groupKey = text(neighborhood.group_key) || "__sem_bairro__";
		const preference = preferredByGroup.get(groupKey);
		const technician = preference
			? technicianByIdentity.get(preference.ownerKey)
			: orderedTechnicians.reduce((selected, current) => {
				const selectedKey = technicianIdentity(selected);
				const currentKey = technicianIdentity(current);
				return (loads.get(currentKey) || 0) < (loads.get(selectedKey) || 0)
					? current
					: selected;
			}, orderedTechnicians[0]);
		const ownerKey = technicianIdentity(technician);
		loads.set(ownerKey, (loads.get(ownerKey) || 0) + Number(neighborhood.opportunities || 0));
		return {
			group_key: groupKey,
			bairro: text(neighborhood.bairro) || "Bairro nao informado",
			opportunities: Number(neighborhood.opportunities || 0),
			user_id: text(technician.user_id || technician.technician_user_id),
			email: text(technician.user_email || technician.technician_email).toLowerCase(),
			name: text(technician.user_name || technician.technician_name || technician.user_email),
			preserved: Boolean(preference),
			assignment_source: preference?.source || "AUTOMATIC",
		};
	});
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
		when coalesce(tentativas_opportunities.last_result, '') in ('RESPONDED', 'CALLBACK_REQUESTED') then 'ALTA'
		when coalesce(tentativas_opportunities.attempt_count, 0) = 0 and coalesce(excluded.os_age_days, 0) <= 7 then 'ALTA'
		when coalesce(tentativas_opportunities.attempt_count, 0) = 0 and coalesce(excluded.os_age_days, 0) <= 30 then 'MEDIA'
		else 'BAIXA'
	end`;
}

function routeOrderBy(sort, hasCoordinates) {
	if (sort === "oldest") {
		return "o.os_opened_at asc nulls last, o.priority_score desc";
	}
	if (sort === "distance" && hasCoordinates) {
		return "o.os_opened_at desc nulls last, distance_km asc nulls last, o.priority_score desc";
	}
	return "o.os_opened_at desc nulls last, o.priority_score desc, o.next_attempt_at nulls first";
}

function buildOpportunityResultUpdate({
	opportunityId,
	status,
	result,
	nextAttemptAt,
	attemptDelta,
}) {
	return {
		sql: `update tentativas_opportunities
		    set status = $2,
		        attempt_count = greatest(0, attempt_count + $5),
		        last_attempt_at = case when $5 > 0 then now() else last_attempt_at end,
		        last_result = $3,
		        next_attempt_at = $4,
		        responded_at = case when $2 in ('RESPONDED','SCHEDULED') then coalesce(responded_at, now()) else responded_at end,
		        scheduled_at = case when $2 = 'SCHEDULED' then coalesce(scheduled_at, now()) else scheduled_at end,
		        completed_at = case when $2 = 'COMPLETED' then coalesce(completed_at, now()) else completed_at end,
		        updated_at = now()
		  where id = $1`,
		params: [opportunityId, status, result, nextAttemptAt, attemptDelta],
	};
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
	let newOpportunities = [];
	try {
		await client.query("begin");
		await client.query(
			"select pg_advisory_xact_lock(hashtext($1))",
			["tentativas:opportunities-write"],
		);
		const inventoryResult = await client.query(
			`select
				(select count(*)::int from tentativas_opportunities where active = true) as active_total,
				(select count(*)::int
				   from ordens_servico
				  where source_collection = 'match_os_abertas'
				    and coalesce(num_os, '') <> ''
				    and coalesce(cidade, '') <> ''
				    and coalesce(tipo, '') ~* $1) as source_total`,
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
		const opportunityResult = await client.query(
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
		)
		insert into tentativas_opportunities (
			id, ordem_id, os, codigo_cliente, cliente, telefone, telefone_digits,
			cidade, cidade_normalizada, regional, empresa, tipo_os, bairro,
			equipment_count, latitude, longitude, origem,
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
			coalesce(
				nullif(trim(os.bairro), ''),
				nullif(trim(os.source_payload->>'bairro'), ''),
				nullif(trim(os.source_payload#>>'{endereco,bairro}'), '')
			),
			case
			  when jsonb_typeof(os.source_payload->'equipamentos') = 'array'
			    then greatest(jsonb_array_length(os.source_payload->'equipamentos'), 1)
			  else 1
			end,
			coalesce(
				os.latitude,
				case
				  when coalesce(os.source_payload->>'latitude', os.source_payload#>>'{endereco,latitude}', '') ~ '^-?[0-9]+([.,][0-9]+)?$'
				    then replace(coalesce(os.source_payload->>'latitude', os.source_payload#>>'{endereco,latitude}'), ',', '.')::numeric
				  else null
				end
			),
			coalesce(
				os.longitude,
				case
				  when coalesce(os.source_payload->>'longitude', os.source_payload#>>'{endereco,longitude}', '') ~ '^-?[0-9]+([.,][0-9]+)?$'
				    then replace(coalesce(os.source_payload->>'longitude', os.source_payload#>>'{endereco,longitude}'), ',', '.')::numeric
				  else null
				end
			),
			'match',
			coalesce(os.updated_at, now()),
			os.data_abertura,
			greatest(0, floor(extract(epoch from (now() - coalesce(os.data_abertura, now()))) / 86400)::int),
			'PENDING',
			case
				when os.data_abertura is null or os.data_abertura >= now() - interval '7 days' then 'ALTA'
				when os.data_abertura >= now() - interval '30 days' then 'MEDIA'
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
			bairro = coalesce(nullif(trim(excluded.bairro), ''), tentativas_opportunities.bairro),
			equipment_count = greatest(excluded.equipment_count, 1),
			latitude = coalesce(excluded.latitude, tentativas_opportunities.latitude),
			longitude = coalesce(excluded.longitude, tentativas_opportunities.longitude),
			match_entered_at = least(tentativas_opportunities.match_entered_at, excluded.match_entered_at),
			os_opened_at = excluded.os_opened_at,
			os_age_days = excluded.os_age_days,
			status = case
				when tentativas_opportunities.active = false
				 and tentativas_opportunities.removed_from_match_at is not null
				 and tentativas_opportunities.status = 'COMPLETED'
				then 'PENDING'
				else tentativas_opportunities.status
			end,
			last_result = case
				when tentativas_opportunities.active = false
				 and tentativas_opportunities.removed_from_match_at is not null
				 and tentativas_opportunities.status = 'COMPLETED'
				then null
				else tentativas_opportunities.last_result
			end,
			completed_at = case
				when tentativas_opportunities.active = false
				 and tentativas_opportunities.removed_from_match_at is not null
				 and tentativas_opportunities.status = 'COMPLETED'
				then null
				else tentativas_opportunities.completed_at
			end,
			priority = ${priorityExpression()},
			active = true,
			removed_from_match_at = null,
			source_payload = excluded.source_payload,
			updated_at = now()
		returning id, os, cidade, cidade_normalizada, (created_at = updated_at) as newly_inserted`,
			[WITHDRAWAL_ORDER_TYPE_REGEX, VALID_PHONE_DIGITS_REGEX],
		);
		newOpportunities = opportunityResult.rows.filter((row) => row.newly_inserted);
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
			newOpportunities,
		};
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function replenishReleasedAssignments(_releasedAssignments = []) {
	// A cidade inteira e a carteira do tecnico. Assignments antigos ficam apenas
	// como historico e nao devem mais provocar rateio ou reposicao automatica.
	return 0;
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
			.then(async (summary) => {
				const priority = await centralService.refreshPriorityScores({ limit: 2000 });
				const neighborhoodDistribution = await rebalanceCitiesForNewOpportunities(
					summary.newOpportunities || [],
				).catch((error) => {
					console.warn(
						"[tentativas] Oportunidades sincronizadas, mas a distribuicao por bairro falhou:",
						error?.message || error,
					);
					return [{ error: error?.message || String(error) }];
				});
				const opportunityAlerts = await alertsService
					.publishNewOpportunityAlerts(summary.newOpportunities || [])
					.catch((error) => ({ created: 0, error: error?.message || String(error) }));
				const notifications = await centralService
					.publishScheduledNotifications()
					.catch((error) => {
						console.warn(
							"[tentativas] Sincronizacao concluida, mas as notificacoes falharam:",
							error?.message || error,
						);
						return { callbacks: 0, alerts: 0, error: error?.message || String(error) };
					});
				opportunitiesLastSyncAt = Date.now();
				return { ok: true, ...summary, priority, neighborhoodDistribution, opportunityAlerts, notifications };
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
	rebalanceAllActiveCityNeighborhoods()
		.then((results) => {
			console.log(`[tentativas] Distribuicao por bairros inicializada em ${results.length} cidade(s).`);
		})
		.catch((error) => {
			console.error("[tentativas] Falha ao inicializar distribuicao por bairros:", error?.message || error);
		});
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
	const client = await db.connect();
	try {
		await client.query("begin");
		const currentResult = await client.query("select * from tentativas_settings where id = 'global' for update");
		const current = currentResult.rows[0] || {};
		const result = await client.query(
			`update tentativas_settings
			    set coverage_goal = $1,
			        min_interval_hours = $2,
			        max_attempts = $3,
			        default_campaign_size = $4,
			        allowed_start_time = $5,
			        allowed_end_time = $6,
			        contact_dedupe_hours = $7,
			        callback_grace_minutes = $8,
			        score_weights = $9::jsonb,
			        alert_thresholds = $10::jsonb,
			        result_options = $11::jsonb,
			        duplicate_policy = $12,
			        alert_settings = $13::jsonb,
			        version = version + 1,
			        updated_by = $14,
			        updated_at = now()
			  where id = 'global'
			  returning *`,
			[
				Number(payload.coverageGoal ?? payload.coverage_goal ?? current.coverage_goal ?? 90),
				Number(payload.minIntervalHours ?? payload.min_interval_hours ?? current.min_interval_hours ?? 12),
				Number(payload.maxAttempts ?? payload.max_attempts ?? current.max_attempts ?? 3),
				Number(payload.defaultCampaignSize ?? payload.default_campaign_size ?? current.default_campaign_size ?? 30),
				text(payload.allowedStartTime || payload.allowed_start_time || current.allowed_start_time || "08:00"),
				text(payload.allowedEndTime || payload.allowed_end_time || current.allowed_end_time || "18:00"),
				Number(payload.contactDedupeHours ?? payload.contact_dedupe_hours ?? current.contact_dedupe_hours ?? 12),
				Number(payload.callbackGraceMinutes ?? payload.callback_grace_minutes ?? current.callback_grace_minutes ?? 30),
				JSON.stringify(payload.scoreWeights || payload.score_weights || current.score_weights || {}),
				JSON.stringify(payload.alertThresholds || payload.alert_thresholds || current.alert_thresholds || {}),
				JSON.stringify(payload.resultOptions || payload.result_options || current.result_options || []),
				text(payload.duplicatePolicy || payload.duplicate_policy || current.duplicate_policy || "WARN").toUpperCase(),
				JSON.stringify({
					...alertsService.DEFAULT_SETTINGS,
					...(current.alert_settings || {}),
					...(payload.alertSettings || payload.alert_settings || {}),
				}),
				userId(user),
			],
		);
		const saved = result.rows[0];
		await client.query(
			`insert into tentativas_settings_versions (id, settings_id, version, snapshot, changed_by, change_reason)
			 values ($1,'global',$2,$3::jsonb,$4,$5)`,
			[id("tsv"), saved.version, JSON.stringify(saved), userId(user), text(payload.changeReason || payload.change_reason)],
		);
		await client.query("commit");
		await recordAudit("settings.update", "global", user, saved, current);
		return saved;
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
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
			   and o.status not in ('COMPLETED','CANCELLED','REFUSED','INVALID_PHONE','ALREADY_RETURNED','EQUIPMENT_UNAVAILABLE')
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

async function _legacyRebalanceCityAssignments(cidade, { force = false } = {}) {
	const normalizedCity = normalizeText(cidade);
	if (!normalizedCity) return { assigned: 0, released: 0, technicians: 0 };
	const client = await db.connect();
	try {
		await client.query("begin");
		await client.query("select pg_advisory_xact_lock(hashtext($1))", [
			`tentativas:${normalizedCity}`,
		]);
		const techniciansResult = await client.query(
			`select distinct on (coalesce(nullif(c.user_id, ''), lower(c.user_email)))
			        coalesce(nullif(c.user_id, ''), u.uid) as user_id,
			        lower(coalesce(nullif(c.user_email, ''), u.email)) as user_email,
			        coalesce(nullif(c.user_name, ''), u.display_name, u.email) as user_name
			   from tentativas_technician_cities c
			   join app_users u
			     on u.uid = c.user_id
			     or lower(u.email) = lower(coalesce(c.user_email, ''))
			  where c.active = true
			    and c.cidade_normalizada = $1
			    and (c.permanent = true or current_date between coalesce(c.valid_from, current_date) and coalesce(c.valid_until, current_date))
			    and lower(coalesce(u.role, '')) = 'tecnico'
			    and u.disabled = false
			  order by coalesce(nullif(c.user_id, ''), lower(c.user_email)), c.updated_at desc`,
			[normalizedCity],
		);
		const technicians = techniciansResult.rows;
		const releaseResult = await client.query(
			`update tentativas_assignments a
			    set released_at = now(),
			        release_reason = case
			          when $3::boolean and o.attempt_count = 0 and o.status in ('PENDING','CONTACT_STARTED') then 'CARTEIRA_REBALANCEADA'
			          else 'CARTEIRA_INVALIDA_OU_FINALIZADA'
			        end,
			        updated_at = now()
			   from tentativas_opportunities o
			  where a.opportunity_id = o.id
			    and a.released_at is null
			    and o.cidade_normalizada = $1
			    and (
			      o.active = false
			      or coalesce(o.telefone_digits, '') !~ $2
			      or o.status in ('COMPLETED','CANCELLED','REFUSED','INVALID_PHONE','ALREADY_RETURNED','EQUIPMENT_UNAVAILABLE')
			      or not exists (
			        select 1
			          from tentativas_technician_cities c
			          join app_users u
			            on u.uid = c.user_id
			            or lower(u.email) = lower(coalesce(c.user_email, ''))
			         where c.active = true
			           and c.cidade_normalizada = $1
			           and lower(coalesce(u.role, '')) = 'tecnico'
			           and u.disabled = false
			           and (c.user_id = a.technician_user_id or lower(coalesce(c.user_email, '')) = lower(coalesce(a.technician_email, '')))
			      )
			      or ($3::boolean and o.attempt_count = 0 and o.status in ('PENDING','CONTACT_STARTED'))
			    )`,
			[normalizedCity, VALID_PHONE_DIGITS_REGEX, force],
		);
		if (!technicians.length) {
			await client.query("commit");
			return { assigned: 0, released: releaseResult.rowCount, technicians: 0 };
		}
		const loadsResult = await client.query(
			`select a.technician_user_id, lower(coalesce(a.technician_email, '')) as technician_email, count(*)::int as total
			   from tentativas_assignments a
			   join tentativas_opportunities o on o.id = a.opportunity_id
			  where a.released_at is null and o.active = true and o.cidade_normalizada = $1
			  group by a.technician_user_id, lower(coalesce(a.technician_email, ''))`,
			[normalizedCity],
		);
		const candidatesResult = await client.query(
			`select o.id as opportunity_id, o.cidade
			   from tentativas_opportunities o
			  where o.active = true
			    and o.cidade_normalizada = $1
			    and coalesce(o.telefone_digits, '') ~ $2
			    and o.status not in ('COMPLETED','CANCELLED','REFUSED','INVALID_PHONE','ALREADY_RETURNED','EQUIPMENT_UNAVAILABLE')
			    and not exists (
			      select 1 from tentativas_assignments a
			       where a.opportunity_id = o.id and a.released_at is null
			    )
			  order by o.os_opened_at desc nulls last, o.priority_score desc, o.created_at desc`,
			[normalizedCity, VALID_PHONE_DIGITS_REGEX],
		);
		const assignments = buildBalancedAssignmentPlan(
			candidatesResult.rows,
			technicians,
			loadsResult.rows,
		);
		let assigned = 0;
		if (assignments.length) {
			const insertResult = await client.query(
				`insert into tentativas_assignments (
					id, opportunity_id, technician_user_id, technician_email,
					technician_name, cidade, assigned_by
				)
				select 'ta_' || encode(gen_random_bytes(12), 'hex'),
				       item.opportunity_id, item.user_id, item.email, item.name, item.cidade, 'DISTRIBUICAO_AUTOMATICA'
				  from jsonb_to_recordset($1::jsonb) as item(
				    opportunity_id text, user_id text, email text, name text, cidade text
				  )
				on conflict do nothing`,
				[JSON.stringify(assignments)],
			);
			assigned = insertResult.rowCount;
		}
		await client.query("commit");
		return { assigned, released: releaseResult.rowCount, technicians: technicians.length };
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function _legacyAutoClaimCity(_cidade) {
	return 0;
}

async function rebalanceCityNeighborhoods(cidade) {
	const cityKey = normalizeText(cidade);
	if (!cityKey) return { city: "", technicians: 0, neighborhoods: 0, opportunities: 0, distribution: [] };
	const client = await db.connect();
	try {
		await client.query("begin");
		await client.query("select pg_advisory_xact_lock(hashtext($1))", [
			`tentativas-distribuicao-bairros:${cityKey}`,
		]);
		const techniciansResult = await client.query(
			`select distinct on (coalesce(nullif(c.user_id, ''), lower(c.user_email)))
			        coalesce(nullif(c.user_id, ''), u.uid) as user_id,
			        lower(coalesce(nullif(c.user_email, ''), u.email)) as user_email,
			        coalesce(nullif(c.user_name, ''), u.display_name, u.email) as user_name
			   from tentativas_technician_cities c
			   join app_users u
			     on u.uid = c.user_id
			     or lower(u.email) = lower(coalesce(c.user_email, ''))
			  where c.active = true
			    and c.cidade_normalizada = $1
			    and (c.permanent = true or current_date between coalesce(c.valid_from, current_date) and coalesce(c.valid_until, current_date))
			    and lower(coalesce(u.role, '')) = 'tecnico'
			    and u.disabled = false
			  order by coalesce(nullif(c.user_id, ''), lower(c.user_email)), c.updated_at desc`,
			[cityKey],
		);
		const technicians = techniciansResult.rows;
		const neighborhoodsResult = await client.query(
			`select coalesce(nullif(${neighborhoodGroupExpression("o")}, ''), '__sem_bairro__') as group_key,
			        coalesce(min(nullif(trim(o.bairro), '')), 'Bairro nao informado') as bairro,
			        count(*)::int as opportunities
			   from tentativas_opportunities o
			  where o.active = true
			    and o.cidade_normalizada = $1
			    and coalesce(o.telefone_digits, '') ~ $2
			    and o.status not in ('COMPLETED','CANCELLED','REFUSED','INVALID_PHONE','ALREADY_RETURNED','EQUIPMENT_UNAVAILABLE')
			  group by coalesce(nullif(${neighborhoodGroupExpression("o")}, ''), '__sem_bairro__')`,
			[cityKey, VALID_PHONE_DIGITS_REGEX],
		);
		let preferredOwners = [];
		if (technicians.length && neighborhoodsResult.rowCount) {
			const activeUserIds = technicians.map((technician) => technician.user_id).filter(Boolean);
			const activeEmails = technicians.map((technician) => technician.user_email).filter(Boolean);
			const preferredResult = await client.query(
				`with ranked as (
				  select coalesce(nullif(${neighborhoodGroupExpression("o")}, ''), '__sem_bairro__') as group_key,
				         c.technician_user_id,
				         lower(coalesce(tc.user_email, u.email, '')) as technician_email,
				         max(c.created_at) as last_contact_at,
				         count(*)::int as contacts,
				         row_number() over (
				           partition by coalesce(nullif(${neighborhoodGroupExpression("o")}, ''), '__sem_bairro__')
				           order by max(c.created_at) desc, count(*) desc, c.technician_user_id
				         ) as owner_order
				    from tentativas_contacts c
				    join tentativas_opportunities o on o.id = c.opportunity_id
				    left join tentativas_technician_cities tc
				      on tc.cidade_normalizada = o.cidade_normalizada and tc.user_id = c.technician_user_id and tc.active = true
				    left join app_users u on u.uid = c.technician_user_id
				   where o.cidade_normalizada = $1
				     and (c.technician_user_id = any($2::text[]) or lower(coalesce(tc.user_email, u.email, '')) = any($3::text[]))
				   group by coalesce(nullif(${neighborhoodGroupExpression("o")}, ''), '__sem_bairro__'),
				            c.technician_user_id, lower(coalesce(tc.user_email, u.email, ''))
				)
				select * from ranked where owner_order = 1`,
				[cityKey, activeUserIds, activeEmails],
			);
			preferredOwners = preferredResult.rows;
		}
		if (technicians.length && neighborhoodsResult.rowCount) {
			const overrideResult = await client.query(
				`select o.bairro_grupo as group_key,
				        o.technician_user_id,
				        lower(coalesce(o.technician_email, u.email, '')) as technician_email,
				        'MANUAL'::text as preference_source
				   from tentativas_neighborhood_overrides o
				   join app_users u
				     on u.uid = o.technician_user_id
				     or lower(u.email) = lower(coalesce(o.technician_email, ''))
				  where o.cidade_normalizada = $1
				    and lower(coalesce(u.role, '')) = 'tecnico'
				    and u.disabled = false
				    and exists (
				      select 1
				        from tentativas_technician_cities c
				       where c.active = true
				         and c.cidade_normalizada = o.cidade_normalizada
				         and (c.user_id = u.uid or lower(c.user_email) = lower(u.email))
				         and (c.permanent = true or current_date between coalesce(c.valid_from, current_date) and coalesce(c.valid_until, current_date))
				    )`,
				[cityKey],
			);
			// A preferencia manual vem por ultimo para substituir o historico de contato.
			preferredOwners = [...preferredOwners, ...overrideResult.rows];
		}
		const plan = buildNeighborhoodDistributionPlan(
			neighborhoodsResult.rows,
			technicians,
			preferredOwners,
		);
		await client.query(
			"delete from tentativas_neighborhood_locks where cidade_normalizada = $1",
			[cityKey],
		);
		if (plan.length) {
			await client.query(
				`insert into tentativas_neighborhood_locks (
					cidade_normalizada, bairro_grupo, technician_user_id,
					technician_email, technician_name
				)
				select $1, item.group_key, item.user_id, item.email, item.name
				  from jsonb_to_recordset($2::jsonb) as item(
				    group_key text, user_id text, email text, name text
				  )`,
				[cityKey, JSON.stringify(plan)],
			);
		}
		await client.query("commit");
		const distribution = technicians.map((technician) => {
			const ownerKey = technicianIdentity(technician);
			const owned = plan.filter((item) => technicianIdentity({ user_id: item.user_id, user_email: item.email }) === ownerKey);
			return {
				technicianUserId: technician.user_id,
				technicianName: technician.user_name,
				neighborhoods: owned.length,
				opportunities: owned.reduce((total, item) => total + item.opportunities, 0),
			};
		});
		return {
			city: text(cidade),
			cityKey,
			technicians: technicians.length,
			neighborhoods: plan.length,
			opportunities: plan.reduce((total, item) => total + item.opportunities, 0),
			distribution,
		};
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function rebalanceCitiesForNewOpportunities(opportunities = []) {
	const cities = [...new Map(
		opportunities
			.map((item) => [normalizeText(item.cidade), text(item.cidade)])
			.filter(([cityKey]) => cityKey),
	).values()];
	const results = [];
	for (const city of cities) {
		results.push(await rebalanceCityNeighborhoods(city));
	}
	return results;
}

async function rebalanceAllActiveCityNeighborhoods() {
	await db.query(
		`update tentativas_technician_cities c
		    set active = false, updated_at = now()
		  where c.active = true
		    and not exists (
		      select 1
		        from app_users u
		       where (u.uid = c.user_id or lower(u.email) = lower(coalesce(c.user_email, '')))
		         and lower(coalesce(u.role, '')) = 'tecnico'
		         and u.disabled = false
		    )`,
	);
	const citiesResult = await db.query(
		`select distinct on (cidade_normalizada) cidade
		   from tentativas_technician_cities
		  where active = true
		    and (permanent = true or current_date between coalesce(valid_from, current_date) and coalesce(valid_until, current_date))
		  order by cidade_normalizada, updated_at desc`,
	);
	const results = [];
	for (const row of citiesResult.rows) {
		results.push(await rebalanceCityNeighborhoods(row.cidade));
	}
	return results;
}

async function selectNeighborhood(cidade, bairro, user = {}) {
	if (hasAdminAccess(user)) return { admin: true, locked: false };
	const cityKey = normalizeText(cidade);
	const groupKey = normalizeNeighborhoodGroup(bairro);
	if (!cityKey) return { locked: false };
	if (!(await ensureTechnicianCanUseCity(cidade, user))) {
		const error = new Error("Cidade nao autorizada para este tecnico.");
		error.statusCode = 403;
		throw error;
	}
	if (!groupKey) return { locked: false, allNeighborhoods: true };
	const current = await db.query(
		`select * from tentativas_neighborhood_claims
		  where cidade_normalizada = $1 and bairro_grupo = $2 and expires_at > now()
		  limit 1`,
		[cityKey, groupKey],
	);
	const owner = current.rows[0];
	if (!owner) {
		const error = new Error("Solicite este bairro antes de iniciar as tratativas.");
		error.statusCode = 409;
		throw error;
	}
	if (owner.technician_user_id !== userId(user) && owner.technician_email !== userEmail(user)) {
		const error = new Error(`Bairro reservado por ${owner.technician_name || "outro tecnico"} ate ${owner.expires_at}.`);
		error.statusCode = 409;
		throw error;
	}
	return { locked: true, groupKey, owner: owner.technician_name, expiresAt: owner.expires_at };
}

async function requestNeighborhood(payload = {}, user = {}) {
	if (hasAdminAccess(user)) {
		const error = new Error("Apenas tecnicos podem solicitar bairros.");
		error.statusCode = 403;
		throw error;
	}
	const city = text(payload.cidade || payload.city);
	const cityKey = normalizeText(city);
	const groupKey = normalizeNeighborhoodGroup(payload.bairroGrupo || payload.groupKey || payload.bairro);
	const hours = normalizeNeighborhoodClaimHours(payload.hours ?? payload.horas);
	if (!cityKey || !groupKey) {
		const error = new Error("Informe a cidade e o bairro.");
		error.statusCode = 400;
		throw error;
	}
	if (!(await ensureTechnicianCanUseCity(city, user))) {
		const error = new Error("Cidade nao autorizada para este tecnico.");
		error.statusCode = 403;
		throw error;
	}
	const client = await db.connect();
	let claim;
	try {
		await client.query("begin");
		await client.query("select pg_advisory_xact_lock(hashtext($1))", [
			`tentativas-bairro:${cityKey}:${groupKey}`,
		]);
		const current = await client.query(
			`select * from tentativas_neighborhood_claims
			  where cidade_normalizada = $1 and bairro_grupo = $2 and expires_at > now()
			  for update`,
			[cityKey, groupKey],
		);
		const owner = current.rows[0];
		if (owner && owner.technician_user_id !== userId(user) && owner.technician_email !== userEmail(user)) {
			const error = new Error(`Bairro reservado por ${owner.technician_name || "outro tecnico"}.`);
			error.statusCode = 409;
			throw error;
		}
		const result = await client.query(
			`insert into tentativas_neighborhood_claims (
				cidade_normalizada, bairro_grupo, technician_user_id,
				technician_email, technician_name, requested_at, expires_at
			) values ($1,$2,$3,$4,$5,now(),now() + ($6::int * interval '1 hour'))
			on conflict (cidade_normalizada, bairro_grupo) do update set
				technician_user_id = excluded.technician_user_id,
				technician_email = excluded.technician_email,
				technician_name = excluded.technician_name,
				requested_at = excluded.requested_at,
				expires_at = excluded.expires_at
			returning *`,
			[cityKey, groupKey, userId(user), userEmail(user), userName(user), hours],
		);
		claim = result.rows[0];
		await client.query("commit");
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
	await recordAudit("neighborhood.claim", `${cityKey}:${groupKey}`, user, { hours, expiresAt: claim.expires_at });
	return { city, groupKey, hours, expiresAt: claim.expires_at, technicianName: claim.technician_name };
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
		bairro: row.bairro,
		empresa: row.empresa,
		tipoOs: row.tipo_os,
		status: row.status,
		priority: row.priority,
		priorityScore: Number(row.priority_score || 0),
		priorityFactors: row.priority_factors || [],
		recommendedAction: row.recommended_action || "",
		equipmentCount: Number(row.equipment_count || 0),
		estimatedValue: row.estimated_value == null ? null : Number(row.estimated_value),
		latitude: row.latitude == null ? null : Number(row.latitude),
		longitude: row.longitude == null ? null : Number(row.longitude),
		contactRestricted: Boolean(row.contact_restricted),
		contactRestrictionReason: row.contact_restriction_reason || "",
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
	await selectNeighborhood(cidade, query.bairro, user);
	const page = normalizePage(query.page);
	const limit = normalizeLimit(query.limit, 30, 100);
	const latitude = Number(query.latitude);
	const longitude = Number(query.longitude);
	const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
	const search = text(query.q || query.search);
	const bairro = normalizeNeighborhoodGroup(query.bairro);
	const priority = text(query.priority).toUpperCase();
	const statusFilter = text(query.status).toUpperCase();
	const sort = text(query.sort).toLowerCase();
	const orderBy = routeOrderBy(sort, hasCoordinates);
	const result = await db.query(
		`select o.*, null::text as assignment_id, null::text as technician_name,
		        count(*) over() as total_count,
		        count(*) filter (where o.status in ('PENDING','CONTACT_STARTED')) over() as pending_count,
		        count(*) filter (where o.attempt_count > 0) over() as worked_count,
		        count(*) filter (where o.status in ('RESPONDED','CALLBACK_REQUESTED')) over() as responded_count,
		        count(*) filter (where o.status = 'SCHEDULED') over() as scheduled_count,
		        case when $8::boolean and o.latitude is not null and o.longitude is not null then
		          6371 * 2 * asin(sqrt(
		            power(sin(radians((o.latitude::double precision - $6::double precision) / 2)), 2) +
		            cos(radians($6::double precision)) * cos(radians(o.latitude::double precision)) *
		            power(sin(radians((o.longitude::double precision - $7::double precision) / 2)), 2)
		          ))
		        else null end as distance_km
		   from tentativas_opportunities o
		  where o.active = true
		    and coalesce(o.telefone_digits, '') ~ $5
		    and o.cidade_normalizada = $1
		    and o.status not in ('COMPLETED','CANCELLED','REFUSED','INVALID_PHONE','ALREADY_RETURNED','EQUIPMENT_UNAVAILABLE')
		    and ($12::boolean = true or not exists (
		      select 1
		        from tentativas_neighborhood_claims active_claim
		       where active_claim.cidade_normalizada = o.cidade_normalizada
		         and active_claim.bairro_grupo = coalesce(nullif(${neighborhoodGroupExpression("o")}, ''), '__sem_bairro__')
		         and active_claim.expires_at > now()
		    ) or exists (
		      select 1
		        from tentativas_neighborhood_claims own_claim
		       where own_claim.cidade_normalizada = o.cidade_normalizada
		         and own_claim.bairro_grupo = coalesce(nullif(${neighborhoodGroupExpression("o")}, ''), '__sem_bairro__')
		         and own_claim.expires_at > now()
		         and (own_claim.technician_user_id = $13 or lower(coalesce(own_claim.technician_email, '')) = $14)
		    ))
		    and (
		      $2::text = ''
		      or ($2 = '__sem_bairro__' and nullif(trim(o.bairro),'') is null)
		      or ${neighborhoodGroupExpression("o")} = $2
		    )
		    and ($3::text = '' or o.priority = $3)
		    and ($4::text = '' or o.status = $4)
		    and ($9::text = '' or o.cliente ilike '%' || $9 || '%' or o.codigo_cliente ilike '%' || $9 || '%' or o.os ilike '%' || $9 || '%' or o.bairro ilike '%' || $9 || '%')
		  order by ${orderBy}
		  limit $10 offset $11`,
		[
			normalizeText(cidade),
			bairro,
			priority,
			statusFilter,
			VALID_PHONE_DIGITS_REGEX,
			hasCoordinates ? latitude : null,
			hasCoordinates ? longitude : null,
			hasCoordinates,
			search,
			limit,
			(page - 1) * limit,
			hasAdminAccess(user),
			userId(user),
			userEmail(user),
		],
	);
	const items = result.rows.map((row) => ({
		...mapOpportunity(row),
		distanceKm: row.distance_km == null ? null : Number(Number(row.distance_km).toFixed(2)),
	}));
	const counters = result.rows[0] || {};
	return {
		city: cidade,
		summary: {
			total: Number(counters.total_count || 0),
			pending: Number(counters.pending_count || 0),
			worked: Number(counters.worked_count || 0),
			responded: Number(counters.responded_count || 0),
			scheduled: Number(counters.scheduled_count || 0),
		},
		page,
		limit,
		total: Number(counters.total_count || 0),
		locationApplied: hasCoordinates,
		items,
	};
}

async function listNeighborhoods(query = {}, user = {}) {
	const cidade = text(query.cidade);
	if (!cidade) return { city: "", items: [] };
	if (!(await ensureTechnicianCanUseCity(cidade, user))) {
		const error = new Error("Cidade nao autorizada para este tecnico.");
		error.statusCode = 403;
		throw error;
	}
	const admin = hasAdminAccess(user);
	const latitude = Number(query.latitude);
	const longitude = Number(query.longitude);
	const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
	const result = await db.query(
		`select coalesce(nullif(${neighborhoodGroupExpression("o")}, ''), '__sem_bairro__') as group_key,
		        coalesce(min(nullif(trim(o.bairro),'')), 'Bairro nao informado') as bairro,
		        coalesce(
		          array_agg(distinct trim(o.bairro) order by trim(o.bairro)) filter (where nullif(trim(o.bairro), '') is not null),
		          array[]::text[]
		        ) as original_values,
		        count(*)::int as opportunities,
		        count(*) filter (where o.attempt_count=0)::int as pending,
		        avg(o.latitude)::double precision as latitude,
		        avg(o.longitude)::double precision as longitude,
		        case when $4::boolean and avg(o.latitude) is not null and avg(o.longitude) is not null then
		          6371 * 2 * asin(sqrt(
		            power(sin(radians((avg(o.latitude)::double precision - $2::double precision) / 2)), 2) +
		            cos(radians($2::double precision)) * cos(radians(avg(o.latitude)::double precision)) *
		            power(sin(radians((avg(o.longitude)::double precision - $3::double precision) / 2)), 2)
		          ))
		        else null end as distance_km,
		        max(claim.technician_user_id) is not null as locked,
		        bool_or(claim.technician_user_id = $5 or lower(coalesce(claim.technician_email, '')) = $7) as locked_by_me,
		        max(claim.technician_name) as lock_owner_name,
		        max(claim.expires_at) as lock_expires_at
		   from tentativas_opportunities o
		   left join tentativas_neighborhood_claims claim
		     on claim.cidade_normalizada = o.cidade_normalizada
		    and claim.bairro_grupo = coalesce(nullif(${neighborhoodGroupExpression("o")}, ''), '__sem_bairro__')
		    and claim.expires_at > now()
		  where o.active=true and o.cidade_normalizada=$1
		    and coalesce(o.telefone_digits, '') ~ $6
		    and o.status not in ('COMPLETED','CANCELLED','REFUSED','INVALID_PHONE','ALREADY_RETURNED','EQUIPMENT_UNAVAILABLE')
		  group by coalesce(nullif(${neighborhoodGroupExpression("o")}, ''), '__sem_bairro__')
		  order by distance_km asc nulls last, opportunities desc, bairro asc`,
		[normalizeText(cidade), hasCoordinates ? latitude : null, hasCoordinates ? longitude : null, hasCoordinates, userId(user), VALID_PHONE_DIGITS_REGEX, userEmail(user)],
	);
	return {
		city: cidade,
		locationApplied: hasCoordinates,
		items: result.rows.map((row) => ({
			groupKey: row.group_key,
			bairro: row.bairro,
			originalValues: row.original_values || [],
			opportunities: Number(row.opportunities || 0),
			pending: Number(row.pending || 0),
			latitude: row.latitude == null ? null : Number(row.latitude),
			longitude: row.longitude == null ? null : Number(row.longitude),
			distanceKm: row.distance_km == null ? null : Number(Number(row.distance_km).toFixed(2)),
			locked: !admin && Boolean(row.locked),
			lockedByMe: Boolean(row.locked_by_me),
			lockOwnerName: row.lock_owner_name || "",
			lockExpiresAt: row.lock_expires_at || null,
		})),
	};
}

async function findAssignmentForUser(opportunityId, user = {}, client = db) {
	const result = await client.query(
		`select o.*,
		        o.id as opportunity_id,
		        a.id as assignment_id,
		        coalesce(a.technician_user_id, $3) as technician_user_id,
		        coalesce(a.technician_email, $4) as technician_email,
		        coalesce(a.technician_name, $5) as technician_name,
		        a.assigned_at,
		        a.released_at
		   from tentativas_opportunities o
		   left join tentativas_assignments a
		     on a.opportunity_id = o.id
		    and a.released_at is null
		    and (a.technician_user_id = $3 or lower(coalesce(a.technician_email, '')) = $4)
		  where o.id = $1
		    and ($2::boolean = true or exists (
		      select 1
		        from tentativas_technician_cities c
		        join app_users u on u.uid = c.user_id or lower(u.email) = lower(coalesce(c.user_email, ''))
		       where c.active = true
		         and c.cidade_normalizada = o.cidade_normalizada
		         and (c.permanent = true or current_date between coalesce(c.valid_from, current_date) and coalesce(c.valid_until, current_date))
		         and (c.user_id = $3 or lower(coalesce(c.user_email, '')) = $4)
		         and lower(coalesce(u.role, '')) = 'tecnico'
		         and u.disabled = false
		    ))
		    and ($2::boolean = true or not exists (
		      select 1
		        from tentativas_neighborhood_claims active_claim
		       where active_claim.cidade_normalizada = o.cidade_normalizada
		         and active_claim.bairro_grupo = coalesce(nullif(${neighborhoodGroupExpression("o")}, ''), '__sem_bairro__')
		         and active_claim.expires_at > now()
		    ) or exists (
		      select 1
		        from tentativas_neighborhood_claims own_claim
		       where own_claim.cidade_normalizada = o.cidade_normalizada
		         and own_claim.bairro_grupo = coalesce(nullif(${neighborhoodGroupExpression("o")}, ''), '__sem_bairro__')
		         and own_claim.expires_at > now()
		         and (own_claim.technician_user_id = $3 or lower(coalesce(own_claim.technician_email, '')) = $4)
		    ))
		  limit 1
		  for update of o`,
		[opportunityId, hasAdminAccess(user), userId(user), userEmail(user), userName(user)],
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
		const contactPolicy = await centralService.assertContactAllowed(
			client,
			row,
			user,
			payload.override === true,
		);
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
		await centralService.recordContactStarted(client, {
			opportunity: row,
			assignmentId: row.assignment_id,
			contactId,
			user,
			payload: {
				channel: "WHATSAPP",
				attemptNumber,
				templateId: template?.id || null,
				warnings: contactPolicy.warnings,
			},
		});
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
			warnings: contactPolicy.warnings,
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
			`select c.*, o.os, o.codigo_cliente, o.cliente, o.cidade, o.id as opportunity_id
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
		if (!hasAdminAccess(user) && contact.technician_user_id !== userId(user)) {
			const error = new Error("Tentativa nao pertence a este usuario.");
			error.statusCode = 403;
			throw error;
		}
		const wasConfirmed = contact.sent_confirmed === true;
		const attemptDelta = sentConfirmed === wasConfirmed ? 0 : sentConfirmed ? 1 : -1;
		const requestedCallbackAt = payload.callbackAt || payload.callback_at || null;
		const nextAttemptAt = sentConfirmed && ["CALLBACK_REQUESTED", "RESPONDED_CALLBACK"].includes(result) && requestedCallbackAt
			? new Date(requestedCallbackAt).toISOString()
			: sentConfirmed && result === "NO_RESPONSE"
				? new Date(Date.now() + Number(settings.min_interval_hours || 12) * 3600 * 1000).toISOString()
				: null;
		const status = sentConfirmed ? RESULT_TO_STATUS[result] || "CONTACTED" : "PENDING";
		const effectiveContact = sentConfirmed && [
			"RESPONDED", "RESPONDED_SCHEDULE", "STORE_DELIVERY", "RESPONDED_CALLBACK",
			"CALLBACK_REQUESTED", "SCHEDULED", "REFUSED", "ALREADY_RETURNED",
		].includes(result);
		const contactState = !sentConfirmed
			? "STARTED"
			: ["NO_RESPONSE", "INVALID_PHONE", "UNAVAILABLE_PHONE", "EQUIPMENT_NOT_FOUND", "EQUIPMENT_UNAVAILABLE"].includes(result)
				? "INCONCLUSIVE"
				: ["SCHEDULED", "RESPONDED_SCHEDULE"].includes(result)
					? "SCHEDULED"
					: ["ALREADY_RETURNED", "COMPLETED", "CANCELLED"].includes(result)
						? "CLOSED"
						: effectiveContact ? "EFFECTIVE" : "RESULT_RECORDED";
		await client.query(
			`update tentativas_contacts
			    set sent_confirmed = $2,
			        result = $3,
			        status = case when $2 = true then 'CONFIRMED' else 'NOT_SENT' end,
			        observation = $4,
			        confirmed_at = now(),
			        declared_sent_at = case when $2 = true then coalesce(declared_sent_at, now()) else null end,
			        response_at = case when $6 = true then coalesce(response_at, now()) else response_at end,
			        contact_state = $7,
			        effective_contact = $6,
			        channel = $8,
			        metadata = coalesce(metadata, '{}'::jsonb) || $9::jsonb,
			        next_attempt_at = $5,
			        updated_at = now()
			  where id = $1`,
			[
				contactId,
				sentConfirmed,
				result,
				observation,
				nextAttemptAt,
				effectiveContact,
				contactState,
				text(payload.channel || contact.channel || "WHATSAPP").toUpperCase(),
				JSON.stringify({ declaredByTechnician: sentConfirmed, modality: payload.recoveryModality || payload.recovery_modality || null }),
			],
		);
		const opportunityUpdate = buildOpportunityResultUpdate({
			opportunityId: contact.opportunity_id,
			status,
			result,
			nextAttemptAt,
			attemptDelta,
		});
		await client.query(opportunityUpdate.sql, opportunityUpdate.params);
		const artifacts = await centralService.recordResultArtifacts(client, {
			contact,
			assignment,
			result,
			payload: { ...payload, sentConfirmed },
			user,
		});
		await client.query("commit");
		await recordAudit("contact.result", contactId, user, {
			opportunityId: contact.opportunity_id,
			result,
			status,
			sentConfirmed,
		});
		await centralService.notifyResultArtifacts(artifacts, contact, user).catch((error) => {
			console.warn("[tentativas] Falha ao criar notificacao de retorno:", error?.message || error);
		});
		return {
			ok: true,
			status,
			contactState,
			effectiveContact,
			nextAttemptAt,
			callback: artifacts.callback,
			recovery: artifacts.recovery,
		};
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function getOpportunity(idValue, user = {}) {
	const item = await findAssignmentForUser(idValue, user);
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
		filters.push(`(o.cliente ilike $${index} or o.codigo_cliente ilike $${index} or o.os ilike $${index} or o.telefone ilike $${index} or o.cidade ilike $${index} or c.technician_name ilike $${index} or c.phone ilike $${index})`);
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
	if (query.technicianId) {
		params.push(text(query.technicianId));
		index += 1;
		filters.push(`c.technician_user_id = $${index}`);
	}
	if (query.resultado) {
		params.push(text(query.resultado));
		index += 1;
		filters.push(`coalesce(c.result, c.event_type) = $${index}`);
	}
	if (query.startDate) {
		params.push(text(query.startDate));
		index += 1;
		filters.push(`c.created_at >= $${index}::date`);
	}
	if (query.endDate) {
		params.push(text(query.endDate));
		index += 1;
		filters.push(`c.created_at < ($${index}::date + interval '1 day')`);
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
		`with technician_scope as (
			select distinct user_id as technician_user_id,
			       nullif(user_name, '') as technician_name,
			       cidade_normalizada
			  from tentativas_technician_cities
			 where active = true
			   and (permanent = true or current_date between coalesce(valid_from, current_date) and coalesce(valid_until, current_date))
		), technicians as (
			select technician_user_id, max(technician_name) as technician_name
			  from technician_scope group by technician_user_id
		)
		select coalesce(t.technician_user_id, 'sem_tecnico') as technician_id,
		        coalesce(t.technician_name, 'Sem tecnico') as technician_name,
		        count(distinct o.id) as opportunities,
		        count(distinct c.opportunity_id) filter (where c.sent_confirmed) as worked,
		        count(c.id) filter (where c.sent_confirmed) as attempts,
		        count(distinct c.opportunity_id) filter (where c.effective_contact) as responded,
		        count(distinct c.opportunity_id) filter (where c.result in ('SCHEDULED','RESPONDED_SCHEDULE')) as scheduled,
		        count(distinct c.opportunity_id) filter (where c.result = 'COMPLETED') as completed
		   from technicians t
		   left join technician_scope s on s.technician_user_id = t.technician_user_id
		   left join tentativas_neighborhood_locks l
		     on l.cidade_normalizada = s.cidade_normalizada
		    and l.technician_user_id = t.technician_user_id
		   left join tentativas_opportunities o
		     on o.cidade_normalizada = s.cidade_normalizada
		    and coalesce(nullif(${neighborhoodGroupExpression("o")}, ''), '__sem_bairro__') = l.bairro_grupo
		    and o.active = true
		    and coalesce(o.telefone_digits, '') ~ $1
		    and o.status not in ('COMPLETED','CANCELLED','REFUSED','INVALID_PHONE','ALREADY_RETURNED','EQUIPMENT_UNAVAILABLE')
		   left join tentativas_contacts c
		     on c.opportunity_id = o.id and c.technician_user_id = t.technician_user_id
		  group by t.technician_user_id, t.technician_name
		  order by worked desc, attempts desc
		  limit 100`,
		[VALID_PHONE_DIGITS_REGEX],
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
		`with distribution_keys as (
			select distinct user_id as technician_user_id,
			       user_email as technician_email,
			       user_name as technician_name,
			       cidade,
			       cidade_normalizada
			  from tentativas_technician_cities
			 where active = true
			   and (permanent = true or current_date between coalesce(valid_from, current_date) and coalesce(valid_until, current_date))
		), opportunity_counts as materialized (
			select o.cidade_normalizada,
			       coalesce(nullif(${neighborhoodGroupExpression("o")}, ''), '__sem_bairro__') as bairro_grupo,
			       count(*)::int as opportunities,
			       count(*) filter (where o.attempt_count > 0)::int as worked,
			       count(*) filter (where o.attempt_count = 0)::int as pending
			  from tentativas_opportunities o
			 where o.active = true
			   and coalesce(o.telefone_digits, '') ~ $1
			   and o.status not in ('COMPLETED','CANCELLED','REFUSED','INVALID_PHONE','ALREADY_RETURNED','EQUIPMENT_UNAVAILABLE')
			 group by o.cidade_normalizada,
			          coalesce(nullif(${neighborhoodGroupExpression("o")}, ''), '__sem_bairro__')
		)
		select k.technician_user_id, k.technician_name, k.cidade,
		        count(distinct l.bairro_grupo)::int as neighborhoods,
		        coalesce(sum(o.opportunities), 0)::int as opportunities,
		        coalesce(sum(o.worked), 0)::int as worked,
		        coalesce(sum(o.pending), 0)::int as pending
		   from distribution_keys k
		   left join tentativas_neighborhood_locks l
		     on l.cidade_normalizada = k.cidade_normalizada
		    and (l.technician_user_id = k.technician_user_id or lower(coalesce(l.technician_email, '')) = lower(coalesce(k.technician_email, '')))
		   left join opportunity_counts o
		     on o.cidade_normalizada = k.cidade_normalizada
		    and o.bairro_grupo = l.bairro_grupo
		  group by k.technician_user_id, k.technician_name, k.cidade
		  order by k.technician_name, k.cidade
		  limit 500`,
		[VALID_PHONE_DIGITS_REGEX],
	);
	return {
		items: result.rows.map((row) => ({
			...row,
			neighborhoods: Number(row.neighborhoods || 0),
			opportunities: Number(row.opportunities || 0),
			worked: Number(row.worked || 0),
			pending: Number(row.pending || 0),
			coverage: percent(row.worked, row.opportunities),
		})),
	};
}

async function listNeighborhoodAssignments(query = {}) {
	const city = text(query.cidade || query.city);
	if (!city) {
		const error = new Error("Informe a cidade.");
		error.statusCode = 400;
		throw error;
	}
	const cityKey = normalizeText(city);
	const locksResult = await db.query(
		"select 1 from tentativas_neighborhood_locks where cidade_normalizada = $1 limit 1",
		[cityKey],
	);
	if (!locksResult.rowCount) await rebalanceCityNeighborhoods(city);
	const [techniciansResult, neighborhoodsResult] = await Promise.all([
		db.query(
			`select distinct on (coalesce(nullif(c.user_id, ''), lower(c.user_email)))
			        coalesce(nullif(c.user_id, ''), u.uid) as user_id,
			        lower(coalesce(nullif(c.user_email, ''), u.email)) as user_email,
			        coalesce(nullif(c.user_name, ''), u.display_name, u.email) as user_name
			   from tentativas_technician_cities c
			   join app_users u
			     on u.uid = c.user_id or lower(u.email) = lower(coalesce(c.user_email, ''))
			  where c.active = true
			    and c.cidade_normalizada = $1
			    and (c.permanent = true or current_date between coalesce(c.valid_from, current_date) and coalesce(c.valid_until, current_date))
			    and lower(coalesce(u.role, '')) = 'tecnico'
			    and u.disabled = false
			  order by coalesce(nullif(c.user_id, ''), lower(c.user_email)), c.updated_at desc`,
			[cityKey],
		),
		db.query(
			`select l.bairro_grupo,
			        coalesce(min(nullif(trim(o.bairro), '')), 'Bairro nao informado') as bairro,
			        l.technician_user_id,
			        l.technician_email,
			        l.technician_name,
			        count(o.id)::int as opportunities,
			        count(o.id) filter (where o.attempt_count > 0)::int as worked,
			        count(o.id) filter (where o.attempt_count = 0)::int as pending,
			        (ov.bairro_grupo is not null) as manual
			   from tentativas_neighborhood_locks l
			   left join tentativas_neighborhood_overrides ov
			     on ov.cidade_normalizada = l.cidade_normalizada
			    and ov.bairro_grupo = l.bairro_grupo
			   left join tentativas_opportunities o
			     on o.cidade_normalizada = l.cidade_normalizada
			    and coalesce(nullif(${neighborhoodGroupExpression("o")}, ''), '__sem_bairro__') = l.bairro_grupo
			    and o.active = true
			    and coalesce(o.telefone_digits, '') ~ $2
			    and o.status not in ('COMPLETED','CANCELLED','REFUSED','INVALID_PHONE','ALREADY_RETURNED','EQUIPMENT_UNAVAILABLE')
			  where l.cidade_normalizada = $1
			  group by l.bairro_grupo, l.technician_user_id, l.technician_email,
			           l.technician_name, ov.bairro_grupo
			  order by bairro asc`,
			[cityKey, VALID_PHONE_DIGITS_REGEX],
		),
	]);
	return {
		city,
		technicians: techniciansResult.rows.map((row) => ({
			userId: row.user_id,
			userEmail: row.user_email,
			userName: row.user_name,
		})),
		items: neighborhoodsResult.rows.map((row) => ({
			groupKey: row.bairro_grupo,
			bairro: row.bairro,
			technicianUserId: row.technician_user_id,
			technicianEmail: row.technician_email,
			technicianName: row.technician_name,
			opportunities: Number(row.opportunities || 0),
			worked: Number(row.worked || 0),
			pending: Number(row.pending || 0),
			manual: Boolean(row.manual),
		})),
	};
}

async function transferNeighborhood(payload = {}, user = {}) {
	const city = text(payload.cidade || payload.city);
	const cityKey = normalizeText(city);
	const groupKey = normalizeNeighborhoodGroup(payload.bairroGrupo || payload.groupKey || payload.bairro);
	const targetUserId = text(payload.technicianUserId || payload.userId);
	if (!cityKey || !groupKey || !targetUserId) {
		const error = new Error("Informe cidade, bairro e tecnico de destino.");
		error.statusCode = 400;
		throw error;
	}
	const client = await db.connect();
	let before = null;
	let target = null;
	try {
		await client.query("begin");
		await client.query("select pg_advisory_xact_lock(hashtext($1))", [
			`tentativas-distribuicao-bairros:${cityKey}`,
		]);
		const currentResult = await client.query(
			`select * from tentativas_neighborhood_locks
			  where cidade_normalizada = $1 and bairro_grupo = $2
			  for update`,
			[cityKey, groupKey],
		);
		before = currentResult.rows[0];
		if (!before) {
			const error = new Error("Bairro nao encontrado na distribuicao desta cidade.");
			error.statusCode = 404;
			throw error;
		}
		const targetResult = await client.query(
			`select u.uid as user_id, lower(u.email) as user_email,
			        coalesce(u.display_name, u.email) as user_name
			   from app_users u
			  where u.uid = $1
			    and u.disabled = false
			    and lower(coalesce(u.role, '')) = 'tecnico'
			    and exists (
			      select 1 from tentativas_technician_cities c
			       where c.active = true and c.cidade_normalizada = $2
			         and (c.user_id = u.uid or lower(c.user_email) = lower(u.email))
			         and (c.permanent = true or current_date between coalesce(c.valid_from, current_date) and coalesce(c.valid_until, current_date))
			    )
			  limit 1`,
			[targetUserId, cityKey],
		);
		target = targetResult.rows[0];
		if (!target) {
			const error = new Error("O tecnico precisa estar ativo e associado a esta cidade.");
			error.statusCode = 400;
			throw error;
		}
		await client.query(
			`insert into tentativas_neighborhood_overrides (
				cidade_normalizada, bairro_grupo, technician_user_id,
				technician_email, technician_name, assigned_by, assigned_by_name
			) values ($1,$2,$3,$4,$5,$6,$7)
			on conflict (cidade_normalizada, bairro_grupo) do update set
				technician_user_id = excluded.technician_user_id,
				technician_email = excluded.technician_email,
				technician_name = excluded.technician_name,
				assigned_by = excluded.assigned_by,
				assigned_by_name = excluded.assigned_by_name,
				updated_at = now()`,
			[cityKey, groupKey, target.user_id, target.user_email, target.user_name, userId(user), userName(user)],
		);
		await client.query(
			`update tentativas_neighborhood_locks
			    set technician_user_id = $3, technician_email = $4,
			        technician_name = $5, updated_at = now()
			  where cidade_normalizada = $1 and bairro_grupo = $2`,
			[cityKey, groupKey, target.user_id, target.user_email, target.user_name],
		);
		await client.query("commit");
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
	const distribution = await rebalanceCityNeighborhoods(city);
	const result = {
		city,
		groupKey,
		technicianUserId: target.user_id,
		technicianEmail: target.user_email,
		technicianName: target.user_name,
		distribution,
	};
	await recordAudit("neighborhood.transfer", `${cityKey}:${groupKey}`, user, result, before || {});
	return result;
}

async function saveTechnicianCity(payload = {}, user = {}) {
	const city = text(payload.cidade);
	if (!city) {
		const error = new Error("Informe a cidade.");
		error.statusCode = 400;
		throw error;
	}
	const technicianResult = await db.query(
		`select uid, email, display_name, role
		   from app_users
		  where disabled = false
		    and (uid = $1 or lower(email) = $2)
		  limit 1`,
		[text(payload.userId), text(payload.userEmail).toLowerCase()],
	);
	const technician = technicianResult.rows[0];
	if (!technician || normalizeText(technician.role) !== "tecnico") {
		const error = new Error("Apenas usuarios com o cargo Tecnico podem possuir carteira de cidade.");
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
			technician.uid,
			text(technician.email).toLowerCase(),
			text(technician.display_name || technician.email),
			city,
			normalizeText(city),
			payload.validFrom || null,
			payload.validUntil || null,
			payload.permanent !== false,
			userId(user),
		],
	);
	const association = result.rows[0] || null;
	const distribution = await rebalanceCityNeighborhoods(city);
	await recordAudit("city.assign", city, user, payload);
	if (association) {
		await alertsService.publishCityAssignmentAlert(association, user).catch((error) => {
			console.warn("[tentativas] Falha ao avisar associacao de cidade:", error?.message || error);
		});
	}
	return {
		...(association || { ok: true }),
		assigned: distribution.opportunities,
		mode: "NEIGHBORHOOD_BALANCED",
		distribution,
	};
}

async function removeTechnicianCity(idValue, user = {}) {
	const result = await db.query(
		"update tentativas_technician_cities set active = false, updated_at = now() where id = $1 and active = true returning cidade, cidade_normalizada, user_id",
		[idValue],
	);
	const association = result.rows[0];
	if (!association) {
		const error = new Error("Associacao de cidade nao encontrada.");
		error.statusCode = 404;
		throw error;
	}
	await db.query(
		`delete from tentativas_neighborhood_overrides
		  where cidade_normalizada = $1 and technician_user_id = $2`,
		[association.cidade_normalizada, association.user_id],
	);
	const distribution = await rebalanceCityNeighborhoods(association.cidade);
	await recordAudit("city.remove", idValue, user, { active: false });
	return { ok: true, distribution };
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
		    and lower(coalesce(role, '')) = 'tecnico'
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
	const client = await db.connect();
	try {
		await client.query("begin");
		const previousResult = await client.query("select * from tentativas_templates where id=$1 for update", [templateId]);
		const previous = previousResult.rows[0] || null;
		const result = await client.query(
			`insert into tentativas_templates (
				id, name, body, attempt_number, active, is_default, created_by, updated_by, version
			) values ($1,$2,$3,$4,$5,$6,$7,$7,1)
			on conflict (id) do update set
				name = excluded.name,
				body = excluded.body,
				attempt_number = excluded.attempt_number,
				active = excluded.active,
				is_default = excluded.is_default,
				updated_by = excluded.updated_by,
				version = tentativas_templates.version + 1,
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
		const saved = result.rows[0];
		await client.query(
			`insert into tentativas_template_versions (id,template_id,version,snapshot,changed_by,change_reason)
			 values ($1,$2,$3,$4::jsonb,$5,$6)`,
			[id("ttv"), templateId, saved.version, JSON.stringify(saved), userId(user), text(payload.changeReason || payload.change_reason)],
		);
		await client.query("commit");
		await recordAudit("template.save", templateId, user, saved, previous || {});
		return saved;
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
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
		WITHDRAWAL_ORDER_TYPE_REGEX,
		buildBalancedAssignmentPlan,
		buildNeighborhoodDistributionPlan,
		buildWhatsappUrls,
		buildOpportunityResultUpdate,
		routeOrderBy,
		firstName,
		firstValidPhone,
		formatCustomerIdentification,
		normalizeNeighborhoodGroup,
		normalizeNeighborhoodClaimHours,
		normalizePhone,
		renderTemplate,
	},
	CAMPAIGN_PERMISSIONS,
	CONTACT_PERMISSIONS,
	CORRECTION_PERMISSIONS,
	DISTRIBUTE_PERMISSIONS,
	EXECUTE_PERMISSIONS,
	EXPORT_PERMISSIONS,
	HISTORY_PERMISSIONS,
	MANAGEMENT_PERMISSIONS,
	OVERRIDE_PERMISSIONS,
	PORTFOLIO_PERMISSIONS,
	REGISTER_PERMISSIONS,
	SCHEDULE_PERMISSIONS,
	AUDIT_PERMISSIONS,
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
	listNeighborhoodAssignments,
	listHistory,
	listNeighborhoods,
	listTechnicianCities,
	searchUsers,
	listTemplates,
	removeTechnicianCity,
	requestNeighborhood,
	rebalanceAllActiveCityNeighborhoods,
	rebalanceCityNeighborhoods,
	saveResult,
	saveSettings,
	saveTechnicianCity,
	saveTemplate,
	startOpportunitiesReconciliationWorker,
	startContact,
	stopOpportunitiesReconciliationWorker,
	syncOpportunitiesFromMatch,
	transferNeighborhood,
};
