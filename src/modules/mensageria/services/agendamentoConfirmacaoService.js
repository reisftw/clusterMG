import { requestVpsApi } from "../../../services/vpsApiClient";

export const DEFAULT_CONFIRMATION_CONFIG = {
  enabled: false,
  dailySendTime: "08:00",
  escalationMinutes: 60,
  sendSameDayNewAppointments: true,
  acceptedReplies: ["SIM", "AGENDADO"],
  evolutionEnabled: false,
  evolutionBaseUrl: "",
  evolutionInstance: "",
  evolutionApiKey: "",
  evolutionSendTextPath: "/message/sendText/{instance}",
  evolutionWebhookUrl: "https://retiradas.tech/api/webhooks/evolution-confirmacao",
  morningTemplate:
    "Bom dia, {responsavel_nome}!\n\nTemos {total} agendamento(s) para acompanhamento hoje ({data}).\n\n{lista_clientes}\n\nResponda SIM ou AGENDADO para confirmar ciência.",
  sameDayTemplate:
    "Novo agendamento para hoje:\n\nCliente: {cliente_nome}\nCódigo: {codigo_cliente}\nHorário: {hora}\nCidade: {cidade}\nAgendado por: {agendado_por}\n\nResponda SIM ou AGENDADO para confirmar ciência.",
  escalationTemplate:
    "{responsavel_anterior} foi acionado(a) e não confirmou em {minutos} minuto(s).\n\nSegue a lista para acompanhamento:\n\n{lista_clientes}\n\nResponda SIM ou AGENDADO para confirmar ciência.",
};

export async function buscarConfigConfirmacaoAgendamentos() {
  const response = await requestVpsApi("/agendamentos/confirmacao/config");
  return {
    config: { ...DEFAULT_CONFIRMATION_CONFIG, ...(response?.config || {}) },
    worker: response?.worker || {},
  };
}

export async function salvarConfigConfirmacaoAgendamentos(config) {
  const response = await requestVpsApi("/agendamentos/confirmacao/config", {
    method: "PUT",
    body: JSON.stringify({
      ...DEFAULT_CONFIRMATION_CONFIG,
      ...(config || {}),
      escalationMinutes: Math.max(5, Number(config?.escalationMinutes || 60)),
    }),
  });
  return { ...DEFAULT_CONFIRMATION_CONFIG, ...(response?.config || {}) };
}

export async function executarConfirmacaoAgendamentos({ forceMorning = false } = {}) {
  return requestVpsApi("/agendamentos/confirmacao/run", {
    method: "POST",
    body: JSON.stringify({ forceMorning }),
  });
}

export async function enviarTesteConfirmacaoAgendamentos(payload = {}) {
  return requestVpsApi("/agendamentos/confirmacao/test", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function preencherResponsavelConfirmacaoAgendamentos(trackId, payload = {}) {
  return requestVpsApi(`/agendamentos/confirmacao/envios/${encodeURIComponent(trackId)}/responsavel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function buscarStatusEvolutionConfirmacaoAgendamentos() {
  return requestVpsApi("/agendamentos/confirmacao/evolution/status");
}

export async function conectarEvolutionConfirmacaoAgendamentos() {
  return requestVpsApi("/agendamentos/confirmacao/evolution/connect", { method: "POST" });
}

export async function desconectarEvolutionConfirmacaoAgendamentos() {
  return requestVpsApi("/agendamentos/confirmacao/evolution/disconnect", { method: "POST" });
}

export async function configurarWebhookEvolutionConfirmacaoAgendamentos(webhookUrl) {
  return requestVpsApi("/agendamentos/confirmacao/evolution/webhook", {
    method: "POST",
    body: JSON.stringify({ webhookUrl }),
  });
}

export async function buscarEnviosConfirmacaoAgendamentos({ limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const response = await requestVpsApi(`/agendamentos/confirmacao/envios?${params.toString()}`);
  return response?.items || [];
}

export async function buscarLogsConfirmacaoAgendamentos({ limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const response = await requestVpsApi(`/agendamentos/confirmacao/logs?${params.toString()}`);
  return response?.items || [];
}

export async function buscarPreviaConfirmacaoAgendamentos({ dateKey = "", daysAhead = 1 } = {}) {
  const params = new URLSearchParams();
  if (dateKey) params.set("dateKey", dateKey);
  params.set("daysAhead", String(daysAhead));
  return requestVpsApi(`/agendamentos/confirmacao/preview?${params.toString()}`);
}

export async function buscarRelatorioConfirmacaoAgendamentos() {
  return requestVpsApi("/agendamentos/confirmacao/relatorio");
}
