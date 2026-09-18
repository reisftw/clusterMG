-- Roteiro Finan #27 (Fase 4A — Observabilidade): buckets de 1 minuto com
-- total de requisições, contagem de erro 4xx/5xx e latência, agregados em
-- memória pelo middleware de observabilidade (ver src/observabilidade/
-- metricsMiddleware.js) e persistidos aqui a cada flush. Escrita em lote
-- por minuto (não 1 linha por requisição) pra não pesar o Postgres com o
-- tráfego real da API.
create table if not exists finan_observabilidade_metricas (
	bucket_start timestamptz primary key,
	requests_total integer not null default 0,
	requests_4xx integer not null default 0,
	requests_5xx integer not null default 0,
	latency_sum_ms bigint not null default 0,
	latency_max_ms integer not null default 0,
	created_at timestamptz not null default now()
);

create index if not exists finan_observabilidade_metricas_bucket_idx
	on finan_observabilidade_metricas (bucket_start desc);
