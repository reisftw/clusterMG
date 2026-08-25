import { expect, request, test } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "https://retiradas.tech";
const ADMIN_TOKEN = process.env.E2E_ADMIN_TOKEN || process.env.AUTH_TOKEN || "";
const VISITOR_TOKEN = process.env.E2E_VISITOR_TOKEN || "";
const LOGIN_EMAIL = process.env.E2E_LOGIN_EMAIL || "";
const LOGIN_PASSWORD = process.env.E2E_LOGIN_PASSWORD || "";
const RUN_MUTATIONS = process.env.E2E_MUTATION_ENABLED === "1";
const HAS_E2E_TARGET = Boolean(process.env.E2E_BASE_URL);

function authHeaders(token, csrfToken = "") {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
  };
}

async function makeApiContext(token = ADMIN_TOKEN, csrfToken = "") {
  return request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      Accept: "application/json",
      ...authHeaders(token, csrfToken),
    },
  });
}

async function getCsrfToken(api) {
  const response = await api.get("/api/auth/me");
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  return data.csrfToken || "";
}

test.describe("fluxos críticos E2E de segurança", () => {
  test.beforeEach(() => {
    test.skip(!HAS_E2E_TARGET, "Defina E2E_BASE_URL para rodar contra staging/local.");
  });

  test("login rejeita credenciais inválidas", async ({ request: api }) => {
    const response = await api.post("/api/auth/login", {
      data: {
        email: "usuario-invalido-e2e@example.invalid",
        password: "senha-invalida",
      },
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  });

  test("login válido autentica sessão quando credenciais de staging forem fornecidas", async ({ request: api }) => {
    test.skip(!LOGIN_EMAIL || !LOGIN_PASSWORD, "Defina E2E_LOGIN_EMAIL/E2E_LOGIN_PASSWORD em staging para rodar o login real.");

    const response = await api.post("/api/auth/login", {
      data: { email: LOGIN_EMAIL, password: LOGIN_PASSWORD },
    });

    expect(response.status()).toBeLessThan(500);
    const data = await response.json();
    expect(data.user || data.mfaRequired).toBeTruthy();
  });

  test("RBAC permite admin em rota administrativa", async () => {
    test.skip(!ADMIN_TOKEN, "Defina E2E_ADMIN_TOKEN ou AUTH_TOKEN para rodar E2E autenticado.");

    const adminApi = await makeApiContext(ADMIN_TOKEN);
    const adminResponse = await adminApi.get("/api/admin/api-status");
    expect(adminResponse.status()).toBe(200);
    await adminApi.dispose();
  });

  test("RBAC bloqueia visitante em rota administrativa", async () => {
    test.skip(!VISITOR_TOKEN, "Defina E2E_VISITOR_TOKEN para validar negação por papel real.");

    const visitorApi = await makeApiContext(VISITOR_TOKEN);
    const visitorResponse = await visitorApi.get("/api/admin/api-status");
    expect([401, 403]).toContain(visitorResponse.status());
    await visitorApi.dispose();
  });

  test("abre leituras críticas autenticadas sem erro 5xx", async () => {
    test.skip(!ADMIN_TOKEN, "Defina E2E_ADMIN_TOKEN ou AUTH_TOKEN para rodar E2E autenticado.");

    const api = await makeApiContext(ADMIN_TOKEN);
    const endpoints = [
      ["/api/auth/me", "login/sessão"],
      ["/api/public/dashboard", "dashboard"],
      ["/api/documents?collection=dashboard&limit=5&offset=0", "documentos"],
      ["/api/atendimento/stats", "atendimento"],
      ["/api/atendimento/cases?limit=5&offset=0", "casos de atendimento"],
      ["/api/mensageria/evolution/status", "mensageria evolution"],
      ["/api/agendamentos/confirmacao/envios?limit=5&offset=0", "envios de mensageria"],
      ["/api/financeiro/dashboard", "financeiro"],
      ["/api/insumos/requisicoes?limit=5&offset=0", "administrativo/insumos"],
    ];

    for (const [endpoint, label] of endpoints) {
      const response = await api.get(endpoint);
      expect(response.status(), `${label} (${endpoint})`).toBeLessThan(500);
      expect(response.status(), `${label} (${endpoint})`).not.toBe(404);
    }

    await api.dispose();
  });

  test("ações críticas rejeitam requisições sem CSRF", async () => {
    test.skip(!ADMIN_TOKEN, "Defina E2E_ADMIN_TOKEN ou AUTH_TOKEN para rodar E2E autenticado.");

    const api = await makeApiContext(ADMIN_TOKEN);
    const probes = [
      ["/api/mensageria/evolution/test", "envio de mensageria"],
      ["/api/financeiro/mockup", "operação financeira"],
      ["/api/documentos/submissions/e2e-invalid/review", "edição de documentos"],
      ["/api/atendimento/cases/e2e-invalid/reply", "resposta de atendimento"],
    ];

    for (const [endpoint, label] of probes) {
      const response = await api.post(endpoint, { data: {} });
      expect(response.status(), `${label} deve exigir CSRF/permissão`).toBeGreaterThanOrEqual(400);
      expect(response.status(), `${label} deve exigir CSRF/permissão`).toBeLessThan(500);
    }

    await api.dispose();
  });

  test("operações de escrita críticas rodam somente em staging mutável", async () => {
    test.skip(!RUN_MUTATIONS, "Defina E2E_MUTATION_ENABLED=1 somente em staging preparado para mutações.");
    test.skip(!ADMIN_TOKEN, "Defina E2E_ADMIN_TOKEN ou AUTH_TOKEN para rodar E2E autenticado.");

    const api = await makeApiContext(ADMIN_TOKEN);
    const csrfToken = await getCsrfToken(api);
    await api.dispose();

    const writeApi = await makeApiContext(ADMIN_TOKEN, csrfToken);
    const invalidFinanceiro = await writeApi.post("/api/financeiro/mockup", { data: { invalid: true } });
    expect(invalidFinanceiro.status()).toBeLessThan(500);

    const invalidAtendimento = await writeApi.post("/api/atendimento/cases/e2e-invalid/reply", {
      data: { message: "" },
    });
    expect(invalidAtendimento.status()).toBeGreaterThanOrEqual(400);
    expect(invalidAtendimento.status()).toBeLessThan(500);

    await writeApi.dispose();
  });
});
