import { requestVpsApi } from "../../../services/vpsApiClient";

const BASE_PATH = "/financeiro";

export async function buscarDashboardFinanceiro(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) search.set(key, String(value));
  });
  return requestVpsApi(`${BASE_PATH}/dashboard${search.size ? `?${search.toString()}` : ""}`);
}

export async function carregarMockupFinanceiro() {
  return requestVpsApi(`${BASE_PATH}/mockup`, {
    method: "POST",
    body: "{}",
  });
}

export async function limparMockupFinanceiro() {
  return requestVpsApi(`${BASE_PATH}/mockup`, {
    method: "DELETE",
  });
}

export async function buscarConfigPlanilhasFinanceiro() {
  return requestVpsApi(`${BASE_PATH}/sheets-config`);
}

export async function salvarConfigPlanilhasFinanceiro(config) {
  return requestVpsApi(`${BASE_PATH}/sheets-config`, {
    method: "PUT",
    body: JSON.stringify(config || {}),
  });
}

export async function testarPlanilhaFinanceiro(sourceId) {
  return requestVpsApi(`${BASE_PATH}/sheets-config/test/${encodeURIComponent(sourceId)}`, {
    method: "POST",
    body: "{}",
  });
}

export async function sincronizarPlanilhasFinanceiro() {
  return requestVpsApi(`${BASE_PATH}/sheets-config/sync`, {
    method: "POST",
    body: "{}",
  });
}

export async function buscarLogsPlanilhasFinanceiro(limit = 20) {
  return requestVpsApi(`${BASE_PATH}/sheets-config/logs?limit=${encodeURIComponent(limit)}`);
}
