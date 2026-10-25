-- Metricas consolidadas da manutencao, sem persistencia por requisicao.
-- Cada rota ocupa no maximo uma linha por hora.

create table if not exists maintenance_route_metrics_hourly (
  bucket_start timestamptz not null,
  method varchar(16) not null,
  route varchar(500) not null,
  requests bigint not null default 0,
  errors_4xx bigint not null default 0,
  errors_5xx bigint not null default 0,
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
  updated_at timestamptz not null default now(),
  primary key (bucket_start, method, route)
);

create index if not exists maintenance_route_metrics_hourly_bucket_idx
  on maintenance_route_metrics_hourly (bucket_start desc);

comment on table maintenance_route_metrics_hourly is
  'Contadores agregados por rota e hora; nao armazena requisicoes ou SQL individuais.';
