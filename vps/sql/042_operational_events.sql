create table if not exists api_runtime_events (
  id text primary key,
  type text,
  pid integer,
  node_version text,
  uptime_seconds integer,
  details jsonb,
  payload jsonb,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists api_runtime_events_type_idx
  on api_runtime_events (type);

create index if not exists api_runtime_events_created_at_idx
  on api_runtime_events (created_at desc);

create table if not exists api_service_events (
  id text primary key,
  type text,
  service_id text,
  service_name text,
  status text,
  previous_status text,
  reason text,
  response_ms numeric,
  checked_at timestamptz,
  payload jsonb,
  legacy_path text unique,
  legacy_document_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists api_service_events_service_status_idx
  on api_service_events (service_id, status);

create index if not exists api_service_events_created_at_idx
  on api_service_events (created_at desc);

insert into api_runtime_events (
  id, type, pid, node_version, uptime_seconds, details, payload,
  legacy_path, legacy_document_id, created_at, updated_at
)
select
  coalesce(nullif(data->>'id', ''), document_id) as id,
  data->>'type' as type,
  case
    when nullif(data->>'pid', '') ~ '^-?\d+$' then (data->>'pid')::integer
    else null
  end as pid,
  data->>'nodeVersion' as node_version,
  case
    when nullif(data->>'uptimeSeconds', '') ~ '^-?\d+$' then (data->>'uptimeSeconds')::integer
    else null
  end as uptime_seconds,
  coalesce(data->'details', '{}'::jsonb) as details,
  data as payload,
  path as legacy_path,
  document_id as legacy_document_id,
  coalesce(created_at, now()) as created_at,
  coalesce(updated_at, created_at, now()) as updated_at
from app_documents
where collection_path = 'api_runtime_events'
on conflict (id) do update set
  type = excluded.type,
  pid = excluded.pid,
  node_version = excluded.node_version,
  uptime_seconds = excluded.uptime_seconds,
  details = excluded.details,
  payload = excluded.payload,
  legacy_path = excluded.legacy_path,
  legacy_document_id = excluded.legacy_document_id,
  updated_at = excluded.updated_at;

insert into api_service_events (
  id, type, service_id, service_name, status, previous_status, reason,
  response_ms, checked_at, payload, legacy_path, legacy_document_id,
  created_at, updated_at
)
select
  coalesce(nullif(data->>'id', ''), document_id) as id,
  data->>'type' as type,
  data->>'serviceId' as service_id,
  data->>'serviceName' as service_name,
  data->>'status' as status,
  data->>'previousStatus' as previous_status,
  data->>'reason' as reason,
  case
    when nullif(data->>'responseMs', '') ~ '^-?\d+(\.\d+)?$' then (data->>'responseMs')::numeric
    else null
  end as response_ms,
  case
    when data->>'checkedAt' ~ '^\d{4}-\d{2}-\d{2}T' then (data->>'checkedAt')::timestamptz
    else null
  end as checked_at,
  data as payload,
  path as legacy_path,
  document_id as legacy_document_id,
  coalesce(created_at, now()) as created_at,
  coalesce(updated_at, created_at, now()) as updated_at
from app_documents
where collection_path = 'api_service_events'
on conflict (id) do update set
  type = excluded.type,
  service_id = excluded.service_id,
  service_name = excluded.service_name,
  status = excluded.status,
  previous_status = excluded.previous_status,
  reason = excluded.reason,
  response_ms = excluded.response_ms,
  checked_at = excluded.checked_at,
  payload = excluded.payload,
  legacy_path = excluded.legacy_path,
  legacy_document_id = excluded.legacy_document_id,
  updated_at = excluded.updated_at;

create or replace function block_migrated_operational_events_app_documents()
returns trigger as $$
begin
  if new.collection_path in ('api_runtime_events', 'api_service_events') then
    raise exception 'Colecao operacional % migrada para tabelas normalizadas.', new.path;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists block_migrated_operational_events_app_documents on app_documents;
create trigger block_migrated_operational_events_app_documents
before insert or update on app_documents
for each row execute function block_migrated_operational_events_app_documents();
