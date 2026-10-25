-- Estado global de manutencao, historico operacional e telemetria do PWA.
-- Migracao aditiva e idempotente.

create table if not exists system_maintenance_settings (
  id smallint primary key default 1 check (id = 1),
  active boolean not null default false,
  message text not null default 'Estamos realizando uma manutencao programada. Voltaremos em breve.',
  reason text,
  redirect_enabled boolean not null default false,
  redirect_url text,
  started_at timestamptz,
  scheduled_end_at timestamptz,
  started_by_id text,
  started_by_name text,
  current_history_id uuid,
  updated_at timestamptz not null default now()
);

insert into system_maintenance_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists system_maintenance_history (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  scheduled_end_at timestamptz,
  planned_minutes integer,
  duration_seconds integer,
  message text not null,
  reason text,
  redirect_enabled boolean not null default false,
  redirect_url text,
  started_by_id text,
  started_by_name text,
  ended_by_id text,
  ended_by_name text,
  ended_reason text,
  created_at timestamptz not null default now()
);

create index if not exists system_maintenance_history_started_idx
  on system_maintenance_history (started_at desc);

create table if not exists maintenance_service_worker_events (
  id bigserial primary key,
  event_type text not null,
  version text,
  client_id text,
  path text,
  details jsonb not null default '{}'::jsonb,
  user_agent text,
  occurred_at timestamptz not null default now()
);

create index if not exists maintenance_sw_events_occurred_idx
  on maintenance_service_worker_events (occurred_at desc, event_type);
