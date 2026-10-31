-- Dispositivos Android, rastreamento nativo e atualizacao obrigatoria do aplicativo.
-- Migracao aditiva e idempotente.

alter table mobile_app_releases
  add column if not exists minimum_supported_code integer;

update mobile_app_releases
   set minimum_supported_code = version_code
 where minimum_supported_code is null
   and version_code is not null;

create table if not exists mobile_app_enrollment_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  user_id text not null references app_users(uid) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mobile_app_enrollment_codes_pending_idx
  on mobile_app_enrollment_codes (expires_at)
  where consumed_at is null;

create table if not exists mobile_app_devices (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references app_users(uid) on delete cascade,
  installation_id text not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  app_version text,
  device_name text,
  platform_version text,
  active boolean not null default true,
  enrolled_at timestamptz not null default now(),
  token_expires_at timestamptz not null,
  last_seen_at timestamptz,
  last_location_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, installation_id)
);

create index if not exists mobile_app_devices_user_active_idx
  on mobile_app_devices (user_id, active, last_seen_at desc);

create index if not exists mobile_app_devices_tracking_idx
  on mobile_app_devices (last_location_at desc)
  where active;

