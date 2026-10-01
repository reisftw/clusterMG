-- Fundação HubSoft Ativações: sync read-only, snapshots e auditoria.
-- Esta migration é additive-only e não cria nenhuma escrita no HubSoft.

create extension if not exists pgcrypto;

alter table operacao_tecnicos
	add column if not exists hubsoft_user_id bigint;

create unique index if not exists idx_operacao_tecnicos_hubsoft_user_id_unique
	on operacao_tecnicos(hubsoft_user_id)
	where hubsoft_user_id is not null;

create table if not exists hubsoft_activation_sync_runs (
	id uuid primary key default gen_random_uuid(),
	started_at timestamptz,
	finished_at timestamptz,
	status text not null default 'pending',
	trigger_type text not null default 'manual',
	date_from date,
	date_to date,
	pages_processed integer not null default 0,
	records_found integer not null default 0,
	records_inserted integer not null default 0,
	records_updated integer not null default 0,
	records_unchanged integer not null default 0,
	errors_count integer not null default 0,
	error_message text,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint hubsoft_activation_sync_runs_status_chk
		check (status in ('pending', 'running', 'success', 'partial', 'failed'))
);

create index if not exists idx_hubsoft_activation_sync_runs_started
	on hubsoft_activation_sync_runs(started_at desc);

create index if not exists idx_hubsoft_activation_sync_runs_status
	on hubsoft_activation_sync_runs(status, started_at desc);

drop trigger if exists hubsoft_activation_sync_runs_touch_updated_at on hubsoft_activation_sync_runs;
create trigger hubsoft_activation_sync_runs_touch_updated_at
before update on hubsoft_activation_sync_runs
for each row execute function touch_updated_at();

create table if not exists hubsoft_activation_os_snapshots (
	id uuid primary key default gen_random_uuid(),
	sync_run_id uuid references hubsoft_activation_sync_runs(id) on delete set null,
	hubsoft_order_id bigint not null,
	order_number text,
	order_type_id integer not null,
	order_type_name text,
	health_monitoring_mode text not null default 'NONE',
	hubsoft_cliente_servico_id bigint,
	hubsoft_technician_id bigint,
	operacao_tecnico_id uuid references operacao_tecnicos(id) on delete set null,
	operacao_empresa_id uuid references operacao_empresas(id) on delete set null,
	technician_match_status text not null default 'not_found',
	technician_match_reason text,
	status text,
	executando boolean,
	closure_reason_id bigint,
	closure_reason_name text,
	created_at_hubsoft timestamptz,
	scheduled_start_at timestamptz,
	scheduled_end_at timestamptz,
	executed_start_at timestamptz,
	executed_end_at timestamptz,
	synced_at timestamptz not null default now(),
	first_seen_at timestamptz not null default now(),
	last_seen_at timestamptz not null default now(),
	version integer not null default 1,
	is_current boolean not null default true,
	source_hash text not null,
	raw_payload_sanitized jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint hubsoft_activation_os_snapshots_health_mode_chk
		check (health_monitoring_mode in ('FULL', 'LIMITED', 'NONE')),
	constraint hubsoft_activation_os_snapshots_match_status_chk
		check (technician_match_status in ('matched', 'matched_by_name', 'ambiguous', 'not_found'))
);

create unique index if not exists idx_hubsoft_activation_os_current_unique
	on hubsoft_activation_os_snapshots(hubsoft_order_id)
	where is_current = true;

create index if not exists idx_hubsoft_activation_os_order_type
	on hubsoft_activation_os_snapshots(order_type_id, status, executed_end_at desc);

create index if not exists idx_hubsoft_activation_os_cliente_servico
	on hubsoft_activation_os_snapshots(hubsoft_cliente_servico_id, is_current);

create index if not exists idx_hubsoft_activation_os_technician
	on hubsoft_activation_os_snapshots(hubsoft_technician_id, is_current);

create index if not exists idx_hubsoft_activation_os_executed_end
	on hubsoft_activation_os_snapshots(executed_end_at desc);

drop trigger if exists hubsoft_activation_os_snapshots_touch_updated_at on hubsoft_activation_os_snapshots;
create trigger hubsoft_activation_os_snapshots_touch_updated_at
before update on hubsoft_activation_os_snapshots
for each row execute function touch_updated_at();

create table if not exists hubsoft_cliente_servico_snapshots (
	id uuid primary key default gen_random_uuid(),
	sync_run_id uuid references hubsoft_activation_sync_runs(id) on delete set null,
	hubsoft_cliente_servico_id bigint not null,
	hubsoft_client_id bigint,
	hubsoft_service_id bigint,
	numero_plano text,
	service_description text,
	service_status text,
	service_status_id bigint,
	brand text not null default 'UNKNOWN',
	brand_source text,
	speed_mbps_derived integer,
	speed_source text,
	synced_at timestamptz not null default now(),
	first_seen_at timestamptz not null default now(),
	last_seen_at timestamptz not null default now(),
	version integer not null default 1,
	is_current boolean not null default true,
	source_hash text not null,
	raw_payload_sanitized jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint hubsoft_cliente_servico_snapshots_brand_chk
		check (brand in ('SEMPRE', 'ONNET', 'UNKNOWN'))
);

create unique index if not exists idx_hubsoft_cliente_servico_current_unique
	on hubsoft_cliente_servico_snapshots(hubsoft_cliente_servico_id)
	where is_current = true;

create index if not exists idx_hubsoft_cliente_servico_service
	on hubsoft_cliente_servico_snapshots(hubsoft_service_id, is_current);

create index if not exists idx_hubsoft_cliente_servico_brand
	on hubsoft_cliente_servico_snapshots(brand, is_current);

drop trigger if exists hubsoft_cliente_servico_snapshots_touch_updated_at on hubsoft_cliente_servico_snapshots;
create trigger hubsoft_cliente_servico_snapshots_touch_updated_at
before update on hubsoft_cliente_servico_snapshots
for each row execute function touch_updated_at();

create table if not exists hubsoft_connection_snapshots (
	id uuid primary key default gen_random_uuid(),
	sync_run_id uuid references hubsoft_activation_sync_runs(id) on delete set null,
	hubsoft_cliente_servico_id bigint not null,
	hubsoft_order_id bigint,
	connected boolean,
	connection_type text,
	pppoe_username text,
	framed_ip_address inet,
	nas_ip_address inet,
	nas_port_id text,
	last_ipv4 inet,
	last_nas_ip inet,
	session_start_at timestamptz,
	session_stop_at timestamptz,
	session_time_seconds bigint,
	upload_bytes bigint,
	download_bytes bigint,
	upload_gigabytes numeric(14, 4),
	download_gigabytes numeric(14, 4),
	status_text text,
	network_equipment_display text,
	captured_at timestamptz not null default now(),
	source_hash text not null,
	raw_payload_sanitized jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now()
);

create index if not exists idx_hubsoft_connection_cliente_captured
	on hubsoft_connection_snapshots(hubsoft_cliente_servico_id, captured_at desc);

create index if not exists idx_hubsoft_connection_order
	on hubsoft_connection_snapshots(hubsoft_order_id, captured_at desc);

create index if not exists idx_hubsoft_connection_connected
	on hubsoft_connection_snapshots(connected, captured_at desc);
