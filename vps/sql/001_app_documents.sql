create extension if not exists pgcrypto;

create table if not exists import_runs (
  id uuid primary key default gen_random_uuid(),
  source_file text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  document_count integer not null default 0,
  status text not null default 'running',
  error text
);

create table if not exists app_documents (
  path text primary key,
  collection_path text not null,
  document_id text not null,
  parent_path text,
  data jsonb not null default '{}'::jsonb,
  exported_at timestamptz,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_documents_collection_path_idx
  on app_documents (collection_path);

create index if not exists app_documents_parent_path_idx
  on app_documents (parent_path);

create index if not exists app_documents_data_gin_idx
  on app_documents using gin (data);

create table if not exists static_snapshots (
  domain text primary key,
  data jsonb not null,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_users (
  uid text primary key,
  email text unique not null,
  display_name text,
  role text,
  regional text,
  imported_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_documents_touch_updated_at on app_documents;
create trigger app_documents_touch_updated_at
before update on app_documents
for each row execute function touch_updated_at();

drop trigger if exists static_snapshots_touch_updated_at on static_snapshots;
create trigger static_snapshots_touch_updated_at
before update on static_snapshots
for each row execute function touch_updated_at();

drop trigger if exists app_users_touch_updated_at on app_users;
create trigger app_users_touch_updated_at
before update on app_users
for each row execute function touch_updated_at();
