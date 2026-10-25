-- Alertas operacionais, Web Push e metricas de adocao da Central de Tentativas.
-- Migracao aditiva e idempotente.

alter table tentativas_settings
  add column if not exists alert_settings jsonb not null default '{
    "enabled": true,
    "assignmentAlerts": true,
    "newOpportunityAlerts": true,
    "hourlyAlerts": true,
    "pushEnabled": true,
    "intervalMinutes": 60,
    "weekdays": [1, 2, 3, 4, 5],
    "startTime": "08:00",
    "endTime": "17:00"
  }'::jsonb;

create table if not exists retiradas_push_subscriptions (
  id text primary key,
  endpoint text not null unique,
  user_id text,
  user_email text,
  user_name text,
  role text,
  topics jsonb not null default '{"mapa":true,"match":true,"metas":true,"comunicados":true,"tentativas":true}'::jsonb,
  p256dh text not null,
  auth text not null,
  user_agent text,
  active boolean not null default true,
  failure_count integer not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table retiradas_push_subscriptions
  add column if not exists topics jsonb not null default '{"mapa":true,"match":true,"metas":true,"comunicados":true,"tentativas":true}'::jsonb;

create index if not exists retiradas_push_subscriptions_user_idx
  on retiradas_push_subscriptions (user_id, lower(coalesce(user_email, '')), active);

create table if not exists retiradas_notification_events (
  id bigserial primary key,
  notification_id text not null,
  user_id text,
  user_email text,
  event_type text not null,
  channel text not null default 'IN_APP',
  dedupe_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  event_at timestamptz not null default now()
);

create index if not exists retiradas_notification_events_notification_idx
  on retiradas_notification_events (notification_id, event_at desc);
create index if not exists retiradas_notification_events_user_idx
  on retiradas_notification_events (user_id, lower(coalesce(user_email, '')), event_at desc);

create table if not exists tentativas_page_visits (
  id bigserial primary key,
  user_id text,
  user_email text,
  user_name text,
  role text,
  session_id text,
  source text not null default 'PWA',
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  visited_at timestamptz not null default now()
);

create index if not exists tentativas_page_visits_user_idx
  on tentativas_page_visits (user_id, lower(coalesce(user_email, '')), visited_at desc);
create index if not exists tentativas_page_visits_date_idx
  on tentativas_page_visits (visited_at desc);
