begin;

create extension if not exists pgcrypto;

create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username = lower(username)),
  display_name text not null,
  password_hash text not null,
  role text not null check (role in ('ADMIN','OPERATOR')),
  permissions text[] not null default '{}',
  active boolean not null default true,
  must_change_password boolean not null default true,
  totp_secret_encrypted text,
  totp_enabled boolean not null default false,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  csrf_hash text not null,
  ip_hash text,
  user_agent_hash text,
  mfa_verified boolean not null default false,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists user_sessions_active_idx on user_sessions(token_hash, expires_at) where revoked_at is null;

create table if not exists user_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, code_hash)
);

create table if not exists approvers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  internal_id text not null unique,
  phone_e164 text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  kind text not null check (kind in ('PRIMARY','SUBSTITUTE')),
  active boolean not null default true,
  identity_confirmed_at timestamptz,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists approver_substitutions (
  id uuid primary key default gen_random_uuid(),
  primary_approver_id uuid not null references approvers(id),
  substitute_approver_id uuid not null references approvers(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null,
  active boolean not null default true,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (primary_approver_id <> substitute_approver_id)
);
create index if not exists approver_substitutions_window_idx on approver_substitutions(primary_approver_id, starts_at, ends_at) where active;

create sequence if not exists approval_protocol_seq;
create table if not exists approval_requests (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique,
  subject text not null check (length(subject) between 3 and 180),
  description text not null check (length(description) between 3 and 8000),
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  category text,
  priority text not null default 'NORMAL' check (priority in ('NORMAL','URGENT')),
  deadline_at timestamptz,
  notes text,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','EXPIRED','CANCELLED','SEND_FAILED')),
  requester_id uuid not null references users(id),
  approver_id uuid not null references approvers(id),
  primary_approver_id uuid not null references approvers(id),
  replaces_request_id uuid references approval_requests(id),
  idempotency_key text not null,
  decided_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(requester_id, idempotency_key)
);
create index if not exists approval_requests_status_created_idx on approval_requests(status, created_at desc);
create index if not exists approval_requests_deadline_idx on approval_requests(deadline_at) where status='PENDING';

create table if not exists approval_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references approval_requests(id) on delete cascade,
  kind text not null check (kind in ('DESCRIPTION','POLL','CONFIRMATION','REMINDER')),
  provider_message_id text,
  provider_poll_id text,
  recipient_snapshot text not null,
  status text not null default 'QUEUED' check (status in ('QUEUED','SENDING','SENT','DELIVERED','FAILED')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists approval_messages_provider_id_uidx on approval_messages(provider_message_id) where provider_message_id is not null;
create index if not exists approval_messages_queue_idx on approval_messages(status, next_attempt_at) where status in ('QUEUED','FAILED');

create table if not exists approval_decisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references approval_requests(id),
  approver_id uuid not null references approvers(id),
  decision text not null check (decision in ('APPROVED','REJECTED')),
  voter_identifier_hash text not null,
  provider_event_id text not null unique,
  provider_message_id text,
  integrity_hash text not null,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists approval_events (
  id bigserial primary key,
  request_id uuid references approval_requests(id) on delete cascade,
  event_type text not null,
  actor_type text not null check (actor_type in ('USER','APPROVER','SYSTEM','WEBHOOK')),
  actor_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists approval_events_request_idx on approval_events(request_id, created_at);

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  instance_name text not null,
  event_type text not null,
  payload_hash text not null,
  status text not null check (status in ('RECEIVED','PROCESSED','IGNORED','REVIEW','FAILED')),
  reason text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  instance_name text not null unique,
  base_url text not null,
  connected_number text,
  connection_status text not null default 'DISCONNECTED',
  last_connected_at timestamptz,
  last_webhook_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists system_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigserial primary key,
  user_id uuid references users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  before_hash text,
  after_hash text,
  ip_hash text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on audit_logs(created_at desc);

insert into schema_migrations(version) values ('001_initial') on conflict do nothing;
commit;
