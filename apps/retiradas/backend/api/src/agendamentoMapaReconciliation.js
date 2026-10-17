const db = require("./db");
const agendamentosRepository = require("./agendamentosRepository");
const documents = require("./documents");
const notifications = require("./notificationsService");

const APPOINTMENTS_COLLECTION = "agendamentos";
const MAP_COLLECTION = "ordens_abertas";
const STATUS_WAITING = "Aguardando dia";
const STATUS_SENT_TO_TECHNICIAN = "Enviado ao tecnico";
const STATUS_COLLECTED = "Concluido";
const STATUS_NOT_COLLECTED = "Nao recolhido";
const COMPLETED_APPOINTMENTS_INTERVAL_MS = 60 * 60 * 1000;

let completedAppointmentsWorkerTimer = null;
let completedAppointmentsInitialRunTimer = null;
let completedAppointmentsWorkerRunning = false;
let completedAppointmentsLastRun = null;
let completedAppointmentsLastError = "";

function nowIso() {
	return new Date().toISOString();
}

function normalizeText(value) {
	return String(value || "")
		.trim()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function normalizeCode(value) {
	return String(value || "")
		.replace(/\D+/g, "")
		.trim();
}

function normalizeServiceOrder(value) {
	return String(value || "")
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "")
		.replace(/^OS/, "")
		.trim();
}

function firstText(data = {}, fields = []) {
	for (const field of fields) {
		const value = data[field];
		if (value !== undefined && value !== null && String(value).trim())
			return String(value).trim();
	}
	return "";
}

function toDateKey(value) {
	const text = String(value || "").trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
	const parsed = new Date(text);
	if (Number.isNaN(parsed.getTime())) return "";
	return parsed.toISOString().slice(0, 10);
}

function currentDateKey() {
	const formatter = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	return formatter.format(new Date());
}

function minDateByMonthsBack(monthsBack) {
	if (monthsBack === null || monthsBack === undefined) return "";
	const parsed = Number(monthsBack);
	if (!Number.isFinite(parsed) || parsed < 0) return "";
	const today = new Date(`${currentDateKey()}T12:00:00Z`);
	today.setUTCMonth(today.getUTCMonth() - Math.trunc(parsed), 1);
	return today.toISOString().slice(0, 10);
}

function isWaitingAppointment(data = {}) {
	return (
		normalizeText(data.status || STATUS_WAITING) ===
		normalizeText(STATUS_WAITING)
	);
}

function isSentToTechnicianAppointment(data = {}) {
	return (
		normalizeText(data.status) === normalizeText(STATUS_SENT_TO_TECHNICIAN)
	);
}

function buildOrderIndexes(orders = []) {
	const codes = new Set();
	const names = new Set();
	const serviceOrders = new Set();
	const byCode = new Map();
	const byName = new Map();
	const byServiceOrder = new Map();

	orders.forEach((record) => {
		const data = record.data || record || {};
		const code = normalizeCode(
			firstText(data, [
				"codigo_cliente",
				"codigo",
				"cod_cliente",
				"id_cliente",
			]),
		);
		const name = normalizeText(
			firstText(data, [
				"nome_cliente",
				"cliente_nome",
				"cliente",
				"nome_razaosocial",
				"assinante",
			]),
		);
		const serviceOrder = normalizeServiceOrder(
			firstText(data, [
				"num_os",
				"numero_os",
				"os",
				"ordem_servico",
				"ordem_de_servico",
			]),
		);
		if (code) {
			codes.add(code);
			if (!byCode.has(code)) byCode.set(code, data);
		}
		if (name) {
			names.add(name);
			if (!byName.has(name)) byName.set(name, data);
		}
		if (serviceOrder) {
			serviceOrders.add(serviceOrder);
			if (!byServiceOrder.has(serviceOrder))
				byServiceOrder.set(serviceOrder, data);
		}
	});

	return { codes, names, serviceOrders, byCode, byName, byServiceOrder };
}

function findMatchingOrder(appointment = {}, indexes) {
	const serviceOrder = normalizeServiceOrder(
		firstText(appointment, [
			"os",
			"num_os",
			"numero_os",
			"ordem_servico",
			"ordem_de_servico",
		]),
	);
	const code = normalizeCode(
		firstText(appointment, [
			"codigo_cliente",
			"codigo",
			"cod_cliente",
			"id_cliente",
		]),
	);
	const name = normalizeText(
		firstText(appointment, ["cliente_nome", "nome_cliente", "cliente", "nome"]),
	);

	if (serviceOrder && indexes.serviceOrders.has(serviceOrder)) {
		return {
			matched: true,
			reason: "os",
			order: indexes.byServiceOrder.get(serviceOrder) || null,
		};
	}
	if (code && indexes.codes.has(code)) {
		return {
			matched: true,
			reason: "codigo_cliente",
			order: indexes.byCode.get(code) || null,
		};
	}
	if (name && indexes.names.has(name)) {
		return {
			matched: true,
			reason: "nome_cliente",
			order: indexes.byName.get(name) || null,
		};
	}
	return { matched: false, reason: "", order: null };
}

function shouldEvaluateSentToTechnicianAppointment(data = {}, { today }) {
	const dateKey = toDateKey(
		data.data || data.data_agendamento || data.agendamento_data,
	);
	if (!dateKey) return { ok: false, reason: "sem_data" };
	if (dateKey > today) return { ok: false, reason: "ainda_no_prazo" };
	if (!isSentToTechnicianAppointment(data))
		return { ok: false, reason: "status_nao_elegivel" };
	return { ok: true, dateKey };
}

async function listCollection(collectionPath) {
	if (collectionPath === APPOINTMENTS_COLLECTION) {
		return agendamentosRepository.listAllAppointmentDocuments();
	}
	return documents.listAllDocuments(collectionPath);
}

function shouldEvaluateAppointment(data = {}, { today, minDate }) {
	const dateKey = toDateKey(
		data.data || data.data_agendamento || data.agendamento_data,
	);
	if (!dateKey) return { ok: false, reason: "sem_data" };
	if (dateKey >= today) return { ok: false, reason: "ainda_no_prazo" };
	if (minDate && dateKey < minDate)
		return { ok: false, reason: "fora_do_periodo" };
	if (!isWaitingAppointment(data))
		return { ok: false, reason: "status_nao_elegivel" };
	return { ok: true, dateKey };
}

function actorUser(user = {}, fallbackName = "Sistema") {
	return {
		uid: user.uid || user.id || "sistema",
		nome: user.profile?.nome || user.nome || user.displayName || fallbackName,
		email: user.email || "",
		role: user.role || user.profile?.role || "",
	};
}

async function notifyNotCollected({ appointment, documentId, match, user }) {
	const clientName =
		firstText(appointment, [
			"cliente_nome",
			"nome_cliente",
			"cliente",
			"nome",
		]) || "Cliente";
	const code = firstText(appointment, [
		"codigo_cliente",
		"codigo",
		"cod_cliente",
	]);
	const date = firstText(appointment, ["data", "data_agendamento"]);
	const time = firstText(appointment, ["hora", "horario"]);
	const dedupeDate = date || "sem-data";
	const dedupeKey = `agendamento-nao-recolhido-${documentId}-${dedupeDate}`;
	if (await notifications.notificationExists(dedupeKey)) return;

	await notifications.createNotification({
		type: "agendamento_nao_recolhido_mapa",
		title: "Agendamento nao recolhido",
		message: `${clientName}${code ? ` (${code})` : ""} ainda aparece no mapa de O.S. apos o agendamento${date ? ` de ${date}` : ""}.`,
		targetPath: "/agendamentos",
		severity: "warning",
		user: actorUser(user),
		targets: { roles: ["admin", "backoffice_retirada"] },
		dedupeKey,
		meta: {
			agendamentoId: documentId,
			codigoCliente: code,
			clienteNome: clientName,
			data: date,
			hora: time,
			matchReason: match.reason,
			os: firstText(match.order || {}, ["num_os", "os", "numero_os"]),
		},
	});
}

async function updateAppointment(record, nextData, { client } = {}) {
	await agendamentosRepository.saveAppointment(record.documentId, nextData, { client });
}

async function clearPreviousReconciliationLogs() {
	await agendamentosRepository.deleteAppointmentLogsByType("verificacao_mapa");
}

async function saveReconciliationLog({
	record,
	before,
	after,
	match,
	reason,
	checkedAt,
	client,
}) {
	const id = `mapa_${checkedAt.replace(/\D/g, "")}_${record.documentId}`;
	await agendamentosRepository.recordAppointmentLog(
		{
			tipo: "verificacao_mapa",
			origem: reason,
			agendamento_id: record.documentId,
			codigo_cliente: firstText(before, [
				"codigo_cliente",
				"codigo",
				"cod_cliente",
			]),
			cliente_nome: firstText(before, [
				"cliente_nome",
				"nome_cliente",
				"cliente",
				"nome",
			]),
			cidade: firstText(before, ["cidade"]),
			data_agendamento: firstText(before, ["data", "data_agendamento"]),
			hora: firstText(before, ["hora", "horario"]),
			status_anterior: before.status || STATUS_WAITING,
			status_novo: after.status,
			resultado: match.matched ? "nao_recolhido" : "recolhido",
			motivo: match.matched
				? "Cliente ainda aparece no mapa de O.S."
				: "Cliente nao localizado no mapa de O.S.",
			criterio: match.reason || "codigo_cliente_nome",
			os_encontrada: firstText(match.order || {}, [
				"num_os",
				"os",
				"numero_os",
			]),
			criado_em: checkedAt,
		},
		{ id, client },
	);
}

async function reconcileAppointmentsWithMapa({
	user = {},
	monthsBack = null,
	reason = "mapa_import",
} = {}) {
	const [orders, appointments] = await Promise.all([
		listCollection(MAP_COLLECTION),
		listCollection(APPOINTMENTS_COLLECTION),
	]);
	const indexes = buildOrderIndexes(orders);
	const today = currentDateKey();
	const minDate = minDateByMonthsBack(monthsBack);
	const checkedAt = nowIso();
	await clearPreviousReconciliationLogs();

	const summary = {
		ok: true,
		reason,
		checkedAt,
		today,
		minDate: minDate || null,
		mapOrders: orders.length,
		checked: 0,
		recolhidos: 0,
		naoRecolhidos: 0,
		skipped: {},
		updated: [],
	};

	for (const record of appointments) {
		const data = record.data || {};
		const eligibility = shouldEvaluateAppointment(data, { today, minDate });
		if (!eligibility.ok) {
			summary.skipped[eligibility.reason] =
				(summary.skipped[eligibility.reason] || 0) + 1;
			continue;
		}

		summary.checked += 1;
		const match = findMatchingOrder(data, indexes);
		const nextStatus = match.matched ? STATUS_NOT_COLLECTED : STATUS_COLLECTED;
		const nextData = {
			...data,
			status: nextStatus,
			verificacao_mapa: {
				status: match.matched ? "ainda_no_mapa" : "nao_encontrado_no_mapa",
				verificado_em: checkedAt,
				origem: reason,
				criterio: match.reason || "codigo_cliente_nome",
				os_encontrada: firstText(match.order || {}, [
					"num_os",
					"os",
					"numero_os",
				]),
			},
			atualizado_em: checkedAt,
		};

		if (match.matched) {
			nextData.motivo_nao_recolhido = "Cliente ainda aparece no mapa de O.S.";
			nextData.nao_recolhido_em = checkedAt;
			summary.naoRecolhidos += 1;
		} else {
			nextData.recolhido_em = checkedAt;
			nextData.motivo_recolhido = "Cliente nao localizado no mapa de O.S.";
			summary.recolhidos += 1;
		}

		// Fase F (docs/TECHNICAL-AUDIT.md, achado #9): atualizar o
		// agendamento e gravar o log da reconciliacao agora sao atomicos —
		// antes eram duas escritas separadas sem transacao; se o processo
		// falhasse entre as duas, o agendamento ficava com o status novo mas
		// sem o log correspondente daquela verificacao.
		const client = await db.connect();
		try {
			await client.query("begin");
			await updateAppointment(record, nextData, { client });
			await saveReconciliationLog({
				record,
				before: data,
				after: nextData,
				match,
				reason,
				checkedAt,
				client,
			});
			await client.query("commit");
		} catch (error) {
			await client.query("rollback").catch(() => {});
			throw error;
		} finally {
			client.release();
		}
		if (match.matched)
			await notifyNotCollected({
				appointment: nextData,
				documentId: record.documentId,
				match,
				user,
			});

		summary.updated.push({
			id: record.documentId,
			status: nextStatus,
			codigoCliente: firstText(data, [
				"codigo_cliente",
				"codigo",
				"cod_cliente",
			]),
			clienteNome: firstText(data, [
				"cliente_nome",
				"nome_cliente",
				"cliente",
				"nome",
			]),
		});
	}

	return summary;
}

async function saveCompletedAppointmentLog({
	record,
	before,
	after,
	reason,
	checkedAt,
	client,
}) {
	const id = `os_finalizada_${checkedAt.replace(/\D/g, "")}_${record.documentId}`;
	await agendamentosRepository.recordAppointmentLog(
		{
			tipo: "conclusao_automatica_os_finalizada",
			origem: reason,
			agendamento_id: record.documentId,
			codigo_cliente: firstText(before, [
				"codigo_cliente",
				"codigo",
				"cod_cliente",
			]),
			cliente_nome: firstText(before, [
				"cliente_nome",
				"nome_cliente",
				"cliente",
				"nome",
			]),
			cidade: firstText(before, ["cidade"]),
			data_agendamento: firstText(before, ["data", "data_agendamento"]),
			hora: firstText(before, ["hora", "horario"]),
			status_anterior: before.status || STATUS_SENT_TO_TECHNICIAN,
			status_novo: after.status,
			resultado: "concluido",
			motivo: "O.S. nao localizada no mapa de O.S. em aberto.",
			criterio: "os_codigo_cliente_nome",
			os_encontrada: firstText(before, ["os", "num_os", "numero_os"]),
			criado_em: checkedAt,
		},
		{ id, client },
	);
}

async function reconcileSentTechnicianAppointmentsWithMapa({
	reason = "scheduler_horario",
} = {}) {
	const [orders, appointments] = await Promise.all([
		listCollection(MAP_COLLECTION),
		listCollection(APPOINTMENTS_COLLECTION),
	]);
	const checkedAt = nowIso();
	const today = currentDateKey();
	const summary = {
		ok: true,
		reason,
		checkedAt,
		today,
		mapOrders: orders.length,
		checked: 0,
		concluidos: 0,
		aindaAbertos: 0,
		skipped: {},
		updated: [],
	};

	if (!orders.length) {
		summary.skipped.mapa_vazio = appointments.length;
		return summary;
	}

	const indexes = buildOrderIndexes(orders);
	for (const record of appointments) {
		const data = record.data || {};
		const eligibility = shouldEvaluateSentToTechnicianAppointment(data, {
			today,
		});
		if (!eligibility.ok) {
			summary.skipped[eligibility.reason] =
				(summary.skipped[eligibility.reason] || 0) + 1;
			continue;
		}

		summary.checked += 1;
		const match = findMatchingOrder(data, indexes);
		if (match.matched) {
			summary.aindaAbertos += 1;
			continue;
		}

		const nextData = {
			...data,
			status: STATUS_COLLECTED,
			recolhido_em: checkedAt,
			motivo_recolhido: "O.S. nao localizada no mapa de O.S. em aberto.",
			verificacao_mapa: {
				status: "nao_encontrado_no_mapa",
				verificado_em: checkedAt,
				origem: reason,
				criterio: "os_codigo_cliente_nome",
			},
			atualizado_em: checkedAt,
		};

		const client = await db.connect();
		try {
			await client.query("begin");
			await updateAppointment(record, nextData, { client });
			await saveCompletedAppointmentLog({
				record,
				before: data,
				after: nextData,
				reason,
				checkedAt,
				client,
			});
			await client.query("commit");
		} catch (error) {
			await client.query("rollback").catch(() => {});
			throw error;
		} finally {
			client.release();
		}

		summary.concluidos += 1;
		summary.updated.push({
			id: record.documentId,
			status: STATUS_COLLECTED,
			os: firstText(data, ["os", "num_os", "numero_os"]),
		});
	}

	return summary;
}

async function runCompletedAppointmentsReconciliation() {
	if (completedAppointmentsWorkerRunning) {
		return { ok: true, skipped: "em_execucao" };
	}
	completedAppointmentsWorkerRunning = true;
	completedAppointmentsLastRun = nowIso();
	completedAppointmentsLastError = "";
	try {
		const summary = await reconcileSentTechnicianAppointmentsWithMapa();
		console.log(
			`[agendamentoMapaReconciliation] Verificacao horaria concluida: ${summary.concluidos} agendamento(s) concluidos.`,
		);
		return summary;
	} catch (error) {
		completedAppointmentsLastError =
			error?.message || "Falha na verificacao horaria de agendamentos.";
		console.error(
			"[agendamentoMapaReconciliation] Falha na verificacao horaria:",
			error,
		);
		throw error;
	} finally {
		completedAppointmentsWorkerRunning = false;
	}
}

function startCompletedAppointmentsWorker() {
	if (completedAppointmentsWorkerTimer) return;
	completedAppointmentsWorkerTimer = setInterval(() => {
		runCompletedAppointmentsReconciliation().catch(() => {});
	}, COMPLETED_APPOINTMENTS_INTERVAL_MS);
	completedAppointmentsWorkerTimer.unref?.();
	completedAppointmentsInitialRunTimer = setTimeout(() => {
		completedAppointmentsInitialRunTimer = null;
		runCompletedAppointmentsReconciliation().catch(() => {});
	}, 60 * 1000);
	completedAppointmentsInitialRunTimer.unref?.();
	console.log(
		"[agendamentoMapaReconciliation] Rotina horaria de conclusao automatica iniciada.",
	);
}

function stopCompletedAppointmentsWorker() {
	if (completedAppointmentsWorkerTimer) {
		clearInterval(completedAppointmentsWorkerTimer);
	}
	if (completedAppointmentsInitialRunTimer) {
		clearTimeout(completedAppointmentsInitialRunTimer);
	}
	completedAppointmentsWorkerTimer = null;
	completedAppointmentsInitialRunTimer = null;
	completedAppointmentsWorkerRunning = false;
}

function getCompletedAppointmentsWorkerStatus() {
	return {
		active: Boolean(completedAppointmentsWorkerTimer),
		running: completedAppointmentsWorkerRunning,
		lastRun: completedAppointmentsLastRun,
		lastError: completedAppointmentsLastError,
		intervalMs: COMPLETED_APPOINTMENTS_INTERVAL_MS,
	};
}

module.exports = {
	reconcileAppointmentsWithMapa,
	reconcileSentTechnicianAppointmentsWithMapa,
	runCompletedAppointmentsReconciliation,
	startCompletedAppointmentsWorker,
	stopCompletedAppointmentsWorker,
	getCompletedAppointmentsWorkerStatus,
};
