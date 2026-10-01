const { normalizeText } = require("../utils/text");

const ACTIVATION_KANBAN_COLUMNS = Object.freeze([
	{ id: "to_schedule", label: "A Agendar / Pendente", description: "O.S pendentes ou aguardando agendamento." },
	{ id: "approval_pending", label: "Pendente de Aprovação", description: "O.S aguardando aprovação." },
	{ id: "in_progress", label: "Em Atendimento", description: "Execução em andamento no HubSoft." },
	{ id: "to_validate", label: "A Validar / Finalização", description: "Finalizada sem fechamento conclusivo." },
	{ id: "completed", label: "Concluída", description: "Execução encerrada e fechamento concluído." },
]);

function resolveActivationOperationalStatus(snapshot = {}) {
	const rawStatus = normalizeText(snapshot.status);
	const closure = normalizeText(snapshot.closure_reason_name);
	if (snapshot.executando === true) {
		return { id: "in_progress", label: "Em atendimento", reason: "executando=true" };
	}
	if (rawStatus === "pendente" || rawStatus === "aguardando agendamento" || rawStatus === "aguardando_agendamento") {
		return { id: "to_schedule", label: "A agendar / pendente", reason: `status=${snapshot.status || "vazio"}` };
	}
	if (rawStatus === "aguardando aprovacao" || rawStatus === "aguardando_aprovacao") {
		return { id: "approval_pending", label: "Pendente de aprovação", reason: `status=${snapshot.status}` };
	}
	if (snapshot.executed_end_at && (closure.includes("concluida") || closure.includes("concluida") || rawStatus === "finalizado")) {
		return { id: "completed", label: "Concluída", reason: "executed_end_at + fechamento/status conclusivo" };
	}
	if (snapshot.executed_end_at) {
		return { id: "to_validate", label: "A validar / finalização", reason: "executed_end_at sem conclusão confirmada" };
	}
	return { id: "to_schedule", label: "A agendar / pendente", reason: "fallback operacional" };
}

module.exports = { ACTIVATION_KANBAN_COLUMNS, resolveActivationOperationalStatus };
