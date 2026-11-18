import { config } from "./config.js";

type EvolutionResult = { key?: { id?: string }; message?: { key?: { id?: string } }; [key: string]: unknown };

async function request(path: string, init: RequestInit = {}): Promise<EvolutionResult> {
  if (!config.evolutionApiKey) throw new Error("Evolution ainda não configurada.");
  const response = await fetch(`${config.evolutionUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", apikey: config.evolutionApiKey, ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({})) as EvolutionResult;
  if (!response.ok) throw new Error(`Evolution respondeu HTTP ${response.status}.`);
  return body;
}

export const evolution = {
  async status(): Promise<EvolutionResult> {
    try { return await request(`/instance/connectionState/${encodeURIComponent(config.evolutionInstance)}`); }
    catch { return request(`/instance/fetchInstances?instanceName=${encodeURIComponent(config.evolutionInstance)}`); }
  },
  async qr(): Promise<EvolutionResult> { return request(`/instance/connect/${encodeURIComponent(config.evolutionInstance)}`); },
  async create(): Promise<EvolutionResult> {
    return request("/instance/create", { method: "POST", body: JSON.stringify({ instanceName: config.evolutionInstance, qrcode: true, integration: "WHATSAPP-BAILEYS" }) });
  },
  async configureWebhook(url: string): Promise<EvolutionResult> {
    return request(`/webhook/set/${encodeURIComponent(config.evolutionInstance)}`, {
      method: "POST",
      body: JSON.stringify({ webhook: { enabled: true, url, webhookByEvents: false, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE"] } }),
    });
  },
  async sendText(number: string, text: string): Promise<EvolutionResult> {
    return request(`/message/sendText/${encodeURIComponent(config.evolutionInstance)}`, { method: "POST", body: JSON.stringify({ number: number.replace(/\D/g, ""), text }) });
  },
  async sendPoll(number: string, name: string): Promise<EvolutionResult> {
    return request(`/message/sendPoll/${encodeURIComponent(config.evolutionInstance)}`, {
      method: "POST",
      body: JSON.stringify({ number: number.replace(/\D/g, ""), name, selectableCount: 1, values: ["✅ Aprovar", "❌ Reprovar", "🔎 Acompanhar tratativa"] }),
    });
  },
};

export function providerMessageId(result: EvolutionResult): string {
  return String(result.key?.id || result.message?.key?.id || "");
}
