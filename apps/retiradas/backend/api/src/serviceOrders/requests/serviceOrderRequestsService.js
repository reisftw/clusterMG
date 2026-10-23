const db = require("../../db");
const hubsoftSyncProfiles = require("../../hubsoftSyncProfiles");

const CREATE_PERMISSIONS = ["service_orders.requests.create"];
const HISTORY_PERMISSIONS = ["service_orders.requests.history"];
const TARGET_TYPE_ID = 1487;
const TARGET_TYPE_NAME = "CANCELAMENTO FTTH";
const OPEN_STATUSES = ["aguardando_agendamento", "pendente"];
const ALLOWED_SOURCE_ORDER_TYPES = [
	"RETIRADA FTTH",
	"RETIRADA - OUTROS",
	"CANCELAMENTO FTTH",
	"CANCELAMENTO - OUTROS",
	"CANCELAMENTO & RETIRADA - SEGUNDA TENTATIVA",
	"RETIRADA & CANCELAMENTO - SEGUNDA TENTATIVA",
	"CANCELAMENTO LOJA",
];
const PRIVILEGED_REQUEST_ROLES = new Set([
	"ADMIN",
	"BACKOFFICE",
	"BACKOFFICE_RETIRADA",
]);
const REQUEST_CONCURRENCY = Math.min(
	Math.max(Number(process.env.SERVICE_ORDER_REQUEST_CONCURRENCY || 4), 1),
	8,
);
const HUBSOFT_WEB_BASE_URL = "https://sempre.hubsoft.com.br";
const AFTERNOON_AVAILABILITY = {
	id_periodo_dia: 5,
	descricao: "Tarde",
	prefixo: "tarde",
	padrao_sistema: true,
	hora_inicio: "12:00:00",
	hora_fim: "17:59:59",
	display: "Tarde",
	inicial: "T",
};

const pendingQueue = [];
const queuedIds = new Set();
let activeWorkers = 0;
let initialized = false;
let metadataCache = null;
let metadataPromise = null;
let metadataExpiresAt = 0;
let keepAliveStarted = false;
let orderLookupTail = Promise.resolve();

function text(value) {
	return String(value ?? "").trim();
}

function digits(value) {
	return text(value).replace(/\D/g, "");
}

function normalize(value) {
	return text(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ")
		.toUpperCase();
}

function normalizeOrderType(value) {
	return normalize(value)
		.replace(/\s*&\s*/g, " & ")
		.replace(/\s*-\s*/g, " - ")
		.replace(/\s+/g, " ")
		.trim();
}

function isAllowedSourceOrderType(value) {
	const sourceType = normalizeOrderType(value);
	return ALLOWED_SOURCE_ORDER_TYPES.some(
		(allowedType) => normalizeOrderType(allowedType) === sourceType,
	);
}

function blockedSourceOrderTypeError(value) {
	const sourceType = text(value) || "nao identificado";
	const error = new Error(
		`A O.S encontrada e do tipo "${sourceType}". O Retorninho so pode encaminhar ordens de retirada permitidas.`,
	);
	error.statusCode = 422;
	return error;
}

function userProfile(user = {}) {
	return user.profile || user;
}

function requesterUid(user = {}) {
	const profile = userProfile(user);
	return text(user.uid || profile.uid || user.email || profile.email);
}

function requesterName(user = {}) {
	const profile = userProfile(user);
	return text(
		profile.nome ||
			profile.displayName ||
			profile.display_name ||
			user.nome ||
			user.email ||
			profile.email,
	);
}

function requesterEmail(user = {}) {
	const profile = userProfile(user);
	return text(user.email || profile.email).toLowerCase();
}

function technicianHubsoftName(user = {}) {
	const profile = userProfile(user);
	return text(profile.metasTecnicoNome || profile.metas_tecnico_nome);
}

function isAdmin(user = {}) {
	return normalize(user.role || userProfile(user).role) === "ADMIN";
}

function canChooseTechnician(user = {}) {
	return PRIVILEGED_REQUEST_ROLES.has(
		normalize(user.role || userProfile(user).role),
	);
}

function rowsOf(payload) {
	const rows =
		payload?.ordens_servico?.data ||
		payload?.paginador?.data ||
		payload?.data?.data ||
		payload?.data ||
		payload?.dados ||
		[];
	return Array.isArray(rows) ? rows : [];
}

function orderPayload(payload) {
	return payload?.ordem_servico || payload?.data || null;
}

function orderId(order = {}) {
	return text(order.id_ordem_servico || order.id);
}

function orderNumber(order = {}) {
	return digits(order.numero_ordem_servico || order.num_os || order.numero_os);
}

function clientCode(order = {}) {
	return digits(
		order.codigo_cliente ||
			order.cliente?.codigo_cliente ||
			order.cliente_servico?.cliente?.codigo_cliente,
	);
}

function clientName(order = {}) {
	return text(
		order.nome_razaosocial ||
			order.cliente?.nome_razaosocial ||
			order.cliente?.nome ||
			order.cliente_servico?.cliente?.nome_razaosocial ||
			order.cliente_servico?.cliente?.nome,
	);
}

function clientId(order = {}) {
	return digits(
		order.id_cliente ||
			order.cliente?.id_cliente ||
			order.cliente_servico?.id_cliente ||
			order.cliente_servico?.cliente?.id_cliente ||
			order.servico?.id_cliente,
	);
}

function clientOrdersUrl(order = {}) {
	const id = clientId(order);
	return id
		? `${HUBSOFT_WEB_BASE_URL}/cliente/editar/${encodeURIComponent(id)}/ordem_servico`
		: "";
}

function orderStatus(order = {}) {
	return normalize(
		order.status?.valor ||
			order.status?.value ||
			order.status?.descricao ||
			order.status_ordem_servico ||
			order.status,
	)
		.toLowerCase()
		.replace(/\s+/g, "_");
}

function orderType(order = {}) {
	return order.tipo_ordem_servico || order.ordem_servico_tipo || {};
}

function orderTypeName(order = {}) {
	const type = orderType(order);
	return text(
		type?.descricao ||
			type?.display ||
			type?.name ||
			(typeof type === "string" ? type : "") ||
			order.tipo ||
			order.tipo_os,
	);
}

function orderTechnicians(order = {}) {
	if (Array.isArray(order.tecnicos)) return order.tecnicos;
	if (Array.isArray(order.ordem_servico_tecnico)) {
		return order.ordem_servico_tecnico.map((item) => item?.usuario || item);
	}
	return [];
}

function technicianName(item = {}) {
	return text(item.name || item.nome || item.display);
}

function hasScheduledAppointment(order = {}) {
	return Boolean(
		order.id_agenda_ordem_servico ||
			order.agendamento_ordem_servico ||
			order.agenda ||
			order.id_integracao_erp_agendamento ||
			order.integracao_erp_agendamento,
	);
}

function saoPauloDateParts(now = new Date()) {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-US", {
			timeZone: "America/Sao_Paulo",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).formatToParts(now).map((part) => [part.type, part.value]),
	);
	const iso = `${parts.year}-${parts.month}-${parts.day}`;
	return { iso, br: `${parts.day}/${parts.month}/${parts.year}` };
}

function applyTargetState(order, targetType, targetTechnician, now = new Date()) {
	const date = saoPauloDateParts(now);
	const start = `${date.iso} 01:00:00`;
	const end = `${date.iso} 01:59:00`;
	const startTimestamp = new Date(`${date.iso}T01:00:00-03:00`).getTime();
	const endTimestamp = new Date(`${date.iso}T01:59:00-03:00`).getTime();

	order.id_tipo_ordem_servico = TARGET_TYPE_ID;
	order.tipo_ordem_servico = targetType;
	order.status = "pendente";
	order.tipo_agendamento = "manual";
	order.tecnicos = [targetTechnician];
	order.ordem_servico_tecnico = [
		{
			id_usuario: Number(targetTechnician.id ?? targetTechnician.id_usuario),
			usuario: targetTechnician,
		},
	];
	order.id_agenda_ordem_servico = null;
	order.agenda = null;
	order.agendamento_ordem_servico = null;
	order.disponibilidade = [{ ...AFTERNOON_AVAILABILITY }];
	order.id_periodo_dia = AFTERNOON_AVAILABILITY.id_periodo_dia;
	order.periodo_dia = { ...AFTERNOON_AVAILABILITY };
	order.turno = "tarde";
	order.data_inicio_programado = start;
	order.data_inicio_programado_br = date.br;
	order.data_inicio_programado_timestamp = startTimestamp;
	order.hora_inicio_programado = "01:00:00";
	order.data_termino_programado = end;
	order.data_termino_programado_br = date.br;
	order.data_termino_programado_timestamp = endTimestamp;
	order.hora_termino_programado = "01:59:00";
	order.duracao = "00:59:00";
	return order;
}

function snapshot(order = {}) {
	return {
		id: orderId(order),
		numero: orderNumber(order),
		codigoCliente: clientCode(order),
		cliente: clientName(order),
		tipoId: Number(orderType(order)?.id_tipo_ordem_servico || order.id_tipo_ordem_servico || 0),
		tipo: text(orderType(order)?.descricao || orderType(order)?.display),
		status: orderStatus(order),
		tecnicos: orderTechnicians(order).map(technicianName).filter(Boolean),
		tipoAgendamento: text(order.tipo_agendamento),
		agenda: text(order.agenda?.descricao || order.agenda?.display || order.id_agenda_ordem_servico),
		inicio: text(order.data_inicio_programado),
		fim: text(order.data_termino_programado),
		duracao: text(order.duracao),
		turno: text(order.turno || order.periodo_dia?.descricao),
	};
}

function publicRow(row = {}) {
	return {
		id: row.id,
		clientCode: row.client_code,
		requesterUid: row.requester_uid,
		requesterEmail: row.requester_email || "",
		requesterName: row.requester_name,
		technicianHubsoftName: row.technician_hubsoft_name,
		serviceOrderId: row.service_order_id || "",
		serviceOrderNumber: row.service_order_number || "",
		clientName: row.client_name || "",
		status: row.status,
		stage: row.stage,
		progress: Number(row.progress || 0),
		resultMessage: row.result_message || "",
		errorMessage: row.error_message || "",
		hubsoftUrl: row.hubsoft_url || "",
		createdAt: row.created_at,
		startedAt: row.started_at,
		completedAt: row.completed_at,
		updatedAt: row.updated_at,
	};
}

async function updateProgress(id, stage, progress, extras = {}) {
	const sets = ["stage = $2", "progress = $3"];
	const params = [id, stage, progress];
	const columns = {
		serviceOrderId: "service_order_id",
		serviceOrderNumber: "service_order_number",
		clientName: "client_name",
		hubsoftUrl: "hubsoft_url",
		beforeSnapshot: "before_snapshot",
		afterSnapshot: "after_snapshot",
		resultMessage: "result_message",
		errorMessage: "error_message",
	};
	for (const [key, column] of Object.entries(columns)) {
		if (extras[key] === undefined) continue;
		params.push(key.endsWith("Snapshot") ? JSON.stringify(extras[key]) : extras[key]);
		sets.push(`${column} = $${params.length}${key.endsWith("Snapshot") ? "::jsonb" : ""}`);
	}
	await db.query(`update service_order_requests set ${sets.join(", ")} where id = $1`, params);
}

async function getAutomationMetadata(session) {
	if (metadataCache && Date.now() < metadataExpiresAt) return metadataCache;
	if (metadataPromise) return metadataPromise;
	metadataPromise = hubsoftSyncProfiles
		.automationRequest(session, "/api/v1/ordem_servico/create")
		.then((payload) => {
			metadataCache = payload;
			metadataExpiresAt = Date.now() + 5 * 60 * 1000;
			return payload;
		})
		.finally(() => {
			metadataPromise = null;
		});
	return metadataPromise;
}

async function localOpenOrderCandidates(code) {
	const result = await db.query(
		`select distinct on (num_os)
		        num_os,
		        tipo,
		        to_char(data_cadastro at time zone 'UTC', 'YYYY-MM-DD') as data_cadastro_dia,
		        updated_at
		   from ordens_servico
		  where codigo_cliente = $1
		    and lower(coalesce(status, '')) in ('pendente', 'aguardando agendamento', 'aguardando_agendamento')
		    and coalesce(num_os, '') <> ''
		  order by num_os, updated_at desc`,
		[code],
	);
	return result.rows.sort(
		(left, right) => new Date(right.updated_at) - new Date(left.updated_at),
	);
}

function metadataOrderType(metadata = {}, description = "") {
	const target = normalize(description);
	return (metadata.tipos_ordem_servico || []).find(
		(item) => normalize(item.descricao || item.display) === target,
	);
}

async function findOpenOrderUnlocked(session, metadata, code) {
	const candidates = await localOpenOrderCandidates(code);
	const eligibleCandidates = candidates.filter((candidate) =>
		isAllowedSourceOrderType(candidate.tipo),
	);
	if (candidates.length && !eligibleCandidates.length) {
		throw blockedSourceOrderTypeError(candidates[0].tipo);
	}
	for (const candidate of eligibleCandidates) {
		const date = text(candidate.data_cadastro_dia);
		const type = metadataOrderType(metadata, candidate.tipo);
		if (!date || !type) continue;
		const body = {
			data_inicio: `${date}T00:00:00.000-03:00`,
			data_fim: `${date}T23:59:59.999-03:00`,
			tipo_data: "data_cadastro",
			status_ordem_servico: OPEN_STATUSES,
			tipo_ordem_servicos: [type],
			pagina: 1,
			itens_por_pagina: 1000,
		};
		for (let attempt = 1; attempt <= 3; attempt += 1) {
			const payload = await hubsoftSyncProfiles.automationRequest(
				session,
				"/api/v1/ordem_servico/consultar/paginado/1000?page=1",
				{ method: "POST", body },
			);
			const match = rowsOf(payload).find(
				(row) =>
					(clientCode(row) === code ||
						orderNumber(row) === digits(candidate.num_os)) &&
					OPEN_STATUSES.includes(orderStatus(row)),
			);
			if (match) {
				const sourceType = orderTypeName(match) || candidate.tipo;
				if (!isAllowedSourceOrderType(sourceType)) {
					throw blockedSourceOrderTypeError(sourceType);
				}
				Object.defineProperty(match, "__retiradasSourceOrderType", {
					value: sourceType,
					enumerable: false,
				});
				return match;
			}
			if (attempt < 3) {
				await new Promise((resolve) => setTimeout(resolve, attempt * 250));
			}
		}
	}
	return null;
}

async function findOpenOrder(session, metadata, code) {
	const previousLookup = orderLookupTail;
	let releaseLookup;
	orderLookupTail = new Promise((resolve) => {
		releaseLookup = resolve;
	});
	await previousLookup.catch(() => {});
	try {
		return await findOpenOrderUnlocked(session, metadata, code);
	} finally {
		releaseLookup();
	}
}

function findTargetType(metadata = {}) {
	return (metadata.tipos_ordem_servico || []).find(
		(item) =>
			Number(item.id_tipo_ordem_servico) === TARGET_TYPE_ID &&
			normalize(item.descricao || item.display) === TARGET_TYPE_NAME,
	);
}

function findTargetTechnician(metadata = {}, configuredName) {
	const target = normalize(configuredName);
	const candidates = [...(metadata.tecnicos || []), ...(metadata.usuarios || [])];
	const seen = new Set();
	const matches = candidates.filter((item) => {
		const id = text(item.id ?? item.id_usuario);
		const name = normalize(technicianName(item));
		const key = `${id}:${name}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return name === target;
	});
	if (matches.length !== 1) {
		const error = new Error(
			matches.length
				? `O nome ${configuredName} corresponde a mais de um tecnico no HubSoft.`
				: `Tecnico ${configuredName} nao encontrado no HubSoft. Revise o vinculo em Usuarios.`,
		);
		error.statusCode = 422;
		throw error;
	}
	return matches[0];
}

async function cancelExistingAppointment(session, order) {
	if (!hasScheduledAppointment(order)) return order;
	const appointmentId = Number(
		order?.agendamento_ordem_servico?.id_agendamento_ordem_servico,
	);
	if (appointmentId) {
		await hubsoftSyncProfiles.automationRequest(
			session,
			`/api/v1/configuracao/geral/agenda_ordem_servico/cancelar_agendamento/${appointmentId}`,
		);
		for (let attempt = 0; attempt < 10; attempt += 1) {
			if (attempt) await new Promise((resolve) => setTimeout(resolve, 500));
			const refreshed = orderPayload(
				await hubsoftSyncProfiles.automationRequest(
					session,
					`/api/v1/ordem_servico/${encodeURIComponent(orderId(order))}`,
				),
			);
			if (refreshed) order = refreshed;
			if (!order?.agendamento_ordem_servico?.id_agendamento_ordem_servico) break;
		}
		if (order?.agendamento_ordem_servico?.id_agendamento_ordem_servico) {
			throw new Error("O HubSoft nao confirmou a remocao do agendamento anterior.");
		}
	}
	order.id_agenda_ordem_servico = null;
	order.agenda = null;
	order.agendamento_ordem_servico = null;
	return order;
}

function verifyFinalState(order, code, configuredTechnician) {
	const errors = [];
	if (clientCode(order) !== code) errors.push("codigo do cliente");
	if (Number(orderType(order)?.id_tipo_ordem_servico || order.id_tipo_ordem_servico) !== TARGET_TYPE_ID) {
		errors.push("tipo CANCELAMENTO FTTH");
	}
	if (orderStatus(order) !== "pendente") errors.push("status Pendente");
	if (!orderTechnicians(order).some((item) => normalize(technicianName(item)) === normalize(configuredTechnician))) {
		errors.push("tecnico solicitado");
	}
	if (hasScheduledAppointment(order)) errors.push("agenda NENHUM");
	const appointmentType = text(order.tipo_agendamento).toLowerCase();
	if (appointmentType && appointmentType !== "manual") errors.push("agendamento manual");
	if (text(order.duracao) !== "00:59:00") errors.push("duracao 00:59:00");
	if (errors.length) {
		throw new Error(`A verificacao final nao confirmou: ${errors.join(", ")}.`);
	}
}

async function runRequest(id) {
	const found = await db.query("select * from service_order_requests where id = $1", [id]);
	const request = found.rows[0];
	if (!request || !["QUEUED", "RUNNING"].includes(request.status)) return;
	try {
		await db.query(
			`update service_order_requests
			    set status = 'RUNNING', started_at = coalesce(started_at, now()), error_message = null
			  where id = $1`,
			[id],
		);
		await updateProgress(id, "Validando vinculo do tecnico", 10);
		await updateProgress(id, "Validando sessao ativa do HubSoft", 20);
		const session = await hubsoftSyncProfiles.createAutomationSession();
		await updateProgress(id, "Carregando configuracao do HubSoft", 25);
		const metadata = await getAutomationMetadata(session);
		await updateProgress(id, "Preparando alteracao da O.S", 30);
		const targetType = findTargetType(metadata);
		if (!targetType) throw new Error("Tipo CANCELAMENTO FTTH (1487) nao encontrado no HubSoft.");
		const targetTechnician = findTargetTechnician(
			metadata,
			request.technician_hubsoft_name,
		);

		await updateProgress(id, "Localizando O.S aberta do cliente", 35);
		const summary = await findOpenOrder(session, metadata, request.client_code);
		if (!summary || !orderId(summary)) {
			const error = new Error("Nenhuma O.S aberta foi encontrada para este codigo de cliente.");
			error.statusCode = 404;
			throw error;
		}
		const serviceOrderId = orderId(summary);
		const summaryClientUrl = clientOrdersUrl(summary);
		const hubsoftUrl = summaryClientUrl || `${HUBSOFT_WEB_BASE_URL}/ordem_servico/${encodeURIComponent(serviceOrderId)}`;
		await updateProgress(id, "Carregando dados completos da O.S", 50, {
			serviceOrderId,
			serviceOrderNumber: orderNumber(summary),
			clientName: clientName(summary),
			hubsoftUrl,
		});
		let order = orderPayload(
			await hubsoftSyncProfiles.automationRequest(
				session,
				`/api/v1/ordem_servico/${encodeURIComponent(serviceOrderId)}`,
			),
		);
		if (!order) throw new Error("O HubSoft nao retornou os dados completos da O.S.");
		if (clientCode(order) !== request.client_code) {
			throw new Error("O codigo do cliente divergiu na confirmacao da O.S.");
		}
		const sourceOrderType =
			orderTypeName(order) ||
			orderTypeName(summary) ||
			text(summary.__retiradasSourceOrderType);
		if (!isAllowedSourceOrderType(sourceOrderType)) {
			throw blockedSourceOrderTypeError(sourceOrderType);
		}
		const finalHubsoftUrl = clientOrdersUrl(order) || hubsoftUrl;
		await updateProgress(id, "Dados da O.S confirmados", 55, {
			hubsoftUrl: finalHubsoftUrl,
		});
		await updateProgress(id, "Removendo agenda anterior", 60, {
			beforeSnapshot: snapshot(order),
			serviceOrderNumber: orderNumber(order),
			clientName: clientName(order),
		});
		order = await cancelExistingAppointment(session, order);
		await updateProgress(id, "Configurando tipo, tecnico e horario", 75);
		applyTargetState(order, targetType, targetTechnician);
		await hubsoftSyncProfiles.automationRequest(
			session,
			`/api/v1/ordem_servico/${encodeURIComponent(serviceOrderId)}`,
			{ method: "PUT", body: order },
		);
		await updateProgress(id, "Confirmando alteracoes no HubSoft", 90);
		const confirmed = orderPayload(
			await hubsoftSyncProfiles.automationRequest(
				session,
				`/api/v1/ordem_servico/${encodeURIComponent(serviceOrderId)}`,
			),
		);
		if (!confirmed) throw new Error("O HubSoft nao retornou a O.S para verificacao final.");
		verifyFinalState(confirmed, request.client_code, request.technician_hubsoft_name);
		const finalSnapshot = snapshot(confirmed);
		await db.query(
			`update service_order_requests
			    set status = 'COMPLETED', stage = 'Solicitacao concluida', progress = 100,
			        result_message = $2, after_snapshot = $3::jsonb,
			        service_order_number = $4, client_name = $5, completed_at = now()
			  where id = $1`,
			[
				id,
				`O.S ${finalSnapshot.numero || serviceOrderId} transferida para ${request.technician_hubsoft_name}.`,
				JSON.stringify(finalSnapshot),
				finalSnapshot.numero || orderNumber(summary),
				finalSnapshot.cliente || clientName(summary),
			],
		);
	} catch (error) {
		console.error(`[serviceOrderRequests] Falha na solicitacao ${id}:`, error?.message || error);
		await db.query(
			`update service_order_requests
			    set status = 'FAILED', stage = 'Falha na solicitacao',
			        error_message = $2, completed_at = now()
			  where id = $1`,
			[id, text(error?.message || error).slice(0, 1000)],
		).catch(() => {});
	}
}

function drainQueue() {
	while (activeWorkers < REQUEST_CONCURRENCY && pendingQueue.length) {
		const id = pendingQueue.shift();
		activeWorkers += 1;
		db.runWithRequestContext(
			{
				uid: "system:service-order-requests",
				email: "",
				role: "admin",
				profile: { nome: "Automacao de solicitacoes", role: "admin" },
			},
			() => runRequest(id),
		)
			.catch((error) => {
				console.error(
					`[serviceOrderRequests] Falha inesperada no worker ${id}:`,
					error?.message || error,
				);
			})
			.finally(() => {
				queuedIds.delete(id);
				activeWorkers -= 1;
				drainQueue();
			});
	}
}

function enqueue(id) {
	if (!id || queuedIds.has(id)) return;
	queuedIds.add(id);
	pendingQueue.push(id);
	drainQueue();
}

async function initialize() {
	if (initialized) return;
	initialized = true;
	await db.query(
		`update service_order_requests
		    set status = 'QUEUED', stage = 'Retomando solicitacao apos reinicio', progress = least(progress, 15)
		  where status = 'RUNNING'`,
	);
	const pending = await db.query(
		`select id from service_order_requests
		  where status = 'QUEUED'
		  order by created_at asc`,
	);
	for (const row of pending.rows) enqueue(row.id);
	void warmAutomationContext();
	if (!keepAliveStarted) {
		keepAliveStarted = true;
		const timer = setInterval(() => {
			void warmAutomationContext();
		}, 30 * 60 * 1000);
		timer.unref?.();
	}
}

async function warmAutomationContext() {
	try {
		const session = await hubsoftSyncProfiles.createAutomationSession();
		await getAutomationMetadata(session);
	} catch (error) {
		console.warn(
			"[serviceOrderRequests] Nao foi possivel aquecer a sessao HubSoft:",
			error?.message || error,
		);
	}
}

async function createRequest(payload = {}, user = {}) {
	const rawCode = text(payload.clientCode || payload.codigoCliente);
	const code = digits(rawCode);
	if (!code || code !== rawCode || code.length > 20) {
		const error = new Error("Informe somente o codigo numerico do cliente.");
		error.statusCode = 400;
		throw error;
	}
	const uid = requesterUid(user);
	const name = requesterName(user);
	const hubsoftName = await resolveTechnicianHubsoftName(payload, user);
	if (!uid || !name) {
		const error = new Error("Nao foi possivel identificar o tecnico autenticado.");
		error.statusCode = 401;
		throw error;
	}
	if (!hubsoftName) {
		const error = new Error(
			"Seu usuario nao possui tecnico HubSoft vinculado. Solicite ao administrador a configuracao do nome em Metas.",
		);
		error.statusCode = 422;
		throw error;
	}
	try {
		const result = await db.query(
			`insert into service_order_requests
			  (client_code, requester_uid, requester_email, requester_name, technician_hubsoft_name)
			 values ($1, $2, $3, $4, $5)
			 returning *`,
			[code, uid, requesterEmail(user) || null, name, hubsoftName],
		);
		const item = result.rows[0];
		enqueue(item.id);
		return { item: publicRow(item) };
	} catch (error) {
		if (error?.code === "23505") {
			const conflict = new Error("Este cliente ja possui uma solicitacao em processamento.");
			conflict.statusCode = 409;
			throw conflict;
		}
		throw error;
	}
}

async function resolveTechnicianHubsoftName(payload = {}, user = {}) {
	if (!canChooseTechnician(user)) return technicianHubsoftName(user);
	const requested = text(
		payload.technicianHubsoftName || payload.tecnicoHubsoftNome,
	);
	if (!requested) {
		const error = new Error("Selecione o tecnico de retirada que recebera a O.S.");
		error.statusCode = 400;
		throw error;
	}
	const technicians = await hubsoftSyncProfiles.listWithdrawalTechnicians();
	const match = technicians.find(
		(item) =>
			item.ativo === true &&
			normalize(item.nome_hubsoft) === normalize(requested) &&
			normalize(item.nome_hubsoft).includes("TECNICO RETIRADA"),
	);
	if (!match) {
		const error = new Error("Tecnico de retirada invalido ou inativo.");
		error.statusCode = 422;
		throw error;
	}
	return text(match.nome_hubsoft);
}

async function listSelectableTechnicians(user = {}) {
	if (!canChooseTechnician(user)) {
		const error = new Error("Permissao insuficiente.");
		error.statusCode = 403;
		throw error;
	}
	const technicians = await hubsoftSyncProfiles.listWithdrawalTechnicians();
	return {
		items: technicians
			.filter(
				(item) =>
					item.ativo === true &&
					normalize(item.nome_hubsoft).includes("TECNICO RETIRADA"),
			)
			.map((item) => ({
				id: item.id,
				name: text(item.nome_hubsoft),
				displayName: text(item.nome_exibicao || item.nome_hubsoft),
			})),
	};
}

async function getRequest(id, user = {}) {
	const result = await db.query("select * from service_order_requests where id = $1", [id]);
	const row = result.rows[0];
	if (!row) return null;
	if (!isAdmin(user) && row.requester_uid !== requesterUid(user)) {
		const error = new Error("Permissao insuficiente.");
		error.statusCode = 403;
		throw error;
	}
	return publicRow(row);
}

async function listOwnRequests(user = {}, options = {}) {
	const limit = Math.min(50, Math.max(1, Number(options.limit || 10)));
	const result = await db.query(
		`select * from service_order_requests
		  where requester_uid = $1
		  order by created_at desc
		  limit $2`,
		[requesterUid(user), limit],
	);
	return { items: result.rows.map(publicRow) };
}

async function listHistory(options = {}) {
	const page = Math.max(1, Number(options.page || 1));
	const limit = Math.min(100, Math.max(1, Number(options.limit || 20)));
	const offset = (page - 1) * limit;
	const status = text(options.status).toUpperCase();
	const search = text(options.q);
	const params = [];
	const where = [];
	if (["QUEUED", "RUNNING", "COMPLETED", "FAILED"].includes(status)) {
		params.push(status);
		where.push(`status = $${params.length}`);
	}
	if (search) {
		params.push(`%${search}%`);
		where.push(`(client_code ilike $${params.length} or requester_name ilike $${params.length} or technician_hubsoft_name ilike $${params.length} or coalesce(service_order_number, '') ilike $${params.length})`);
	}
	const clause = where.length ? `where ${where.join(" and ")}` : "";
	const count = await db.query(`select count(*)::int as total from service_order_requests ${clause}`, params);
	params.push(limit, offset);
	const result = await db.query(
		`select * from service_order_requests ${clause}
		  order by created_at desc
		  limit $${params.length - 1} offset $${params.length}`,
		params,
	);
	const total = Number(count.rows[0]?.total || 0);
	return {
		items: result.rows.map(publicRow),
		pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
	};
}

module.exports = {
	CREATE_PERMISSIONS,
	HISTORY_PERMISSIONS,
	__testables: {
		applyTargetState,
		canChooseTechnician,
		findOpenOrder,
		clientId,
		clientOrdersUrl,
		findTargetTechnician,
		isAllowedSourceOrderType,
		metadataOrderType,
		orderTypeName,
		saoPauloDateParts,
		verifyFinalState,
	},
	createRequest,
	getRequest,
	initialize,
	listHistory,
	listOwnRequests,
	listSelectableTechnicians,
};
