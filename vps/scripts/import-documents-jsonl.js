#!/usr/bin/env node

const fs = require("node:fs");
const readline = require("node:readline");
const { Pool } = require("pg");

function parseArgs(argv) {
  const args = { file: null };
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--file") {
      args.file = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function assertConfig(args) {
  if (!args.file) {
    throw new Error("Informe --file output/documents-export.jsonl");
  }
  if (!process.env.DATABASE_URL && !process.env.PGPASSWORD) {
    throw new Error("Defina DATABASE_URL ou as variaveis PGHOST, PGUSER, PGPASSWORD e PGDATABASE.");
  }
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

async function createImportRun(client, sourceFile) {
  const result = await client.query(
    "insert into import_runs (source_file) values ($1) returning id",
    [sourceFile],
  );
  return result.rows[0].id;
}

async function finishImportRun(client, id, status, documentCount, error = null) {
  await client.query(
    `update import_runs
       set finished_at = now(), status = $2, document_count = $3, error = $4
     where id = $1`,
    [id, status, documentCount, error],
  );
}

async function upsertDocument(client, record) {
  await client.query(
    `insert into app_documents (
       path, collection_path, document_id, parent_path, data, exported_at, imported_at
     )
     values ($1, $2, $3, $4, $5::jsonb, $6, now())
     on conflict (path) do update set
       collection_path = excluded.collection_path,
       document_id = excluded.document_id,
       parent_path = excluded.parent_path,
       data = excluded.data,
       exported_at = excluded.exported_at,
       imported_at = now()`,
    [
      record.path,
      record.collectionPath,
      record.documentId,
      record.parentPath || null,
      JSON.stringify(record.data || {}),
      record.exportedAt || null,
    ],
  );
}

async function main() {
  const args = parseArgs(process.argv);
  assertConfig(args);

  const pool = new Pool(buildPoolConfig());
  const client = await pool.connect();
  let importRunId = null;
  let count = 0;

  try {
    importRunId = await createImportRun(client, args.file);
    const input = fs.createReadStream(args.file, { encoding: "utf8" });
    const reader = readline.createInterface({ input, crlfDelay: Infinity });

    await client.query("begin");
    for await (const line of reader) {
      if (!line.trim()) continue;
      const record = JSON.parse(line);
      await upsertDocument(client, record);
      count += 1;

      if (count % 500 === 0) {
        await client.query("commit");
        console.log(`[import-documents] ${count} documentos importados...`);
        await client.query("begin");
      }
    }
    await client.query("commit");
    await finishImportRun(client, importRunId, "finished", count);
    console.log(`[import-documents] Concluido: ${count} documentos importados.`);
  } catch (error) {
    await client.query("rollback").catch(() => {});
    if (importRunId) {
      await finishImportRun(client, importRunId, "failed", count, error.message).catch(
        () => {},
      );
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[import-documents] Falha:", error);
  process.exitCode = 1;
});
