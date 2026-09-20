-- Roteiro Finan #28 (Fase 4A — Central de Jobs e Integrações): registro de
-- execução das tarefas automáticas (hoje cada uma só loga no próprio
-- arquivo de log do servidor via journalctl, sem lugar central pra ver
-- última execução, duração, registros processados e erros).
create table if not exists finan_job_execucoes (
	id text primary key,
	job_key text not null,
	status text not null default 'running', -- running | success | failed
	trigger_type text not null default 'scheduled', -- scheduled | manual
	started_at timestamptz not null default now(),
	finished_at timestamptz,
	duration_ms integer,
	records_processed integer,
	error_message text,
	summary jsonb not null default '{}'::jsonb,
	triggered_by_id text,
	triggered_by_name text,
	created_at timestamptz not null default now()
);

create index if not exists finan_job_execucoes_job_key_started_at_idx
	on finan_job_execucoes (job_key, started_at desc);
