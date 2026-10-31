-- Distribuicao controlada do aplicativo Android e presenca agregada por cliente.
-- Migracao aditiva e idempotente.

alter table maintenance_active_sessions
  add column if not exists client_type text not null default 'web',
  add column if not exists app_version text;

create index if not exists maintenance_active_sessions_client_seen_idx
  on maintenance_active_sessions (client_type, last_seen_at desc);

create table if not exists mobile_app_releases (
  id uuid primary key default gen_random_uuid(),
  version_name text not null,
  version_code integer,
  file_name text not null,
  storage_path text not null,
  file_size bigint not null check (file_size > 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  active boolean not null default false,
  notes text,
  uploaded_by_id text,
  uploaded_by_name text,
  uploaded_at timestamptz not null default now(),
  download_count bigint not null default 0,
  last_download_at timestamptz
);

create unique index if not exists mobile_app_releases_active_uidx
  on mobile_app_releases (active) where active;

create index if not exists mobile_app_releases_uploaded_idx
  on mobile_app_releases (uploaded_at desc);

create table if not exists mobile_app_downloads_daily (
  release_id uuid not null references mobile_app_releases(id) on delete cascade,
  download_date date not null,
  downloads bigint not null default 0,
  primary key (release_id, download_date)
);
