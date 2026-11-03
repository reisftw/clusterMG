-- Retiradas - Onda 0 de observabilidade.
-- Estruturas agregadas, sem parametros SQL, payloads ou identificadores pessoais.

alter table if exists maintenance_route_metrics_hourly
  add column if not exists response_bytes bigint not null default 0,
  add column if not exists query_duration_max_ms double precision not null default 0,
  add column if not exists pool_wait_count bigint not null default 0,
  add column if not exists pool_wait_total_ms double precision not null default 0,
  add column if not exists pool_wait_max_ms double precision not null default 0,
  add column if not exists pool_timeouts bigint not null default 0,
  add column if not exists long_transactions bigint not null default 0,
  add column if not exists last_error_code varchar(80);

create table if not exists maintenance_operation_metrics_hourly (
  bucket_start timestamptz not null,
  kind varchar(24) not null,
  name varchar(100) not null,
  stage varchar(100) not null,
  calls bigint not null default 0,
  successes bigint not null default 0,
  failures bigint not null default 0,
  timeouts bigint not null default 0,
  fallbacks bigint not null default 0,
  duration_total_ms double precision not null default 0,
  duration_max_ms double precision not null default 0,
  duration_le_50 bigint not null default 0,
  duration_le_100 bigint not null default 0,
  duration_le_250 bigint not null default 0,
  duration_le_500 bigint not null default 0,
  duration_le_1000 bigint not null default 0,
  duration_le_2500 bigint not null default 0,
  duration_le_5000 bigint not null default 0,
  duration_gt_5000 bigint not null default 0,
  query_count bigint not null default 0,
  query_errors bigint not null default 0,
  query_total_ms double precision not null default 0,
  processed bigint not null default 0,
  updated bigint not null default 0,
  ignored bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bucket_start, kind, name, stage)
);

create index if not exists maintenance_operation_metrics_hourly_bucket_idx
  on maintenance_operation_metrics_hourly (bucket_start desc, kind);

-- Mantem a mesma fronteira administrativa das demais metricas (025/026).
alter table maintenance_operation_metrics_hourly enable row level security;
drop policy if exists maintenance_operation_metrics_hourly_policy
  on maintenance_operation_metrics_hourly;
create policy maintenance_operation_metrics_hourly_policy
  on maintenance_operation_metrics_hourly
  for all
  using (app_security.is_admin())
  with check (app_security.is_admin());

comment on table maintenance_operation_metrics_hourly is
  'Metricas horarias agregadas de banco, integracoes e jobs; nao armazena payloads ou identificadores pessoais.';

-- Rollback de aplicacao: desabilitar OBSERVABILITY_ENABLED e voltar o codigo.
-- O schema e aditivo e pode permanecer inerte para manter rollback compativel.
