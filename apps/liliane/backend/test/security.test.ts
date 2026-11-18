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
  const [iv, tag, data] = encrypted.split(".");
  const tampered = Buffer.from(data, "base64url");
  tampered[0] ^= 1;
  assert.throws(() => decrypt(`${iv}.${tag}.${tampered.toString("base64url")}`));
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
  const { decisionFromSelected, parseVoteEvent } = await import("../src/app.js");
  assert.deepEqual(parseVoteEvent({ data: {
    key: { remoteJid: "5531999999999@s.whatsapp.net" },
    message: { pollUpdateMessage: { pollCreationMessageKey: { id: "poll-42" }, vote: { name: "✅ Aprovar" } } },
  } }), { pollId: "poll-42", voter: "5531999999999@s.whatsapp.net", selected: "✅ aprovar" });
  assert.deepEqual(parseVoteEvent({ data: {
    pollId: "poll-43",
    pollUpdates: [
      { name: "✅ Aprovar", voters: [] },
      { name: "❌ Reprovar", voters: ["5531999999999@s.whatsapp.net"] },
    ],
  } }), { pollId: "poll-43", voter: "5531999999999@s.whatsapp.net", selected: "❌ reprovar" });
  assert.equal(decisionFromSelected("❌ reprovar"), "REJECTED");
  assert.equal(decisionFromSelected("✅ aprovar"), "APPROVED");
});

test("webhook reconhece pollUpdates real da Evolution e acompanhamento", async () => {
  const { parseVoteEvent } = await import("../src/app.js");
  assert.deepEqual(parseVoteEvent({ data: {
    remoteJid: "5531984667498@s.whatsapp.net",
    pollUpdates: [{ pollUpdateMessageKey: { id: "poll-43" }, vote: { selectedOptions: ["🔎 Acompanhar tratativa"] } }],
  } }), { pollId: "poll-43", voter: "5531984667498@s.whatsapp.net", selected: "🔎 acompanhar tratativa" });
});

test("decisões da enquete têm estados distintos", async () => {
  const { decisionFromSelection } = await import("../src/app.js");
  assert.equal(decisionFromSelection("✅ aprovar"), "APPROVED");
  assert.equal(decisionFromSelection("❌ reprovar"), "REJECTED");
  assert.equal(decisionFromSelection("🔎 acompanhar tratativa"), "FOLLOW_UP");
  assert.equal(decisionFromSelection("opção desconhecida"), null);
});

test("webhook aceita opção da Evolution representada como objeto", async () => {
  const { parseVoteEvent } = await import("../src/app.js");
  const parsed = parseVoteEvent({ data: {
    participant: "5531984667498:12@s.whatsapp.net",
    pollUpdates: [{ pollCreationMessageKey: { id: "poll-44" }, vote: { selectedOptions: [{ name: "❌ Reprovar" }] } }],
  } });
  assert.equal(parsed.pollId, "poll-44");
  assert.equal(parsed.selected, "❌ reprovar");
});
