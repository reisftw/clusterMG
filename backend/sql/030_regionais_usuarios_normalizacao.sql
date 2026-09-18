create extension if not exists pgcrypto;

create table if not exists regionais (
  id text primary key,
  nome text not null unique,
  uf text,
  ativo boolean not null default true,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  source_payload jsonb
);

create index if not exists regionais_nome_idx
  on regionais (lower(nome));

create index if not exists regionais_ativo_idx
  on regionais (ativo);

create table if not exists regional_cidades (
  id uuid primary key default gen_random_uuid(),
  regional_id text not null references regionais(id) on delete cascade,
  nome text not null,
  tipo text,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  source_payload jsonb,
  unique (regional_id, nome)
);

create index if not exists regional_cidades_regional_id_idx
  on regional_cidades (regional_id);

create index if not exists regional_cidades_nome_idx
  on regional_cidades (lower(nome));

create table if not exists regional_responsaveis (
  id uuid primary key default gen_random_uuid(),
  regional_id text not null references regionais(id) on delete cascade,
  tipo text not null check (
    tipo in ('lider', 'supervisor', 'backoffice', 'delivery', 'field_service')
  ),
  nome text,
  email text,
  telefone text,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  source_payload jsonb
);

create index if not exists regional_responsaveis_regional_id_idx
  on regional_responsaveis (regional_id);

create index if not exists regional_responsaveis_tipo_idx
  on regional_responsaveis (tipo);

create index if not exists regional_responsaveis_email_idx
  on regional_responsaveis (lower(email))
  where email is not null and email <> '';

create unique index if not exists regional_responsaveis_identity_idx
  on regional_responsaveis (
    regional_id,
    tipo,
    lower(coalesce(email, '')),
    lower(coalesce(nome, '')),
    coalesce(legacy_document_id, '')
  );

alter table app_users
  add column if not exists empresa_id text,
  add column if not exists empresa_nome text,
  add column if not exists insumos_base_id text,
  add column if not exists insumos_base_nome text;

create index if not exists app_users_empresa_id_idx
  on app_users (empresa_id)
  where empresa_id is not null and empresa_id <> '';

create index if not exists app_users_insumos_base_id_idx
  on app_users (insumos_base_id)
  where insumos_base_id is not null and insumos_base_id <> '';

drop trigger if exists regionais_touch_updated_at on regionais;
create trigger regionais_touch_updated_at
before update on regionais
for each row execute function touch_updated_at();

drop trigger if exists regional_cidades_touch_updated_at on regional_cidades;
create trigger regional_cidades_touch_updated_at
before update on regional_cidades
for each row execute function touch_updated_at();

drop trigger if exists regional_responsaveis_touch_updated_at on regional_responsaveis;
create trigger regional_responsaveis_touch_updated_at
before update on regional_responsaveis
for each row execute function touch_updated_at();
