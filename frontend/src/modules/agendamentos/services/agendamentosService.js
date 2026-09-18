import { COLLECTIONS } from "../../../constants/dataCollections";
import { emitRealtimeUpdate } from "../../../services/realtimeEvents";
import { requestVpsApi } from "../../../services/vpsApiClient";

function emitAgendamentoUpsert(id, data) {
	emitRealtimeUpdate("acompanhamento", {
		action: "upsert",
		collectionPath: COLLECTIONS.AGENDAMENTOS,
		documentId: id || "",
		eventType: "agendamento_upsert",
		data: data || {},
	});
}

export const buscarAgendamentosDominio = async ({
	max = 10000,
	startDate = "",
	endDate = "",
} = {}) => {
	const params = new URLSearchParams({ max: String(max) });
	if (startDate) params.set("startDate", startDate);
	if (endDate) params.set("endDate", endDate);
	const response = await requestVpsApi(`/agendamentos?${params.toString()}`);
	return response.items || [];
};

export const buscarAgendamentos = async () =>
	(await buscarAgendamentosDominio()).sort((a, b) =>
		String(a.data || "").localeCompare(String(b.data || "")),
	);

export const buscarLogsAgendamentos = async ({ max = 3000 } = {}) => {
	const params = new URLSearchParams({ max: String(max) });
	const response = await requestVpsApi(`/agendamentos/logs?${params.toString()}`);
	return response.items || [];
};

export const buscarClienteAgendamentoPorCodigo = async (codigo) => {
	const normalized = String(codigo || "").replace(/\D/g, "");
	if (!normalized) return null;
	const response = await requestVpsApi(
		`/agendamentos/clientes/${encodeURIComponent(normalized)}`,
	);
	return response?.cliente || null;
};

export const criarAgendamento = async (dados) => {
	const now = new Date().toISOString();
	const data = {
		...dados,
		criado_em: now,
		atualizado_em: now,
	};
	const response = await requestVpsApi("/agendamentos", {
		method: "POST",
		body: JSON.stringify(data),
	});
	const result = response.item || { id: response.id };
	emitAgendamentoUpsert(result?.id, data);
	return result;
};

export const atualizarAgendamento = async (id, dados) => {
	const data = {
		...dados,
		atualizado_em: new Date().toISOString(),
	};
	const response = await requestVpsApi(`/agendamentos/${encodeURIComponent(id)}`, {
		method: "PUT",
		body: JSON.stringify(data),
	});
	const result = response.item || { id: response.id || id };
	emitAgendamentoUpsert(id, data);
	return result;
};

export const excluirAgendamento = async (id) => {
	await requestVpsApi(`/agendamentos/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
	emitRealtimeUpdate("acompanhamento", {
		collectionPath: COLLECTIONS.AGENDAMENTOS,
		documentId: id,
	});
};
