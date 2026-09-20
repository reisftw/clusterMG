create table if not exists documentos_configuracoes (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create table if not exists documentos_cobranca_logs (
  id text primary key,
  empresa_id text,
  empresa_nome text,
  email text,
  mes_referencia text,
  pendencias jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_payload jsonb
);

create table if not exists documentos_notas_fiscais_campos (
  id text primary key,
  nome text not null,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  updated_by_name text,
  legacy_path text unique,
  legacy_document_id text,
  source_payload jsonb
);

create index if not exists documentos_cobranca_logs_empresa_mes_idx
  on documentos_cobranca_logs (empresa_id, mes_referencia);

create index if not exists documentos_cobranca_logs_created_at_idx
  on documentos_cobranca_logs (created_at desc);

create index if not exists documentos_notas_fiscais_campos_ativo_ordem_idx
  on documentos_notas_fiscais_campos (ativo, ordem, nome);

insert into documentos_configuracoes (
  id,
  data,
  legacy_path,
  legacy_document_id,
  created_at,
  updated_at,
  source_payload
)
select
  case
    when collection_path = 'system_google_drive' and document_id = 'oauth_config' then 'google_drive_oauth'
    else document_id
  end as id,
  coalesce(data, '{}'::jsonb) as data,
  path as legacy_path,
  document_id as legacy_document_id,
  coalesce(imported_at, now()) as created_at,
  coalesce(updated_at, imported_at, now()) as updated_at,
  data as source_payload
from app_documents
where collection_path in ('documentos_config', 'system_google_drive')
on conflict (id) do update set
  data = excluded.data,
  legacy_path = excluded.legacy_path,
  legacy_document_id = excluded.legacy_document_id,
  updated_at = excluded.updated_at,
  source_payload = excluded.source_payload;

insert into documentos_cobranca_logs (
  id,
  empresa_id,
  empresa_nome,
  email,
  mes_referencia,
  pendencias,
  payload,
  legacy_path,
  legacy_document_id,
  created_at,
  updated_at,
  source_payload
)
select
  document_id as id,
  data->>'empresaId' as empresa_id,
  data->>'empresaNome' as empresa_nome,
  data->>'email' as email,
  data->>'mesReferencia' as mes_referencia,
  coalesce(data->'pendencias', '[]'::jsonb) as pendencias,
  coalesce(data, '{}'::jsonb) as payload,
  path as legacy_path,
  document_id as legacy_document_id,
  coalesce(
    case
      when data->>'sentAt' ~ '^\d{4}-\d{2}-\d{2}T' then (data->>'sentAt')::timestamptz
      else null
    end,
    imported_at,
    now()
  ) as created_at,
  coalesce(
    updated_at,
    case
      when data->>'sentAt' ~ '^\d{4}-\d{2}-\d{2}T' then (data->>'sentAt')::timestamptz
      else null
    end,
    imported_at,
    now()
  ) as updated_at,
  data as source_payload
from app_documents
where collection_path = 'documentos_cobranca_logs'
on conflict (id) do update set
  empresa_id = excluded.empresa_id,
  empresa_nome = excluded.empresa_nome,
  email = excluded.email,
  mes_referencia = excluded.mes_referencia,
  pendencias = excluded.pendencias,
  payload = excluded.payload,
  legacy_path = excluded.legacy_path,
  legacy_document_id = excluded.legacy_document_id,
  updated_at = excluded.updated_at,
  source_payload = excluded.source_payload;

insert into documentos_notas_fiscais_campos (
  id,
  nome,
  ordem,
  ativo,
  created_at,
  updated_at,
  updated_by,
  updated_by_name,
  legacy_path,
  legacy_document_id,
  source_payload
)
select
  document_id as id,
  coalesce(nullif(data->>'nome', ''), document_id) as nome,
  case
    when nullif(data->>'ordem', '') ~ '^-?\d+$' then (data->>'ordem')::integer
    else 0
  end as ordem,
  case
    when lower(nullif(data->>'ativo', '')) in ('true', 't', '1', 'sim', 'yes') then true
    when lower(nullif(data->>'ativo', '')) in ('false', 'f', '0', 'nao', 'não', 'no') then false
    else true
  end as ativo,
  coalesce(
    case
      when data->>'createdAt' ~ '^\d{4}-\d{2}-\d{2}T' then (data->>'createdAt')::timestamptz
      else null
    end,
    imported_at,
    now()
  ) as created_at,
  coalesce(
    case
      when data->>'updatedAt' ~ '^\d{4}-\d{2}-\d{2}T' then (data->>'updatedAt')::timestamptz
      else null
    end,
    updated_at,
    imported_at,
    now()
  ) as updated_at,
  data->>'updatedBy' as updated_by,
  data->>'updatedByName' as updated_by_name,
  path as legacy_path,
  document_id as legacy_document_id,
  data as source_payload
from app_documents
where collection_path = 'documentos_notas_fiscais_campos'
on conflict (id) do update set
  nome = excluded.nome,
  ordem = excluded.ordem,
  ativo = excluded.ativo,
  updated_at = excluded.updated_at,
  updated_by = excluded.updated_by,
  updated_by_name = excluded.updated_by_name,
  legacy_path = excluded.legacy_path,
  legacy_document_id = excluded.legacy_document_id,
  source_payload = excluded.source_payload;

create or replace function block_migrated_documentos_auxiliares_app_documents()
returns trigger
language plpgsql
as $$
begin
  if new.collection_path in (
    'documentos_config',
    'documentos_cobranca_logs',
    'documentos_notas_fiscais_campos',
    'system_google_drive'
  ) then
    raise exception 'collection_path % migrada para tabelas auxiliares de documentos', new.collection_path;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_migrated_documentos_auxiliares_app_documents on app_documents;
create trigger trg_block_migrated_documentos_auxiliares_app_documents
before insert or update on app_documents
for each row execute function block_migrated_documentos_auxiliares_app_documents();
