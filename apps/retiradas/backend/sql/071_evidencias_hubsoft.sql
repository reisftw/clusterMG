create extension if not exists pgcrypto;

create table if not exists hubsoft_interaction_evidences (
  id uuid primary key default gen_random_uuid(),
  evidence_key text not null unique,
  interaction_id text,
  fila_id text,
  historico_id text,
  callback_id text,
  agendamento_id text,
  os_number text,
  customer_code text,
  customer_name text,
  phone text,
  phone_digits text,
  city text,
  regional text,
  contract text,
  message_sent text,
  sent_at timestamptz,
  provider text,
  provider_status text,
  provider_message_id text,
  customer_response text,
  response_at timestamptz,
  result text,
  sync_status text not null default 'pending',
  hubsoft_comment_status text not null default 'pending',
  hubsoft_attachment_status text not null default 'pending',
  hubsoft_status_update_status text not null default 'pending',
  hubsoft_assignment_status text not null default 'pending',
  retry_count integer not null default 0,
  last_sync_error text,
  last_retry_at timestamptz,
  next_retry_at timestamptz,
  source text,
  source_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hubsoft_interaction_evidences_os_idx
  on hubsoft_interaction_evidences (os_number);

create index if not exists hubsoft_interaction_evidences_phone_idx
  on hubsoft_interaction_evidences (phone_digits);

create index if not exists hubsoft_interaction_evidences_status_idx
  on hubsoft_interaction_evidences (sync_status, created_at desc);

create index if not exists hubsoft_interaction_evidences_created_idx
  on hubsoft_interaction_evidences (created_at desc);

create table if not exists hubsoft_evidence_steps (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references hubsoft_interaction_evidences(id) on delete cascade,
  step_type text not null,
  status text not null default 'pending',
  idempotency_key text not null,
  external_id text,
  attempts integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (evidence_id, step_type, idempotency_key)
);

create index if not exists hubsoft_evidence_steps_evidence_idx
  on hubsoft_evidence_steps (evidence_id, created_at);

create index if not exists hubsoft_evidence_steps_status_idx
  on hubsoft_evidence_steps (status, step_type);

create table if not exists hubsoft_evidence_events (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references hubsoft_interaction_evidences(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text,
  actor_id text,
  actor_name text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists hubsoft_evidence_events_evidence_idx
  on hubsoft_evidence_events (evidence_id, occurred_at desc);

drop trigger if exists hubsoft_interaction_evidences_touch_updated_at
  on hubsoft_interaction_evidences;
create trigger hubsoft_interaction_evidences_touch_updated_at
before update on hubsoft_interaction_evidences
for each row execute function touch_updated_at();

drop trigger if exists hubsoft_evidence_steps_touch_updated_at
  on hubsoft_evidence_steps;
create trigger hubsoft_evidence_steps_touch_updated_at
before update on hubsoft_evidence_steps
for each row execute function touch_updated_at();
