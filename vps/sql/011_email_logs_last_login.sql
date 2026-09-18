create extension if not exists pgcrypto;

alter table app_users
  add column if not exists last_login_ip text,
  add column if not exists last_login_user_agent text;

create table if not exists email_logs (
  id text primary key,
  type text not null default 'system_notice',
  to_email text not null default '',
  subject text not null default '',
  status text not null,
  error_message text not null default '',
  provider_message_id text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists email_logs_created_at_idx
  on email_logs (created_at desc);

create index if not exists email_logs_status_idx
  on email_logs (status);

create index if not exists email_logs_type_idx
  on email_logs (type);

update app_documents d
set data = jsonb_set(
    jsonb_set(
      jsonb_set(d.data, '{ultimo_login}', to_jsonb(au.last_login_at), true),
      '{ultimo_login_ip}', to_jsonb(coalesce(au.last_login_ip, '')),
      true
    ),
    '{ultimo_login_navegador}',
    to_jsonb(coalesce(au.last_login_user_agent, '')),
    true
  )
from app_users au
where d.path = concat('usuarios/', au.uid)
  and au.last_login_at is not null;

insert into email_logs (
  id, type, to_email, subject, status, error_message, provider_message_id, meta, created_at
)
select
  coalesce(data->>'id', document_id),
  coalesce(data->'meta'->>'type', data->'meta'->>'template', 'system_notice'),
  coalesce(data->>'to', ''),
  coalesce(data->>'subject', ''),
  coalesce(data->>'status', ''),
  coalesce(data->>'error', ''),
  coalesce(data->'meta'->>'messageId', ''),
  coalesce(data->'meta', '{}'::jsonb),
  coalesce(nullif(data->>'createdAt', '')::timestamptz, imported_at, updated_at, now())
from app_documents
where collection_path = 'system_email_logs'
on conflict (id) do nothing;
