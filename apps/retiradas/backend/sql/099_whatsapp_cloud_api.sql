-- Ambiente isolado de testes da WhatsApp Cloud API oficial.
-- Nao altera o provedor produtivo da Mensageria.

create extension if not exists pgcrypto;

create table if not exists whatsapp_cloud_config (
  id smallint primary key default 1 check (id = 1),
  app_id text not null default '1962923281088011',
  waba_id text not null default '2099063160707050',
  phone_number_id text not null default '1162045177001452',
  test_phone_number text not null default '+15556716054',
  graph_api_version text not null default 'v26.0',
  meta_test_mode boolean not null default true,
  production_enabled boolean not null default false,
  consent_policy_confirmed boolean not null default false,
  active_provider text not null default 'existing',
  rollback_provider text,
  verify_token_hash text,
  last_connection_status text,
  last_connection_http_status integer,
  last_connection_payload jsonb not null default '{}'::jsonb,
  last_connection_error text,
  last_checked_at timestamptz,
  last_webhook_verified_at timestamptz,
  last_webhook_event_at timestamptz,
  updated_by_id text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into whatsapp_cloud_config (id)
values (1)
on conflict (id) do nothing;

create table if not exists whatsapp_cloud_test_recipients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone_e164 text not null unique,
  authorization_status text not null default 'PENDING'
    check (authorization_status in ('PENDING', 'AUTHORIZED', 'REVOKED')),
  meta_registered boolean not null default false,
  notes text,
  created_by_id text,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_cloud_recipients_status_idx
  on whatsapp_cloud_test_recipients (authorization_status, created_at desc);

create table if not exists whatsapp_cloud_templates (
  id text primary key,
  meta_id text,
  name text not null,
  language text not null,
  category text,
  status text,
  components jsonb not null default '[]'::jsonb,
  parameter_count integer not null default 0,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, language)
);

create index if not exists whatsapp_cloud_templates_status_idx
  on whatsapp_cloud_templates (status, name, language);

create table if not exists whatsapp_cloud_test_messages (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references whatsapp_cloud_test_recipients(id) on delete restrict,
  phone_number_id text not null,
  recipient_masked text not null,
  template_name text not null,
  template_language text not null,
  variables jsonb not null default '[]'::jsonb,
  provider text not null default 'meta_cloud_test',
  status text not null default 'QUEUED',
  message_id text unique,
  http_status integer,
  response_payload jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  operator_id text,
  operator_name text,
  last_event_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_cloud_test_messages_created_idx
  on whatsapp_cloud_test_messages (created_at desc);
create index if not exists whatsapp_cloud_test_messages_status_idx
  on whatsapp_cloud_test_messages (status, created_at desc);
create index if not exists whatsapp_cloud_test_messages_recipient_idx
  on whatsapp_cloud_test_messages (recipient_id, created_at desc);

create table if not exists whatsapp_cloud_webhook_events (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  object_type text,
  event_type text not null,
  message_id text,
  phone_number_id text,
  sender_masked text,
  status text,
  event_at timestamptz,
  signature_valid boolean not null default false,
  payload_digest text not null,
  normalized_payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'PENDING',
  processing_error text,
  processed_at timestamptz,
  received_at timestamptz not null default now()
);

create index if not exists whatsapp_cloud_webhook_events_received_idx
  on whatsapp_cloud_webhook_events (received_at desc);
create index if not exists whatsapp_cloud_webhook_events_message_idx
  on whatsapp_cloud_webhook_events (message_id, event_at desc);
create index if not exists whatsapp_cloud_webhook_events_processing_idx
  on whatsapp_cloud_webhook_events (processing_status, received_at);

create table if not exists whatsapp_cloud_provider_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  from_provider text,
  to_provider text,
  status text not null,
  reason text,
  readiness jsonb not null default '{}'::jsonb,
  operator_id text,
  operator_name text,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_cloud_provider_audit_created_idx
  on whatsapp_cloud_provider_audit (created_at desc);

drop trigger if exists whatsapp_cloud_config_touch_updated_at on whatsapp_cloud_config;
create trigger whatsapp_cloud_config_touch_updated_at
before update on whatsapp_cloud_config
for each row execute function touch_updated_at();

drop trigger if exists whatsapp_cloud_recipients_touch_updated_at on whatsapp_cloud_test_recipients;
create trigger whatsapp_cloud_recipients_touch_updated_at
before update on whatsapp_cloud_test_recipients
for each row execute function touch_updated_at();

drop trigger if exists whatsapp_cloud_templates_touch_updated_at on whatsapp_cloud_templates;
create trigger whatsapp_cloud_templates_touch_updated_at
before update on whatsapp_cloud_templates
for each row execute function touch_updated_at();

drop trigger if exists whatsapp_cloud_messages_touch_updated_at on whatsapp_cloud_test_messages;
create trigger whatsapp_cloud_messages_touch_updated_at
before update on whatsapp_cloud_test_messages
for each row execute function touch_updated_at();

insert into app_permissions (
  id, section_id, section_label, feature_id, feature_label,
  action, sort_order, legacy_permission, description
) values
  ('whatsapp.visualizar', 'configuracao', 'Configuração', 'whatsapp', 'WhatsApp', 'view', 960, 'manage_mensageria', 'Visualizar a configuração da WhatsApp Cloud API.'),
  ('whatsapp.configurar', 'configuracao', 'Configuração', 'whatsapp', 'WhatsApp', 'manage', 961, 'manage_mensageria', 'Configurar identificadores e destinatários de teste.'),
  ('whatsapp.testar', 'configuracao', 'Configuração', 'whatsapp', 'WhatsApp', 'manage', 962, 'manage_mensageria', 'Validar credenciais e enviar testes explícitos.'),
  ('whatsapp.templates', 'configuracao', 'Configuração', 'whatsapp', 'WhatsApp', 'manage', 963, 'manage_mensageria', 'Sincronizar templates oficiais da Meta.'),
  ('whatsapp.diagnostico', 'configuracao', 'Configuração', 'whatsapp', 'WhatsApp', 'view', 964, 'manage_mensageria', 'Consultar diagnósticos e webhooks da integração.'),
  ('whatsapp.ativar', 'configuracao', 'Configuração', 'whatsapp', 'WhatsApp', 'manage', 965, null, 'Ativar a Meta como provedor produtivo após todos os requisitos.'),
  ('whatsapp.reverter', 'configuracao', 'Configuração', 'whatsapp', 'WhatsApp', 'manage', 966, null, 'Reverter tecnicamente o provedor produtivo com auditoria.')
on conflict (id) do update set
  section_id = excluded.section_id,
  section_label = excluded.section_label,
  feature_id = excluded.feature_id,
  feature_label = excluded.feature_label,
  action = excluded.action,
  sort_order = excluded.sort_order,
  legacy_permission = excluded.legacy_permission,
  description = excluded.description,
  active = true,
  deprecated = false;

insert into app_role_permissions (role_id, permission)
select 'admin', permission
from (values
  ('whatsapp.visualizar'),
  ('whatsapp.configurar'),
  ('whatsapp.testar'),
  ('whatsapp.templates'),
  ('whatsapp.diagnostico'),
  ('whatsapp.ativar'),
  ('whatsapp.reverter')
) as seed(permission)
where exists (select 1 from app_roles where id = 'admin')
on conflict do nothing;
