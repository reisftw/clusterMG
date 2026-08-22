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

async function query(text, params) {
  return pool.query(text, params);
}

async function connect() {
  return pool.connect();
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
};
