-- P0 integrado: checkpoints duraveis, webhook assincrono e indices de leitura.
-- Rollback seguro: parar os workers novos e remover apenas as colunas/tabela/
-- indices adicionados aqui. Nenhuma tabela operacional existente e recriada.

alter table movimentacoes_scan_jobs
	add column if not exists requested_start timestamptz,
	add column if not exists requested_end timestamptz,
	add column if not exists checkpoint_window_start timestamptz,
	add column if not exists checkpoint_window_end timestamptz,
	add column if not exists checkpoint jsonb not null default '{}'::jsonb,
	add column if not exists ignored integer not null default 0,
	add column if not exists rejected integer not null default 0;

alter table movimentacoes_config
	add column if not exists last_success_at timestamptz,
	add column if not exists historical_recovery_2026_at timestamptz;

alter table hubsoft_sync_runs
	add column if not exists checkpoint_stage text,
	add column if not exists checkpoint_page integer,
	add column if not exists checkpoint_batch integer,
	add column if not exists checkpoint_at timestamptz;

create table if not exists evolution_webhook_events (
	id bigserial primary key,
	dedupe_key text not null unique,
	event_name text,
	payload jsonb not null,
	status text not null default 'PENDING'
		check (status in ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED')),
	attempts integer not null default 0,
	next_attempt_at timestamptz not null default now(),
	locked_at timestamptz,
	processed_at timestamptz,
	last_error text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists evolution_webhook_events_pending_idx
	on evolution_webhook_events (next_attempt_at, id)
	where status in ('PENDING', 'PROCESSING');

create index if not exists equipment_recovery_snapshots_technician_page_idx
	on equipment_recovery_snapshots
	(closed_at, technician_name_normalized, technician_id, id);

create index if not exists movimentacoes_estoque_period_status_idx
	on movimentacoes_estoque (emitido_em desc, status_match);

create index if not exists hubsoft_sync_records_profile_active_date_idx
	on hubsoft_sync_records (profile, active, source_date desc);
