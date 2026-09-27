const db = require("../../db");

const HUBSOFT_STEP_TYPES = Object.freeze([
	"hubsoft_comment",
	"hubsoft_attachment",
	"hubsoft_status_update",
	"hubsoft_assignment",
]);

function text(value) {
	return String(value || "").trim();
}

function digits(value) {
	return text(value).replace(/\D/g, "");
}

function timestamp(value) {
	if (!value) return null;
	if (value instanceof Date) return value;
	const date = new Date(value?.value || value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function safeJson(value, fallback = {}) {
	if (value === undefined || value === null) return fallback;
	return value;
}

function normalizeLimit(value, fallback = 20) {
	const parsed = Number(value || fallback);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

function normalizeOffset(value) {
	const parsed = Number(value || 0);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(Math.trunc(parsed), 0);
}

function buildEvidenceKey(data = {}) {
	if (text(data.evidenceKey)) return text(data.evidenceKey);
	const sourceId =
		text(data.callbackId) ||
		text(data.historicoId) ||
		text(data.interactionId) ||
		text(data.filaId);
	if (sourceId) return `${text(data.source || "mensageria")}:${sourceId}`;
	const os = text(data.osNumber || data.os);
	const phone = digits(data.phone || data.telefone);
	const created = text(data.sentAt || data.responseAt || data.createdAt).slice(0, 19);
	return `mensageria:${os}:${phone}:${created}`;
}

async function findRelatedEvidenceKey(payload = {}) {
	const filaId = text(payload.filaId);
	const osNumber = text(payload.osNumber || payload.os);
	const phoneDigits = digits(payload.phone || payload.telefone);
	if (filaId) {
		const byQueue = await db.query(
			`select evidence_key
			   from hubsoft_interaction_evidences
			  where fila_id = $1
			  order by created_at desc
			  limit 1`,
			[filaId],
		);
		if (byQueue.rows[0]?.evidence_key) return byQueue.rows[0].evidence_key;
	}
	if (osNumber && phoneDigits) {
		const byOsPhone = await db.query(
			`select evidence_key
			   from hubsoft_interaction_evidences
			  where os_number = $1 and phone_digits = $2
			  order by coalesce(sent_at, created_at) desc
			  limit 1`,
			[osNumber, phoneDigits],
		);
		if (byOsPhone.rows[0]?.evidence_key) return byOsPhone.rows[0].evidence_key;
	}
	return "";
}

function mapEvidence(row = {}) {
	return {
		id: row.id,
		evidenceKey: row.evidence_key,
		interactionId: row.interaction_id,
		filaId: row.fila_id,
		historicoId: row.historico_id,
		callbackId: row.callback_id,
		agendamentoId: row.agendamento_id,
		osNumber: row.os_number,
		customerCode: row.customer_code,
		customerName: row.customer_name,
		phone: row.phone,
		phoneDigits: row.phone_digits,
		city: row.city,
		regional: row.regional,
		contract: row.contract,
		messageSent: row.message_sent,
		sentAt: row.sent_at,
		provider: row.provider,
		providerStatus: row.provider_status,
		providerMessageId: row.provider_message_id,
		customerResponse: row.customer_response,
		responseAt: row.response_at,
		result: row.result,
		syncStatus: row.sync_status,
		hubsoftCommentStatus: row.hubsoft_comment_status,
		hubsoftAttachmentStatus: row.hubsoft_attachment_status,
		hubsoftStatusUpdateStatus: row.hubsoft_status_update_status,
		hubsoftAssignmentStatus: row.hubsoft_assignment_status,
		retryCount: Number(row.retry_count || 0),
		lastSyncError: row.last_sync_error,
		source: row.source,
		sourcePayload: row.source_payload || {},
		metadata: row.metadata || {},
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function mapStep(row = {}) {
	return {
		id: row.id,
		evidenceId: row.evidence_id,
		stepType: row.step_type,
		status: row.status,
		idempotencyKey: row.idempotency_key,
		externalId: row.external_id,
		attempts: Number(row.attempts || 0),
		startedAt: row.started_at,
		finishedAt: row.finished_at,
		errorCode: row.error_code,
		errorMessage: row.error_message,
		metadata: row.metadata || {},
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function mapEvent(row = {}) {
	return {
		id: row.id,
		evidenceId: row.evidence_id,
		eventType: row.event_type,
		title: row.title,
		description: row.description,
		actorId: row.actor_id,
		actorName: row.actor_name,
		occurredAt: row.occurred_at,
		metadata: row.metadata || {},
		createdAt: row.created_at,
	};
}

async function appendEvent(evidenceId, event = {}) {
	if (!evidenceId) return null;
	const result = await db.query(
		`insert into hubsoft_evidence_events
		 (evidence_id, event_type, title, description, actor_id, actor_name, occurred_at, metadata)
		 values ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, now()), $8::jsonb)
		 returning *`,
		[
			evidenceId,
			text(event.eventType || event.type || "note"),
			text(event.title || "Evento registrado"),
			text(event.description),
			text(event.actorId),
			text(event.actorName),
			timestamp(event.occurredAt),
			JSON.stringify(safeJson(event.metadata)),
		],
	);
	return mapEvent(result.rows[0]);
}

async function ensureBlockedHubsoftSteps(evidence) {
	if (!evidence?.id) return;
	for (const stepType of HUBSOFT_STEP_TYPES) {
		await db.query(
			`insert into hubsoft_evidence_steps
			 (evidence_id, step_type, status, idempotency_key, error_code, error_message, metadata)
			 values ($1, $2, 'blocked_config', $3, 'HUBSOFT_WRITE_NOT_CONFIGURED',
			         'Endpoint de escrita no HubSoft ainda nao validado/configurado.', $4::jsonb)
			 on conflict (evidence_id, step_type, idempotency_key) do nothing`,
			[
				evidence.id,
				stepType,
				`${evidence.id}:${stepType}`,
				JSON.stringify({
					retryable: true,
					reason: "hubsoft_write_endpoint_missing",
				}),
			],
		);
	}
	await db.query(
		`update hubsoft_interaction_evidences
		    set hubsoft_comment_status =
		          case when hubsoft_comment_status in ('pending', 'blocked_config') then 'blocked_config' else hubsoft_comment_status end,
		        hubsoft_attachment_status =
		          case when hubsoft_attachment_status in ('pending', 'blocked_config') then 'blocked_config' else hubsoft_attachment_status end,
		        hubsoft_status_update_status =
		          case when hubsoft_status_update_status in ('pending', 'blocked_config') then 'blocked_config' else hubsoft_status_update_status end,
		        hubsoft_assignment_status =
		          case when hubsoft_assignment_status in ('pending', 'blocked_config') then 'blocked_config' else hubsoft_assignment_status end,
		        sync_status =
		          case when sync_status in ('pending', 'blocked_config') then 'blocked_config' else sync_status end,
		        last_sync_error = coalesce(last_sync_error, 'Escrita HubSoft pendente de configuracao validada.')
		  where id = $1`,
		[evidence.id],
	);
}

async function upsertEvidence(payload = {}, event = {}) {
	const evidenceKey = buildEvidenceKey(payload);
	if (!evidenceKey) return null;
	const sourcePayload = safeJson(payload.sourcePayload || payload.payload);
	const metadata = safeJson(payload.metadata);
	const result = await db.query(
		`insert into hubsoft_interaction_evidences
		 (evidence_key, interaction_id, fila_id, historico_id, callback_id, agendamento_id,
		  os_number, customer_code, customer_name, phone, phone_digits, city, regional,
		  contract, message_sent, sent_at, provider, provider_status, provider_message_id,
		  customer_response, response_at, result, source, source_payload, metadata)
		 values
		 ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
		  $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24::jsonb, $25::jsonb)
		 on conflict (evidence_key) do update set
		   interaction_id = coalesce(excluded.interaction_id, hubsoft_interaction_evidences.interaction_id),
		   fila_id = coalesce(excluded.fila_id, hubsoft_interaction_evidences.fila_id),
		   historico_id = coalesce(excluded.historico_id, hubsoft_interaction_evidences.historico_id),
		   callback_id = coalesce(excluded.callback_id, hubsoft_interaction_evidences.callback_id),
		   agendamento_id = coalesce(excluded.agendamento_id, hubsoft_interaction_evidences.agendamento_id),
		   os_number = coalesce(excluded.os_number, hubsoft_interaction_evidences.os_number),
		   customer_code = coalesce(excluded.customer_code, hubsoft_interaction_evidences.customer_code),
		   customer_name = coalesce(excluded.customer_name, hubsoft_interaction_evidences.customer_name),
		   phone = coalesce(excluded.phone, hubsoft_interaction_evidences.phone),
		   phone_digits = coalesce(excluded.phone_digits, hubsoft_interaction_evidences.phone_digits),
		   city = coalesce(excluded.city, hubsoft_interaction_evidences.city),
		   regional = coalesce(excluded.regional, hubsoft_interaction_evidences.regional),
		   contract = coalesce(excluded.contract, hubsoft_interaction_evidences.contract),
		   message_sent = coalesce(excluded.message_sent, hubsoft_interaction_evidences.message_sent),
		   sent_at = coalesce(excluded.sent_at, hubsoft_interaction_evidences.sent_at),
		   provider = coalesce(excluded.provider, hubsoft_interaction_evidences.provider),
		   provider_status = coalesce(excluded.provider_status, hubsoft_interaction_evidences.provider_status),
		   provider_message_id = coalesce(excluded.provider_message_id, hubsoft_interaction_evidences.provider_message_id),
		   customer_response = coalesce(excluded.customer_response, hubsoft_interaction_evidences.customer_response),
		   response_at = coalesce(excluded.response_at, hubsoft_interaction_evidences.response_at),
		   result = coalesce(excluded.result, hubsoft_interaction_evidences.result),
		   source_payload = hubsoft_interaction_evidences.source_payload || excluded.source_payload,
		   metadata = hubsoft_interaction_evidences.metadata || excluded.metadata
		 returning *`,
		[
			evidenceKey,
			text(payload.interactionId),
			text(payload.filaId),
			text(payload.historicoId),
			text(payload.callbackId),
			text(payload.agendamentoId),
			text(payload.osNumber || payload.os),
			text(payload.customerCode || payload.codigoCliente || payload.codigo_cliente),
			text(payload.customerName || payload.cliente),
			text(payload.phone || payload.telefone),
			digits(payload.phone || payload.telefone),
			text(payload.city || payload.cidade),
			text(payload.regional),
			text(payload.contract || payload.contrato),
			text(payload.messageSent || payload.mensagem),
			timestamp(payload.sentAt),
			text(payload.provider || payload.origem),
			text(payload.providerStatus || payload.status),
			text(payload.providerMessageId),
			text(payload.customerResponse || payload.respostaCliente),
			timestamp(payload.responseAt || payload.recebidoEm),
			text(payload.result || payload.status),
			text(payload.source || "mensageria"),
			JSON.stringify(sourcePayload),
			JSON.stringify(metadata),
		],
	);
	const evidence = mapEvidence(result.rows[0]);
	await ensureBlockedHubsoftSteps(evidence);
	await appendEvent(evidence.id, event);
	return getEvidence(evidence.id);
}

async function recordOutbound(payload = {}) {
	return upsertEvidence(
		{
			source: "mensageria_outbound",
			interactionId: payload.historicoId || payload.filaId,
			...payload,
		},
		{
			eventType: payload.status === "falhou" ? "message_failed" : "message_sent",
			title: payload.status === "falhou" ? "Mensagem falhou" : "Mensagem enviada",
			description: payload.error || payload.erro || payload.messageSent || "",
			occurredAt: payload.sentAt || new Date(),
			metadata: {
				provider: payload.provider,
				status: payload.providerStatus || payload.status,
			},
		},
	);
}

async function recordCallback(payload = {}) {
	const evidenceKey = await findRelatedEvidenceKey(payload);
	return upsertEvidence(
		{
			source: "mensageria_callback",
			interactionId: payload.callbackId,
			evidenceKey,
			...payload,
		},
		{
			eventType: payload.agendamentoId ? "appointment_created" : "customer_response",
			title: payload.agendamentoId ? "Agendamento criado" : "Resposta recebida",
			description: payload.customerResponse || payload.motivo || "",
			occurredAt: payload.responseAt || new Date(),
			metadata: {
				status: payload.result,
				agendamentoId: payload.agendamentoId,
				schedule: payload.schedule || null,
			},
		},
	);
}

function buildWhere(filters = {}) {
	const clauses = [];
	const values = [];
	const push = (clause, value) => {
		values.push(value);
		clauses.push(clause.replace("?", `$${values.length}`));
	};
	if (text(filters.q)) {
		const term = `%${text(filters.q)}%`;
		values.push(term);
		const param = `$${values.length}`;
		clauses.push(
			`(os_number ilike ${param} or customer_name ilike ${param} or customer_code ilike ${param} or city ilike ${param})`,
		);
	}
	if (text(filters.status)) push("sync_status = ?", text(filters.status));
	if (text(filters.result)) push("result = ?", text(filters.result));
	if (text(filters.os)) push("os_number = ?", text(filters.os));
	if (text(filters.city)) push("city ilike ?", `%${text(filters.city)}%`);
	if (text(filters.startDate)) push("created_at >= ?::date", text(filters.startDate));
	if (text(filters.endDate)) push("created_at < (?::date + interval '1 day')", text(filters.endDate));
	return { where: clauses.length ? `where ${clauses.join(" and ")}` : "", values };
}

async function listEvidences(filters = {}) {
	const limit = normalizeLimit(filters.limit);
	const offset = normalizeOffset(filters.offset || (Number(filters.page || 1) - 1) * limit);
	const { where, values } = buildWhere(filters);
	const countResult = await db.query(
		`select count(*)::int as total from hubsoft_interaction_evidences ${where}`,
		values,
	);
	const result = await db.query(
		`select * from hubsoft_interaction_evidences
		  ${where}
		  order by coalesce(response_at, sent_at, created_at) desc
		  limit $${values.length + 1} offset $${values.length + 2}`,
		[...values, limit, offset],
	);
	return {
		items: result.rows.map(mapEvidence),
		total: Number(countResult.rows[0]?.total || 0),
		limit,
		offset,
	};
}

async function getDashboard() {
	const result = await db.query(
		`select
		   count(*)::int as total,
		   count(*) filter (where sync_status = 'synced')::int as synced,
		   count(*) filter (where sync_status = 'blocked_config')::int as blocked,
		   count(*) filter (where sync_status = 'failed')::int as failed,
		   count(*) filter (where result = 'agendado')::int as scheduled,
		   count(*) filter (where created_at >= now() - interval '24 hours')::int as last_24h
		 from hubsoft_interaction_evidences`,
	);
	const byStatus = await db.query(
		`select sync_status as status, count(*)::int as total
		   from hubsoft_interaction_evidences
		  group by sync_status
		  order by total desc`,
	);
	return {
		summary: result.rows[0] || {},
		byStatus: byStatus.rows,
	};
}

async function getEvidence(id) {
	const evidenceResult = await db.query(
		`select * from hubsoft_interaction_evidences where id = $1`,
		[text(id)],
	);
	const row = evidenceResult.rows[0];
	if (!row) return null;
	const [steps, events] = await Promise.all([
		db.query(
			`select * from hubsoft_evidence_steps
			  where evidence_id = $1
			  order by created_at asc`,
			[row.id],
		),
		db.query(
			`select * from hubsoft_evidence_events
			  where evidence_id = $1
			  order by occurred_at desc, created_at desc`,
			[row.id],
		),
	]);
	return {
		...mapEvidence(row),
		steps: steps.rows.map(mapStep),
		events: events.rows.map(mapEvent),
	};
}

async function retryStep(evidenceId, stepType, user = {}) {
	const evidence = await getEvidence(evidenceId);
	if (!evidence) {
		const error = new Error("Evidencia nao encontrada.");
		error.statusCode = 404;
		throw error;
	}
	if (!HUBSOFT_STEP_TYPES.includes(stepType)) {
		const error = new Error("Etapa de evidencia invalida.");
		error.statusCode = 400;
		throw error;
	}
	await db.query(
		`update hubsoft_evidence_steps
		    set attempts = attempts + 1,
		        status = 'blocked_config',
		        started_at = now(),
		        finished_at = now(),
		        error_code = 'HUBSOFT_WRITE_NOT_CONFIGURED',
		        error_message = 'Endpoint de escrita no HubSoft ainda nao validado/configurado.'
		  where evidence_id = $1 and step_type = $2`,
		[evidence.id, stepType],
	);
	await db.query(
		`update hubsoft_interaction_evidences
		    set retry_count = retry_count + 1,
		        last_retry_at = now(),
		        sync_status = 'blocked_config',
		        last_sync_error = 'Retry bloqueado: escrita HubSoft ainda sem endpoint validado.'
		  where id = $1`,
		[evidence.id],
	);
	await appendEvent(evidence.id, {
		eventType: "retry_blocked",
		title: "Retry registrado",
		description: "A etapa sera executada quando os endpoints de escrita do HubSoft forem configurados.",
		actorId: user?.uid || "",
		actorName: user?.profile?.nome || user?.nome || user?.email || "",
		metadata: { stepType },
	});
	return getEvidence(evidence.id);
}

module.exports = {
	getDashboard,
	getEvidence,
	listEvidences,
	recordCallback,
	recordOutbound,
	retryStep,
};
