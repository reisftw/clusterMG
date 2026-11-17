import crypto from "node:crypto";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT || 3401),
  databaseUrl: required("DATABASE_URL"),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "https://retiradas.tech/liliane",
  appEncryptionKey: Buffer.from(required("APP_ENCRYPTION_KEY"), "base64"),
  integrityKey: required("INTEGRITY_KEY"),
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 12),
  evolutionUrl: process.env.EVOLUTION_URL || "http://127.0.0.1:8082",
  evolutionApiKey: process.env.EVOLUTION_API_KEY || "",
  evolutionInstance: process.env.EVOLUTION_INSTANCE || "aprovacoes-lili",
  webhookSecret: required("EVOLUTION_WEBHOOK_SECRET"),
  decisionsEnabled: process.env.WHATSAPP_DECISIONS_ENABLED === "true",
  bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD || "",
  production: process.env.NODE_ENV === "production",
};

if (config.appEncryptionKey.length !== 32) {
  throw new Error("APP_ENCRYPTION_KEY deve conter 32 bytes em base64.");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}
