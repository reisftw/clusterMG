const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const db = require("./db");

const DEFAULT_BACKUP_DIR = "/opt/retiradas/backups/postgres";
const DEFAULT_MAX_BACKUPS = 30;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024 * 1024;

function getBackupDir() {
  return process.env.DB_BACKUP_DIR || DEFAULT_BACKUP_DIR;
}

function parseBytes(value, fallback) {
  const raw = String(value || "").trim().toLowerCase();
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)?$/);
  if (!match) return fallback;
  const amount = Number(match[1]);
  const unit = match[2] || "b";
  const multipliers = {
    b: 1,
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
    tb: 1024 ** 4,
  };
  return Math.floor(amount * multipliers[unit]);
}

function getConfig() {
  return {
    ageIdentityFile: process.env.DB_BACKUP_AGE_IDENTITY_FILE || "",
    ageRecipient: process.env.DB_BACKUP_AGE_RECIPIENT || "",
    backupDir: getBackupDir(),
    maxBackups: Number(process.env.DB_BACKUP_MAX_FILES || DEFAULT_MAX_BACKUPS),
    maxBytes: parseBytes(process.env.DB_BACKUP_MAX_BYTES || "10gb", DEFAULT_MAX_BYTES),
    schedule: process.env.DB_BACKUP_SCHEDULE || "00:01",
  };
}

function isEncryptedBackup(fileName) {
  return String(fileName || "").endsWith(".dump.age");
}

function getEncryptedFileName(fileName) {
  return `${fileName}.age`;
}

function parseDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    port: url.port || "5432",
    user: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

function getPgEnv() {
  const fromUrl = process.env.DATABASE_URL ? parseDatabaseUrl(process.env.DATABASE_URL) : {};
  const database = process.env.PGDATABASE || fromUrl.database || "retiradas";

  return {
    env: {
      ...process.env,
      PGHOST: process.env.PGHOST || fromUrl.host || "127.0.0.1",
      PGPORT: process.env.PGPORT || fromUrl.port || "5432",
      PGUSER: process.env.PGUSER || fromUrl.user || "retorninho",
      PGPASSWORD: process.env.PGPASSWORD || fromUrl.password || "",
      PGDATABASE: database,
    },
    database,
  };
}

function runCommand(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(stderr || `${command} finalizou com codigo ${code}.`);
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

async function ensureBackupDir() {
  await fs.mkdir(getBackupDir(), { recursive: true });
}

function toBackupId(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function resolveBackupPath(fileName) {
  const safeName = path.basename(String(fileName || ""));
  if (!safeName || safeName !== fileName || (!safeName.endsWith(".dump") && !safeName.endsWith(".dump.age"))) {
    throw new Error("Backup invalido.");
  }

  const backupDir = path.resolve(getBackupDir());
  const filePath = path.resolve(backupDir, safeName);
  if (!filePath.startsWith(`${backupDir}${path.sep}`)) {
    throw new Error("Backup invalido.");
  }
  return filePath;
}

async function readMetadata(filePath) {
  try {
    return JSON.parse(await fs.readFile(`${filePath}.json`, "utf8"));
  } catch {
    return {};
  }
}

async function writeMetadata(filePath, metadata) {
  await fs.writeFile(`${filePath}.json`, `${JSON.stringify(metadata, null, 2)}\n`);
}

async function listBackups() {
  await ensureBackupDir();
  const entries = await fs.readdir(getBackupDir(), { withFileTypes: true });
  const backups = [];

  for (const entry of entries) {
    if (!entry.isFile() || (!entry.name.endsWith(".dump") && !entry.name.endsWith(".dump.age"))) continue;
    const filePath = path.join(getBackupDir(), entry.name);
    const [stat, metadata] = await Promise.all([
      fs.stat(filePath),
      readMetadata(filePath),
    ]);

    backups.push({
      id: metadata.id || entry.name.replace(/\.dump$/, ""),
      fileName: entry.name,
      createdAt: metadata.createdAt || stat.birthtime.toISOString(),
      encrypted: Boolean(metadata.encrypted || isEncryptedBackup(entry.name)),
      reason: metadata.reason || "manual",
      createdBy: metadata.createdBy || null,
      sizeBytes: stat.size,
    });
  }

  return backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function deleteBackup(fileName) {
  const filePath = resolveBackupPath(fileName);
  await fs.rm(filePath, { force: true });
  await fs.rm(`${filePath}.json`, { force: true });
}

async function rotateBackups() {
  const config = getConfig();
  const backups = await listBackups();
  let keep = backups.slice();

  for (const backup of keep.slice(config.maxBackups)) {
    await deleteBackup(backup.fileName);
  }
  keep = keep.slice(0, config.maxBackups);

  let totalBytes = keep.reduce((sum, backup) => sum + Number(backup.sizeBytes || 0), 0);
  for (const backup of [...keep].reverse()) {
    if (totalBytes <= config.maxBytes) break;
    await deleteBackup(backup.fileName);
    totalBytes -= Number(backup.sizeBytes || 0);
  }
}

async function createBackup({ reason = "manual", user = null } = {}) {
  await ensureBackupDir();
  const config = getConfig();
  const id = `retiradas-${toBackupId()}`;
  const fileName = `${id}.dump`;
  const filePath = path.join(getBackupDir(), fileName);
  const { env, database } = getPgEnv();

  await runCommand(
    "pg_dump",
    ["--format=custom", "--no-owner", "--no-acl", "--file", filePath, database],
    env,
  );

  let finalFileName = fileName;
  let finalFilePath = filePath;
  let encrypted = false;
  if (config.ageRecipient) {
    finalFileName = getEncryptedFileName(fileName);
    finalFilePath = path.join(getBackupDir(), finalFileName);
    await runCommand("age", ["-r", config.ageRecipient, "-o", finalFilePath, filePath], env);
    await fs.rm(filePath, { force: true });
    encrypted = true;
  }

  const stat = await fs.stat(finalFilePath);
  await writeMetadata(finalFilePath, {
    id,
    encrypted,
    fileName: finalFileName,
    createdAt: new Date().toISOString(),
    reason,
    createdBy: user ? {
      uid: user.uid || "",
      email: user.email || user.profile?.email || "",
      nome: user.profile?.nome || "",
    } : null,
    sizeBytes: stat.size,
  });

  await rotateBackups();
  return getBackupStatus();
}

async function restoreBackup(fileName, { user = null } = {}) {
  const filePath = resolveBackupPath(fileName);
  await fs.access(filePath);

  const safety = await createBackup({ reason: "pre-restore", user });
  const { env, database } = getPgEnv();
  const config = getConfig();
  let restorePath = filePath;
  let temporaryRestorePath = "";

  if (isEncryptedBackup(fileName)) {
    if (!config.ageIdentityFile) {
      throw new Error("DB_BACKUP_AGE_IDENTITY_FILE nao configurado para restaurar backup criptografado.");
    }
    temporaryRestorePath = path.join(getBackupDir(), `${path.basename(fileName, ".age")}.restore-tmp`);
    await runCommand("age", ["-d", "-i", config.ageIdentityFile, "-o", temporaryRestorePath, filePath], env);
    restorePath = temporaryRestorePath;
  }

  try {
    await runCommand(
      "pg_restore",
      [
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-acl",
        "--single-transaction",
        "--dbname",
        database,
        restorePath,
      ],
      env,
    );
  } finally {
    if (temporaryRestorePath) {
      await fs.rm(temporaryRestorePath, { force: true }).catch(() => {});
    }
  }

  return {
    ok: true,
    restoredFileName: path.basename(fileName),
    safetyBackup: safety.backups?.[0] || null,
    status: await getBackupStatus(),
  };
}

async function getDatabaseSize() {
  const result = await db.query(
    `select
       pg_database_size(current_database())::bigint as size_bytes,
       pg_size_pretty(pg_database_size(current_database())) as pretty`,
  );
  const row = result.rows[0] || {};
  return {
    sizeBytes: Number(row.size_bytes || 0),
    pretty: row.pretty || "0 bytes",
  };
}

async function getBackupStatus() {
  const config = getConfig();
  const [database, backups] = await Promise.all([
    getDatabaseSize(),
    listBackups(),
  ]);
  const usedBytes = backups.reduce((sum, backup) => sum + Number(backup.sizeBytes || 0), 0);

  return {
    database,
    storage: {
      backupDir: config.backupDir,
      encryptionEnabled: Boolean(config.ageRecipient),
      usedBytes,
      maxBytes: config.maxBytes,
      remainingBytes: Math.max(config.maxBytes - usedBytes, 0),
    },
    retention: {
      maxBackups: config.maxBackups,
      currentBackups: backups.length,
    },
    schedule: {
      time: config.schedule,
      description: "Diario as 00:01",
    },
    backups,
  };
}

module.exports = {
  createBackup,
  getBackupStatus,
  restoreBackup,
  rotateBackups,
};
