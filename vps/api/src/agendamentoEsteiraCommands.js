const crypto = require("node:crypto");
const agendamentosRepository = require("./agendamentosRepository");

function normalizeDate(value, fieldName = "Data") {
	const date = String(value || "").trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		const error = new Error(`${fieldName} invalida.`);
		error.statusCode = 400;
		throw error;
	}
	const parsed = new Date(`${date}T12:00:00Z`);
	if (
		Number.isNaN(parsed.getTime()) ||
		parsed.toISOString().slice(0, 10) !== date
	) {
		const error = new Error(`${fieldName} invalida.`);
		error.statusCode = 400;
		throw error;
	}
	return date;
}

function normalizeSchedule(payload = {}) {
	const date = normalizeDate(payload.date, "Data de agendamento");
	const shift = String(payload.shift || "").trim();
	const time = String(payload.time || "").trim();

	if (!["Manha", "Tarde"].includes(shift)) {
		const error = new Error("Turno invalido.");
		error.statusCode = 400;
		throw error;
	}
	if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
		const error = new Error("Horario invalido.");
		error.statusCode = 400;
		throw error;
	}

	return { date, shift, time };
}

function userDisplayName(user = {}) {
	return String(
		user.profile?.nome ||
			user.profile?.name ||
			user.profile?.displayName ||
			user.email ||
			user.uid ||
			"",
	).trim();
}

function forbidden(message) {
	const error = new Error(message);
	error.statusCode = 403;
	throw error;
}

function failedPrecondition(message) {
	const error = new Error(message);
	error.statusCode = 409;
	throw error;
}

function safeKey(value) {
	return String(value || "nao_informado")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_");
}

async function handleSchedule(payload = {}, user = {}) {
	const blockId = String(payload.blockId || "").trim();
	const customerId = String(payload.customerId || "").trim();
	if (!blockId || !customerId) {
		const error = new Error("Bloco e cliente sao obrigatorios.");
		error.statusCode = 400;
		throw error;
	}

	const schedule = normalizeSchedule(payload);
	const block = await agendamentosRepository.getPipelineBlock(blockId);
	if (!block) {
		const error = new Error("Bloco nao encontrado.");
		error.statusCode = 404;
		throw error;
	}

	if (block.atendente_id && block.atendente_id !== user.uid) {
		forbidden("Bloco pertence a outro atendente.");
	}

	const customers = Array.isArray(block.clientes) ? block.clientes : [];
	const customer = customers.find((item) => item.id === customerId);
	if (!customer || customer.status !== "pendente") {
		failedPrecondition("Cliente indisponivel para agendamento.");
	}

	const now = new Date().toISOString();
	const appointmentId = crypto.randomUUID();
	const actorName = userDisplayName(user);
	const updatedCustomer = {
		...customer,
		status: "agendado",
		agendamento_id: appointmentId,
	};
	const updatedCustomers = customers.map((item) =>
		item.id === customerId ? updatedCustomer : item,
	);
	const pending = updatedCustomers.filter(
		(item) => item.status === "pendente",
	).length;
	const scheduled = updatedCustomers.filter(
		(item) => item.status === "agendado",
	).length;

	await agendamentosRepository.createAppointment(
		{
			codigo_cliente: String(customer.codigo_cliente || ""),
			cliente_nome: String(customer.nome || customer.cliente_nome || ""),
			cidade: String(customer.cidade || ""),
			regional: String(customer.regional || block.regional || ""),
			empresa: String(customer.empresa || block.empresa || "SEMPRE INTERNET"),
			telefones: Array.isArray(customer.telefones) ? customer.telefones : [],
			tecnico_nome: "A definir",
			data: schedule.date,
			turno: schedule.shift,
			hora: schedule.time,
			status: "Aguardando dia",
			observacao: schedule.time ? `Horario solicitado: ${schedule.time}` : "",
			origem: "esteira_backoffice",
			bloco_id: blockId,
			atendente_id: user.uid,
			atendente_nome: actorName,
			criado_por_id: user.uid,
			criado_por_nome: actorName,
			filial_id: user.profile?.regional || "",
			criado_em: now,
			atualizado_em: now,
		},
		{ id: appointmentId },
	);

	await agendamentosRepository.savePipelineBlock(blockId, {
			...block,
			clientes: updatedCustomers,
			pendentes: pending,
			agendados: scheduled,
			atualizado_em: now,
	});

	const catalog = await agendamentosRepository.getPipelineCatalog("ativo");
	if (catalog) {
		const summaries = Array.isArray(catalog.blocos)
			? catalog.blocos.map((item) =>
					item.id === blockId
						? {
								...item,
								pendentes: pending,
								agendados: scheduled,
								atualizado_em: now,
							}
						: item,
				)
			: [];
		await agendamentosRepository.savePipelineCatalog("ativo", {
				...catalog,
				blocos: summaries,
				atualizado_em: now,
		});
	}

	const month = schedule.date.slice(0, 7);
	const metricData =
		(await agendamentosRepository.getPipelineMetrics(month)) || { mes: month };
	const userKey = safeKey(user.uid);
	const cityKey = safeKey(customer.cidade);
	await agendamentosRepository.savePipelineMetrics(month, {
			...metricData,
			mes: month,
			agendamentos: Number(metricData.agendamentos || 0) + 1,
			agendamentos_por_usuario: {
				...(metricData.agendamentos_por_usuario || {}),
				[userKey]:
					Number(metricData.agendamentos_por_usuario?.[userKey] || 0) + 1,
			},
			agendamentos_por_cidade: {
				...(metricData.agendamentos_por_cidade || {}),
				[cityKey]:
					Number(metricData.agendamentos_por_cidade?.[cityKey] || 0) + 1,
			},
			usuarios: {
				...(metricData.usuarios || {}),
				[userKey]: actorName,
			},
			cidades: {
				...(metricData.cidades || {}),
				[cityKey]: customer.cidade || "",
			},
			atualizado_em: now,
	});

	const requestId = String(payload.requestId || crypto.randomUUID()).trim();
	await agendamentosRepository.recordPipelineLog(
		{
			tipo: "agendamento",
			schema_version: 2,
			request_id: requestId,
			bloco_id: blockId,
			cliente_id: customerId,
			codigo_cliente: String(customer.codigo_cliente || ""),
			agendamento_id: appointmentId,
			usuario_id: user.uid,
			usuario_nome: actorName,
			usuario_role: user.role,
			filial_id: user.profile?.regional || "",
			data: schedule.date,
			turno: schedule.shift,
			hora: schedule.time || null,
			criado_em: now,
		},
		{ id: requestId },
	);

	return {
		data: {
			cliente: updatedCustomer,
			clientes: updatedCustomers,
			pendentes: pending,
			agendados: scheduled,
			agendamentoId: appointmentId,
		},
	};
}

async function executeCommand(payload = {}, user = {}) {
	const action = String(payload.action || "")
		.trim()
		.toLowerCase();
	if (action === "schedule") {
		return handleSchedule(payload, user);
	}

	const error = new Error("Comando da esteira ainda nao migrado para VPS.");
	error.statusCode = 501;
	throw error;
}

module.exports = {
	executeCommand,
};
