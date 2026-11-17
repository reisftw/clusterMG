import argon2 from "argon2";
import { config } from "./config.js";
import { pool } from "./db.js";
import { migrate } from "./migrate.js";

export async function bootstrapAdmin(): Promise<"created" | "exists"> {
  await migrate();
  const existing = await pool.query("select id from users where role='ADMIN' limit 1");
  if (existing.rowCount) return "exists";
  if (config.bootstrapAdminPassword.length < 16) throw new Error("BOOTSTRAP_ADMIN_PASSWORD forte é obrigatório no primeiro provisionamento.");
  const passwordHash = await argon2.hash(config.bootstrapAdminPassword, { type: argon2.argon2id });
  await pool.query(
    "insert into users(username,display_name,password_hash,role,permissions,must_change_password) values('admin','Administrador', $1,'ADMIN',array['*'],true)",
    [passwordHash],
  );
  return "created";
}

if (process.argv[1]?.endsWith("bootstrap.js")) {
  bootstrapAdmin().then((result) => { console.log(`Bootstrap: ${result}`); return pool.end(); }).catch((error) => { console.error(error); process.exitCode = 1; });
}
