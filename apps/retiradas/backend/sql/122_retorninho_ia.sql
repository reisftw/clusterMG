-- Retorninho IA: agente operacional isolado, pausado por padrao.
-- Rollback: pausar o worker e remover apenas as tabelas/permissions com prefixo
-- retorninho_. Nenhuma tabela operacional existente e alterada.

begin;

create table if not exists retorninho_config (
  id text primary key default 'global' check (id = 'global'),
  enabled boolean not null default false,
  automatic_replies boolean not null default false,
  provider text not null default 'evolution' check (provider in ('evolution', 'meta')),
  instance_name text not null default 'retorninho-ia' check (instance_name = 'retorninho-ia'),
  meta_phone_number_id text,
  evolution_url text,
  evolution_api_key_ciphertext text,
  evolution_api_key_iv text,
  evolution_api_key_auth_tag text,
  webhook_secret_ciphertext text,
  webhook_secret_iv text,
  webhook_secret_auth_tag text,
  ai_provider text not null default 'gemini' check (ai_provider in ('gemini')),
  ai_model text not null default 'gemini-2.5-flash',
  ai_api_key_ciphertext text,
  ai_api_key_iv text,
  ai_api_key_auth_tag text,
  secret_key_id text,
  temperature numeric(3,2) not null default 0.20 check (temperature between 0 and 1),
  max_tokens integer not null default 1024 check (max_tokens between 128 and 8192),
  timeout_ms integer not null default 15000 check (timeout_ms between 1000 and 60000),
  max_tools_per_message integer not null default 3 check (max_tools_per_message between 1 and 8),
  history_messages integer not null default 12 check (history_messages between 0 and 30),
  session_minutes integer not null default 60 check (session_minutes between 5 and 1440),
  rate_limit_per_minute integer not null default 10 check (rate_limit_per_minute between 1 and 60),
  daily_message_limit integer not null default 200 check (daily_message_limit between 1 and 2000),
  transfer_policy text not null default 'DENY'
    check (transfer_policy in ('DENY', 'AUTO', 'TECHNICIAN_ACCEPTANCE')),
  transfer_acceptance_minutes integer not null default 30
    check (transfer_acceptance_minutes between 5 and 1440),
  features jsonb not null default '{"serviceOrderLookup":true,"mapsSearch":true,"selfAssignment":true,"transfer":false,"protocols":true,"productivity":true,"equipment":true,"knowledge":true}'::jsonb,
  system_prompt text not null default 'Voce e o Retorninho, assistente operacional de retiradas do REVO. Responda em portugues brasileiro, use apenas dados retornados pelas ferramentas, respeite permissoes e nunca execute uma alteracao sem confirmacao explicita.',
  prompt_version integer not null default 1,
  retention_days integer not null default 180 check (retention_days between 30 and 730),
  last_instance_event_at timestamptz,
  last_instance_event text,
  updated_by_uid text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into retorninho_config (id) values ('global') on conflict (id) do nothing;

create sequence if not exists retorninho_protocol_number_seq;

create table if not exists retorninho_authorized_users (
  id uuid primary key default gen_random_uuid(),
  user_uid text not null references app_users(uid) on delete cascade,
  phone_e164 text not null,
  phone_hash text not null unique,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'BLOCKED', 'REVOKED')),
  regional_scope text[] not null default '{}',
  tool_permissions text[] not null default '{}',
  failed_attempts integer not null default 0,
  last_authenticated_at timestamptz,
  blocked_reason text,
  created_by_uid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_uid, phone_hash)
);

create index if not exists retorninho_authorized_users_status_idx
  on retorninho_authorized_users (status, updated_at desc);

create table if not exists retorninho_conversations (
  id uuid primary key default gen_random_uuid(),
  authorized_user_id uuid not null references retorninho_authorized_users(id) on delete restrict,
  provider text not null check (provider in ('evolution', 'meta')),
  instance_name text not null check (instance_name = 'retorninho-ia'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAUSED', 'CLOSED')),
  session_data jsonb not null default '{}'::jsonb,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (authorized_user_id, provider, instance_name)
);

create index if not exists retorninho_conversations_page_idx
  on retorninho_conversations (last_message_at desc nulls last, id desc);

create table if not exists retorninho_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references retorninho_conversations(id) on delete cascade,
  provider text not null default 'evolution' check (provider in ('evolution', 'meta')),
  provider_message_id text,
  direction text not null check (direction in ('INBOUND', 'OUTBOUND')),
  message_type text not null default 'TEXT',
  body text,
  status text not null default 'RECEIVED'
    check (status in ('RECEIVED', 'QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'DEAD_LETTER')),
  correlation_id uuid not null default gen_random_uuid(),
  tool_calls jsonb not null default '[]'::jsonb,
  token_usage jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_message_id)
);

create index if not exists retorninho_messages_conversation_page_idx
  on retorninho_messages (conversation_id, created_at desc, id desc);
create index if not exists retorninho_messages_status_idx
  on retorninho_messages (status, created_at) where status in ('QUEUED', 'PROCESSING', 'FAILED');

create table if not exists retorninho_protocols (
  id uuid primary key default gen_random_uuid(),
  protocol_number text not null unique,
  conversation_id uuid references retorninho_conversations(id) on delete set null,
  type text not null check (type in ('SELF_ASSIGNMENT', 'TRANSFER')),
  status text not null default 'CREATED'
    check (status in ('CREATED','VALIDATING','WAITING_TECHNICIAN','AUTHORIZED','DENIED','PROCESSING','COMPLETED','FAILED','EXPIRED','CANCELLED')),
  service_order_id text,
  service_order_number text,
  requester_user_uid text not null,
  current_user_uid text,
  target_user_uid text,
  policy text not null,
  reason text,
  operation_request_id uuid,
  expires_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists retorninho_protocols_page_idx
  on retorninho_protocols (created_at desc, id desc);
create index if not exists retorninho_protocols_requester_idx
  on retorninho_protocols (requester_user_uid, status, created_at desc);
create unique index if not exists retorninho_protocols_active_order_idx
  on retorninho_protocols (service_order_id)
  where status in ('CREATED','VALIDATING','WAITING_TECHNICIAN','AUTHORIZED','PROCESSING');

create table if not exists retorninho_protocol_events (
  id bigserial primary key,
  protocol_id uuid not null references retorninho_protocols(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_user_uid text,
  reason text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists retorninho_protocol_events_page_idx
  on retorninho_protocol_events (protocol_id, created_at desc, id desc);

create table if not exists retorninho_knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  content text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  version integer not null default 1,
  permissions text[] not null default '{}',
  owner_uid text,
  owner_name text,
  reviewed_by_uid text,
  reviewed_at timestamptz,
  search_document tsvector generated always as (
    setweight(to_tsvector('portuguese', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(category, '')), 'B') ||
    setweight(to_tsvector('portuguese', coalesce(content, '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists retorninho_knowledge_search_idx
  on retorninho_knowledge_articles using gin (search_document);
create index if not exists retorninho_knowledge_page_idx
  on retorninho_knowledge_articles (status, updated_at desc, id desc);

create table if not exists retorninho_events (
  id bigserial primary key,
  category text not null check (category in ('TECHNICAL', 'OPERATIONAL', 'AUDIT')),
  event_name text not null,
  status text not null,
  correlation_id uuid,
  instance_name text not null default 'retorninho-ia',
  provider text,
  service text,
  conversation_id uuid references retorninho_conversations(id) on delete set null,
  message_id uuid references retorninho_messages(id) on delete set null,
  protocol_id uuid references retorninho_protocols(id) on delete set null,
  user_uid text,
  user_name text,
  regional text,
  service_order_number text,
  rule_applied text,
  error_code text,
  http_status integer,
  duration_ms integer,
  app_version text,
  attempt integer not null default 1,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists retorninho_events_page_idx
  on retorninho_events (category, created_at desc, id desc);
create index if not exists retorninho_events_correlation_idx
  on retorninho_events (correlation_id, created_at);

create table if not exists retorninho_queue (
  id bigserial primary key,
  kind text not null check (kind in ('INBOUND', 'OUTBOUND', 'PROTOCOL')),
  dedupe_key text not null unique,
  payload jsonb not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists retorninho_queue_claim_idx
  on retorninho_queue (next_attempt_at, id)
  where status in ('PENDING', 'PROCESSING', 'FAILED');

do $$
begin
  if exists (select 1 from pg_proc where proname = 'touch_updated_at') then
    drop trigger if exists retorninho_config_touch on retorninho_config;
    create trigger retorninho_config_touch before update on retorninho_config
      for each row execute function touch_updated_at();
    drop trigger if exists retorninho_authorized_users_touch on retorninho_authorized_users;
    create trigger retorninho_authorized_users_touch before update on retorninho_authorized_users
      for each row execute function touch_updated_at();
    drop trigger if exists retorninho_conversations_touch on retorninho_conversations;
    create trigger retorninho_conversations_touch before update on retorninho_conversations
      for each row execute function touch_updated_at();
    drop trigger if exists retorninho_protocols_touch on retorninho_protocols;
    create trigger retorninho_protocols_touch before update on retorninho_protocols
      for each row execute function touch_updated_at();
    drop trigger if exists retorninho_knowledge_touch on retorninho_knowledge_articles;
    create trigger retorninho_knowledge_touch before update on retorninho_knowledge_articles
      for each row execute function touch_updated_at();
    drop trigger if exists retorninho_queue_touch on retorninho_queue;
    create trigger retorninho_queue_touch before update on retorninho_queue
      for each row execute function touch_updated_at();
  end if;
end $$;

insert into app_permissions (
  id, section_id, section_label, feature_id, feature_label, action,
  sort_order, legacy_permission, description, active, deprecated
) values
  ('retorninho.view', 'retorninho', 'Retorninho IA', 'retorninho_panel', 'Painel do agente', 'view', 970, null, 'Visualizar o painel, conversas e protocolos do Retorninho IA.', true, false),
  ('retorninho.manage', 'retorninho', 'Retorninho IA', 'retorninho_settings', 'Configurações do agente', 'manage', 971, null, 'Configurar IA, WhatsApp, conhecimento e técnicos autorizados.', true, false),
  ('retorninho.audit', 'retorninho', 'Retorninho IA', 'retorninho_audit', 'Auditoria e diagnóstico', 'view', 972, null, 'Consultar logs técnicos, tentativas operacionais e auditoria.', true, false),
  ('retorninho.reprocess', 'retorninho', 'Retorninho IA', 'retorninho_reprocess', 'Reprocessamento', 'manage', 973, null, 'Reprocessar eventos do Retorninho que falharam.', true, false)
on conflict (id) do update set
  section_id = excluded.section_id, section_label = excluded.section_label,
  feature_id = excluded.feature_id, feature_label = excluded.feature_label,
  action = excluded.action, sort_order = excluded.sort_order,
  description = excluded.description, active = true, deprecated = false;

insert into app_role_permissions (role_id, permission)
select 'admin', permission
from (values ('retorninho.view'), ('retorninho.manage'), ('retorninho.audit'), ('retorninho.reprocess')) as permissions(permission)
where exists (select 1 from app_roles where id = 'admin')
on conflict (role_id, permission) do nothing;

commit;
