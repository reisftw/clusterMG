import { requestVpsApi } from "./vpsApiClient";

export async function listarNotificacoesInternas({ limit = 20, offset = 0, type = "", severity = "", unread = false } = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (type) params.set("type", type);
  if (severity) params.set("severity", severity);
  if (unread) params.set("unread", "true");
  return requestVpsApi(`/notifications?${params.toString()}`);
}

export async function obterEstatisticasNotificacoes() {
  return requestVpsApi("/notifications/stats");
}

export async function obterContadoresNotificacoes() {
  return requestVpsApi("/notifications/counters");
}

export async function obterPreferenciasNotificacoes() {
  return requestVpsApi("/notifications/preferences");
}

export async function salvarPreferenciasNotificacoes(preferences = {}) {
  return requestVpsApi("/notifications/preferences", {
    method: "PUT",
    body: JSON.stringify(preferences),
  });
}

export async function marcarNotificacoesLidas({ ids = [], all = false } = {}) {
  return requestVpsApi("/notifications/read", {
    method: "POST",
    body: JSON.stringify({ ids, all }),
  });
}

export async function verificarAlertasCriticos() {
  return requestVpsApi("/notifications/check-critical", {
    method: "POST",
    body: JSON.stringify({}),
  });
}
