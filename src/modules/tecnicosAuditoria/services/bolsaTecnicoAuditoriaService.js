import { requestVpsApi } from "../../../services/vpsApiClient";

const BASE_PATH = "/tecnicos/auditoria/bolsa";

export async function buscarAuditoriaBolsaTecnico() {
  return requestVpsApi(BASE_PATH);
}

export async function buscarConfiguracaoAuditoriaBolsa() {
  return requestVpsApi(`${BASE_PATH}/config`);
}

export async function salvarConfiguracaoAuditoriaBolsa(config) {
  return requestVpsApi(`${BASE_PATH}/config`, {
    method: "PUT",
    body: JSON.stringify(config || {}),
  });
}

export async function buscarLogsAuditoriaBolsa({ page = 1, limit = 20 } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return requestVpsApi(`${BASE_PATH}/logs?${params.toString()}`);
}

export async function atualizarTodasBolsas() {
  return requestVpsApi(`${BASE_PATH}/refresh`, { method: "POST", body: "{}" });
}

export async function buscarJobAuditoriaBolsa(jobId) {
  return requestVpsApi(`${BASE_PATH}/jobs/${encodeURIComponent(jobId)}`);
}

export async function atualizarBolsaTecnico(id) {
  return requestVpsApi(`${BASE_PATH}/refresh/${encodeURIComponent(id)}`, { method: "POST", body: "{}" });
}

export async function rodarRotinaBolsaTecnico() {
  return requestVpsApi(`${BASE_PATH}/run-daily`, { method: "POST", body: "{}" });
}

export async function buscarRelatorioAuditoriaBolsa(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      params.set(key, String(value));
    }
  });
  return requestVpsApi(`${BASE_PATH}/relatorios?${params.toString()}`);
}

export async function atualizarMovimentacoesRelatorioBolsa(filters = {}) {
  return requestVpsApi(`${BASE_PATH}/relatorios/refresh`, {
    method: "POST",
    body: JSON.stringify(filters || {}),
  });
}

export async function enviarRelatorioAuditoriaBolsaEmail(payload = {}) {
  return requestVpsApi(`${BASE_PATH}/relatorios/email`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
