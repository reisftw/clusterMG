import { requestVpsApi } from "../../../services/vpsApiClient";

export const DEFAULT_SENIOR_CONFIG = {
  enabled: false,
  environment: "homologacao",
  baseUrl: "",
  authType: "bearer",
  apiToken: "",
  username: "",
  password: "",
  companyCode: "",
  tenant: "",
  statusEndpoint: "/health",
  notes: "",
  lastValidatedAt: "",
  lastError: "",
};

export async function buscarConfigSenior() {
  return requestVpsApi("/admin/senior/config");
}

export async function salvarConfigSenior(config) {
  return requestVpsApi("/admin/senior/config", {
    method: "PUT",
    body: JSON.stringify(config || {}),
  });
}

export async function testarConexaoSenior() {
  return requestVpsApi("/admin/senior/test", {
    method: "POST",
    body: JSON.stringify({}),
  });
}
