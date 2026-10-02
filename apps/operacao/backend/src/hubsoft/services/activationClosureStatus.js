const { normalizeText, toNumberOrNull } = require("../utils/text");

const CONCLUDED_REASON_ID = 135;

const ACTIVATION_CLOSURE_STATUS = Object.freeze({
	OPEN: "ABERTA",
	IN_PROGRESS: "EM_ATENDIMENTO",
	CONCLUDED: "CONCLUIDA",
	CLOSED_WITHOUT_CONCLUSION: "ENCERRADA_SEM_CONCLUSAO",
});

function isFinalizedStatus(value) {
	const status = normalizeText(value);
	return status === "finalizado" || status === "finalizada" || status === "encerrado" || status === "encerrada";
}

function isConcludedReason(id, name) {
	const numericId = toNumberOrNull(id);
	const reason = normalizeText(name);
	return numericId === CONCLUDED_REASON_ID || reason === "concluida" || reason === "concluido";
}

function resolveActivationClosureStatus(snapshot = {}) {
	if (snapshot.executando === true) {
		return {
			status: ACTIVATION_CLOSURE_STATUS.IN_PROGRESS,
			label: "Em atendimento",
			reason: "executando=true",
		};
	}
	if (isFinalizedStatus(snapshot.status) || snapshot.executed_end_at) {
		if (isConcludedReason(snapshot.closure_reason_id, snapshot.closure_reason_name)) {
			return {
				status: ACTIVATION_CLOSURE_STATUS.CONCLUDED,
				label: "Concluída",
				reason: snapshot.closure_reason_id ? `motivo=${snapshot.closure_reason_id}` : "motivo=CONCLUIDA",
			};
		}
		return {
			status: ACTIVATION_CLOSURE_STATUS.CLOSED_WITHOUT_CONCLUSION,
			label: "Encerrada sem conclusão",
			reason: snapshot.closure_reason_name ? `motivo=${snapshot.closure_reason_name}` : "sem motivo conclusivo",
		};
	}
	return {
		status: ACTIVATION_CLOSURE_STATUS.OPEN,
		label: "Aberta",
		reason: snapshot.status ? `status=${snapshot.status}` : "sem finalização",
	};
}

module.exports = {
	ACTIVATION_CLOSURE_STATUS,
	CONCLUDED_REASON_ID,
	isConcludedReason,
	isFinalizedStatus,
	resolveActivationClosureStatus,
};
