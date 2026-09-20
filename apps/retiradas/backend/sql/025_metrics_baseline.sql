create extension if not exists pg_stat_statements;

create table if not exists metrics_requests (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  method text not null,
  route text not null,
  status_code integer not null,
  duration_ms numeric(12,3) not null,
  query_count integer not null default 0,
  query_total_ms numeric(12,3) not null default 0,
  user_id text,
  request_id text
);

create index if not exists idx_metrics_requests_created_route
on metrics_requests (created_at desc, route, method);

create table if not exists metrics_queries (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  method text,
  route text,
  query_fingerprint text not null,
  query_text text not null,
  duration_ms numeric(12,3) not null,
  error text,
  request_id text
);

create index if not exists idx_metrics_queries_created_route
on metrics_queries (created_at desc, route, method);

create index if not exists idx_metrics_queries_fingerprint
on metrics_queries (query_fingerprint, created_at desc);

-- Queries mais custosas no PostgreSQL:
select query, calls, total_exec_time, mean_exec_time, rows
from pg_stat_statements
order by total_exec_time desc
limit 20;

-- Reset antes de uma rodada k6/baseline:
-- select pg_stat_statements_reset();
-- truncate table metrics_queries, metrics_requests restart identity;
