const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const db = require("../db");
const { createNotification } = require("../notificationsService");

const RECOVERY_TRANSITIONS = Object.freeze({
	AWAITING_DEFINITION: ["AWAITING_SCHEDULE", "STORE_DELIVERY_EXPECTED", "NOT_RECOVERED", "CLOSED_EXCEPTION"],
	AWAITING_SCHEDULE: ["COLLECTION_SCHEDULED", "STORE_DELIVERY_EXPECTED", "NOT_RECOVERED", "CLOSED_EXCEPTION"],
	COLLECTION_SCHEDULED: ["AWAITING_EXECUTION", "AWAITING_CONFIRMATION", "NOT_RECOVERED", "CLOSED_EXCEPTION"],
	STORE_DELIVERY_EXPECTED: ["AWAITING_CONFIRMATION", "NOT_RECOVERED", "CLOSED_EXCEPTION"],
	AWAITING_EXECUTION: ["AWAITING_CONFIRMATION", "PARTIALLY_RECOVERED", "NOT_RECOVERED", "CLOSED_EXCEPTION"],
	AWAITING_CONFIRMATION: ["PARTIALLY_RECOVERED", "RECOVERY_CONFIRMED", "NOT_RECOVERED", "CLOSED_EXCEPTION"],
	PARTIALLY_RECOVERED: ["AWAITING_CONFIRMATION", "RECOVERY_CONFIRMED", "NOT_RECOVERED", "CLOSED_EXCEPTION"],
	RECOVERY_CONFIRMED: [],
	NOT_RECOVERED: ["AWAITING_DEFINITION"],
	CLOSED_EXCEPTION: ["AWAITING_DEFINITION"],
});

const EFFECTIVE_RESULTS = new Set([
	"RESPONDED_SCHEDULE",
	"STORE_DELIVERY",
	"CALLBACK_REQUESTED",
	"REFUSED",
	"ALREADY_RETURNED",
	"SCHEDULED",
	"RESPONDED",
]);

const RESULT_STATUS = Object.freeze({
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
	COMPLETED: "COMPLETED",
	CANCELLED: "CANCELLED",
	OTHER: "CONTACTED",
});

function id(prefix) {
	return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function text(value) {
	return String(value ?? "").trim();
}

function normalizeText(value) {
	return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function normalizeEquipmentIdentifier(value) {
	return text(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
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

function hasPermission(user = {}, permission) {
	const permissions = new Set(user.permissions || user.profile?.permissions || []);
	return permissions.has("*") || permissions.has(permission);
}

function canManage(user = {}) {
	return hasPermission(user, "tentativas.carteiras.gerenciar") || hasPermission(user, "tentativas.distribuir");
}

function normalizeLimit(value, fallback = 20, max = 100) {
	const parsed = Number(value || fallback);
	return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), max) : fallback;
}

function normalizePage(value) {
	const parsed = Number(value || 1);
	return Number.isFinite(parsed) ? Math.max(Math.trunc(parsed), 1) : 1;
}

function parseJson(value, fallback = {}) {
	if (!value) return fallback;
	if (typeof value === "object") return value;
	try {
		return JSON.parse(value);
	} catch {
		return fallback;
	}
}

function clamp(value, min = 0, max = 100) {
	return Math.min(Math.max(Number(value) || 0, min), max);
}

function safeRate(numerator, denominator) {
	const total = Number(denominator || 0);
	if (total <= 0) return 0;
	return Number(((Number(numerator || 0) / total) * 100).toFixed(1));
}

function buildSequentialFunnel(values = {}) {
	const population = Math.max(Number(values.population || 0), 0);
	const worked = Math.min(Math.max(Number(values.worked || 0), 0), population);
	const effective = Math.min(Math.max(Number(values.effective || 0), 0), worked);
	const scheduled = Math.min(Math.max(Number(values.scheduled || 0), 0), effective);
	const completed = Math.min(Math.max(Number(values.completed || 0), 0), scheduled);
	const stages = [
		["opportunities", "Oportunidades", population],
		["worked", "Trabalhadas", worked],
		["effective", "Contatos efetivos", effective],
		["scheduled", "Agendamentos", scheduled],
		["completed", "Retiradas concluídas", completed],
	];
	return stages.map(([key, label, value], index) => ({
		key,
		label,
		value,
		fromPreviousRate: index === 0 ? 100 : safeRate(value, stages[index - 1][2]),
		fromPopulationRate: index === 0 ? 100 : safeRate(value, population),
	}));
}

function csvCell(value) {
	const content = value == null ? "" : String(value);
	return `"${content.replace(/"/g, '""')}"`;
}

function csvRow(values) {
	return values.map(csvCell).join(";");
}

function calculatePriorityScore(opportunity = {}, weightsValue = {}) {
	const weights = {
		osAge: Number(weightsValue.osAge ?? 25),
		equipment: Number(weightsValue.equipment ?? 20),
		attemptHistory: Number(weightsValue.attemptHistory ?? 15),
		responseHistory: Number(weightsValue.responseHistory ?? 15),
		pendingCallback: Number(weightsValue.pendingCallback ?? 15),
		timeWithoutContact: Number(weightsValue.timeWithoutContact ?? 10),
	};
	const totalWeight = Math.max(Object.values(weights).reduce((sum, value) => sum + Math.max(value, 0), 0), 1);
	const factors = [];
	const add = (key, label, ratio, detail) => {
		const contribution = (clamp(ratio, 0, 1) * Math.max(weights[key] || 0, 0) * 100) / totalWeight;
		if (contribution > 0) factors.push({ key, label, contribution: Number(contribution.toFixed(1)), detail });
		return contribution;
	};

	const osAgeDays = Math.max(Number(opportunity.os_age_days || opportunity.osAgeDays || 0), 0);
	const equipmentCount = Math.max(Number(opportunity.equipment_count || opportunity.equipmentCount || 1), 0);
	const attemptCount = Math.max(Number(opportunity.attempt_count || opportunity.attemptCount || 0), 0);
	const lastAttemptAt = opportunity.last_attempt_at || opportunity.lastAttemptAt;
	const hoursWithoutContact = lastAttemptAt
		? Math.max((Date.now() - new Date(lastAttemptAt).getTime()) / 3_600_000, 0)
		: Math.max(osAgeDays * 24, 24);
	const lastResult = text(opportunity.last_result || opportunity.lastResult).toUpperCase();
	const callbackDue = Boolean(opportunity.callback_due || opportunity.callbackDue);

	let score = 0;
	score += add(
		"osAge",
		"Recencia da O.S.",
		Math.max(0, 1 - osAgeDays / 60),
		`${osAgeDays} dia(s) em aberto`,
	);
	score += add("equipment", "Equipamentos pendentes", equipmentCount / 3, `${equipmentCount} equipamento(s)`);
	score += add("attemptHistory", "Historico de tentativas", attemptCount === 0 ? 1 : Math.max(0, 1 - attemptCount / 5), attemptCount ? `${attemptCount} tentativa(s)` : "Sem tentativa");
	score += add("responseHistory", "Historico de resposta", ["RESPONDED", "CALLBACK_REQUESTED", "SCHEDULED"].includes(lastResult) ? 1 : 0, lastResult || "Sem resposta registrada");
	score += add("pendingCallback", "Retorno programado", callbackDue ? 1 : 0, callbackDue ? "Retorno vencido ou para hoje" : "Sem retorno vencido");
	score += add("timeWithoutContact", "Tempo sem contato", hoursWithoutContact / (24 * 14), `${Math.floor(hoursWithoutContact)} hora(s)`);

	const rounded = Number(clamp(score).toFixed(1));
	const priority = callbackDue ? "RETORNO_AGENDADO" : rounded >= 75 ? "CRITICA" : rounded >= 55 ? "ALTA" : rounded >= 30 ? "MEDIA" : "BAIXA";
	const recommendedAction = callbackDue
		? "Realizar o retorno combinado"
		: attemptCount === 0
			? "Realizar o primeiro contato"
			: lastResult === "NO_RESPONSE"
				? "Tentar novo contato no horario permitido"
				: "Revisar historico e definir proxima acao";
	return { score: rounded, priority, factors: factors.sort((a, b) => b.contribution - a.contribution), recommendedAction };
}

function assertRecoveryTransition(currentStatus, nextStatus) {
	const current = text(currentStatus).toUpperCase();
	const next = text(nextStatus).toUpperCase();
	if (current === next) return true;
	if (!RECOVERY_TRANSITIONS[current]?.includes(next)) {
		const error = new Error(`Transicao de recuperacao invalida: ${current} para ${next}.`);
		error.statusCode = 409;
		throw error;
	}
	return true;
}

async function addEvent(client, {
	opportunityId,
	assignmentId = null,
	contactId = null,
	callbackId = null,
	recoveryId = null,
	eventType,
	user = {},
	payload = {},
}) {
	const eventId = id("tev");
	await client.query(
		`insert into tentativas_events (
			id, opportunity_id, assignment_id, contact_id, callback_id, recovery_id,
			event_type, actor_user_id, actor_name, payload
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
		[eventId, opportunityId, assignmentId, contactId, callbackId, recoveryId, eventType, userId(user), userName(user), JSON.stringify(payload)],
	);
	return eventId;
}

async function refreshPriorityScores({ opportunityId = "", limit = 500 } = {}) {
	const settingsResult = await db.query("select score_weights from tentativas_settings where id = 'global'");
	const weights = parseJson(settingsResult.rows[0]?.score_weights, {});
	const rows = await db.query(
		`select o.*,
		        exists (
		          select 1 from tentativas_callbacks cb
		           where cb.opportunity_id = o.id and cb.status = 'PENDING' and cb.scheduled_at <= now() + interval '1 day'
		        ) as callback_due
		   from tentativas_opportunities o
		  where o.active = true and ($1::text = '' or o.id = $1)
		  order by o.updated_at desc
		  limit $2`,
		[text(opportunityId), normalizeLimit(limit, 500, 2000)],
	);
	const client = await db.connect();
	try {
		await client.query("begin");
		for (const row of rows.rows) {
			const calculated = calculatePriorityScore(row, weights);
			await client.query(
				`update tentativas_opportunities
				    set priority_score = $2, priority = $3, priority_factors = $4::jsonb,
				        recommended_action = $5, last_scored_at = now(), updated_at = now()
				  where id = $1`,
				[row.id, calculated.score, calculated.priority, JSON.stringify(calculated.factors), calculated.recommendedAction],
			);
		}
		await client.query("commit");
		return { updated: rows.rowCount };
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function assertContactAllowed(client, opportunity, user = {}, override = false) {
	if (!opportunity.active || opportunity.contact_restricted) {
		const error = new Error(opportunity.contact_restriction_reason || "Contato bloqueado para esta oportunidade.");
		error.statusCode = 409;
		throw error;
	}
	const settingsResult = await client.query("select * from tentativas_settings where id = 'global'");
	const settings = settingsResult.rows[0] || {};
	const duplicate = await client.query(
		`select c.id, c.technician_name, c.created_at
		   from tentativas_contacts c
		  where c.opportunity_id = $1
		    and c.created_at >= now() - make_interval(hours => $2::int)
		    and c.technician_user_id <> $3
		  order by c.created_at desc limit 1`,
		[opportunity.opportunity_id || opportunity.id, Number(settings.contact_dedupe_hours || 12), userId(user)],
	);
	const pendingCallback = await client.query(
		`select id, scheduled_at from tentativas_callbacks
		  where opportunity_id = $1 and status = 'PENDING' order by scheduled_at asc limit 1`,
		[opportunity.opportunity_id || opportunity.id],
	);
	const warnings = [];
	if (duplicate.rows[0]) warnings.push(`Contato recente de ${duplicate.rows[0].technician_name || "outro tecnico"}.`);
	if (pendingCallback.rows[0]) warnings.push("Existe retorno programado para este cliente.");
	if (warnings.length && normalizeText(settings.duplicate_policy) === "block" && !override) {
		const error = new Error(warnings.join(" "));
		error.statusCode = 409;
		error.code = "DUPLICATE_CONTACT";
		throw error;
	}
	return { warnings, settings };
}

async function recordContactStarted(client, { opportunity, assignmentId, contactId, user, payload = {} }) {
	return addEvent(client, {
		opportunityId: opportunity.opportunity_id || opportunity.id,
		assignmentId,
		contactId,
		eventType: "CONTACT_STARTED",
		user,
		payload,
	});
}

function callbackDate(payload = {}) {
	const raw = payload.callbackAt || payload.callback_at || payload.returnAt || payload.return_at;
	if (!raw) return null;
	const value = new Date(raw);
	return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

async function recordResultArtifacts(client, { contact, result, payload = {}, user = {} }) {
	const normalizedResult = text(result).toUpperCase();
	const eventPayload = {
		result: normalizedResult,
		sentConfirmed: payload.sentConfirmed === true || payload.sent_confirmed === true,
		channel: text(payload.channel || contact.channel || "WHATSAPP"),
		observation: text(payload.observation || payload.observacao).slice(0, 500),
	};
	await addEvent(client, {
		opportunityId: contact.opportunity_id,
		assignmentId: contact.assignment_id,
		contactId: contact.id,
		eventType: "CONTACT_RESULT_RECORDED",
		user,
		payload: eventPayload,
	});

	let callback = null;
	const scheduledAt = callbackDate(payload);
	if (["CALLBACK_REQUESTED", "RESPONDED_CALLBACK"].includes(normalizedResult)) {
		if (!scheduledAt) {
			const error = new Error("Informe a data e o horario do retorno solicitado.");
			error.statusCode = 400;
			throw error;
		}
		const callbackId = id("tcb");
		const callbackResult = await client.query(
			`insert into tentativas_callbacks (
				id, opportunity_id, contact_id, technician_user_id, technician_email,
				technician_name, scheduled_at, preferred_channel, observation, created_by
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
			[callbackId, contact.opportunity_id, contact.id, userId(user), userEmail(user), userName(user), scheduledAt, text(payload.preferredChannel || payload.preferred_channel || "WHATSAPP"), eventPayload.observation, userId(user)],
		);
		callback = callbackResult.rows[0];
		await addEvent(client, {
			opportunityId: contact.opportunity_id,
			assignmentId: contact.assignment_id,
			contactId: contact.id,
			callbackId,
			eventType: "CALLBACK_SCHEDULED",
			user,
			payload: { scheduledAt, preferredChannel: callback.preferred_channel },
		});
	}

	let recovery = null;
	const recoveryModality = text(payload.recoveryModality || payload.recovery_modality).toUpperCase();
	if (recoveryModality || ["RESPONDED_SCHEDULE", "STORE_DELIVERY", "SCHEDULED", "ALREADY_RETURNED"].includes(normalizedResult)) {
		const modality = recoveryModality || (["STORE_DELIVERY", "ALREADY_RETURNED"].includes(normalizedResult) ? "STORE_DELIVERY" : "TECHNICIAN_COLLECTION");
		const recoveryId = id("trc");
		const initialStatus = normalizedResult === "ALREADY_RETURNED"
			? "AWAITING_CONFIRMATION"
			: modality === "STORE_DELIVERY" ? "STORE_DELIVERY_EXPECTED" : scheduledAt ? "COLLECTION_SCHEDULED" : "AWAITING_SCHEDULE";
		const recoveryResult = await client.query(
			`insert into tentativas_recoveries (
				id, opportunity_id, contact_id, modality, status, scheduled_at,
				service_window, store_commitment_at, observation, created_by, updated_by
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) returning *`,
			[recoveryId, contact.opportunity_id, contact.id, modality, initialStatus, scheduledAt, text(payload.serviceWindow || payload.service_window), modality === "STORE_DELIVERY" ? scheduledAt : null, eventPayload.observation, userId(user)],
		);
		recovery = recoveryResult.rows[0];
		await addEvent(client, {
			opportunityId: contact.opportunity_id,
			assignmentId: contact.assignment_id,
			contactId: contact.id,
			recoveryId,
			eventType: "RECOVERY_CREATED",
			user,
			payload: { modality, status: initialStatus, scheduledAt },
		});
	}
	return {
		callback,
		recovery,
		effectiveContact: EFFECTIVE_RESULTS.has(normalizedResult),
	};
}

async function notifyResultArtifacts(artifacts = {}, opportunity = {}, user = {}) {
	if (artifacts.callback) {
		await createNotification({
			type: "geral",
			title: "Retorno de cliente programado",
			message: `${opportunity.cliente || "Cliente"} deve ser contatado no horario combinado.`,
			targetPath: `/tentativas?tab=callbacks&opportunity=${encodeURIComponent(opportunity.id || opportunity.opportunity_id)}`,
			severity: "info",
			user,
			targets: { users: [userId(user)] },
			meta: { opportunityId: opportunity.id || opportunity.opportunity_id, callbackId: artifacts.callback.id },
			dedupeKey: `tentativas-callback-${artifacts.callback.id}`,
		});
	}
}

async function listCallbacks(query = {}, user = {}) {
	const page = normalizePage(query.page);
	const limit = normalizeLimit(query.limit, 20, 100);
	const params = [canManage(user), userId(user), userEmail(user)];
	const filters = [];
	let index = params.length;
	if (query.status) { params.push(text(query.status).toUpperCase()); filters.push(`cb.status = $${++index}`); }
	if (query.period === "overdue") filters.push("cb.status = 'PENDING' and cb.scheduled_at < now()");
	if (query.period === "today") filters.push("cb.scheduled_at::date = current_date");
	if (query.period === "upcoming") filters.push("cb.status = 'PENDING' and cb.scheduled_at > now()");
	const where = filters.length ? `and ${filters.join(" and ")}` : "";
	params.push(limit, (page - 1) * limit);
	const result = await db.query(
		`select count(*) over() as total_count, cb.*, o.os, o.codigo_cliente, o.cliente,
		        o.telefone, o.cidade, o.bairro, o.priority, o.priority_score
		   from tentativas_callbacks cb
		   join tentativas_opportunities o on o.id = cb.opportunity_id
		  where ($1::boolean = true or cb.technician_user_id = $2 or lower(coalesce(cb.technician_email,'')) = $3)
		    ${where}
		  order by (cb.status = 'PENDING' and cb.scheduled_at < now()) desc, cb.scheduled_at asc
		  limit $${index + 1} offset $${index + 2}`,
		params,
	);
	return { items: result.rows, page, limit, total: Number(result.rows[0]?.total_count || 0) };
}

async function createCallback(opportunityId, payload = {}, user = {}) {
	const scheduledAt = callbackDate(payload);
	if (!scheduledAt) {
		const error = new Error("Informe a data e o horario do retorno.");
		error.statusCode = 400;
		throw error;
	}
	const client = await db.connect();
	try {
		await client.query("begin");
		const scope = await client.query(
			`select o.*,a.id assignment_id,a.technician_user_id,a.technician_email,a.technician_name
			 from tentativas_opportunities o join tentativas_assignments a on a.opportunity_id=o.id and a.released_at is null
			 where o.id=$1 and ($2::boolean=true or a.technician_user_id=$3 or lower(coalesce(a.technician_email,''))=$4) for update of o`,
			[opportunityId, canManage(user), userId(user), userEmail(user)],
		);
		const opportunity = scope.rows[0];
		if (!opportunity) { const error = new Error("Oportunidade nao encontrada ou nao autorizada."); error.statusCode = 404; throw error; }
		const callbackId = id("tcb");
		const result = await client.query(
			`insert into tentativas_callbacks (id,opportunity_id,technician_user_id,technician_email,technician_name,scheduled_at,preferred_channel,observation,created_by)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
			[callbackId, opportunityId, opportunity.technician_user_id, opportunity.technician_email, opportunity.technician_name, scheduledAt, text(payload.preferredChannel || payload.preferred_channel || "WHATSAPP"), text(payload.observation), userId(user)],
		);
		await client.query("update tentativas_opportunities set status='CALLBACK_REQUESTED',next_attempt_at=$2,updated_at=now() where id=$1", [opportunityId, scheduledAt]);
		await addEvent(client, { opportunityId, assignmentId: opportunity.assignment_id, callbackId, eventType: "CALLBACK_SCHEDULED", user, payload: { scheduledAt, preferredChannel: result.rows[0].preferred_channel } });
		await client.query("commit");
		await notifyResultArtifacts({ callback: result.rows[0] }, opportunity, user).catch(() => {});
		return result.rows[0];
	} catch (error) { await client.query("rollback").catch(() => {}); throw error; } finally { client.release(); }
}

async function updateCallback(callbackId, payload = {}, user = {}) {
	const client = await db.connect();
	try {
		await client.query("begin");
		const found = await client.query("select * from tentativas_callbacks where id = $1 for update", [callbackId]);
		const callback = found.rows[0];
		if (!callback) { const error = new Error("Retorno nao encontrado."); error.statusCode = 404; throw error; }
		if (!canManage(user) && callback.technician_user_id !== userId(user) && text(callback.technician_email).toLowerCase() !== userEmail(user)) {
			const error = new Error("Retorno nao pertence a este usuario."); error.statusCode = 403; throw error;
		}
		const status = text(payload.status || callback.status).toUpperCase();
		const scheduledAt = callbackDate(payload) || callback.scheduled_at;
		const targetUserId = canManage(user) ? text(payload.technicianUserId || payload.technician_user_id || callback.technician_user_id) : callback.technician_user_id;
		const result = await client.query(
			`update tentativas_callbacks set status=$2, scheduled_at=$3, observation=$4,
			 technician_user_id=$5, technician_email=$6, technician_name=$7,
			 transferred_from=case when technician_user_id <> $5 then technician_user_id else transferred_from end,
			 completed_at=case when $2='COMPLETED' then now() else completed_at end,
			 completed_by=case when $2='COMPLETED' then $8 else completed_by end, updated_at=now()
			 where id=$1 returning *`,
			[callbackId, status, scheduledAt, text(payload.observation || callback.observation), targetUserId, text(payload.technicianEmail || payload.technician_email || callback.technician_email).toLowerCase(), text(payload.technicianName || payload.technician_name || callback.technician_name), userId(user)],
		);
		await addEvent(client, { opportunityId: callback.opportunity_id, contactId: callback.contact_id, callbackId, eventType: status === "COMPLETED" ? "CALLBACK_COMPLETED" : "CALLBACK_UPDATED", user, payload: result.rows[0] });
		await client.query("commit");
		return result.rows[0];
	} catch (error) { await client.query("rollback").catch(() => {}); throw error; } finally { client.release(); }
}

async function correctContact(contactId, payload = {}, user = {}) {
	const reason = text(payload.reason || payload.correctionReason || payload.correction_reason);
	if (reason.length < 5) {
		const error = new Error("Informe uma justificativa para a correção.");
		error.statusCode = 400;
		throw error;
	}
	const client = await db.connect();
	try {
		await client.query("begin");
		const found = await client.query("select * from tentativas_contacts where id=$1 for update", [contactId]);
		const current = found.rows[0];
		if (!current) { const error = new Error("Tentativa nao encontrada."); error.statusCode = 404; throw error; }
		const nextResult = text(payload.result || current.result).toUpperCase();
		const effectiveContact = payload.effectiveContact === true || EFFECTIVE_RESULTS.has(nextResult);
		const result = await client.query(
			`update tentativas_contacts set result=$2,observation=$3,effective_contact=$4,
			 correction_reason=$5,corrected_by=$6,metadata=coalesce(metadata,'{}'::jsonb) || $7::jsonb,updated_at=now()
			 where id=$1 returning *`,
			[contactId, nextResult, text(payload.observation || current.observation), effectiveContact, reason, userId(user), JSON.stringify({ correctedAt: new Date().toISOString(), previousResult: current.result })],
		);
		await client.query(
			`update tentativas_opportunities
			    set last_result=$2,status=$3,updated_at=now()
			  where id=$1`,
			[
				current.opportunity_id,
				nextResult,
				RESULT_STATUS[nextResult] || "CONTACTED",
			],
		);
		await addEvent(client, { opportunityId: current.opportunity_id, assignmentId: current.assignment_id, contactId, eventType: "CONTACT_CORRECTED", user, payload: { reason, before: { result: current.result, observation: current.observation, effectiveContact: current.effective_contact }, after: { result: nextResult, observation: result.rows[0].observation, effectiveContact } } });
		await client.query("commit");
		return result.rows[0];
	} catch (error) { await client.query("rollback").catch(() => {}); throw error; } finally { client.release(); }
}

async function listTimeline(opportunityId, user = {}) {
	const scope = await db.query(
		`select o.id from tentativas_opportunities o
		 left join tentativas_assignments a on a.opportunity_id=o.id and a.released_at is null
		 where o.id=$1 and ($2::boolean=true or a.technician_user_id=$3 or lower(coalesce(a.technician_email,''))=$4)`,
		[opportunityId, canManage(user), userId(user), userEmail(user)],
	);
	if (!scope.rowCount) { const error = new Error("Oportunidade nao encontrada ou nao autorizada."); error.statusCode = 404; throw error; }
	const result = await db.query(
		`select * from (
		 select id, event_type, actor_user_id, actor_name, payload, occurred_at,
		        contact_id, callback_id, recovery_id
		 from tentativas_events where opportunity_id=$1
		 union all
		 select c.id, 'LEGACY_CONTACT'::text, c.technician_user_id, c.technician_name,
		        jsonb_build_object('result',c.result,'status',c.status,'channel',c.channel,'observation',c.observation),
		        c.created_at, c.id, null::text, null::text
		 from tentativas_contacts c where c.opportunity_id=$1
		 and not exists (select 1 from tentativas_events e where e.contact_id=c.id)
		 union all
		 select cb.id, 'CALLBACK_IMPORTED'::text, cb.technician_user_id, cb.technician_name,
		        jsonb_build_object('status',cb.status,'scheduledAt',cb.scheduled_at,'channel',cb.preferred_channel),
		        cb.created_at, cb.contact_id, cb.id, null::text
		 from tentativas_callbacks cb where cb.opportunity_id=$1
		 and not exists (select 1 from tentativas_events e where e.callback_id=cb.id)
		 union all
		 select r.id, 'RECOVERY_IMPORTED'::text, r.created_by, r.created_by,
		        jsonb_build_object('status',r.status,'modality',r.modality,'evidenceReference',r.evidence_reference),
		        r.created_at, r.contact_id, null::text, r.id
		 from tentativas_recoveries r where r.opportunity_id=$1
		 and not exists (select 1 from tentativas_events e where e.recovery_id=r.id)
		 ) timeline order by occurred_at desc, id desc`,
		[opportunityId],
	);
	return { items: result.rows };
}

async function listRecoveries(query = {}, user = {}) {
	const page = normalizePage(query.page);
	const limit = normalizeLimit(query.limit, 20, 100);
	const params = [canManage(user), userId(user), userEmail(user)];
	const filters = [];
	let index = params.length;
	if (query.status) { params.push(text(query.status).toUpperCase()); filters.push(`r.status=$${++index}`); }
	if (query.modalidade) { params.push(text(query.modalidade).toUpperCase()); filters.push(`r.modality=$${++index}`); }
	params.push(limit, (page - 1) * limit);
	const result = await db.query(
		`select count(*) over() total_count, r.*, o.os, o.codigo_cliente, o.cliente, o.cidade, o.bairro,
		        a.technician_user_id, a.technician_email, a.technician_name,
		        coalesce(sum(e.quantity) filter (where e.status='CONFIRMED'),0) recovered_equipment
		 from tentativas_recoveries r join tentativas_opportunities o on o.id=r.opportunity_id
		 left join tentativas_assignments a on a.opportunity_id=o.id and a.released_at is null
		 left join tentativas_recovery_equipments e on e.recovery_id=r.id
		 where ($1::boolean=true or a.technician_user_id=$2 or lower(coalesce(a.technician_email,''))=$3)
		 ${filters.length ? `and ${filters.join(" and ")}` : ""}
		 group by r.id,o.id,a.id order by r.updated_at desc limit $${index + 1} offset $${index + 2}`,
		params,
	);
	return { items: result.rows, page, limit, total: Number(result.rows[0]?.total_count || 0) };
}

async function updateRecovery(recoveryId, payload = {}, user = {}) {
	const client = await db.connect();
	try {
		await client.query("begin");
		const found = await client.query(
			`select r.*, a.technician_user_id, a.technician_email from tentativas_recoveries r
			 left join tentativas_assignments a on a.opportunity_id=r.opportunity_id and a.released_at is null
			 where r.id=$1 for update of r`, [recoveryId],
		);
		const recovery = found.rows[0];
		if (!recovery) { const error = new Error("Recuperacao nao encontrada."); error.statusCode = 404; throw error; }
		if (!canManage(user) && recovery.technician_user_id !== userId(user) && text(recovery.technician_email).toLowerCase() !== userEmail(user)) {
			const error = new Error("Recuperacao nao pertence a este usuario."); error.statusCode = 403; throw error;
		}
		const status = text(payload.status).toUpperCase();
		assertRecoveryTransition(recovery.status, status);
		if (status === "RECOVERY_CONFIRMED" && !text(payload.evidenceReference || payload.evidence_reference || recovery.evidence_reference)) {
			const error = new Error("Informe a evidencia real da devolucao antes de confirmar a recuperacao."); error.statusCode = 400; throw error;
		}
		const equipments = Array.isArray(payload.equipments)
			? payload.equipments.filter((item) => text(item?.type || item?.equipmentType || item?.macSerial))
			: [];
		if (status === "RECOVERY_CONFIRMED" && !equipments.length) {
			const existingEquipment = await client.query("select 1 from tentativas_recovery_equipments where recovery_id=$1 limit 1", [recoveryId]);
			if (!existingEquipment.rowCount) {
				const error = new Error("Informe ao menos um equipamento devolvido para confirmar a recuperacao."); error.statusCode = 400; throw error;
			}
		}
		if (
			status === "RECOVERY_CONFIRMED" &&
			equipments.some(
				(item) =>
					!text(item.type || item.equipmentType) ||
					!normalizeEquipmentIdentifier(item.macSerial),
			)
		) {
			const error = new Error("Informe o tipo e o MAC ou serial de cada equipamento recuperado.");
			error.statusCode = 400;
			throw error;
		}
		const result = await client.query(
			`update tentativas_recoveries set status=$2, validation_source=$3, evidence_reference=$4,
			 observation=$5, validated_at=case when $2='RECOVERY_CONFIRMED' then now() else validated_at end,
			 validated_by=case when $2='RECOVERY_CONFIRMED' then $6 else validated_by end,
			 updated_by=$6, updated_at=now() where id=$1 returning *`,
			[recoveryId, status, text(payload.validationSource || payload.validation_source), text(payload.evidenceReference || payload.evidence_reference || recovery.evidence_reference), text(payload.observation || recovery.observation), userId(user)],
		);
		for (const equipment of equipments) {
			await client.query(
				`insert into tentativas_recovery_equipments (id,recovery_id,equipment_type,mac_serial,quantity,status,stock_movement_id,evidence_reference,validated_at)
				 values ($1,$2,$3,$4,$5,$6,$7,$8,case when $6='CONFIRMED' then now() else null end)
				 on conflict (recovery_id,(coalesce(mac_serial,'')),(coalesce(equipment_type,''))) do update set
				 quantity=excluded.quantity,status=excluded.status,stock_movement_id=excluded.stock_movement_id,
				 evidence_reference=excluded.evidence_reference,validated_at=excluded.validated_at,updated_at=now()`,
				[id("tre"), recoveryId, text(equipment.type || equipment.equipmentType), normalizeEquipmentIdentifier(equipment.macSerial), Math.max(Number(equipment.quantity || 1), 1), status === "RECOVERY_CONFIRMED" ? "CONFIRMED" : "PENDING", text(equipment.stockMovementId), text(equipment.evidenceReference || payload.evidenceReference || payload.evidence_reference)],
			);
		}
		await addEvent(client, { opportunityId: recovery.opportunity_id, contactId: recovery.contact_id, recoveryId, eventType: "RECOVERY_STATUS_CHANGED", user, payload: { from: recovery.status, to: status, evidenceReference: result.rows[0].evidence_reference } });
		await client.query("commit");
		return result.rows[0];
	} catch (error) {
		await client.query("rollback").catch(() => {});
		if (error?.code === "23505") {
			const conflict = new Error("Este equipamento ja foi contabilizado em outra recuperacao.");
			conflict.statusCode = 409;
			throw conflict;
		}
		throw error;
	} finally { client.release(); }
}

async function saveRecoveryEvidence(recoveryId, file, user = {}) {
	if (!file?.buffer?.length) {
		const error = new Error("Selecione uma imagem ou PDF de evidencia.");
		error.statusCode = 400;
		throw error;
	}
	const scope = await db.query(
		`select r.*,a.technician_user_id,a.technician_email
		   from tentativas_recoveries r
		   left join tentativas_assignments a on a.opportunity_id=r.opportunity_id and a.released_at is null
		  where r.id=$1`,
		[recoveryId],
	);
	const recovery = scope.rows[0];
	if (!recovery) {
		const error = new Error("Recuperacao nao encontrada.");
		error.statusCode = 404;
		throw error;
	}
	if (
		!canManage(user) &&
		recovery.technician_user_id !== userId(user) &&
		text(recovery.technician_email).toLowerCase() !== userEmail(user)
	) {
		const error = new Error("Recuperacao nao pertence a este usuario.");
		error.statusCode = 403;
		throw error;
	}

	const extensionByMime = {
		"application/pdf": ".pdf",
		"image/jpeg": ".jpg",
		"image/png": ".png",
		"image/webp": ".webp",
	};
	const extension = extensionByMime[text(file.mimetype).toLowerCase()];
	if (!extension) {
		const error = new Error("Formato invalido. Envie PDF, JPG, PNG ou WEBP.");
		error.statusCode = 400;
		throw error;
	}
	const uploadRoot = path.resolve(
		process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads"),
	);
	const evidenceDirectory = path.join(uploadRoot, "tentativas");
	const filename = `recuperacao-${recoveryId}-${crypto.randomBytes(10).toString("hex")}${extension}`;
	const absolutePath = path.join(evidenceDirectory, filename);
	const publicPath = `/api/uploads/tentativas/${filename}`;
	await fs.mkdir(evidenceDirectory, { recursive: true });
	await fs.writeFile(absolutePath, file.buffer, { flag: "wx" });

	const client = await db.connect();
	try {
		await client.query("begin");
		await client.query(
			`update tentativas_recoveries
			    set evidence_reference=$2,updated_by=$3,updated_at=now()
			  where id=$1`,
			[recoveryId, publicPath, userId(user)],
		);
		await addEvent(client, {
			opportunityId: recovery.opportunity_id,
			contactId: recovery.contact_id,
			recoveryId,
			eventType: "RECOVERY_EVIDENCE_ATTACHED",
			user,
			payload: {
				path: publicPath,
				name: text(file.originalname),
				mimeType: text(file.mimetype),
				size: Number(file.size || file.buffer.length),
			},
		});
		await client.query("commit");
		return {
			path: publicPath,
			name: text(file.originalname),
			mimeType: text(file.mimetype),
			size: Number(file.size || file.buffer.length),
		};
	} catch (error) {
		await client.query("rollback").catch(() => {});
		await fs.unlink(absolutePath).catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function transferAssignment(assignmentId, payload = {}, user = {}) {
	const client = await db.connect();
	try {
		await client.query("begin");
		const currentResult = await client.query("select * from tentativas_assignments where id=$1 and released_at is null for update", [assignmentId]);
		const current = currentResult.rows[0];
		if (!current) { const error = new Error("Atribuicao ativa nao encontrada."); error.statusCode = 404; throw error; }
		const targetId = text(payload.technicianUserId || payload.technician_user_id);
		if (!targetId) { const error = new Error("Informe o tecnico de destino."); error.statusCode = 400; throw error; }
		await client.query("update tentativas_assignments set released_at=now(), release_reason=$2, updated_at=now() where id=$1", [assignmentId, text(payload.reason || "TRANSFERENCIA_ADMINISTRATIVA")]);
		const newId = id("ta");
		const inserted = await client.query(
			`insert into tentativas_assignments (id,opportunity_id,technician_user_id,technician_email,technician_name,cidade,campaign_id,assigned_by)
			 values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
			[newId, current.opportunity_id, targetId, text(payload.technicianEmail || payload.technician_email).toLowerCase(), text(payload.technicianName || payload.technician_name), current.cidade, current.campaign_id, userId(user)],
		);
		await addEvent(client, { opportunityId: current.opportunity_id, assignmentId: newId, eventType: "ASSIGNMENT_TRANSFERRED", user, payload: { from: current.technician_user_id, to: targetId, reason: text(payload.reason) } });
		await client.query("commit");
		return inserted.rows[0];
	} catch (error) { await client.query("rollback").catch(() => {}); throw error; } finally { client.release(); }
}

function dateRange(query = {}) {
	const end = query.endDate || query.dataFim || new Date().toISOString().slice(0, 10);
	const fallbackStart = new Date(`${end}T12:00:00Z`);
	fallbackStart.setUTCDate(fallbackStart.getUTCDate() - 29);
	const start = query.startDate || query.dataInicio || fallbackStart.toISOString().slice(0, 10);
	const validDate = /^\d{4}-\d{2}-\d{2}$/;
	if (!validDate.test(start) || !validDate.test(end) || start > end) {
		const error = new Error("Período de análise inválido.");
		error.statusCode = 400;
		throw error;
	}
	return { start, end };
}

function analyticsScope(query = {}, user = {}) {
	const requestedRegional = text(query.regional);
	const scopedRegional = text(user.regional || user.regionalNome || user.profile?.regional || user.profile?.regionalNome);
	if (!hasPermission(user, "*") && scopedRegional && requestedRegional && normalizeText(requestedRegional) !== normalizeText(scopedRegional)) {
		const error = new Error("A regional solicitada não pertence ao seu escopo.");
		error.statusCode = 403;
		throw error;
	}
	return { ...query, regional: !hasPermission(user, "*") && scopedRegional ? scopedRegional : requestedRegional };
}

function analyticsParams(query = {}) {
	const { start, end } = dateRange(query);
	return {
		start,
		end,
		values: [
			start,
			end,
			text(query.empresa),
			text(query.regional),
			normalizeText(query.cidade),
			text(query.tecnicoId || query.tecnico_id),
			normalizeText(query.bairro),
			text(query.statusOs || query.status_os).toUpperCase(),
			text(query.resultado).toUpperCase(),
			text(query.modalidade).toUpperCase(),
			text(query.tipoEquipamento || query.tipo_equipamento),
		],
	};
}

const ANALYTICS_BASE_CTE = `
	with current_assignment as (
		select distinct on (opportunity_id) opportunity_id,id assignment_id,technician_user_id,technician_email,technician_name,assigned_at
		from tentativas_assignments where released_at is null order by opportunity_id,assigned_at desc
	), filtered as (
		select o.*,a.assignment_id,a.technician_user_id,a.technician_email,a.technician_name,a.assigned_at
		from tentativas_opportunities o left join current_assignment a on a.opportunity_id=o.id
		where ($3::text='' or o.empresa=$3) and ($4::text='' or o.regional=$4)
		and ($5::text='' or o.cidade_normalizada=$5) and ($6::text='' or a.technician_user_id=$6 or exists (select 1 from tentativas_contacts tc where tc.opportunity_id=o.id and tc.technician_user_id=$6 and tc.created_at >= $1::date and tc.created_at < ($2::date + interval '1 day')))
		and ($7::text='' or lower(translate(coalesce(o.bairro,''), 'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))=$7)
		and ($8::text='' or upper(coalesce(o.service_status,o.status,''))=$8)
		and ($9::text='' or exists (select 1 from tentativas_contacts cr where cr.opportunity_id=o.id and cr.created_at >= $1::date and cr.created_at < ($2::date + interval '1 day') and upper(coalesce(cr.result,''))=$9))
		and ($10::text='' or exists (select 1 from tentativas_recoveries rr where rr.opportunity_id=o.id and upper(rr.modality)=$10))
		and ($11::text='' or exists (select 1 from tentativas_recoveries rf join tentativas_recovery_equipments ef on ef.recovery_id=rf.id where rf.opportunity_id=o.id and ef.equipment_type ilike '%' || $11 || '%'))
	), period_contacts as (
		select c.*,(c.effective_contact or (c.sent_confirmed and upper(coalesce(c.result,'')) in ('RESPONDED_SCHEDULE','STORE_DELIVERY','CALLBACK_REQUESTED','RESPONDED_CALLBACK','REFUSED','ALREADY_RETURNED','SCHEDULED','RESPONDED'))) is_effective
		from tentativas_contacts c join filtered f on f.id=c.opportunity_id
		where c.created_at >= $1::date and c.created_at < ($2::date + interval '1 day')
		and ($9::text='' or upper(coalesce(c.result,''))=$9)
	), worked_ids as (select distinct opportunity_id from period_contacts where sent_confirmed),
	effective_ids as (select distinct opportunity_id from period_contacts where sent_confirmed and is_effective),
	scheduled_ids as (
		select distinct c.opportunity_id from period_contacts c join effective_ids e using(opportunity_id) where upper(coalesce(c.result,'')) in ('SCHEDULED','RESPONDED_SCHEDULE')
		union select distinct r.opportunity_id from tentativas_recoveries r join effective_ids e on e.opportunity_id=r.opportunity_id where r.status in ('COLLECTION_SCHEDULED','STORE_DELIVERY_EXPECTED','AWAITING_EXECUTION','AWAITING_CONFIRMATION','PARTIALLY_RECOVERED','RECOVERY_CONFIRMED') and coalesce(r.scheduled_at,r.created_at) >= $1::date and coalesce(r.scheduled_at,r.created_at) < ($2::date + interval '1 day')
	), completed_any_ids as (
		select id opportunity_id from filtered where completed_at >= $1::date and completed_at < ($2::date + interval '1 day')
		union select distinct r.opportunity_id from tentativas_recoveries r join filtered f on f.id=r.opportunity_id where r.status='RECOVERY_CONFIRMED' and coalesce(r.validated_at,r.updated_at) >= $1::date and coalesce(r.validated_at,r.updated_at) < ($2::date + interval '1 day')
	), completed_flow_ids as (select c.opportunity_id from completed_any_ids c join scheduled_ids s using(opportunity_id)),
	population_ids as (select id opportunity_id from filtered where active union select opportunity_id from worked_ids union select opportunity_id from completed_any_ids)
`;

async function getAnalytics(rawQuery = {}, user = {}) {
	const query = analyticsScope(rawQuery, user);
	const { start, end, values } = analyticsParams(query);
	const page = normalizePage(query.rankPage || query.page);
	const limit = normalizeLimit(query.rankLimit || query.limit, 10, 50);
	const rankingSort = ({ opportunities: "opportunities", worked: "worked", attempts: "attempts", contacts: "effective_contacts", scheduled: "scheduled", recoveries: "recoveries", coverage: "coverage", conversion: "conversion" })[text(query.rankSort)] || "worked";
	const rankingDirection = text(query.rankDirection).toLowerCase() === "asc" ? "asc" : "desc";
	const search = text(query.rankSearch || query.search);

	const [summaryResult, dailyResult, rankingResult, territoryResult, actionsResult, optionsResult, healthResult] = await Promise.all([
		db.query(`${ANALYTICS_BASE_CTE}
		select
		 (select count(*) from filtered where active) eligible,
		 (select count(*) from filtered where active and technician_user_id is not null) distributed,
		 (select count(*) from population_ids) funnel_population,
		 (select count(*) from worked_ids) worked,
		 (select count(*) from period_contacts where sent_confirmed) attempts,
		 (select count(*) from effective_ids) effective_contacts,
		 (select count(*) from scheduled_ids) scheduled,
		 (select count(*) from completed_flow_ids) completed_flow,
		 (select count(*) from completed_any_ids) completed_total,
		 (select count(*) from tentativas_callbacks cb join filtered f on f.id=cb.opportunity_id where cb.status='PENDING') callbacks,
		 (select count(*) from tentativas_callbacks cb join filtered f on f.id=cb.opportunity_id where cb.status='PENDING' and cb.scheduled_at<now()) overdue_callbacks,
		 (select count(distinct r.opportunity_id) from tentativas_recoveries r join filtered f on f.id=r.opportunity_id where r.scheduled_at>now() and r.status in ('COLLECTION_SCHEDULED','STORE_DELIVERY_EXPECTED','AWAITING_EXECUTION')) future_appointments,
		 (select coalesce(sum(e.quantity),0) from tentativas_recovery_equipments e join tentativas_recoveries r on r.id=e.recovery_id join filtered f on f.id=r.opportunity_id where e.status='CONFIRMED' and coalesce(e.validated_at,e.updated_at) >= $1::date and coalesce(e.validated_at,e.updated_at) < ($2::date + interval '1 day')) recovered_equipment,
		 (select count(*) from filtered f where f.active and not exists (select 1 from tentativas_contacts c where c.opportunity_id=f.id and c.sent_confirmed)) without_attempt`, values),
		db.query(`${ANALYTICS_BASE_CTE}
		select d::date as day,
		 count(c.id) filter(where c.sent_confirmed)::int attempts,
		 count(distinct c.opportunity_id) filter(where c.sent_confirmed)::int worked,
		 count(distinct c.opportunity_id) filter(where c.sent_confirmed and c.is_effective)::int effective_contacts,
		 count(distinct c.opportunity_id) filter(where c.sent_confirmed and upper(coalesce(c.result,'')) in ('SCHEDULED','RESPONDED_SCHEDULE'))::int scheduled,
		 (select count(*) from completed_any_ids ca join filtered fo on fo.id=ca.opportunity_id where coalesce(fo.completed_at,fo.updated_at)::date=d::date)::int completed
		from generate_series($1::date,$2::date,interval '1 day') d
		left join period_contacts c on c.created_at::date=d::date group by d order by d`, values),
		db.query(`${ANALYTICS_BASE_CTE}, technicians as (
		 select coalesce(f.technician_user_id,c.technician_user_id) technician_user_id,
		 coalesce(max(f.technician_name),max(c.technician_name),'Técnico não identificado') technician_name,
		 count(distinct f.id) filter(where f.active) opportunities,
		 count(distinct c.opportunity_id) filter(where c.sent_confirmed) worked,
		 count(c.id) filter(where c.sent_confirmed) attempts,
		 count(distinct c.opportunity_id) filter(where c.sent_confirmed and c.is_effective) effective_contacts,
		 count(distinct c.opportunity_id) filter(where c.sent_confirmed and upper(coalesce(c.result,'')) in ('SCHEDULED','RESPONDED_SCHEDULE')) scheduled,
		 count(distinct case when r.status='RECOVERY_CONFIRMED' then r.opportunity_id end) recoveries,
		 count(distinct f.cidade_normalizada) cities,count(distinct nullif(f.bairro,'')) neighborhoods
		 from filtered f left join period_contacts c on c.opportunity_id=f.id
		 left join tentativas_recoveries r on r.opportunity_id=f.id and coalesce(r.validated_at,r.updated_at) >= $1::date and coalesce(r.validated_at,r.updated_at) < ($2::date + interval '1 day')
		 where coalesce(f.technician_user_id,c.technician_user_id) is not null
		 group by coalesce(f.technician_user_id,c.technician_user_id)
	), ranked as (select *,round(case when opportunities>0 then worked::numeric*100/opportunities else 0 end,1) coverage,round(case when worked>0 then recoveries::numeric*100/worked else 0 end,1) conversion from technicians)
		select count(*) over() total_count,* from ranked where ($12::text='' or technician_name ilike '%'||$12||'%') order by ${rankingSort} ${rankingDirection},technician_name asc limit $13 offset $14`, [...values, search, limit, (page - 1) * limit]),
		db.query(`${ANALYTICS_BASE_CTE}
		select coalesce(f.regional,'Não informado') regional,coalesce(f.cidade,'Não informada') cidade,coalesce(nullif(f.bairro,''),'Não informado') bairro,
		 count(distinct f.id) filter(where f.active)::int opportunities,
		 count(distinct c.opportunity_id) filter(where c.sent_confirmed)::int worked,
		 count(distinct c.opportunity_id) filter(where c.sent_confirmed and c.is_effective)::int effective_contacts,
		 count(distinct c.opportunity_id) filter(where c.sent_confirmed and upper(coalesce(c.result,'')) in ('SCHEDULED','RESPONDED_SCHEDULE'))::int scheduled,
		 count(distinct case when r.status='RECOVERY_CONFIRMED' then r.opportunity_id end)::int recoveries,
		 count(distinct case when cb.status='PENDING' and cb.scheduled_at<now() then cb.id end)::int overdue_callbacks
		from filtered f left join period_contacts c on c.opportunity_id=f.id
		left join tentativas_recoveries r on r.opportunity_id=f.id and coalesce(r.validated_at,r.updated_at)>=$1::date and coalesce(r.validated_at,r.updated_at)<($2::date+interval '1 day')
		left join tentativas_callbacks cb on cb.opportunity_id=f.id
		group by 1,2,3 having count(distinct f.id) filter(where f.active)>0 or count(distinct c.opportunity_id)>0
		order by opportunities desc,regional,cidade,bairro limit 500`, values),
		db.query(`${ANALYTICS_BASE_CTE}
		select
		 (select coalesce(jsonb_agg(x),'[]'::jsonb) from (select id,os,codigo_cliente,cliente,cidade,bairro,technician_user_id,technician_name,assigned_at,priority_score from filtered where active and technician_user_id is not null and not exists(select 1 from tentativas_contacts c where c.opportunity_id=filtered.id and c.sent_confirmed) order by assigned_at asc nulls last limit 8)x) unattempted,
		 (select coalesce(jsonb_agg(x),'[]'::jsonb) from (select cb.id,cb.opportunity_id,cb.scheduled_at,cb.technician_user_id,cb.technician_name,f.os,f.codigo_cliente,f.cliente,f.cidade from tentativas_callbacks cb join filtered f on f.id=cb.opportunity_id where cb.status='PENDING' and cb.scheduled_at<now() order by cb.scheduled_at limit 8)x) overdue,
		 (select coalesce(jsonb_agg(x),'[]'::jsonb) from (select r.id,r.opportunity_id,r.scheduled_at,f.os,f.codigo_cliente,f.cliente,f.cidade,f.technician_user_id,f.technician_name from tentativas_recoveries r join filtered f on f.id=r.opportunity_id where r.scheduled_at>now() and r.status in ('COLLECTION_SCHEDULED','STORE_DELIVERY_EXPECTED','AWAITING_EXECUTION') order by r.scheduled_at limit 8)x) upcoming,
		 (select coalesce(jsonb_agg(x),'[]'::jsonb) from (select id,os,codigo_cliente,cliente,cidade,bairro,priority,priority_score,technician_user_id,technician_name from filtered where active and attempt_count=0 and priority in ('CRITICA','ALTA') order by priority_score desc limit 8)x) priority`, values),
		db.query(`${ANALYTICS_BASE_CTE} select
		 array(select distinct empresa from filtered where nullif(empresa,'') is not null order by empresa) companies,
		 array(select distinct regional from filtered where nullif(regional,'') is not null order by regional) regionals,
		 array(select distinct cidade from filtered where nullif(cidade,'') is not null order by cidade) cities,
		 array(select distinct bairro from filtered where nullif(bairro,'') is not null order by bairro) neighborhoods,
		 coalesce((select jsonb_agg(x order by technician_name) from (select distinct technician_user_id id,technician_name from filtered where technician_user_id is not null)x),'[]'::jsonb) technicians`, values),
		db.query(`${ANALYTICS_BASE_CTE} select max(updated_at) last_sync_at,count(*) filter(where active)::int active_records,
		 count(*) filter(where active and (nullif(trim(coalesce(telefone,'')),'') is null or nullif(trim(coalesce(bairro,'')),'') is null))::int divergences,
		 count(*) filter(where active and updated_at<now()-interval '2 hours')::int stale_records from filtered`, values),
	]);

	const raw = summaryResult.rows[0] || {};
	const indicators = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Number(value || 0)]));
	indicators.completed_external = Math.max(indicators.completed_total - indicators.completed_flow, 0);
	indicators.coverageRate = safeRate(indicators.worked, indicators.funnel_population);
	indicators.effectiveContactRate = safeRate(indicators.effective_contacts, indicators.worked);
	indicators.scheduleRate = safeRate(indicators.scheduled, indicators.effective_contacts);
	indicators.recoveryRate = safeRate(indicators.completed_flow, indicators.worked);
	indicators.attemptsPerWorked = indicators.worked ? Number((indicators.attempts / indicators.worked).toFixed(1)) : 0;
	const health = healthResult.rows[0] || {};
	const stale = Number(health.stale_records || 0);
	const divergences = Number(health.divergences || 0);
	const alerts = [];
	if (indicators.coverageRate < 70 && indicators.funnel_population) alerts.push({ type: "LOW_COVERAGE", severity: "warning", value: indicators.coverageRate, message: "Cobertura operacional abaixo de 70%." });
	if (indicators.overdue_callbacks) alerts.push({ type: "OVERDUE_CALLBACKS", severity: "critical", value: indicators.overdue_callbacks, message: "Retornos combinados estão vencidos." });
	if (indicators.without_attempt) alerts.push({ type: "UNATTEMPTED", severity: "warning", value: indicators.without_attempt, message: "Oportunidades ativas ainda não receberam tentativa." });
	if (stale) alerts.push({ type: "STALE_SYNC", severity: "critical", value: stale, message: "Existem registros ativos sem atualização há mais de duas horas." });
	if (divergences) alerts.push({ type: "DATA_DIVERGENCE", severity: "info", value: divergences, message: "Registros ativos têm telefone ou bairro pendente de reconciliação." });

	return {
		period: { start, end },
		updatedAt: new Date().toISOString(),
		indicators,
		funnel: buildSequentialFunnel({ population: indicators.funnel_population, worked: indicators.worked, effective: indicators.effective_contacts, scheduled: indicators.scheduled, completed: indicators.completed_flow }),
		daily: dailyResult.rows.map((row) => ({ day: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10), attempts: Number(row.attempts || 0), worked: Number(row.worked || 0), effectiveContacts: Number(row.effective_contacts || 0), scheduled: Number(row.scheduled || 0), completed: Number(row.completed || 0) })),
		ranking: { items: rankingResult.rows.map((row) => ({ ...row, total_count: undefined, opportunities: Number(row.opportunities || 0), worked: Number(row.worked || 0), attempts: Number(row.attempts || 0), effectiveContacts: Number(row.effective_contacts || 0), scheduled: Number(row.scheduled || 0), recoveries: Number(row.recoveries || 0), coverage: Number(row.coverage || 0), conversion: Number(row.conversion || 0), cities: Number(row.cities || 0), neighborhoods: Number(row.neighborhoods || 0) })), total: Number(rankingResult.rows[0]?.total_count || 0), page, limit },
		territory: territoryResult.rows.map((row) => ({ ...row, opportunities: Number(row.opportunities || 0), worked: Number(row.worked || 0), coverage: safeRate(row.worked,row.opportunities), effectiveContacts: Number(row.effective_contacts || 0), scheduled: Number(row.scheduled || 0), recoveries: Number(row.recoveries || 0), overdueCallbacks: Number(row.overdue_callbacks || 0) })),
		actions: actionsResult.rows[0] || { unattempted: [], overdue: [], upcoming: [], priority: [] },
		options: optionsResult.rows[0] || { companies: [], regionals: [], cities: [], neighborhoods: [], technicians: [] },
		alerts,
		health: { lastSyncAt: health.last_sync_at || null, activeRecords: Number(health.active_records || 0), divergences, staleRecords: stale, status: stale ? "failure" : divergences ? "attention" : "normal" },
	};
}

async function exportAnalyticsCsv(query = {}, user = {}) {
	const report = await getAnalytics({ ...query, rankLimit: 50 }, user);
	const indicators = report.indicators || {};
	const indicatorLabels = {
		eligible: "Oportunidades elegíveis (estoque atual)",
		distributed: "Distribuidos",
		worked: "Trabalhados",
		withoutAttempt: "Sem tentativa",
		attempts: "Tentativas",
		effective_contacts: "Contatos efetivos",
		callbacks: "Retornos pendentes",
		overdue_callbacks: "Retornos vencidos",
		scheduled: "Agendamentos",
		completed_total: "Retiradas concluídas no período",
		completed_flow: "Retiradas concluídas no funil",
		completed_external: "Retiradas por outros fluxos",
		recovered_equipment: "Equipamentos recuperados",
		coverageRate: "Taxa de cobertura (%)",
		effectiveContactRate: "Taxa de contato (%)",
		scheduleRate: "Taxa de agendamento (%)",
		recoveryRate: "Taxa de recuperacao (%)",
	};
	const rows = [
		csvRow(["Relatorio da Central de Tentativas"]),
		csvRow(["Periodo", report.period?.start, report.period?.end]),
		"",
		csvRow(["Indicador", "Valor"]),
		...Object.entries(indicatorLabels).map(([key, label]) =>
			csvRow([label, indicators[key] ?? 0]),
		),
		"",
		csvRow(["Data", "Tentativas", "Trabalhadas", "Contatos efetivos", "Agendamentos", "Retiradas"]),
		...(report.daily || []).map((item) =>
			csvRow([
				item.day instanceof Date
					? item.day.toISOString().slice(0, 10)
					: String(item.day || "").slice(0, 10),
				item.attempts,
				item.worked,
				item.effectiveContacts,
				item.scheduled,
				item.completed,
			]),
		),
		"",
		csvRow(["Técnico", "Oportunidades", "Trabalhadas", "Cobertura (%)", "Tentativas", "Contatos", "Agendamentos", "Recuperações", "Conversão (%)"]),
		...(report.ranking?.items || []).map((item) => csvRow([item.technician_name,item.opportunities,item.worked,item.coverage,item.attempts,item.effectiveContacts,item.scheduled,item.recoveries,item.conversion])),
	];
	return `\ufeff${rows.join("\r\n")}`;
}

async function getIntelligence(query = {}) {
	const settingsResult = await db.query("select alert_thresholds from tentativas_settings where id='global'");
	const thresholds = parseJson(settingsResult.rows[0]?.alert_thresholds, {});
	const filters = [
		Number(thresholds.staleWalletHours || 24),
		text(query.empresa),
		text(query.regional),
		normalizeText(query.cidade),
		text(query.tecnicoId || query.tecnico_id),
		normalizeText(query.bairro),
	];
	const result = await db.query(
		`select
		 count(*) filter (where o.active and o.priority in ('CRITICA','ALTA') and o.attempt_count=0) high_priority_without_contact,
		 count(*) filter (where o.active and o.last_attempt_at < now() - make_interval(hours => $1::int)) stale_opportunities,
		 count(*) filter (where o.active and o.last_result='INVALID_PHONE') invalid_phones,
		 count(*) filter (where o.active) total_active
		 from tentativas_opportunities o
		 left join tentativas_assignments a on a.opportunity_id=o.id and a.released_at is null
		 where ($2::text='' or o.empresa=$2)
		   and ($3::text='' or o.regional=$3)
		   and ($4::text='' or o.cidade_normalizada=$4)
		   and ($5::text='' or a.technician_user_id=$5)
		   and ($6::text='' or lower(translate(coalesce(o.bairro,''), 'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))=$6)`,
		filters,
	);
	const callbacks = await db.query(
		`select count(*) overdue
		   from tentativas_callbacks cb
		   join tentativas_opportunities o on o.id=cb.opportunity_id
		   left join tentativas_assignments a on a.opportunity_id=o.id and a.released_at is null
		  where cb.status='PENDING' and cb.scheduled_at<now()
		    and ($1::text='' or o.empresa=$1)
		    and ($2::text='' or o.regional=$2)
		    and ($3::text='' or o.cidade_normalizada=$3)
		    and ($4::text='' or a.technician_user_id=$4)
		    and ($5::text='' or lower(translate(coalesce(o.bairro,''), 'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))=$5)`,
		filters.slice(1),
	);
	const row = result.rows[0] || {};
	const invalidPercent = Number(row.total_active || 0) ? (Number(row.invalid_phones || 0) / Number(row.total_active)) * 100 : 0;
	const alerts = [];
	if (Number(row.high_priority_without_contact || 0) >= Number(thresholds.highPriorityWithoutContact || 10)) alerts.push({ type: "HIGH_PRIORITY", severity: "warning", value: Number(row.high_priority_without_contact), message: "Clientes de alta prioridade ainda sem contato." });
	if (Number(callbacks.rows[0]?.overdue || 0) >= Number(thresholds.overdueCallbacks || 5)) alerts.push({ type: "OVERDUE_CALLBACKS", severity: "critical", value: Number(callbacks.rows[0].overdue), message: "Retornos programados estao vencidos." });
	if (invalidPercent >= Number(thresholds.invalidPhonePercent || 20)) alerts.push({ type: "INVALID_PHONES", severity: "warning", value: Number(invalidPercent.toFixed(1)), message: "Percentual elevado de numeros invalidos." });
	if (Number(row.stale_opportunities || 0) > 0) alerts.push({ type: "STALE_WALLET", severity: "info", value: Number(row.stale_opportunities), message: "Carteiras sem movimentacao no periodo configurado." });
	return { thresholds, alerts };
}

async function publishScheduledNotifications(systemUser = { uid: "tentativas-worker", nome: "Central de Tentativas" }) {
	const settingsResult = await db.query("select callback_grace_minutes from tentativas_settings where id='global'");
	const graceMinutes = Number(settingsResult.rows[0]?.callback_grace_minutes || 30);
	const due = await db.query(
		`select cb.*,o.cliente,o.codigo_cliente,o.os
		 from tentativas_callbacks cb join tentativas_opportunities o on o.id=cb.opportunity_id
		 where cb.status='PENDING' and cb.scheduled_at <= now() + make_interval(mins => $1::int)
		 order by cb.scheduled_at asc limit 200`,
		[graceMinutes],
	);
	for (const callback of due.rows) {
		const targetUser = text(callback.technician_user_id || callback.technician_email);
		if (!targetUser) continue;
		await createNotification({
			type: "geral",
			title: callback.scheduled_at < new Date() ? "Retorno de cliente vencido" : "Retorno de cliente próximo",
			message: `(${callback.codigo_cliente || "-"}) ${callback.cliente || "Cliente"} · OS ${callback.os}`,
			targetPath: `/tentativas?tab=callbacks&opportunity=${encodeURIComponent(callback.opportunity_id)}`,
			severity: callback.scheduled_at < new Date() ? "warning" : "info",
			user: systemUser,
			targets: { users: [targetUser] },
			meta: { callbackId: callback.id, opportunityId: callback.opportunity_id, scheduledAt: callback.scheduled_at },
			dedupeKey: `tentativas-callback-due-${callback.id}`,
		});
	}
	const intelligence = await getIntelligence();
	const day = new Date().toISOString().slice(0, 10);
	for (const alert of intelligence.alerts) {
		await createNotification({
			type: "geral",
			title: "Alerta da Central de Tentativas",
			message: `${alert.value} · ${alert.message}`,
			targetPath: "/tentativas?tab=management",
			severity: alert.severity,
			user: systemUser,
			targets: { roles: ["admin", "supervisor", "backoffice_retirada"] },
			meta: { alertType: alert.type, value: alert.value },
			dedupeKey: `tentativas-alert-${alert.type}-${day}`,
		});
	}
	return { callbacks: due.rowCount, alerts: intelligence.alerts.length };
}

async function getMyProductivity(query = {}, user = {}) {
	const { start, end } = dateRange(query);
	const params = [userId(user), userEmail(user), start, end];
	const summary = await db.query(
		`with assignments as (
		 select a.*,o.status,o.attempt_count,o.id opportunity_id
		 from tentativas_assignments a join tentativas_opportunities o on o.id=a.opportunity_id
		 where a.released_at is null and (a.technician_user_id=$1 or lower(coalesce(a.technician_email,''))=$2)
		), contacts as (
		 select c.* from tentativas_contacts c
		 where (c.technician_user_id=$1 or exists (select 1 from assignments a where a.id=c.assignment_id))
		 and c.created_at >= $3::date and c.created_at < ($4::date + interval '1 day')
		)
		select (select count(*) from assignments) assigned,
		 (select count(distinct opportunity_id) from contacts where sent_confirmed) worked,
		 (select count(*) from contacts where sent_confirmed) attempts,
		 (select count(distinct opportunity_id) from contacts where effective_contact) effective_contacts,
		 (select count(distinct opportunity_id) from contacts where result in ('SCHEDULED','RESPONDED_SCHEDULE')) scheduled,
		 (select count(*) from tentativas_callbacks where status='PENDING' and (technician_user_id=$1 or lower(coalesce(technician_email,''))=$2)) pending_callbacks,
		 (select count(*) from tentativas_callbacks where status='PENDING' and scheduled_at<now() and (technician_user_id=$1 or lower(coalesce(technician_email,''))=$2)) overdue_callbacks,
		 (select count(*) from tentativas_recoveries r join assignments a on a.opportunity_id=r.opportunity_id where r.status='RECOVERY_CONFIRMED') recovered`,
		params,
	);
	const daily = await db.query(
		`select d::date day, count(c.id) filter (where c.sent_confirmed)::int attempts,
		 count(distinct c.opportunity_id) filter (where c.effective_contact)::int effective_contacts
		 from generate_series($3::date,$4::date,interval '1 day') d
		 left join tentativas_contacts c on c.created_at::date=d::date and c.technician_user_id=$1
		 group by d order by d`, params,
	);
	const row = summary.rows[0] || {};
	const assigned = Number(row.assigned || 0);
	const worked = Number(row.worked || 0);
	return {
		period: { start, end },
		summary: {
			...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value || 0)])),
			pending: Math.max(assigned - worked, 0),
			progress: assigned ? Number(((worked / assigned) * 100).toFixed(1)) : 0,
		},
		daily: daily.rows.map((item) => ({ ...item, attempts: Number(item.attempts || 0), effectiveContacts: Number(item.effective_contacts || 0) })),
	};
}

async function listAudit(query = {}, user = {}) {
	const page = normalizePage(query.page);
	const limit = normalizeLimit(query.limit, 20, 100);
	const params = [];
	const filters = [];
	if (query.type) { params.push(text(query.type).toUpperCase()); filters.push(`e.event_type=$${params.length}`); }
	if (query.q) { params.push(`%${text(query.q)}%`); filters.push(`(o.cliente ilike $${params.length} or o.codigo_cliente ilike $${params.length} or o.os ilike $${params.length} or e.actor_name ilike $${params.length})`); }
	params.push(limit, (page - 1) * limit);
	const result = await db.query(
		`select count(*) over() total_count,e.*,o.os,o.codigo_cliente,o.cliente,o.cidade
		 from tentativas_events e join tentativas_opportunities o on o.id=e.opportunity_id
		 ${filters.length ? `where ${filters.join(" and ")}` : ""}
		 order by e.occurred_at desc limit $${params.length - 1} offset $${params.length}`,
		params,
	);
	return { items: result.rows, page, limit, total: Number(result.rows[0]?.total_count || 0), requestedBy: userId(user) };
}

module.exports = {
	__testables: { calculatePriorityScore, assertRecoveryTransition, normalizeEquipmentIdentifier, safeRate, buildSequentialFunnel, RECOVERY_TRANSITIONS },
	addEvent,
	assertContactAllowed,
	createCallback,
	correctContact,
	exportAnalyticsCsv,
	getAnalytics,
	getIntelligence,
	getMyProductivity,
	listAudit,
	listCallbacks,
	listRecoveries,
	listTimeline,
	notifyResultArtifacts,
	publishScheduledNotifications,
	recordContactStarted,
	recordResultArtifacts,
	refreshPriorityScores,
	saveRecoveryEvidence,
	transferAssignment,
	updateCallback,
	updateRecovery,
};
