import { COLLECTIONS } from "../../../constants/dataCollections";
import {
  createVpsDocument,
  deleteVpsDocument,
  listAllVpsDocuments,
  requestVpsApi,
  updateVpsDocument,
} from "../../../services/vpsApiClient";
import { emitRealtimeUpdate } from "../../../services/realtimeEvents";

function emitAgendamentoUpsert(id, data) {
  emitRealtimeUpdate("acompanhamento", {
    action: "upsert",
    collectionPath: COLLECTIONS.AGENDAMENTOS,
    documentId: id || "",
    eventType: "agendamento_upsert",
    data: data || {},
  });
}

export const buscarAgendamentos = async () =>
  (await listAllVpsDocuments(COLLECTIONS.AGENDAMENTOS, { pageSize: 1000, max: 10000 }))
    .sort((a, b) => String(a.data || "").localeCompare(String(b.data || "")));

export const buscarClienteAgendamentoPorCodigo = async (codigo) => {
  const normalized = String(codigo || "").replace(/\D/g, "");
  if (!normalized) return null;
  const response = await requestVpsApi(`/agendamentos/clientes/${encodeURIComponent(normalized)}`);
  return response?.cliente || null;
};

export const criarAgendamento = async (dados) => {
  const now = new Date().toISOString();
  const data = {
    ...dados,
    criado_em: now,
    atualizado_em: now,
  };
  const result = await createVpsDocument(COLLECTIONS.AGENDAMENTOS, {
    ...data,
  });
  emitAgendamentoUpsert(result?.id, data);
  return result;
};

export const atualizarAgendamento = async (id, dados) => {
  const data = {
    ...dados,
    atualizado_em: new Date().toISOString(),
  };
  const result = await updateVpsDocument(`${COLLECTIONS.AGENDAMENTOS}/${id}`, {
    ...data,
  });
  emitAgendamentoUpsert(id, data);
  return result;
};

export const excluirAgendamento = async (id) => {
  await deleteVpsDocument(`${COLLECTIONS.AGENDAMENTOS}/${id}`);
  emitRealtimeUpdate("acompanhamento", { collectionPath: COLLECTIONS.AGENDAMENTOS, documentId: id });
};

