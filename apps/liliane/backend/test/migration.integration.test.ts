import test from "node:test";
import assert from "node:assert/strict";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("migration cria o banco isolado e pode ser reaplicada", { skip: !databaseUrl }, async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.APP_ENCRYPTION_KEY ||= Buffer.alloc(32, 9).toString("base64");
  process.env.INTEGRITY_KEY ||= "integration-integrity-key";
  process.env.EVOLUTION_WEBHOOK_SECRET ||= "integration-webhook-secret";
  const { migrate } = await import("../src/migrate.js");
  const { pool } = await import("../src/db.js");
  try {
    await migrate();
    await migrate();
    const tables = await pool.query("select to_regclass('public.approval_requests') requests,to_regclass('public.approval_decisions') decisions,to_regclass('public.audit_logs') audit");
    assert.equal(tables.rows[0].requests, "approval_requests");
    assert.equal(tables.rows[0].decisions, "approval_decisions");
    assert.equal(tables.rows[0].audit, "audit_logs");
    assert.equal((await pool.query("select count(*)::int total from schema_migrations where version='001_initial'")).rows[0].total, 1);
  } finally {
    await pool.end();
  }
});
