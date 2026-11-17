import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import PDFDocument from "pdfkit";
import argon2 from "argon2";
import { changePassword, confirmMfa, login, logout, requireAuth, requireCsrf, requirePasswordChanged, requireRole, resetPasswordWithTotp, startMfa } from "./auth.js";
import { config } from "./config.js";
import { hmac, sha256 } from "./crypto.js";
import { pool, transaction } from "./db.js";
import { evolution, providerMessageId } from "./evolution.js";

const asyncRoute = (handler: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => handler(req, res).catch(next);
const clean = (value: unknown, max = 8000) => String(value || "").trim().slice(0, max);
const phone = (value: unknown): string => {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 11) digits = `55${digits}`;
  if (digits.length < 8 || digits.length > 15) throw Object.assign(new Error("Número de WhatsApp inválido."), { status: 422 });
  return `+${digits}`;
};
const money = (cents: number | null) => cents === null ? null : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const providerEventId = (body: Record<string, unknown>): string => clean(body.id || (body.data as Record<string, unknown> | undefined)?.id || body.eventId || sha256(JSON.stringify(body)), 240);
const instanceOf = (body: Record<string, unknown>): string => clean(body.instance || (body.data as Record<string, unknown> | undefined)?.instance, 120);
const eventTypeOf = (body: Record<string, unknown>): string => clean(body.event || body.type, 120).toLowerCase();
const param = (value: string | string[] | undefined): string => Array.isArray(value) ? value[0] || "" : value || "";
const voteIdentity = (value: unknown): string => clean(value, 240).split("@")[0]!.replace(/\D/g, "");
const requestScope = (req: Request, alias = "r"): { sql: string; values: unknown[] } => req.authUser?.role === "ADMIN" ? { sql: "1=1", values: [] } : { sql: `${alias}.requester_id=$1`, values: [req.authUser!.id] };

export function parseVoteEvent(body: Record<string, unknown>): { pollId: string; voter: string; selected: string } {
  const data = (body.data || {}) as Record<string, unknown>;
  const key = (data.key || {}) as Record<string, unknown>;
  const message = (data.message || {}) as Record<string, unknown>;
  const update = (message.pollUpdateMessage || data.pollUpdateMessage || {}) as Record<string, unknown>;
  const creationKey = (update.pollCreationMessageKey || {}) as Record<string, unknown>;
  const vote = (update.vote || {}) as Record<string, unknown>;
  const pollUpdates = Array.isArray(data.pollUpdates) ? data.pollUpdates as Record<string, unknown>[] : [];
  const firstUpdate = pollUpdates[0] || {};
  return {
    pollId: clean(data.pollId || data.messageId || creationKey.id || key.id, 240),
    voter: clean(data.voter || data.remoteJid || data.participant || key.participant || key.remoteJid, 240),
    selected: clean(data.selectedOption || data.optionName || (typeof data.vote === "string" ? data.vote : "") || vote.name || firstUpdate.name || firstUpdate.optionName, 120).toLowerCase(),
  };
}

async function audit(userId: string | null, action: string, entity: string, entityId: string | null, req: Request, metadata: Record<string, unknown> = {}): Promise<void> {
  await pool.query("insert into audit_logs(user_id,action,entity_type,entity_id,ip_hash,metadata) values($1,$2,$3,$4,$5,$6)", [userId, action, entity, entityId, sha256(req.ip || ""), metadata]);
}

async function selectedApprover(client: { query: typeof pool.query }): Promise<{ id: string; full_name: string; phone_e164: string; primary_id: string }> {
  const result = await client.query(
    `select coalesce(s.id,p.id) id,coalesce(s.full_name,p.full_name) full_name,coalesce(s.phone_e164,p.phone_e164) phone_e164,p.id primary_id
       from approvers p left join lateral (
         select a.id,a.full_name,a.phone_e164 from approver_substitutions x join approvers a on a.id=x.substitute_approver_id
          where x.primary_approver_id=p.id and x.active and now() between x.starts_at and x.ends_at and a.active order by x.starts_at desc limit 1
       ) s on true where p.kind='PRIMARY' and p.active and p.identity_confirmed_at is not null order by p.created_at limit 1`,
  );
  if (!result.rows[0]) throw Object.assign(new Error("Nenhum aprovador confirmado está disponível."), { status: 422 });
  return result.rows[0];
}

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "256kb" }));
  app.use((req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

  app.get("/health", asyncRoute(async (_req, res) => {
    await pool.query("select 1");
    res.json({ ok: true, service: "aprovacoes-lili", decisionsEnabled: config.decisionsEnabled });
  }));
  app.post("/auth/login", rateLimit({ windowMs: 15 * 60_000, limit: 10 }), asyncRoute(login));
  app.post("/auth/mfa/setup", rateLimit({ windowMs: 15 * 60_000, limit: 10 }), asyncRoute(startMfa));
  app.post("/auth/mfa/confirm", rateLimit({ windowMs: 15 * 60_000, limit: 10 }), asyncRoute(confirmMfa));
  app.post("/auth/password/reset", rateLimit({ windowMs: 15 * 60_000, limit: 5 }), asyncRoute(resetPasswordWithTotp));
  app.post("/auth/logout", asyncRoute(logout));
  app.get("/auth/me", requireAuth, (req, res) => res.json({ user: req.authUser }));
  app.use((req, res, next) => req.path.startsWith("/webhooks/") ? next() : requireAuth(req, res, next));
  app.use((req, res, next) => req.path.startsWith("/webhooks/") ? next() : requireCsrf(req, res, next));
  app.post("/auth/password", asyncRoute(changePassword));
  app.use((req, res, next) => req.path.startsWith("/webhooks/") ? next() : requirePasswordChanged(req, res, next));

  app.get("/dashboard", asyncRoute(async (req, res) => {
    await pool.query("update approval_requests set status='EXPIRED',updated_at=now() where status='PENDING' and deadline_at<now()");
    const scope = requestScope(req);
    const [counts, recent] = await Promise.all([
      pool.query(`select status,count(*)::int total from approval_requests r where ${scope.sql} group by status`, scope.values),
      pool.query(`select id,protocol,subject,status,priority,deadline_at,created_at from approval_requests r where ${scope.sql} order by created_at desc limit 12`, scope.values),
    ]);
    const stats = Object.fromEntries(counts.rows.map((row) => [row.status, row.total]));
    res.json({ stats, recent: recent.rows });
  }));

  app.get("/requests", asyncRoute(async (req, res) => {
    const page = Math.max(Number(req.query.page || 1), 1); const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 100);
    const status = clean(req.query.status, 30); const search = clean(req.query.search, 180);
    const scope = requestScope(req); const values: unknown[] = [...scope.values]; const clauses = [scope.sql];
    if (status) { values.push(status); clauses.push(`r.status=$${values.length}`); }
    if (search) { values.push(`%${search}%`); clauses.push(`(r.protocol ilike $${values.length} or r.subject ilike $${values.length})`); }
    const where = clauses.join(" and ");
    const count = await pool.query(`select count(*)::int total from approval_requests r where ${where}`, values);
    values.push(limit, (page - 1) * limit);
    const rows = await pool.query(`select r.*,u.display_name requester_name,a.full_name approver_name from approval_requests r join users u on u.id=r.requester_id join approvers a on a.id=r.approver_id where ${where} order by r.created_at desc limit $${values.length - 1} offset $${values.length}`, values);
    res.json({ items: rows.rows, pagination: { page, limit, total: count.rows[0].total } });
  }));

  app.get("/requests/:id", asyncRoute(async (req, res) => {
    const scope = requestScope(req); const request = await pool.query(`select r.*,u.display_name requester_name,a.full_name approver_name from approval_requests r join users u on u.id=r.requester_id join approvers a on a.id=r.approver_id where r.id=$${scope.values.length + 1} and ${scope.sql}`, [...scope.values, param(req.params.id)]);
    if (!request.rows[0]) { res.status(404).json({ error: "Solicitação não encontrada." }); return; }
    const events = await pool.query("select event_type,actor_type,metadata,created_at from approval_events where request_id=$1 order by created_at", [req.params.id]);
    res.json({ request: request.rows[0], events: events.rows });
  }));

  app.post("/requests", requireRole("OPERATOR"), asyncRoute(async (req, res) => {
    const subject = clean(req.body?.subject, 180); const description = clean(req.body?.description); const key = clean(req.get("idempotency-key"), 180);
    if (subject.length < 3 || description.length < 3 || !key) { res.status(422).json({ error: "Assunto, descrição e chave de idempotência são obrigatórios." }); return; }
    const amountCents = req.body?.amount === "" || req.body?.amount == null ? null : Math.round(Number(req.body.amount) * 100);
    if (amountCents !== null && (!Number.isSafeInteger(amountCents) || amountCents < 0)) { res.status(422).json({ error: "Valor inválido." }); return; }
    const deadlineAt = req.body?.deadlineAt ? new Date(req.body.deadlineAt) : null;
    if (deadlineAt && (Number.isNaN(deadlineAt.getTime()) || deadlineAt <= new Date())) { res.status(422).json({ error: "O prazo deve ser uma data futura." }); return; }
    const record = await transaction(async (client) => {
      const duplicate = await client.query("select * from approval_requests where requester_id=$1 and idempotency_key=$2", [req.authUser!.id, key]);
      if (duplicate.rows[0]) return duplicate.rows[0];
      const approver = await selectedApprover(client as never);
      const sequence = await client.query("select nextval('approval_protocol_seq') value");
      const protocol = `APR-${String(sequence.rows[0].value).padStart(6, "0")}`;
      const inserted = await client.query(
        `insert into approval_requests(protocol,subject,description,amount_cents,category,priority,deadline_at,notes,requester_id,approver_id,primary_approver_id,idempotency_key)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
        [protocol, subject, description, amountCents, clean(req.body?.category, 120) || null, req.body?.priority === "URGENT" ? "URGENT" : "NORMAL", deadlineAt, clean(req.body?.notes) || null, req.authUser!.id, approver.id, approver.primary_id, key],
      );
      await client.query("insert into approval_events(request_id,event_type,actor_type,actor_id,metadata) values($1,'CREATED','USER',$2,$3)", [inserted.rows[0].id, req.authUser!.id, { approver: approver.full_name }]);
      await client.query("insert into approval_messages(request_id,kind,recipient_snapshot) values($1,'POLL',$2)", [inserted.rows[0].id, approver.phone_e164]);
      return inserted.rows[0];
    });
    await audit(req.authUser!.id, "CREATE", "approval_request", record.id, req, { protocol: record.protocol });
    res.status(201).json(record);
  }));

  app.post("/requests/:id/send", requireRole("OPERATOR"), asyncRoute(async (req, res) => {
    const result = await transaction(async (client) => {
      const scope = requestScope(req);
      const selected = await client.query(`select r.*,a.full_name approver_name,a.phone_e164 from approval_requests r join approvers a on a.id=r.approver_id where r.id=$${scope.values.length + 1} and ${scope.sql} for update`, [...scope.values, param(req.params.id)]);
      const row = selected.rows[0]; if (!row || row.status !== "PENDING") throw Object.assign(new Error("Solicitação não está pendente."), { status: 409 });
      const message = `*APROVAÇÕES LILI*\n\nProtocolo: ${row.protocol}\nAssunto: ${row.subject}\nDescrição: ${row.description}${row.amount_cents === null ? "" : `\nValor: ${money(Number(row.amount_cents))}`}\nSolicitante: ${req.authUser!.displayName}${row.deadline_at ? `\nPrazo: ${new Date(row.deadline_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}`;
      if (message.length > 900) await evolution.sendText(row.phone_e164, message);
      const sent = await evolution.sendPoll(row.phone_e164, message.length > 900 ? `${row.protocol} — Selecione a decisão` : `${message}\n\nSelecione a decisão.`);
      const messageId = providerMessageId(sent);
      await client.query("update approval_messages set status='SENT',provider_message_id=$2,provider_poll_id=$2,attempts=attempts+1,sent_at=now() where request_id=$1 and kind='POLL'", [row.id, messageId]);
      await client.query("insert into approval_events(request_id,event_type,actor_type,actor_id,metadata) values($1,'SENT','SYSTEM',null,$2)", [row.id, { messageId }]);
      return { protocol: row.protocol, messageId };
    });
    res.json(result);
  }));

  app.post("/requests/:id/cancel", requireRole("OPERATOR"), asyncRoute(async (req, res) => {
    const scope = requestScope(req, "approval_requests");
    const result = await pool.query(`update approval_requests set status='CANCELLED',cancelled_at=now(),updated_at=now() where id=$${scope.values.length + 1} and ${scope.sql} and status in ('PENDING','SEND_FAILED') returning id,protocol`, [...scope.values, param(req.params.id)]);
    if (!result.rows[0]) { res.status(409).json({ error: "Solicitação não pode ser cancelada." }); return; }
    await audit(req.authUser!.id, "CANCEL", "approval_request", param(req.params.id), req);
    res.json(result.rows[0]);
  }));

  app.get("/approvers", requireRole("ADMIN"), asyncRoute(async (_req, res) => { res.json((await pool.query("select * from approvers order by full_name")).rows); }));
  app.post("/approvers", requireRole("ADMIN"), asyncRoute(async (req, res) => {
    const result = await pool.query("insert into approvers(full_name,internal_id,phone_e164,kind,active,identity_confirmed_at,created_by) values($1,$2,$3,$4,true,$5,$6) returning *", [clean(req.body?.fullName, 180), clean(req.body?.internalId, 100), phone(req.body?.phone), req.body?.kind === "SUBSTITUTE" ? "SUBSTITUTE" : "PRIMARY", req.body?.identityConfirmed ? new Date() : null, req.authUser!.id]);
    await audit(req.authUser!.id, "CREATE", "approver", result.rows[0].id, req); res.status(201).json(result.rows[0]);
  }));
  app.patch("/approvers/:id", requireRole("ADMIN"), asyncRoute(async (req, res) => {
    const result = await pool.query("update approvers set full_name=coalesce(nullif($2,''),full_name),phone_e164=coalesce($3,phone_e164),active=coalesce($4,active),identity_confirmed_at=case when $5::boolean then coalesce(identity_confirmed_at,now()) else identity_confirmed_at end,updated_at=now() where id=$1 returning *", [param(req.params.id), clean(req.body?.fullName, 180), req.body?.phone ? phone(req.body.phone) : null, typeof req.body?.active === "boolean" ? req.body.active : null, Boolean(req.body?.identityConfirmed)]);
    if (!result.rows[0]) { res.status(404).json({ error: "Aprovador não encontrado." }); return; }
    await audit(req.authUser!.id, "UPDATE", "approver", param(req.params.id), req); res.json(result.rows[0]);
  }));
  app.get("/substitutions", requireRole("ADMIN"), asyncRoute(async (_req, res) => { res.json((await pool.query("select s.*,p.full_name primary_name,a.full_name substitute_name from approver_substitutions s join approvers p on p.id=s.primary_approver_id join approvers a on a.id=s.substitute_approver_id order by s.created_at desc")).rows); }));
  app.post("/substitutions", requireRole("ADMIN"), asyncRoute(async (req, res) => {
    const result = await pool.query("insert into approver_substitutions(primary_approver_id,substitute_approver_id,starts_at,ends_at,reason,created_by) values($1,$2,$3,$4,$5,$6) returning *", [req.body?.primaryApproverId, req.body?.substituteApproverId, req.body?.startsAt, req.body?.endsAt, clean(req.body?.reason, 1000), req.authUser!.id]);
    await audit(req.authUser!.id, "CREATE", "approver_substitution", result.rows[0].id, req); res.status(201).json(result.rows[0]);
  }));
  app.patch("/substitutions/:id", requireRole("ADMIN"), asyncRoute(async (req, res) => {
    const result = await pool.query("update approver_substitutions set active=$2 where id=$1 returning *", [param(req.params.id), Boolean(req.body?.active)]);
    if (!result.rows[0]) { res.status(404).json({ error: "Substituição não encontrada." }); return; }
    await audit(req.authUser!.id, "UPDATE", "approver_substitution", param(req.params.id), req); res.json(result.rows[0]);
  }));

  app.get("/users", requireRole("ADMIN"), asyncRoute(async (_req, res) => { res.json((await pool.query("select id,username,display_name,role,permissions,active,totp_enabled,created_at from users order by display_name")).rows); }));
  app.post("/users", requireRole("ADMIN"), asyncRoute(async (req, res) => {
    const password = clean(req.body?.temporaryPassword, 200); if (password.length < 14) { res.status(422).json({ error: "Senha temporária deve ter ao menos 14 caracteres." }); return; }
    const result = await pool.query("insert into users(username,display_name,password_hash,role,permissions) values($1,$2,$3,$4,$5) returning id,username,display_name,role,active", [clean(req.body?.username, 80).toLowerCase(), clean(req.body?.displayName, 180), await argon2.hash(password, { type: argon2.argon2id }), req.body?.role === "ADMIN" ? "ADMIN" : "OPERATOR", Array.isArray(req.body?.permissions) ? req.body.permissions : []]);
    await audit(req.authUser!.id, "CREATE", "user", result.rows[0].id, req); res.status(201).json(result.rows[0]);
  }));
  app.patch("/users/:id", requireRole("ADMIN"), asyncRoute(async (req, res) => {
    const result = await pool.query("update users set display_name=coalesce(nullif($2,''),display_name),role=coalesce($3,role),active=coalesce($4,active),updated_at=now() where id=$1 returning id,username,display_name,role,active,totp_enabled", [param(req.params.id), clean(req.body?.displayName, 180), ["ADMIN", "OPERATOR"].includes(req.body?.role) ? req.body.role : null, typeof req.body?.active === "boolean" ? req.body.active : null]);
    if (!result.rows[0]) { res.status(404).json({ error: "Usuário não encontrado." }); return; }
    await audit(req.authUser!.id, "UPDATE", "user", param(req.params.id), req); res.json(result.rows[0]);
  }));
  app.post("/users/:id/reset-mfa", requireRole("ADMIN"), asyncRoute(async (req, res) => {
    await pool.query("update users set totp_enabled=false,totp_secret_encrypted=null,updated_at=now() where id=$1", [param(req.params.id)]);
    await pool.query("update user_sessions set revoked_at=now() where user_id=$1", [param(req.params.id)]);
    await audit(req.authUser!.id, "RESET_MFA", "user", param(req.params.id), req); res.json({ ok: true });
  }));

  app.get("/whatsapp/status", requireRole("ADMIN"), asyncRoute(async (_req, res) => {
    try {
      const provider = await evolution.status();
      const first = Array.isArray(provider) ? provider[0] as Record<string, unknown> | undefined : undefined;
      const instance = (provider.instance || first?.instance || first || {}) as Record<string, unknown>;
      const state = clean(instance.state || provider.state, 40).toLowerCase();
      res.json({ configured: Boolean(config.evolutionApiKey), decisionsEnabled: config.decisionsEnabled, connected: ["open", "connected"].includes(state), state: state || "unknown" });
    } catch (error) { res.json({ configured: Boolean(config.evolutionApiKey), decisionsEnabled: config.decisionsEnabled, connected: false, state: "unavailable", error: (error as Error).message }); }
  }));
  app.post("/whatsapp/connect", requireRole("ADMIN"), asyncRoute(async (_req, res) => { try { await evolution.create(); } catch { /* existing instance */ } await evolution.configureWebhook(`${config.publicBaseUrl}/api/webhooks/evolution/${config.webhookSecret}`); res.json(await evolution.qr()); }));
  app.post("/whatsapp/test", requireRole("ADMIN"), asyncRoute(async (req, res) => { res.json(await evolution.sendText(phone(req.body?.phone), "Teste da integração Aprovações Lili.")); }));

  app.post("/webhooks/evolution/:secret", rateLimit({ windowMs: 60_000, limit: 300 }), asyncRoute(async (req, res) => {
    if (req.params.secret !== config.webhookSecret) { res.status(404).end(); return; }
    const body = req.body as Record<string, unknown>; const eventId = providerEventId(body); const instance = instanceOf(body); const eventType = eventTypeOf(body);
    if (instance !== config.evolutionInstance) { res.status(202).json({ ignored: true }); return; }
    const inserted = await pool.query("insert into webhook_events(provider_event_id,instance_name,event_type,payload_hash,status) values($1,$2,$3,$4,'RECEIVED') on conflict(provider_event_id) do nothing returning id", [eventId, instance, eventType, sha256(JSON.stringify(body))]);
    if (!inserted.rowCount) { res.status(200).json({ duplicate: true }); return; }
    if (!config.decisionsEnabled) { await pool.query("update webhook_events set status='REVIEW',reason='Decisões bloqueadas até homologação real',processed_at=now() where provider_event_id=$1", [eventId]); res.status(202).json({ review: true }); return; }
    const { pollId, voter, selected } = parseVoteEvent(body);
    if (!pollId || !voter || (!selected.includes("aprovar") && !selected.includes("reprovar"))) { await pool.query("update webhook_events set status='REVIEW',reason='Evento de voto não verificável',processed_at=now() where provider_event_id=$1", [eventId]); res.status(202).json({ review: true }); return; }
    const finalized = await transaction(async (client) => {
      const lookup = await client.query("select r.*,a.id approver_id,a.phone_e164 from approval_messages m join approval_requests r on r.id=m.request_id join approvers a on a.id=r.approver_id where m.provider_poll_id=$1 for update", [pollId]);
      const row = lookup.rows[0]; if (!row || row.status !== "PENDING" || (row.deadline_at && new Date(row.deadline_at) < new Date())) throw Object.assign(new Error("Solicitação não está aberta."), { status: 409 });
      if (voteIdentity(voter) !== voteIdentity(row.phone_e164)) throw Object.assign(new Error("Votante não autorizado."), { status: 403 });
      const decision = selected.includes("reprovar") ? "REJECTED" : "APPROVED"; const integrity = hmac(`${row.id}|${decision}|${eventId}`);
      await client.query("insert into approval_decisions(request_id,approver_id,decision,voter_identifier_hash,provider_event_id,provider_message_id,integrity_hash) values($1,$2,$3,$4,$5,$6,$7)", [row.id, row.approver_id, decision, sha256(voter), eventId, pollId, integrity]);
      await client.query("update approval_requests set status=$2,decided_at=now(),updated_at=now() where id=$1", [row.id, decision]);
      await client.query("insert into approval_events(request_id,event_type,actor_type,actor_id,metadata) values($1,$2,'APPROVER',$3,$4)", [row.id, decision, row.approver_id, { providerEventId: eventId }]);
      await client.query("update webhook_events set status='PROCESSED',processed_at=now() where provider_event_id=$1", [eventId]);
      return { requestId: row.id, protocol: row.protocol, phone: row.phone_e164, decision };
    });
    await evolution.sendText(finalized.phone, `${finalized.protocol} registrada como ${finalized.decision === "APPROVED" ? "APROVADA" : "REPROVADA"}.`).catch(async (error) => {
      await pool.query("insert into approval_events(request_id,event_type,actor_type,metadata) values($1,'CONFIRMATION_FAILED','SYSTEM',$2)", [finalized.requestId, { error: clean((error as Error).message, 300) }]);
    });
    res.json({ ok: true });
  }));

  app.get("/requests/:id/receipt.pdf", asyncRoute(async (req, res) => {
    const scope = requestScope(req); const result = await pool.query(`select r.*,u.display_name requester_name,a.full_name approver_name,d.id decision_id,d.decision,d.decided_at,d.provider_message_id,d.integrity_hash from approval_requests r join users u on u.id=r.requester_id join approvers a on a.id=r.approver_id join approval_decisions d on d.request_id=r.id where r.id=$${scope.values.length + 1} and ${scope.sql}`, [...scope.values, param(req.params.id)]);
    const row = result.rows[0]; if (!row) { res.status(404).json({ error: "Comprovante indisponível." }); return; }
    res.type("application/pdf").attachment(`${row.protocol}.pdf`); const pdf = new PDFDocument({ size: "A4", margin: 56 }); pdf.pipe(res);
    pdf.fontSize(20).text("APROVAÇÕES LILI", { align: "center" }).moveDown(); pdf.fontSize(11).text(`Protocolo: ${row.protocol}`).text(`Assunto: ${row.subject}`).text(`Descrição: ${row.description}`).text(`Valor: ${money(row.amount_cents) || "Não informado"}`).text(`Solicitante: ${row.requester_name}`).text(`Aprovador: ${row.approver_name}`).text(`Decisão: ${row.decision === "APPROVED" ? "APROVADA" : "REPROVADA"}`).text(`Data: ${new Date(row.decided_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`).text(`ID da decisão: ${row.decision_id}`).text(`ID da mensagem: ${row.provider_message_id || "Não disponível"}`).moveDown().fontSize(9).text(`Código de verificação: ${row.integrity_hash}`).moveDown().text("Registro eletrônico interno de aprovação via WhatsApp. Este documento não equivale automaticamente a uma assinatura digital certificada."); pdf.end();
  }));

  app.get("/receipts/:decisionId/verify", asyncRoute(async (req, res) => {
    const result = await pool.query("select d.id,d.integrity_hash,r.protocol,r.status,d.decided_at from approval_decisions d join approval_requests r on r.id=d.request_id where d.id=$1", [req.params.decisionId]);
    if (!result.rows[0]) { res.status(404).json({ valid: false }); return; } res.json({ valid: true, protocol: result.rows[0].protocol, status: result.rows[0].status, decidedAt: result.rows[0].decided_at });
  }));

  app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    console.error(JSON.stringify({ level: "error", message: error.message, stack: config.production ? undefined : error.stack }));
    res.status(error.status || 500).json({ error: error.status ? error.message : "Erro interno." });
  });
  return app;
}
