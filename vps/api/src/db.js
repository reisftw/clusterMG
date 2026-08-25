const { AsyncLocalStorage } = require("node:async_hooks");
const { Pool } = require("pg");

if (!process.env.DATABASE_URL && !process.env.PGPASSWORD) {
  throw new Error("Defina DATABASE_URL ou as variaveis PGHOST, PGUSER, PGPASSWORD e PGDATABASE.");
}

function buildPoolConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : false,
    };
  }

  return {
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || "retorninho",
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || "retiradas",
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : false,
  };
}

const pool = new Pool(buildPoolConfig());
const requestContext = new AsyncLocalStorage();

function getQueryRecorder() {
  return global.__retiradasMetricsRecordQuery;
}

function nowNs() {
  return process.hrtime.bigint();
}

function elapsedMs(startNs) {
  return Number(process.hrtime.bigint() - startNs) / 1e6;
}

function isMetricsSuspended() {
  return global.__retiradasMetricsSuspended === true;
}

function shouldIgnoreMetricQuery(text) {
  const normalized = String(typeof text === "object" && text?.text ? text.text : text || "").toLowerCase();
  return normalized.includes("metrics_requests") || normalized.includes("metrics_queries");
}

function recordQueryMetric(text, startedNs, error = null) {
  if (isMetricsSuspended() || shouldIgnoreMetricQuery(text)) return;
  const recorder = getQueryRecorder();
  if (typeof recorder !== "function") return;
  recorder({
    query: text,
    durationMs: elapsedMs(startedNs),
    error: error?.message || "",
  });
}

async function rawQuery(text, params) {
  return pool.query(text, params);
}

function normalizeContextUser(user = {}) {
  const profile = user.profile || {};
  return {
    uid: String(user.uid || profile.uid || ""),
    role: String(user.role || profile.role || ""),
    email: String(user.email || profile.email || ""),
    regional: String(profile.regional || user.regional || ""),
  };
}

function getRequestContext() {
  return requestContext.getStore() || null;
}

function runWithRequestContext(user, callback) {
  return requestContext.run(normalizeContextUser(user), callback);
}

async function applyRequestContext(client) {
  const context = getRequestContext();
  if (!context) return;
  await client.query(
    `select
       set_config('retiradas.current_user_id', $1, true),
       set_config('retiradas.current_user_role', $2, true),
       set_config('retiradas.current_user_email', $3, true),
       set_config('retiradas.current_user_regional', $4, true)`,
    [context.uid, context.role, context.email, context.regional],
  );
}

async function query(text, params) {
  const startedNs = nowNs();
  const context = getRequestContext();
  if (context) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await applyRequestContext(client);
      const result = await client.query(text, params);
      await client.query("commit");
      recordQueryMetric(text, startedNs);
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      recordQueryMetric(text, startedNs, error);
      throw error;
    } finally {
      client.release();
    }
  }
  try {
    const result = await rawQuery(text, params);
    recordQueryMetric(text, startedNs);
    return result;
  } catch (error) {
    recordQueryMetric(text, startedNs, error);
    throw error;
  }
}

async function connect() {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  let inTransaction = false;
  let contextApplied = false;
  client.query = async (...args) => {
    const sql = String(typeof args[0] === "object" && args[0]?.text ? args[0].text : args[0] || "").trim().toLowerCase();
    const startedNs = nowNs();
    try {
      const result = await originalQuery(...args);
      if (sql === "begin" || sql.startsWith("begin ")) {
        inTransaction = true;
        contextApplied = false;
        await applyRequestContext({ query: originalQuery });
        contextApplied = true;
      } else if ((sql === "commit" || sql.startsWith("commit ") || sql === "rollback" || sql.startsWith("rollback "))) {
        inTransaction = false;
        contextApplied = false;
      } else if (inTransaction && !contextApplied) {
        await applyRequestContext({ query: originalQuery });
        contextApplied = true;
      }
      recordQueryMetric(args[0], startedNs);
      return result;
    } catch (error) {
      recordQueryMetric(args[0], startedNs, error);
      throw error;
    }
  };
  return client;
}

async function healthcheck() {
  const result = await query("select now() as now");
  return result.rows[0];
}

async function closePool() {
  await pool.end();
}

module.exports = {
  connect,
  closePool,
  healthcheck,
  query,
  rawQuery,
  runWithRequestContext,
};
