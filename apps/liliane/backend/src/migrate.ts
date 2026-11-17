import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

export async function migrate(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrations = path.resolve(here, "../migrations");
  for (const name of (await fs.readdir(migrations)).filter((file) => file.endsWith(".sql")).sort()) {
    const version = name.replace(/\.sql$/, "");
    await pool.query("create table if not exists schema_migrations(version text primary key, applied_at timestamptz not null default now())");
    const existing = await pool.query("select 1 from schema_migrations where version=$1", [version]);
    if (existing.rowCount) continue;
    await pool.query(await fs.readFile(path.join(migrations, name), "utf8"));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().then(() => pool.end()).catch((error) => { console.error(error); process.exitCode = 1; });
}
