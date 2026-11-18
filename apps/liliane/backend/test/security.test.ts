import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:5432/test";
process.env.APP_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
process.env.INTEGRITY_KEY ||= "test-integrity-key";
process.env.EVOLUTION_WEBHOOK_SECRET ||= "test-webhook-secret";

test("TOTP segue o vetor oficial e aceita apenas a janela permitida", async () => {
  const { totp, verifyTotp } = await import("../src/totp.js");
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totp(secret, 59_000), "287082");
  assert.equal(verifyTotp(secret, "287082", 59_000), true);
  assert.equal(verifyTotp(secret, "287082", 180_000), false);
});

test("segredos são cifrados com autenticação e não aceitam adulteração", async () => {
  const { decrypt, encrypt } = await import("../src/crypto.js");
  const encrypted = encrypt("segredo-totp");
  assert.notEqual(encrypted, "segredo-totp");
  assert.equal(decrypt(encrypted), "segredo-totp");
  assert.throws(() => decrypt(`${encrypted.slice(0, -1)}A`));
});

test("identificador da mensagem aceita os formatos da Evolution", async () => {
  const { providerMessageId } = await import("../src/evolution.js");
  assert.equal(providerMessageId({ key: { id: "poll-1" } }), "poll-1");
  assert.equal(providerMessageId({ message: { key: { id: "poll-2" } } }), "poll-2");
  assert.equal(providerMessageId({}), "");
});

test("RBAC bloqueia operador em rota administrativa", async () => {
  const { requireRole } = await import("../src/auth.js");
  const response = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  let called = false;
  requireRole("ADMIN")({ authUser: { role: "OPERATOR" } } as never, response as never, () => { called = true; });
  assert.equal(response.statusCode, 403);
  assert.equal(called, false);
});

test("webhook reconhece voto verificável sem confiar no nome do contato", async () => {
  const { parseVoteEvent } = await import("../src/app.js");
  assert.deepEqual(parseVoteEvent({ data: {
    key: { remoteJid: "5531999999999@s.whatsapp.net" },
    message: { pollUpdateMessage: { pollCreationMessageKey: { id: "poll-42" }, vote: { name: "✅ Aprovar" } } },
  } }), { pollId: "poll-42", voter: "5531999999999@s.whatsapp.net", selected: "✅ aprovar" });
});
