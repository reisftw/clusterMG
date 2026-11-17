import crypto from "node:crypto";
import argon2 from "argon2";
import type { NextFunction, Request, Response } from "express";
import QRCode from "qrcode";
import { config, randomToken } from "./config.js";
import { decrypt, encrypt, sha256 } from "./crypto.js";
import { pool } from "./db.js";
import { generateTotpSecret, verifyTotp } from "./totp.js";

export type AuthUser = { id: string; username: string; displayName: string; role: "ADMIN" | "OPERATOR"; permissions: string[]; mustChangePassword: boolean };
declare global { namespace Express { interface Request { authUser?: AuthUser; sessionId?: string } } }

const cookieName = "lili_session";
const csrfCookieName = "lili_csrf";
const parseCookies = (header = ""): Record<string, string> => Object.fromEntries(header.split(";").map((item) => item.trim().split("=")).filter(([key, value]) => key && value).map(([key, value]) => [key!, decodeURIComponent(value!)]));
const cookie = (name: string, value: string, maxAge: number, httpOnly: boolean): string => `${name}=${encodeURIComponent(value)}; Path=/liliane; Max-Age=${maxAge}; Secure; SameSite=Strict${httpOnly ? "; HttpOnly" : ""}`;

export async function createSession(userId: string, req: Request, mfaVerified = false): Promise<{ token: string; csrf: string }> {
  const token = randomToken();
  const csrf = randomToken(24);
  const seconds = config.sessionTtlHours * 3600;
  await pool.query(
    "insert into user_sessions(user_id,token_hash,csrf_hash,ip_hash,user_agent_hash,mfa_verified,expires_at) values($1,$2,$3,$4,$5,$6,now()+($7||' seconds')::interval)",
    [userId, sha256(token), sha256(csrf), sha256(req.ip || ""), sha256(req.get("user-agent") || ""), mfaVerified, seconds],
  );
  return { token, csrf };
}

export function setSessionCookies(res: Response, token: string, csrf: string): void {
  const seconds = config.sessionTtlHours * 3600;
  res.append("Set-Cookie", cookie(cookieName, token, seconds, true));
  res.append("Set-Cookie", cookie(csrfCookieName, csrf, seconds, false));
}

export function clearSessionCookies(res: Response): void {
  res.append("Set-Cookie", cookie(cookieName, "", 0, true));
  res.append("Set-Cookie", cookie(csrfCookieName, "", 0, false));
}

async function session(req: Request, requireMfa: boolean): Promise<AuthUser | null> {
  const token = parseCookies(req.get("cookie"))[cookieName];
  if (!token) return null;
  const result = await pool.query(
    `select s.id session_id,s.mfa_verified,u.id,u.username,u.display_name,u.role,u.permissions,u.must_change_password
       from user_sessions s join users u on u.id=s.user_id
      where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now() and u.active=true`,
    [sha256(token)],
  );
  const row = result.rows[0];
  if (!row || (requireMfa && !row.mfa_verified)) return null;
  req.sessionId = row.session_id;
  return { id: row.id, username: row.username, displayName: row.display_name, role: row.role, permissions: row.permissions, mustChangePassword: row.must_change_password };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { req.authUser = (await session(req, true)) || undefined; if (!req.authUser) { res.status(401).json({ error: "Autenticação necessária." }); return; } next(); } catch (error) { next(error); }
}

export function requirePasswordChanged(req: Request, res: Response, next: NextFunction): void {
  if (req.authUser?.mustChangePassword && req.path !== "/auth/password") {
    res.status(428).json({ error: "Altere a senha provisória antes de continuar.", code: "PASSWORD_CHANGE_REQUIRED" });
    return;
  }
  next();
}

export const requireRole = (role: "ADMIN" | "OPERATOR") => (req: Request, res: Response, next: NextFunction): void => {
  if (req.authUser?.role !== role && req.authUser?.role !== "ADMIN") { res.status(403).json({ error: "Permissão insuficiente." }); return; }
  next();
};

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const csrf = parseCookies(req.get("cookie"))[csrfCookieName] || "";
  const provided = req.get("x-csrf-token") || "";
  if (!csrf || csrf !== provided) { res.status(403).json({ error: "Token CSRF inválido." }); return; }
  next();
}

export async function login(req: Request, res: Response): Promise<void> {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const result = await pool.query("select * from users where username=$1 and active=true", [username]);
  const user = result.rows[0];
  if (!user || (user.locked_until && new Date(user.locked_until) > new Date()) || !(await argon2.verify(user?.password_hash || "$argon2id$v=19$m=65536,t=3,p=4$invalid$invalid", password).catch(() => false))) {
    if (user) await pool.query("update users set failed_attempts=failed_attempts+1,locked_until=case when failed_attempts>=4 then now()+interval '15 minutes' else locked_until end where id=$1", [user.id]);
    res.status(401).json({ error: "Credenciais inválidas." }); return;
  }
  await pool.query("update users set failed_attempts=0,locked_until=null where id=$1", [user.id]);
  const created = await createSession(user.id, req, false);
  setSessionCookies(res, created.token, created.csrf);
  res.json({ requiresMfaSetup: !user.totp_enabled, requiresTotp: user.totp_enabled, csrfToken: created.csrf });
}

export async function startMfa(req: Request, res: Response): Promise<void> {
  const user = await session(req, false);
  if (!user || !req.sessionId) { res.status(401).json({ error: "Sessão de configuração inválida." }); return; }
  const secret = generateTotpSecret();
  await pool.query("update users set totp_secret_encrypted=$2 where id=$1 and totp_enabled=false", [user.id, encrypt(secret)]);
  const uri = `otpauth://totp/${encodeURIComponent("Aprovações Lili:" + user.username)}?secret=${secret}&issuer=${encodeURIComponent("Aprovações Lili")}&algorithm=SHA1&digits=6&period=30`;
  res.json({ qrCode: await QRCode.toDataURL(uri), manualKey: secret });
}

export async function confirmMfa(req: Request, res: Response): Promise<void> {
  const user = await session(req, false);
  if (!user || !req.sessionId) { res.status(401).json({ error: "Sessão inválida." }); return; }
  const record = await pool.query("select totp_secret_encrypted,totp_enabled from users where id=$1", [user.id]);
  const encrypted = record.rows[0]?.totp_secret_encrypted;
  if (!encrypted || !verifyTotp(decrypt(encrypted), String(req.body?.code || ""))) { res.status(422).json({ error: "Código inválido." }); return; }
  await pool.query("update users set totp_enabled=true where id=$1", [user.id]);
  await pool.query("update user_sessions set mfa_verified=true where id=$1", [req.sessionId]);
  if (!record.rows[0].totp_enabled) {
    const codes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString("hex").toUpperCase());
    for (const code of codes) await pool.query("insert into user_recovery_codes(user_id,code_hash) values($1,$2)", [user.id, sha256(code)]);
    res.json({ ok: true, recoveryCodes: codes }); return;
  }
  res.json({ ok: true });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = parseCookies(req.get("cookie"))[cookieName];
  if (token) await pool.query("update user_sessions set revoked_at=now() where token_hash=$1", [sha256(token)]);
  clearSessionCookies(res); res.status(204).end();
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  if (newPassword.length < 14 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    res.status(422).json({ error: "A nova senha deve ter 14 caracteres, maiúscula, minúscula e número." });
    return;
  }
  const record = await pool.query("select password_hash from users where id=$1", [req.authUser!.id]);
  if (!record.rows[0] || !(await argon2.verify(record.rows[0].password_hash, currentPassword).catch(() => false))) {
    res.status(422).json({ error: "Senha atual inválida." });
    return;
  }
  const hash = await argon2.hash(newPassword, { type: argon2.argon2id });
  await pool.query("update users set password_hash=$2,must_change_password=false,updated_at=now() where id=$1", [req.authUser!.id, hash]);
  await pool.query("update user_sessions set revoked_at=now() where user_id=$1 and id<>$2", [req.authUser!.id, req.sessionId]);
  req.authUser!.mustChangePassword = false;
  res.json({ ok: true });
}
