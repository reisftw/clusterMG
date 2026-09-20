import { requestVpsApi } from "../../../services/vpsApiClient";
import { createSecureId } from "../../../utils/secureRandom";

const executarComandoAgendamento = async (payload) =>
	requestVpsApi("/agendamento-esteira/commands", {
		method: "POST",
		body: JSON.stringify(payload || {}),
	});

const createRequestId = () => createSecureId("request");

export const registrarNaoRecolhido = async ({ agendamento, motivo }) => {
	const response = await executarComandoAgendamento({
		action: "appointment_not_collected",
		appointmentId: agendamento.id,
		reason: motivo,
		requestId: createRequestId(),
	});
	return response.data;
};

export const registrarRecolhido = async ({ agendamento }) => {
	const response = await executarComandoAgendamento({
		action: "appointment_collected",
		appointmentId: agendamento.id,
		requestId: createRequestId(),
	});
	return response.data;
};
