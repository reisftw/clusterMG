create table if not exists hubsoft_withdrawal_technicians (
	id uuid primary key default gen_random_uuid(),
	hubsoft_technician_id bigint not null unique,
	nome_hubsoft text not null,
	nome_exibicao text,
	base text,
	ativo boolean not null default true,
	observacao text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	created_by text,
	updated_by text,
	source_payload jsonb not null default '{}'::jsonb
);

create index if not exists hubsoft_withdrawal_technicians_ativo_idx
	on hubsoft_withdrawal_technicians (ativo);

create table if not exists hubsoft_sync_runs (
	id uuid primary key default gen_random_uuid(),
	profile text not null,
	status text not null check (
		status in (
			'RUNNING',
			'COMPLETE',
			'INCOMPLETE',
			'FAILED',
			'FAILED_AUTH',
			'SUSPICIOUS',
			'SCHEMA_CHANGED',
			'VALID_EMPTY_RESULT',
			'DIVERGENT'
		)
	),
	started_at timestamptz not null default now(),
	finished_at timestamptz,
	duration_ms integer,
	expected_total integer,
	expected_pages integer,
	received_pages integer,
	received_rows integer,
	unique_rows integer,
	duplicate_rows integer,
	inserted integer not null default 0,
	updated integer not null default 0,
	deactivated integer not null default 0,
	ignored integer not null default 0,
	unclassified integer not null default 0,
	error_code text,
	error_message text,
	request_summary jsonb not null default '{}'::jsonb,
	result_summary jsonb not null default '{}'::jsonb,
	created_by text,
	created_by_name text
);

create index if not exists hubsoft_sync_runs_profile_started_idx
	on hubsoft_sync_runs (profile, started_at desc);

create index if not exists hubsoft_sync_runs_status_idx
	on hubsoft_sync_runs (status);

create table if not exists hubsoft_sync_records (
	id uuid primary key default gen_random_uuid(),
	sync_run_id uuid not null references hubsoft_sync_runs(id) on delete cascade,
	profile text not null,
	entity_type text not null,
	hubsoft_id text not null,
	hubsoft_number text,
	source_status text,
	source_type text,
	source_city text,
	source_city_id text,
	source_date timestamptz,
	production_channel text,
	production_owner_id text,
	production_owner_name text,
	classification_rule text,
	classification_reason text,
	classified_at timestamptz,
	raw_excerpt jsonb not null default '{}'::jsonb,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (profile, entity_type, hubsoft_id)
);

create index if not exists hubsoft_sync_records_run_idx
	on hubsoft_sync_records (sync_run_id);

create index if not exists hubsoft_sync_records_profile_active_idx
	on hubsoft_sync_records (profile, active);

create index if not exists hubsoft_sync_records_classification_idx
	on hubsoft_sync_records (profile, production_channel, classification_reason);

create table if not exists hubsoft_sync_locks (
	profile text primary key,
	sync_run_id uuid,
	locked_at timestamptz not null default now(),
	expires_at timestamptz not null,
	locked_by text
);

create table if not exists hubsoft_unknown_os_types (
	id_tipo_ordem_servico bigint primary key,
	descricao text not null,
	first_seen_at timestamptz not null default now(),
	last_seen_at timestamptz not null default now(),
	status text not null default 'PENDING'
		check (status in ('PENDING', 'APPROVED', 'IGNORED')),
	source_payload jsonb not null default '{}'::jsonb
);

drop trigger if exists hubsoft_withdrawal_technicians_touch_updated_at on hubsoft_withdrawal_technicians;
create trigger hubsoft_withdrawal_technicians_touch_updated_at
before update on hubsoft_withdrawal_technicians
for each row execute function touch_updated_at();

drop trigger if exists hubsoft_sync_records_touch_updated_at on hubsoft_sync_records;
create trigger hubsoft_sync_records_touch_updated_at
before update on hubsoft_sync_records
for each row execute function touch_updated_at();
